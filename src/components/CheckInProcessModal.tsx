import React, { useState } from 'react';
import {
  BadgeCheck,
  BedDouble,
  CheckCircle2,
  CreditCard,
  KeyRound,
  ShieldCheck,
  X,
} from 'lucide-react';
import { completeCheckInWorkflow } from '../services/pmsService';
import {
  formatChannelCurrency,
  formatNgn,
  getReservationPaymentSummary,
  GuestRecord,
  PropertyRecord,
  ReservationRecord,
  RoomRecord,
  sortRoomsByNumber,
} from '../types/pms';

export interface CheckedInConfirmationInfo {
  guestName: string;
  roomNumber: string;
  bookingRef?: string;
  reservationId?: string;
}

interface CheckInProcessModalProps {
  property: PropertyRecord;
  reservation: ReservationRecord;
  room?: RoomRecord;
  rooms?: RoomRecord[];
  guest?: GuestRecord;
  actorRole: string;
  onClose: () => void;
  onCompleted: (info: CheckedInConfirmationInfo) => void;
}

export const CheckInProcessModal: React.FC<CheckInProcessModalProps> = ({
  property,
  reservation,
  room,
  rooms = [],
  guest,
  actorRole,
  onClose,
  onCompleted,
}) => {
  const sortedRooms = sortRoomsByNumber(rooms.length > 0 ? rooms : room ? [room] : []);
  const eligibleRooms = sortedRooms.filter(
    (r) => (Boolean(reservation.roomId) && r.id === reservation.roomId) || r.occupancyStatus === 'vacant'
  );

  const preferredRoom =
    (reservation.roomId ? sortedRooms.find((r) => r.id === reservation.roomId) : undefined) ||
    eligibleRooms.find(
      (r) =>
        reservation.requestedRoomType &&
        r.roomType.toLowerCase().includes(reservation.requestedRoomType.toLowerCase())
    ) ||
    eligibleRooms[0];

  const [assignedRoomId, setAssignedRoomId] = useState<string>(
    reservation.roomId || preferredRoom?.id || ''
  );
  const selectedRoom =
    sortedRooms.find((r) => r.id === assignedRoomId) || room || preferredRoom;

  const paySummary = getReservationPaymentSummary(
    reservation,
    property.usdExchangeRateNgn
  );
  const isRoomChanged = Boolean(selectedRoom) && selectedRoom?.id !== reservation.roomId;
  const effectiveNightlyRate =
    isRoomChanged && selectedRoom ? selectedRoom.nightlyRateNgn : reservation.nightlyRateNgn;
  const effectiveRoomCharges = effectiveNightlyRate * reservation.nights;
  const totalFolio =
    effectiveRoomCharges + reservation.posChargesNgn + (reservation.lateCheckoutFeeNgn || 0);
  const balanceDue = Math.max(0, totalFolio - paySummary.amountPaid);

  const [paymentReceivedNgn, setPaymentReceivedNgn] = useState<number>(balanceDue);
  const [paymentMethod, setPaymentMethod] = useState<ReservationRecord['paymentMethod']>(
    reservation.paymentMethod || 'Bank Transfer'
  );
  const [paymentConfirmed, setPaymentConfirmed] = useState<boolean>(
    (balanceDue === 0 && paySummary.amountPaid > 0) ||
      (paySummary.paymentCollectionMode === 'ota_prepaid' && balanceDue === 0)
  );

  const [idType, setIdType] = useState<GuestRecord['idType']>(
    reservation.idType || guest?.idType || 'NIN'
  );
  const [idNumber, setIdNumber] = useState<string>(
    reservation.idNumber || guest?.idNumber || ''
  );
  const [idVerified, setIdVerified] = useState<boolean>(false);

  const [keyIssuedChoice, setKeyIssuedChoice] = useState<'yes' | 'no' | null>(null);
  const [roomReadyConfirmed, setRoomReadyConfirmed] = useState<boolean>(
    selectedRoom
      ? selectedRoom.housekeepingStatus === 'clean' ||
          selectedRoom.housekeepingStatus === 'inspected'
      : false
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRoomAssignChange = (nextRoomId: string) => {
    setAssignedRoomId(nextRoomId);
    const nextRoom = sortedRooms.find((r) => r.id === nextRoomId);
    if (nextRoom) {
      const nextCharges =
        (nextRoomId !== reservation.roomId
          ? nextRoom.nightlyRateNgn
          : reservation.nightlyRateNgn) *
          reservation.nights +
        reservation.posChargesNgn +
        (reservation.lateCheckoutFeeNgn || 0);
      const nextDue = Math.max(0, nextCharges - paySummary.amountPaid);
      setPaymentReceivedNgn(nextDue);
      setRoomReadyConfirmed(
        nextRoom.housekeepingStatus === 'clean' || nextRoom.housekeepingStatus === 'inspected'
      );
    }
  };

  const canComplete =
    paymentConfirmed &&
    Boolean(assignedRoomId) &&
    idVerified &&
    idNumber.trim().length >= 3 &&
    keyIssuedChoice === 'yes' &&
    roomReadyConfirmed &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!paymentConfirmed) {
      setErrorMsg('Step 1: Confirm payment or verified deposit before check-in.');
      return;
    }
    if (!assignedRoomId) {
      setErrorMsg('Step 2: Assign a room or suite to this guest.');
      return;
    }
    if (!idVerified || idNumber.trim().length < 3) {
      setErrorMsg('Step 3: Enter the guest ID number and confirm identity verification.');
      return;
    }
    if (keyIssuedChoice !== 'yes') {
      setErrorMsg('Step 4: Key Issue must be set to "Yes" before completing check-in.');
      return;
    }
    if (!roomReadyConfirmed) {
      setErrorMsg('Step 4: Confirm suite inspection & readiness.');
      return;
    }

    setSubmitting(true);
    try {
      await completeCheckInWorkflow({
        property,
        reservation,
        room,
        assignedRoom: selectedRoom,
        guest,
        paymentReceivedNgn: Math.max(0, paymentReceivedNgn),
        paymentMethod,
        paymentConfirmed,
        idVerified,
        idType,
        idNumber: idNumber.trim(),
        keyIssued: true,
        roomReadyConfirmed,
        actorRole,
      });
      onCompleted({
        guestName: reservation.guestName,
        roomNumber: selectedRoom?.roomNumber || reservation.roomNumber,
        bookingRef: reservation.bookingRef,
        reservationId: reservation.id,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4 my-8"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono-tabular font-bold text-slate-900">
                {reservation.bookingRef}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular font-semibold text-emerald-700">
                {selectedRoom?.roomNumber ||
                  (reservation.roomId
                    ? reservation.roomNumber
                    : `Unassigned (${reservation.requestedRoomType || 'Select room'})`)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{reservation.channel}</span>
            </div>
            <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
              Mandatory Check-In Process — {reservation.guestName}
            </h3>
            <p className="text-xs text-slate-500 font-mono-tabular">
              {reservation.checkInDate} → {reservation.checkOutDate} ({reservation.nights} nights)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
            aria-label="Close check-in verification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: CONFIRM PAYMENT */}
        <div
          className={`rounded-xl border p-4 space-y-3 text-xs ${
            paymentConfirmed
              ? 'border-emerald-300 bg-emerald-50/40'
              : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <CreditCard className="w-4 h-4 text-emerald-700" />
              <span>Step 1 — Confirm Payment</span>
            </div>
            <div className="flex items-center gap-2">
              {paySummary.paymentCollectionMode === 'ota_prepaid' &&
                balanceDue === 0 &&
                paySummary.otaPaidAmount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    OTA Prepaid via {reservation.channel} — ₦0 due at front desk
                  </span>
                )}
              <span className="font-mono-tabular text-[11px] font-semibold text-slate-700">
                Outstanding Guest Balance: {formatNgn(balanceDue)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white border border-slate-200 rounded-lg p-2.5 text-[11px]">
            <div>
              <p className="text-slate-500">Total Charges</p>
              <p className="font-mono-tabular font-bold text-slate-900">{formatNgn(totalFolio)}</p>
              {paySummary.sourceCurrency !== 'NGN' && paySummary.sourceTotalAmount > 0 && (
                <p className="font-mono-tabular text-[10px] text-blue-700 font-semibold">
                  {formatChannelCurrency(paySummary.sourceTotalAmount, paySummary.sourceCurrency)}{' '}
                  {paySummary.sourceCurrency} @ ₦{paySummary.fxRateToNgn.toLocaleString('en-NG')}
                </p>
              )}
            </div>
            <div>
              <p className="text-slate-500">Paid to OTA ({paySummary.sourceCurrency})</p>
              <p className="font-mono-tabular font-bold text-blue-800">
                {formatChannelCurrency(paySummary.otaPaidSourceAmount, paySummary.sourceCurrency)}{' '}
                {paySummary.sourceCurrency}
              </p>
              {paySummary.expectedPayoutNgn > 0 && (
                <p className="font-mono-tabular text-[10px] text-slate-600">
                  Exp. Payout: {formatNgn(paySummary.expectedPayoutNgn)}
                </p>
              )}
            </div>
            <div>
              <p className="text-slate-500">Hotel payment received</p>
              <p className="font-mono-tabular font-bold text-slate-900">
                {formatNgn(paySummary.hotelPaidAmount)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Outstanding guest balance</p>
              <p
                className={`font-mono-tabular font-bold ${
                  Math.max(0, balanceDue - Math.max(0, paymentReceivedNgn)) > 0
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                }`}
              >
                {formatNgn(balanceDue)}
              </p>
              {paymentReceivedNgn > 0 && (
                <p className="font-mono-tabular text-[10px] text-slate-500">
                  After pay: {formatNgn(Math.max(0, balanceDue - Math.max(0, paymentReceivedNgn)))}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-slate-700">Collect Payment Now (₦)</label>
                {balanceDue > 0 && paymentReceivedNgn !== balanceDue && (
                  <button
                    type="button"
                    onClick={() => setPaymentReceivedNgn(balanceDue)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Fill Full Balance
                  </button>
                )}
              </div>
              <input
                type="number"
                min={0}
                step={500}
                value={paymentReceivedNgn}
                onChange={(e) => setPaymentReceivedNgn(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card POS">Card POS</option>
                <option value="Cash NGN">Cash NGN</option>
                <option value="Corporate Invoice">Corporate Invoice</option>
                <option value="Online Gateway">Online Gateway</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={paymentConfirmed}
              onChange={(e) => setPaymentConfirmed(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>Payment confirmed (transfer alert, POS receipt, cash, or approved corporate credit)</span>
          </label>
        </div>

        {/* STEP 2: ASSIGN ROOM / SUITE */}
        <div
          className={`rounded-xl border p-4 space-y-2.5 text-xs ${
            assignedRoomId ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <BedDouble className="w-4 h-4 text-emerald-700" />
              <span>Step 2 — Assign Room / Suite</span>
            </div>
            {selectedRoom && (
              <span className="capitalize font-semibold text-slate-600">
                HK: {selectedRoom.housekeepingStatus}
              </span>
            )}
          </div>

          <div>
            <select
              value={assignedRoomId}
              onChange={(e) => handleRoomAssignChange(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium"
            >
              {eligibleRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)}/nt) —{' '}
                  {r.id === reservation.roomId
                    ? 'Booked Suite'
                    : `Vacant · HK: ${r.housekeepingStatus}`}
                </option>
              ))}
            </select>
            {isRoomChanged && selectedRoom && (
              <p className="text-[11px] text-amber-700 font-medium mt-1.5">
                Suite reassigned from {reservation.roomNumber} to {selectedRoom.roomNumber} (
                {formatNgn(selectedRoom.nightlyRateNgn)}/night). Folio total adjusted automatically.
              </p>
            )}
          </div>
        </div>

        {/* STEP 3: VERIFY GUEST ID (KYC) */}
        <div
          className={`rounded-xl border p-4 space-y-3 text-xs ${
            idVerified && idNumber.trim().length >= 3
              ? 'border-emerald-300 bg-emerald-50/40'
              : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Step 3 — Verify Guest ID (KYC)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">ID Document Type</label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value as GuestRecord['idType'])}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="NIN">NIN</option>
                <option value="International Passport">International Passport</option>
                <option value="Driver License">Driver License</option>
                <option value="Voter Card">Voter Card</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">ID Number *</label>
              <input
                type="text"
                required
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Enter NIN / Passport / License No."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono-tabular"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={idVerified}
              onChange={(e) => setIdVerified(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>Original government-issued ID inspected &amp; guest identity verified</span>
          </label>
        </div>

        {/* STEP 4: KEY ISSUE (YES / NO) & SUITE READINESS */}
        <div
          className={`rounded-xl border p-4 space-y-3 text-xs ${
            keyIssuedChoice === 'yes' && roomReadyConfirmed
              ? 'border-emerald-300 bg-emerald-50/40'
              : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              <span>Step 4 — Key Issue &amp; Suite Readiness</span>
            </div>
            <span className="font-mono-tabular text-[11px] font-semibold text-slate-700">
              Suite {selectedRoom?.roomNumber || reservation.roomNumber}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3">
            <div>
              <p className="font-semibold text-slate-900">Key Issued to Guest? *</p>
              <p className="text-[11px] text-slate-500">
                Select Yes once physical key card / suite key is handed over
              </p>
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKeyIssuedChoice('yes')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                  keyIssuedChoice === 'yes'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Yes — Key Issued
              </button>
              <button
                type="button"
                onClick={() => setKeyIssuedChoice('no')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                  keyIssuedChoice === 'no'
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                No — Not Issued
              </button>
            </div>
          </div>

          {keyIssuedChoice === 'no' && (
            <p className="text-[11px] font-medium text-rose-700">
              Key must be issued (&quot;Yes&quot;) to finalize front desk check-in.
            </p>
          )}

          <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={roomReadyConfirmed}
              onChange={(e) => setRoomReadyConfirmed(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>Suite power, AC, and amenities inspected ready for guest arrival</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Logged to RBAC Audit Trail</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canComplete}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Checking In...' : 'Complete Check-In'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
