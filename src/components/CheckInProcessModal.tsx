import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  BedDouble,
  CheckCircle2,
  CreditCard,
  KeyRound,
  MapPin,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { completeCheckInWorkflow } from '../services/pmsService';
import {
  BlockedDateRecord,
  formatChannelCurrency,
  formatNgn,
  getCheckInDateRestriction,
  getReservationPaymentSummary,
  GuestRecord,
  PropertyRecord,
  ReservationRecord,
  RoomRecord,
  sortRoomsByNumber,
} from '../types/pms';
import { checkRoomDateRangeAvailability, getLocalIsoDate } from '../utils/availability';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { FeedbackBanner } from './FeedbackBanner';

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
  reservations?: ReservationRecord[];
  blockedDates?: BlockedDateRecord[];
  guest?: GuestRecord;
  actorRole: string;
  canCompleteCheckIn?: boolean;
  onClose: () => void;
  onCompleted: (info: CheckedInConfirmationInfo) => void;
}

export const CheckInProcessModal: React.FC<CheckInProcessModalProps> = ({
  property,
  reservation,
  room,
  rooms = [],
  reservations = [],
  blockedDates = [],
  guest,
  actorRole,
  canCompleteCheckIn = true,
  onClose,
  onCompleted,
}) => {
  const sortedRooms = useMemo(
    () => sortRoomsByNumber(rooms.length > 0 ? rooms : room ? [room] : []),
    [rooms, room]
  );

  const hasPreAssignedRoom = Boolean(
    reservation.roomId &&
      reservation.roomNumber &&
      reservation.roomNumber.trim().toLowerCase() !== 'unassigned'
  );

  const preAssignedRoom = useMemo(
    () =>
      hasPreAssignedRoom
        ? sortedRooms.find((r) => r.id === reservation.roomId) || room
        : undefined,
    [hasPreAssignedRoom, sortedRooms, reservation.roomId, room]
  );

  const availableRoomsForStay = useMemo(() => {
    return sortedRooms.filter((r) => {
      if (reservation.roomId && r.id === reservation.roomId) return true;
      if (r.occupancyStatus === 'out_of_order' || r.occupancyStatus === 'occupied') return false;
      if (reservations.length > 0 || blockedDates.length > 0) {
        const avail = checkRoomDateRangeAvailability({
          room: r,
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
          reservations,
          blockedDates,
          excludeReservationId: reservation.id,
        });
        return avail.available;
      }
      return r.occupancyStatus === 'vacant';
    });
  }, [sortedRooms, reservation, reservations, blockedDates]);

  const matchingTypeRooms = useMemo(() => {
    const reqType = (reservation.requestedRoomType || '').trim().toLowerCase();
    if (!reqType) return availableRoomsForStay;
    return availableRoomsForStay.filter(
      (r) =>
        r.roomType.trim().toLowerCase() === reqType ||
        r.roomType.trim().toLowerCase().includes(reqType) ||
        reqType.includes(r.roomType.trim().toLowerCase())
    );
  }, [availableRoomsForStay, reservation.requestedRoomType]);

  const [showAllAvailableRooms, setShowAllAvailableRooms] = useState(
    !hasPreAssignedRoom && matchingTypeRooms.length === 0
  );
  const [allowReassignPreAssigned, setAllowReassignPreAssigned] = useState(false);

  const selectableRooms = useMemo(() => {
    const baseList =
      showAllAvailableRooms || matchingTypeRooms.length === 0
        ? availableRoomsForStay
        : matchingTypeRooms;
    if (preAssignedRoom && !baseList.some((r) => r.id === preAssignedRoom.id)) {
      return [preAssignedRoom, ...baseList];
    }
    return baseList;
  }, [showAllAvailableRooms, matchingTypeRooms, availableRoomsForStay, preAssignedRoom]);

  const defaultSelectedRoomId =
    (preAssignedRoom ? preAssignedRoom.id : '') ||
    matchingTypeRooms[0]?.id ||
    availableRoomsForStay[0]?.id ||
    '';

  const [assignedRoomId, setAssignedRoomId] = useState<string>(defaultSelectedRoomId);
  const selectedRoom =
    sortedRooms.find((r) => r.id === assignedRoomId) || preAssignedRoom || room;

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
  const balanceDue =
    paySummary.paymentCollectionMode === 'ota_prepaid'
      ? paySummary.amountDueAtPropertyNgn
      : Math.max(0, totalFolio - paySummary.hotelPaidAmount);

  const [paymentReceivedNgn, setPaymentReceivedNgn] = useState<number>(balanceDue);
  const [paymentMethod, setPaymentMethod] = useState<ReservationRecord['paymentMethod']>(
    reservation.paymentMethod || 'Bank Transfer'
  );
  const [paymentConfirmed, setPaymentConfirmed] = useState<boolean>(
    (balanceDue === 0 && paySummary.hotelPaidAmount > 0) ||
      (paySummary.paymentCollectionMode === 'ota_prepaid' && balanceDue === 0)
  );

  const [guestAddress, setGuestAddress] = useState<string>(
    reservation.guestAddress || guest?.address || ''
  );
  const [idType, setIdType] = useState<GuestRecord['idType']>(
    reservation.idType || guest?.idType || 'NIN'
  );
  const [idNumber, setIdNumber] = useState<string>(
    reservation.idNumber || guest?.idNumber || ''
  );
  const [idExpiryDate, setIdExpiryDate] = useState<string>(
    reservation.idExpiryDate || guest?.idExpiryDate || ''
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
      const nextDue =
        paySummary.paymentCollectionMode === 'ota_prepaid'
          ? paySummary.amountDueAtPropertyNgn
          : Math.max(0, nextCharges - paySummary.hotelPaidAmount);
      setPaymentReceivedNgn(nextDue);
      setRoomReadyConfirmed(
        nextRoom.housekeepingStatus === 'clean' || nextRoom.housekeepingStatus === 'inspected'
      );
    }
  };

  const todayIso = getLocalIsoDate();
  const checkInDateBlock = getCheckInDateRestriction(reservation, todayIso);

  const canComplete =
    canCompleteCheckIn &&
    !checkInDateBlock.restricted &&
    Boolean(assignedRoomId) &&
    idVerified &&
    idNumber.trim().length >= 3 &&
    paymentConfirmed &&
    keyIssuedChoice === 'yes' &&
    roomReadyConfirmed &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!canCompleteCheckIn) {
      setErrorMsg('Only authorized Front Desk or Property Admin staff can complete check-in.');
      return;
    }
    if (checkInDateBlock.restricted) {
      setErrorMsg(checkInDateBlock.message);
      return;
    }
    if (!assignedRoomId) {
      setErrorMsg('Step 1: Please assign an available room matching the reservation before check-in.');
      return;
    }
    if (!idVerified || idNumber.trim().length < 3) {
      setErrorMsg('Step 2: Enter the guest ID number and confirm guest & ID verification.');
      return;
    }
    if (!paymentConfirmed) {
      setErrorMsg('Step 3: Confirm payment status or collect balance before completing check-in.');
      return;
    }
    if (keyIssuedChoice !== 'yes') {
      setErrorMsg('Step 4: Key Issue must be set to "Yes" before completing check-in.');
      return;
    }
    if (!roomReadyConfirmed) {
      setErrorMsg('Step 4: Confirm suite readiness before completing check-in.');
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
        idExpiryDate: idExpiryDate.trim(),
        guestAddress: guestAddress.trim(),
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
      setErrorMsg(
        getUserFriendlyErrorMessage(
          err,
          'Unable to complete check-in. Please verify details and try again.',
          'FrontDesk:CheckIn'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden shadow-xl my-8"
      >
        {/* Dark Blue Modal Header */}
        <div className="bg-[#0a367a] text-white px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-blue-100">
              <span className="font-mono-tabular font-bold text-white">
                {reservation.bookingRef}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold">
                {selectedRoom?.roomNumber ||
                  (hasPreAssignedRoom
                    ? reservation.roomNumber
                    : `Room Pending (${reservation.requestedRoomType || 'Select Room'})`)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{reservation.channel}</span>
              {reservation.ratePlan && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{reservation.ratePlan}</span>
                </>
              )}
            </div>
            <h3 className="font-display text-lg font-bold text-white mt-0.5">
              Guest Check-In Verification — {reservation.guestName}
            </h3>
            <p className="text-xs text-blue-100 font-mono-tabular mt-0.5">
              Arrival {reservation.checkInDate} → Departure {reservation.checkOutDate} ({reservation.nights}{' '}
              {reservation.nights === 1 ? 'night' : 'nights'} · {reservation.adults} guest
              {reservation.adults === 1 ? '' : 's'})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-blue-100 hover:text-white cursor-pointer p-1"
            aria-label="Close check-in verification"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {checkInDateBlock.restricted && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">
                  {checkInDateBlock.isOta
                    ? 'OTA Early Check-In Restricted'
                    : 'Arrival-Date Check-In Policy'}
                </p>
                <p>{checkInDateBlock.message}</p>
              </div>
            </div>
          )}

          {!canCompleteCheckIn && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
              Your current role does not have check-in authorization. Please contact Front Desk or a Property Admin.
            </div>
          )}

          <FeedbackBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />

          {/* STEP 1: ROOM ASSIGNMENT CHECK */}
          <div
            className={`rounded-xl border p-4 space-y-3 text-xs ${
              assignedRoomId
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-amber-300 bg-amber-50/50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <BedDouble className="w-4 h-4 text-[#0a367a]" />
                <span>
                  Step 1 — Room Assignment{' '}
                  {hasPreAssignedRoom ? '(Already Assigned)' : '(Select Available Room)'}
                </span>
              </div>
              {selectedRoom && (
                <span className="capitalize font-semibold text-slate-600">
                  Housekeeping: {selectedRoom.housekeepingStatus}
                </span>
              )}
            </div>

            {hasPreAssignedRoom && preAssignedRoom && !allowReassignPreAssigned ? (
              <div className="bg-white border border-emerald-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular font-bold text-sm text-[#0a367a]">
                      {preAssignedRoom.roomNumber}
                    </span>
                    <span className="font-semibold text-slate-900">{preAssignedRoom.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {preAssignedRoom.roomType}
                    {preAssignedRoom.section ? ` · ${preAssignedRoom.section}` : ''} · Floor{' '}
                    {preAssignedRoom.floor} · Max {preAssignedRoom.maxGuests} guests ·{' '}
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(preAssignedRoom.nightlyRateNgn)}/night
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowReassignPreAssigned(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Change Room
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {!hasPreAssignedRoom && (
                  <p className="text-[11px] text-slate-700">
                    No physical room is assigned yet for reserved type{' '}
                    <strong className="text-slate-900">
                      {reservation.requestedRoomType || 'Standard'}
                    </strong>
                    . Select an available room below:
                  </p>
                )}

                {selectableRooms.length === 0 ? (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                    No available rooms found for {reservation.checkInDate} →{' '}
                    {reservation.checkOutDate}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectableRooms.map((r) => {
                      const active = r.id === assignedRoomId;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleRoomAssignChange(r.id)}
                          className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'border-[#0a367a] bg-[#0a367a]/5 ring-1 ring-[#0a367a]'
                              : 'border-slate-200 bg-white hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono-tabular font-bold text-slate-900">
                              {r.roomNumber}
                            </span>
                            <span className="font-mono-tabular font-semibold text-[#0a367a]">
                              {formatNgn(r.nightlyRateNgn)}/nt
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate mt-0.5">
                            {r.roomType} · Floor {r.floor} · HK: {r.housekeepingStatus}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {matchingTypeRooms.length < availableRoomsForStay.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllAvailableRooms((prev) => !prev)}
                    className="text-[11px] font-semibold text-[#0a367a] hover:underline cursor-pointer"
                  >
                    {showAllAvailableRooms
                      ? `Show only ${reservation.requestedRoomType || 'matching'} rooms (${matchingTypeRooms.length})`
                      : `Show all available room types (${availableRoomsForStay.length})`}
                  </button>
                )}

                {isRoomChanged && selectedRoom && hasPreAssignedRoom && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    Room reassigned from {reservation.roomNumber} to {selectedRoom.roomNumber} (
                    {formatNgn(selectedRoom.nightlyRateNgn)}/night). Folio adjusted automatically.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* STEP 2: VERIFY GUEST & RESERVATION INFORMATION */}
          <div
            className={`rounded-xl border p-4 space-y-3 text-xs ${
              idVerified && idNumber.trim().length >= 3
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <UserCheck className="w-4 h-4 text-[#0a367a]" />
              <span>Step 2 — Verify Guest &amp; Reservation Information (KYC)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white border border-slate-200 rounded-lg p-3 text-[11px]">
              <div>
                <p className="text-slate-500">Guest Full Name</p>
                <p className="font-semibold text-slate-900">{reservation.guestName}</p>
              </div>
              <div>
                <p className="text-slate-500">Phone &amp; Email</p>
                <p className="font-medium text-slate-800">{reservation.guestPhone || '—'}</p>
                {reservation.guestEmail && (
                  <p className="text-slate-500 truncate">{reservation.guestEmail}</p>
                )}
              </div>
              <div>
                <p className="text-slate-500">Booking Source &amp; Rate Plan</p>
                <p className="font-semibold text-slate-800">
                  {reservation.channel}
                  {reservation.ratePlan ? ` · ${reservation.ratePlan}` : ''}
                </p>
              </div>
              {reservation.specialRequests && (
                <div className="sm:col-span-3 pt-1.5 border-t border-slate-100">
                  <p className="text-slate-500">Special Requests</p>
                  <p className="text-slate-800 font-medium">{reservation.specialRequests}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Residential Address
                </span>
              </label>
              <input
                type="text"
                value={guestAddress}
                onChange={(e) => setGuestAddress(e.target.value)}
                placeholder="Street address, city, state"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">ID Type *</label>
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
              <div>
                <label className="block font-medium text-slate-700 mb-1">ID Expiry Date</label>
                <input
                  type="date"
                  value={idExpiryDate}
                  onChange={(e) => setIdExpiryDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono-tabular"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={idVerified}
                onChange={(e) => setIdVerified(e.target.checked)}
                className="rounded border-slate-300 text-[#0a367a]"
              />
              <ShieldCheck className="w-4 h-4 text-[#0a367a] shrink-0" />
              <span>Original government-issued ID inspected &amp; guest/reservation details verified</span>
            </label>
          </div>

          {/* STEP 3: PAYMENT STATUS & OUTSTANDING BALANCE */}
          <div
            className={`rounded-xl border p-4 space-y-3 text-xs ${
              paymentConfirmed
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <CreditCard className="w-4 h-4 text-[#0a367a]" />
                <span>Step 3 — Payment Status &amp; Outstanding Balance</span>
              </div>
              <span
                className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                  balanceDue === 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {paySummary.paymentStatus} · Due: {formatNgn(balanceDue)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white border border-slate-200 rounded-lg p-2.5 text-[11px]">
              <div>
                <p className="text-slate-500">Total Stay Charges</p>
                <p className="font-mono-tabular font-bold text-slate-900">{formatNgn(totalFolio)}</p>
                {paySummary.sourceCurrency !== 'NGN' && paySummary.sourceTotalAmount > 0 && (
                  <p className="font-mono-tabular text-[10px] text-blue-700 font-semibold">
                    {formatChannelCurrency(paySummary.sourceTotalAmount, paySummary.sourceCurrency)}{' '}
                    {paySummary.sourceCurrency}
                  </p>
                )}
              </div>
              <div>
                <p className="text-slate-500">Payment Status</p>
                <p className="font-bold text-slate-900">{paySummary.paymentStatus}</p>
                {paySummary.paymentCollectionMode === 'ota_prepaid' && (
                  <p className="text-[10px] text-emerald-700 font-medium">Collected by OTA</p>
                )}
              </div>
              <div>
                <p className="text-slate-500">Received by Hotel</p>
                <p className="font-mono-tabular font-bold text-slate-900">
                  {formatNgn(paySummary.totalReceivedByHotelNgn)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Outstanding Balance</p>
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
                    After pay:{' '}
                    {formatNgn(Math.max(0, balanceDue - Math.max(0, paymentReceivedNgn)))}
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
                      className="text-[11px] font-semibold text-[#0a367a] hover:underline cursor-pointer"
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
                className="rounded border-slate-300 text-[#0a367a]"
              />
              <span>
                Payment status reviewed &amp; confirmed (paid, OTA prepaid, or approved balance settlement)
              </span>
            </label>
          </div>

          {/* STEP 4: KEY ISSUE & ROOM READINESS */}
          <div
            className={`rounded-xl border p-4 space-y-3 text-xs ${
              keyIssuedChoice === 'yes' && roomReadyConfirmed
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <KeyRound className="w-4 h-4 text-[#0a367a]" />
                <span>Step 4 — Key Issue &amp; Room Readiness</span>
              </div>
              <span className="font-mono-tabular text-[11px] font-semibold text-slate-700">
                Room {selectedRoom?.roomNumber || reservation.roomNumber}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3">
              <div>
                <p className="font-semibold text-slate-900">Key Issued to Guest? *</p>
                <p className="text-[11px] text-slate-500">
                  Select Yes once physical key card / room key is handed over
                </p>
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKeyIssuedChoice('yes')}
                  className={`px-3.5 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                    keyIssuedChoice === 'yes'
                      ? 'bg-[#0a367a] border-[#0a367a] text-white'
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
                Key must be issued (&quot;Yes&quot;) to finalize check-in.
              </p>
            )}

            <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={roomReadyConfirmed}
                onChange={(e) => setRoomReadyConfirmed(e.target.checked)}
                className="rounded border-slate-300 text-[#0a367a]"
              />
              <span>Room power, AC, and amenities inspected ready for guest arrival</span>
            </label>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <BadgeCheck className="w-3.5 h-3.5 text-[#0a367a]" />
            <span>Updates Reservation → Checked-In &amp; Room → Occupied</span>
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
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#0a367a] hover:bg-[#07275a] disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Completing Check-In...' : 'Complete Check-In'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
