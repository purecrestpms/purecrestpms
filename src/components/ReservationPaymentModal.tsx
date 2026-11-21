import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Globe,
  Printer,
  Save,
  X,
} from 'lucide-react';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { updateReservationPaymentWorkflow } from '../services/pmsService';
import {
  formatChannelCurrency,
  formatNgn,
  formatPaymentCollectionLabel,
  getReservationPaymentSummary,
  isOtaBookingChannel,
  OtaPaymentCollectionMode,
  OtaPayoutStatus,
  PaymentStatusLabel,
  PropertyRecord,
  ReservationRecord,
} from '../types/pms';

interface ReservationPaymentModalProps {
  property: PropertyRecord;
  reservation: ReservationRecord;
  actorRole: string;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ReservationPaymentModal: React.FC<ReservationPaymentModalProps> = ({
  property,
  reservation,
  actorRole,
  onClose,
  onNotify,
}) => {
  const initialSummary = getReservationPaymentSummary(
    reservation,
    property.usdExchangeRateNgn
  );
  const isOtaChannel = isOtaBookingChannel(reservation.channel);

  const [paymentCollectionMode, setPaymentCollectionMode] =
    useState<OtaPaymentCollectionMode>(initialSummary.paymentCollectionMode);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusLabel>(
    initialSummary.paymentStatus
  );
  const [amountDueAtPropertyNgn, setAmountDueAtPropertyNgn] = useState<number>(
    initialSummary.amountDueAtPropertyNgn
  );
  const [hotelPaidNgn, setHotelPaidNgn] = useState<number>(
    initialSummary.hotelPaidAmount
  );
  const [paymentMethod, setPaymentMethod] = useState<
    ReservationRecord['paymentMethod']
  >(reservation.paymentMethod || 'Bank Transfer');

  const [otaPaidNgn, setOtaPaidNgn] = useState<number>(
    initialSummary.otaPaidAmount > 0
      ? initialSummary.otaPaidAmount
      : initialSummary.totalAmount
  );
  const [otaPayoutStatus, setOtaPayoutStatus] = useState<OtaPayoutStatus>(
    initialSummary.otaPayoutStatus === 'received' ? 'received' : 'pending'
  );
  const [expectedPayoutNgn, setExpectedPayoutNgn] = useState<number>(
    initialSummary.expectedPayoutNgn
  );
  const [actualPayoutReceivedNgn, setActualPayoutReceivedNgn] = useState<number>(
    initialSummary.actualPayoutReceivedNgn
  );
  const [postPayoutToLedger, setPostPayoutToLedger] = useState<boolean>(
    initialSummary.otaPayoutStatus !== 'received'
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<{
    reservation: ReservationRecord;
    amountJustPaidNgn: number;
    methodOverride?: string;
  } | null>(null);

  const effectiveCollectionMode: OtaPaymentCollectionMode = isOtaChannel
    ? paymentCollectionMode
    : 'hotel_collect';
  const isCollectedByOta = isOtaChannel && effectiveCollectionMode === 'ota_prepaid';
  const showOtaPayoutSection = isOtaChannel;
  const effectiveActualPayout =
    isCollectedByOta && otaPayoutStatus === 'received'
      ? Math.max(0, Math.round(actualPayoutReceivedNgn))
      : 0;
  const totalReceivedByHotel =
    Math.max(0, Math.round(hotelPaidNgn)) + effectiveActualPayout;

  const handleCollectionModeChange = (nextMode: OtaPaymentCollectionMode) => {
    setPaymentCollectionMode(nextMode);
    if (nextMode === 'ota_prepaid') {
      setPaymentStatus('Paid to OTA');
      const unpaidExtras = Math.max(
        0,
        (reservation.posChargesNgn || 0) +
          (reservation.lateCheckoutFeeNgn || 0) -
          Math.max(0, Math.round(hotelPaidNgn))
      );
      setAmountDueAtPropertyNgn(unpaidExtras);
      if (otaPaidNgn <= 0) {
        setOtaPaidNgn(initialSummary.totalAmount);
      }
      if (expectedPayoutNgn <= 0) {
        setExpectedPayoutNgn(initialSummary.expectedPayoutNgn || reservation.roomChargesNgn);
      }
      if (paymentMethod !== 'OTA Platform Payout') {
        setPaymentMethod('OTA Platform Payout');
      }
    } else {
      const due = Math.max(
        0,
        initialSummary.totalAmount - Math.max(0, Math.round(hotelPaidNgn))
      );
      setAmountDueAtPropertyNgn(due);
      setPaymentStatus(
        hotelPaidNgn <= 0 ? 'Unpaid' : due <= 0 ? 'Paid' : 'Partial'
      );
      if (paymentMethod === 'OTA Platform Payout') {
        setPaymentMethod('Bank Transfer');
      }
    }
  };

  const handleMarkPaidToOtaZeroDue = () => {
    setPaymentCollectionMode('ota_prepaid');
    setPaymentStatus('Paid to OTA');
    setAmountDueAtPropertyNgn(0);
    if (otaPaidNgn <= 0) {
      setOtaPaidNgn(initialSummary.totalAmount);
    }
    if (expectedPayoutNgn <= 0) {
      setExpectedPayoutNgn(initialSummary.expectedPayoutNgn || reservation.roomChargesNgn);
    }
    setPaymentMethod('OTA Platform Payout');
  };

  const handlePayoutStatusToggle = (nextStatus: OtaPayoutStatus) => {
    setOtaPayoutStatus(nextStatus);
    if (nextStatus === 'received') {
      if (actualPayoutReceivedNgn <= 0) {
        setActualPayoutReceivedNgn(Math.max(0, Math.round(expectedPayoutNgn)));
      }
    } else {
      setActualPayoutReceivedNgn(0);
    }
  };

  const handleHotelPaidChange = (value: number) => {
    const clean = Math.max(0, Math.round(value || 0));
    setHotelPaidNgn(clean);
    if (!isCollectedByOta) {
      const nextDue = Math.max(0, initialSummary.totalAmount - clean);
      setAmountDueAtPropertyNgn(nextDue);
      setPaymentStatus(clean <= 0 ? 'Unpaid' : nextDue <= 0 ? 'Paid' : 'Partial');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaving(true);
    const safePaymentStatus: PaymentStatusLabel =
      !isOtaChannel && paymentStatus === 'Paid to OTA' ? 'Paid' : paymentStatus;
    try {
      const effectiveMethod =
        !isOtaChannel && paymentMethod === 'OTA Platform Payout'
          ? 'Bank Transfer'
          : paymentMethod;
      const cleanDue = Math.max(0, Math.round(amountDueAtPropertyNgn));
      const cleanHotelPaid = Math.max(0, Math.round(hotelPaidNgn));
      const cleanOtaPaid = isCollectedByOta ? Math.max(0, Math.round(otaPaidNgn)) : 0;

      await updateReservationPaymentWorkflow({
        property,
        reservation,
        paymentCollectionMode: effectiveCollectionMode,
        paymentStatus: safePaymentStatus,
        amountDueAtPropertyNgn: cleanDue,
        otaPaidNgn: cleanOtaPaid,
        hotelPaidNgn: cleanHotelPaid,
        paymentMethod: effectiveMethod,
        otaPayoutStatus: isCollectedByOta ? otaPayoutStatus : 'pending',
        expectedPayoutNgn: Math.max(0, Math.round(expectedPayoutNgn)),
        actualPayoutReceivedNgn: effectiveActualPayout,
        postPayoutToLedger:
          isCollectedByOta &&
          otaPayoutStatus === 'received' &&
          effectiveActualPayout > 0 &&
          postPayoutToLedger &&
          reservation.otaPayoutStatus !== 'received',
        actorRole,
      });
      onNotify(
        isOtaChannel
          ? `Payment settings updated for ${reservation.bookingRef} (${formatPaymentCollectionLabel(effectiveCollectionMode)} · ${safePaymentStatus}).`
          : `Payment settings updated for ${reservation.bookingRef} (${safePaymentStatus}).`
      );

      const updatedReservationSnapshot: ReservationRecord = {
        ...reservation,
        paymentCollectionMode: effectiveCollectionMode,
        paymentStatus: safePaymentStatus,
        amountDueAtPropertyNgn: cleanDue,
        otaPaidNgn: cleanOtaPaid,
        paidNgn: cleanHotelPaid,
        hotelPaidNgn: cleanHotelPaid,
        paymentMethod: effectiveMethod,
        paymentConfirmed:
          safePaymentStatus === 'Paid' ||
          safePaymentStatus === 'Paid to OTA' ||
          cleanDue <= 0,
        otaPayoutStatus: isCollectedByOta ? otaPayoutStatus : 'pending',
        expectedPayoutNgn: Math.max(0, Math.round(expectedPayoutNgn)),
        actualPayoutReceivedNgn: effectiveActualPayout,
      };
      const deltaPaid = Math.max(0, cleanHotelPaid - initialSummary.hotelPaidAmount);
      setSavedReceipt({
        reservation: updatedReservationSnapshot,
        amountJustPaidNgn: deltaPaid > 0 ? deltaPaid : cleanHotelPaid,
        methodOverride: effectiveMethod,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save payment settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (savedReceipt) {
    return (
      <PaymentReceiptModal
        property={property}
        reservation={savedReceipt.reservation}
        mode="reservation_payment"
        amountJustPaidNgn={savedReceipt.amountJustPaidNgn}
        settlementMethodOverride={savedReceipt.methodOverride}
        onClose={onClose}
        onNotify={onNotify}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono-tabular font-bold text-slate-900">
                {reservation.bookingRef}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-emerald-700">
                {reservation.roomNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-slate-700">
                {reservation.channel}
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
              Manage Reservation Payment — {reservation.guestName}
            </h3>
            <p className="text-xs text-slate-500 font-mono-tabular">
              {reservation.checkInDate} → {reservation.checkOutDate} ({reservation.nights}{' '}
              night{reservation.nights === 1 ? '' : 's'}) · Stay Folio{' '}
              {formatNgn(initialSummary.totalAmount)}
              {initialSummary.sourceCurrency !== 'NGN' &&
                initialSummary.sourceTotalAmount > 0 && (
                  <>
                    {' '}
                    (
                    {formatChannelCurrency(
                      initialSummary.sourceTotalAmount,
                      initialSummary.sourceCurrency
                    )}{' '}
                    {initialSummary.sourceCurrency})
                  </>
                )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            aria-label="Close payment manager"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Section 1: Payment Collection Type (OTA Bookings Only) */}
        {isOtaChannel && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Payment Collection Type
              </label>
              <button
                type="button"
                onClick={handleMarkPaidToOtaZeroDue}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                Mark Paid to OTA &amp; Set Due to ₦0
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleCollectionModeChange('ota_prepaid')}
                className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  paymentCollectionMode === 'ota_prepaid'
                    ? 'border-blue-600 bg-blue-50/60 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    paymentCollectionMode === 'ota_prepaid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    Collected by OTA
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Guest paid {reservation.channel}; track OTA payout separately
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleCollectionModeChange('hotel_collect')}
                className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  paymentCollectionMode === 'hotel_collect'
                    ? 'border-emerald-600 bg-emerald-50/60 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    paymentCollectionMode === 'hotel_collect'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    Collect at Property
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Hotel collects payment directly from guest at front desk
                  </p>
                </div>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Changes saved here are locked as manual property settings and will not be overwritten by future iCal syncs.
            </p>
          </div>
        )}

        {/* Section 2: Guest Payment Status & Property Collection */}
        <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <CreditCard className="w-4 h-4 text-emerald-700" />
            <span>Guest Payment &amp; Property Collection</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Guest Payment Status
              </label>
              <select
                value={!isOtaChannel && paymentStatus === 'Paid to OTA' ? 'Paid' : paymentStatus}
                onChange={(e) => {
                  const next = e.target.value as PaymentStatusLabel;
                  setPaymentStatus(next);
                  if (isOtaChannel && next === 'Paid to OTA') {
                    setPaymentCollectionMode('ota_prepaid');
                    setAmountDueAtPropertyNgn(0);
                  }
                }}
                className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white text-slate-900 font-medium"
              >
                {isOtaChannel && <option value="Paid to OTA">Paid to OTA</option>}
                <option value="Paid">Paid (at Property)</option>
                <option value="Partial">Partial</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Amount Due at Property (₦)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={amountDueAtPropertyNgn}
                onChange={(e) =>
                  setAmountDueAtPropertyNgn(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white font-mono-tabular font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Direct Payment Received at Property (₦)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={hotelPaidNgn}
                onChange={(e) => handleHotelPaidChange(Number(e.target.value))}
                className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white font-mono-tabular font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                value={
                  !isOtaChannel && paymentMethod === 'OTA Platform Payout'
                    ? 'Bank Transfer'
                    : paymentMethod
                }
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as ReservationRecord['paymentMethod']
                  )
                }
                className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white text-slate-900"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card POS">Card POS</option>
                <option value="Cash NGN">Cash NGN</option>
                <option value="Corporate Invoice">Corporate Invoice</option>
                <option value="Online Gateway">Online Gateway</option>
                {isOtaChannel && <option value="OTA Platform Payout">OTA Platform Payout</option>}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Separate OTA Payout Tracking */}
        {showOtaPayoutSection && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                <Globe className="w-4 h-4 text-blue-700" />
                <span>OTA Payout Tracking (Separate from Guest Payment)</span>
              </div>
              {isCollectedByOta && (
                <div className="inline-flex rounded-lg border border-blue-200 bg-white p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handlePayoutStatusToggle('pending')}
                    className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      otaPayoutStatus === 'pending'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePayoutStatusToggle('received')}
                    className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      otaPayoutStatus === 'received'
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Received
                  </button>
                </div>
              )}
            </div>

            {!isCollectedByOta ? (
              <p className="text-xs text-slate-600">
                This booking is set to <strong>Collect at Property</strong>. Switch Payment Collection Type to{' '}
                <strong>Collected by OTA</strong> to track OTA payout remittance.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Guest Paid to OTA (₦)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={otaPaidNgn}
                      onChange={(e) =>
                        setOtaPaidNgn(Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white font-mono-tabular font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Expected OTA Payout (₦)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={expectedPayoutNgn}
                      onChange={(e) =>
                        setExpectedPayoutNgn(
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white font-mono-tabular font-semibold text-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Actual Payout Received (₦)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      disabled={otaPayoutStatus !== 'received'}
                      value={
                        otaPayoutStatus === 'received' ? actualPayoutReceivedNgn : 0
                      }
                      onChange={(e) =>
                        setActualPayoutReceivedNgn(
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      className={`w-full h-9 border border-slate-200 rounded-lg px-3 font-mono-tabular font-semibold ${
                        otaPayoutStatus === 'received'
                          ? 'bg-white text-emerald-800'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    />
                  </div>
                </div>

                {otaPayoutStatus === 'received' &&
                  reservation.otaPayoutStatus !== 'received' && (
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={postPayoutToLedger}
                        onChange={(e) => setPostPayoutToLedger(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>
                        Record actual received OTA payout ({formatNgn(effectiveActualPayout)}) as
                        revenue in Accounting Ledger
                      </span>
                    </label>
                  )}

                {otaPayoutStatus === 'pending' && (
                  <p className="text-[11px] text-amber-800">
                    OTA booking amounts are NOT counted as money received by the hotel until OTA Payout is marked Received.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Section 4: Live Financial Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div>
            <p className="text-[11px] text-slate-500">Collection Type</p>
            <p className="font-bold text-slate-900 mt-0.5">
              {formatPaymentCollectionLabel(paymentCollectionMode)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Due at Property</p>
            <p
              className={`font-mono-tabular font-bold mt-0.5 ${
                amountDueAtPropertyNgn > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {formatNgn(amountDueAtPropertyNgn)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">OTA Payout</p>
            <p
              className={`font-semibold mt-0.5 ${
                !isCollectedByOta
                  ? 'text-slate-400'
                  : otaPayoutStatus === 'received'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
              }`}
            >
              {!isCollectedByOta
                ? 'N/A'
                : otaPayoutStatus === 'received'
                  ? `Received (${formatNgn(effectiveActualPayout)})`
                  : `Pending (${formatNgn(expectedPayoutNgn)})`}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Money Received by Hotel</p>
            <p className="font-mono-tabular font-bold text-emerald-800 mt-0.5">
              {formatNgn(totalReceivedByHotel)}
            </p>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() =>
              setSavedReceipt({
                reservation,
                amountJustPaidNgn: initialSummary.hotelPaidAmount,
                methodOverride: reservation.paymentMethod,
              })
            }
            className="h-9 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Receipt</span>
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving Payment…' : 'Save & Print Receipt'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
