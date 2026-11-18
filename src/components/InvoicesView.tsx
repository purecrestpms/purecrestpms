import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  Download,
  Eye,
  FileText,
  Printer,
  Search,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { recordReservationFolioPayment } from '../services/pmsService';
import {
  formatBookingSourceLabel,
  formatChannelCurrency,
  formatNgn,
  getPropertySystemId,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  GuestRecord,
  isOtaBookingChannel,
  matchesBookingSourceFilter,
  PosOrderRecord,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  ReservationRecord,
  RESERVATION_STATUS_LABELS,
  ROLE_LABELS,
  RoomRecord,
  StaffRole,
} from '../types/pms';

interface InvoicesViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  guests: GuestRecord[];
  posOrders: PosOrderRecord[];
  activeRole: StaffRole;
  onNotify: (msg: string) => void;
}

function formatInputWithCommas(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  property,
  rooms,
  reservations,
  guests,
  posOrders,
  activeRole,
  onNotify,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [payFilter, setPayFilter] = useState<'all' | 'Paid' | 'Partial' | 'Unpaid'>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // Quick payment modal inside Invoice Detail page
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payMethod, setPayMethod] = useState<ReservationRecord['paymentMethod']>('Card POS');
  const [savingPay, setSavingPay] = useState(false);

  const systemPropId = getPropertySystemId(property);

  const filteredReservations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...reservations]
      .sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''))
      .filter((res) => {
        if (!matchesBookingSourceFilter(res.channel, sourceFilter)) return false;
        const summary = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
        if (payFilter !== 'all' && summary.paymentStatus !== payFilter) return false;
        if (!q) return true;
        return (
          res.guestName.toLowerCase().includes(q) ||
          res.bookingRef.toLowerCase().includes(q) ||
          (res.roomNumber || '').toLowerCase().includes(q) ||
          formatBookingSourceLabel(res.channel).toLowerCase().includes(q)
        );
      });
  }, [reservations, searchTerm, sourceFilter, payFilter, property.usdExchangeRateNgn]);

  const metrics = useMemo(() => {
    let paidCount = 0;
    let totalDirectPaidNgn = 0;
    let totalBalanceDueNgn = 0;
    let totalExpectedOtaPayoutNgn = 0;
    for (const r of reservations) {
      if (r.status === 'cancelled' && r.cancellationType !== 'paid') continue;
      const s = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
      if (s.paymentStatus === 'Paid') paidCount += 1;
      totalDirectPaidNgn += s.hotelPaidAmount;
      totalBalanceDueNgn += s.balance;
      if (isOtaBookingChannel(r.channel)) {
        totalExpectedOtaPayoutNgn += s.expectedPayoutNgn;
      }
    }
    return {
      totalCount: reservations.length,
      paidCount,
      totalDirectPaidNgn,
      totalBalanceDueNgn,
      totalExpectedOtaPayoutNgn,
    };
  }, [reservations, property.usdExchangeRateNgn]);

  const selectedRes = useMemo(
    () => reservations.find((r) => r.id === selectedInvoiceId) || null,
    [reservations, selectedInvoiceId]
  );

  const handleDownloadInvoicePdf = (res: ReservationRecord) => {
    const summary = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
    const roomDisplay = getReservationRoomDisplay(res, rooms);
    const guest = guests.find(
      (g) => g.id === res.guestId || g.fullName.toLowerCase() === res.guestName.toLowerCase()
    );
    const linkedOrders = posOrders.filter((o) => o.reservationId === res.id);
    const isOta = isOtaBookingChannel(res.channel);

    const docPdf = new jsPDF();
    docPdf.setFontSize(16);
    docPdf.text(property.name, 14, 18);
    docPdf.setFontSize(9);
    docPdf.text(`Property ID: ${systemPropId} | Code: ${property.code}`, 14, 24);
    docPdf.text(`${property.address}`, 14, 29);
    docPdf.text(`Tel: ${property.phone || ''} | Email: ${property.email || ''}`, 14, 34);

    docPdf.setFontSize(13);
    docPdf.text(`GUEST FOLIO INVOICE: INV-${res.bookingRef}`, 14, 44);
    docPdf.setFontSize(9);
    docPdf.text(`Guest: ${res.guestName}${guest?.phone ? ` (${guest.phone})` : ''}`, 14, 50);
    docPdf.text(
      `Room: ${roomDisplay.roomNumberLabel} (${roomDisplay.roomTypeLabel}) | Stay: ${res.checkInDate} to ${res.checkOutDate} (${res.nights} nights)`,
      14,
      55
    );
    docPdf.text(
      `Source: ${formatBookingSourceLabel(res.channel)} | Status: ${RESERVATION_STATUS_LABELS[res.status] || res.status}`,
      14,
      60
    );

    const rows: string[][] = [
      [
        `Accommodation (${roomDisplay.roomNumberLabel} · ${res.nights} night(s) @ NGN ${res.nightlyRateNgn.toLocaleString('en-NG')})`,
        `NGN ${res.roomChargesNgn.toLocaleString('en-NG')}`,
      ],
    ];
    for (const ord of linkedOrders) {
      rows.push([
        `POS Order #${ord.id.slice(-5).toUpperCase()} (${ord.itemsSummary})`,
        `NGN ${ord.totalNgn.toLocaleString('en-NG')}`,
      ]);
    }
    if (linkedOrders.length === 0 && (res.posChargesNgn || 0) > 0) {
      rows.push([
        'Restaurant & Minibar Folio Charges',
        `NGN ${(res.posChargesNgn || 0).toLocaleString('en-NG')}`,
      ]);
    }
    if ((res.lateCheckoutFeeNgn || 0) > 0) {
      rows.push([
        'Late Check-Out Fee',
        `NGN ${(res.lateCheckoutFeeNgn || 0).toLocaleString('en-NG')}`,
      ]);
    }
    if (res.status === 'cancelled' && res.cancellationType === 'paid') {
      rows.push([
        'Cancellation Fee',
        `NGN ${(res.cancellationFeeNgn || 0).toLocaleString('en-NG')}`,
      ]);
    }

    autoTable(docPdf, {
      startY: 66,
      head: [['Charge Description', 'Amount (NGN)']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [6, 21, 57] },
    });

    const afterChargesY = (docPdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 110;
    const payRows: string[][] = [];
    if (isOta) {
      payRows.push([
        `Guest Paid to OTA (${summary.sourceCurrency})`,
        summary.otaPaidSourceAmount > 0
          ? `${formatChannelCurrency(summary.otaPaidSourceAmount, summary.sourceCurrency)} ${summary.sourceCurrency} (approx. NGN ${summary.otaPaidAmount.toLocaleString('en-NG')})`
          : `${summary.sourceCurrency} 0.00 (Unpaid on OTA)`,
      ]);
      payRows.push([
        'Expected Property Payout (NGN)',
        `NGN ${summary.expectedPayoutNgn.toLocaleString('en-NG')}`,
      ]);
    }
    payRows.push([
      'Additional Direct Payment to Property (NGN)',
      `NGN ${summary.hotelPaidAmount.toLocaleString('en-NG')}`,
    ]);
    payRows.push([
      'Remaining Property Balance Due (NGN)',
      `NGN ${summary.balance.toLocaleString('en-NG')}`,
    ]);

    autoTable(docPdf, {
      startY: afterChargesY + 8,
      head: [['Payment & Settlement Breakdown', 'Recorded Value']],
      body: payRows,
      theme: 'grid',
      headStyles: { fillColor: [28, 70, 190] },
    });

    docPdf.save(`INV-${res.bookingRef}-${res.guestName.replace(/\s+/g, '_')}.pdf`);
    onNotify(`Downloaded invoice PDF INV-${res.bookingRef}`);
  };

  if (selectedRes) {
    const summary = getReservationPaymentSummary(selectedRes, property.usdExchangeRateNgn);
    const roomDisplay = getReservationRoomDisplay(selectedRes, rooms);
    const guest = guests.find(
      (g) =>
        g.id === selectedRes.guestId ||
        g.fullName.toLowerCase() === selectedRes.guestName.toLowerCase()
    );
    const linkedOrders = posOrders.filter((o) => o.reservationId === selectedRes.id);
    const isOta = isOtaBookingChannel(selectedRes.channel);

    const handleRecordDirectPay = async (e: React.FormEvent) => {
      e.preventDefault();
      const amount = Number(payAmountInput.replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) {
        onNotify('Enter a valid Naira amount.');
        return;
      }
      setSavingPay(true);
      try {
        await recordReservationFolioPayment({
          property,
          reservation: selectedRes,
          amountNgn: amount,
          paymentMethod: payMethod,
          actorRole: ROLE_LABELS[activeRole],
        });
        setShowPayModal(false);
        setPayAmountInput('');
        onNotify(`Recorded ${formatNgn(amount)} direct payment on INV-${selectedRes.bookingRef}`);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Unable to record payment');
      } finally {
        setSavingPay(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedInvoiceId(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Invoices</span>
            </button>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">
                Invoice INV-{selectedRes.bookingRef}
              </h1>
              <p className="text-xs text-slate-500 font-mono-tabular">
                {systemPropId} · {selectedRes.guestName} · {roomDisplay.roomNumberLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setPayAmountInput(summary.balance > 0 ? summary.balance.toLocaleString('en-US') : '');
                setShowPayModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Direct Payment</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadInvoicePdf(selectedRes)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#061539] hover:bg-[#0B245B] text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Printable Invoice Body */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1c46be] font-mono-tabular">
                {systemPropId} · {property.code}
              </p>
              <h2 className="font-display text-xl font-extrabold text-slate-900">
                {property.name}
              </h2>
              <p className="text-xs text-slate-600">{property.address}</p>
              <p className="text-xs text-slate-500 font-mono-tabular">
                {property.phone} · {property.email}
              </p>
            </div>
            <div className="sm:text-right space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tax Invoice / Receipt
              </p>
              <p className="font-mono-tabular text-lg font-extrabold text-slate-900">
                INV-{selectedRes.bookingRef}
              </p>
              <p className="text-xs text-slate-600">
                Status:{' '}
                <strong
                  className={
                    summary.paymentStatus === 'Paid'
                      ? 'text-emerald-700'
                      : summary.paymentStatus === 'Partial'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                  }
                >
                  {summary.paymentStatus}
                </strong>{' '}
                · {RESERVATION_STATUS_LABELS[selectedRes.status] || selectedRes.status}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <p className="text-slate-500">Guest</p>
              <p className="font-semibold text-slate-900 mt-0.5">{selectedRes.guestName}</p>
              <p className="font-mono-tabular text-[11px] text-slate-500">
                {selectedRes.guestPhone || guest?.phone || '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Room Assignment</p>
              <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                {roomDisplay.roomNumberLabel}
              </p>
              <p className="text-[11px] text-slate-500">{roomDisplay.roomTypeLabel}</p>
            </div>
            <div>
              <p className="text-slate-500">Stay Period</p>
              <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                {selectedRes.checkInDate} → {selectedRes.checkOutDate}
              </p>
              <p className="text-[11px] text-slate-500">{selectedRes.nights} night(s)</p>
            </div>
            <div>
              <p className="text-slate-500">Booking Channel</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {formatBookingSourceLabel(selectedRes.channel)}
              </p>
              <p className="font-mono-tabular text-[11px] text-slate-500">
                Orig. Currency: {summary.sourceCurrency}
              </p>
            </div>
          </div>

          {/* Itemized Folio Charges */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-600">
                  <th className="py-3 px-4">Item Description</th>
                  <th className="py-3 px-4 text-right">Amount (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 px-4 text-slate-800">
                    Room Accommodation — {roomDisplay.roomNumberLabel} ({selectedRes.nights} night(s) ×{' '}
                    <span className="font-mono-tabular">{formatNgn(selectedRes.nightlyRateNgn)}</span>)
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                    {formatNgn(selectedRes.roomChargesNgn)}
                  </td>
                </tr>
                {linkedOrders.map((ord) => (
                  <tr key={ord.id}>
                    <td className="py-3 px-4 text-slate-700">
                      Restaurant / Room Service POS — {ord.itemsSummary}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(ord.totalNgn)}
                    </td>
                  </tr>
                ))}
                {linkedOrders.length === 0 && (selectedRes.posChargesNgn || 0) > 0 && (
                  <tr>
                    <td className="py-3 px-4 text-slate-700">Restaurant &amp; Misc Folio Charges</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(selectedRes.posChargesNgn || 0)}
                    </td>
                  </tr>
                )}
                {(selectedRes.lateCheckoutFeeNgn || 0) > 0 && (
                  <tr>
                    <td className="py-3 px-4 text-amber-800">Late Check-Out Fee</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-amber-800">
                      {formatNgn(selectedRes.lateCheckoutFeeNgn || 0)}
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold">
                  <td className="py-3 px-4 text-slate-900">Total Folio Charges (₦)</td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-900">
                    {formatNgn(summary.totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Separate Payment & Settlement Records */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {isOta && (
              <>
                <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-blue-800">
                    Guest Paid to OTA ({summary.sourceCurrency})
                  </p>
                  <p className="font-mono-tabular text-base font-bold text-blue-950 mt-1">
                    {summary.otaPaidSourceAmount > 0
                      ? `${formatChannelCurrency(summary.otaPaidSourceAmount, summary.sourceCurrency)} ${summary.sourceCurrency}`
                      : `${formatChannelCurrency(0, summary.sourceCurrency)} ${summary.sourceCurrency}`}
                  </p>
                  <p className="text-[11px] font-mono-tabular text-blue-700 mt-0.5">
                    {summary.otaPaidAmount > 0 && summary.sourceCurrency !== 'NGN'
                      ? `≈ ${formatNgn(summary.otaPaidAmount)} @ ₦${summary.fxRateToNgn.toLocaleString('en-NG')}/${summary.sourceCurrency}`
                      : summary.otaPaidAmount > 0
                        ? 'Paid directly to OTA'
                        : 'No prepayment recorded on OTA'}
                  </p>
                </div>

                <div className="border border-slate-200 bg-slate-50 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-slate-600">
                    Expected Property Payout (₦)
                  </p>
                  <p className="font-mono-tabular text-base font-bold text-slate-900 mt-1">
                    {formatNgn(summary.expectedPayoutNgn)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Converted property settlement in Naira
                  </p>
                </div>
              </>
            )}

            <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-emerald-800">
                Direct Payment to Property (₦)
              </p>
              <p className="font-mono-tabular text-base font-bold text-emerald-900 mt-1">
                {formatNgn(summary.hotelPaidAmount)}
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Method: {selectedRes.paymentMethod}
              </p>
            </div>

            <div
              className={`border rounded-xl p-4 ${
                summary.balance > 0
                  ? 'border-rose-200 bg-rose-50/60'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p
                className={`text-[11px] font-semibold ${
                  summary.balance > 0 ? 'text-rose-800' : 'text-slate-600'
                }`}
              >
                Remaining Property Balance (₦)
              </p>
              <p
                className={`font-mono-tabular text-base font-bold mt-1 ${
                  summary.balance > 0 ? 'text-rose-800' : 'text-slate-900'
                }`}
              >
                {formatNgn(summary.balance)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {summary.balance > 0 ? 'Collectible at front desk' : 'No unpaid property balance'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Direct Payment Modal */}
        {showPayModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4">
            <form
              onSubmit={handleRecordDirectPay}
              className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Record Direct Payment to Property
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-slate-600">
                Adds a direct Naira payment to INV-{selectedRes.bookingRef} without altering OTA paid or expected payout figures.
              </p>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Amount (₦)</label>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  value={payAmountInput}
                  onChange={(e) => setPayAmountInput(formatInputWithCommas(e.target.value))}
                  placeholder="e.g. 25,000"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular font-semibold"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) =>
                    setPayMethod(e.target.value as ReservationRecord['paymentMethod'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Card POS">Card POS</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash NGN">Cash NGN</option>
                  <option value="Corporate Invoice">Corporate Invoice</option>
                  <option value="Online Gateway">Online Gateway</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPay}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  {savingPay ? 'Posting...' : 'Post Payment'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#1c46be] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              Invoices &amp; Guest Receipts
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {property.name} ·{' '}
              <span className="font-mono-tabular font-semibold text-[#1c46be]">{systemPropId}</span>
            </p>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Total Folios</p>
          <p className="font-mono-tabular text-lg font-bold text-slate-900 mt-0.5">
            {metrics.totalCount}
            <span className="text-xs font-normal text-slate-500 ml-1.5">
              ({metrics.paidCount} settled)
            </span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Expected OTA Payouts (₦)</p>
          <p className="font-mono-tabular text-lg font-bold text-[#1c46be] mt-0.5">
            {formatNgn(metrics.totalExpectedOtaPayoutNgn)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Direct Property Payments (₦)</p>
          <p className="font-mono-tabular text-lg font-bold text-emerald-700 mt-0.5">
            {formatNgn(metrics.totalDirectPaidNgn)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Balance Due at Property (₦)</p>
          <p className="font-mono-tabular text-lg font-bold text-rose-700 mt-0.5">
            {formatNgn(metrics.totalBalanceDueNgn)}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search invoice ref, guest name, room..."
            className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-700"
          >
            <option value="ALL">All Booking Sources</option>
            {PRIMARY_BOOKING_SOURCES.map((src) => (
              <option key={src.value} value={src.value}>
                {src.label}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
            {(['all', 'Paid', 'Partial', 'Unpaid'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPayFilter(k)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  payFilter === k
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {k === 'all' ? 'All' : k}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1160px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Guest &amp; Room</th>
                <th className="py-3 px-4">Stay Dates</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4 text-right">Paid to OTA (Orig.)</th>
                <th className="py-3 px-4 text-right">Expected Payout (₦)</th>
                <th className="py-3 px-4 text-right">Direct to Property (₦)</th>
                <th className="py-3 px-4 text-right">Balance Due (₦)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredReservations.map((res) => {
                const s = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
                const roomDisplay = getReservationRoomDisplay(res, rooms);
                const isOta = isOtaBookingChannel(res.channel);
                return (
                  <tr
                    key={res.id}
                    onClick={() => setSelectedInvoiceId(res.id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono-tabular font-bold text-[#1c46be] whitespace-nowrap">
                      INV-{res.bookingRef}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{res.guestName}</p>
                      <p className="text-[11px] font-mono-tabular text-slate-500">
                        {roomDisplay.roomNumberLabel} · {roomDisplay.roomTypeLabel}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {res.checkInDate} → {res.checkOutDate}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {formatBookingSourceLabel(res.channel)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                      {isOta && s.otaPaidSourceAmount > 0 ? (
                        <span className="font-semibold text-blue-700">
                          {formatChannelCurrency(s.otaPaidSourceAmount, s.sourceCurrency)}{' '}
                          {s.sourceCurrency}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                      {isOta ? formatNgn(s.expectedPayoutNgn) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-emerald-700 whitespace-nowrap">
                      {formatNgn(s.hotelPaidAmount)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-tabular font-bold whitespace-nowrap ${
                        s.balance > 0 ? 'text-rose-700' : 'text-slate-600'
                      }`}
                    >
                      {formatNgn(s.balance)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          s.paymentStatus === 'Paid'
                            ? 'text-emerald-700'
                            : s.paymentStatus === 'Partial'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                        }`}
                      >
                        {s.paymentStatus}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceId(res.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Open</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoicePdf(res)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredReservations.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-xs text-slate-500">
                    No matching invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
