import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  LogIn,
  LogOut,
  Printer,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useCms } from '../context/CmsContext';
import {
  clockInCurrentStaffWorkflow,
  clockOutAttendance,
  endStaffShiftWorkflow,
} from '../services/pmsService';
import {
  AttendanceRecord,
  formatBookingSourceLabel,
  formatNgn,
  getPropertySystemId,
  getReservationRoomDisplay,
  getRoomGalleryImages,
  getRoomSection,
  HousekeepingTaskRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  PosOrderRecord,
  PropertyRecord,
  ReservationRecord,
  ROLE_TO_DEPARTMENT,
  RoomRecord,
  RoomSection,
  ShiftScheduleRecord,
  sortRoomsByNumber,
  StaffMemberRecord,
  StaffRole,
  StaffSessionRecord,
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
  activeRole?: StaffRole;
  userUid?: string;
  userEmail?: string;
  userName?: string;
  staffMembers?: StaffMemberRecord[];
  staffSessions?: StaffSessionRecord[];
  shifts?: ShiftScheduleRecord[];
  attendance?: AttendanceRecord[];
  onNotify?: (msg: string) => void;
  onNavigate: (section: NavSectionId) => void;
  onOpenReservationFolio: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk',
    intent?: 'view' | 'edit'
  ) => void;
  onInspectRoom?: (roomId: string) => void;
  onSignOut?: () => void;
}

type RoomFilterTab = 'all' | 'vacant' | 'occupied' | 'dirty';

function formatIsoToTime(iso?: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClock24To12(hhmm?: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '—';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
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
  activeRole = 'front_desk',
  userUid = '',
  userEmail = '',
  userName = 'Staff Member',
  staffMembers = [],
  staffSessions = [],
  shifts = [],
  attendance = [],
  onNotify,
  onNavigate,
  onOpenReservationFolio,
  onInspectRoom,
  onSignOut,
}) => {
  const { cms } = useCms();
  const [roomFilter, setRoomFilter] = useState<RoomFilterTab>('all');
  const [clockBusy, setClockBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [endingShift, setEndingShift] = useState(false);
  const [shiftEndedAt, setShiftEndedAt] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [sessionFallbackLoginIso] = useState<string>(() => new Date().toISOString());

  const todayIso = new Date().toISOString().slice(0, 10);
  const sortedRooms = useMemo(() => sortRoomsByNumber(rooms), [rooms]);

  const canAccess = (section: NavSectionId) =>
    !allowedSections || allowedSections.includes(section);

  const emailLower = userEmail.trim().toLowerCase();
  const nameLower = userName.trim().toLowerCase();

  // Match current user's staff profile (if registered in Staff & HR)
  const matchedStaffMember = useMemo(() => {
    return (
      staffMembers.find(
        (m) =>
          (emailLower && (m.email || '').trim().toLowerCase() === emailLower) ||
          (nameLower && m.fullName.trim().toLowerCase() === nameLower)
      ) || null
    );
  }, [staffMembers, emailLower, nameLower]);

  const resolvedStaffId = matchedStaffMember?.id || userUid || 'staff';
  const resolvedDepartment =
    matchedStaffMember?.department || ROLE_TO_DEPARTMENT[activeRole] || 'Front Desk';

  // Match current user's active login session for Login Time
  const currentSession = useMemo(() => {
    const matches = staffSessions.filter(
      (s) =>
        (userUid && s.uid === userUid) ||
        (emailLower && s.email.trim().toLowerCase() === emailLower)
    );
    if (matches.length === 0) return null;
    return [...matches].sort((a, b) => b.loginAtIso.localeCompare(a.loginAtIso))[0];
  }, [staffSessions, userUid, emailLower]);

  const loginTimeLabel = formatIsoToTime(currentSession?.loginAtIso || sessionFallbackLoginIso);

  // Today's attendance entries for the current staff user
  const todaysUserAttendance = useMemo(() => {
    const matching = attendance.filter((a) => {
      if (a.date !== todayIso) return false;
      const byStaffId = a.staffId === resolvedStaffId || (userUid && a.staffId === userUid);
      const byOwner = userUid && a.ownerUid === userUid;
      const byName = nameLower && a.staffName.trim().toLowerCase() === nameLower;
      return Boolean(byStaffId || byOwner || byName);
    });
    return [...matching].sort((a, b) => (b.clockInTime || '').localeCompare(a.clockInTime || ''));
  }, [attendance, todayIso, resolvedStaffId, userUid, nameLower]);

  const activeAttendance = useMemo(
    () => todaysUserAttendance.find((a) => !a.clockOutTime) || null,
    [todaysUserAttendance]
  );

  const latestAttendance = activeAttendance || todaysUserAttendance[0] || null;

  // Today's active scheduled shift for current user (if any)
  const activeScheduledShift = useMemo(() => {
    return (
      shifts.find(
        (s) =>
          s.shiftDate === todayIso &&
          s.status === 'scheduled' &&
          (s.staffId === resolvedStaffId ||
            (userUid && s.staffId === userUid) ||
            (nameLower && s.staffName.trim().toLowerCase() === nameLower))
      ) || null
    );
  }, [shifts, todayIso, resolvedStaffId, userUid, nameLower]);

  const latestCompletedShiftToday = useMemo(() => {
    const completed = shifts.filter(
      (s) =>
        s.shiftDate === todayIso &&
        s.status === 'completed' &&
        (s.staffId === resolvedStaffId ||
          (userUid && s.staffId === userUid) ||
          (emailLower && s.closedBy?.trim().toLowerCase() === emailLower) ||
          (nameLower && s.staffName.trim().toLowerCase() === nameLower))
    );
    if (completed.length === 0) return null;
    return [...completed].sort((a, b) =>
      (b.closedAtIso || '').localeCompare(a.closedAtIso || '')
    )[0];
  }, [shifts, todayIso, resolvedStaffId, userUid, emailLower, nameLower]);

  // Core daily operational stats (clean, no financial/management report noise)
  const arrivalsToday = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.checkInDate === todayIso &&
          (r.status === 'confirmed' || r.status === 'pending')
      ),
    [reservations, todayIso]
  );

  const departuresToday = useMemo(
    () =>
      reservations.filter(
        (r) => r.status === 'checked_in' && r.checkOutDate === todayIso
      ),
    [reservations, todayIso]
  );

  const inHouseList = useMemo(
    () => reservations.filter((r) => r.status === 'checked_in'),
    [reservations]
  );

  const availableRooms = useMemo(
    () => sortedRooms.filter((r) => r.occupancyStatus === 'vacant'),
    [sortedRooms]
  );

  const occupiedRooms = useMemo(
    () => sortedRooms.filter((r) => r.occupancyStatus === 'occupied'),
    [sortedRooms]
  );

  const dirtyRooms = useMemo(
    () =>
      sortedRooms.filter(
        (r) => r.housekeepingStatus === 'dirty' || r.housekeepingStatus === 'cleaning'
      ),
    [sortedRooms]
  );

  const openHousekeepingCount = useMemo(
    () =>
      housekeepingTasks.filter(
        (t) => t.status !== 'completed' && t.status !== 'inspected'
      ).length,
    [housekeepingTasks]
  );

  const openMaintenanceCount = useMemo(
    () => maintenanceTickets.filter((t) => t.status !== 'resolved').length,
    [maintenanceTickets]
  );

  const openKitchenCount = useMemo(
    () => posOrders.filter((o) => o.kitchenStatus !== 'served').length,
    [posOrders]
  );

  const filteredRooms = useMemo(() => {
    if (roomFilter === 'vacant') return availableRooms;
    if (roomFilter === 'occupied') return occupiedRooms;
    if (roomFilter === 'dirty') return dirtyRooms;
    return sortedRooms;
  }, [roomFilter, sortedRooms, availableRooms, occupiedRooms, dirtyRooms]);

  const sections: Array<{ key: RoomSection; title: string }> = [
    {
      key: 'Serviced Apartment',
      title: cms.dashboard.servicedSectionTitle || 'Serviced Apartments',
    },
    {
      key: 'Hotel Rooms',
      title: cms.dashboard.hotelSectionTitle || 'Hotel Rooms',
    },
  ];

  const handleClockIn = async () => {
    setActionError(null);
    setClockBusy(true);
    try {
      const res = await clockInCurrentStaffWorkflow({
        property,
        staffId: resolvedStaffId,
        staffName: userName,
        actorRole,
      });
      onNotify?.(`Clocked in at ${formatClock24To12(res.clockInTime)}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to clock in right now.');
    } finally {
      setClockBusy(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeAttendance) return;
    setActionError(null);
    setClockBusy(true);
    try {
      const outTime = await clockOutAttendance({
        property,
        record: activeAttendance,
        actorRole,
      });
      onNotify?.(`Clocked out at ${formatClock24To12(outTime)}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to clock out right now.');
    } finally {
      setClockBusy(false);
    }
  };

  const exportShiftHandoverPdf = (overrideClockOut?: string) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc.setFillColor(6, 21, 57);
    doc.rect(0, 0, 595, 76, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`${property.name} — Staff Shift Handover Report`, 40, 34);
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Property ID: ${getPropertySystemId(property)}  |  Date: ${todayIso}  |  Generated: ${generatedAt}`,
      40,
      54
    );

    const clockInDisplay = latestAttendance?.clockInTime
      ? formatClock24To12(latestAttendance.clockInTime)
      : 'Not clocked in';
    const clockOutDisplay = overrideClockOut
      ? formatClock24To12(overrideClockOut)
      : latestAttendance?.clockOutTime
        ? formatClock24To12(latestAttendance.clockOutTime)
        : shiftEndedAt
          ? formatClock24To12(shiftEndedAt)
          : 'Active Shift';

    autoTable(doc, {
      startY: 94,
      head: [['Staff & Shift Details', 'Value']],
      body: [
        ['Staff Member', userName],
        ['Role / Department', `${actorRole} (${resolvedDepartment})`],
        ['Email', userEmail || '—'],
        ['Login Time', loginTimeLabel],
        ['Clocked In', clockInDisplay],
        ['Clocked Out', clockOutDisplay],
      ],
      headStyles: { fillColor: [11, 36, 91], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 6 },
      margin: { left: 40, right: 40 },
    });

    const afterMetaY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 240;

    autoTable(doc, {
      startY: afterMetaY + 14,
      head: [['Daily Operational Summary', 'Count']],
      body: [
        ['Total Rooms', String(sortedRooms.length)],
        ['Occupied Rooms (In-House)', String(occupiedRooms.length)],
        ['Available Rooms', String(availableRooms.length)],
        ['Rooms Requiring Cleaning', String(dirtyRooms.length)],
        ['Expected Arrivals Today', String(arrivalsToday.length)],
        ['Scheduled Departures Today', String(departuresToday.length)],
        ['Open Housekeeping Tasks', String(openHousekeepingCount)],
        ['Open Maintenance Tickets', String(openMaintenanceCount)],
        ['Active Kitchen Orders', String(openKitchenCount)],
      ],
      headStyles: { fillColor: [28, 70, 190], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 5 },
      margin: { left: 40, right: 40 },
    });

    const afterSummaryY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 440;

    autoTable(doc, {
      startY: afterSummaryY + 14,
      head: [['Room', 'Category', 'Occupancy', 'Housekeeping', 'Current Guest']],
      body: sortedRooms.map((rm) => [
        rm.roomNumber,
        rm.roomType,
        rm.occupancyStatus.replace('_', ' '),
        rm.housekeepingStatus,
        rm.currentGuestName || '—',
      ]),
      headStyles: { fillColor: [15, 23, 42], fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 4.5 },
      margin: { left: 40, right: 40 },
    });

    const afterRoomsY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 620;
    const notesText = handoverNotes.trim() || latestCompletedShiftToday?.handoverNotes || 'None recorded.';

    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Handover Notes:', 40, Math.min(afterRoomsY + 22, 760));
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(notesText, 515), 40, Math.min(afterRoomsY + 38, 778));

    doc.save(`${property.code.toLowerCase()}-shift-report-${todayIso}.pdf`);
    onNotify?.('Shift handover report downloaded.');
  };

  const handleEndShift = async (shouldPrintAfter: boolean) => {
    setActionError(null);
    setEndingShift(true);
    try {
      const result = await endStaffShiftWorkflow({
        property,
        activeAttendance,
        activeShift: activeScheduledShift,
        staffId: resolvedStaffId,
        staffName: userName,
        department: resolvedDepartment,
        handoverNotes,
        actorRole,
      });
      setShiftEndedAt(result.clockOutTime);
      onNotify?.(`Shift ended and clocked out at ${formatClock24To12(result.clockOutTime)}.`);
      if (shouldPrintAfter) {
        exportShiftHandoverPdf(result.clockOutTime);
      }
      setShowEndShiftModal(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not close shift.');
    } finally {
      setEndingShift(false);
    }
  };

  const kpiCards: Array<{
    id: string;
    label: string;
    value: number;
    sub: string;
    accent: string;
    target: NavSectionId;
  }> = [
    {
      id: 'arrivals',
      label: 'Arrivals Today',
      value: arrivalsToday.length,
      sub: 'Expected check-ins',
      accent: 'border-t-[#1c46be]',
      target: 'arrivals',
    },
    {
      id: 'departures',
      label: 'Departures Today',
      value: departuresToday.length,
      sub: 'Due check-outs',
      accent: 'border-t-amber-500',
      target: 'in_house',
    },
    {
      id: 'in_house',
      label: 'In-House Guests',
      value: inHouseList.length,
      sub: `${occupiedRooms.length} of ${sortedRooms.length} rooms occupied`,
      accent: 'border-t-emerald-600',
      target: 'in_house',
    },
    {
      id: 'available',
      label: 'Available Rooms',
      value: availableRooms.length,
      sub:
        dirtyRooms.length > 0
          ? `${dirtyRooms.length} awaiting cleaning`
          : 'All rooms serviced',
      accent: 'border-t-slate-700',
      target: 'rooms',
    },
  ];

  return (
    <div className="space-y-6">
      {actionError && (
        <div
          role="alert"
          className="no-print bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 flex items-center justify-between gap-3"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Staff Shift & Attendance Control Header */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="bg-[#061539] px-5 sm:px-6 py-5 text-white flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
              {property.name}
            </h1>
            <p className="text-xs text-blue-200 mt-0.5">
              {userName} · {actorRole}
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            {!activeAttendance ? (
              <button
                type="button"
                disabled={clockBusy}
                onClick={handleClockIn}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{clockBusy ? 'Clocking In...' : 'Clock In'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={clockBusy}
                onClick={handleClockOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#061539] text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{clockBusy ? 'Clocking Out...' : 'Clock Out'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowEndShiftModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-[#061539] hover:bg-blue-50 text-xs font-bold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#1c46be]" />
              <span>End Shift / Print Report</span>
            </button>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Clean Attendance & Shift Timing Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/70">
          <div className="px-5 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Login Time
            </p>
            <p className="font-mono-tabular text-sm font-bold text-[#061539] mt-0.5">
              {loginTimeLabel}
            </p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Clocked In
            </p>
            <p className="font-mono-tabular text-sm font-bold text-slate-900 mt-0.5">
              {latestAttendance?.clockInTime ? (
                <span className="text-emerald-700">
                  {formatClock24To12(latestAttendance.clockInTime)}
                  {!latestAttendance.clockOutTime ? ' · On Duty' : ''}
                </span>
              ) : (
                <span className="text-slate-400">Not clocked in yet</span>
              )}
            </p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Clocked Out / Shift Status
            </p>
            <p className="font-mono-tabular text-sm font-bold text-slate-900 mt-0.5">
              {latestAttendance?.clockOutTime || shiftEndedAt ? (
                <span className="text-slate-700">
                  {formatClock24To12(latestAttendance?.clockOutTime || shiftEndedAt || undefined)}
                  {latestCompletedShiftToday ? ' · Shift Ended' : ''}
                </span>
              ) : activeAttendance ? (
                <span className="text-[#1c46be]">Active Shift</span>
              ) : (
                <span className="text-slate-400">Ready to start</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* 4 Clean Operational KPI Cards (no card icons for neatness) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              if (canAccess(card.target)) onNavigate(card.target);
            }}
            className={`bg-white border border-slate-200 border-t-4 ${card.accent} rounded-xl p-4 text-left hover:border-slate-300 transition-colors cursor-pointer`}
          >
            <p className="text-xs font-semibold text-slate-600">{card.label}</p>
            <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-bold text-[#061539] mt-1.5">
              {card.value}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">{card.sub}</p>
          </button>
        ))}
      </section>

      {/* Primary Focus: Rooms & Live Status with Photos */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#061539]">
              Rooms Overview ({sortedRooms.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live occupancy and housekeeping status across all rooms
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {(
              [
                { id: 'all', label: `All (${sortedRooms.length})` },
                { id: 'vacant', label: `Available (${availableRooms.length})` },
                { id: 'occupied', label: `Occupied (${occupiedRooms.length})` },
                { id: 'dirty', label: `Cleaning (${dirtyRooms.length})` },
              ] as Array<{ id: RoomFilterTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoomFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  roomFilter === tab.id
                    ? 'bg-white text-[#061539] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredRooms.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            No rooms match this filter right now.
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((sec) => {
              const secRooms = filteredRooms.filter((r) => getRoomSection(r) === sec.key);
              if (secRooms.length === 0) return null;
              return (
                <div key={sec.key} className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {sec.title} · {secRooms.length}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {secRooms.map((room) => {
                      const slides = getRoomGalleryImages(room);
                      const coverUrl = slides[0]?.url || '';
                      const imgFailed = brokenImages[room.id];

                      const statusLabel =
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

                      const hkColor =
                        room.housekeepingStatus === 'dirty'
                          ? 'text-rose-600'
                          : room.housekeepingStatus === 'cleaning'
                            ? 'text-amber-600'
                            : 'text-slate-500';

                      const activeRes =
                        room.currentReservationId
                          ? reservations.find((r) => r.id === room.currentReservationId)
                          : reservations.find(
                              (r) => r.roomId === room.id && r.status === 'checked_in'
                            );

                      return (
                        <div
                          key={room.id}
                          onClick={() => {
                            if (activeRes) {
                              onOpenReservationFolio(activeRes.id, 'reservations', 'view');
                            } else if (onInspectRoom && canAccess('rooms')) {
                              onInspectRoom(room.id);
                            } else if (canAccess('rooms')) {
                              onNavigate('rooms');
                            }
                          }}
                          className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#1c46be] hover:shadow-sm transition-all cursor-pointer flex flex-col"
                        >
                          <div className="relative aspect-[16/10] w-full bg-slate-100 overflow-hidden">
                            {coverUrl && !imgFailed ? (
                              <img
                                src={coverUrl}
                                alt={`${room.roomNumber} - ${room.roomType}`}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBrokenImages((prev) => ({ ...prev, [room.id]: true }))
                                }
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 text-xs font-semibold">
                                {room.roomNumber}
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-transparent px-3 py-2.5 flex items-end justify-between gap-2">
                              <span className="font-mono-tabular text-xs font-bold text-white">
                                {room.roomNumber}
                              </span>
                              <span className="font-mono-tabular text-[11px] font-semibold text-white/95">
                                {formatNgn(room.nightlyRateNgn)}/nt
                              </span>
                            </div>
                          </div>

                          <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {room.roomType}
                              </p>
                              <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                                <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
                                <span className={`capitalize font-medium ${hkColor}`}>
                                  {room.housekeepingStatus}
                                </span>
                              </div>
                            </div>

                            {room.currentGuestName ? (
                              <p className="text-[11px] text-slate-600 pt-2 border-t border-slate-100 truncate">
                                Guest: <span className="font-semibold text-slate-900">{room.currentGuestName}</span>
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                                Max {room.maxGuests} guest{room.maxGuests === 1 ? '' : 's'}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Compact Today's Arrivals & Departures */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm font-bold text-[#061539]">
              Today&apos;s Arrivals ({arrivalsToday.length})
            </h2>
            {canAccess('arrivals') && (
              <button
                type="button"
                onClick={() => onNavigate('arrivals')}
                className="no-print text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer"
              >
                View all
              </button>
            )}
          </div>
          {arrivalsToday.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No expected arrivals remaining today.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {arrivalsToday.slice(0, 5).map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => onOpenReservationFolio(res.id, 'reservations', 'view')}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{res.guestName}</p>
                    <p className="text-[11px] text-slate-500">
                      {getReservationRoomDisplay(res, rooms).roomNumberLabel} ·{' '}
                      {formatBookingSourceLabel(res.channel)}
                    </p>
                  </div>
                  <span className="font-mono-tabular text-[11px] font-semibold text-[#1c46be] shrink-0">
                    Check In →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm font-bold text-[#061539]">
              Today&apos;s Departures ({departuresToday.length})
            </h2>
            {canAccess('in_house') && (
              <button
                type="button"
                onClick={() => onNavigate('in_house')}
                className="no-print text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer"
              >
                View all
              </button>
            )}
          </div>
          {departuresToday.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No check-outs scheduled for today.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {departuresToday.slice(0, 5).map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => onOpenReservationFolio(res.id, 'reservations', 'view')}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{res.guestName}</p>
                    <p className="text-[11px] text-slate-500">
                      {getReservationRoomDisplay(res, rooms).roomNumberLabel} · Out {res.checkOutDate}
                    </p>
                  </div>
                  <span className="font-mono-tabular text-[11px] font-semibold text-amber-700 shrink-0">
                    Open Folio →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* End Shift & Print Handover Report Modal */}
      {showEndShiftModal && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 bg-[#061539] text-white flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold">End Shift &amp; Shift Report</h2>
                <p className="text-[11px] text-blue-200 mt-0.5">
                  {userName} · {actorRole} · {todayIso}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEndShiftModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">
                    Login Time
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {loginTimeLabel}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">
                    Clocked In
                  </span>
                  <span className="font-mono-tabular font-bold text-emerald-700">
                    {latestAttendance?.clockInTime
                      ? formatClock24To12(latestAttendance.clockInTime)
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">
                    Occupied / Free
                  </span>
                  <span className="font-mono-tabular font-bold text-[#061539]">
                    {occupiedRooms.length} / {availableRooms.length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {arrivalsToday.length}
                  </p>
                  <p className="text-[10px] text-slate-500">Arrivals</p>
                </div>
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {departuresToday.length}
                  </p>
                  <p className="text-[10px] text-slate-500">Departures</p>
                </div>
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {openHousekeepingCount}
                  </p>
                  <p className="text-[10px] text-slate-500">Housekeeping</p>
                </div>
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {openMaintenanceCount}
                  </p>
                  <p className="text-[10px] text-slate-500">Maintenance</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Handover Notes for Next Shift (Optional)
                </label>
                <textarea
                  rows={3}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="Key handovers, pending guest requests, room inspections, or cash drawer notes..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c46be]/20 focus:border-[#1c46be]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportShiftHandoverPdf()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEndShiftModal(false);
                      window.setTimeout(() => window.print(), 150);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Page</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={endingShift}
                  onClick={() => handleEndShift(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#061539] hover:bg-[#0c2b70] text-white text-xs font-semibold disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{endingShift ? 'Closing Shift...' : 'End Shift & Download Report'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
