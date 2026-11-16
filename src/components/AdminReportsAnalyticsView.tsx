import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BedDouble,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Package,
  PieChart as PieChartIcon,
  Printer,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useCms } from '../context/CmsContext';
import {
  AttendanceRecord,
  BlockedDateRecord,
  formatBookingSourceLabel,
  formatNgn,
  getReservationBookedDate,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  getRoomSection,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  LedgerEntryRecord,
  MaintenanceTicketRecord,
  matchesBookingSourceFilter,
  OtaIntegrationRecord,
  PayrollRunRecord,
  PosOrderRecord,
  PropertyRecord,
  PurchaseOrderRecord,
  ReservationRecord,
  RESERVATION_STATUS_LABELS,
  ReservationStatus,
  RICHGATES_PROPERTY_INFO,
  RoomRecord,
  ShiftScheduleRecord,
  sortRoomsByNumber,
  StaffMemberRecord,
  StaffRole,
} from '../types/pms';

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
  onNotify: (msg: string) => void;
}

type DatePreset =
  | 'today'
  | 'yesterday'
  | 'single_day'
  | 'last_7'
  | 'this_month'
  | 'last_30'
  | 'all_time'
  | 'custom';
type ReportTab =
  | 'overview'
  | 'daily_bookings'
  | 'pnl'
  | 'rooms'
  | 'sources'
  | 'pos_dept'
  | 'inventory_staff';

const CHART_PALETTE = [
  '#1c46be',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#e11d48',
  '#0891b2',
  '#4f46e5',
  '#64748b',
];

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function diffDaysInclusive(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function extractCreatedIso(createdAt?: { toDate?: () => Date } | string, fallback?: string): string {
  if (createdAt && typeof createdAt === 'object' && typeof createdAt.toDate === 'function') {
    try {
      return createdAt.toDate().toISOString().slice(0, 10);
    } catch {
      // ignore
    }
  }
  if (typeof createdAt === 'string' && createdAt.length >= 10) {
    return createdAt.slice(0, 10);
  }
  return fallback || new Date().toISOString().slice(0, 10);
}

function countOverlapNights(
  resCheckIn: string,
  resCheckOut: string,
  periodStart: string,
  periodEnd: string
): number {
  const rStart = Date.parse(`${resCheckIn}T00:00:00Z`);
  const rEnd = Date.parse(`${resCheckOut}T00:00:00Z`);
  const pStart = Date.parse(`${periodStart}T00:00:00Z`);
  const pEndExcl = Date.parse(`${addDaysIso(periodEnd, 1)}T00:00:00Z`);
  if (!Number.isFinite(rStart) || !Number.isFinite(rEnd) || rEnd <= rStart) return 0;
  const overlapStart = Math.max(rStart, pStart);
  const overlapEnd = Math.min(rEnd, pEndExcl);
  if (overlapEnd <= overlapStart) return 0;
  return Math.round((overlapEnd - overlapStart) / 86400000);
}

function formatPdfNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-US')}`;
}

function formatCompactNgn(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₦${Math.round(amount / 1_000)}k`;
  return `₦${Math.round(amount)}`;
}

function computeDelta(current: number, previous: number | null): {
  label: string;
  positive: boolean | null;
} {
  if (previous === null) return { label: 'All-time scope', positive: null };
  if (previous === 0) {
    if (current === 0) return { label: '0% vs prior', positive: null };
    return { label: 'New activity vs ₦0 prior', positive: current > 0 };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct > 0 ? '+' : '';
  return {
    label: `${sign}${pct.toFixed(1)}% vs prior`,
    positive: pct >= 0,
  };
}

export const AdminReportsAnalyticsView: React.FC<AdminReportsAnalyticsViewProps> = ({
  property,
  activeRole,
  rooms,
  reservations,
  blockedDates,
  guests,
  ledgerEntries,
  posOrders,
  inventoryItems,
  purchaseOrders,
  staffMembers,
  shifts,
  attendance,
  payrollRuns,
  housekeepingTasks,
  maintenanceTickets,
  otaChannels,
  onNotify,
}) => {
  const { cms } = useCms();
  const isAuthorizedAdmin = activeRole === 'pch_admin' || activeRole === 'property_admin';
  const todayIso = new Date().toISOString().slice(0, 10);

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [singleDay, setSingleDay] = useState(todayIso);
  const [customStart, setCustomStart] = useState(`${todayIso.slice(0, 8)}01`);
  const [customEnd, setCustomEnd] = useState(todayIso);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

  // Management Search & Quick Filters for Reports & Daily Room Bookings
  const [reportSearch, setReportSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | ReservationStatus>('all');
  const [bookingSourceFilter, setBookingSourceFilter] = useState<string>('ALL');
  const [bookingRoomFilter, setBookingRoomFilter] = useState<string>('ALL');

  // Interactive chart toggles & hover states
  const [lineMode, setLineMode] = useState<'financial' | 'hospitality'>('financial');
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [barMode, setBarMode] = useState<'category' | 'rooms'>('category');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [pieMode, setPieMode] = useState<'sources' | 'expenses' | 'inventory'>('sources');
  const [selectedPieIndex, setSelectedPieIndex] = useState<number | null>(null);

  // Determine exact active date range & equal-length prior comparison window
  const dateWindow = useMemo(() => {
    if (preset === 'today') {
      return {
        start: todayIso,
        end: todayIso,
        prevStart: addDaysIso(todayIso, -1),
        prevEnd: addDaysIso(todayIso, -1),
        label: `Today (${todayIso})`,
      };
    }
    if (preset === 'yesterday') {
      const yIso = addDaysIso(todayIso, -1);
      return {
        start: yIso,
        end: yIso,
        prevStart: addDaysIso(yIso, -1),
        prevEnd: addDaysIso(yIso, -1),
        label: `Yesterday (${yIso})`,
      };
    }
    if (preset === 'single_day') {
      const target = singleDay || todayIso;
      return {
        start: target,
        end: target,
        prevStart: addDaysIso(target, -1),
        prevEnd: addDaysIso(target, -1),
        label: `Single Day (${target})`,
      };
    }
    if (preset === 'last_7') {
      const start = addDaysIso(todayIso, -6);
      return {
        start,
        end: todayIso,
        prevStart: addDaysIso(start, -7),
        prevEnd: addDaysIso(start, -1),
        label: `Last 7 Days (${start} to ${todayIso})`,
      };
    }
    if (preset === 'last_30') {
      const start = addDaysIso(todayIso, -29);
      return {
        start,
        end: todayIso,
        prevStart: addDaysIso(start, -30),
        prevEnd: addDaysIso(start, -1),
        label: `Last 30 Days (${start} to ${todayIso})`,
      };
    }
    if (preset === 'this_month') {
      const start = `${todayIso.slice(0, 8)}01`;
      const days = diffDaysInclusive(start, todayIso);
      return {
        start,
        end: todayIso,
        prevStart: addDaysIso(start, -days),
        prevEnd: addDaysIso(start, -1),
        label: `Month-to-Date (${start} to ${todayIso})`,
      };
    }
    if (preset === 'custom') {
      const safeStart = customStart || todayIso;
      const safeEnd = customEnd >= safeStart ? customEnd : safeStart;
      const days = diffDaysInclusive(safeStart, safeEnd);
      return {
        start: safeStart,
        end: safeEnd,
        prevStart: addDaysIso(safeStart, -days),
        prevEnd: addDaysIso(safeStart, -1),
        label: `${safeStart} to ${safeEnd}`,
      };
    }

    // All Time: span across earliest and latest dates seen in live records
    const allDates: string[] = [todayIso];
    ledgerEntries.forEach((l) => l.entryDate && allDates.push(l.entryDate));
    reservations.forEach((r) => {
      if (r.checkInDate) allDates.push(r.checkInDate);
      if (r.checkOutDate) allDates.push(r.checkOutDate);
    });
    posOrders.forEach((p) => {
      const d = p.orderDate || extractCreatedIso(p.createdAt, todayIso);
      if (d) allDates.push(d);
    });
    allDates.sort();
    return {
      start: allDates[0] || todayIso,
      end: allDates[allDates.length - 1] || todayIso,
      prevStart: null as string | null,
      prevEnd: null as string | null,
      label: `All Time (${allDates[0] || todayIso} to ${allDates[allDates.length - 1] || todayIso})`,
    };
  }, [preset, singleDay, customStart, customEnd, todayIso, ledgerEntries, reservations, posOrders]);

  const periodDays = useMemo(
    () => diffDaysInclusive(dateWindow.start, dateWindow.end),
    [dateWindow.start, dateWindow.end]
  );

  // Core metric calculator for any [start, end] date window — single source of truth for current & prior period
  const computeWindowSnapshot = useMemo(() => {
    const sortedRooms = sortRoomsByNumber(rooms);
    const totalRooms = sortedRooms.length;
    const commissionMap = new Map<string, number>();
    otaChannels.forEach((ch) => {
      commissionMap.set(formatBookingSourceLabel(ch.channelName), ch.commissionPct);
    });

    return (startIso: string, endIso: string) => {
      const days = diffDaysInclusive(startIso, endIso);
      const inRange = (d: string) => d >= startIso && d <= endIso;

      // 1. Ledger Entries in Period
      const periodLedger = ledgerEntries.filter((e) => inRange(e.entryDate));
      const revenueEntries = periodLedger.filter((e) => e.entryType === 'revenue');
      const expenseEntries = periodLedger.filter((e) => e.entryType === 'expense');

      const totalRevenueNgn = revenueEntries.reduce((s, e) => s + (e.amountNgn || 0), 0);
      const totalExpensesNgn = expenseEntries.reduce((s, e) => s + (e.amountNgn || 0), 0);
      const totalVatNgn = periodLedger.reduce((s, e) => s + (e.vatNgn || 0), 0);
      const netProfitNgn = totalRevenueNgn - totalExpensesNgn;
      const profitMarginPct =
        totalRevenueNgn > 0 ? (netProfitNgn / totalRevenueNgn) * 100 : 0;

      // Revenue & Expense Breakdown by Ledger Category
      const ledgerCategories: LedgerEntryRecord['category'][] = [
        'Room Accommodation',
        'Restaurant & Bar',
        'Procurement',
        'Payroll',
        'Utilities & Diesel',
        'Maintenance',
        'OTA Commission',
        'Other',
      ];
      const pnlByCategory = ledgerCategories.map((cat) => {
        const rev = revenueEntries
          .filter((e) => e.category === cat)
          .reduce((s, e) => s + (e.amountNgn || 0), 0);
        const exp = expenseEntries
          .filter((e) => e.category === cat)
          .reduce((s, e) => s + (e.amountNgn || 0), 0);
        return { category: cat, revenueNgn: rev, expenseNgn: exp, netNgn: rev - exp };
      });

      // 2. Reservations, Room Nights, Occupancy, ADR, RevPAR
      const activeStayRes = reservations.filter(
        (r) => r.status !== 'cancelled' && r.status !== 'no_show'
      );

      let occupiedRoomNights = 0;
      let earnedRoomRevenueNgn = 0;
      const roomNightRevenueByRoomId = new Map<
        string,
        { occupiedNights: number; roomRevenueNgn: number; staysCount: number }
      >();

      sortedRooms.forEach((rm) => {
        roomNightRevenueByRoomId.set(rm.id, {
          occupiedNights: 0,
          roomRevenueNgn: 0,
          staysCount: 0,
        });
      });

      activeStayRes.forEach((res) => {
        const overlap = countOverlapNights(res.checkInDate, res.checkOutDate, startIso, endIso);
        if (overlap <= 0) return;
        const rate =
          res.nightlyRateNgn > 0
            ? res.nightlyRateNgn
            : res.nights > 0
              ? Math.round(res.roomChargesNgn / res.nights)
              : 0;
        const earned = rate * overlap;
        occupiedRoomNights += overlap;
        earnedRoomRevenueNgn += earned;

        if (res.roomId && roomNightRevenueByRoomId.has(res.roomId)) {
          const prev = roomNightRevenueByRoomId.get(res.roomId)!;
          roomNightRevenueByRoomId.set(res.roomId, {
            occupiedNights: prev.occupiedNights + overlap,
            roomRevenueNgn: prev.roomRevenueNgn + earned,
            staysCount: prev.staysCount + 1,
          });
        }
      });

      const availableRoomNights = totalRooms * days;
      const occupancyPct =
        availableRoomNights > 0 ? Math.min(100, (occupiedRoomNights / availableRoomNights) * 100) : 0;
      const adrNgn = occupiedRoomNights > 0 ? earnedRoomRevenueNgn / occupiedRoomNights : 0;
      const revparNgn = availableRoomNights > 0 ? earnedRoomRevenueNgn / availableRoomNights : 0;

      // Reservations created or checking-in during period
      const periodReservations = reservations.filter((r) => {
        const booked = getReservationBookedDate(r);
        const stayOverlap = countOverlapNights(r.checkInDate, r.checkOutDate, startIso, endIso) > 0;
        return inRange(booked) || inRange(r.checkInDate) || stayOverlap;
      });

      const reservationTotalValueNgn = periodReservations
        .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
        .reduce((s, r) => s + getReservationPaymentSummary(r).totalAmount, 0);
      const reservationCollectedNgn = periodReservations.reduce(
        (s, r) => s + getReservationPaymentSummary(r).amountPaid,
        0
      );
      const reservationBalanceNgn = periodReservations
        .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
        .reduce((s, r) => s + getReservationPaymentSummary(r).balance, 0);

      // 3. Booking Sources Analysis
      const sourceAgg = new Map<
        string,
        {
          source: string;
          bookings: number;
          nights: number;
          totalValueNgn: number;
          collectedNgn: number;
          commissionPct: number;
          estCommissionNgn: number;
        }
      >();

      periodReservations
        .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
        .forEach((r) => {
          const source = formatBookingSourceLabel(r.channel);
          const pay = getReservationPaymentSummary(r);
          const pct = commissionMap.get(source) ?? 0;
          const prev = sourceAgg.get(source) || {
            source,
            bookings: 0,
            nights: 0,
            totalValueNgn: 0,
            collectedNgn: 0,
            commissionPct: pct,
            estCommissionNgn: 0,
          };
          const commNgn = Math.round((pay.totalAmount * pct) / 100);
          sourceAgg.set(source, {
            source,
            bookings: prev.bookings + 1,
            nights: prev.nights + (r.nights || 1),
            totalValueNgn: prev.totalValueNgn + pay.totalAmount,
            collectedNgn: prev.collectedNgn + pay.amountPaid,
            commissionPct: pct,
            estCommissionNgn: prev.estCommissionNgn + commNgn,
          });
        });

      const bookingSources = Array.from(sourceAgg.values()).sort(
        (a, b) => b.totalValueNgn - a.totalValueNgn
      );

      // 4. POS Sales Analysis
      const periodPosOrders = posOrders.filter((ord) => {
        const d = ord.orderDate || extractCreatedIso(ord.createdAt, todayIso);
        return inRange(d);
      });
      const posSubtotalNgn = periodPosOrders.reduce((s, o) => s + (o.subtotalNgn || 0), 0);
      const posVatNgn = periodPosOrders.reduce((s, o) => s + (o.vatNgn || 0), 0);
      const posTotalSalesNgn = periodPosOrders.reduce((s, o) => s + (o.totalNgn || 0), 0);
      const posItemsSold = periodPosOrders.reduce((s, o) => s + (o.itemCount || 0), 0);

      // 5. Departmental Breakdown (Serviced Apartments vs Hotel Rooms)
      const servicedRooms = sortedRooms.filter((r) => getRoomSection(r) === 'Serviced Apartment');
      const hotelRooms = sortedRooms.filter((r) => getRoomSection(r) === 'Hotel Rooms');

      const calcSectionPerf = (label: string, sectionRooms: RoomRecord[]) => {
        let occNights = 0;
        let revNgn = 0;
        sectionRooms.forEach((rm) => {
          const stat = roomNightRevenueByRoomId.get(rm.id);
          if (stat) {
            occNights += stat.occupiedNights;
            revNgn += stat.roomRevenueNgn;
          }
        });
        const availNights = sectionRooms.length * days;
        return {
          department: label,
          unitCount: sectionRooms.length,
          availableNights: availNights,
          occupiedNights: occNights,
          occupancyPct: availNights > 0 ? (occNights / availNights) * 100 : 0,
          revenueNgn: revNgn,
          adrNgn: occNights > 0 ? revNgn / occNights : 0,
          revparNgn: availNights > 0 ? revNgn / availNights : 0,
        };
      };

      const sectionPerformance = [
        calcSectionPerf('Serviced Apartment Section', servicedRooms),
        calcSectionPerf('Hotel Rooms Section', hotelRooms),
      ];

      // 6. Room-by-Room Breakdown
      const roomBreakdown = sortedRooms.map((rm) => {
        const stat = roomNightRevenueByRoomId.get(rm.id) || {
          occupiedNights: 0,
          roomRevenueNgn: 0,
          staysCount: 0,
        };
        const occPct = days > 0 ? Math.min(100, (stat.occupiedNights / days) * 100) : 0;
        return {
          room: rm,
          section: getRoomSection(rm),
          staysCount: stat.staysCount,
          occupiedNights: stat.occupiedNights,
          availableNights: days,
          occupancyPct: occPct,
          roomRevenueNgn: stat.roomRevenueNgn,
          adrNgn: stat.occupiedNights > 0 ? stat.roomRevenueNgn / stat.occupiedNights : rm.nightlyRateNgn,
          revparNgn: days > 0 ? stat.roomRevenueNgn / days : 0,
        };
      });

      // 7. Shifts, Attendance & Payroll in Period
      const periodShifts = shifts.filter((s) => inRange(s.shiftDate));
      const periodAttendance = attendance.filter((a) => inRange(a.date));
      const periodPayroll = payrollRuns.filter((pr) =>
        pr.payDate ? inRange(pr.payDate) : true
      );
      const payrollCostNgn = periodPayroll.reduce((s, p) => s + (p.grossPayNgn || 0), 0);

      // 8. Purchase Orders in Period
      const periodPOs = purchaseOrders.filter((po) =>
        po.expectedDate ? inRange(po.expectedDate) : true
      );

      // 9. Daily Time-Series (up to 31 points cleanly bucketed if range > 31 days)
      const dailyPoints: Array<{
        date: string;
        label: string;
        revenueNgn: number;
        expenseNgn: number;
        netNgn: number;
        occupancyPct: number;
        revparNgn: number;
      }> = [];

      const maxSeriesDays = Math.min(days, 31);
      const seriesStart = days > 31 ? addDaysIso(endIso, -30) : startIso;
      for (let i = 0; i < maxSeriesDays; i += 1) {
        const dIso = addDaysIso(seriesStart, i);
        const revDay = revenueEntries
          .filter((e) => e.entryDate === dIso)
          .reduce((s, e) => s + (e.amountNgn || 0), 0);
        const expDay = expenseEntries
          .filter((e) => e.entryDate === dIso)
          .reduce((s, e) => s + (e.amountNgn || 0), 0);

        let occDay = 0;
        let roomRevDay = 0;
        activeStayRes.forEach((r) => {
          const ov = countOverlapNights(r.checkInDate, r.checkOutDate, dIso, dIso);
          if (ov > 0) {
            occDay += 1;
            const rt = r.nightlyRateNgn > 0 ? r.nightlyRateNgn : r.nights > 0 ? r.roomChargesNgn / r.nights : 0;
            roomRevDay += rt;
          }
        });
        const occPctDay = totalRooms > 0 ? Math.min(100, (occDay / totalRooms) * 100) : 0;
        const revparDay = totalRooms > 0 ? roomRevDay / totalRooms : 0;

        dailyPoints.push({
          date: dIso,
          label: dIso.slice(5),
          revenueNgn: revDay,
          expenseNgn: expDay,
          netNgn: revDay - expDay,
          occupancyPct: occPctDay,
          revparNgn: revparDay,
        });
      }

      return {
        days,
        totalRevenueNgn,
        totalExpensesNgn,
        totalVatNgn,
        netProfitNgn,
        profitMarginPct,
        pnlByCategory,
        occupiedRoomNights,
        availableRoomNights,
        earnedRoomRevenueNgn,
        occupancyPct,
        adrNgn,
        revparNgn,
        periodReservations,
        reservationTotalValueNgn,
        reservationCollectedNgn,
        reservationBalanceNgn,
        bookingSources,
        periodPosOrders,
        posSubtotalNgn,
        posVatNgn,
        posTotalSalesNgn,
        posItemsSold,
        sectionPerformance,
        roomBreakdown,
        periodShifts,
        periodAttendance,
        periodPayroll,
        payrollCostNgn,
        periodPOs,
        dailyPoints,
      };
    };
  }, [
    rooms,
    otaChannels,
    ledgerEntries,
    reservations,
    posOrders,
    shifts,
    attendance,
    payrollRuns,
    purchaseOrders,
    todayIso,
  ]);

  const current = useMemo(
    () => computeWindowSnapshot(dateWindow.start, dateWindow.end),
    [computeWindowSnapshot, dateWindow.start, dateWindow.end]
  );

  const previous = useMemo(() => {
    if (!compareEnabled || !dateWindow.prevStart || !dateWindow.prevEnd) return null;
    return computeWindowSnapshot(dateWindow.prevStart, dateWindow.prevEnd);
  }, [compareEnabled, computeWindowSnapshot, dateWindow.prevStart, dateWindow.prevEnd]);

  // Live Stock Inventory Valuation (Current Asset Snapshot)
  const inventoryMetrics = useMemo(() => {
    const totalValuationNgn = inventoryItems.reduce(
      (s, i) => s + (i.quantityOnHand || 0) * (i.unitCostNgn || 0),
      0
    );
    const lowStockItems = inventoryItems.filter((i) => i.quantityOnHand <= i.reorderLevel);
    const categories: InventoryItemRecord['category'][] = [
      'Kitchen & Pantry',
      'Bar & Beverage',
      'Housekeeping Linen & Amenities',
      'Engineering & Diesel',
    ];
    const byCategory = categories.map((cat) => {
      const items = inventoryItems.filter((i) => i.category === cat);
      return {
        category: cat,
        skuCount: items.length,
        totalUnits: items.reduce((s, i) => s + (i.quantityOnHand || 0), 0),
        valuationNgn: items.reduce(
          (s, i) => s + (i.quantityOnHand || 0) * (i.unitCostNgn || 0),
          0
        ),
        lowStockCount: items.filter((i) => i.quantityOnHand <= i.reorderLevel).length,
      };
    });

    const totalPoCommittedNgn = purchaseOrders
      .filter((p) => p.status !== 'cancelled')
      .reduce((s, p) => s + (p.totalCostNgn || 0), 0);
    const receivedPoNgn = purchaseOrders
      .filter((p) => p.status === 'received')
      .reduce((s, p) => s + (p.totalCostNgn || 0), 0);
    const pendingPoNgn = purchaseOrders
      .filter((p) => p.status === 'draft' || p.status === 'approved')
      .reduce((s, p) => s + (p.totalCostNgn || 0), 0);

    return {
      totalValuationNgn,
      lowStockItems,
      byCategory,
      totalPoCommittedNgn,
      receivedPoNgn,
      pendingPoNgn,
    };
  }, [inventoryItems, purchaseOrders]);

  // Housekeeping, Maintenance, POS Breakdown & Staff Performance
  const opsMetrics = useMemo(() => {
    const hkCompleted = housekeepingTasks.filter(
      (t) => t.status === 'completed' || t.status === 'inspected'
    ).length;
    const hkRate =
      housekeepingTasks.length > 0 ? (hkCompleted / housekeepingTasks.length) * 100 : 0;

    const mntResolved = maintenanceTickets.filter((t) => t.status === 'resolved').length;
    const mntOpen = maintenanceTickets.filter((t) => t.status !== 'resolved').length;
    const mntEstCostNgn = maintenanceTickets.reduce((s, t) => s + (t.estimatedCostNgn || 0), 0);

    const posByService = (['Dine-In', 'Room Service', 'Bar Lounge', 'Takeaway'] as const).map(
      (svc) => {
        const list = current.periodPosOrders.filter((o) => o.serviceType === svc);
        return {
          serviceType: svc,
          orders: list.length,
          items: list.reduce((s, o) => s + (o.itemCount || 0), 0),
          totalNgn: list.reduce((s, o) => s + (o.totalNgn || 0), 0),
        };
      }
    );

    const posByMethod = (['Cash NGN', 'Card POS', 'Bank Transfer', 'Room Folio'] as const).map(
      (method) => {
        const list = current.periodPosOrders.filter((o) => o.paymentMethod === method);
        return {
          method,
          orders: list.length,
          totalNgn: list.reduce((s, o) => s + (o.totalNgn || 0), 0),
        };
      }
    );

    const shiftsCompleted = current.periodShifts.filter((s) => s.status === 'completed').length;
    const shiftCompletionPct =
      current.periodShifts.length > 0 ? (shiftsCompleted / current.periodShifts.length) * 100 : 0;

    const attPresent = current.periodAttendance.filter(
      (a) => a.status === 'present' || a.status === 'clocked_out'
    ).length;
    const attLate = current.periodAttendance.filter((a) => a.status === 'late').length;

    const staffScorecard = staffMembers.map((st) => {
      const stShifts = current.periodShifts.filter((sh) => sh.staffId === st.id);
      const stCompleted = stShifts.filter((sh) => sh.status === 'completed').length;
      const stAtt = current.periodAttendance.filter((a) => a.staffId === st.id);
      const stOnTime = stAtt.filter((a) => a.status === 'present' || a.status === 'clocked_out').length;
      return {
        staff: st,
        monthlyCompNgn: (st.monthlyBaseSalaryNgn || 0) + (st.monthlyAllowanceNgn || 0),
        shiftsAssigned: stShifts.length,
        shiftsCompleted: stCompleted,
        attendanceLogs: stAtt.length,
        onTimeCount: stOnTime,
      };
    });

    const totalMonthlySalaryBillNgn = staffMembers
      .filter((s) => s.employmentStatus === 'active')
      .reduce((s, st) => s + (st.monthlyBaseSalaryNgn || 0) + (st.monthlyAllowanceNgn || 0), 0);

    return {
      hkCompleted,
      hkRate,
      mntResolved,
      mntOpen,
      mntEstCostNgn,
      posByService,
      posByMethod,
      shiftsCompleted,
      shiftCompletionPct,
      attPresent,
      attLate,
      staffScorecard,
      totalMonthlySalaryBillNgn,
    };
  }, [
    housekeepingTasks,
    maintenanceTickets,
    current.periodPosOrders,
    current.periodShifts,
    current.periodAttendance,
    staffMembers,
  ]);

  // Pie chart dataset based on interactive toggle
  const pieSlices = useMemo(() => {
    let raw: Array<{ label: string; value: number }> = [];
    if (pieMode === 'sources') {
      raw = current.bookingSources.map((s) => ({ label: s.source, value: s.totalValueNgn }));
    } else if (pieMode === 'expenses') {
      raw = current.pnlByCategory
        .filter((c) => c.expenseNgn > 0)
        .map((c) => ({ label: c.category, value: c.expenseNgn }));
    } else {
      raw = inventoryMetrics.byCategory
        .filter((c) => c.valuationNgn > 0)
        .map((c) => ({ label: c.category, value: c.valuationNgn }));
    }
    const total = raw.reduce((s, r) => s + r.value, 0);
    let cumulative = 0;
    return raw.map((r, idx) => {
      const share = total > 0 ? r.value / total : 0;
      const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      cumulative += share;
      const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      return {
        ...r,
        sharePct: share * 100,
        startAngle,
        endAngle,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
        total,
      };
    });
  }, [pieMode, current.bookingSources, current.pnlByCategory, inventoryMetrics.byCategory]);

  // Bar chart dataset based on interactive toggle
  const barData = useMemo(() => {
    if (barMode === 'category') {
      return current.pnlByCategory
        .filter((c) => c.revenueNgn > 0 || c.expenseNgn > 0)
        .map((c) => ({
          label: c.category.replace('Restaurant & Bar', 'POS / F&B').replace('Room Accommodation', 'Rooms'),
          fullLabel: c.category,
          primary: c.revenueNgn,
          secondary: c.expenseNgn,
          primaryLabel: 'Revenue',
          secondaryLabel: 'Expense',
        }));
    }
    return current.roomBreakdown.map((rb) => ({
      label: rb.room.roomNumber,
      fullLabel: `${rb.room.roomNumber} (${rb.room.roomType})`,
      primary: rb.roomRevenueNgn,
      secondary: Math.round(rb.occupancyPct),
      primaryLabel: 'Earned Revenue',
      secondaryLabel: 'Occupancy %',
    }));
  }, [barMode, current.pnlByCategory, current.roomBreakdown]);

  const sortedRoomsList = useMemo(() => sortRoomsByNumber(rooms), [rooms]);

  // Searchable & Filterable Room Bookings Daily Report dataset
  const dailyBookingsDataset = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    const rows = current.periodReservations
      .map((res) => {
        const bookedDate = getReservationBookedDate(res);
        const roomDisplay = getReservationRoomDisplay(res, rooms);
        const payment = getReservationPaymentSummary(res);
        const sourceLabel = formatBookingSourceLabel(res.channel);
        return {
          res,
          bookedDate,
          roomDisplay,
          payment,
          sourceLabel,
        };
      })
      .filter(({ res, bookedDate, roomDisplay, payment, sourceLabel }) => {
        if (bookingStatusFilter !== 'all' && res.status !== bookingStatusFilter) return false;
        if (bookingSourceFilter !== 'ALL' && !matchesBookingSourceFilter(res.channel, bookingSourceFilter)) {
          return false;
        }
        if (bookingRoomFilter !== 'ALL' && roomDisplay.roomNumberLabel !== bookingRoomFilter) {
          return false;
        }
        if (q) {
          const hay = [
            res.bookingRef,
            res.guestName,
            res.guestPhone || '',
            roomDisplay.roomNumberLabel,
            roomDisplay.roomTypeLabel,
            sourceLabel,
            res.checkInDate,
            res.checkOutDate,
            bookedDate,
            payment.paymentStatus,
            RESERVATION_STATUS_LABELS[res.status] || res.status,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          b.bookedDate.localeCompare(a.bookedDate) ||
          b.res.checkInDate.localeCompare(a.res.checkInDate) ||
          a.res.guestName.localeCompare(b.res.guestName)
      );

    // Day-by-day rollup within active date window
    const dateSet = new Set<string>();
    if (periodDays <= 45) {
      for (let i = 0; i < periodDays; i += 1) {
        dateSet.add(addDaysIso(dateWindow.start, i));
      }
    } else {
      rows.forEach(({ res, bookedDate }) => {
        if (bookedDate >= dateWindow.start && bookedDate <= dateWindow.end) dateSet.add(bookedDate);
        if (res.checkInDate >= dateWindow.start && res.checkInDate <= dateWindow.end) {
          dateSet.add(res.checkInDate);
        }
        if (res.checkOutDate >= dateWindow.start && res.checkOutDate <= dateWindow.end) {
          dateSet.add(res.checkOutDate);
        }
      });
    }

    const totalSuites = Math.max(1, sortedRoomsList.length);
    const rollup = Array.from(dateSet)
      .sort((a, b) => b.localeCompare(a))
      .map((dateIso) => {
        const bookedOnDay = rows.filter((x) => x.bookedDate === dateIso);
        const arrivalsOnDay = rows.filter(
          (x) => x.res.checkInDate === dateIso && x.res.status !== 'cancelled' && x.res.status !== 'no_show'
        );
        const departuresOnDay = rows.filter(
          (x) => x.res.checkOutDate === dateIso && x.res.status !== 'cancelled' && x.res.status !== 'no_show'
        );
        const stayingOnDay = rows.filter(
          (x) =>
            x.res.status !== 'cancelled' &&
            x.res.status !== 'no_show' &&
            countOverlapNights(x.res.checkInDate, x.res.checkOutDate, dateIso, dateIso) > 0
        );

        const activeBookedOnDay = bookedOnDay.filter(
          (x) => x.res.status !== 'cancelled' && x.res.status !== 'no_show'
        );
        const bookingValueNgn = activeBookedOnDay.reduce((s, x) => s + x.payment.totalAmount, 0);
        const collectedNgn = bookedOnDay.reduce((s, x) => s + x.payment.amountPaid, 0);
        const balanceNgn = activeBookedOnDay.reduce((s, x) => s + x.payment.balance, 0);

        return {
          dateIso,
          bookingsCreated: bookedOnDay.length,
          arrivalsCount: arrivalsOnDay.length,
          departuresCount: departuresOnDay.length,
          occupiedSuites: stayingOnDay.length,
          occupancyPct: sortedRoomsList.length > 0 ? Math.min(100, (stayingOnDay.length / totalSuites) * 100) : 0,
          bookingValueNgn,
          collectedNgn,
          balanceNgn,
        };
      })
      .filter((dayRow) => {
        if (periodDays <= 7) return true;
        return (
          dayRow.bookingsCreated > 0 ||
          dayRow.arrivalsCount > 0 ||
          dayRow.departuresCount > 0 ||
          dayRow.occupiedSuites > 0
        );
      });

    const activeRows = rows.filter(
      (x) => x.res.status !== 'cancelled' && x.res.status !== 'no_show'
    );
    const totalNights = activeRows.reduce((s, x) => s + (x.res.nights || 1), 0);
    const totalValueNgn = activeRows.reduce((s, x) => s + x.payment.totalAmount, 0);
    const totalPaidNgn = rows.reduce((s, x) => s + x.payment.amountPaid, 0);
    const totalBalanceNgn = activeRows.reduce((s, x) => s + x.payment.balance, 0);
    const arrivalsInWindow = activeRows.filter(
      (x) => x.res.checkInDate >= dateWindow.start && x.res.checkInDate <= dateWindow.end
    ).length;
    const departuresInWindow = activeRows.filter(
      (x) => x.res.checkOutDate >= dateWindow.start && x.res.checkOutDate <= dateWindow.end
    ).length;
    const createdInWindow = rows.filter(
      (x) => x.bookedDate >= dateWindow.start && x.bookedDate <= dateWindow.end
    ).length;

    return {
      rows,
      rollup,
      summary: {
        totalRows: rows.length,
        createdInWindow,
        arrivalsInWindow,
        departuresInWindow,
        totalNights,
        totalValueNgn,
        totalPaidNgn,
        totalBalanceNgn,
      },
    };
  }, [
    current.periodReservations,
    rooms,
    sortedRoomsList.length,
    reportSearch,
    bookingStatusFilter,
    bookingSourceFilter,
    bookingRoomFilter,
    periodDays,
    dateWindow.start,
    dateWindow.end,
  ]);

  const activeBookingFiltersCount =
    (reportSearch.trim() ? 1 : 0) +
    (bookingStatusFilter !== 'all' ? 1 : 0) +
    (bookingSourceFilter !== 'ALL' ? 1 : 0) +
    (bookingRoomFilter !== 'ALL' ? 1 : 0);

  const uniqueSourceOptions = useMemo(() => {
    const set = new Set<string>(['Walk-in', 'Website', 'Booking.com', 'Airbnb', 'Expedia']);
    reservations.forEach((r) => set.add(formatBookingSourceLabel(r.channel)));
    return Array.from(set);
  }, [reservations]);

  // Strict Admin Authorization Gate
  if (!isAuthorizedAdmin) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-slate-900">
          Administrator Authorization Required
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Management Reports &amp; Analytics (P&amp;L, ADR, RevPAR, Inventory Valuation, and Staff Performance) is restricted exclusively to authorized Property Administrators.
        </p>
      </div>
    );
  }

  // Export Multi-Sheet Excel (.xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const execRows = [
      { Metric: 'Property', Value: property.name },
      { Metric: 'Report Period', Value: dateWindow.label },
      { Metric: 'Total Revenue (NGN)', Value: current.totalRevenueNgn },
      { Metric: 'Total Expenses (NGN)', Value: current.totalExpensesNgn },
      { Metric: 'Net Profit / Loss (NGN)', Value: current.netProfitNgn },
      { Metric: 'Operating Margin (%)', Value: Number(current.profitMarginPct.toFixed(2)) },
      { Metric: 'VAT Collected / Recorded (NGN)', Value: current.totalVatNgn },
      { Metric: 'Room Occupancy (%)', Value: Number(current.occupancyPct.toFixed(2)) },
      { Metric: 'Occupied Room Nights', Value: current.occupiedRoomNights },
      { Metric: 'Available Room Nights', Value: current.availableRoomNights },
      { Metric: 'Earned Room Revenue (NGN)', Value: current.earnedRoomRevenueNgn },
      { Metric: 'ADR (NGN)', Value: Math.round(current.adrNgn) },
      { Metric: 'RevPAR (NGN)', Value: Math.round(current.revparNgn) },
      { Metric: 'Reservations in Period', Value: current.periodReservations.length },
      { Metric: 'POS Sales Total (NGN)', Value: current.posTotalSalesNgn },
      { Metric: 'Store Inventory Valuation (NGN)', Value: inventoryMetrics.totalValuationNgn },
      { Metric: 'Active Staff Monthly Payroll (NGN)', Value: opsMetrics.totalMonthlySalaryBillNgn },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execRows), 'Executive Summary');

    const dailySummaryRows = dailyBookingsDataset.rollup.map((d) => ({
      Date: d.dateIso,
      Bookings_Created: d.bookingsCreated,
      Arrivals: d.arrivalsCount,
      Departures: d.departuresCount,
      Occupied_Suites: d.occupiedSuites,
      Occupancy_Pct: Number(d.occupancyPct.toFixed(1)),
      Booked_Value_NGN: d.bookingValueNgn,
      Collected_NGN: d.collectedNgn,
      Balance_NGN: d.balanceNgn,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySummaryRows), 'Daily Booking Summary');

    const dailyDetailRows = dailyBookingsDataset.rows.map(({ res, bookedDate, roomDisplay, payment, sourceLabel }) => ({
      Booked_Date: bookedDate,
      Booking_Ref: res.bookingRef,
      Guest_Name: res.guestName,
      Guest_Phone: res.guestPhone || '',
      Room_Number: roomDisplay.roomNumberLabel,
      Room_Type: roomDisplay.roomTypeLabel,
      Check_In: res.checkInDate,
      Check_Out: res.checkOutDate,
      Nights: res.nights,
      Adults: res.adults,
      Children: res.children || 0,
      Booking_Source: sourceLabel,
      Channel_Currency: res.sourceCurrency || 'NGN',
      Channel_Total_Amount: res.sourceTotalAmount ?? payment.totalAmount,
      Total_Amount_NGN: payment.totalAmount,
      Amount_Paid_NGN: payment.amountPaid,
      Balance_NGN: payment.balance,
      Payment_Status: payment.paymentStatus,
      Reservation_Status: RESERVATION_STATUS_LABELS[res.status] || res.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyDetailRows), 'Daily Room Bookings');

    const pnlRows = current.pnlByCategory.map((c) => ({
      Category: c.category,
      Revenue_NGN: c.revenueNgn,
      Expense_NGN: c.expenseNgn,
      Net_NGN: c.netNgn,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pnlRows), 'Profit and Loss');

    const roomRows = current.roomBreakdown.map((r) => ({
      Room: r.room.roomNumber,
      Suite_Name: r.room.name,
      Section: r.section,
      Room_Type: r.room.roomType,
      Rack_Rate_NGN: r.room.nightlyRateNgn,
      Stays: r.staysCount,
      Occupied_Nights: r.occupiedNights,
      Available_Nights: r.availableNights,
      Occupancy_Pct: Number(r.occupancyPct.toFixed(1)),
      Earned_Revenue_NGN: r.roomRevenueNgn,
      ADR_NGN: Math.round(r.adrNgn),
      RevPAR_NGN: Math.round(r.revparNgn),
      Live_Status: r.room.occupancyStatus,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roomRows), 'Rooms ADR RevPAR');

    const sourceRows = current.bookingSources.map((s) => ({
      Booking_Source: s.source,
      Bookings: s.bookings,
      Room_Nights: s.nights,
      Total_Booking_Value_NGN: s.totalValueNgn,
      Collected_NGN: s.collectedNgn,
      OTA_Commission_Pct: s.commissionPct,
      Est_Commission_NGN: s.estCommissionNgn,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceRows), 'Booking Sources');

    const deptRows = [
      ...current.sectionPerformance.map((sp) => ({
        Department: sp.department,
        Units: sp.unitCount,
        Occupied_Nights_Or_Orders: sp.occupiedNights,
        Occupancy_Pct: Number(sp.occupancyPct.toFixed(1)),
        Revenue_NGN: sp.revenueNgn,
        ADR_NGN: Math.round(sp.adrNgn),
        RevPAR_NGN: Math.round(sp.revparNgn),
      })),
      ...opsMetrics.posByService.map((ps) => ({
        Department: `POS · ${ps.serviceType}`,
        Units: ps.items,
        Occupied_Nights_Or_Orders: ps.orders,
        Occupancy_Pct: 0,
        Revenue_NGN: ps.totalNgn,
        ADR_NGN: ps.orders > 0 ? Math.round(ps.totalNgn / ps.orders) : 0,
        RevPAR_NGN: 0,
      })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptRows), 'POS & Departments');

    const invRows = inventoryItems.map((i) => ({
      SKU: i.sku,
      Item_Name: i.name,
      Category: i.category,
      Qty_On_Hand: i.quantityOnHand,
      Unit: i.unit,
      Reorder_Level: i.reorderLevel,
      Unit_Cost_NGN: i.unitCostNgn,
      Stock_Value_NGN: i.quantityOnHand * i.unitCostNgn,
      Supplier: i.supplierName,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), 'Inventory Costs');

    const staffRows = opsMetrics.staffScorecard.map((s) => ({
      Staff_Code: s.staff.staffCode,
      Full_Name: s.staff.fullName,
      Department: s.staff.department,
      Role: s.staff.role,
      Status: s.staff.employmentStatus,
      Monthly_Comp_NGN: s.monthlyCompNgn,
      Shifts_Assigned: s.shiftsAssigned,
      Shifts_Completed: s.shiftsCompleted,
      Attendance_Logs: s.attendanceLogs,
      On_Time_Logs: s.onTimeCount,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffRows), 'Staff Performance');

    XLSX.writeFile(wb, `${property.code}-Management-Report-${dateWindow.start}-to-${dateWindow.end}.xlsx`);
    onNotify('Exported multi-sheet Excel (.xlsx) management analytics workbook');
  };

  // Export Executive PDF Report
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const propAddress = property.address || RICHGATES_PROPERTY_INFO.address;
    const propPhone = property.phone || RICHGATES_PROPERTY_INFO.phone;
    const propEmail = property.email || RICHGATES_PROPERTY_INFO.email;

    let startY = 14;
    if (property.logoUrl && property.logoUrl.startsWith('data:image/')) {
      try {
        const format = property.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(property.logoUrl, format, 14, 12, 16, 16);
      } catch {
        // ignore logo draw error
      }
    }

    const textLeft = property.logoUrl && property.logoUrl.startsWith('data:image/') ? 34 : 14;
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(`${property.name} — Management Reports & Analytics`, textLeft, 18);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(propAddress, textLeft, 23);
    doc.text(`${propPhone} | ${propEmail} | Period: ${dateWindow.label}`, textLeft, 28);
    startY = 35;

    autoTable(doc, {
      startY,
      head: [['Executive Metric', 'Current Period', 'Operational Benchmark / Detail']],
      body: [
        ['Total Ledger Revenue', formatPdfNgn(current.totalRevenueNgn), `VAT Recorded: ${formatPdfNgn(current.totalVatNgn)}`],
        ['Total Ledger Expenses', formatPdfNgn(current.totalExpensesNgn), `${current.pnlByCategory.filter((c) => c.expenseNgn > 0).length} active cost categories`],
        ['Net Profit / Loss', formatPdfNgn(current.netProfitNgn), `Operating Margin: ${current.profitMarginPct.toFixed(1)}%`],
        ['Room Occupancy', `${current.occupancyPct.toFixed(1)}%`, `${current.occupiedRoomNights} / ${current.availableRoomNights} available room-nights`],
        ['ADR (Average Daily Rate)', formatPdfNgn(current.adrNgn), `Earned Room Rev: ${formatPdfNgn(current.earnedRoomRevenueNgn)}`],
        ['RevPAR', formatPdfNgn(current.revparNgn), `${rooms.length} suites x ${periodDays} day(s)`],
        ['POS Sales', formatPdfNgn(current.posTotalSalesNgn), `${current.periodPosOrders.length} orders · ${current.posItemsSold} items`],
        ['Store Inventory Value', formatPdfNgn(inventoryMetrics.totalValuationNgn), `${inventoryItems.length} SKUs (${inventoryMetrics.lowStockItems.length} low-stock alerts)`],
      ],
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    const afterExec = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 110;
    autoTable(doc, {
      startY: afterExec + 8,
      head: [['P&L Category', 'Revenue (NGN)', 'Expenses (NGN)', 'Net Impact (NGN)']],
      body: current.pnlByCategory.map((c) => [
        c.category,
        formatPdfNgn(c.revenueNgn),
        formatPdfNgn(c.expenseNgn),
        formatPdfNgn(c.netNgn),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [28, 70, 190] },
    });

    const afterPnl = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 180;
    autoTable(doc, {
      startY: afterPnl + 8,
      head: [['Booking Source', 'Bookings', 'Nights', 'Booking Value', 'Collected', 'Est. Commission']],
      body:
        current.bookingSources.length > 0
          ? current.bookingSources.map((s) => [
              s.source,
              String(s.bookings),
              String(s.nights),
              formatPdfNgn(s.totalValueNgn),
              formatPdfNgn(s.collectedNgn),
              formatPdfNgn(s.estCommissionNgn),
            ])
          : [['No reservations in selected period', '0', '0', 'NGN 0', 'NGN 0', 'NGN 0']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [5, 150, 105] },
    });

    doc.addPage();
    autoTable(doc, {
      startY: 16,
      head: [['Suite', 'Section', 'Room Type', 'Occupied Nights', 'Occupancy %', 'Earned Rev', 'ADR', 'RevPAR']],
      body: current.roomBreakdown.map((r) => [
        r.room.roomNumber,
        r.section,
        r.room.roomType,
        `${r.occupiedNights}/${r.availableNights}`,
        `${r.occupancyPct.toFixed(1)}%`,
        formatPdfNgn(r.roomRevenueNgn),
        formatPdfNgn(r.adrNgn),
        formatPdfNgn(r.revparNgn),
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.addPage();
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Room Bookings Daily Report (${dateWindow.label})`, 14, 16);
    autoTable(doc, {
      startY: 20,
      head: [['Booked', 'Ref', 'Guest Name', 'Suite', 'Stay Dates', 'Nights', 'Source', 'Total', 'Paid', 'Status']],
      body:
        dailyBookingsDataset.rows.length > 0
          ? dailyBookingsDataset.rows.map(({ res, bookedDate, roomDisplay, payment, sourceLabel }) => [
              bookedDate,
              res.bookingRef,
              res.guestName,
              roomDisplay.roomNumberLabel,
              `${res.checkInDate} -> ${res.checkOutDate}`,
              String(res.nights),
              sourceLabel,
              formatPdfNgn(payment.totalAmount),
              formatPdfNgn(payment.amountPaid),
              `${payment.paymentStatus} / ${RESERVATION_STATUS_LABELS[res.status] || res.status}`,
            ])
          : [['-', '-', 'No matching room bookings for selected dates/filters', '-', '-', '0', '-', 'NGN 0', 'NGN 0', '-']],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    const afterDailyBookings =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 110;
    autoTable(doc, {
      startY: afterDailyBookings + 8,
      head: [['Staff Member', 'Department', 'Monthly Comp', 'Shifts Completed', 'Attendance Logs']],
      body: opsMetrics.staffScorecard.map((s) => [
        s.staff.fullName,
        s.staff.department,
        formatPdfNgn(s.monthlyCompNgn),
        `${s.shiftsCompleted}/${s.shiftsAssigned}`,
        `${s.onTimeCount}/${s.attendanceLogs}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`${property.code}-Management-Report-${dateWindow.start}.pdf`);
    onNotify('Exported Management Analytics PDF report');
  };

  // Interactive Line Chart Geometry
  const lineWidth = 640;
  const lineHeight = 220;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = lineWidth - padL - padR;
  const plotH = lineHeight - padT - padB;

  const lineMaxVal = useMemo(() => {
    if (lineMode === 'hospitality') return 100;
    const maxFound = current.dailyPoints.reduce(
      (m, pt) => Math.max(m, pt.revenueNgn, pt.expenseNgn, Math.abs(pt.netNgn)),
      10000
    );
    return maxFound * 1.15;
  }, [lineMode, current.dailyPoints]);

  const toLineX = (idx: number, count: number) =>
    count <= 1 ? padL + plotW / 2 : padL + (idx / (count - 1)) * plotW;

  const toLineY = (val: number, maxVal: number) =>
    padT + plotH - (Math.max(0, Math.min(maxVal, val)) / (maxVal || 1)) * plotH;

  const buildPath = (values: number[], maxVal: number) =>
    values
      .map((v, idx) => `${idx === 0 ? 'M' : 'L'} ${toLineX(idx, values.length).toFixed(1)} ${toLineY(v, maxVal).toFixed(1)}`)
      .join(' ');

  // Reservation Status Counts in period
  const resStatusRows = useMemo(() => {
    const statuses: ReservationRecord['status'][] = [
      'confirmed',
      'pending',
      'checked_in',
      'checked_out',
      'cancelled',
      'no_show',
    ];
    return statuses.map((st) => {
      const list = current.periodReservations.filter((r) => r.status === st);
      return {
        status: st,
        count: list.length,
        nights: list.reduce((s, r) => s + (r.nights || 1), 0),
        valueNgn: list.reduce((s, r) => s + getReservationPaymentSummary(r).totalAmount, 0),
        paidNgn: list.reduce((s, r) => s + getReservationPaymentSummary(r).amountPaid, 0),
      };
    });
  }, [current.periodReservations]);

  const activeDayPoint =
    hoveredDayIndex !== null ? current.dailyPoints[hoveredDayIndex] : current.dailyPoints[current.dailyPoints.length - 1];

  const activePieSlice =
    selectedPieIndex !== null ? pieSlices[selectedPieIndex] : pieSlices[0];

  const barMaxPrimary = useMemo(() => {
    return barData.reduce((m, b) => Math.max(m, b.primary, barMode === 'category' ? b.secondary : 0), 10000) * 1.15;
  }, [barData, barMode]);

  const revDelta = computeDelta(current.totalRevenueNgn, previous ? previous.totalRevenueNgn : null);
  const expDelta = computeDelta(current.totalExpensesNgn, previous ? previous.totalExpensesNgn : null);
  const netDelta = computeDelta(current.netProfitNgn, previous ? previous.netProfitNgn : null);
  const occDelta = computeDelta(current.occupancyPct, previous ? previous.occupancyPct : null);
  const adrDelta = computeDelta(current.adrNgn, previous ? previous.adrNgn : null);
  const revparDelta = computeDelta(current.revparNgn, previous ? previous.revparNgn : null);
  const posDelta = computeDelta(current.posTotalSalesNgn, previous ? previous.posTotalSalesNgn : null);

  return (
    <div className="space-y-6">
      {/* Executive Header & Export Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {property.logoUrl ? (
              <img
                src={property.logoUrl}
                alt={property.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-xl object-contain border border-slate-200 bg-white p-1 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900">
                {cms.pages.reports.title || 'Admin Management Reports & Analytics'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Live database analytics ({dateWindow.label})
              </p>
            </div>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1c46be] hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Date Filter Bar & Period Comparison Toggle */}
        <div className="no-print flex flex-col gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'single_day', label: 'Pick Date' },
                  { id: 'last_7', label: 'Last 7 Days' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_30', label: 'Last 30 Days' },
                  { id: 'all_time', label: 'All Time' },
                  { id: 'custom', label: 'Date Range' },
                ] as Array<{ id: DatePreset; label: string }>
              ).map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setPreset(btn.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    preset === btn.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {btn.label}
                </button>
              ))}

              {preset === 'single_day' && (
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={() => setSingleDay((d) => addDaysIso(d || todayIso, -1))}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 font-semibold cursor-pointer"
                    title="Previous day"
                  >
                    ‹
                  </button>
                  <input
                    type="date"
                    value={singleDay}
                    onChange={(e) => setSingleDay(e.target.value || todayIso)}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono-tabular bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setSingleDay((d) => addDaysIso(d || todayIso, 1))}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 font-semibold cursor-pointer"
                    title="Next day"
                  >
                    ›
                  </button>
                </div>
              )}

              {preset === 'custom' && (
                <div className="flex flex-wrap items-center gap-1.5 ml-1">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCustomStart(next);
                      if (customEnd < next) setCustomEnd(next);
                    }}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono-tabular bg-white"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    min={customStart}
                    value={customEnd}
                    onChange={(e) =>
                      setCustomEnd(e.target.value < customStart ? customStart : e.target.value)
                    }
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono-tabular bg-white"
                  />
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={preset === 'all_time'}
                checked={compareEnabled && preset !== 'all_time'}
                onChange={(e) => setCompareEnabled(e.target.checked)}
                className="rounded border-slate-300 text-[#1c46be]"
              />
              <span>
                Compare vs Previous {periodDays}-Day Period
                {dateWindow.prevStart && compareEnabled && preset !== 'all_time'
                  ? ` (${dateWindow.prevStart} → ${dateWindow.prevEnd})`
                  : ''}
              </span>
            </label>
          </div>

          {/* Easy Management Search & Booking Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <div className="md:col-span-5 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search guest name, ref, suite (RM-1), room type, source, phone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#1c46be]"
              />
            </div>

            <div className="md:col-span-2">
              <select
                value={bookingStatusFilter}
                onChange={(e) => setBookingStatusFilter(e.target.value as 'all' | ReservationStatus)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="checked_in">Checked-in</option>
                <option value="checked_out">Checked-out</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No-show</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={bookingSourceFilter}
                onChange={(e) => setBookingSourceFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">All Sources</option>
                {uniqueSourceOptions.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={bookingRoomFilter}
                onChange={(e) => setBookingRoomFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">All Suites</option>
                {sortedRoomsList.map((rm) => (
                  <option key={rm.id} value={rm.roomNumber}>
                    {rm.roomNumber} · {rm.roomType}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1 flex items-center justify-end">
              {activeBookingFiltersCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportSearch('');
                    setBookingStatusFilter('all');
                    setBookingSourceFilter('ALL');
                    setBookingRoomFilter('ALL');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              ) : (
                <span className="text-[11px] font-mono-tabular text-slate-500 px-1">
                  {dailyBookingsDataset.rows.length} rows
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sub-Report Navigation Tabs */}
        <div className="no-print flex flex-wrap items-center gap-1.5 pt-2">
          {(
            [
              { id: 'overview', label: 'Executive Overview & Charts' },
              { id: 'daily_bookings', label: `Daily Room Bookings (${dailyBookingsDataset.rows.length})` },
              { id: 'pnl', label: 'Profit & Loss & Expenses' },
              { id: 'rooms', label: 'Occupancy, ADR & RevPAR' },
              { id: 'sources', label: 'Reservations & Booking Sources' },
              { id: 'pos_dept', label: 'POS Sales & Departments' },
              { id: 'inventory_staff', label: 'Inventory & Staff Performance' },
            ] as Array<{ id: ReportTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === t.id
                  ? 'bg-[#1c46be] text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 8 Executive KPI Cards (All Real Data + Real Prior Period Comparison) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Revenue',
            value: formatNgn(current.totalRevenueNgn),
            delta: revDelta.label,
            positive: revDelta.positive,
            sub: `VAT Recorded: ${formatNgn(current.totalVatNgn)}`,
            icon: Wallet,
          },
          {
            label: 'Total Expenses',
            value: formatNgn(current.totalExpensesNgn),
            delta: expDelta.label,
            positive: expDelta.positive === null ? null : !expDelta.positive,
            sub: `${current.pnlByCategory.filter((c) => c.expenseNgn > 0).length} active cost categories`,
            icon: TrendingDown,
          },
          {
            label: 'Net Profit & Margin',
            value: formatNgn(current.netProfitNgn),
            delta: netDelta.label,
            positive: netDelta.positive,
            sub: `Operating Margin: ${current.profitMarginPct.toFixed(1)}%`,
            icon: TrendingUp,
          },
          {
            label: 'Room Occupancy',
            value: `${current.occupancyPct.toFixed(1)}%`,
            delta: occDelta.label,
            positive: occDelta.positive,
            sub: `${current.occupiedRoomNights} / ${current.availableRoomNights} room-nights`,
            icon: BedDouble,
          },
          {
            label: 'ADR (Avg Daily Rate)',
            value: formatNgn(current.adrNgn),
            delta: adrDelta.label,
            positive: adrDelta.positive,
            sub: `Room Rev Earned: ${formatNgn(current.earnedRoomRevenueNgn)}`,
            icon: Building2,
          },
          {
            label: 'RevPAR',
            value: formatNgn(current.revparNgn),
            delta: revparDelta.label,
            positive: revparDelta.positive,
            sub: `${rooms.length} suites · ${periodDays} day(s)`,
            icon: Layers,
          },
          {
            label: 'POS Sales',
            value: formatNgn(current.posTotalSalesNgn),
            delta: posDelta.label,
            positive: posDelta.positive,
            sub: `${current.periodPosOrders.length} orders · ${current.posItemsSold} items`,
            icon: UtensilsCrossed,
          },
          {
            label: 'Inventory Valuation',
            value: formatNgn(inventoryMetrics.totalValuationNgn),
            delta: `${inventoryMetrics.lowStockItems.length} low-stock SKUs`,
            positive: inventoryMetrics.lowStockItems.length === 0,
            sub: `Monthly Staff Payroll: ${formatNgn(opsMetrics.totalMonthlySalaryBillNgn)}`,
            icon: Package,
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="font-mono-tabular text-xl font-bold text-slate-900">{kpi.value}</p>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px]">
                  <span
                    className={`font-semibold ${
                      kpi.positive === true
                        ? 'text-emerald-700'
                        : kpi.positive === false
                          ? 'text-rose-700'
                          : 'text-slate-500'
                    }`}
                  >
                    {kpi.delta}
                  </span>
                  <span className="text-slate-500 truncate">{kpi.sub}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Charts Row: Line Chart + Bar Chart + Pie Chart (Shown in Overview) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Interactive Line Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  {lineMode === 'financial'
                    ? 'Daily Revenue, Expenses & Net P&L Trend'
                    : 'Daily Occupancy % & RevPAR Trend'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Hover or tap any day point to inspect exact PMS figures ({current.dailyPoints.length} days plotted)
                </p>
              </div>
              <div className="no-print flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setLineMode('financial')}
                  className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
                    lineMode === 'financial'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Revenue &amp; P&amp;L
                </button>
                <button
                  type="button"
                  onClick={() => setLineMode('hospitality')}
                  className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
                    lineMode === 'hospitality'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Occupancy %
                </button>
              </div>
            </div>

            {/* Active Hovered Point Summary Bar */}
            {activeDayPoint && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs">
                <span className="font-mono-tabular font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#1c46be]" />
                  <span>{activeDayPoint.date}</span>
                </span>
                {lineMode === 'financial' ? (
                  <div className="flex flex-wrap items-center gap-4 font-mono-tabular">
                    <span className="text-emerald-700 font-semibold">
                      Revenue: {formatNgn(activeDayPoint.revenueNgn)}
                    </span>
                    <span className="text-rose-700 font-semibold">
                      Expenses: {formatNgn(activeDayPoint.expenseNgn)}
                    </span>
                    <span className="text-[#1c46be] font-bold">
                      Net: {formatNgn(activeDayPoint.netNgn)}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-4 font-mono-tabular">
                    <span className="text-[#1c46be] font-bold">
                      Occupancy: {activeDayPoint.occupancyPct.toFixed(1)}%
                    </span>
                    <span className="text-emerald-700 font-semibold">
                      RevPAR: {formatNgn(activeDayPoint.revparNgn)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${lineWidth} ${lineHeight}`}
                className="w-full min-w-[520px] h-56 select-none"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = padT + plotH * (1 - t);
                  const val = lineMaxVal * t;
                  return (
                    <g key={t}>
                      <line
                        x1={padL}
                        x2={lineWidth - padR}
                        y1={y}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono"
                      >
                        {lineMode === 'hospitality' ? `${Math.round(val)}%` : formatCompactNgn(val)}
                      </text>
                    </g>
                  );
                })}

                {lineMode === 'financial' ? (
                  <>
                    <path
                      d={buildPath(
                        current.dailyPoints.map((d) => d.revenueNgn),
                        lineMaxVal
                      )}
                      fill="none"
                      stroke="#059669"
                      strokeWidth="2.5"
                    />
                    <path
                      d={buildPath(
                        current.dailyPoints.map((d) => d.expenseNgn),
                        lineMaxVal
                      )}
                      fill="none"
                      stroke="#e11d48"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  </>
                ) : (
                  <path
                    d={buildPath(
                      current.dailyPoints.map((d) => d.occupancyPct),
                      100
                    )}
                    fill="none"
                    stroke="#1c46be"
                    strokeWidth="2.5"
                  />
                )}

                {current.dailyPoints.map((pt, idx) => {
                  const x = toLineX(idx, current.dailyPoints.length);
                  const yMain =
                    lineMode === 'financial'
                      ? toLineY(pt.revenueNgn, lineMaxVal)
                      : toLineY(pt.occupancyPct, 100);
                  const showLabel =
                    current.dailyPoints.length <= 10 ||
                    idx % Math.ceil(current.dailyPoints.length / 8) === 0 ||
                    idx === current.dailyPoints.length - 1;
                  return (
                    <g
                      key={pt.date}
                      onMouseEnter={() => setHoveredDayIndex(idx)}
                      onClick={() => setHoveredDayIndex(idx)}
                      className="cursor-pointer"
                    >
                      {hoveredDayIndex === idx && (
                        <line
                          x1={x}
                          x2={x}
                          y1={padT}
                          y2={padT + plotH}
                          stroke="#94a3b8"
                          strokeWidth="1"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={yMain}
                        r={hoveredDayIndex === idx ? 5 : 3}
                        fill={lineMode === 'financial' ? '#059669' : '#1c46be'}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      {lineMode === 'financial' && (
                        <circle
                          cx={x}
                          cy={toLineY(pt.expenseNgn, lineMaxVal)}
                          r={hoveredDayIndex === idx ? 4.5 : 2.5}
                          fill="#e11d48"
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                      )}
                      <rect
                        x={x - plotW / Math.max(2, current.dailyPoints.length * 2)}
                        y={padT}
                        width={plotW / Math.max(1, current.dailyPoints.length)}
                        height={plotH}
                        fill="transparent"
                      />
                      {showLabel && (
                        <text
                          x={x}
                          y={lineHeight - 6}
                          textAnchor="middle"
                          className="fill-slate-500 text-[10px] font-mono"
                        >
                          {pt.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Interactive Bar Chart & Pie Chart Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Interactive Bar Chart */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    {barMode === 'category'
                      ? 'Revenue vs Expenses by Category'
                      : 'Earned Revenue by Suite (RM-1 to RM-8)'}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Hover or click any bar to inspect exact category or suite totals
                  </p>
                </div>
                <div className="no-print flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setBarMode('category');
                      setHoveredBarIndex(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
                      barMode === 'category'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    By Category
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBarMode('rooms');
                      setHoveredBarIndex(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
                      barMode === 'rooms'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    By Suite
                  </button>
                </div>
              </div>

              {hoveredBarIndex !== null && barData[hoveredBarIndex] && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {barData[hoveredBarIndex].fullLabel}
                  </span>
                  <div className="flex items-center gap-3 font-mono-tabular">
                    <span className="text-[#1c46be] font-bold">
                      {barData[hoveredBarIndex].primaryLabel}:{' '}
                      {formatNgn(barData[hoveredBarIndex].primary)}
                    </span>
                    <span className="text-rose-700 font-semibold">
                      {barData[hoveredBarIndex].secondaryLabel}:{' '}
                      {barMode === 'category'
                        ? formatNgn(barData[hoveredBarIndex].secondary)
                        : `${barData[hoveredBarIndex].secondary}%`}
                    </span>
                  </div>
                </div>
              )}

              {barData.length === 0 ? (
                <p className="text-xs text-slate-500 py-10 text-center">
                  No ledger or suite revenue entries in this date range.
                </p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <svg viewBox="0 0 540 220" className="w-full min-w-[420px] h-56 select-none">
                    {[0, 0.5, 1].map((t) => {
                      const y = 18 + 165 * (1 - t);
                      return (
                        <g key={t}>
                          <line x1={48} x2={528} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                          <text x={44} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                            {formatCompactNgn(barMaxPrimary * t)}
                          </text>
                        </g>
                      );
                    })}

                    {barData.map((bar, idx) => {
                      const bandW = 472 / barData.length;
                      const xCenter = 52 + bandW * idx + bandW / 2;
                      const barW = barMode === 'category' ? Math.min(18, bandW * 0.34) : Math.min(28, bandW * 0.55);
                      const h1 = (bar.primary / (barMaxPrimary || 1)) * 165;
                      const h2 =
                        barMode === 'category'
                          ? (bar.secondary / (barMaxPrimary || 1)) * 165
                          : 0;
                      return (
                        <g
                          key={bar.label}
                          onMouseEnter={() => setHoveredBarIndex(idx)}
                          onClick={() => setHoveredBarIndex(idx)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={barMode === 'category' ? xCenter - barW - 1 : xCenter - barW / 2}
                            y={183 - h1}
                            width={barW}
                            height={Math.max(2, h1)}
                            rx={3}
                            fill={hoveredBarIndex === idx ? '#1e3a8a' : '#1c46be'}
                          />
                          {barMode === 'category' && (
                            <rect
                              x={xCenter + 1}
                              y={183 - h2}
                              width={barW}
                              height={Math.max(2, h2)}
                              rx={3}
                              fill={hoveredBarIndex === idx ? '#be123c' : '#f43f5e'}
                            />
                          )}
                          <text
                            x={xCenter}
                            y={202}
                            textAnchor="middle"
                            className="fill-slate-600 text-[10px] font-medium"
                          >
                            {bar.label.slice(0, 10)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* Interactive Pie / Donut Chart */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-1.5">
                  <PieChartIcon className="w-4 h-4 text-[#1c46be]" />
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Distribution Mix
                  </h2>
                </div>
                <div className="no-print flex items-center gap-1 text-[11px]">
                  {(
                    [
                      { id: 'sources', label: 'Sources' },
                      { id: 'expenses', label: 'Expenses' },
                      { id: 'inventory', label: 'Inventory' },
                    ] as const
                  ).map((pm) => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => {
                        setPieMode(pm.id);
                        setSelectedPieIndex(null);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
                        pieMode === pm.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              {pieSlices.length === 0 || (pieSlices[0]?.total || 0) <= 0 ? (
                <p className="text-xs text-slate-500 py-12 text-center">
                  No positive records available for this breakdown in the selected window.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <svg viewBox="0 0 180 180" className="w-44 h-44 shrink-0 select-none">
                    {pieSlices.map((sl, idx) => {
                      const r = selectedPieIndex === idx ? 76 : 70;
                      const cx = 90;
                      const cy = 90;
                      if (sl.sharePct >= 99.9) {
                        return (
                          <circle
                            key={sl.label}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={sl.color}
                            onClick={() => setSelectedPieIndex(idx)}
                            className="cursor-pointer"
                          />
                        );
                      }
                      const x1 = cx + r * Math.cos(sl.startAngle);
                      const y1 = cy + r * Math.sin(sl.startAngle);
                      const x2 = cx + r * Math.cos(sl.endAngle);
                      const y2 = cy + r * Math.sin(sl.endAngle);
                      const largeArc = sl.endAngle - sl.startAngle > Math.PI ? 1 : 0;
                      const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
                      return (
                        <path
                          key={sl.label}
                          d={d}
                          fill={sl.color}
                          stroke="#ffffff"
                          strokeWidth="2"
                          onMouseEnter={() => setSelectedPieIndex(idx)}
                          onClick={() => setSelectedPieIndex(idx)}
                          className="cursor-pointer transition-all"
                        />
                      );
                    })}
                    <circle cx={90} cy={90} r={38} fill="#ffffff" />
                    <text x={90} y={87} textAnchor="middle" className="fill-slate-900 text-xs font-bold font-mono">
                      {activePieSlice ? `${activePieSlice.sharePct.toFixed(0)}%` : '100%'}
                    </text>
                    <text x={90} y={101} textAnchor="middle" className="fill-slate-500 text-[9px]">
                      {activePieSlice ? activePieSlice.label.slice(0, 12) : ''}
                    </text>
                  </svg>

                  <div className="flex-1 w-full space-y-1.5 text-xs">
                    {pieSlices.map((sl, idx) => (
                      <button
                        key={sl.label}
                        type="button"
                        onClick={() => setSelectedPieIndex(idx)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                          selectedPieIndex === idx ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: sl.color }}
                          />
                          <span className="truncate text-slate-800 font-medium">{sl.label}</span>
                        </span>
                        <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                          {formatNgn(sl.value)} ({sl.sharePct.toFixed(0)}%)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profit & Loss and Expenses Detail */}
      {(activeTab === 'overview' || activeTab === 'pnl') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Profit &amp; Loss (P&amp;L) and Expense Breakdown
              </h2>
              <p className="text-xs text-slate-500">
                Computed directly from Property Accounting Ledger entries ({dateWindow.label})
              </p>
            </div>
            <span className="font-mono-tabular text-xs font-bold text-slate-900">
              Net Operating Result: {formatNgn(current.netProfitNgn)} ({current.profitMarginPct.toFixed(1)}%)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Accounting Category</th>
                  <th className="px-4 py-3 font-semibold text-right">Revenue (₦)</th>
                  <th className="px-4 py-3 font-semibold text-right">Expenses (₦)</th>
                  <th className="px-4 py-3 font-semibold text-right">Net Contribution (₦)</th>
                  <th className="px-4 py-3 font-semibold text-right">Expense Share %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {current.pnlByCategory.map((row) => {
                  const expShare =
                    current.totalExpensesNgn > 0
                      ? (row.expenseNgn / current.totalExpensesNgn) * 100
                      : 0;
                  return (
                    <tr key={row.category} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.category}</td>
                      <td className="px-4 py-3 font-mono-tabular text-right text-emerald-700 font-semibold">
                        {formatNgn(row.revenueNgn)}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-right text-rose-700 font-semibold">
                        {formatNgn(row.expenseNgn)}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono-tabular text-right font-bold ${
                          row.netNgn >= 0 ? 'text-slate-900' : 'text-rose-700'
                        }`}
                      >
                        {formatNgn(row.netNgn)}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-right text-slate-600">
                        {expShare.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                <tr>
                  <td className="px-4 py-3">Total Period Ledger</td>
                  <td className="px-4 py-3 font-mono-tabular text-right text-emerald-700">
                    {formatNgn(current.totalRevenueNgn)}
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-right text-rose-700">
                    {formatNgn(current.totalExpensesNgn)}
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-right">
                    {formatNgn(current.netProfitNgn)}
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-right">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Room Occupancy, ADR, RevPAR & Suite Performance */}
      {(activeTab === 'overview' || activeTab === 'rooms') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Room Occupancy, ADR &amp; RevPAR Breakdown ({rooms.length} Suites)
              </h2>
              <p className="text-xs text-slate-500">
                Live suite stays overlapping {dateWindow.label} · Blocked Date Windows: {blockedDates.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
              <span className="text-slate-700">
                Occ: <strong>{current.occupancyPct.toFixed(1)}%</strong>
              </span>
              <span className="text-emerald-700">
                ADR: <strong>{formatNgn(current.adrNgn)}</strong>
              </span>
              <span className="text-[#1c46be]">
                RevPAR: <strong>{formatNgn(current.revparNgn)}</strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Suite</th>
                  <th className="px-4 py-3 font-semibold">Section &amp; Type</th>
                  <th className="px-4 py-3 font-semibold text-right">Rack Rate</th>
                  <th className="px-4 py-3 font-semibold text-right">Occ. Nights</th>
                  <th className="px-4 py-3 font-semibold text-right">Occupancy %</th>
                  <th className="px-4 py-3 font-semibold text-right">Earned Rev</th>
                  <th className="px-4 py-3 font-semibold text-right">ADR</th>
                  <th className="px-4 py-3 font-semibold text-right">RevPAR</th>
                  <th className="px-4 py-3 font-semibold">Live Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {current.roomBreakdown
                  .filter((rb) => {
                    if (bookingRoomFilter !== 'ALL' && rb.room.roomNumber !== bookingRoomFilter) {
                      return false;
                    }
                    const q = reportSearch.trim().toLowerCase();
                    if (!q) return true;
                    return [rb.room.roomNumber, rb.room.name, rb.room.roomType, rb.section, rb.room.occupancyStatus]
                      .join(' ')
                      .toLowerCase()
                      .includes(q);
                  })
                  .map((rb) => (
                  <tr key={rb.room.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono-tabular font-bold text-slate-900">
                      {rb.room.roomNumber}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{rb.room.roomType}</p>
                      <p className="text-[11px] text-slate-500">{rb.section}</p>
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-right">
                      {formatNgn(rb.room.nightlyRateNgn)}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-right">
                      {rb.occupiedNights} / {rb.availableNights}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-right font-semibold">
                      {rb.occupancyPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-right font-semibold text-emerald-700">
                      {formatNgn(rb.roomRevenueNgn)}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-right">
                      {formatNgn(rb.adrNgn)}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-right text-[#1c46be] font-semibold">
                      {formatNgn(rb.revparNgn)}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-700">
                      {rb.room.occupancyStatus.replace(/_/g, ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Room Bookings Daily Report (Day-by-Day Rollup & Searchable Booking Register) */}
      {(activeTab === 'overview' || activeTab === 'daily_bookings' || activeTab === 'sources') && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Room Bookings Daily Report ({dateWindow.label})
                </h2>
                <p className="text-xs text-slate-500">
                  Live daily room bookings, arrivals, departures, room-nights, and folio settlement register
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                  Bookings: {dailyBookingsDataset.summary.totalRows}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">
                  Paid: {formatNgn(dailyBookingsDataset.summary.totalPaidNgn)}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">
                  Balance: {formatNgn(dailyBookingsDataset.summary.totalBalanceNgn)}
                </span>
              </div>
            </div>

            {/* Daily Bookings KPI Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 p-4 bg-slate-50/70 border-b border-slate-100 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Matching Bookings</p>
                <p className="font-mono-tabular text-base font-bold text-slate-900 mt-0.5">
                  {dailyBookingsDataset.summary.totalRows}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Booked in Window</p>
                <p className="font-mono-tabular text-base font-bold text-slate-900 mt-0.5">
                  {dailyBookingsDataset.summary.createdInWindow}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Arrivals</p>
                <p className="font-mono-tabular text-base font-bold text-[#1c46be] mt-0.5">
                  {dailyBookingsDataset.summary.arrivalsInWindow}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Check-outs</p>
                <p className="font-mono-tabular text-base font-bold text-slate-900 mt-0.5">
                  {dailyBookingsDataset.summary.departuresInWindow}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Room-Nights</p>
                <p className="font-mono-tabular text-base font-bold text-slate-900 mt-0.5">
                  {dailyBookingsDataset.summary.totalNights}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Booking Value</p>
                <p className="font-mono-tabular text-base font-bold text-slate-900 mt-0.5">
                  {formatNgn(dailyBookingsDataset.summary.totalValueNgn)}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-500">Collected</p>
                <p className="font-mono-tabular text-base font-bold text-emerald-700 mt-0.5">
                  {formatNgn(dailyBookingsDataset.summary.totalPaidNgn)}
                </p>
              </div>
            </div>

            {/* Day-by-Day Breakdown Rollup (click any day to inspect that single date) */}
            {dailyBookingsDataset.rollup.length > 0 && (
              <div className="border-b border-slate-200">
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800">
                    Day-by-Day Room Bookings Rollup
                  </p>
                  <span className="text-[11px] text-slate-500">
                    Click any date row to focus report on that exact day
                  </span>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Booked</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Arrivals</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Departures</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Occupied Suites</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Booked Value</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Collected</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyBookingsDataset.rollup.map((dayRow) => (
                        <tr
                          key={dayRow.dateIso}
                          onClick={() => {
                            setSingleDay(dayRow.dateIso);
                            setPreset('single_day');
                          }}
                          className="hover:bg-blue-50/50 cursor-pointer"
                        >
                          <td className="px-4 py-2 font-mono-tabular font-semibold text-[#1c46be]">
                            {dayRow.dateIso}
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right">
                            {dayRow.bookingsCreated}
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right">
                            {dayRow.arrivalsCount}
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right">
                            {dayRow.departuresCount}
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right">
                            {dayRow.occupiedSuites} ({dayRow.occupancyPct.toFixed(0)}%)
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right font-semibold text-slate-900">
                            {formatNgn(dayRow.bookingValueNgn)}
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right font-semibold text-emerald-700">
                            {formatNgn(dayRow.collectedNgn)}
                          </td>
                          <td className="px-4 py-2 font-mono-tabular text-right text-amber-700 font-semibold">
                            {formatNgn(dayRow.balanceNgn)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Searchable Daily Room Bookings Detail Register */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date Booked</th>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Guest Name</th>
                    <th className="px-4 py-3 font-semibold">Room &amp; Type</th>
                    <th className="px-4 py-3 font-semibold">Check-in → Check-out</th>
                    <th className="px-4 py-3 font-semibold text-right">Nights</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold text-right">Total</th>
                    <th className="px-4 py-3 font-semibold text-right">Paid</th>
                    <th className="px-4 py-3 font-semibold text-right">Balance</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyBookingsDataset.rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                        No room bookings match the selected date range or search filters.
                      </td>
                    </tr>
                  ) : (
                    dailyBookingsDataset.rows.map(
                      ({ res, bookedDate, roomDisplay, payment, sourceLabel }) => (
                        <tr key={res.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-mono-tabular text-slate-600 whitespace-nowrap">
                            {bookedDate}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                            {res.bookingRef}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-slate-900">{res.guestName}</p>
                            {res.guestPhone && (
                              <p className="text-[11px] font-mono-tabular text-slate-500">
                                {res.guestPhone}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="font-mono-tabular font-semibold text-slate-900">
                              {roomDisplay.roomNumberLabel}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              {roomDisplay.roomTypeLabel}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                            {res.checkInDate} → {res.checkOutDate}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-right">
                            {res.nights}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-700 font-medium">
                            {sourceLabel}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold text-slate-900">
                            {formatNgn(payment.totalAmount)}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold text-emerald-700">
                            {formatNgn(payment.amountPaid)}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold text-amber-700">
                            {formatNgn(payment.balance)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                payment.paymentStatus === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : payment.paymentStatus === 'Partial'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {payment.paymentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap capitalize font-medium text-slate-700">
                            {RESERVATION_STATUS_LABELS[res.status] || res.status}
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reservations & Booking Sources */}
      {(activeTab === 'overview' || activeTab === 'sources') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Reservations Status & Receivables */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Reservations Summary ({current.periodReservations.length})
              </h2>
              <p className="text-xs text-slate-500">
                Collected: {formatNgn(current.reservationCollectedNgn)} · Outstanding:{' '}
                <span className="font-semibold text-amber-700">
                  {formatNgn(current.reservationBalanceNgn)}
                </span>{' '}
                · Total Guests: {guests.length}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Count</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Nights</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Value (₦)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resStatusRows.map((row) => (
                    <tr key={row.status}>
                      <td className="px-4 py-2.5 capitalize font-medium text-slate-900">
                        {row.status.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right">{row.count}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right">{row.nights}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold">
                        {formatNgn(row.valueNgn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Booking Sources & OTA Commission */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Booking Sources &amp; Channel Manager Mix
              </h2>
              <p className="text-xs text-slate-500">
                Walk-in, Website, Booking.com, Airbnb, Expedia &amp; connected iCal channels
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Source</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Bookings</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Nights</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Total Value</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Collected</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Est. OTA Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {current.bookingSources.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No active reservations in selected period.
                      </td>
                    </tr>
                  ) : (
                    current.bookingSources.map((src) => (
                      <tr key={src.source} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{src.source}</td>
                        <td className="px-4 py-2.5 font-mono-tabular text-right">{src.bookings}</td>
                        <td className="px-4 py-2.5 font-mono-tabular text-right">{src.nights}</td>
                        <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold">
                          {formatNgn(src.totalValueNgn)}
                        </td>
                        <td className="px-4 py-2.5 font-mono-tabular text-right text-emerald-700">
                          {formatNgn(src.collectedNgn)}
                        </td>
                        <td className="px-4 py-2.5 font-mono-tabular text-right text-slate-600">
                          {formatNgn(src.estCommissionNgn)} ({src.commissionPct}%)
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* POS Sales & Departmental Performance */}
      {(activeTab === 'overview' || activeTab === 'pos_dept') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* POS Sales Breakdown */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Restaurant &amp; Bar POS Sales
                </h2>
                <p className="text-xs text-slate-500">
                  Subtotal {formatNgn(current.posSubtotalNgn)} · VAT (7.5%){' '}
                  {formatNgn(current.posVatNgn)}
                </p>
              </div>
              <span className="font-mono-tabular text-sm font-bold text-[#1c46be]">
                {formatNgn(current.posTotalSalesNgn)}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-semibold text-slate-700">By Service Type</p>
              {opsMetrics.posByService.map((row) => (
                <div
                  key={row.serviceType}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100"
                >
                  <span className="text-slate-800 font-medium">
                    {row.serviceType} ({row.orders} orders · {row.items} items)
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {formatNgn(row.totalNgn)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-xs pt-2">
              <p className="font-semibold text-slate-700">By Payment Settlement Method</p>
              <div className="grid grid-cols-2 gap-2">
                {opsMetrics.posByMethod.map((pm) => (
                  <div
                    key={pm.method}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <p className="text-[11px] text-slate-500">{pm.method}</p>
                    <p className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                      {formatNgn(pm.totalNgn)}
                    </p>
                    <p className="text-[10px] text-slate-500">{pm.orders} orders</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Departmental Performance Scorecard */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Departmental Performance Scorecard
              </h2>
              <p className="text-xs text-slate-500">
                Serviced Apartments vs Hotel Rooms, F&amp;B, Housekeeping, and Engineering
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              {current.sectionPerformance.map((sp) => (
                <div
                  key={sp.department}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {sp.department} ({sp.unitCount} suites)
                    </span>
                    <span className="font-mono-tabular font-bold text-emerald-700">
                      {formatNgn(sp.revenueNgn)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 font-mono-tabular">
                    <span>Occ: {sp.occupancyPct.toFixed(1)}%</span>
                    <span>
                      Nights: {sp.occupiedNights}/{sp.availableNights}
                    </span>
                    <span>ADR: {formatNgn(sp.adrNgn)}</span>
                    <span>RevPAR: {formatNgn(sp.revparNgn)}</span>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <p className="font-semibold text-slate-900">Housekeeping Operations</p>
                  <p className="font-mono-tabular text-base font-bold text-emerald-700">
                    {opsMetrics.hkRate.toFixed(0)}% Completed
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {opsMetrics.hkCompleted} of {housekeepingTasks.length} tasks clean/inspected
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <p className="font-semibold text-slate-900">Engineering &amp; Maintenance</p>
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {formatNgn(opsMetrics.mntEstCostNgn)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {opsMetrics.mntResolved} resolved · {opsMetrics.mntOpen} open tickets
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Costs & Staff Performance */}
      {(activeTab === 'overview' || activeTab === 'inventory_staff') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Inventory Valuation & Procurement Costs */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Inventory Costs &amp; Procurement
                </h2>
                <p className="text-xs text-slate-500">
                  PO Received: {formatNgn(inventoryMetrics.receivedPoNgn)} · Open POs:{' '}
                  {formatNgn(inventoryMetrics.pendingPoNgn)}
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-bold text-slate-900">
                Stock: {formatNgn(inventoryMetrics.totalValuationNgn)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Inventory Category</th>
                    <th className="px-4 py-2.5 font-semibold text-right">SKUs</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Low Stock</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Stock Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventoryMetrics.byCategory.map((cat) => (
                    <tr key={cat.category}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{cat.category}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right">{cat.skuCount}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right">
                        <span
                          className={
                            cat.lowStockCount > 0 ? 'text-amber-700 font-bold' : 'text-slate-500'
                          }
                        >
                          {cat.lowStockCount}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold">
                        {formatNgn(cat.valuationNgn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staff Performance & Payroll */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Staff Performance &amp; Payroll ({staffMembers.length} Staff)
                </h2>
                <p className="text-xs text-slate-500">
                  Shifts Completed: {opsMetrics.shiftsCompleted}/{current.periodShifts.length} (
                  {opsMetrics.shiftCompletionPct.toFixed(0)}%) · On-Time Attendance:{' '}
                  {opsMetrics.attPresent} (Late: {opsMetrics.attLate})
                </p>
              </div>
              <Users className="w-4 h-4 text-slate-500" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Employee</th>
                    <th className="px-4 py-2.5 font-semibold">Department</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Monthly Salary</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Shifts</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {opsMetrics.staffScorecard
                    .filter((row) => {
                      const q = reportSearch.trim().toLowerCase();
                      if (!q) return true;
                      return [row.staff.fullName, row.staff.staffCode, row.staff.department, row.staff.role]
                        .join(' ')
                        .toLowerCase()
                        .includes(q);
                    })
                    .map((row) => (
                    <tr key={row.staff.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{row.staff.fullName}</p>
                        <p className="text-[11px] font-mono-tabular text-slate-500">
                          {row.staff.staffCode}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{row.staff.department}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right font-semibold">
                        {formatNgn(row.monthlyCompNgn)}
                      </td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right">
                        {row.shiftsCompleted}/{row.shiftsAssigned}
                      </td>
                      <td className="px-4 py-2.5 font-mono-tabular text-right">
                        {row.onTimeCount}/{row.attendanceLogs}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
