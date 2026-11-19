import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  Calendar,
  CalendarPlus,
  CreditCard,
  ListFilter,
  LogIn,
  LogOut,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  AttendanceRecord,
  formatNgn,
  getReservationRoomDisplay,
  GuestRecord,
  HousekeepingTaskRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  NavSectionId,
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
import { CheckedInConfirmationInfo } from './CheckInProcessModal';
import { StaffDashboardView } from './StaffDashboardView';

interface DashboardViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
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

const DEFAULT_HERO_SUITE_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

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

export const DashboardView: React.FC<DashboardViewProps> = ({
  property,
  rooms,
  reservations,
  ledgerEntries = [],
  posOrders,
  housekeepingTasks = [],
  maintenanceTickets,
  canManageRooms,
  portalMode,
  activeRole,
  userUid,
  userEmail,
  userName,
  staffMembers = [],
  staffSessions = [],
  shifts = [],
  attendance = [],
  allowedSections,
  actorRole = 'Property Admin',
  onNotify,
  onNavigate,
  onOpenReservationFolio,
  onInspectRoom,
  onSignOut,
}) => {
  const [perfRange, setPerfRange] = useState<'7d' | '14d' | '30d'>('7d');
  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = addDaysIso(todayIso, -1);
  const sortedRooms = useMemo(() => sortRoomsByNumber(rooms), [rooms]);

  // Preserve Staff View Dashboard
  if (!canManageRooms || portalMode === 'staff') {
    return (
      <StaffDashboardView
        property={property}
        rooms={rooms}
        reservations={reservations}
        posOrders={posOrders}
        housekeepingTasks={housekeepingTasks}
        maintenanceTickets={maintenanceTickets}
        allowedSections={allowedSections}
        actorRole={actorRole}
        activeRole={activeRole}
        userUid={userUid}
        userEmail={userEmail}
        userName={userName}
        staffMembers={staffMembers}
        staffSessions={staffSessions}
        shifts={shifts}
        attendance={attendance}
        onNotify={onNotify}
        onNavigate={onNavigate}
        onOpenReservationFolio={onOpenReservationFolio}
        onInspectRoom={onInspectRoom}
        onSignOut={onSignOut}
      />
    );
  }

  const heroImageUrl = useMemo(() => {
    const firstWithImage = sortedRooms.find((r) => r.imageUrl && r.imageUrl.trim().length > 0);
    return firstWithImage?.imageUrl || DEFAULT_HERO_SUITE_IMAGE;
  }, [sortedRooms]);

  const greetingName = useMemo(() => {
    const cleaned = (userName || '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'property operator') return 'Admin';
    return cleaned.split(/\s+/)[0] || 'Admin';
  }, [userName]);

  const metrics = useMemo(() => {
    const totalRooms = rooms.length;
    const activeNonCancelled = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );

    const occupiedRoomsCount = rooms.filter((r) => r.occupancyStatus === 'occupied').length;
    const activeTodayFromRes = activeNonCancelled.filter(
      (r) =>
        r.status === 'checked_in' ||
        ((r.status === 'confirmed' || r.status === 'pending') &&
          r.checkInDate <= todayIso &&
          r.checkOutDate > todayIso)
    ).length;

    const currentOccupied = Math.max(occupiedRoomsCount, Math.min(totalRooms, activeTodayFromRes));
    const occupancyRate =
      totalRooms > 0 ? Math.min(100, Math.round((currentOccupied / totalRooms) * 100)) : 0;

    // Prior week occupancy rate (7 days ago)
    const lastWeekIso = addDaysIso(todayIso, -7);
    const lastWeekOccupied = activeNonCancelled.filter(
      (r) => r.checkInDate <= lastWeekIso && r.checkOutDate > lastWeekIso
    ).length;
    const lastWeekOccRate =
      totalRooms > 0 ? Math.min(100, Math.round((lastWeekOccupied / totalRooms) * 100)) : 0;
    const occDelta = occupancyRate - lastWeekOccRate;

    // Arrivals today vs yesterday
    const arrivalsToday = reservations.filter(
      (r) =>
        (r.status === 'confirmed' || r.status === 'pending') &&
        r.checkInDate <= todayIso
    ).length;
    const arrivalsYesterday = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show' && r.checkInDate === yesterdayIso
    ).length;
    const arrivalsDelta = arrivalsToday - arrivalsYesterday;

    // Departures today vs yesterday
    const departuresToday = reservations.filter(
      (r) => r.status === 'checked_in' && r.checkOutDate <= todayIso
    ).length;
    const departuresYesterday = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show' && r.checkOutDate === yesterdayIso
    ).length;
    const departuresDelta = departuresToday - departuresYesterday;

    // Today's revenue vs same day last week
    const revenueToday = ledgerEntries
      .filter((e) => e.entryType === 'revenue' && e.entryDate === todayIso)
      .reduce((sum, e) => sum + (Number(e.amountNgn) || 0), 0);
    const revenueLastWeek = ledgerEntries
      .filter((e) => e.entryType === 'revenue' && e.entryDate === lastWeekIso)
      .reduce((sum, e) => sum + (Number(e.amountNgn) || 0), 0);
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
  }, [rooms, reservations, ledgerEntries, todayIso, yesterdayIso]);

  // Booking Performance Bar Chart Data
  const bookingPerformance = useMemo(() => {
    const days = perfRange === '7d' ? 7 : perfRange === '14d' ? 14 : 30;
    const validRes = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );

    const series: Array<{ iso: string; label: string; count: number }> = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const iso = addDaysIso(todayIso, -offset);
      const count = validRes.filter((r) => {
        const bookedOn = (r.bookedDate || r.checkInDate || '').slice(0, 10);
        const staysOnDay = r.checkInDate <= iso && r.checkOutDate > iso;
        return bookedOn === iso || staysOnDay;
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

  // Occupancy Trend Area Chart (Last 7 days ending today)
  const occupancyTrend = useMemo(() => {
    const totalRooms = Math.max(1, rooms.length);
    const validRes = reservations.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no_show'
    );
    const points: Array<{ iso: string; label: string; pct: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const iso = addDaysIso(todayIso, -offset);
      const occupiedOnDay = validRes.filter(
        (r) => r.checkInDate <= iso && r.checkOutDate > iso
      ).length;
      const pct =
        offset === 0
          ? metrics.occupancyRate
          : Math.min(100, Math.round((occupiedOnDay / totalRooms) * 100));
      points.push({
        iso,
        label: getWeekdayShort(iso),
        pct,
      });
    }
    return points;
  }, [rooms.length, reservations, todayIso, metrics.occupancyRate]);

  // Recent Reservations (top 6 most recent active/upcoming stays)
  const recentReservations = useMemo(() => {
    return [...reservations]
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''))
      .slice(0, 6);
  }, [reservations]);

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
      {/* 1. Greeting Hero Banner with Property Suite Photo */}
      <div className="relative bg-[#f4f6f9] border border-slate-200/90 rounded-2xl overflow-hidden min-h-[112px] flex items-center">
        <div className="relative z-10 px-6 py-5 sm:px-8 sm:py-6 max-w-xl">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
            <span className="text-[#0b5d34]">{getTimeGreeting()},</span>{' '}
            <span className="text-slate-900">{greetingName}!</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Here&apos;s what&apos;s happening at{' '}
            <span className="font-semibold text-slate-800">{property.name}</span> today.
          </p>
        </div>

        <div className="hidden sm:block absolute inset-y-0 right-0 w-[48%] lg:w-[44%] pointer-events-none">
          <img
            src={heroImageUrl}
            alt={property.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#f4f6f9] via-[#f4f6f9]/70 to-transparent" />
        </div>
      </div>

      {/* 2. Four Essential Tinted KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Occupancy Rate */}
        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="text-left bg-[#e9f7ef] border border-emerald-200/70 hover:border-emerald-300 rounded-2xl p-5 flex items-center gap-4 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-[#169a57] text-white flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Occupancy Rate</p>
            <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight mt-0.5">
              {metrics.occupancyRate}%
            </p>
            <p
              className={`text-[11px] font-semibold mt-0.5 font-mono-tabular ${
                metrics.occDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
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
          className="text-left bg-[#ebf3fe] border border-blue-200/70 hover:border-blue-300 rounded-2xl p-5 flex items-center gap-4 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-[#1c64f2] text-white flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Arrivals</p>
            <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight mt-0.5">
              {String(metrics.arrivalsToday).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-blue-700 mt-0.5 font-mono-tabular">
              {metrics.arrivalsDelta >= 0 ? '↑ +' : '↓ '}
              {metrics.arrivalsDelta} vs yesterday
            </p>
          </div>
        </button>

        {/* Departures */}
        <button
          type="button"
          onClick={() => onNavigate('in_house')}
          className="text-left bg-[#f4eeff] border border-purple-200/70 hover:border-purple-300 rounded-2xl p-5 flex items-center gap-4 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-[#7e3af2] text-white flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Departures</p>
            <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight mt-0.5">
              {String(metrics.departuresToday).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-purple-700 mt-0.5 font-mono-tabular">
              {metrics.departuresDelta >= 0 ? '↑ +' : '↓ '}
              {metrics.departuresDelta} vs yesterday
            </p>
          </div>
        </button>

        {/* Today's Revenue */}
        <button
          type="button"
          onClick={() => onNavigate('accounting')}
          className="text-left bg-[#fef7e4] border border-amber-200/70 hover:border-amber-300 rounded-2xl p-5 flex items-center gap-4 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-[#d98a0b] text-white flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Today&apos;s Revenue</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mt-0.5 truncate">
              {formatNgn(metrics.revenueToday)}
            </p>
            <p
              className={`text-[11px] font-semibold mt-0.5 font-mono-tabular ${
                metrics.revenueDeltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {metrics.revenueDeltaPct >= 0 ? '↑ +' : '↓ '}
              {metrics.revenueDeltaPct}% vs last week
            </p>
          </div>
        </button>
      </div>

      {/* 3. Middle Row: Booking Performance Bar Chart + Dark Green Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Booking Performance */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0b5d34]" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Booking Performance
              </h2>
            </div>

            <select
              aria-label="Booking performance period"
              value={perfRange}
              onChange={(e) => setPerfRange(e.target.value as '7d' | '14d' | '30d')}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-[#0b5d34] cursor-pointer"
            >
              <option value="7d">Last 7 Days</option>
              <option value="14d">Last 14 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div className="relative h-56 flex items-end gap-2 sm:gap-4 pt-6 pb-2 pl-7 pr-2">
            {/* Horizontal Y-Axis Gridlines */}
            <div className="absolute inset-x-0 top-6 bottom-8 left-7 right-2 flex flex-col justify-between pointer-events-none">
              {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                <div key={ratio} className="relative flex items-center w-full">
                  <span className="absolute -left-7 text-[10px] font-mono-tabular text-slate-400 w-5 text-right">
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
                  <span className="font-mono-tabular text-[11px] font-bold text-slate-700">
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
                      } rounded-t-md bg-[#169a57] group-hover:bg-[#0b5d34] transition-colors`}
                      style={{
                        height: `${bar.count > 0 ? Math.max(8, pct) : 2}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                    {perfRange === '30d' ? bar.label.slice(3) : bar.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="lg:col-span-4 bg-[#064e2b] rounded-2xl p-5 text-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-emerald-300" />
            <h2 className="font-display text-base font-bold text-white">Quick Actions</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1">
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="bg-white hover:bg-emerald-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 text-center transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-6 h-6 text-[#0b5d34]" />
              <span className="text-xs font-semibold leading-tight">New Reservation</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('walk_in')}
              className="bg-white hover:bg-emerald-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 text-center transition-colors cursor-pointer"
            >
              <LogIn className="w-6 h-6 text-[#0b5d34]" />
              <span className="text-xs font-semibold leading-tight">Check In</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('in_house')}
              className="bg-white hover:bg-emerald-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 text-center transition-colors cursor-pointer"
            >
              <LogOut className="w-6 h-6 text-[#0b5d34]" />
              <span className="text-xs font-semibold leading-tight">Check Out</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('accounting')}
              className="bg-white hover:bg-emerald-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 text-center transition-colors cursor-pointer"
            >
              <CreditCard className="w-6 h-6 text-[#0b5d34]" />
              <span className="text-xs font-semibold leading-tight">Record Payment</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Bottom Row: Recent Reservations Table + Occupancy Trend Line Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Recent Reservations */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-[#0b5d34]" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Recent Reservations
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b5d34] hover:underline cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentReservations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No active reservations yet. Click <strong>New Reservation</strong> to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-5">Guest Name</th>
                    <th className="py-3 px-3">Room</th>
                    <th className="py-3 px-3">Check-in</th>
                    <th className="py-3 px-3">Check-out</th>
                    <th className="py-3 px-5 text-right">Status</th>
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
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-5 font-semibold text-slate-900 whitespace-nowrap">
                          {res.guestName}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                          {roomDisp.isAssigned ? roomDisp.roomNumberLabel : 'Unassigned'}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatShortDate(res.checkInDate)}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatShortDate(res.checkOutDate)}
                        </td>
                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badge.className}`}
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
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0b5d34]" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Occupancy Trend
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#0b5d34] text-white font-mono-tabular text-xs font-bold">
              {metrics.occupancyRate}%
            </span>
          </div>

          <div className="w-full">
            <svg
              viewBox={`0 0 ${trendSvg.W} ${trendSvg.H}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="7-day occupancy trend chart"
            >
              <defs>
                <linearGradient id="occAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#169a57" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#169a57" stopOpacity="0.02" />
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
                  stroke="#169a57"
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
                    fill="#169a57"
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
    </div>
  );
};
