import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BedDouble,
  Calendar,
  CalendarCheck2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  ListChecks,
  Printer,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import {
  AttendanceRecord,
  BlockedDateRecord,
  formatBookingSourceLabel,
  formatNgn,
  formatUsd,
  getPropertySystemId,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  isOtaBookingChannel,
  LedgerEntryRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  OtaIntegrationRecord,
  PayrollRunRecord,
  PosOrderRecord,
  PropertyRecord,
  PurchaseOrderRecord,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  ReservationStatus,
  RoomRecord,
  ShiftScheduleRecord,
  sortRoomsByNumber,
  StaffMemberRecord,
  StaffRole,
} from '../types/pms';
import {
  BookingsBySourcePieChart,
  buildBookingsBySource,
  buildMonthlyBookingTrend,
  MonthlyTrendBarChart,
} from './BookingAnalyticsCharts';

interface AdminReportsAnalyticsViewProps {
  property: PropertyRecord;
  activeRole: StaffRole;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  guests: GuestRecord[];
  ledgerEntries: LedgerEntryRecord[];
  posOrders: PosOrderRecord[];
  inventoryItems: InventoryItemRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  staffMembers: StaffMemberRecord[];
  shifts: ShiftScheduleRecord[];
  attendance: AttendanceRecord[];
  payrollRuns: PayrollRunRecord[];
  housekeepingTasks: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  otaChannels: OtaIntegrationRecord[];
  initialTab?: ReportTab;
  onNavigate?: (section: NavSectionId) => void;
  onNotify: (msg: string) => void;
}

type PeriodPreset =
  | 'this_month'
  | 'today'
  | 'last_7'
  | 'last_30'
  | 'last_month'
  | 'last_6_months'
  | 'this_year'
  | 'all_time'
  | 'custom';

export type ReportTab = 'bookings' | 'financials' | 'rooms' | 'guests';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(baseIso: string, delta: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00`).getTime();
  const e = new Date(`${endIso}T00:00:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 1;
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

function computeNights(checkIn: string, checkOut: string): number {
  const s = new Date(`${checkIn}T00:00:00`).getTime();
  const e = new Date(`${checkOut}T00:00:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 1;
  return Math.max(1, Math.round((e - s) / 86_400_000));
}

function formatReadableDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatPctDelta(current: number, previous: number): { text: string; positive: boolean | null } {
  if (previous <= 0 && current <= 0) return { text: '0% vs prior period', positive: null };
  if (previous <= 0 && current > 0) return { text: '+100% vs prior period', positive: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: '0% vs prior period', positive: null };
  return {
    text: `${pct > 0 ? '+' : ''}${pct}% vs prior period`,
    positive: pct > 0,
  };
}

function resolvePeriodRange(preset: PeriodPreset, customStart: string, customEnd: string): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
} {
  const now = new Date();
  const today = isoDate(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  let start = isoDate(new Date(y, m, 1));
  let end = isoDate(new Date(y, m + 1, 0));
  let label = 'This Month';

  if (preset === 'today') {
    start = today;
    end = today;
    label = 'Today';
  } else if (preset === 'last_7') {
    start = addDaysIso(today, -6);
    end = today;
    label = 'Last 7 Days';
  } else if (preset === 'last_30') {
    start = addDaysIso(today, -29);
    end = today;
    label = 'Last 30 Days';
  } else if (preset === 'last_month') {
    start = isoDate(new Date(y, m - 1, 1));
    end = isoDate(new Date(y, m, 0));
    label = 'Last Month';
  } else if (preset === 'last_6_months') {
    start = isoDate(new Date(y, m - 5, 1));
    end = today;
    label = 'Last 6 Months';
  } else if (preset === 'this_year') {
    start = `${y}-01-01`;
    end = `${y}-12-31`;
    label = `This Year (${y})`;
  } else if (preset === 'all_time') {
    start = '2020-01-01';
    end = '2035-12-31';
    label = 'All Time';
  } else if (preset === 'custom') {
    start = customStart || today;
    end = customEnd && customEnd >= start ? customEnd : start;
    label = `${formatReadableDate(start)} – ${formatReadableDate(end)}`;
  }

  const spanDays = daysBetweenInclusive(start, end);
  const prevEnd = addDaysIso(start, -1);
  const prevStart = addDaysIso(prevEnd, -(spanDays - 1));

  return { start, end, prevStart, prevEnd, label };
}

function getReservationEffectiveRevenueNgn(r: ReservationRecord, fxRate?: number): number {
  const pay = getReservationPaymentSummary(r, fxRate);
  return isOtaBookingChannel(r.channel) ? pay.expectedPayoutNgn : pay.totalAmount;
}

export const AdminReportsAnalyticsView: React.FC<AdminReportsAnalyticsViewProps> = ({
  property,
  activeRole,
  rooms,
  reservations,
  guests,
  ledgerEntries,
  posOrders,
  staffMembers,
  housekeepingTasks,
  maintenanceTickets,
  initialTab,
  onNavigate,
  onNotify,
}) => {
  const todayIso = useMemo(() => isoDate(new Date()), []);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState(() => isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(() => todayIso);
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab || 'bookings');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReservationStatus>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const canAccess = activeRole === 'pch_admin' || activeRole === 'property_admin';

  const period = useMemo(
    () => resolvePeriodRange(periodPreset, customStart, customEnd),
    [periodPreset, customStart, customEnd]
  );

  // Filter reservations for active period and comparison period
  const { periodReservations, priorReservations } = useMemo(() => {
    const inWindow = (r: ReservationRecord, start: string, end: string) => {
      if (periodPreset === 'all_time') return true;
      const fallbackDate =
        typeof r.createdAt === 'string'
          ? r.createdAt
          : r.createdAt?.toDate?.()?.toISOString() || '';
      const d = (r.checkInDate || fallbackDate).slice(0, 10);
      return d >= start && d <= end;
    };
    return {
      periodReservations: reservations.filter((r) => inWindow(r, period.start, period.end)),
      priorReservations:
        periodPreset === 'all_time'
          ? []
          : reservations.filter((r) => inWindow(r, period.prevStart, period.prevEnd)),
    };
  }, [reservations, period, periodPreset]);

  // Core KPI Summary
  const kpis = useMemo(() => {
    const totalBookings = periodReservations.length;
    const priorTotalBookings = priorReservations.length;

    const confirmedBookings = periodReservations.filter(
      (r) => r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'checked_out'
    ).length;
    const priorConfirmedBookings = priorReservations.filter(
      (r) => r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'checked_out'
    ).length;

    const cancelledBookings = periodReservations.filter(
      (r) => r.status === 'cancelled' || r.status === 'no_show'
    ).length;
    const priorCancelledBookings = priorReservations.filter(
      (r) => r.status === 'cancelled' || r.status === 'no_show'
    ).length;

    const activeBookings = periodReservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );
    const totalNights = activeBookings.reduce(
      (sum, r) => sum + (r.nights || computeNights(r.checkInDate, r.checkOutDate)),
      0
    );
    const avgStay = activeBookings.length > 0 ? totalNights / activeBookings.length : 0;

    const totalBookingRevenueNgn = activeBookings.reduce(
      (sum, r) => sum + getReservationEffectiveRevenueNgn(r, property.usdExchangeRateNgn),
      0
    );

    // Clamp occupied room-nights strictly inside [period.start, period.end] for accurate period occupancy
    const periodDays =
      periodPreset === 'all_time' ? 30 : daysBetweenInclusive(period.start, period.end);
    const sellableCount =
      rooms.filter((rm) => rm.occupancyStatus !== 'out_of_order').length || rooms.length;
    const capacityNights = Math.max(1, sellableCount * periodDays);
    const periodEndExclusive = addDaysIso(period.end, 1);
    const occupiedNightsInPeriod =
      periodPreset === 'all_time'
        ? totalNights
        : reservations
            .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
            .reduce((sum, r) => {
              const rIn = (r.checkInDate || '').slice(0, 10);
              const rOutRaw = (r.checkOutDate || '').slice(0, 10);
              if (!rIn) return sum;
              const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
              const overlapStart = rIn > period.start ? rIn : period.start;
              const overlapEnd = rOut < periodEndExclusive ? rOut : periodEndExclusive;
              if (overlapEnd <= overlapStart) return sum;
              return sum + computeNights(overlapStart, overlapEnd);
            }, 0);
    const occupancyPct = Math.min(100, Math.round((occupiedNightsInPeriod / capacityNights) * 100));

    return {
      totalBookings,
      totalDelta: formatPctDelta(totalBookings, priorTotalBookings),
      confirmedBookings,
      confirmedDelta: formatPctDelta(confirmedBookings, priorConfirmedBookings),
      cancelledBookings,
      cancelledDelta: formatPctDelta(cancelledBookings, priorCancelledBookings),
      avgStay,
      totalNights,
      occupancyPct,
      totalBookingRevenueNgn,
    };
  }, [periodReservations, priorReservations, reservations, property.usdExchangeRateNgn, rooms, period, periodPreset]);

  // Visual Charts Data (6-Month Trend + Bookings by Source)
  const monthlyTrend = useMemo(
    () =>
      buildMonthlyBookingTrend(
        reservations,
        property.usdExchangeRateNgn,
        6,
        periodPreset === 'all_time' ? todayIso : period.end
      ),
    [reservations, property.usdExchangeRateNgn, period.end, periodPreset, todayIso]
  );

  const sourceSlices = useMemo(
    () => buildBookingsBySource(periodReservations, property.usdExchangeRateNgn),
    [periodReservations, property.usdExchangeRateNgn]
  );

  // Filtered Recent Bookings table rows
  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...periodReservations]
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (sourceFilter !== 'ALL' && formatBookingSourceLabel(r.channel) !== sourceFilter) {
          return false;
        }
        if (!q) return true;
        const roomDisp = getReservationRoomDisplay(r, rooms);
        return (
          r.guestName.toLowerCase().includes(q) ||
          r.bookingRef.toLowerCase().includes(q) ||
          roomDisp.roomNumberLabel.toLowerCase().includes(q) ||
          formatBookingSourceLabel(r.channel).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''));
  }, [periodReservations, rooms, searchQuery, statusFilter, sourceFilter]);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    periodReservations.forEach((r) => set.add(formatBookingSourceLabel(r.channel)));
    return Array.from(set).sort();
  }, [periodReservations]);

  // Financial Summary (P&L) for active period
  const financials = useMemo(() => {
    const inPeriod = (dateStr?: string) => {
      if (periodPreset === 'all_time') return true;
      const d = (dateStr || '').slice(0, 10);
      return d >= period.start && d <= period.end;
    };

    const periodLedger = ledgerEntries.filter((e) => inPeriod(e.entryDate));
    const ledgerRevenue = periodLedger
      .filter((e) => e.entryType === 'revenue')
      .reduce((s, e) => s + e.amountNgn, 0);
    const ledgerExpenses = periodLedger
      .filter((e) => e.entryType === 'expense')
      .reduce((s, e) => s + e.amountNgn, 0);

    const periodPos = posOrders.filter((o) => inPeriod(o.orderDate));
    const posRevenue = periodPos.reduce((s, o) => s + (Number(o.totalNgn) || 0), 0);
    // Exclude room_folio POS orders from standalone POS addition because they are already counted in reservation totals
    const nonFolioPosRevenue = periodPos
      .filter((o) => o.paymentStatus !== 'room_folio')
      .reduce((s, o) => s + (Number(o.totalNgn) || 0), 0);

    const totalRevenue = Math.max(ledgerRevenue, kpis.totalBookingRevenueNgn + nonFolioPosRevenue);
    const netProfit = totalRevenue - ledgerExpenses;

    // Group revenue & expense categories cleanly
    const categoryTotals = new Map<string, { type: 'revenue' | 'expense'; category: string; amount: number; count: number }>();
    periodLedger.forEach((e) => {
      const key = `${e.entryType}:${e.category}`;
      const cur = categoryTotals.get(key) || {
        type: e.entryType,
        category: e.category,
        amount: 0,
        count: 0,
      };
      cur.amount += e.amountNgn;
      cur.count += 1;
      categoryTotals.set(key, cur);
    });

    const pendingFolios = periodReservations
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .map((r) => ({
        reservation: r,
        pay: getReservationPaymentSummary(r, property.usdExchangeRateNgn),
      }))
      .filter((item) => item.pay.balance > 0)
      .sort((a, b) => b.pay.balance - a.pay.balance);

    const totalOutstandingNgn = pendingFolios.reduce((s, item) => s + item.pay.balance, 0);

    return {
      totalRevenue,
      ledgerExpenses,
      netProfit,
      posRevenue,
      posOrderCount: periodPos.length,
      totalOutstandingNgn,
      pendingFolios,
      categories: Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount),
    };
  }, [
    ledgerEntries,
    posOrders,
    periodReservations,
    period,
    periodPreset,
    kpis.totalBookingRevenueNgn,
    property.usdExchangeRateNgn,
  ]);

  // Room Performance rows
  const roomPerformance = useMemo(() => {
    const sorted = sortRoomsByNumber(rooms);
    const periodDays =
      periodPreset === 'all_time' ? 30 : daysBetweenInclusive(period.start, period.end);

    return sorted.map((room) => {
      const roomRes = periodReservations.filter(
        (r) =>
          (r.roomId === room.id || r.roomNumber === room.roomNumber) &&
          r.status !== 'cancelled' &&
          r.status !== 'no_show'
      );
      const nights = roomRes.reduce(
        (s, r) => s + (r.nights || computeNights(r.checkInDate, r.checkOutDate)),
        0
      );
      const revenueNgn = roomRes.reduce(
        (s, r) => s + getReservationEffectiveRevenueNgn(r, property.usdExchangeRateNgn),
        0
      );
      const occPct = Math.min(100, Math.round((nights / Math.max(1, periodDays)) * 100));
      const adr = nights > 0 ? Math.round(revenueNgn / nights) : room.nightlyRateNgn;

      return {
        room,
        bookings: roomRes.length,
        nights,
        revenueNgn,
        occPct,
        adr,
      };
    });
  }, [rooms, periodReservations, period, periodPreset, property.usdExchangeRateNgn]);

  const generatedTimestamp = useMemo(
    () =>
      new Date().toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  // Real PDF Export
  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFillColor(12, 86, 44);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text(`${property.name} — Booking & Management Report`, 36, 30);
      doc.setFontSize(10);
      doc.text(
        `Period: ${period.label}  |  Property ID: ${getPropertySystemId(property)}  |  Generated: ${generatedTimestamp}`,
        36,
        48
      );

      doc.setTextColor(15, 23, 42);
      autoTable(doc, {
        startY: 82,
        head: [['Total Bookings', 'Confirmed', 'Cancelled', 'Average Stay', 'Total Revenue (Bookings)', 'Net Profit']],
        body: [
          [
            String(kpis.totalBookings),
            String(kpis.confirmedBookings),
            String(kpis.cancelledBookings),
            `${kpis.avgStay.toFixed(1)} Nights`,
            formatNgn(kpis.totalBookingRevenueNgn),
            formatNgn(financials.netProfit),
          ],
        ],
        theme: 'grid',
        headStyles: { fillColor: [12, 86, 44], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 10, fontStyle: 'bold' },
      });

      const bookingRows = filteredBookings.map((r) => {
        const roomDisp = getReservationRoomDisplay(r, rooms);
        const pay = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
        const nights = r.nights || computeNights(r.checkInDate, r.checkOutDate);
        const amountStr =
          pay.sourceCurrency === 'USD'
            ? `${formatUsd(pay.sourceTotalAmount)} (${formatNgn(pay.expectedPayoutNgn)})`
            : formatNgn(pay.totalAmount);
        return [
          r.bookingRef,
          r.guestName,
          roomDisp.roomNumberLabel,
          formatBookingSourceLabel(r.channel),
          formatReadableDate(r.checkInDate),
          formatReadableDate(r.checkOutDate),
          String(nights),
          amountStr,
          pay.paymentStatus,
          RESERVATION_STATUS_LABELS[r.status] || r.status,
        ];
      });

      autoTable(doc, {
        startY: ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140) + 18,
        head: [
          [
            'Booking ID',
            'Guest Name',
            'Room',
            'Source',
            'Check-In',
            'Check-Out',
            'Nights',
            'Amount',
            'Payment',
            'Status',
          ],
        ],
        body: bookingRows.length > 0 ? bookingRows : [['—', 'No bookings in selected period', '', '', '', '', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [6, 21, 57], textColor: 255, fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5 },
      });

      const fileSlug = `${property.code || 'PCH'}-booking-report-${todayIso}.pdf`;
      doc.save(fileSlug);
      onNotify(`Exported PDF report (${fileSlug})`);
    } catch (err) {
      onNotify(
        getUserFriendlyErrorMessage(err, 'Unable to export PDF report. Please try again.', 'Reports:ExportPDF')
      );
    }
  };

  // Real Multi-Sheet Excel Export
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const bookingsSheetData = filteredBookings.map((r) => {
        const roomDisp = getReservationRoomDisplay(r, rooms);
        const pay = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
        const nights = r.nights || computeNights(r.checkInDate, r.checkOutDate);
        return {
          'Booking ID': r.bookingRef,
          'Guest Name': r.guestName,
          Room: roomDisp.roomNumberLabel,
          'Room Type': roomDisp.roomTypeLabel,
          Source: formatBookingSourceLabel(r.channel),
          'Check-In': r.checkInDate,
          'Check-Out': r.checkOutDate,
          Nights: nights,
          'Currency': pay.sourceCurrency,
          'Amount (USD)': pay.sourceCurrency === 'USD' ? pay.sourceTotalAmount : '',
          'Amount (NGN)': isOtaBookingChannel(r.channel) ? pay.expectedPayoutNgn : pay.totalAmount,
          'Paid (NGN)': pay.amountPaid,
          'Balance (NGN)': pay.balance,
          'Payment Status': pay.paymentStatus,
          'Booking Status': RESERVATION_STATUS_LABELS[r.status] || r.status,
        };
      });

      const summarySheetData = [
        { Metric: 'Property', Value: property.name },
        { Metric: 'Report Period', Value: period.label },
        { Metric: 'Total Bookings', Value: kpis.totalBookings },
        { Metric: 'Confirmed Bookings', Value: kpis.confirmedBookings },
        { Metric: 'Cancelled Bookings', Value: kpis.cancelledBookings },
        { Metric: 'Average Stay (Nights)', Value: Number(kpis.avgStay.toFixed(1)) },
        { Metric: 'Occupancy Rate (%)', Value: kpis.occupancyPct },
        { Metric: 'Total Revenue (Bookings NGN)', Value: kpis.totalBookingRevenueNgn },
        { Metric: 'Total Operating Revenue (NGN)', Value: financials.totalRevenue },
        { Metric: 'Total Operating Expenses (NGN)', Value: financials.ledgerExpenses },
        { Metric: 'Net Profit (NGN)', Value: financials.netProfit },
        { Metric: 'Outstanding Balances (NGN)', Value: financials.totalOutstandingNgn },
      ];

      const roomsSheetData = roomPerformance.map((row) => ({
        Room: row.room.roomNumber,
        Type: row.room.roomType,
        Status: row.room.occupancyStatus,
        Bookings: row.bookings,
        'Nights Sold': row.nights,
        'Occupancy (%)': row.occPct,
        'Revenue (NGN)': row.revenueNgn,
        'ADR (NGN)': row.adr,
      }));

      const sourcesSheetData = sourceSlices.map((s) => ({
        Source: s.label,
        Bookings: s.count,
        'Share (%)': s.pct,
        'Revenue (USD)': s.usdTotal,
        'Revenue (NGN)': s.ngnTotal,
      }));

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheetData), 'Summary');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(bookingsSheetData.length > 0 ? bookingsSheetData : [{ Note: 'No bookings in period' }]),
        'Bookings'
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roomsSheetData), 'Rooms');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(sourcesSheetData.length > 0 ? sourcesSheetData : [{ Note: 'No sources in period' }]),
        'Booking Sources'
      );

      const fileSlug = `${property.code || 'PCH'}-booking-report-${todayIso}.xlsx`;
      XLSX.writeFile(wb, fileSlug);
      onNotify(`Exported Excel workbook (${fileSlug})`);
    } catch (err) {
      onNotify(
        getUserFriendlyErrorMessage(err, 'Unable to export Excel workbook. Please try again.', 'Reports:ExportExcel')
      );
    }
  };

  if (!canAccess) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-lg mx-auto my-8 space-y-3">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-extrabold text-[#061539]">
          Management Reports Restricted
        </h2>
        <p className="text-xs text-slate-600">
          Financial and booking analytics are available to Property Admins and PCH Super Admins only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Clean Header Bar with Period Selector & Exports */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0c562c] to-[#15803d] text-white flex items-center justify-center shrink-0 shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#061539] tracking-tight truncate">
                Booking Report
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                View and analyse your property bookings — {property.name}
              </p>
            </div>
          </div>

          {/* Right Controls: Period Dropdown + Export PDF + Export Excel + Print */}
          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <div className="relative inline-flex items-center">
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
              <select
                value={periodPreset}
                onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
                aria-label="Report period"
                className="h-10 pl-9 pr-8 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 cursor-pointer"
              >
                <option value="this_month">This Month</option>
                <option value="today">Today</option>
                <option value="last_7">Last 7 Days</option>
                <option value="last_30">Last 30 Days</option>
                <option value="last_month">Last Month</option>
                <option value="last_6_months">Last 6 Months</option>
                <option value="this_year">This Year</option>
                <option value="all_time">All Time</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportPdf}
              className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#0c562c] hover:bg-[#094322] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-emerald-700/40 bg-white hover:bg-emerald-50 text-emerald-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Inline Custom Date Pickers (only shown when Custom Range is active) */}
        {periodPreset === 'custom' && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-slate-600">Custom Range:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white font-mono-tabular text-xs text-slate-800"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white font-mono-tabular text-xs text-slate-800"
            />
          </div>
        )}
      </div>

      {/* 4 Clean Soft-Tinted Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Bookings */}
        <div className="bg-emerald-50/80 border border-emerald-200/70 rounded-xl p-4 sm:p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <CalendarCheck2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">Total Bookings</p>
            <p className="font-mono-tabular text-3xl font-extrabold text-[#061539] leading-tight mt-1">
              {kpis.totalBookings}
            </p>
            <p
              className={`text-[11px] font-semibold mt-1 inline-flex items-center gap-1 ${
                kpis.totalDelta.positive === false
                  ? 'text-rose-700'
                  : 'text-emerald-700'
              }`}
            >
              {kpis.totalDelta.positive === false ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <TrendingUp className="w-3 h-3" />
              )}
              <span>{kpis.totalDelta.text}</span>
            </p>
          </div>
        </div>

        {/* 2. Confirmed Bookings */}
        <div className="bg-sky-50/80 border border-sky-200/70 rounded-xl p-4 sm:p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">Confirmed Bookings</p>
            <p className="font-mono-tabular text-3xl font-extrabold text-[#061539] leading-tight mt-1">
              {kpis.confirmedBookings}
            </p>
            <p
              className={`text-[11px] font-semibold mt-1 inline-flex items-center gap-1 ${
                kpis.confirmedDelta.positive === false
                  ? 'text-rose-700'
                  : 'text-emerald-700'
              }`}
            >
              {kpis.confirmedDelta.positive === false ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <TrendingUp className="w-3 h-3" />
              )}
              <span>{kpis.confirmedDelta.text}</span>
            </p>
          </div>
        </div>

        {/* 3. Cancelled Bookings */}
        <div className="bg-rose-50/80 border border-rose-200/70 rounded-xl p-4 sm:p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <XCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">Cancelled Bookings</p>
            <p className="font-mono-tabular text-3xl font-extrabold text-[#061539] leading-tight mt-1">
              {kpis.cancelledBookings}
            </p>
            <p className="text-[11px] font-semibold mt-1 inline-flex items-center gap-1 text-rose-700">
              {kpis.cancelledDelta.positive === true ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{kpis.cancelledDelta.text}</span>
            </p>
          </div>
        </div>

        {/* 4. Average Stay */}
        <div className="bg-violet-50/80 border border-violet-200/70 rounded-xl p-4 sm:p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">Average Stay</p>
            <p className="font-mono-tabular text-3xl font-extrabold text-[#061539] leading-tight mt-1">
              {kpis.avgStay.toFixed(1)}{' '}
              <span className="text-sm font-semibold text-slate-600 font-sans">Nights</span>
            </p>
            <p className="text-[11px] font-semibold text-violet-800 mt-1">
              {kpis.totalNights} room-nights · {kpis.occupancyPct}% occupancy
            </p>
          </div>
        </div>
      </div>

      {/* 2 Side-by-Side Visual Charts: Booking Trends + Bookings by Source */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7">
          <MonthlyTrendBarChart
            data={monthlyTrend}
            defaultMetric="bookings"
            allowMetricToggle
            headerTone="emerald"
          />
        </div>
        <div className="lg:col-span-5">
          <BookingsBySourcePieChart
            title="Bookings by Source"
            slices={sourceSlices}
            variant="pie"
            headerTone="emerald"
          />
        </div>
      </div>

      {/* Simple 3-Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'bookings'
                ? 'bg-[#0c562c] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>Recent Bookings ({filteredBookings.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('financials')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'financials'
                ? 'bg-[#0c562c] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Financial Summary</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'rooms'
                ? 'bg-[#0c562c] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <BedDouble className="w-4 h-4" />
            <span>Occupancy &amp; Rooms</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guests')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'guests'
                ? 'bg-[#0c562c] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Guest Report ({guests.length})</span>
          </button>
        </div>

        <span className="text-xs font-medium text-slate-500">
          Showing period: <strong className="text-slate-800">{period.label}</strong>
        </span>
      </div>

      {/* TAB 1: RECENT BOOKINGS TABLE (Matches Reference Layout) */}
      {activeTab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          {/* Dark Emerald Table Header Bar */}
          <div className="bg-gradient-to-r from-[#0c562c] to-[#136f3b] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-emerald-300" />
              <h2 className="font-display text-sm font-bold tracking-tight">Recent Bookings</h2>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('reservations')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-white/95 hover:text-white hover:underline cursor-pointer print:hidden"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Lightweight Search & Filter Row */}
          <div className="px-4 sm:px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-2.5 print:hidden">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guest name, booking ID, room, or source..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Sources</option>
              {availableSources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | ReservationStatus)}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked-in</option>
              <option value="checked_out">Checked-out</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </select>
          </div>

          {/* Crisp Bookings Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Booking ID</th>
                  <th className="py-3 px-4">Guest Name</th>
                  <th className="py-3 px-4">Room</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Check-In</th>
                  <th className="py-3 px-4">Check-Out</th>
                  <th className="py-3 px-4 text-center">Nights</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Payment</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500">
                      No bookings found for <strong>{period.label}</strong>. Try selecting{' '}
                      <button
                        type="button"
                        onClick={() => setPeriodPreset('all_time')}
                        className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                      >
                        All Time
                      </button>{' '}
                      or clearing your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((r) => {
                    const roomDisp = getReservationRoomDisplay(r, rooms);
                    const pay = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
                    const nights = r.nights || computeNights(r.checkInDate, r.checkOutDate);
                    const isOta = isOtaBookingChannel(r.channel);
                    const sourceLabel = formatBookingSourceLabel(r.channel);

                    const paymentBadgeClass =
                      pay.paymentStatus === 'Paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : pay.paymentStatus === 'Partial'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200';

                    const statusBadgeClass =
                      r.status === 'confirmed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : r.status === 'checked_in'
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : r.status === 'checked_out'
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : r.status === 'pending'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200';

                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50/90 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono-tabular font-bold text-[#1c46be] whitespace-nowrap">
                          {r.bookingRef}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                          {r.guestName}
                        </td>
                        <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                          {roomDisp.roomNumberLabel}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-emerald-800">{sourceLabel}</span>
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatReadableDate(r.checkInDate)}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatReadableDate(r.checkOutDate)}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-center font-semibold text-slate-800">
                          {nights}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-right whitespace-nowrap">
                          {isOta && pay.sourceCurrency === 'USD' ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="font-bold text-slate-900">
                                {formatUsd(pay.sourceTotalAmount)}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {formatNgn(pay.expectedPayoutNgn)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900">
                              {formatNgn(pay.totalAmount)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-semibold ${paymentBadgeClass}`}
                          >
                            {pay.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-semibold ${statusBadgeClass}`}
                          >
                            {RESERVATION_STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SIMPLE FINANCIAL SUMMARY (P&L) */}
      {activeTab === 'financials' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 border-t-4 border-t-emerald-600 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-slate-500">Total Revenue</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-emerald-700 mt-1">
                {formatNgn(financials.totalRevenue)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Rooms + POS ({financials.posOrderCount} orders)
              </p>
            </div>
            <div className="bg-white border border-slate-200 border-t-4 border-t-rose-500 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-slate-500">Operating Expenses</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-rose-700 mt-1">
                {formatNgn(financials.ledgerExpenses)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Posted ledger expenses</p>
            </div>
            <div className="bg-white border border-slate-200 border-t-4 border-t-[#1c46be] rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-slate-500">Net Operating Profit</p>
              <p
                className={`font-mono-tabular text-2xl font-extrabold mt-1 ${
                  financials.netProfit >= 0 ? 'text-[#061539]' : 'text-rose-700'
                }`}
              >
                {formatNgn(financials.netProfit)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Revenue minus expenses</p>
            </div>
            <div className="bg-white border border-slate-200 border-t-4 border-t-amber-500 rounded-xl p-4 shadow-xs">
              <p className="text-xs font-semibold text-slate-500">Outstanding Balances</p>
              <p className="font-mono-tabular text-2xl font-extrabold text-amber-800 mt-1">
                {formatNgn(financials.totalOutstandingNgn)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {financials.pendingFolios.length} open{' '}
                {financials.pendingFolios.length === 1 ? 'folio' : 'folios'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Ledger Categories Breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-[#0c562c] to-[#136f3b] px-4 py-3 text-white flex items-center justify-between">
                <h3 className="font-display text-sm font-bold">Revenue &amp; Expense Breakdown</h3>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('accounting')}
                    className="text-xs font-semibold text-white/90 hover:text-white hover:underline cursor-pointer"
                  >
                    Open Ledger →
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {financials.categories.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    No ledger entries recorded in {period.label}.
                  </div>
                ) : (
                  financials.categories.map((cat) => (
                    <div
                      key={`${cat.type}-${cat.category}`}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            cat.type === 'revenue' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-semibold text-slate-800 truncate">{cat.category}</span>
                        <span className="text-[11px] text-slate-400">({cat.count})</span>
                      </div>
                      <span
                        className={`font-mono-tabular font-bold shrink-0 ${
                          cat.type === 'revenue' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {cat.type === 'revenue' ? '+' : '-'}
                        {formatNgn(cat.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pending Payment Balances */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-[#061539] to-[#1c46be] px-4 py-3 text-white flex items-center justify-between">
                <h3 className="font-display text-sm font-bold">Outstanding Guest Balances</h3>
                <span className="font-mono-tabular text-xs font-bold text-amber-300">
                  {formatNgn(financials.totalOutstandingNgn)}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {financials.pendingFolios.length === 0 ? (
                  <div className="py-10 text-center text-xs text-emerald-700 font-medium">
                    All bookings in {period.label} are fully settled.
                  </div>
                ) : (
                  financials.pendingFolios.slice(0, 8).map(({ reservation, pay }) => (
                    <div
                      key={reservation.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {reservation.guestName}
                        </p>
                        <p className="font-mono-tabular text-[11px] text-slate-500">
                          {reservation.bookingRef} · {getReservationRoomDisplay(reservation, rooms).roomNumberLabel}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono-tabular font-bold text-rose-700">
                          {formatNgn(pay.balance)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Paid {formatNgn(pay.amountPaid)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROOMS & OPERATIONS SUMMARY */}
      {activeTab === 'rooms' && (
        <div className="space-y-5">
          {/* Compact Operations Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">POS / Dining Sales</p>
                <p className="font-mono-tabular text-lg font-extrabold text-[#061539]">
                  {formatNgn(financials.posRevenue)}
                </p>
                <p className="text-[11px] text-slate-500">{financials.posOrderCount} orders in period</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Housekeeping &amp; Maintenance</p>
                <p className="font-mono-tabular text-lg font-extrabold text-[#061539]">
                  {housekeepingTasks.filter((t) => t.status === 'completed').length}/
                  {housekeepingTasks.length} Done
                </p>
                <p className="text-[11px] text-slate-500">
                  {maintenanceTickets.filter((t) => t.status !== 'resolved').length} open maintenance tickets
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Guests &amp; Staff Directory</p>
                <p className="font-mono-tabular text-lg font-extrabold text-[#061539]">
                  {guests.length} Guests · {staffMembers.length} Staff
                </p>
                <p className="text-[11px] text-slate-500">{rooms.length} total rooms configured</p>
              </div>
            </div>
          </div>

          {/* Room-by-Room Performance Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-[#0c562c] to-[#136f3b] px-4 sm:px-5 py-3 text-white flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Room Performance ({rooms.length} Rooms)</h3>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('rooms')}
                  className="text-xs font-semibold text-white/90 hover:text-white hover:underline cursor-pointer"
                >
                  Manage Rooms →
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-4">Room</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Bookings</th>
                    <th className="py-3 px-4 text-center">Nights Sold</th>
                    <th className="py-3 px-4">Occupancy</th>
                    <th className="py-3 px-4 text-right">Avg Rate (ADR)</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                  {roomPerformance.map((row) => (
                    <tr key={row.room.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono-tabular font-bold text-[#061539]">
                        {row.room.roomNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{row.room.roomType}</td>
                      <td className="py-3 px-4 font-mono-tabular text-center font-semibold text-slate-800">
                        {row.bookings}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-center text-slate-700">
                        {row.nights}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${row.occPct}%` }}
                            />
                          </div>
                          <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                            {row.occPct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-right text-slate-700">
                        {formatNgn(row.adr)}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-right font-bold text-emerald-700">
                        {formatNgn(row.revenueNgn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GUEST REPORT */}
      {activeTab === 'guests' && (() => {
        const guestMetrics = guests.map((g) => {
          const gEmail = (g.email || '').trim().toLowerCase();
          const gPhone = (g.phone || '').replace(/\s+/g, '');
          const gName = g.fullName.trim().toLowerCase();
          const guestRes = reservations.filter((r) => {
            if (r.status === 'cancelled') return false;
            if (gEmail && (r.guestEmail || '').trim().toLowerCase() === gEmail) return true;
            if (gPhone && (r.guestPhone || '').replace(/\s+/g, '') === gPhone) return true;
            return r.guestName.trim().toLowerCase() === gName;
          });
          const totalSpendNgn = guestRes.reduce(
            (sum, r) => sum + getReservationEffectiveRevenueNgn(r, property.usdExchangeRateNgn),
            0
          );
          const stayCount = Math.max(g.totalStays || 0, guestRes.length);
          const lastStay = guestRes
            .map((r) => r.checkInDate)
            .sort((a, b) => b.localeCompare(a))[0];
          return {
            guest: g,
            stayCount,
            totalSpendNgn,
            lastStay,
          };
        });
        const repeatGuests = guestMetrics.filter((m) => m.stayCount > 1).length;
        const vipGuests = guests.filter((g) => g.vipTier !== 'Standard').length;
        const verifiedKyc = guests.filter((g) => Boolean(g.idNumber && g.idNumber.trim().length >= 3)).length;
        const q = searchQuery.trim().toLowerCase();
        const filteredGuestMetrics = guestMetrics
          .filter((m) => {
            if (!q) return true;
            return (
              m.guest.fullName.toLowerCase().includes(q) ||
              (m.guest.email || '').toLowerCase().includes(q) ||
              (m.guest.phone || '').toLowerCase().includes(q) ||
              (m.guest.nationality || '').toLowerCase().includes(q)
            );
          })
          .sort((a, b) => b.totalSpendNgn - a.totalSpendNgn);

        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-xs font-semibold text-slate-500">Total Registered Guests</p>
                <p className="font-mono-tabular text-2xl font-extrabold text-slate-900 mt-1">
                  {guests.length}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-xs font-semibold text-slate-500">Repeat Guests</p>
                <p className="font-mono-tabular text-2xl font-extrabold text-emerald-700 mt-1">
                  {repeatGuests}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-xs font-semibold text-slate-500">VIP / Corporate Tier</p>
                <p className="font-mono-tabular text-2xl font-extrabold text-blue-700 mt-1">
                  {vipGuests}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <p className="text-xs font-semibold text-slate-500">KYC ID On File</p>
                <p className="font-mono-tabular text-2xl font-extrabold text-violet-700 mt-1">
                  {verifiedKyc}
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-[#0c562c] to-[#136f3b] px-4 sm:px-5 py-3 text-white flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold">
                  Guest Activity &amp; Lifetime Value ({filteredGuestMetrics.length})
                </h3>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('guests')}
                    className="text-xs font-semibold text-white/90 hover:text-white hover:underline cursor-pointer"
                  >
                    Open Guest Directory →
                  </button>
                )}
              </div>

              <div className="px-4 sm:px-5 py-3 bg-slate-50/70 border-b border-slate-200 print:hidden">
                <div className="relative max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter guests by name, phone, email or country..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">Guest Name</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Nationality</th>
                      <th className="py-3 px-4">Tier</th>
                      <th className="py-3 px-4 text-center">Stays</th>
                      <th className="py-3 px-4">Last Check-In</th>
                      <th className="py-3 px-4 text-right">Lifetime Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                    {filteredGuestMetrics.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          No guest profiles match your filter yet.
                        </td>
                      </tr>
                    ) : (
                      filteredGuestMetrics.map(({ guest, stayCount, totalSpendNgn, lastStay }) => (
                        <tr key={guest.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            {guest.fullName}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <span className="block font-mono-tabular text-xs">{guest.phone || '—'}</span>
                            {guest.email && (
                              <span className="block text-[11px] text-slate-400">{guest.email}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                            {guest.nationality || '—'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                guest.vipTier === 'Gold'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : guest.vipTier === 'Diplomatic'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : guest.vipTier === 'Silver'
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {guest.vipTier}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-center font-semibold text-slate-800">
                            {stayCount}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                            {lastStay ? formatReadableDate(lastStay) : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-right font-bold text-emerald-700 whitespace-nowrap">
                            {formatNgn(totalSpendNgn)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Clean Bottom Report Footer Strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 text-slate-600">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Report generated on:{' '}
            <strong className="font-mono-tabular text-slate-800">{generatedTimestamp}</strong>
          </span>
        </span>
        <span className="font-semibold text-slate-700">
          Total Revenue (Bookings):{' '}
          <strong className="font-mono-tabular text-sm font-extrabold text-[#061539]">
            {formatNgn(kpis.totalBookingRevenueNgn)}
          </strong>
        </span>
      </div>
    </div>
  );
};
