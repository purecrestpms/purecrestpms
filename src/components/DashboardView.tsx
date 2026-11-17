import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BedDouble,
  BookOpenCheck,
  Building2,
  Calendar,
  CalendarCheck2,
  ChefHat,
  DoorOpen,
  Globe,
  KeyRound,
  LogOut,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  deleteReservationWorkflow,
  transitionReservationStatus,
} from '../services/pmsService';
import {
  convertNgnToUsd,
  formatBookingSourceLabel,
  formatChannelCurrency,
  formatNgn,
  formatUsd,
  getReservationBookedDate,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  getRoomSection,
  GuestRecord,
  HousekeepingTaskRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  matchesBookingSourceFilter,
  NavSectionId,
  PaymentStatusLabel,
  PosOrderRecord,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  PropertyUserAccountRecord,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  ReservationStatus,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
} from '../types/pms';
import { CheckInProcessModal, CheckedInConfirmationInfo } from './CheckInProcessModal';
import { CurrencyConverterWidget } from './CurrencyConverterWidget';
import { StaffDashboardView } from './StaffDashboardView';

function parseReadableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // fallback below
    }
  }
  return raw;
}

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
  onSignOut?: () => void;
}

const DEFAULT_SUITE_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

export const DashboardView: React.FC<DashboardViewProps> = ({
  property,
  rooms,
  reservations,
  guests = [],
  userAccounts = [],
  ledgerEntries = [],
  posOrders,
  housekeepingTasks = [],
  maintenanceTickets,
  activeLicense: _activeLicense,
  canManageRooms,
  allowedSections,
  actorRole = 'Property Admin',
  onNotify,
  onGuestCheckedIn,
  onNavigate,
  onOpenReservationFolio,
  onSignOut,
}) => {
  const { cms } = useCms();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sortedRooms = sortRoomsByNumber(rooms);

  const [resSearch, setResSearch] = useState('');
  const [resStatusFilter, setResStatusFilter] = useState<'all' | ReservationStatus>('all');
  const [resPaymentFilter, setResPaymentFilter] = useState<'all' | PaymentStatusLabel>('all');
  const [resSourceFilter, setResSourceFilter] = useState<'ALL' | string>('ALL');
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationRecord | null>(null);
  const [cancelMode, setCancelMode] = useState<'free' | 'paid'>('free');
  const [cancelFeeNgn, setCancelFeeNgn] = useState<number>(0);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPayMethod, setCancelPayMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [collectCancelFeeNow, setCollectCancelFeeNow] = useState(true);
  const [confirmDeleteResId, setConfirmDeleteResId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyResId, setBusyResId] = useState<string | null>(null);

  const arrivalsTodayList = reservations.filter(
    (r) => r.status === 'confirmed' && r.checkInDate <= todayIso
  );
  const departuresTodayList = reservations.filter(
    (r) => r.status === 'checked_in' && r.checkOutDate <= todayIso
  );
  const inHouseList = reservations.filter((r) => r.status === 'checked_in');
  const occupiedRoomsCount = rooms.filter((r) => r.occupancyStatus === 'occupied').length;
  const availableRoomsCount = rooms.filter((r) => r.occupancyStatus === 'vacant').length;
  const occupancyPct =
    rooms.length > 0 ? Math.round((occupiedRoomsCount / rooms.length) * 100) : 0;

  const revenueTodayNgn = ledgerEntries
    .filter((e) => e.entryType === 'revenue' && e.entryDate === todayIso)
    .reduce((sum, e) => sum + e.amountNgn, 0);

  const activeFolios = reservations.filter(
    (r) => r.status === 'checked_in' || r.status === 'confirmed'
  );
  const openKitchen = posOrders.filter((o) => o.kitchenStatus !== 'served');
  const openMaintenance = maintenanceTickets.filter((t) => t.status !== 'resolved');

  const dashboardStatusCounts = useMemo(() => {
    const counts: Record<'all' | ReservationStatus, number> = {
      all: reservations.length,
      confirmed: 0,
      pending: 0,
      checked_in: 0,
      checked_out: 0,
      cancelled: 0,
      no_show: 0,
    };
    reservations.forEach((r) => {
      if (r.status in counts) {
        counts[r.status as ReservationStatus] += 1;
      }
    });
    return counts;
  }, [reservations]);

  const filteredDashboardReservations = useMemo(() => {
    const q = resSearch.trim().toLowerCase();
    return [...reservations]
      .filter((r) => {
        if (resStatusFilter !== 'all' && r.status !== resStatusFilter) return false;
        if (resSourceFilter !== 'ALL' && !matchesBookingSourceFilter(r.channel, resSourceFilter)) {
          return false;
        }
        const { paymentStatus } = getReservationPaymentSummary(r);
        if (resPaymentFilter !== 'all' && paymentStatus !== resPaymentFilter) return false;
        if (!q) return true;
        const sourceLabel = formatBookingSourceLabel(r.channel).toLowerCase();
        const bookedDate = getReservationBookedDate(r);
        const roomDisplay = getReservationRoomDisplay(r, rooms);
        return (
          r.guestName.toLowerCase().includes(q) ||
          r.bookingRef.toLowerCase().includes(q) ||
          roomDisplay.roomNumberLabel.toLowerCase().includes(q) ||
          roomDisplay.roomTypeLabel.toLowerCase().includes(q) ||
          (r.guestPhone || '').toLowerCase().includes(q) ||
          sourceLabel.includes(q) ||
          bookedDate.includes(q)
        );
      })
      .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));
  }, [reservations, rooms, resSearch, resStatusFilter, resPaymentFilter, resSourceFilter]);

  const openCancelDialog = (res: ReservationRecord) => {
    setActionError(null);
    setCancelTarget(res);
    setCancelMode('free');
    setCancelFeeNgn(Math.max(10000, Math.round(res.nightlyRateNgn || 50000)));
    setCancelReason('');
    setCancelPayMethod(res.paymentMethod || 'Bank Transfer');
    setCollectCancelFeeNow(true);
  };

  const handleConfirmCancelOrNoShow = async (nextStatus: 'cancelled' | 'no_show') => {
    if (!cancelTarget) return;
    if (nextStatus === 'cancelled' && cancelMode === 'paid' && cancelFeeNgn <= 0) {
      setActionError('Enter a cancellation fee greater than ₦0 or select Free Cancellation.');
      return;
    }
    setActionError(null);
    setBusyResId(cancelTarget.id);
    try {
      const targetRoom = rooms.find((rm) => rm.id === cancelTarget.roomId);
      await transitionReservationStatus({
        property,
        reservation: cancelTarget,
        room: targetRoom,
        nextStatus,
        cancellationType: nextStatus === 'cancelled' ? cancelMode : undefined,
        cancellationFeeNgn:
          nextStatus === 'cancelled' && cancelMode === 'paid' ? cancelFeeNgn : 0,
        cancellationReason: cancelReason.trim(),
        paymentMethod: cancelPayMethod,
        collectCancellationFeeNow:
          nextStatus === 'cancelled' && cancelMode === 'paid' && collectCancelFeeNow,
        actorRole,
      });
      onNotify?.(
        nextStatus === 'no_show'
          ? `Marked ${cancelTarget.bookingRef} (${cancelTarget.guestName}) as No-show`
          : cancelMode === 'paid'
            ? `Cancelled ${cancelTarget.bookingRef} with ${formatNgn(cancelFeeNgn)} cancellation fee`
            : `Cancelled ${cancelTarget.bookingRef} (${cancelTarget.guestName}) — Free cancellation`
      );
      setCancelTarget(null);
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyResId(null);
    }
  };

  const handleDeleteReservation = async (res: ReservationRecord) => {
    setActionError(null);
    setBusyResId(res.id);
    try {
      const targetRoom = rooms.find((rm) => rm.id === res.roomId);
      await deleteReservationWorkflow({
        property,
        reservation: res,
        room: targetRoom,
        actorRole,
      });
      onNotify?.(`Deleted reservation ${res.bookingRef} (${res.guestName})`);
      setConfirmDeleteResId(null);
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyResId(null);
    }
  };

  const sections: Array<{ key: RoomSection; title: string; subtitle: string }> = [
    {
      key: 'Serviced Apartment',
      title: cms.dashboard.servicedSectionTitle || 'Serviced Apartment Section',
      subtitle:
        cms.dashboard.servicedSectionSubtitle ||
        'Self-contained studios and suites equipped with fitted kitchenettes',
    },
    {
      key: 'Hotel Rooms',
      title: cms.dashboard.hotelSectionTitle || 'Hotel Rooms Section',
      subtitle:
        cms.dashboard.hotelSectionSubtitle ||
        'Individual executive studios and one-bedroom hospitality suites',
    },
  ];

  const primaryKpiCards: Array<{
    id: string;
    label: string;
    subtitle: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    borderAccent: string;
    iconBg: string;
    iconColor: string;
    valueColor: string;
    target: NavSectionId;
  }> = [
    {
      id: 'kpi-arrivals',
      label: 'Arrivals Today',
      subtitle: 'Confirmed check-ins expected today',
      value: String(arrivalsTodayList.length),
      icon: PlaneLanding,
      borderAccent: 'border-t-[#1c46be]',
      iconBg: 'bg-blue-50 border border-blue-200',
      iconColor: 'text-[#1c46be]',
      valueColor: 'text-[#0B245B]',
      target: 'arrivals',
    },
    {
      id: 'kpi-departures',
      label: 'Departures Today',
      subtitle: 'Checked-in guests due out today',
      value: String(departuresTodayList.length),
      icon: PlaneTakeoff,
      borderAccent: 'border-t-amber-500',
      iconBg: 'bg-amber-50 border border-amber-200',
      iconColor: 'text-amber-700',
      valueColor: 'text-slate-900',
      target: 'in_house',
    },
    {
      id: 'kpi-inhouse',
      label: 'In-House Guests',
      subtitle: 'Currently occupied suites',
      value: String(inHouseList.length),
      icon: DoorOpen,
      borderAccent: 'border-t-emerald-600',
      iconBg: 'bg-emerald-50 border border-emerald-200',
      iconColor: 'text-emerald-700',
      valueColor: 'text-emerald-900',
      target: 'in_house',
    },
  ];

  const secondaryKpiCards: Array<{
    id: string;
    label: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    target?: NavSectionId;
  }> = [
    {
      id: 'kpi-occupied',
      label: `Occupied (${occupancyPct}%)`,
      value: String(occupiedRoomsCount),
      icon: BedDouble,
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-700',
      target: 'rooms',
    },
    {
      id: 'kpi-available',
      label: 'Available Suites',
      value: String(availableRoomsCount),
      icon: KeyRound,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-700',
      target: 'walk_in',
    },
    {
      id: 'kpi-revenue',
      label: 'Revenue Today',
      value: formatNgn(revenueTodayNgn),
      icon: Wallet,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-700',
      target: 'accounting',
    },
  ];

  const scheduleEvents = [
    ...arrivalsTodayList.map((r) => ({
      id: `arr-${r.id}`,
      type: 'Arrival',
      guest: r.guestName,
      room: getReservationRoomDisplay(r, rooms).roomNumberLabel,
      date: r.checkInDate,
      resId: r.id,
      badgeClass: 'text-blue-700 bg-blue-50',
    })),
    ...departuresTodayList.map((r) => ({
      id: `dep-${r.id}`,
      type: 'Departure',
      guest: r.guestName,
      room: getReservationRoomDisplay(r, rooms).roomNumberLabel,
      date: r.checkOutDate,
      resId: r.id,
      badgeClass: 'text-emerald-700 bg-emerald-50',
    })),
  ];

  const activeAccountsCount = userAccounts.filter(
    (a) => a.role !== 'unassigned' && a.active
  ).length;
  const unassignedAccountsCount = userAccounts.filter(
    (a) => a.role === 'unassigned' || !a.active
  ).length;

  if (!canManageRooms) {
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
        onNavigate={onNavigate}
        onOpenReservationFolio={onOpenReservationFolio}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Clean Property Name Bar & Quick Operations (No logo upload, no exterior photo, no address/contacts, no date) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0B245B] text-white flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#061539] tracking-tight truncate">
                {property.name}
              </h1>
              <p className="font-mono-tabular text-[11px] font-semibold text-slate-600">
                Property Code: {property.code} · {rooms.length} Suites Configured
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="px-3 py-1.5 text-xs font-semibold text-[#1c46be] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
            >
              Edit Profile
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onNavigate('walk_in')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B245B] hover:bg-[#082c70] text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickWalkInLabel || 'Walk-in Check-in'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('reservations')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <CalendarCheck2 className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickReservationsLabel || 'Reservations'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('arrivals')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <PlaneLanding className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickArrivalsLabel || 'Arrivals'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('in_house')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickInHouseLabel || 'In-House'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('front_desk')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <BookOpenCheck className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickFrontDeskLabel || 'Front Desk & Folios'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickCalendarLabel || 'Calendar'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('ota_channels')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{cms.dashboard.quickChannelManagerLabel || 'Channel Manager'}</span>
          </button>
          {canManageRooms && (
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1c46be] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{cms.pages.reports?.navLabel || 'Management Reports'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Arrivals, Departures, In-House Flagship Hero KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {primaryKpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`bg-white border border-slate-200 border-t-4 ${card.borderAccent} rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-xs`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-[#061539]">{card.label}</p>
                    <p className="text-[11px] text-slate-600">{card.subtitle}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3 pt-1">
                <p className={`font-mono-tabular text-3xl sm:text-4xl font-bold leading-none ${card.valueColor}`}>
                  {card.value}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate(card.target)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-[#1c46be] cursor-pointer"
                >
                  <span>Open</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary Metrics Strip: Occupied, Available, Revenue Today */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {secondaryKpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${card.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-mono-tabular text-xl font-bold text-slate-900 leading-tight truncate">
                    {card.value}
                  </p>
                  <p className="text-xs text-slate-500">{card.label}</p>
                </div>
              </div>
              {card.target && (
                <button
                  type="button"
                  onClick={() => onNavigate(card.target!)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#1c46be] hover:underline shrink-0 cursor-pointer"
                >
                  <span>View</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Secondary Metrics Strip ends; User Management moved before footer */}

      {/* Daily USD Exchange Rate & Currency Converter */}
      <CurrencyConverterWidget
        property={property}
        rooms={rooms}
        canEditRate={canManageRooms}
        actorRole={actorRole}
        compact
        onNotify={onNotify}
      />

      {/* Room Overview Matrix + Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-extrabold text-[#061539]">
              {cms.dashboard.roomOverviewTitle || 'Room Overview'}
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>Occupied</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Available</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Reserved</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span>Maintenance</span>
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {sections.map((sec) => {
              const secRooms = sortedRooms.filter((r) => getRoomSection(r) === sec.key);
              if (secRooms.length === 0) return null;
              return (
                <div key={sec.key} className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="sm:w-44 shrink-0">
                    <p className="text-xs font-semibold text-slate-900">{sec.title}</p>
                    <p className="font-mono-tabular text-[11px] text-slate-500">
                      ({secRooms.length} rooms)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {secRooms.map((room) => {
                      const activeRes = activeFolios.find(
                        (r) => r.id === room.currentReservationId || r.roomId === room.id
                      );
                      const tileStyle =
                        room.occupancyStatus === 'occupied'
                          ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                          : room.occupancyStatus === 'reserved'
                            ? 'bg-amber-50 border-amber-400 text-amber-800 hover:bg-amber-100'
                            : room.occupancyStatus === 'out_of_order'
                              ? 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                              : 'bg-white border-emerald-500 text-emerald-700 hover:bg-emerald-50';
                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            if (activeRes) {
                              onOpenReservationFolio(activeRes.id, 'front_desk');
                            } else if (room.occupancyStatus === 'vacant') {
                              onNavigate('walk_in');
                            } else {
                              onNavigate('rooms');
                            }
                          }}
                          title={`${room.roomNumber} · ${room.roomType} (${formatNgn(room.nightlyRateNgn)}/nt)`}
                          className={`min-w-[64px] px-3 py-2 rounded-lg border-2 font-mono-tabular text-xs font-bold transition-colors cursor-pointer ${tileStyle}`}
                        >
                          {room.roomNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-extrabold text-[#061539]">
                {cms.dashboard.scheduleTitle || "Today's Schedule"}
              </h2>
              <span className="font-mono-tabular text-[11px] font-semibold text-slate-600">{todayIso}</span>
            </div>

            {scheduleEvents.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs text-slate-500">No arrivals or departures scheduled today</p>
                <button
                  type="button"
                  onClick={() => onNavigate('walk_in')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Check In Walk-In Guest</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {scheduleEvents.slice(0, 5).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onOpenReservationFolio(ev.resId, 'front_desk')}
                    className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 rounded px-1 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{ev.guest}</p>
                      <p className="font-mono-tabular text-[11px] text-slate-500">
                        {ev.room} · {ev.date}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${ev.badgeClass}`}
                    >
                      {ev.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => onNavigate('arrivals')}
              className="font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              View Arrivals →
            </button>
            <button
              type="button"
              onClick={() => onNavigate('in_house')}
              className="font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              In-House Guests →
            </button>
          </div>
        </div>
      </div>

      {/* Grouped Suite Showcase: Serviced Apartment Section & Hotel Rooms */}
      {sections.map((sec) => {
        const secRooms = sortedRooms.filter((r) => getRoomSection(r) === sec.key);
        if (secRooms.length === 0) return null;

        return (
          <div key={sec.key} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-extrabold text-[#061539]">
                  {sec.title}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">{sec.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('rooms')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap cursor-pointer"
              >
                <span>{canManageRooms ? 'Edit Rates & Photos' : 'Inspect Rooms'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {secRooms.map((room) => {
                const activeRes = activeFolios.find(
                  (r) => r.id === room.currentReservationId || r.roomId === room.id
                );

                const statusText =
                  room.occupancyStatus === 'occupied'
                    ? 'Occupied'
                    : room.occupancyStatus === 'reserved'
                      ? 'Reserved'
                      : room.occupancyStatus === 'out_of_order'
                        ? 'Out of Order'
                        : 'Available';

                const statusColor =
                  room.occupancyStatus === 'occupied'
                    ? 'text-blue-700'
                    : room.occupancyStatus === 'reserved'
                      ? 'text-amber-700'
                      : room.occupancyStatus === 'out_of_order'
                        ? 'text-rose-700'
                        : 'text-emerald-700';

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      if (activeRes) {
                        onOpenReservationFolio(activeRes.id, 'front_desk');
                      } else {
                        onNavigate('rooms');
                      }
                    }}
                    className="text-left rounded-xl border border-slate-200 hover:border-slate-300 bg-white overflow-hidden transition-colors flex flex-col justify-between cursor-pointer group"
                  >
                    <div className="h-32 bg-slate-100 relative overflow-hidden w-full">
                      <img
                        src={room.imageUrl || DEFAULT_SUITE_IMAGE}
                        alt={room.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_SUITE_IMAGE;
                        }}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between text-white">
                        <span className="font-mono-tabular text-xs font-bold">
                          {room.roomNumber}
                        </span>
                        <div className="text-right leading-tight">
                          <span className="block font-mono-tabular text-xs font-semibold text-emerald-300">
                            {formatNgn(room.nightlyRateNgn)}
                          </span>
                          <span className="block font-mono-tabular text-[10px] text-slate-200/95">
                            ≈ {formatUsd(convertNgnToUsd(room.nightlyRateNgn, property.usdExchangeRateNgn), 0)}/nt
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 space-y-2 w-full">
                      <div>
                        <p className="text-xs font-bold text-slate-900 truncate">{room.roomType}</p>
                        <p className="text-[11px] text-slate-500 truncate">{room.name}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${statusColor}`}>{statusText}</span>
                        <span className="text-slate-500 capitalize">
                          HK: {room.housekeepingStatus}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600 truncate">
                          {room.currentGuestName || 'Ready for check-in'}
                        </span>
                        {activeRes && (
                          <span className="font-semibold text-emerald-700 shrink-0">
                            Folio →
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Full-Width Reservations Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#061539]">
              {cms.dashboard.reservationsLedgerTitle || 'Reservations'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {cms.dashboard.reservationsLedgerSubtitle ||
                'Guest name, room assignment, room type, stay dates, occupancy, booking source, folio balances, payment & reservation status, date booked, and actions'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              <span>Manage All Reservations</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('front_desk')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpenCheck className="w-3.5 h-3.5" />
              <span>Open Front Desk</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 text-xs">
              {(
                [
                  'all',
                  'confirmed',
                  'pending',
                  'checked_in',
                  'checked_out',
                  'cancelled',
                  'no_show',
                ] as Array<'all' | ReservationStatus>
              ).map((statusKey) => {
                const isActive = resStatusFilter === statusKey;
                const label = statusKey === 'all' ? 'All' : RESERVATION_STATUS_LABELS[statusKey];
                return (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => setResStatusFilter(statusKey)}
                    className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {label}{' '}
                    <span className="font-mono-tabular opacity-75">
                      ({dashboardStatusCounts[statusKey]})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={resSearch}
                  onChange={(e) => setResSearch(e.target.value)}
                  aria-label="Search reservations"
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs w-48 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <select
                value={resSourceFilter}
                onChange={(e) => setResSourceFilter(e.target.value)}
                aria-label="Filter by booking source"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-700"
              >
                <option value="ALL">All Booking Sources</option>
                {PRIMARY_BOOKING_SOURCES.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>

              <select
                value={resPaymentFilter}
                onChange={(e) => setResPaymentFilter(e.target.value as 'all' | PaymentStatusLabel)}
                aria-label="Filter by payment status"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-700"
              >
                <option value="all">All Payment Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1560px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="py-2.5 px-3.5 whitespace-nowrap">Guest Name</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Room Number</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Room Type</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Check-in</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Check-out</th>
                <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Nights</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Adults/Children</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Booking Source</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Total Amount</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Amount Paid</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Balance</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Payment Status</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Reservation Status</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Date Booked</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredDashboardReservations.map((res) => {
                const {
                  totalAmount,
                  otaPaidAmount,
                  hotelPaidAmount,
                  amountPaid,
                  balance,
                  paymentStatus,
                  sourceCurrency,
                  sourceNightlyRate,
                  sourceTotalAmount,
                  otaPaidSourceAmount,
                } = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
                const bookedDate = getReservationBookedDate(res);
                const childCount = res.children ?? 0;
                const sourceLabel = formatBookingSourceLabel(res.channel);
                const statusLabel = RESERVATION_STATUS_LABELS[res.status] || res.status;
                const roomDisplay = getReservationRoomDisplay(res, rooms);

                const paymentStatusClass =
                  paymentStatus === 'Paid'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : paymentStatus === 'Partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200';

                const reservationStatusClass =
                  res.status === 'checked_in'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : res.status === 'confirmed'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : res.status === 'pending'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : res.status === 'checked_out'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : res.status === 'no_show'
                            ? 'bg-orange-50 text-orange-800 border-orange-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200';

                const canCheckInOrCancel = res.status === 'confirmed' || res.status === 'pending';

                return (
                  <tr
                    key={res.id}
                    onClick={() => onOpenReservationFolio(res.id, 'reservations', 'view')}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-900">{res.guestName}</p>
                      <p className="font-mono-tabular text-[11px] text-slate-500">
                        {res.bookingRef}
                        {res.guestPhone ? ` · ${res.guestPhone}` : ''}
                      </p>
                    </td>

                    <td
                      className="py-3 px-3.5 whitespace-nowrap"
                      onClick={(e) => {
                        if (!roomDisplay.isAssigned) e.stopPropagation();
                      }}
                    >
                      {roomDisplay.isAssigned ? (
                        <span className="font-mono-tabular font-bold text-emerald-700">
                          {roomDisplay.roomNumberLabel}
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="block text-[11px] font-semibold text-amber-700">
                            Unassigned
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenReservationFolio(res.id, 'reservations', 'edit')}
                            className="text-[11px] font-semibold text-[#1c46be] hover:underline cursor-pointer"
                          >
                            Edit to assign
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3.5 text-slate-700 whitespace-nowrap">
                      {roomDisplay.roomTypeLabel}
                    </td>

                    <td className="py-3 px-3.5 font-mono-tabular text-slate-800 whitespace-nowrap">
                      {res.checkInDate}
                    </td>

                    <td className="py-3 px-3.5 font-mono-tabular text-slate-800 whitespace-nowrap">
                      <span>{res.checkOutDate}</span>
                      {(res.checkOutTime || (res.lateCheckoutFeeNgn || 0) > 0) && (
                        <span className="block text-[10px] font-semibold text-amber-700">
                          {res.checkOutTime ? `Out ${res.checkOutTime}` : 'Late Out'}
                          {(res.lateCheckoutFeeNgn || 0) > 0
                            ? ` · +${formatNgn(res.lateCheckoutFeeNgn || 0)}`
                            : ''}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3.5 text-center font-mono-tabular font-semibold text-slate-800 whitespace-nowrap">
                      {res.nights}
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <p className="font-mono-tabular font-medium text-slate-800">
                        {res.adults}A / {childCount}C
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {res.adults} {res.adults === 1 ? 'Adult' : 'Adults'} · {childCount}{' '}
                        {childCount === 1 ? 'Child' : 'Children'}
                      </p>
                    </td>

                    <td className="py-3 px-3.5 text-slate-700 font-medium whitespace-nowrap">
                      {sourceLabel}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                      <span className="block">{formatNgn(totalAmount)}</span>
                      {sourceCurrency !== 'NGN' && sourceTotalAmount > 0 && (
                        <span className="block text-[10px] font-medium text-blue-700">
                          {formatChannelCurrency(sourceTotalAmount, sourceCurrency)} {sourceCurrency}
                          {sourceNightlyRate > 0
                            ? ` · ${formatChannelCurrency(sourceNightlyRate, sourceCurrency)}/nt`
                            : ''}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono-tabular font-medium text-emerald-700 whitespace-nowrap">
                      <span className="block font-semibold">{formatNgn(amountPaid)}</span>
                      <span className="block text-[10px] text-slate-500">
                        OTA: {formatNgn(otaPaidAmount)}
                        {sourceCurrency !== 'NGN' && otaPaidAmount > 0 && otaPaidSourceAmount > 0
                          ? ` (${formatChannelCurrency(otaPaidSourceAmount, sourceCurrency)})`
                          : ''}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        Hotel: {formatNgn(hotelPaidAmount)}
                      </span>
                    </td>

                    <td
                      className={`py-3 px-3.5 text-right font-mono-tabular font-semibold whitespace-nowrap ${
                        balance > 0 ? 'text-rose-700' : 'text-slate-600'
                      }`}
                    >
                      <span className="block">{formatNgn(balance)}</span>
                      <span className="block text-[10px] font-normal text-slate-500">
                        {balance > 0 ? 'Guest bal due' : '₦0 guest bal'}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold ${paymentStatusClass}`}
                      >
                        {paymentStatus}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold ${reservationStatusClass}`}
                      >
                        {statusLabel}
                      </span>
                      {res.status === 'cancelled' && res.cancellationType && (
                        <span className="block text-[10px] font-medium text-rose-700 mt-0.5">
                          {res.cancellationType === 'paid'
                            ? `Fee: ${formatNgn(res.cancellationFeeNgn || 0)}`
                            : 'Free Cancellation'}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3.5 font-mono-tabular text-slate-600 whitespace-nowrap">
                      {bookedDate}
                    </td>

                    <td
                      className="py-3 px-3.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenReservationFolio(res.id, 'reservations', 'view')}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenReservationFolio(res.id, 'reservations', 'edit')}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Edit
                        </button>
                        {canCheckInOrCancel && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCheckInTarget(res)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Check-in
                            </button>
                            <button
                              type="button"
                              disabled={busyResId === res.id}
                              onClick={() => openCancelDialog(res)}
                              className="px-2.5 py-1 text-[11px] font-medium text-rose-700 border border-rose-200 bg-white hover:bg-rose-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {canManageRooms && confirmDeleteResId !== res.id && (
                          <button
                            type="button"
                            disabled={busyResId === res.id}
                            onClick={() => setConfirmDeleteResId(res.id)}
                            title="Delete reservation record"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                        {canManageRooms && confirmDeleteResId === res.id && (
                          <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteResId(null)}
                              className="px-1.5 py-0.5 text-[10px] text-slate-600 cursor-pointer"
                            >
                              No
                            </button>
                            <button
                              type="button"
                              disabled={busyResId === res.id}
                              onClick={() => void handleDeleteReservation(res)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white rounded cursor-pointer"
                            >
                              {busyResId === res.id ? '...' : 'Confirm'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredDashboardReservations.length === 0 && (
                <tr>
                  <td colSpan={15} className="py-10 text-center text-xs text-slate-500">
                    No reservations match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Departmental Operations Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-slate-600" />
              <h3 className="font-display text-sm font-extrabold text-[#061539]">
                Kitchen Dispatch
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pos_kitchen')}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Open KDS
            </button>
          </div>
          <div className="space-y-1.5">
            {openKitchen.slice(0, 3).map((ord) => (
              <div
                key={ord.id}
                className="flex items-center justify-between text-xs py-1.5 border-t border-slate-100"
              >
                <span className="text-slate-700 truncate pr-2">
                  {ord.orderNumber} · {ord.tableOrRoom}
                </span>
                <span className="font-medium text-amber-700 capitalize shrink-0">
                  {ord.kitchenStatus}
                </span>
              </div>
            ))}
            {openKitchen.length === 0 && (
              <p className="text-xs text-slate-500 pt-1">All kitchen tickets served.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[#061539]" />
              <h3 className="font-display text-sm font-extrabold text-[#061539]">
                Engineering &amp; Housekeeping
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('maintenance')}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              View Tasks
            </button>
          </div>
          <div className="space-y-1.5">
            {openMaintenance.slice(0, 2).map((t) => (
              <p key={t.id} className="text-xs text-slate-600 truncate">
                {t.locationLabel} · {t.issueTitle}
              </p>
            ))}
            <button
              type="button"
              onClick={() => onNavigate('housekeeping')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-emerald-700 pt-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Open Housekeeping Dispatch</span>
            </button>
          </div>
        </div>
      </div>

      {/* User Management & Team Access Section (placed right before footer) */}
      {canManageRooms && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="font-display text-sm font-extrabold text-[#061539]">
                User Management &amp; Team Access
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Create user accounts, assign or revoke roles &amp; module privileges, and inspect staff records &amp; performance.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-mono-tabular">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-[#061539] font-bold">
                  Total Accounts: {userAccounts.length}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                  Active Assigned: {activeAccountsCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-bold">
                  Unassigned / Revoked: {unassignedAccountsCount}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('user_management')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#061539] hover:bg-[#0c2b70] text-white rounded-lg cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Manage Users &amp; Roles</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-[#061539] rounded-lg cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Roster &amp; Performance</span>
            </button>
          </div>
        </div>
      )}

      {/* Simple Dashboard Footer */}
      <footer className="pt-4 pb-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
        <p className="font-bold text-[#061539]">
          © {new Date().getFullYear()} {property.name}. All rights reserved.
        </p>
        <p className="font-medium text-slate-500">
          Powered by <span className="font-bold text-[#061539]">PCH PMS</span>
        </p>
      </footer>

      {/* Cancel / No-Show Confirmation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-xl text-xs">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Cancel or Mark No-Show
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cancelTarget.bookingRef} · {cancelTarget.guestName} ({cancelTarget.roomNumber || 'Unassigned'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Select free cancellation or apply a cancellation fee before releasing{' '}
              <span className="font-mono-tabular font-semibold text-slate-800">
                {cancelTarget.roomNumber || 'the suite hold'}
              </span>
              .
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCancelMode('free')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  cancelMode === 'free'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold">Free Cancellation</span>
                <span className="block text-[11px] opacity-80 mt-0.5">
                  ₦0 cancellation fee · Zero folio charge
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCancelMode('paid')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  cancelMode === 'paid'
                    ? 'border-rose-600 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold">Cancellation with Cost</span>
                <span className="block text-[11px] opacity-80 mt-0.5">
                  Apply cancellation fee in ₦ to reservation bill
                </span>
              </button>
            </div>

            {cancelMode === 'paid' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Cancellation Cost (₦ NGN) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={cancelFeeNgn}
                      onChange={(e) => setCancelFeeNgn(Math.max(0, Number(e.target.value)))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono-tabular font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={cancelPayMethod}
                      onChange={(e) =>
                        setCancelPayMethod(e.target.value as ReservationRecord['paymentMethod'])
                      }
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card POS">Card POS</option>
                      <option value="Cash NGN">Cash NGN</option>
                      <option value="Corporate Invoice">Corporate Invoice</option>
                      <option value="Online Gateway">Online Gateway</option>
                    </select>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={collectCancelFeeNow}
                    onChange={(e) => setCollectCancelFeeNow(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Collect cancellation fee now &amp; post to Revenue Ledger</span>
                </label>
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Cancellation Reason / Note (Optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Keep Reservation
              </button>
              <button
                type="button"
                disabled={busyResId === cancelTarget.id}
                onClick={() => void handleConfirmCancelOrNoShow('no_show')}
                className="px-3.5 py-2 text-xs font-semibold text-orange-800 bg-orange-50 border border-orange-200 hover:bg-orange-100 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                Mark No-show
              </button>
              <button
                type="button"
                disabled={busyResId === cancelTarget.id}
                onClick={() => void handleConfirmCancelOrNoShow('cancelled')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyResId === cancelTarget.id
                  ? 'Updating...'
                  : cancelMode === 'paid'
                    ? `Cancel (${formatNgn(cancelFeeNgn)})`
                    : 'Confirm Free Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Front-Desk Check-In Workflow Modal */}
      {checkInTarget && (
        <CheckInProcessModal
          property={property}
          reservation={checkInTarget}
          room={rooms.find((r) => r.id === checkInTarget.roomId)}
          rooms={rooms}
          guest={
            guests.find((g) => g.id === checkInTarget.guestId) ||
            guests.find((g) => g.fullName.toLowerCase() === checkInTarget.guestName.toLowerCase())
          }
          actorRole={actorRole}
          onClose={() => setCheckInTarget(null)}
          onCompleted={(info) => {
            onNotify?.(`Verified & checked in ${info.guestName} into ${info.roomNumber}`);
            onGuestCheckedIn?.(info);
          }}
        />
      )}
    </div>
  );
};
