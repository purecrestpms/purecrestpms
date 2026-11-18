import React from 'react';
import {
  ArrowRight,
  BedDouble,
  BookOpenCheck,
  Building2,
  Calendar,
  CalendarCheck2,
  ChefHat,
  ClipboardList,
  DoorOpen,
  LogOut,
  PlaneLanding,
  Printer,
  Sparkles,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  formatBookingSourceLabel,
  getReservationRoomDisplay,
  getRoomSection,
  HousekeepingTaskRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  PosOrderRecord,
  PropertyRecord,
  ReservationRecord,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
} from '../types/pms';

interface StaffDashboardViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  posOrders: PosOrderRecord[];
  housekeepingTasks?: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  allowedSections?: NavSectionId[];
  actorRole: string;
  onNavigate: (section: NavSectionId) => void;
  onOpenReservationFolio: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk',
    intent?: 'view' | 'edit'
  ) => void;
  onSignOut?: () => void;
}

export const StaffDashboardView: React.FC<StaffDashboardViewProps> = ({
  property,
  rooms,
  reservations,
  posOrders,
  housekeepingTasks = [],
  maintenanceTickets,
  allowedSections,
  actorRole,
  onNavigate,
  onOpenReservationFolio,
  onSignOut,
}) => {
  const { cms } = useCms();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sortedRooms = sortRoomsByNumber(rooms);

  const canAccess = (section: NavSectionId) =>
    !allowedSections || allowedSections.includes(section);

  const arrivalsToday = reservations.filter(
    (r) => r.checkInDate === todayIso && (r.status === 'confirmed' || r.status === 'pending')
  );
  const departuresToday = reservations.filter(
    (r) => r.status === 'checked_in' && r.checkOutDate === todayIso
  );
  const inHouseList = reservations.filter((r) => r.status === 'checked_in');
  const availableRooms = sortedRooms.filter((r) => r.occupancyStatus === 'vacant');
  const occupiedRooms = sortedRooms.filter((r) => r.occupancyStatus === 'occupied');
  const dirtyRooms = sortedRooms.filter((r) => r.housekeepingStatus === 'dirty');

  const openKitchen = posOrders.filter((o) => o.kitchenStatus !== 'served');
  const openMaintenance = maintenanceTickets.filter((t) => t.status !== 'resolved');
  const pendingHousekeeping = housekeepingTasks.filter(
    (t) => t.status !== 'completed' && t.status !== 'inspected'
  );

  const sections: Array<{ key: RoomSection; title: string }> = [
    {
      key: 'Serviced Apartment',
      title: cms.dashboard.servicedSectionTitle || 'Serviced Apartment Section',
    },
    {
      key: 'Hotel Rooms',
      title: cms.dashboard.hotelSectionTitle || 'Hotel Rooms Section',
    },
  ];

  const kpiCards: Array<{
    id: string;
    label: string;
    sub: string;
    value: number;
    accent: string;
    target: NavSectionId;
  }> = [
    {
      id: 'arrivals',
      label: 'Arrivals Today',
      sub: 'Expected check-ins',
      value: arrivalsToday.length,
      accent: 'border-t-[#1c46be]',
      target: 'arrivals',
    },
    {
      id: 'departures',
      label: 'Departures Today',
      sub: 'Due check-outs',
      value: departuresToday.length,
      accent: 'border-t-amber-500',
      target: 'in_house',
    },
    {
      id: 'in-house',
      label: 'In-House Guests',
      sub: `${occupiedRooms.length} rooms occupied`,
      value: inHouseList.length,
      accent: 'border-t-emerald-600',
      target: 'in_house',
    },
    {
      id: 'available',
      label: 'Available Rooms',
      sub: `${dirtyRooms.length} need housekeeping`,
      value: availableRooms.length,
      accent: 'border-t-slate-700',
      target: 'rooms',
    },
  ];

  const quickShortcutItems: Array<{
    section: NavSectionId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    primary?: boolean;
  }> = [
    { section: 'shift_daily_report', label: 'Shift Daily Report', icon: Printer, primary: true },
    { section: 'walk_in', label: 'Walk-in Check-In', icon: UserCheck },
    { section: 'arrivals', label: 'Today Arrivals', icon: PlaneLanding },
    { section: 'in_house', label: 'In-House Guests', icon: DoorOpen },
    { section: 'front_desk', label: 'Front Desk & Folios', icon: BookOpenCheck },
    { section: 'reservations', label: 'Reservations', icon: CalendarCheck2 },
    { section: 'calendar', label: 'Room Calendar', icon: Calendar },
    { section: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
    { section: 'pos_kitchen', label: 'Restaurant & KDS', icon: ChefHat },
    { section: 'maintenance', label: 'Maintenance', icon: Wrench },
  ];
  const quickShortcuts = quickShortcutItems.filter((item) => canAccess(item.section));

  return (
    <div className="space-y-6">
      {/* Staff Operational Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#061539] text-white flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#061539] tracking-tight truncate">
                  {property.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-[#1c46be]">
                  {actorRole}
                </span>
              </div>
              <p className="font-mono-tabular text-[11px] font-semibold text-slate-500 mt-0.5">
                {property.code} · {sortedRooms.length} Rooms · Daily Operations Workspace
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('shift_daily_report')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#061539] hover:bg-[#0c2b70] text-white rounded-lg transition-colors cursor-pointer"
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-300" />
              <span>Print Shift Daily Report</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="px-3 py-2 text-xs font-semibold text-[#1c46be] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
            >
              My Profile
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Role-Filtered Quick Workspace Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          {quickShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <button
                key={shortcut.section}
                type="button"
                onClick={() => onNavigate(shortcut.section)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  shortcut.primary
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{shortcut.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Clean Operational KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const reachable = canAccess(card.target);
          return (
            <div
              key={card.id}
              className={`bg-white border border-slate-200 border-t-4 ${card.accent} rounded-xl p-5 flex flex-col justify-between gap-3`}
            >
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#061539]">
                  {card.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
              </div>
              <div className="flex items-end justify-between pt-1">
                <span className="font-mono-tabular text-3xl font-bold text-slate-900 leading-none">
                  {card.value}
                </span>
                {reachable && (
                  <button
                    type="button"
                    onClick={() => onNavigate(card.target)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer"
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Two-Column Grid: Room Readiness Matrix & Today's Operational Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Room Readiness Matrix (3 Columns) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-[#1c46be]" />
              <h2 className="font-display text-base font-extrabold text-[#061539]">
                Live Room Readiness
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Available</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>Occupied</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Reserved</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span>Out of Order</span>
              </span>
            </div>
          </div>

          <div className="space-y-5">
            {sections.map((sec) => {
              const secRooms = sortedRooms.filter((r) => getRoomSection(r) === sec.key);
              if (secRooms.length === 0) return null;
              return (
                <div key={sec.key} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      {sec.title} ({secRooms.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {secRooms.map((room) => {
                      const activeRes = reservations.find(
                        (r) =>
                          (r.id === room.currentReservationId || r.roomId === room.id) &&
                          (r.status === 'checked_in' || r.status === 'confirmed')
                      );
                      const statusPill =
                        room.occupancyStatus === 'occupied'
                          ? 'bg-blue-600 text-white'
                          : room.occupancyStatus === 'reserved'
                            ? 'bg-amber-100 text-amber-900'
                            : room.occupancyStatus === 'out_of_order'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-emerald-100 text-emerald-800';
                      const hkColor =
                        room.housekeepingStatus === 'clean' || room.housekeepingStatus === 'inspected'
                          ? 'text-emerald-700'
                          : room.housekeepingStatus === 'dirty'
                            ? 'text-rose-700'
                            : 'text-amber-700';

                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            if (activeRes && canAccess('front_desk')) {
                              onOpenReservationFolio(activeRes.id, 'front_desk');
                            } else if (room.occupancyStatus === 'vacant' && canAccess('walk_in')) {
                              onNavigate('walk_in');
                            } else if (canAccess('rooms')) {
                              onNavigate('rooms');
                            } else if (canAccess('housekeeping')) {
                              onNavigate('housekeeping');
                            }
                          }}
                          className="text-left rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/50 hover:bg-white p-3.5 space-y-2 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono-tabular text-sm font-extrabold text-[#061539]">
                              {room.roomNumber}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${statusPill}`}>
                              {room.occupancyStatus === 'vacant'
                                ? 'Available'
                                : room.occupancyStatus.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {room.roomType}
                          </p>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/70">
                            <span className="text-slate-600 truncate pr-2">
                              {room.currentGuestName || 'Ready for guest'}
                            </span>
                            <span className={`font-semibold capitalize shrink-0 ${hkColor}`}>
                              {room.housekeepingStatus}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Today's Guest Movements + Departmental Queue */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h2 className="font-display text-sm font-extrabold text-[#061539]">
                Today&apos;s Guest Movements
              </h2>
              <span className="font-mono-tabular text-[11px] font-semibold text-slate-500">
                {todayIso}
              </span>
            </div>

            {arrivalsToday.length === 0 && departuresToday.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-500">
                No pending arrivals or departures scheduled for today.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {arrivalsToday.slice(0, 4).map((r) => (
                  <button
                    key={`arr-${r.id}`}
                    type="button"
                    onClick={() => {
                      if (canAccess('front_desk')) {
                        onOpenReservationFolio(r.id, 'front_desk');
                      } else if (canAccess('arrivals')) {
                        onNavigate('arrivals');
                      }
                    }}
                    className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 rounded px-1 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{r.guestName}</p>
                      <p className="text-[11px] text-slate-500 font-mono-tabular truncate">
                        {getReservationRoomDisplay(r, rooms).roomNumberLabel} ·{' '}
                        {formatBookingSourceLabel(r.channel)}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1c46be] text-[10px] font-bold shrink-0">
                      Arrival
                    </span>
                  </button>
                ))}
                {departuresToday.slice(0, 4).map((r) => (
                  <button
                    key={`dep-${r.id}`}
                    type="button"
                    onClick={() => {
                      if (canAccess('front_desk')) {
                        onOpenReservationFolio(r.id, 'front_desk');
                      } else if (canAccess('in_house')) {
                        onNavigate('in_house');
                      }
                    }}
                    className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 rounded px-1 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{r.guestName}</p>
                      <p className="text-[11px] text-slate-500 font-mono-tabular truncate">
                        {getReservationRoomDisplay(r, rooms).roomNumberLabel} · Due Out Today
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold shrink-0">
                      Departure
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
            <h2 className="font-display text-sm font-extrabold text-[#061539] border-b border-slate-100 pb-2.5">
              Departmental Action Queues
            </h2>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-slate-900">Housekeeping Queue</p>
                    <p className="text-[11px] text-slate-500">
                      {pendingHousekeeping.length} pending · {dirtyRooms.length} dirty rooms
                    </p>
                  </div>
                </div>
                {canAccess('housekeeping') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('housekeeping')}
                    className="font-bold text-[#1c46be] hover:underline cursor-pointer"
                  >
                    Open
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-amber-700" />
                  <div>
                    <p className="font-semibold text-slate-900">Kitchen Tickets</p>
                    <p className="text-[11px] text-slate-500">
                      {openKitchen.length} active orders
                    </p>
                  </div>
                </div>
                {canAccess('pos_kitchen') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('pos_kitchen')}
                    className="font-bold text-[#1c46be] hover:underline cursor-pointer"
                  >
                    Open KDS
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-700" />
                  <div>
                    <p className="font-semibold text-slate-900">Maintenance Requests</p>
                    <p className="text-[11px] text-slate-500">
                      {openMaintenance.length} open ticket(s)
                    </p>
                  </div>
                </div>
                {canAccess('maintenance') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('maintenance')}
                    className="font-bold text-[#1c46be] hover:underline cursor-pointer"
                  >
                    View
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simple Staff Footer */}
      <footer className="pt-4 pb-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
        <p className="font-bold text-[#061539]">
          © {new Date().getFullYear()} {property.name}. All rights reserved.
        </p>
        <p className="font-medium text-slate-500">
          Powered by <span className="font-bold text-[#061539]">PCH PMS</span>
        </p>
      </footer>
    </div>
  );
};
