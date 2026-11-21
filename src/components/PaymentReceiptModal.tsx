import React, { useMemo } from 'react';
import { jsPDF } from 'jspdf';
import {
  CheckCircle2,
  Download,
  Printer,
  Receipt,
  X,
} from 'lucide-react';
import {
  formatBookingSourceLabel,
  formatChannelCurrency,
  formatNgn,
  getReservationPaymentSummary,
  isOtaBookingChannel,
  PropertyRecord,
  ReservationRecord,
} from '../types/pms';

export type ReceiptContextMode = 'reservation_payment' | 'check_in' | 'check_out';
export type PaymentReceiptMode = ReceiptContextMode;

interface PaymentReceiptModalProps {
  property: PropertyRecord;
  reservation: ReservationRecord;
  mode: ReceiptContextMode;
  amountJustPaidNgn?: number;
  settlementMethodOverride?: string;
  onClose: () => void;
  onOpenFolio?: (reservationId: string) => void;
  onNotify?: (msg: string) => void;
}

function getReceiptTitle(mode: ReceiptContextMode): {
  heading: string;
  badge: string;
  docLabel: string;
} {
  if (mode === 'check_out') {
    return {
      heading: 'Check-Out Complete & Final Receipt',
      badge: 'Final Settlement Receipt',
      docLabel: 'OFFICIAL CHECK-OUT RECEIPT',
    };
  }
  if (mode === 'check_in') {
    return {
      heading: 'Check-In Payment Receipt',
      badge: 'Check-In Confirmation',
      docLabel: 'OFFICIAL CHECK-IN & PAYMENT RECEIPT',
    };
  }
  return {
    heading: 'Reservation Payment Receipt',
    badge: 'Payment Recorded',
    docLabel: 'OFFICIAL RESERVATION PAYMENT RECEIPT',
  };
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  property,
  reservation,
  mode,
  amountJustPaidNgn,
  settlementMethodOverride,
  onClose,
  onOpenFolio,
}) => {
  const summary = useMemo(
    () => getReservationPaymentSummary(reservation, property.usdExchangeRateNgn),
    [reservation, property.usdExchangeRateNgn]
  );

  const isOta = isOtaBookingChannel(reservation.channel);
  const lateFeeNgn = Math.max(0, reservation.lateCheckoutFeeNgn || 0);
  const posChargesNgn = Math.max(0, reservation.posChargesNgn || 0);
  const roomChargesNgn = Math.max(0, reservation.roomChargesNgn || 0);
  const grossBillNgn = roomChargesNgn + posChargesNgn + lateFeeNgn;
  const effectiveHotelPaidNgn =
    mode === 'check_out'
      ? Math.max(
          summary.hotelPaidAmount,
          summary.hotelPaidAmount + Math.max(0, amountJustPaidNgn || 0)
        )
      : summary.hotelPaidAmount;
  const remainingBalanceNgn =
    mode === 'check_out'
      ? Math.max(0, summary.balance - Math.max(0, amountJustPaidNgn || 0))
      : summary.balance;
  const paymentMethodLabel =
    settlementMethodOverride || reservation.paymentMethod || 'Bank Transfer';

  const issuedAt = useMemo(() => new Date(), []);
  const receiptNo = useMemo(() => {
    const cleanRef = (reservation.bookingRef || reservation.id)
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(-8);
    const prefix = mode === 'check_out' ? 'CHKOUT' : mode === 'check_in' ? 'CHKIN' : 'RCP';
    return `${prefix}-${cleanRef}`;
  }, [reservation.bookingRef, reservation.id, mode]);

  const copy = getReceiptTitle(mode);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const docPdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = docPdf.internal.pageSize.getWidth();
    let y = 48;

    docPdf.setFillColor(11, 93, 52);
    docPdf.rect(0, 0, pageW, 84, 'F');
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(17);
    docPdf.text(property.name || 'PCH PMS Property', 40, 38);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9.5);
    const addrLine = [property.address, property.city, property.state, property.country]
      .filter(Boolean)
      .join(', ');
    if (addrLine) docPdf.text(addrLine.slice(0, 95), 40, 56);
    const contactLine = [property.phone, property.email].filter(Boolean).join(' · ');
    if (contactLine) docPdf.text(contactLine, 40, 70);

    y = 112;
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(13);
    docPdf.text(copy.docLabel, 40, y);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text(`Receipt #: ${receiptNo}`, pageW - 40, y - 4, { align: 'right' });
    docPdf.text(`Issued: ${issuedAt.toLocaleString('en-NG')}`, pageW - 40, y + 10, {
      align: 'right',
    });

    y += 28;
    docPdf.setDrawColor(226, 232, 240);
    docPdf.line(40, y, pageW - 40, y);
    y += 20;

    const metaRows: Array<[string, string]> = [
      ['Guest Name', reservation.guestName],
      ['Booking Reference', reservation.bookingRef],
      [
        'Room',
        `${reservation.roomNumber || 'Unassigned'}${
          reservation.requestedRoomType ? ` · ${reservation.requestedRoomType}` : ''
        }`,
      ],
      [
        'Stay Dates',
        `${reservation.checkInDate} to ${reservation.checkOutDate} (${reservation.nights} night${
          reservation.nights === 1 ? '' : 's'
        })`,
      ],
      ['Booking Source', formatBookingSourceLabel(reservation.channel)],
      ['Payment Method', paymentMethodLabel],
    ];

    docPdf.setFontSize(10);
    metaRows.forEach(([label, value]) => {
      docPdf.setFont('helvetica', 'bold');
      docPdf.setTextColor(71, 85, 105);
      docPdf.text(`${label}:`, 40, y);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setTextColor(15, 23, 42);
      docPdf.text(String(value || '—'), 175, y);
      y += 18;
    });

    y += 10;
    docPdf.setFillColor(248, 250, 252);
    docPdf.rect(40, y, pageW - 80, 24, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(51, 65, 85);
    docPdf.text('CHARGE DESCRIPTION', 52, y + 16);
    docPdf.text('AMOUNT (NGN)', pageW - 52, y + 16, { align: 'right' });
    y += 38;

    const lineItems: Array<[string, string]> = [
      [
        `Room Accommodation (${reservation.nights} night${reservation.nights === 1 ? '' : 's'} × ${formatNgn(
          reservation.nightlyRateNgn
        )})`,
        formatNgn(roomChargesNgn),
      ],
    ];
    if (posChargesNgn > 0) {
      lineItems.push(['Restaurant / Bar POS Charges', formatNgn(posChargesNgn)]);
    }
    if (lateFeeNgn > 0) {
      lineItems.push([
        `Late Check-Out Fee (${reservation.checkOutTime || '14:00'})`,
        formatNgn(lateFeeNgn),
      ]);
    }

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    lineItems.forEach(([desc, amt]) => {
      docPdf.setTextColor(15, 23, 42);
      docPdf.text(desc, 52, y);
      docPdf.text(amt, pageW - 52, y, { align: 'right' });
      y += 20;
    });

    y += 6;
    docPdf.line(40, y, pageW - 40, y);
    y += 20;

    const totals: Array<[string, string, boolean]> = [
      ['Total Bill', formatNgn(grossBillNgn), true],
    ];
    if (isOta && summary.paymentCollectionMode === 'ota_prepaid') {
      totals.push([
        `Paid to OTA (${summary.sourceCurrency})`,
        summary.sourceCurrency !== 'NGN' && summary.otaPaidSourceAmount > 0
          ? `${formatChannelCurrency(summary.otaPaidSourceAmount, summary.sourceCurrency)} ${summary.sourceCurrency}`
          : formatNgn(summary.otaPaidAmount || summary.expectedPayoutNgn),
        false,
      ]);
    }
    if (typeof amountJustPaidNgn === 'number' && amountJustPaidNgn > 0) {
      totals.push(['Payment Received Now', formatNgn(amountJustPaidNgn), false]);
    }
    totals.push(['Total Direct Payment Received by Property', formatNgn(effectiveHotelPaidNgn), false]);
    if (summary.cautionDepositEnabled && summary.cautionDepositCollectedNgn > 0) {
      totals.push([
        `Caution Deposit (${summary.cautionDepositRefunded ? 'Refunded' : 'Held'})`,
        formatNgn(summary.cautionDepositCollectedNgn),
        false,
      ]);
    }
    totals.push([
      'Remaining Balance Due at Property',
      remainingBalanceNgn <= 0 ? 'NGN 0 (SETTLED)' : formatNgn(remainingBalanceNgn),
      true,
    ]);

    totals.forEach(([lbl, val, bold]) => {
      docPdf.setFont('helvetica', bold ? 'bold' : 'normal');
      docPdf.setFontSize(bold ? 11 : 10);
      docPdf.setTextColor(bold ? 15 : 71, bold ? 23 : 85, bold ? 42 : 105);
      docPdf.text(lbl, 52, y);
      docPdf.text(val, pageW - 52, y, { align: 'right' });
      y += 20;
    });

    y += 24;
    docPdf.setFont('helvetica', 'italic');
    docPdf.setFontSize(9);
    docPdf.setTextColor(100, 116, 139);
    docPdf.text(
      `Thank you for staying with ${property.name}. This is an official computer-generated receipt.`,
      pageW / 2,
      y,
      { align: 'center' }
    );

    docPdf.save(`${receiptNo}.pdf`);
  };

  return (
    <>
      {/* Printable Receipt Sheet (visible only during window.print()) */}
      <div className="print-only p-6 max-w-md mx-auto text-slate-900 bg-white">
        <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
          <p className="text-base font-bold uppercase tracking-wide">{property.name}</p>
          {property.address && <p className="text-[11px] text-slate-700">{property.address}</p>}
          {(property.phone || property.email) && (
            <p className="text-[11px] text-slate-700">
              {[property.phone, property.email].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="text-xs font-bold mt-2 tracking-wider uppercase">{copy.docLabel}</p>
        </div>

        <div className="text-xs space-y-1 border-b border-dashed border-slate-400 pb-3 mb-3">
          <div className="flex justify-between">
            <span>Receipt #:</span>
            <span className="font-mono-tabular font-bold">{receiptNo}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span className="font-mono-tabular">{issuedAt.toLocaleString('en-NG')}</span>
          </div>
          <div className="flex justify-between">
            <span>Guest:</span>
            <span className="font-semibold">{reservation.guestName}</span>
          </div>
          <div className="flex justify-between">
            <span>Booking Ref:</span>
            <span className="font-mono-tabular">{reservation.bookingRef}</span>
          </div>
          <div className="flex justify-between">
            <span>Room:</span>
            <span className="font-mono-tabular font-semibold">
              {reservation.roomNumber || 'Unassigned'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Stay:</span>
            <span className="font-mono-tabular">
              {reservation.checkInDate} → {reservation.checkOutDate} ({reservation.nights}n)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Channel:</span>
            <span>{formatBookingSourceLabel(reservation.channel)}</span>
          </div>
          <div className="flex justify-between">
            <span>Method:</span>
            <span>{paymentMethodLabel}</span>
          </div>
        </div>

        <div className="text-xs space-y-1.5 border-b border-dashed border-slate-400 pb-3 mb-3">
          <div className="flex justify-between">
            <span>
              Room ({reservation.nights}n × {formatNgn(reservation.nightlyRateNgn)})
            </span>
            <span className="font-mono-tabular">{formatNgn(roomChargesNgn)}</span>
          </div>
          {posChargesNgn > 0 && (
            <div className="flex justify-between">
              <span>Restaurant / Bar POS</span>
              <span className="font-mono-tabular">{formatNgn(posChargesNgn)}</span>
            </div>
          )}
          {lateFeeNgn > 0 && (
            <div className="flex justify-between">
              <span>Late Check-Out Fee</span>
              <span className="font-mono-tabular">{formatNgn(lateFeeNgn)}</span>
            </div>
          )}
        </div>

        <div className="text-xs space-y-1.5 mb-4">
          <div className="flex justify-between font-bold text-sm">
            <span>Total Bill</span>
            <span className="font-mono-tabular">{formatNgn(grossBillNgn)}</span>
          </div>
          {isOta && summary.paymentCollectionMode === 'ota_prepaid' && (
            <div className="flex justify-between">
              <span>Paid to OTA ({summary.sourceCurrency})</span>
              <span className="font-mono-tabular">
                {summary.sourceCurrency !== 'NGN' && summary.otaPaidSourceAmount > 0
                  ? `${formatChannelCurrency(summary.otaPaidSourceAmount, summary.sourceCurrency)} ${summary.sourceCurrency}`
                  : formatNgn(summary.otaPaidAmount || summary.expectedPayoutNgn)}
              </span>
            </div>
          )}
          {typeof amountJustPaidNgn === 'number' && amountJustPaidNgn > 0 && (
            <div className="flex justify-between font-semibold">
              <span>Payment Collected Now</span>
              <span className="font-mono-tabular">{formatNgn(amountJustPaidNgn)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Total Paid to Property</span>
            <span className="font-mono-tabular font-semibold">
              {formatNgn(effectiveHotelPaidNgn)}
            </span>
          </div>
          {summary.cautionDepositEnabled && summary.cautionDepositCollectedNgn > 0 && (
            <div className="flex justify-between">
              <span>
                Caution Deposit ({summary.cautionDepositRefunded ? 'Refunded' : 'Held'})
              </span>
              <span className="font-mono-tabular">
                {formatNgn(summary.cautionDepositCollectedNgn)}
              </span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-1.5 border-t border-slate-300 text-sm">
            <span>Balance Due</span>
            <span className="font-mono-tabular">
              {remainingBalanceNgn <= 0 ? '₦0 (SETTLED)' : formatNgn(remainingBalanceNgn)}
            </span>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-600 border-t border-dashed border-slate-400 pt-3">
          Thank you for choosing {property.name}.
        </p>
      </div>

      {/* Interactive Modal UI */}
      <div className="no-print fixed inset-0 z-[70] bg-slate-950/60 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
          <div className="px-6 py-4 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  {copy.badge}
                </p>
                <h3 className="font-display text-base font-bold text-slate-900 truncate">
                  {copy.heading}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {/* Receipt Preview Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <p className="font-display font-bold text-sm text-slate-900">{property.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {reservation.guestName} · Room{' '}
                    <span className="font-mono-tabular font-semibold text-slate-800">
                      {reservation.roomNumber || 'Unassigned'}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-tabular font-bold text-slate-900">{receiptNo}</p>
                  <p className="text-[11px] text-slate-500 font-mono-tabular">
                    {reservation.bookingRef}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block">Stay Dates</span>
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {reservation.checkInDate} → {reservation.checkOutDate} ({reservation.nights}n)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block">Method &amp; Source</span>
                  <span className="font-semibold text-slate-800">
                    {paymentMethodLabel} · {formatBookingSourceLabel(reservation.channel)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Room Accommodation ({reservation.nights}n)
                  </span>
                  <span className="font-mono-tabular font-medium text-slate-900">
                    {formatNgn(roomChargesNgn)}
                  </span>
                </div>
                {posChargesNgn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Restaurant / Bar POS Charges</span>
                    <span className="font-mono-tabular font-medium text-slate-900">
                      {formatNgn(posChargesNgn)}
                    </span>
                  </div>
                )}
                {lateFeeNgn > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>Late Check-Out Fee ({reservation.checkOutTime || '14:00'})</span>
                    <span className="font-mono-tabular font-semibold">
                      {formatNgn(lateFeeNgn)}
                    </span>
                  </div>
                )}
                {isOta && summary.paymentCollectionMode === 'ota_prepaid' && (
                  <div className="flex justify-between text-blue-700 pt-1 border-t border-slate-200/70">
                    <span>Paid to OTA ({summary.sourceCurrency})</span>
                    <span className="font-mono-tabular font-semibold">
                      {summary.sourceCurrency !== 'NGN' && summary.otaPaidSourceAmount > 0
                        ? `${formatChannelCurrency(summary.otaPaidSourceAmount, summary.sourceCurrency)} ${summary.sourceCurrency}`
                        : formatNgn(summary.otaPaidAmount || summary.expectedPayoutNgn)}
                    </span>
                  </div>
                )}
                {typeof amountJustPaidNgn === 'number' && amountJustPaidNgn > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200/70">
                    <span>Payment Settled Now</span>
                    <span className="font-mono-tabular">{formatNgn(amountJustPaidNgn)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200/70">
                  <span className="text-slate-600">Total Paid to Property</span>
                  <span className="font-mono-tabular font-bold text-emerald-700">
                    {formatNgn(effectiveHotelPaidNgn)}
                  </span>
                </div>
                {summary.cautionDepositEnabled && summary.cautionDepositCollectedNgn > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>
                      Caution Deposit ({summary.cautionDepositRefunded ? 'Refunded' : 'Held'})
                    </span>
                    <span className="font-mono-tabular font-semibold">
                      {formatNgn(summary.cautionDepositCollectedNgn)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-300 text-sm font-bold">
                  <span className="text-slate-900">Balance Due</span>
                  <span
                    className={`font-mono-tabular ${
                      remainingBalanceNgn > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {remainingBalanceNgn <= 0 ? '₦0 · Settled' : formatNgn(remainingBalanceNgn)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {onOpenFolio && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = reservation.id;
                      onClose();
                      onOpenFolio(id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Open Folio</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
