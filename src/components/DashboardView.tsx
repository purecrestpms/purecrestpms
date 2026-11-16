import React from 'react';
import {
  ArrowRight,
  BedDouble,
  Calendar,
  ChefHat,
  KeyRound,
  MapPin,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  formatNgn,
  getRoomSection,
  LicenseRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  PosOrderRecord,
  PropertyRecord,
  ReservationRecord,
  RICHGATES_EXTERIOR_IMAGE,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
} from '../types/pms';

interface DashboardViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  posOrders: PosOrderRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  activeLicense?: LicenseRecord;
  canManageRooms: boolean;
  onNavigate: (section: NavSectionId) => void;
}

const DEFAULT_SUITE_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

export const DashboardView: React.FC<DashboardViewProps> = ({
  property,
  rooms,
  reservations,
  posOrders,
  maintenanceTickets,
  activeLicense,
  canManageRooms,
  onNavigate,
}) => {
  const sortedRooms = sortRoomsByNumber(rooms);
  const activeFolios = reservations.filter(
    (r) => r.status === 'checked_in' || r.status === 'confirmed'
  );
  const openKitchen = posOrders.filter((o) => o.kitchenStatus !== 'served');
  const openMaintenance = maintenanceTickets.filter((t) => t.status !== 'resolved');

  const sections: Array<{ key: RoomSection; title: string; subtitle: string }> = [
    {
      key: 'Serviced Apartment',
      title: 'Serviced Apartment Section',
      subtitle: 'Self-contained studios and suites equipped with fitted kitchenettes',
    },
    {
      key: 'Hotel Rooms',
      title: 'Hotel Rooms',
      subtitle: 'Individual executive studios and one-bedroom hospitality suites',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Architectural Property Showcase Hero (Zero Counts / Stats) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-5 relative min-h-[210px] bg-slate-900">
          <img
            src={RICHGATES_EXTERIOR_IMAGE}
            alt={property.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="font-mono-tabular text-[11px] text-emerald-300">{property.code}</p>
            <p className="font-display text-lg font-bold leading-snug">{property.name}</p>
          </div>
        </div>

        <div className="lg:col-span-7 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-emerald-700" />
              <span>{property.address}</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
              Hospitality Operations &amp; Suite Directory
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              Manage guest stays, availability blocks, room rates, kitchen tickets, housekeeping turnarounds, and Naira folios from one unified workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Availability Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('rooms')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <BedDouble className="w-3.5 h-3.5" />
              <span>{canManageRooms ? 'Manage Rooms & Rates' : 'View Suites & Rates'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reservations')}
              className="px-4 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Reservations
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pos_kitchen')}
              className="px-4 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Restaurant POS
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
                <h2 className="font-display text-base font-bold text-slate-900">{sec.title}</h2>
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
                    ? 'text-emerald-700'
                    : room.occupancyStatus === 'reserved'
                      ? 'text-amber-700'
                      : room.occupancyStatus === 'out_of_order'
                        ? 'text-rose-700'
                        : 'text-slate-700';

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onNavigate('rooms')}
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

                      <p className="text-[11px] text-slate-600 truncate">
                        {room.currentGuestName || 'Ready for check-in'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Bottom Operational Workspace Grid (No Stat Counters) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* In-House & Upcoming Arrivals */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                In-House Guests &amp; Scheduled Arrivals
              </h2>
              <p className="text-xs text-slate-500">
                Current stays and confirmed arrivals across Serviced Apartments &amp; Hotel Rooms
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('front_desk')}
              className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap cursor-pointer"
            >
              Open Front Desk
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Ref / Unit</th>
                  <th className="py-2.5 px-4">Guest</th>
                  <th className="py-2.5 px-4">Stay Window</th>
                  <th className="py-2.5 px-4">Channel</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {activeFolios.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono-tabular">
                      <span className="font-semibold text-slate-900">{res.bookingRef}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-700">{res.roomNumber}</span>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{res.guestName}</td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-600">
                      {res.checkInDate} → {res.checkOutDate}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{res.channel}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`font-medium ${
                          res.status === 'checked_in' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {res.status === 'checked_in' ? 'In-House' : 'Confirmed Arrival'}
                      </span>
                    </td>
                  </tr>
                ))}
                {activeFolios.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      No active stays or arrivals scheduled right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Departmental Operations Column */}
        <div className="space-y-4">
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

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-700" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  PureCrest License
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('licensing')}
                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>
            <p className="font-mono-tabular text-xs font-semibold text-slate-900">
              {activeLicense?.licenseKey || property.licenseKey || 'Unlicensed'}
            </p>
            <p className="text-xs text-slate-600">
              {activeLicense
                ? `${activeLicense.plan} · ${activeLicense.isLifetime ? 'Lifetime Activation' : `Expires ${activeLicense.expiresAt}`}`
                : 'No active license bound'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
