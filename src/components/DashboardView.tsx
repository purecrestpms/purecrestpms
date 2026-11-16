import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  BookOpenCheck,
  Calendar,
  CalendarCheck2,
  ChefHat,
  DoorOpen,
  Globe,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  Sparkles,
  UserCheck,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import { transitionReservationStatus } from '../services/pmsService';
import {
  formatBookingSourceLabel,
  formatNgn,
  getReservationBookedDate,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  getRoomSection,
  GuestRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  matchesBookingSourceFilter,
  NavSectionId,
  PaymentStatusLabel,
  PosOrderRecord,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  ReservationStatus,
  RICHGATES_EXTERIOR_IMAGE,
  RICHGATES_PROPERTY_INFO,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
} from '../types/pms';
import { CheckInProcessModal, CheckedInConfirmationInfo } from './CheckInProcessModal';

interface DashboardViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  guests?: GuestRecord[];
  ledgerEntries?: LedgerEntryRecord[];
  posOrders: PosOrderRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  activeLicense?: LicenseRecord;
  canManageRooms: boolean;
  actorRole?: string;
  onNotify?: (msg: string) => void;
  onGuestCheckedIn?: (info: CheckedInConfirmationInfo) => void;
  onNavigate: (section: NavSectionId) => void;
  onOpenReservationFolio: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk',
    intent?: 'view' | 'edit'
  ) => void;
}

const DEFAULT_SUITE_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

export const DashboardView: React.FC<DashboardViewProps> = ({
  property,
  rooms,
  reservations,
  guests = [],
  ledgerEntries = [],
  posOrders,
  maintenanceTickets,
  activeLicense: _activeLicense,
  canManageRooms,
  actorRole = 'Property Admin',
  onNotify,
  onGuestCheckedIn,
  onNavigate,
  onOpenReservationFolio,
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

  const handleConfirmCancelOrNoShow = async (nextStatus: 'cancelled' | 'no_show') => {
    if (!cancelTarget) return;
    setBusyResId(cancelTarget.id);
    try {
      const targetRoom = rooms.find((rm) => rm.id === cancelTarget.roomId);
      await transitionReservationStatus({
        property,
        reservation: cancelTarget,
        room: targetRoom,
        nextStatus,
        actorRole,
      });
      onNotify?.(
        nextStatus === 'no_show'
          ? `Marked ${cancelTarget.bookingRef} (${cancelTarget.guestName}) as No-show`
          : `Cancelled reservation ${cancelTarget.bookingRef} (${cancelTarget.guestName})`
      );
      setCancelTarget(null);
    } finally {
      setBusyResId(null);
    }
  };

  const displayAddress = property.address || RICHGATES_PROPERTY_INFO.address;
  const displayPhone = property.phone || RICHGATES_PROPERTY_INFO.phone;
  const displayWhatsapp = property.whatsapp || RICHGATES_PROPERTY_INFO.whatsapp;
  const displayEmail = property.email || RICHGATES_PROPERTY_INFO.email;
  const waHref = `https://wa.me/${displayWhatsapp.replace(/[^0-9]/g, '') || '2347063522668'}`;

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

  const kpiCards: Array<{
    id: string;
    label: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    target?: NavSectionId;
  }> = [
    {
      id: 'kpi-arrivals',
      label: 'Arrivals Today',
      value: String(arrivalsTodayList.length),
      icon: PlaneLanding,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-700',
      target: 'arrivals',
    },
    {
      id: 'kpi-departures',
      label: 'Departures',
      value: String(departuresTodayList.length),
      icon: PlaneTakeoff,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-700',
      target: 'in_house',
    },
    {
      id: 'kpi-inhouse',
      label: 'In-House',
      value: String(inHouseList.length),
      icon: DoorOpen,
      iconBg: 'bg-sky-50',
      iconColor: 'text-sky-700',
      target: 'in_house',
    },
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
      label: 'Available',
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

  const formattedTodayDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Property Header & Contact Strip + Quick Operations */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-4 relative min-h-[200px] bg-slate-900">
          <img
            src={RICHGATES_EXTERIOR_IMAGE}
            alt={property.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/15 to-transparent" />
          {property.logoUrl && (
            <div className="absolute bottom-4 left-4">
              <img
                src={property.logoUrl}
                alt="Property crest"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="w-11 h-11 rounded-lg object-cover bg-white/95 p-0.5 shrink-0"
              />
            </div>
          )}
        </div>

        <div className="lg:col-span-8 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {property.logoUrl && (
                  <img
                    src={property.logoUrl}
                    alt={property.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    className="w-8 h-8 rounded-lg object-contain border border-slate-200 bg-white p-0.5"
                  />
                )}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="font-mono-tabular">{formattedTodayDate}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Edit Property &amp; Admin Profile →
              </button>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
              <span>{displayAddress}</span>
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <a
                href={`tel:${displayPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 font-mono-tabular hover:text-slate-900"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{displayPhone}</span>
              </a>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
              <a
                href={`mailto:${displayEmail}`}
                className="inline-flex items-center gap-1.5 hover:text-slate-900"
              >
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{displayEmail}</span>
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('walk_in')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{cms.dashboard.quickWalkInLabel || 'Walk-in Check-in'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
      </div>

      {/* 6 KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                {card.target && (
                  <button
                    type="button"
                    onClick={() => onNavigate(card.target!)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
                  >
                    <span>View</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div>
                <p className="font-mono-tabular text-2xl font-bold text-slate-900 leading-tight">
                  {card.value}
                </p>
                <p className="text-xs text-slate-500 mt-1">{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Room Overview Matrix + Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-slate-900">
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
              <h2 className="font-display text-base font-bold text-slate-900">
                {cms.dashboard.scheduleTitle || "Today's Schedule"}
              </h2>
              <span className="font-mono-tabular text-[11px] text-slate-500">{todayIso}</span>
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
                <h2 className="font-display text-base font-bold text-slate-900">
                  {sec.title}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{sec.subtitle}</p>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                        <span className="font-mono-tabular text-xs font-semibold text-emerald-300">
                          {formatNgn(room.nightlyRateNgn)}
                        </span>
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
            <h2 className="font-display text-base font-bold text-slate-900">
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
                  placeholder="Search ref, guest, suite..."
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
                const { totalAmount, amountPaid, balance, paymentStatus } =
                  getReservationPaymentSummary(res);
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
                      {res.checkOutDate}
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
                      {formatNgn(totalAmount)}
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono-tabular font-medium text-emerald-700 whitespace-nowrap">
                      {formatNgn(amountPaid)}
                    </td>

                    <td
                      className={`py-3 px-3.5 text-right font-mono-tabular font-semibold whitespace-nowrap ${
                        balance > 0 ? 'text-rose-700' : 'text-slate-500'
                      }`}
                    >
                      {formatNgn(balance)}
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
                              onClick={() => setCancelTarget(res)}
                              className="px-2.5 py-1 text-[11px] font-medium text-rose-700 border border-rose-200 bg-white hover:bg-rose-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
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
              <h3 className="font-display text-sm font-bold text-slate-900">
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
              <Wrench className="w-4 h-4 text-slate-600" />
              <h3 className="font-display text-sm font-bold text-slate-900">
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

      {/* Cancel / No-Show Confirmation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Cancel or Mark No-Show
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cancelTarget.bookingRef} · {cancelTarget.guestName} ({cancelTarget.roomNumber})
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

            <p className="text-xs text-slate-600 leading-relaxed">
              Choose whether to cancel this reservation or record the guest as a No-show. Any reserved hold on{' '}
              <span className="font-mono-tabular font-semibold text-slate-800">
                {cancelTarget.roomNumber}
              </span>{' '}
              will be released automatically.
            </p>

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
                {busyResId === cancelTarget.id ? 'Updating...' : 'Cancel Reservation'}
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
