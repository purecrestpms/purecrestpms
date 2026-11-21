import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Download,
  LogIn,
  LogOut,
  Play,
  Printer,
  RefreshCw,
  ShoppingCart,
  Square,
  UserCircle2,
  Users,
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
  RESERVATION_STATUS_LABELS,
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

function formatShortMonthDay(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

function getStatusPillStyle(status: ReservationRecord['status']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'checked_in':
      return { label: 'Checked In', className: 'bg-blue-100 text-[#0a367a]' };
    case 'confirmed':
      return { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-800' };
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    case 'checked_out':
      return { label: 'Checked Out', className: 'bg-slate-100 text-slate-700' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-rose-100 text-rose-700' };
    default:
      return {
        label: RESERVATION_STATUS_LABELS[status] || status,
        className: 'bg-slate-100 text-slate-700',
      };
  }
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
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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

  // Core daily operational stats
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

  const reservedRooms = useMemo(
    () => sortedRooms.filter((r) => r.occupancyStatus === 'reserved'),
    [sortedRooms]
  );

  const outOfOrderRooms = useMemo(
    () => sortedRooms.filter((r) => r.occupancyStatus === 'out_of_order'),
    [sortedRooms]
  );

  const dirtyRooms = useMemo(
    () =>
      sortedRooms.filter(
        (r) => r.housekeepingStatus === 'dirty' || r.housekeepingStatus === 'cleaning'
      ),
    [sortedRooms]
  );

  const occupancyRate = useMemo(() => {
    const sellable = sortedRooms.length - outOfOrderRooms.length;
    const denom = sellable > 0 ? sellable : sortedRooms.length;
    if (denom <= 0) return 0;
    return Math.min(100, Math.round((occupiedRooms.length / denom) * 100));
  }, [sortedRooms.length, outOfOrderRooms.length, occupiedRooms.length]);

  const openHousekeepingTasks = useMemo(
    () =>
      housekeepingTasks.filter(
        (t) => t.status !== 'completed' && t.status !== 'inspected'
      ),
    [housekeepingTasks]
  );

  const openMaintenanceTickets = useMemo(
    () => maintenanceTickets.filter((t) => t.status !== 'resolved'),
    [maintenanceTickets]
  );

  const openHousekeepingCount = openHousekeepingTasks.length;
  const openMaintenanceCount = openMaintenanceTickets.length;

  const openKitchenCount = useMemo(
    () => posOrders.filter((o) => o.kitchenStatus !== 'served').length,
    [posOrders]
  );

  const recentReservations = useMemo(() => {
    return [...reservations]
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''))
      .slice(0, 5);
  }, [reservations]);

  const resolvePosOrderIso = (ord: PosOrderRecord): string => {
    if (typeof ord.createdAt === 'string') return ord.createdAt;
    if (ord.createdAt && typeof ord.createdAt.toDate === 'function') {
      const d = ord.createdAt.toDate();
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return ord.orderDate || '';
  };

  const recentPosOrders = useMemo(() => {
    return [...posOrders]
      .sort((a, b) => resolvePosOrderIso(b).localeCompare(resolvePosOrderIso(a)))
      .slice(0, 5);
  }, [posOrders]);

  const upcomingTasks = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      timeLabel: string;
      section: NavSectionId;
      dotColor: string;
    }> = [];
    for (const hk of openHousekeepingTasks.slice(0, 4)) {
      items.push({
        id: `hk-${hk.id}`,
        title: `Room ${hk.roomNumber} – ${hk.taskType || 'Cleaning'}`,
        timeLabel: hk.priority ? hk.priority.toUpperCase() : 'Pending',
        section: 'housekeeping',
        dotColor: 'bg-[#1557b0]',
      });
    }
    for (const mt of openMaintenanceTickets.slice(0, 3)) {
      items.push({
        id: `mt-${mt.id}`,
        title: `${mt.locationLabel ? `${mt.locationLabel} – ` : ''}${mt.issueTitle}`,
        timeLabel: mt.priority ? mt.priority.toUpperCase() : 'Open',
        section: 'maintenance',
        dotColor: 'bg-amber-500',
      });
    }
    return items.slice(0, 5);
  }, [openHousekeepingTasks, openMaintenanceTickets]);

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

  // SVG Donut ring geometry
  const donutRadius = 46;
  const donutCirc = 2 * Math.PI * donutRadius;
  const totalRoomsSafe = Math.max(1, sortedRooms.length);
  const occDash = (occupiedRooms.length / totalRoomsSafe) * donutCirc;
  const availDash = (availableRooms.length / totalRoomsSafe) * donutCirc;
  const oooDash = (outOfOrderRooms.length / totalRoomsSafe) * donutCirc;
  const occRateDash = (occupancyRate / 100) * donutCirc;

  const liveClockStr = nowTick.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const liveDateStr = nowTick.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

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

    doc.setFillColor(10, 54, 122);
    doc.rect(0, 0, 595, 76, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`${property.name} — Staff Shift Handover Report`, 40, 34);
    doc.setFontSize(9);
    doc.setTextColor(219, 234, 254);
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
      headStyles: { fillColor: [10, 54, 122], fontSize: 9 },
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
      headStyles: { fillColor: [21, 87, 176], fontSize: 9 },
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
    const notesText =
      handoverNotes.trim() || latestCompletedShiftToday?.handoverNotes || 'None recorded.';

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

  const shiftLabel = activeScheduledShift
    ? `Shift: ${activeScheduledShift.shiftWindow}`
    : `Login: ${loginTimeLabel}`;

  return (
    <div className="space-y-5">
      {actionError && (
        <div
          role="alert"
          className="no-print bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-rose-900 flex items-center justify-between gap-3"
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

      {/* 1. Eight Operational KPI Cards (2 rows of 4) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => canAccess('rooms') && onNavigate('rooms')}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Total Rooms</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {sortedRooms.length}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoomFilter('vacant');
          }}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Available Rooms</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {availableRooms.length}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoomFilter('occupied');
          }}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Occupied Rooms</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {occupiedRooms.length}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccess('reservations') && onNavigate('reservations')}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Reserved Rooms</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {reservedRooms.length}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccess('in_house') && onNavigate('in_house')}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">In-House Guests</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {inHouseList.length}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccess('rooms') && onNavigate('rooms')}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500">Occupancy Rate</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {occupancyRate}%
            </p>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-[#0a367a] rounded-full transition-all"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccess('arrivals') && onNavigate('arrivals')}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Today&apos;s Arrivals</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {arrivalsToday.length}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccess('in_house') && onNavigate('in_house')}
          className="bg-white border border-slate-200 hover:border-[#0a367a] rounded-xl p-3.5 sm:p-4 flex items-center gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Today&apos;s Departures</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] mt-0.5">
              {departuresToday.length}
            </p>
          </div>
        </button>
      </section>

      {/* 2. Middle Analytics & Clock-In Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Room Occupancy Overview */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-200" />
            <h2 className="font-display text-sm font-bold">Room Occupancy Overview</h2>
          </div>
          <div className="p-4 flex items-center justify-around gap-4 flex-1">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r={donutRadius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="15"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={donutRadius}
                  fill="none"
                  stroke="#1557b0"
                  strokeWidth="15"
                  strokeDasharray={`${occRateDash} ${donutCirc}`}
                  strokeLinecap="butt"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display font-mono-tabular text-xl font-extrabold text-[#061f4d] leading-none">
                  {occupancyRate}%
                </span>
                <span className="text-[11px] font-medium text-slate-500 mt-0.5">Occupancy</span>
              </div>
            </div>

            <div className="space-y-2 text-xs min-w-[124px]">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1557b0]" />
                  Occupied
                </span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {occupiedRooms.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  Available
                </span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {availableRooms.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  Out of Order
                </span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {outOfOrderRooms.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Room Status */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-blue-200" />
            <h2 className="font-display text-sm font-bold">Room Status</h2>
          </div>
          <div className="p-4 flex items-center justify-around gap-4 flex-1">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r={donutRadius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="15"
                />
                {occupiedRooms.length > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r={donutRadius}
                    fill="none"
                    stroke="#1557b0"
                    strokeWidth="15"
                    strokeDasharray={`${occDash} ${donutCirc}`}
                    strokeDashoffset={0}
                  />
                )}
                {availableRooms.length > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r={donutRadius}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="15"
                    strokeDasharray={`${availDash} ${donutCirc}`}
                    strokeDashoffset={-occDash}
                  />
                )}
                {outOfOrderRooms.length > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r={donutRadius}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="15"
                    strokeDasharray={`${oooDash} ${donutCirc}`}
                    strokeDashoffset={-(occDash + availDash)}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display font-mono-tabular text-xl font-extrabold text-[#061f4d] leading-none">
                  {sortedRooms.length}
                </span>
                <span className="text-[11px] font-medium text-slate-500 mt-0.5">Total Rooms</span>
              </div>
            </div>

            <div className="space-y-2 text-xs min-w-[124px]">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1557b0]" />
                  Occupied
                </span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {occupiedRooms.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  Available
                </span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {availableRooms.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Out of Order
                </span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {outOfOrderRooms.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Staff Clock In */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold">Staff Clock In</h2>
            <button
              type="button"
              onClick={() => setShowEndShiftModal(true)}
              className="no-print inline-flex items-center gap-1 text-xs font-semibold text-blue-100 hover:text-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Shift Report</span>
            </button>
          </div>
          <div className="p-4 flex flex-col justify-between gap-3 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
                <UserCircle2 className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-slate-900 truncate">
                  {userName}
                </p>
                <p className="text-xs font-semibold text-slate-600 truncate">
                  {resolvedDepartment} · {actorRole}
                </p>
                <p className="text-[11px] text-slate-500 font-mono-tabular truncate">{shiftLabel}</p>
              </div>
            </div>

            <div className="text-center py-0.5">
              <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#0a367a] leading-tight">
                {liveClockStr}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">{liveDateStr}</p>
            </div>

            <div className="no-print grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={clockBusy || Boolean(activeAttendance)}
                onClick={handleClockIn}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-bold disabled:opacity-45 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{clockBusy && !activeAttendance ? 'Saving...' : 'Clock In'}</span>
              </button>
              <button
                type="button"
                disabled={clockBusy || !activeAttendance}
                onClick={handleClockOut}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#0a367a] bg-white hover:bg-blue-50 text-[#0a367a] text-xs font-bold disabled:opacity-45 cursor-pointer transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{clockBusy && activeAttendance ? 'Saving...' : 'Clock Out'}</span>
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700">
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  activeAttendance ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span>
                Status:{' '}
                {activeAttendance ? (
                  <span className="text-emerald-700 font-mono-tabular">
                    Clocked In · {formatClock24To12(activeAttendance.clockInTime)}
                  </span>
                ) : latestAttendance?.clockOutTime || shiftEndedAt ? (
                  <span className="text-slate-700 font-mono-tabular">
                    Clocked Out ·{' '}
                    {formatClock24To12(latestAttendance?.clockOutTime || shiftEndedAt || undefined)}
                  </span>
                ) : (
                  <span className="text-slate-600">Not Clocked In</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Operational Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Reservations */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold">Recent Reservations</h2>
            {canAccess('reservations') && (
              <button
                type="button"
                onClick={() => onNavigate('reservations')}
                className="no-print inline-flex items-center gap-1 text-xs font-semibold text-blue-100 hover:text-white cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {recentReservations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 my-auto">
              No recent reservations yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                    <th className="py-2 px-3">Ref No.</th>
                    <th className="py-2 px-2">Guest Name</th>
                    <th className="py-2 px-2">Check-In</th>
                    <th className="py-2 px-2">Room</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentReservations.map((res) => {
                    const pill = getStatusPillStyle(res.status);
                    const roomDisp = getReservationRoomDisplay(res, rooms);
                    return (
                      <tr
                        key={res.id}
                        onClick={() => onOpenReservationFolio(res.id, 'reservations', 'view')}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2 px-3 font-mono-tabular font-semibold text-[#0a367a] whitespace-nowrap">
                          {res.bookingRef || res.id.slice(0, 8)}
                        </td>
                        <td className="py-2 px-2 font-semibold text-slate-900 max-w-[130px] truncate">
                          {res.guestName}
                        </td>
                        <td className="py-2 px-2 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {formatShortMonthDay(res.checkInDate)}
                        </td>
                        <td className="py-2 px-2 font-mono-tabular text-slate-700 whitespace-nowrap">
                          {roomDisp.isAssigned ? roomDisp.roomNumberLabel : '—'}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${pill.className}`}
                          >
                            {pill.label}
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

        {/* Quick Actions */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3">
            <h2 className="font-display text-sm font-bold">Quick Actions</h2>
          </div>
          <div className="p-3.5 grid grid-cols-2 gap-2.5 flex-1">
            <button
              type="button"
              onClick={() => canAccess('reservations') && onNavigate('reservations')}
              className="rounded-lg border border-blue-200/80 bg-blue-50/60 hover:bg-blue-100/70 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold text-[#061f4d]">Reservation</span>
            </button>

            <button
              type="button"
              onClick={() => canAccess('arrivals') && onNavigate('arrivals')}
              className="rounded-lg border border-blue-200/80 bg-blue-50/60 hover:bg-blue-100/70 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
            >
              <LogIn className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold text-[#061f4d]">Check-In</span>
            </button>

            <button
              type="button"
              onClick={() => canAccess('in_house') && onNavigate('in_house')}
              className="rounded-lg border border-blue-200/80 bg-blue-50/60 hover:bg-blue-100/70 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold text-[#061f4d]">Check-Out</span>
            </button>

            <button
              type="button"
              onClick={() => canAccess('pos_kitchen') && onNavigate('pos_kitchen')}
              className="rounded-lg border border-blue-200/80 bg-blue-50/60 hover:bg-blue-100/70 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-bold text-[#061f4d]">POS</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4. Bottom Operational Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent POS Transactions */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold">Recent POS Transactions</h2>
            {canAccess('pos_kitchen') && (
              <button
                type="button"
                onClick={() => onNavigate('pos_kitchen')}
                className="no-print inline-flex items-center gap-1 text-xs font-semibold text-blue-100 hover:text-white cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {recentPosOrders.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 my-auto">
              No POS transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-2">Item(s)</th>
                    <th className="py-2 px-2">Amount</th>
                    <th className="py-2 px-3 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPosOrders.map((ord) => {
                    const ordIso = resolvePosOrderIso(ord);
                    const timeStr = ordIso.includes('T')
                      ? formatIsoToTime(ordIso)
                      : formatShortMonthDay(ord.orderDate || ordIso);
                    return (
                      <tr
                        key={ord.id}
                        onClick={() => canAccess('pos_kitchen') && onNavigate('pos_kitchen')}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {timeStr}
                        </td>
                        <td className="py-2 px-2 font-semibold text-slate-900 max-w-[140px] truncate">
                          {ord.itemsSummary || `Order #${ord.orderNumber}`}
                        </td>
                        <td className="py-2 px-2 font-mono-tabular font-bold text-[#0a367a] whitespace-nowrap">
                          {formatNgn(ord.totalNgn)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap">
                          {ord.paymentMethod || 'Cash NGN'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#0a367a] text-white px-4 py-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-200" />
            <h2 className="font-display text-sm font-bold">Upcoming Tasks</h2>
          </div>
          {upcomingTasks.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 my-auto">
              All housekeeping &amp; maintenance tasks are clear.
            </div>
          ) : (
            <div className="p-3.5 divide-y divide-slate-100">
              {upcomingTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => canAccess(task.section) && onNavigate(task.section)}
                  className="w-full py-2 flex items-center justify-between gap-3 text-left hover:bg-blue-50/40 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${task.dotColor}`} />
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {task.title}
                    </span>
                  </span>
                  <span className="font-mono-tabular text-[11px] font-semibold text-slate-500 shrink-0">
                    {task.timeLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

      </section>

      {/* 5. Preserved Rooms Overview & Room Photos */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-[#0a367a] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold">
              Rooms Overview ({sortedRooms.length})
            </h2>
            <p className="text-[11px] text-blue-100 mt-0.5">
              Live occupancy and housekeeping status across all rooms
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-1 bg-white/10 p-1 rounded-lg border border-white/15">
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
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  roomFilter === tab.id
                    ? 'bg-white text-[#0a367a]'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filteredRooms.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
              No rooms match this filter right now.
            </div>
          ) : (
            <div className="space-y-6">
              {sections.map((sec) => {
                const secRooms = filteredRooms.filter((r) => getRoomSection(r) === sec.key);
                if (secRooms.length === 0) return null;
                return (
                  <div key={sec.key} className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0a367a]">
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
                            ? 'text-[#0a367a]'
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
                            className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#0a367a] hover:shadow-sm transition-all cursor-pointer flex flex-col"
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
                                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 text-sm font-semibold">
                                  {room.roomNumber}
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-transparent px-3 py-2.5 flex items-end justify-between gap-2">
                                <span className="font-mono-tabular text-sm font-bold text-white">
                                  {room.roomNumber}
                                </span>
                                <span className="font-mono-tabular text-xs font-semibold text-white/95">
                                  {formatNgn(room.nightlyRateNgn)}/nt
                                </span>
                              </div>
                            </div>

                            <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold text-slate-900 truncate">
                                  {room.roomType}
                                </p>
                                <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
                                  <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
                                  <span className={`capitalize font-medium ${hkColor}`}>
                                    {room.housekeepingStatus}
                                  </span>
                                </div>
                              </div>

                              {room.currentGuestName ? (
                                <p className="text-xs text-slate-600 pt-2 border-t border-slate-100 truncate">
                                  Guest:{' '}
                                  <span className="font-semibold text-slate-900">
                                    {room.currentGuestName}
                                  </span>
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
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
        </div>
      </section>

      {/* End Shift & Print Handover Report Modal */}
      {showEndShiftModal && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 bg-[#0a367a] text-white flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold">End Shift &amp; Shift Report</h2>
                <p className="text-xs text-blue-100 mt-0.5">
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
                  <span className="font-mono-tabular font-bold text-[#0a367a]">
                    {occupiedRooms.length} / {availableRooms.length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {arrivalsToday.length}
                  </p>
                  <p className="text-xs text-slate-500">Arrivals</p>
                </div>
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {departuresToday.length}
                  </p>
                  <p className="text-xs text-slate-500">Departures</p>
                </div>
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {openHousekeepingCount}
                  </p>
                  <p className="text-xs text-slate-500">Housekeeping</p>
                </div>
                <div className="border border-slate-200 rounded-lg py-2 px-2">
                  <p className="font-mono-tabular text-base font-bold text-slate-900">
                    {openMaintenanceCount}
                  </p>
                  <p className="text-xs text-slate-500">Maintenance</p>
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0a367a]/20 focus:border-[#0a367a]"
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
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
