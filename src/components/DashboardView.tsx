import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BedDouble,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Globe,
  ListFilter,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { syncOtaChannelWorkflow } from '../services/pmsService';
import {
  AttendanceRecord,
  BlockedDateRecord,
  formatBookingSourceLabel,
  formatNgn,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  GuestRecord,
  HousekeepingTaskRecord,
  isOtaBookingChannel,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  OtaIntegrationRecord,
  PortalMode,
  PosOrderRecord,
  PropertyRecord,
  PropertyUserAccountRecord,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  RoomRecord,
  ShiftScheduleRecord,
  sortRoomsByNumber,
  StaffMemberRecord,
  StaffRole,
  StaffSessionRecord,
} from '../types/pms';
import {
  diffNightsIso,
  getLocalIsoDate,
  matchesRoomRecord,
  normalizeIsoDate,
} from '../utils/availability';
import { CheckedInConfirmationInfo } from './CheckInProcessModal';
import { StaffDashboardView } from './StaffDashboardView';
import { DEFAULT_ROOM_COVER_IMAGE_URL, resolveAppImageUrl } from '../utils/mediaAssets';

interface DashboardViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates?: BlockedDateRecord[];
  otaChannels?: OtaIntegrationRecord[];
  guests?: GuestRecord[];
  userAccounts?: PropertyUserAccountRecord[];
  ledgerEntries?: LedgerEntryRecord[];
  posOrders: PosOrderRecord[];
  housekeepingTasks?: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  activeLicense?: LicenseRecord;
  canManageRooms: boolean;
  portalMode?: PortalMode;
  activeRole?: StaffRole;
  userUid?: string;
  userEmail?: string;
  userName?: string;
  staffMembers?: StaffMemberRecord[];
  staffSessions?: StaffSessionRecord[];
  shifts?: ShiftScheduleRecord[];
  attendance?: AttendanceRecord[];
  allowedSections?: NavSectionId[];
  actorRole?: string;
  onNotify?: (msg: string) => void;
  onGuestCheckedIn?: (info: CheckedInConfirmationInfo) => void;
  onNavigate: (section: NavSectionId) => void;
  onOpenReservationFolio: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk',
    intent?: 'view' | 'edit'
  ) => void;
  onInspectRoom?: (roomId: string) => void;
  onSignOut?: () => void;
}

const DEFAULT_HERO_SUITE_IMAGE = DEFAULT_ROOM_COVER_IMAGE_URL;

function addDaysIso(baseIso: string, delta: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + delta)).toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getWeekdayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function getTimeGreeting(): string {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

function getReservationStatusBadge(status: ReservationRecord['status']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'checked_in':
      return {
        label: 'Checked In',
        className: 'bg-emerald-100/90 text-emerald-800',
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        className: 'bg-sky-100/90 text-sky-800',
      };
    case 'pending':
      return {
        label: 'Booked',
        className: 'bg-purple-100/90 text-purple-800',
      };
    case 'checked_out':
      return {
        label: 'Checked Out',
        className: 'bg-slate-100 text-slate-700',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-rose-100 text-rose-700',
      };
    case 'no_show':
      return {
        label: 'No Show',
        className: 'bg-amber-100 text-amber-800',
      };
    default:
      return {
        label: RESERVATION_STATUS_LABELS[status] || status,
        className: 'bg-slate-100 text-slate-700',
      };
  }
}

export const DashboardView: React.FC<DashboardViewProps> = (props) => {
  // Preserve Staff View Dashboard without violating Rules of Hooks
  if (!props.canManageRooms || props.portalMode === 'staff') {
    return (
      <StaffDashboardView
        property={props.property}
        rooms={props.rooms}
        reservations={props.reservations}
        posOrders={props.posOrders}
        housekeepingTasks={props.housekeepingTasks ?? []}
        maintenanceTickets={props.maintenanceTickets}
        allowedSections={props.allowedSections}
        actorRole={props.actorRole ?? 'Property Admin'}
        activeRole={props.activeRole}
        userUid={props.userUid}
        userEmail={props.userEmail}
        userName={props.userName}
        staffMembers={props.staffMembers ?? []}
        staffSessions={props.staffSessions ?? []}
        shifts={props.shifts ?? []}
        attendance={props.attendance ?? []}
        onNotify={props.onNotify}
        onNavigate={props.onNavigate}
        onOpenReservationFolio={props.onOpenReservationFolio}
        onInspectRoom={props.onInspectRoom}
        onSignOut={props.onSignOut}
      />
    );
  }

  return <AdminDashboardView {...props} />;
};

const AdminDashboardView: React.FC<DashboardViewProps> = ({
  property,
  rooms,
  reservations,
  blockedDates = [],
  otaChannels = [],
  ledgerEntries = [],
  posOrders,
  maintenanceTickets,
  userName,
  actorRole = 'Property Admin',
  onNotify,
  onNavigate,
  onOpenReservationFolio,
}) => {
  const [perfRange, setPerfRange] = useState<'7d' | '14d' | '30d'>('7d');
  const todayIso = getLocalIsoDate();
  const yesterdayIso = addDaysIso(todayIso, -1);
  const [dashCalStartIso, setDashCalStartIso] = useState<string>(todayIso);
  const [dashCalDaysCount, setDashCalDaysCount] = useState<14 | 30>(14);
  const [syncingOta, setSyncingOta] = useState(false);
  const sortedRooms = useMemo(() => sortRoomsByNumber(rooms), [rooms]);

  const heroImageUrl = useMemo(() => {
    const firstWithImage = sortedRooms.find((r) => r.imageUrl && r.imageUrl.trim().length > 0);
    return resolveAppImageUrl(firstWithImage?.imageUrl, DEFAULT_HERO_SUITE_IMAGE);
  }, [sortedRooms]);

  const greetingName = useMemo(() => {
    const cleaned = (userName || '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'property operator') return 'Admin';
    return cleaned.split(/\s+/)[0] || 'Admin';
  }, [userName]);

  const metrics = useMemo(() => {
    const sellableRooms = rooms.filter((r) => r.occupancyStatus !== 'out_of_order');
    const totalInventory = sellableRooms.length > 0 ? sellableRooms.length : rooms.length;
    const activeNonCancelled = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );

    const resolveRoomKey = (r: ReservationRecord): string => {
      const matched = rooms.find((rm) => matchesRoomRecord(rm, r.roomId, r.roomNumber));
      if (matched) return `room:${matched.id}`;
      return `res:${r.id}`;
    };

    const countUniqueOccupiedOnDay = (dayIso: string, includeRoomStatusFlag: boolean): number => {
      const occupiedKeys = new Set<string>();
      if (includeRoomStatusFlag) {
        for (const rm of sellableRooms) {
          if (rm.occupancyStatus === 'occupied') {
            occupiedKeys.add(`room:${rm.id}`);
          }
        }
      }
      for (const r of activeNonCancelled) {
        const rIn = normalizeIsoDate(r.checkInDate);
        const rOutRaw = normalizeIsoDate(r.checkOutDate);
        const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
        const coversDay = rIn <= dayIso && dayIso < rOut;
        if (includeRoomStatusFlag && r.status === 'checked_in') {
          occupiedKeys.add(resolveRoomKey(r));
        } else if (coversDay) {
          occupiedKeys.add(resolveRoomKey(r));
        }
      }
      return Math.min(totalInventory, occupiedKeys.size);
    };

    const currentOccupied = countUniqueOccupiedOnDay(todayIso, true);
    const occupancyRate =
      totalInventory > 0 ? Math.min(100, Math.round((currentOccupied / totalInventory) * 100)) : 0;

    // Prior week occupancy rate (7 days ago)
    const lastWeekIso = addDaysIso(todayIso, -7);
    const lastWeekOccupied = countUniqueOccupiedOnDay(lastWeekIso, false);
    const lastWeekOccRate =
      totalInventory > 0 ? Math.min(100, Math.round((lastWeekOccupied / totalInventory) * 100)) : 0;
    const occDelta = occupancyRate - lastWeekOccRate;

    // Arrivals today (scheduled today + overdue un-checked-in) vs yesterday's scheduled arrivals
    const arrivalsToday = activeNonCancelled.filter((r) => {
      const rIn = normalizeIsoDate(r.checkInDate);
      if (rIn === todayIso) return true;
      return (r.status === 'confirmed' || r.status === 'pending') && rIn < todayIso;
    }).length;
    const arrivalsYesterday = activeNonCancelled.filter(
      (r) => normalizeIsoDate(r.checkInDate) === yesterdayIso
    ).length;
    const arrivalsDelta = arrivalsToday - arrivalsYesterday;

    // Departures today (checked-in due today/overdue + already checked-out today) vs yesterday's departures
    const departuresToday = activeNonCancelled.filter((r) => {
      const rOut = normalizeIsoDate(r.checkOutDate);
      if (r.status === 'checked_in' && rOut <= todayIso) return true;
      if (r.status === 'checked_out' && rOut === todayIso) return true;
      return false;
    }).length;
    const departuresYesterday = activeNonCancelled.filter(
      (r) => normalizeIsoDate(r.checkOutDate) === yesterdayIso
    ).length;
    const departuresDelta = departuresToday - departuresYesterday;

    // Daily revenue: strictly money received in ledger (never count unreceived/pending OTA bookings as hotel revenue)
    const computeDailyRevenueNgn = (targetIso: string): number => {
      const dayLedger = ledgerEntries.filter(
        (e) => e.entryType === 'revenue' && normalizeIsoDate(e.entryDate) === targetIso
      );
      const ledgerTotal = dayLedger.reduce((sum, e) => sum + (Number(e.amountNgn) || 0), 0);
      return Math.round(ledgerTotal);
    };

    const revenueToday = computeDailyRevenueNgn(todayIso);
    const revenueLastWeek = computeDailyRevenueNgn(lastWeekIso);
    const revenueDeltaPct =
      revenueLastWeek > 0
        ? Math.round(((revenueToday - revenueLastWeek) / revenueLastWeek) * 100)
        : revenueToday > 0
          ? 100
          : 0;

    return {
      occupancyRate,
      occDelta,
      arrivalsToday,
      arrivalsDelta,
      departuresToday,
      departuresDelta,
      revenueToday,
      revenueDeltaPct,
    };
  }, [rooms, reservations, ledgerEntries, property.usdExchangeRateNgn, todayIso, yesterdayIso]);

  // Financial Overview (OTA Prepayments, Payments Received by Hotel, Outstanding Balance at Property)
  const financialOverview = useMemo(() => {
    const activeReservations = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );
    let otaPrepaymentsNgn = 0;
    let otaExpectedPayoutNgn = 0;
    let otaPrepaidCount = 0;
    let otaPendingPayoutCount = 0;
    let otaReceivedPayoutCount = 0;
    let paymentsReceivedNgn = 0;
    let paymentsReceivedCount = 0;
    let outstandingBalanceNgn = 0;
    let outstandingCount = 0;

    for (const r of activeReservations) {
      const pay = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
      if (pay.paymentCollectionMode === 'ota_prepaid') {
        otaPrepaymentsNgn += pay.otaPaidAmount > 0 ? pay.otaPaidAmount : pay.expectedPayoutNgn;
        otaExpectedPayoutNgn += pay.expectedPayoutNgn;
        otaPrepaidCount += 1;
        if (pay.otaPayoutStatus === 'received') {
          otaReceivedPayoutCount += 1;
        } else {
          otaPendingPayoutCount += 1;
        }
      }
      if (pay.totalReceivedByHotelNgn > 0) {
        paymentsReceivedNgn += pay.totalReceivedByHotelNgn;
        paymentsReceivedCount += 1;
      }
      if (pay.amountDueAtPropertyNgn > 0) {
        outstandingBalanceNgn += pay.amountDueAtPropertyNgn;
        outstandingCount += 1;
      }
    }

    return {
      otaPrepaymentsNgn: Math.round(otaPrepaymentsNgn),
      otaExpectedPayoutNgn: Math.round(otaExpectedPayoutNgn),
      otaPrepaidCount,
      otaPendingPayoutCount,
      otaReceivedPayoutCount,
      paymentsReceivedNgn: Math.round(paymentsReceivedNgn),
      paymentsReceivedCount,
      outstandingBalanceNgn: Math.round(outstandingBalanceNgn),
      outstandingCount,
    };
  }, [reservations, property.usdExchangeRateNgn]);

  // Booking Performance Bar Chart Data (active stays per day)
  const bookingPerformance = useMemo(() => {
    const days = perfRange === '7d' ? 7 : perfRange === '14d' ? 14 : 30;
    const validRes = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );

    const series: Array<{ iso: string; label: string; count: number }> = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const iso = addDaysIso(todayIso, -offset);
      const count = validRes.filter((r) => {
        const rIn = normalizeIsoDate(r.checkInDate);
        const rOutRaw = normalizeIsoDate(r.checkOutDate);
        const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
        return rIn <= iso && iso < rOut;
      }).length;
      series.push({
        iso,
        label: days === 7 ? getWeekdayShort(iso) : iso.slice(5),
        count,
      });
    }

    const maxCount = Math.max(4, ...series.map((s) => s.count));
    const yMax = Math.ceil(maxCount / 2) * 2;
    return { series, yMax };
  }, [reservations, perfRange, todayIso]);

  // Occupancy Trend Area Chart (Last 7 days ending today — unique rooms deduplicated)
  const occupancyTrend = useMemo(() => {
    const sellableRooms = rooms.filter((r) => r.occupancyStatus !== 'out_of_order');
    const totalInventory = Math.max(1, sellableRooms.length > 0 ? sellableRooms.length : rooms.length);
    const validRes = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );
    const points: Array<{ iso: string; label: string; pct: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const iso = addDaysIso(todayIso, -offset);
      const uniqueRoomsOnDay = new Set<string>();
      for (const r of validRes) {
        const rIn = normalizeIsoDate(r.checkInDate);
        const rOutRaw = normalizeIsoDate(r.checkOutDate);
        const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
        if (rIn <= iso && iso < rOut) {
          const matched = rooms.find((rm) => matchesRoomRecord(rm, r.roomId, r.roomNumber));
          uniqueRoomsOnDay.add(matched ? `room:${matched.id}` : `res:${r.id}`);
        }
      }
      const pct =
        offset === 0
          ? metrics.occupancyRate
          : Math.min(100, Math.round((uniqueRoomsOnDay.size / totalInventory) * 100));
      points.push({
        iso,
        label: getWeekdayShort(iso),
        pct,
      });
    }
    return points;
  }, [rooms, reservations, todayIso, metrics.occupancyRate]);

  // Current In-House (Checked-In) Guests sorted by soonest check-out
  const inHouseGuests = useMemo(() => {
    return [...reservations]
      .filter((r) => r.status === 'checked_in')
      .sort((a, b) =>
        normalizeIsoDate(a.checkOutDate).localeCompare(normalizeIsoDate(b.checkOutDate))
      );
  }, [reservations]);

  // Check-Outs Due (checked-in guests departing today or overdue)
  const checkOutsDue = useMemo(() => {
    return inHouseGuests.filter((r) => normalizeIsoDate(r.checkOutDate) <= todayIso);
  }, [inHouseGuests, todayIso]);

  // Recent & Upcoming Active Reservations (top 10 so synced OTA stays are clearly visible)
  const recentReservations = useMemo(() => {
    return [...reservations]
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .sort((a, b) =>
        normalizeIsoDate(b.checkInDate).localeCompare(normalizeIsoDate(a.checkInDate))
      )
      .slice(0, 10);
  }, [reservations]);

  // Dashboard Calendar Data (live synced with Reservations & OTA iCal feeds)
  const dashCalDays = useMemo(() => {
    return Array.from({ length: dashCalDaysCount }, (_, idx) => {
      const iso = addDaysIso(dashCalStartIso, idx);
      const d = new Date(`${iso}T00:00:00Z`);
      return {
        iso,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        dayNum: d.getUTCDate(),
        monthShort: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        isToday: iso === todayIso,
      };
    });
  }, [dashCalStartIso, dashCalDaysCount, todayIso]);

  const activeCalendarReservations = useMemo(() => {
    return reservations
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .sort((a, b) =>
        normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
      );
  }, [reservations]);

  const currentAndUpcomingReservations = useMemo(() => {
    return activeCalendarReservations.filter((r) => {
      const out = normalizeIsoDate(r.checkOutDate);
      return r.status === 'checked_in' || out >= todayIso;
    });
  }, [activeCalendarReservations, todayIso]);

  const channelSummaryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of currentAndUpcomingReservations) {
      const label = formatBookingSourceLabel(r.channel);
      map.set(label, (map.get(label) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [currentAndUpcomingReservations]);

  const connectedOtaWithFeed = useMemo(
    () =>
      otaChannels.filter(
        (ch) => Boolean((ch.icalImportUrl || '').trim()) || ch.connected
      ),
    [otaChannels]
  );

  const handleDashboardSyncOta = async () => {
    if (syncingOta) return;
    const feedChannels = otaChannels.filter((ch) => Boolean((ch.icalImportUrl || '').trim()));
    if (feedChannels.length === 0) {
      onNavigate('ota_channels');
      onNotify?.('No OTA iCal import feeds configured yet. Connect Airbnb or Booking.com in Channel Manager.');
      return;
    }
    setSyncingOta(true);
    let totalImported = 0;
    let totalUpdated = 0;
    let totalEvents = 0;
    let failedCount = 0;
    try {
      for (const ch of feedChannels) {
        try {
          const result = await syncOtaChannelWorkflow({
            property,
            channel: ch,
            rooms,
            reservations,
            actorRole,
          });
          totalImported += result.created;
          totalUpdated += result.updated;
          totalEvents += result.totalEvents;
        } catch {
          failedCount += 1;
        }
      }
      onNotify?.(
        failedCount > 0
          ? `Channel refresh finished with ${failedCount} feed warning(s): ${totalImported} new, ${totalUpdated} updated (${totalEvents} feed events).`
          : `Channel calendars refreshed: ${totalImported} new booking(s), ${totalUpdated} updated across ${totalEvents} feed event(s).`
      );
    } finally {
      setSyncingOta(false);
    }
  };

  // SVG geometry for Occupancy Trend Area Chart
  const trendSvg = useMemo(() => {
    const W = 420;
    const H = 170;
    const padL = 34;
    const padR = 14;
    const padT = 16;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const coords = occupancyTrend.map((pt, idx) => {
      const x =
        occupancyTrend.length > 1
          ? padL + (idx / (occupancyTrend.length - 1)) * plotW
          : padL + plotW / 2;
      const y = padT + plotH - (pt.pct / 100) * plotH;
      return { ...pt, x, y };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
        : '';

    return { W, H, padL, padT, plotH, coords, linePath, areaPath };
  }, [occupancyTrend]);

  return (
    <div className="space-y-5">
      {/* 1. Compact Greeting Header */}
      <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden min-h-[88px] flex items-center">
        <div className="relative z-10 px-5 py-4 max-w-xl">
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight leading-snug">
            <span className="text-[#0a367a]">{getTimeGreeting()},</span>{' '}
            <span className="text-slate-900">{greetingName}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Live overview for{' '}
            <span className="font-semibold text-slate-800">{property.name}</span>.
          </p>
        </div>

        <div className="hidden sm:block absolute inset-y-0 right-0 w-[42%] lg:w-[38%] pointer-events-none">
          <img
            src={heroImageUrl}
            alt={property.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />
        </div>
      </div>

      {/* 2. Four Essential KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Occupancy Rate */}
        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="text-left bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-4 flex items-center gap-3.5 transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Occupancy Rate</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {metrics.occupancyRate}%
            </p>
            <p
              className={`text-[11px] font-semibold mt-0.5 font-mono-tabular ${
                metrics.occDelta >= 0 ? 'text-[#0a367a]' : 'text-rose-700'
              }`}
            >
              {metrics.occDelta >= 0 ? '↑ +' : '↓ '}
              {metrics.occDelta}% vs last week
            </p>
          </div>
        </button>

        {/* Arrivals */}
        <button
          type="button"
          onClick={() => onNavigate('arrivals')}
          className="text-left bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-4 flex items-center gap-3.5 transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Arrivals</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {String(metrics.arrivalsToday).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-[#1557b0] mt-0.5 font-mono-tabular">
              {metrics.arrivalsDelta >= 0 ? '↑ +' : '↓ '}
              {metrics.arrivalsDelta} vs yesterday
            </p>
          </div>
        </button>

        {/* Departures */}
        <button
          type="button"
          onClick={() => onNavigate('in_house')}
          className="text-left bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-4 flex items-center gap-3.5 transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Departures</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {String(metrics.departuresToday).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 font-mono-tabular">
              {metrics.departuresDelta >= 0 ? '↑ +' : '↓ '}
              {metrics.departuresDelta} vs yesterday
            </p>
          </div>
        </button>

        {/* Today's Revenue */}
        <button
          type="button"
          onClick={() => onNavigate('accounting')}
          className="text-left bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-4 flex items-center gap-3.5 transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Today&apos;s Revenue</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5 truncate">
              {formatNgn(metrics.revenueToday)}
            </p>
            <p
              className={`text-[11px] font-semibold mt-0.5 font-mono-tabular ${
                metrics.revenueDeltaPct >= 0 ? 'text-[#0a367a]' : 'text-rose-700'
              }`}
            >
              {metrics.revenueDeltaPct >= 0 ? '↑ +' : '↓ '}
              {metrics.revenueDeltaPct}% vs last week
            </p>
          </div>
        </button>
      </div>

      {/* 2b. Financial Overview */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-[#061f4d]">
              Financial Overview
            </h2>
            <p className="text-xs text-slate-500">
              Payment position across OTA channels and direct property settlements
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a367a] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Detailed Payments</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="text-left bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-4 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">OTA Prepayments</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-1.5 truncate">
              {formatNgn(financialOverview.otaPrepaymentsNgn)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 font-mono-tabular">
              {financialOverview.otaPendingPayoutCount} pending ·{' '}
              {financialOverview.otaReceivedPayoutCount} received · Exp.{' '}
              <span className="font-semibold text-[#0a367a]">
                {formatNgn(financialOverview.otaExpectedPayoutNgn)}
              </span>
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="text-left bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-4 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Payments Received</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#0a367a] mt-1.5 truncate">
              {formatNgn(financialOverview.paymentsReceivedNgn)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Direct receipts &amp; settled OTA payouts across{' '}
              <span className="font-mono-tabular font-semibold text-slate-800">
                {financialOverview.paymentsReceivedCount}
              </span>{' '}
              stay{financialOverview.paymentsReceivedCount === 1 ? '' : 's'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="text-left bg-white border border-slate-200 hover:border-rose-300 rounded-xl p-4 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Outstanding Balance</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <p
              className={`font-display font-mono-tabular text-xl sm:text-2xl font-extrabold mt-1.5 truncate ${
                financialOverview.outstandingBalanceNgn > 0 ? 'text-rose-700' : 'text-[#061f4d]'
              }`}
            >
              {formatNgn(financialOverview.outstandingBalanceNgn)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {financialOverview.outstandingCount > 0 ? (
                <>
                  <span className="font-mono-tabular font-semibold text-rose-700">
                    {financialOverview.outstandingCount}
                  </span>{' '}
                  reservation{financialOverview.outstandingCount === 1 ? '' : 's'} with balance due
                </>
              ) : (
                'All active folios settled'
              )}
            </p>
          </button>
        </div>
      </div>

      {/* 3. Middle Row: Booking Performance Bar Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Booking Performance */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-200" />
              <h2 className="font-display text-sm font-bold text-white">
                Booking Performance
              </h2>
            </div>

            <select
              aria-label="Booking performance period"
              value={perfRange}
              onChange={(e) => setPerfRange(e.target.value as '7d' | '14d' | '30d')}
              className="h-7 px-2.5 rounded-lg border border-white/25 bg-white/10 text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              <option value="7d" className="text-slate-900">Last 7 Days</option>
              <option value="14d" className="text-slate-900">Last 14 Days</option>
              <option value="30d" className="text-slate-900">Last 30 Days</option>
            </select>
          </div>

          <div className="p-4">
            <div className="relative h-56 flex items-end gap-2 sm:gap-4 pt-6 pb-2 pl-7 pr-2">
              {/* Horizontal Y-Axis Gridlines */}
              <div className="absolute inset-x-0 top-6 bottom-8 left-7 right-2 flex flex-col justify-between pointer-events-none">
                {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                  <div key={ratio} className="relative flex items-center w-full">
                    <span className="absolute -left-7 text-xs font-mono-tabular text-slate-400 w-5 text-right">
                      {Math.round(bookingPerformance.yMax * ratio)}
                    </span>
                    <div className="w-full border-t border-slate-100" />
                  </div>
                ))}
              </div>

              {/* Bars */}
              {bookingPerformance.series.map((bar) => {
                const pct =
                  bookingPerformance.yMax > 0
                    ? Math.round((bar.count / bookingPerformance.yMax) * 100)
                    : 0;
                return (
                  <button
                    key={bar.iso}
                    type="button"
                    onClick={() => onNavigate('reservations')}
                    title={`${bar.iso}: ${bar.count} active/booked reservation${bar.count === 1 ? '' : 's'}`}
                    className="relative z-10 flex-1 h-full flex flex-col items-center justify-end gap-1.5 group cursor-pointer"
                  >
                    <span className="font-mono-tabular text-xs font-bold text-[#061f4d]">
                      {perfRange === '30d' && bar.count === 0 ? '' : bar.count}
                    </span>
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        className={`w-full ${
                          perfRange === '7d'
                            ? 'max-w-[44px]'
                            : perfRange === '14d'
                              ? 'max-w-[26px]'
                              : 'max-w-[14px]'
                        } rounded-t-md bg-[#1557b0] group-hover:bg-[#0a367a] transition-colors`}
                        style={{
                          height: `${bar.count > 0 ? Math.max(8, pct) : 2}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                      {perfRange === '30d' ? bar.label.slice(3) : bar.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="lg:col-span-4 bg-[#0a367a] rounded-xl p-4 text-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-blue-200" />
            <h2 className="font-display text-sm font-bold text-white">Quick Actions</h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 flex-1">
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-lg p-3.5 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold leading-tight text-[#061f4d]">New Reservation</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('arrivals')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-lg p-3.5 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <LogIn className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold leading-tight text-[#061f4d]">Check In</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('in_house')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-lg p-3.5 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold leading-tight text-[#061f4d]">Check Out</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('pos_kitchen')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-lg p-3.5 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold leading-tight text-[#061f4d]">Point of Sale</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="mt-2.5 w-full py-2 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5 text-blue-200" />
            <span>Payments &amp; Ledger</span>
          </button>
        </div>
      </div>

      {/* 4. In-House Guests + Check-Outs Due Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* In-House Guests */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-blue-200" />
              <h2 className="font-display text-sm font-bold text-white">
                In-House Guests
              </h2>
              <span className="px-2 py-0.5 rounded bg-white/15 text-[11px] font-bold font-mono-tabular text-white">
                {inHouseGuests.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('in_house')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-100 hover:text-white cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {inHouseGuests.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No guests are currently checked in. Use <strong>Check In</strong> to check in an arrival or walk-in guest.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Guest Name</th>
                    <th className="py-2.5 px-3">Room</th>
                    <th className="py-2.5 px-3">Stay</th>
                    <th className="py-2.5 px-3">Balance</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inHouseGuests.slice(0, 6).map((res) => {
                    const roomDisp = getReservationRoomDisplay(res, rooms);
                    const pay = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
                    const isOta = isOtaBookingChannel(res.channel);
                    const checkOutNorm = normalizeIsoDate(res.checkOutDate);
                    const isDueOut = checkOutNorm <= todayIso;
                    return (
                      <tr
                        key={res.id}
                        onClick={() => onOpenReservationFolio(res.id, 'front_desk')}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-5 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{res.guestName}</div>
                          {isOta && (
                            <div className="text-xs font-medium text-orange-700">
                              {formatBookingSourceLabel(res.channel)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular font-semibold text-slate-700 whitespace-nowrap">
                          {roomDisp.isAssigned ? roomDisp.roomNumberLabel : 'Unassigned'}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatShortDate(res.checkInDate)} → {formatShortDate(res.checkOutDate)}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                          {pay.balance > 0 ? (
                            <span className="font-semibold text-rose-700">
                              {formatNgn(pay.balance)}
                            </span>
                          ) : (
                            <span className="font-semibold text-[#0a367a]">Settled</span>
                          )}
                        </td>
                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                              isDueOut
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-[#0a367a]'
                            }`}
                          >
                            {isDueOut ? 'Due Out' : 'Checked In'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Check-Outs Due */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LogOut className="w-4 h-4 text-blue-200" />
              <h2 className="font-display text-sm font-bold text-white">
                Check-Outs Due
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono-tabular bg-white/15 text-white">
                {checkOutsDue.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('in_house')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-100 hover:text-white cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {checkOutsDue.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 my-auto">
              No check-outs due today. All scheduled departures are clear.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {checkOutsDue.slice(0, 6).map((res) => {
                const roomDisp = getReservationRoomDisplay(res, rooms);
                const pay = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
                const checkOutNorm = normalizeIsoDate(res.checkOutDate);
                const isOverdue = checkOutNorm < todayIso;
                return (
                  <div
                    key={res.id}
                    onClick={() => onOpenReservationFolio(res.id, 'front_desk')}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-blue-50/40 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                          {res.guestName}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${
                            isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isOverdue ? 'Overdue' : 'Due Today'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                        {roomDisp.isAssigned ? roomDisp.roomNumberLabel : 'Unassigned'} · Out{' '}
                        {formatShortDate(res.checkOutDate)} ·{' '}
                        {pay.balance > 0 ? (
                          <span className="font-semibold text-rose-700">
                            Bal {formatNgn(pay.balance)}
                          </span>
                        ) : (
                          <span className="font-semibold text-[#0a367a]">Paid</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenReservationFolio(res.id, 'front_desk');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    >
                      Check Out
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. Recent Reservations Table + Occupancy Trend Line Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Reservations */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-blue-200" />
              <h2 className="font-display text-sm font-bold text-white">
                Recent Reservations
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-100 hover:text-white cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentReservations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No active reservations yet. Click <strong>New Reservation</strong> to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Guest Name</th>
                    <th className="py-2.5 px-3">Room</th>
                    <th className="py-2.5 px-3">Check-in</th>
                    <th className="py-2.5 px-3">Check-out</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentReservations.map((res) => {
                    const roomDisp = getReservationRoomDisplay(res, rooms);
                    const badge = getReservationStatusBadge(res.status);
                    return (
                      <tr
                        key={res.id}
                        onClick={() => onOpenReservationFolio(res.id, 'reservations')}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{res.guestName}</div>
                          <div className="text-[11px] font-medium text-slate-500">
                            {formatBookingSourceLabel(res.channel)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                          {roomDisp.isAssigned ? roomDisp.roomNumberLabel : 'Unassigned'}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatShortDate(res.checkInDate)}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatShortDate(res.checkOutDate)}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Occupancy Trend Area Chart */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-200" />
              <h2 className="font-display text-sm font-bold text-white">
                Occupancy Trend
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded bg-white/15 text-white font-mono-tabular text-[11px] font-bold">
              {metrics.occupancyRate}%
            </span>
          </div>

          <div className="p-4 w-full">
            <svg
              viewBox={`0 0 ${trendSvg.W} ${trendSvg.H}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="7-day occupancy trend chart"
            >
              <defs>
                <linearGradient id="occAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1557b0" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#1557b0" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[100, 75, 50, 25, 0].map((val) => {
                const y = trendSvg.padT + trendSvg.plotH - (val / 100) * trendSvg.plotH;
                return (
                  <g key={val}>
                    <line
                      x1={trendSvg.padL}
                      y1={y}
                      x2={trendSvg.W - 14}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={trendSvg.padL - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono-tabular"
                    >
                      {val}%
                    </text>
                  </g>
                );
              })}

              {trendSvg.areaPath && <path d={trendSvg.areaPath} fill="url(#occAreaGrad)" />}
              {trendSvg.linePath && (
                <path
                  d={trendSvg.linePath}
                  fill="none"
                  stroke="#0a367a"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {trendSvg.coords.map((pt) => (
                <g key={pt.iso}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill="#0a367a"
                    stroke="#ffffff"
                    strokeWidth="2"
                  >
                    <title>{`${pt.iso}: ${pt.pct}% occupied`}</title>
                  </circle>
                  <text
                    x={pt.x}
                    y={trendSvg.H - 6}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-medium"
                  >
                    {pt.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* 6. Live Dashboard Reservations & OTA Availability Calendar (Placed right before footer) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-[#0a367a] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-200" />
              <h2 className="font-display text-sm font-bold text-white">
                Reservations &amp; OTA Calendar
              </h2>
              <span className="px-2 py-0.5 rounded bg-white/15 text-[11px] font-bold font-mono-tabular text-white">
                {currentAndUpcomingReservations.length} active/upcoming
              </span>
            </div>
            <p className="text-[11px] text-blue-100 mt-0.5">
              Live room schedule across Direct, Airbnb, Booking.com &amp; blocked dates
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDashCalStartIso((d) => addDaysIso(d, -7))}
                className="p-1.5 rounded-md hover:bg-white/15 text-white cursor-pointer"
                aria-label="Previous week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDashCalStartIso(todayIso)}
                className="px-2.5 py-1 rounded-md hover:bg-white/15 font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDashCalStartIso((d) => addDaysIso(d, 7))}
                className="p-1.5 rounded-md hover:bg-white/15 text-white cursor-pointer"
                aria-label="Next week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDashCalDaysCount(14)}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  dashCalDaysCount === 14 ? 'bg-white text-[#0a367a] shadow-xs' : 'text-blue-100'
                }`}
              >
                14d
              </button>
              <button
                type="button"
                onClick={() => setDashCalDaysCount(30)}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  dashCalDaysCount === 30 ? 'bg-white text-[#0a367a] shadow-xs' : 'text-blue-100'
                }`}
              >
                30d
              </button>
            </div>

            {connectedOtaWithFeed.length > 0 && (
              <button
                type="button"
                disabled={syncingOta}
                onClick={handleDashboardSyncOta}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/25 bg-white/15 hover:bg-white/25 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingOta ? 'animate-spin' : ''}`} />
                <span>{syncingOta ? 'Refreshing…' : 'Refresh Channels'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-[#0a367a] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Full Calendar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Channel Breakdown & Jump Chips */}
        {currentAndUpcomingReservations.length > 0 && (
          <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">
                Channel Bookings:
              </span>
              {channelSummaryCounts.map(([chLabel, count]) => (
                <span
                  key={chLabel}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700 font-mono-tabular"
                >
                  <span>{chLabel}:</span>
                  <span className="text-[#0a367a]">{count}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {currentAndUpcomingReservations.slice(0, 12).map((res) => {
                const isOta = isOtaBookingChannel(res.channel);
                const rIn = normalizeIsoDate(res.checkInDate);
                const roomDisp = getReservationRoomDisplay(res, rooms);
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      if (rIn) setDashCalStartIso(rIn);
                    }}
                    onDoubleClick={() => onOpenReservationFolio(res.id, 'reservations')}
                    title="Click to jump calendar to stay dates · Double-click to open folio"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isOta
                        ? 'bg-orange-50/90 border-orange-200 text-orange-900 hover:bg-orange-100'
                        : 'bg-blue-50/80 border-blue-200 text-[#0a367a] hover:bg-blue-100'
                    }`}
                  >
                    <span className="font-bold">
                      {roomDisp.isAssigned ? roomDisp.roomNumberLabel : 'Unassigned'}
                    </span>
                    <span>·</span>
                    <span className="max-w-[120px] truncate">{res.guestName}</span>
                    <span className="font-mono-tabular opacity-80">
                      ({res.checkInDate.slice(5)} → {res.checkOutDate.slice(5)})
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-white/80 text-[10px] font-bold">
                      {formatBookingSourceLabel(res.channel)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Compact Live Tape Matrix */}
        {sortedRooms.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            Add rooms to view your live availability calendar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-slate-50 py-2.5 px-4 text-left font-bold text-slate-700 w-40 border-r border-slate-200">
                    Room
                  </th>
                  {dashCalDays.map((day) => (
                    <th
                      key={day.iso}
                      className={`py-2 px-1 text-center font-mono-tabular border-r border-slate-100 min-w-[48px] ${
                        day.isToday ? 'bg-blue-50 text-[#0a367a]' : 'text-slate-600'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold opacity-75">
                        {day.weekday}
                      </div>
                      <div className="font-bold text-xs leading-tight">{day.dayNum}</div>
                      <div className="text-[10px] opacity-60">{day.monthShort}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRooms.map((room) => {
                  const roomResList = activeCalendarReservations.filter((r) =>
                    matchesRoomRecord(room, r.roomId, r.roomNumber)
                  );
                  const roomBlocks = blockedDates.filter(
                    (b) =>
                      b.roomId === room.id ||
                      b.roomId === 'ALL' ||
                      (b.roomNumber && b.roomNumber === room.roomNumber)
                  );
                  return (
                    <tr key={room.id} className="hover:bg-slate-50/40">
                      <td className="sticky left-0 z-10 bg-white py-2.5 px-4 border-r border-slate-200 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{room.roomNumber}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[130px]">
                          {room.roomType}
                        </div>
                      </td>
                      {dashCalDays.map((day) => {
                        const matchingRes = roomResList.filter((r) => {
                          const rIn = normalizeIsoDate(r.checkInDate);
                          const rOutRaw = normalizeIsoDate(r.checkOutDate);
                          const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
                          return rIn <= day.iso && day.iso < rOut;
                        });
                        const matchingBlock = roomBlocks.find((b) => {
                          const bStart = normalizeIsoDate(b.startDate);
                          const bEnd = normalizeIsoDate(b.endDate);
                          return (
                            bStart <= day.iso &&
                            day.iso < (bEnd > bStart ? bEnd : addDaysIso(bStart, 1))
                          );
                        });

                        return (
                          <td
                            key={day.iso}
                            className={`p-0.5 align-top border-r border-slate-100 ${
                              day.isToday
                                ? 'bg-blue-50/35'
                                : day.iso < todayIso
                                  ? 'bg-slate-100/80'
                                  : ''
                            }`}
                          >
                            {matchingRes.length > 0 ? (
                              <div className="space-y-0.5">
                                {matchingRes.map((res) => {
                                  const isStart = normalizeIsoDate(res.checkInDate) === day.iso;
                                  const isOta = isOtaBookingChannel(res.channel);
                                  const barColor =
                                    res.status === 'checked_in'
                                      ? 'bg-[#0a367a] text-white'
                                      : isOta
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-[#1557b0] text-white';
                                  return (
                                    <button
                                      key={res.id}
                                      type="button"
                                      onClick={() => onOpenReservationFolio(res.id, 'reservations')}
                                      title={`${res.guestName} · ${formatBookingSourceLabel(res.channel)} · ${res.checkInDate} → ${res.checkOutDate} (${RESERVATION_STATUS_LABELS[res.status]})`}
                                      className={`w-full block text-left px-1 py-1 rounded text-[10px] font-bold truncate transition-opacity hover:opacity-90 cursor-pointer ${barColor}`}
                                    >
                                      {isStart || day.iso === dashCalStartIso
                                        ? res.guestName
                                        : '\u00A0'}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : matchingBlock ? (
                              <div
                                title={`Blocked (${matchingBlock.category || 'Hold'}): ${matchingBlock.reason || 'Unavailable'}`}
                                className="w-full px-1 py-1 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold flex items-center justify-center"
                              >
                                <Lock className="w-3 h-3" />
                              </div>
                            ) : (
                              <div className="h-6" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
