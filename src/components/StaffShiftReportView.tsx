import React, { useMemo, useState } from 'react';
import {
  BedDouble,
  Calendar,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock,
  Download,
  PlaneLanding,
  PlaneTakeoff,
  Printer,
  Sparkles,
  Wrench,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AttendanceRecord,
  HousekeepingTaskRecord,
  MaintenanceTicketRecord,
  PosOrderRecord,
  PropertyRecord,
  ReservationRecord,
  ROLE_LABELS,
  ROLE_TO_DEPARTMENT,
  RoomRecord,
  ShiftScheduleRecord,
  StaffMemberRecord,
  StaffRole,
} from '../types/pms';

interface StaffShiftReportViewProps {
  property: PropertyRecord;
  activeRole: StaffRole;
  userEmail: string;
  userName: string;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  shifts: ShiftScheduleRecord[];
  attendance: AttendanceRecord[];
  housekeepingTasks: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  posOrders: PosOrderRecord[];
  staffMembers: StaffMemberRecord[];
  onNotify?: (msg: string) => void;
}

type ShiftFilter =
  | 'ALL'
  | 'Morning (07:00 - 15:00)'
  | 'Afternoon (15:00 - 23:00)'
  | 'Night (23:00 - 07:00)';

function getTimestampDateIso(ts?: { toDate?: () => Date } | string): string {
  if (!ts) return '';
  if (typeof ts === 'string') return ts.slice(0, 10);
  if (typeof ts === 'object' && typeof ts.toDate === 'function') {
    try {
      return ts.toDate().toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }
  return '';
}

function isTimeInShiftWindow(isoOrTime: string | undefined, filter: ShiftFilter): boolean {
  if (filter === 'ALL' || !isoOrTime) return true;
  const hourMatch = isoOrTime.match(/(?:T|^|\s)(\d{2}):(\d{2})/);
  if (!hourMatch) return true;
  const hour = Number(hourMatch[1]);
  if (!Number.isFinite(hour)) return true;
  if (filter === 'Morning (07:00 - 15:00)') return hour >= 7 && hour < 15;
  if (filter === 'Afternoon (15:00 - 23:00)') return hour >= 15 && hour < 23;
  return hour >= 23 || hour < 7;
}

export const StaffShiftReportView: React.FC<StaffShiftReportViewProps> = ({
  property,
  activeRole,
  userEmail,
  userName,
  rooms,
  reservations,
  shifts,
  attendance,
  housekeepingTasks,
  maintenanceTickets,
  posOrders,
  staffMembers,
  onNotify,
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [reportDate, setReportDate] = useState<string>(todayIso);
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('ALL');
  const [handoverNote, setHandoverNote] = useState<string>('');

  const userDepartment = ROLE_TO_DEPARTMENT[activeRole] || 'Front Desk';
  const roleLabel = ROLE_LABELS[activeRole] || 'Staff Operator';

  const matchedStaff = useMemo(() => {
    const emailLower = userEmail.trim().toLowerCase();
    const nameLower = userName.trim().toLowerCase();
    return staffMembers.find(
      (s) =>
        (s.email && s.email.trim().toLowerCase() === emailLower) ||
        s.fullName.trim().toLowerCase() === nameLower
    );
  }, [staffMembers, userEmail, userName]);

  const dayShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (s.shiftDate !== reportDate) return false;
      if (shiftFilter !== 'ALL' && s.shiftWindow !== shiftFilter) return false;
      return true;
    });
  }, [shifts, reportDate, shiftFilter]);

  const dayAttendance = useMemo(() => {
    return attendance.filter((a) => {
      if (a.date !== reportDate) return false;
      if (shiftFilter !== 'ALL' && !isTimeInShiftWindow(a.clockInTime, shiftFilter)) return false;
      return true;
    });
  }, [attendance, reportDate, shiftFilter]);

  const myAttendance = useMemo(() => {
    const emailName = userName.trim().toLowerCase();
    return dayAttendance.filter(
      (a) =>
        (matchedStaff && a.staffId === matchedStaff.id) ||
        a.staffName.trim().toLowerCase() === emailName
    );
  }, [dayAttendance, matchedStaff, userName]);

  const checkInsOnDate = useMemo(() => {
    return reservations.filter((r) => {
      const checkedInDate = r.checkedInAtIso?.slice(0, 10);
      const matchesDate = checkedInDate === reportDate || (r.status === 'checked_in' && r.checkInDate === reportDate);
      if (!matchesDate) return false;
      return isTimeInShiftWindow(r.checkedInAtIso, shiftFilter);
    });
  }, [reservations, reportDate, shiftFilter]);

  const checkOutsOnDate = useMemo(() => {
    return reservations.filter((r) => {
      const checkedOutDate = r.checkedOutAtIso?.slice(0, 10);
      const matchesDate =
        checkedOutDate === reportDate || (r.status === 'checked_out' && r.checkOutDate === reportDate);
      if (!matchesDate) return false;
      return isTimeInShiftWindow(r.checkedOutAtIso, shiftFilter);
    });
  }, [reservations, reportDate, shiftFilter]);

  const pendingArrivals = useMemo(
    () =>
      reservations.filter(
        (r) =>
          (r.status === 'confirmed' || r.status === 'pending') && r.checkInDate === reportDate
      ),
    [reservations, reportDate]
  );

  const dueDepartures = useMemo(
    () =>
      reservations.filter(
        (r) => r.status === 'checked_in' && r.checkOutDate <= reportDate
      ),
    [reservations, reportDate]
  );

  const inHouseCount = useMemo(
    () => reservations.filter((r) => r.status === 'checked_in').length,
    [reservations]
  );

  const vacantCleanRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.occupancyStatus === 'vacant' &&
          (r.housekeepingStatus === 'clean' || r.housekeepingStatus === 'inspected')
      ).length,
    [rooms]
  );

  const dirtyRooms = useMemo(
    () => rooms.filter((r) => r.housekeepingStatus === 'dirty').length,
    [rooms]
  );

  const dayOrders = useMemo(() => {
    return posOrders.filter((o) => {
      const d = o.orderDate || getTimestampDateIso(o.createdAt);
      return d === reportDate;
    });
  }, [posOrders, reportDate]);

  const servedKitchenCount = dayOrders.filter((o) => o.kitchenStatus === 'served').length;
  const activeKitchenCount = dayOrders.filter((o) => o.kitchenStatus !== 'served').length;

  const completedHkTasks = housekeepingTasks.filter(
    (t) => t.status === 'completed' || t.status === 'inspected'
  );
  const openHkTasks = housekeepingTasks.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  );
  const openMaintTickets = maintenanceTickets.filter((t) => t.status !== 'resolved');

  const handleDownloadShiftPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${property.name} — Shift Daily Operational Report`, 14, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${reportDate}   |   Shift Window: ${shiftFilter === 'ALL' ? 'All Shifts' : shiftFilter}`, 14, 22);
    doc.text(`Prepared By: ${userName} (${roleLabel} · ${userDepartment})`, 14, 27);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [['Operational Metric', 'Count / Status']],
      body: [
        ['Check-Ins Completed', String(checkInsOnDate.length)],
        ['Pending Arrivals Due', String(pendingArrivals.length)],
        ['Check-Outs Completed', String(checkOutsOnDate.length)],
        ['In-House Occupied Suites', `${inHouseCount} of ${rooms.length}`],
        ['Vacant & Ready Suites', String(vacantCleanRooms)],
        ['Suites Needing Cleaning', String(dirtyRooms)],
        ['Housekeeping Tasks Completed / Open', `${completedHkTasks.length} completed / ${openHkTasks.length} open`],
        ['Kitchen Tickets Served / Active', `${servedKitchenCount} served / ${activeKitchenCount} active`],
        ['Open Maintenance Work Orders', String(openMaintTickets.length)],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [6, 21, 57] },
    });

    const afterMetricsY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 110;

    if (checkInsOnDate.length > 0 || checkOutsOnDate.length > 0) {
      const guestRows = [
        ...checkInsOnDate.map((r) => [
          'Check-In',
          r.bookingRef,
          r.guestName,
          r.roomNumber || 'Unassigned',
          `${r.checkInDate} -> ${r.checkOutDate}`,
          r.keyIssued ? 'Key Issued' : 'Verified',
        ]),
        ...checkOutsOnDate.map((r) => [
          'Check-Out',
          r.bookingRef,
          r.guestName,
          r.roomNumber || 'Unassigned',
          `${r.checkInDate} -> ${r.checkOutDate}`,
          'Departed',
        ]),
      ];

      autoTable(doc, {
        startY: afterMetricsY + 8,
        head: [['Movement', 'Booking Ref', 'Guest', 'Room', 'Stay Dates', 'Status']],
        body: guestRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [28, 70, 190] },
      });
    }

    const afterGuestsY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || afterMetricsY + 8;

    if (dayAttendance.length > 0 || dayShifts.length > 0) {
      const staffRows =
        dayAttendance.length > 0
          ? dayAttendance.map((a) => [a.staffName, a.date, a.clockInTime, a.clockOutTime || 'Active', a.status])
          : dayShifts.map((s) => [s.staffName, s.shiftDate, s.shiftWindow, s.closedBy || '-', s.status]);

      autoTable(doc, {
        startY: afterGuestsY + 8,
        head: [['Staff Name', 'Date', 'Clock-In / Window', 'Clock-Out / Closed By', 'Status']],
        body: staffRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42] },
      });
    }

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 220;
    if (handoverNote.trim()) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Shift Handover Notes:', 14, finalY + 10);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(handoverNote.trim(), 180);
      doc.text(noteLines, 14, finalY + 15);
    }

    doc.setFontSize(8.5);
    doc.text('Operator Signature: ________________________', 14, 276);
    doc.text('Duty Supervisor Signature: ________________________', 112, 276);

    doc.save(`shift-daily-report-${reportDate}.pdf`);
    onNotify?.(`Downloaded Shift Daily Report (${reportDate})`);
  };

  return (
    <div className="space-y-6">
      {/* Screen Header & Controls */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#1c46be]" />
            <h1 className="font-display text-xl font-bold text-[#061539]">
              Shift Daily Operational Report
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {property.name} · {userName} ({roleLabel} · {userDepartment})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="bg-transparent font-mono-tabular text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>

          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value as ShiftFilter)}
            className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
          >
            <option value="ALL">All Shifts (Full Day)</option>
            <option value="Morning (07:00 - 15:00)">Morning (07:00 - 15:00)</option>
            <option value="Afternoon (15:00 - 23:00)">Afternoon (15:00 - 23:00)</option>
            <option value="Night (23:00 - 07:00)">Night (23:00 - 07:00)</option>
          </select>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#061539] hover:bg-[#0c2b70] text-white font-semibold rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Shift Report</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadShiftPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Report Sheet Container */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 print:border-0 print:p-0">
        {/* Print Letterhead */}
        <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#1c46be]">
              Daily Shift Handover Sheet
            </p>
            <h2 className="font-display text-lg font-bold text-[#061539] mt-0.5">
              {property.name}
            </h2>
            <p className="text-xs text-slate-500">
              {property.city}, {property.state} · {userDepartment} Department
            </p>
          </div>
          <div className="text-xs sm:text-right space-y-0.5 font-mono-tabular">
            <p className="font-bold text-slate-900">Shift Date: {reportDate}</p>
            <p className="text-slate-600">
              Window: {shiftFilter === 'ALL' ? 'Full Day (24h)' : shiftFilter}
            </p>
            <p className="text-slate-600">
              Staff: {userName} ({roleLabel})
            </p>
          </div>
        </div>

        {/* 4 Pure Operational KPIs (Strictly Zero Financials) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Check-Ins Completed</span>
              <PlaneLanding className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="font-mono-tabular text-2xl font-bold text-[#061539] mt-1.5">
              {checkInsOnDate.length}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {pendingArrivals.length} pending arrival(s)
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Departures Handled</span>
              <PlaneTakeoff className="w-4 h-4 text-blue-600" />
            </div>
            <p className="font-mono-tabular text-2xl font-bold text-[#061539] mt-1.5">
              {checkOutsOnDate.length}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {dueDepartures.length} still due out
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Suites &amp; Housekeeping</span>
              <BedDouble className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="font-mono-tabular text-2xl font-bold text-[#061539] mt-1.5">
              {inHouseCount} <span className="text-sm font-normal text-slate-500">/ {rooms.length}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {vacantCleanRooms} ready · {dirtyRooms} dirty
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Kitchen &amp; Engineering</span>
              <ChefHat className="w-4 h-4 text-amber-600" />
            </div>
            <p className="font-mono-tabular text-2xl font-bold text-[#061539] mt-1.5">
              {servedKitchenCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              tickets served · {openMaintTickets.length} maint. open
            </p>
          </div>
        </div>

        {/* My Shift Attendance & Active Shift Roster */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#1c46be]" />
                <h3 className="font-display text-sm font-bold text-[#061539]">
                  Attendance &amp; Shift Log ({reportDate})
                </h3>
              </div>
              <span className="text-[11px] font-mono-tabular text-slate-500">
                {myAttendance.length > 0 ? `${myAttendance.length} personal punch` : `${dayAttendance.length} team punches`}
              </span>
            </div>

            {dayAttendance.length === 0 && dayShifts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No attendance punches or shifts logged for {reportDate}.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {dayAttendance.map((att) => (
                  <div key={att.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{att.staffName}</p>
                      <p className="font-mono-tabular text-[11px] text-slate-500">
                        In: {att.clockInTime} {att.clockOutTime ? `· Out: ${att.clockOutTime}` : ''}
                      </p>
                    </div>
                    <span className="capitalize font-semibold text-slate-700">
                      {att.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
                {dayShifts.map((sh) => (
                  <div key={sh.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {sh.staffName} · {sh.department}
                      </p>
                      <p className="text-[11px] text-slate-500">{sh.shiftWindow}</p>
                      {sh.handoverNotes && (
                        <p className="text-[11px] text-slate-600 italic mt-0.5">
                          Handover: {sh.handoverNotes}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-semibold capitalize ${
                        sh.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {sh.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Housekeeping & Maintenance Operational Queue */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="font-display text-sm font-bold text-[#061539]">
                  Housekeeping &amp; Maintenance Activity
                </h3>
              </div>
              <span className="text-[11px] font-mono-tabular text-slate-500">
                {openHkTasks.length + openMaintTickets.length} active
              </span>
            </div>

            {housekeepingTasks.length === 0 && openMaintTickets.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No pending housekeeping or engineering tickets.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto pr-1">
                {housekeepingTasks.slice(0, 8).map((hk) => (
                  <div key={hk.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        Room {hk.roomNumber} · {hk.taskType}
                      </p>
                      <p className="text-[11px] text-slate-500">Assigned: {hk.assignedTo}</p>
                    </div>
                    <span className="capitalize font-semibold text-slate-700">
                      {hk.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
                {openMaintTickets.slice(0, 6).map((mt) => (
                  <div key={mt.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {mt.locationLabel} · {mt.issueTitle}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {mt.priority} Priority · {mt.assignedTo}
                        </p>
                      </div>
                    </div>
                    <span className="capitalize font-semibold text-amber-700">
                      {mt.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Guest Movement Log (Non-Financial) */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <h3 className="font-display text-sm font-bold text-[#061539]">
                Front Desk Check-In &amp; Departure Movements ({reportDate})
              </h3>
            </div>
            <span className="font-mono-tabular text-[11px] text-slate-500">
              {checkInsOnDate.length + checkOutsOnDate.length} completed movements
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-white">
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Ref</th>
                  <th className="py-2.5 px-4">Guest Name</th>
                  <th className="py-2.5 px-4">Room</th>
                  <th className="py-2.5 px-4">Stay Dates</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checkInsOnDate.map((r) => (
                  <tr key={`in-${r.id}`}>
                    <td className="py-2.5 px-4 font-semibold text-emerald-700">Check-In</td>
                    <td className="py-2.5 px-4 font-mono-tabular">{r.bookingRef}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{r.guestName}</td>
                    <td className="py-2.5 px-4 font-mono-tabular">{r.roomNumber}</td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-600">
                      {r.checkInDate} → {r.checkOutDate}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{r.channel}</td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {r.idVerified ? 'ID Verified' : 'Pending ID'} · {r.keyIssued ? 'Key Issued' : 'No Key'}
                    </td>
                  </tr>
                ))}
                {checkOutsOnDate.map((r) => (
                  <tr key={`out-${r.id}`}>
                    <td className="py-2.5 px-4 font-semibold text-blue-700">Check-Out</td>
                    <td className="py-2.5 px-4 font-mono-tabular">{r.bookingRef}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{r.guestName}</td>
                    <td className="py-2.5 px-4 font-mono-tabular">{r.roomNumber}</td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-600">
                      {r.checkInDate} → {r.checkOutDate}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{r.channel}</td>
                    <td className="py-2.5 px-4 text-slate-700">Room Released</td>
                  </tr>
                ))}
                {checkInsOnDate.length === 0 && checkOutsOnDate.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      No completed check-ins or check-outs recorded for {reportDate}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kitchen Ticket Activity (Non-Financial) */}
        {dayOrders.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-amber-700" />
                <h3 className="font-display text-sm font-bold text-[#061539]">
                  Restaurant &amp; Kitchen Ticket Activity ({reportDate})
                </h3>
              </div>
              <span className="font-mono-tabular text-[11px] text-slate-500">
                {dayOrders.length} orders
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-white">
                    <th className="py-2.5 px-4">Order #</th>
                    <th className="py-2.5 px-4">Service</th>
                    <th className="py-2.5 px-4">Room / Table</th>
                    <th className="py-2.5 px-4">Items Summary</th>
                    <th className="py-2.5 px-4">Kitchen Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold">{ord.orderNumber}</td>
                      <td className="py-2.5 px-4">{ord.serviceType}</td>
                      <td className="py-2.5 px-4 font-medium">{ord.tableOrRoom}</td>
                      <td className="py-2.5 px-4 text-slate-600">{ord.itemsSummary}</td>
                      <td className="py-2.5 px-4 capitalize font-semibold text-slate-700">
                        {ord.kitchenStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Shift Handover Notes & Sign-Off */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/40">
          <label className="block text-xs font-bold text-[#061539]">
            Shift Handover Notes &amp; Remarks for Incoming Team
          </label>
          <textarea
            rows={3}
            value={handoverNote}
            onChange={(e) => setHandoverNote(e.target.value)}
            placeholder="Record pending guest requests, key handovers, room maintenance alerts, or incoming shift reminders..."
            className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1c46be]"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-900">Outgoing Staff Signature</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {userName} · {roleLabel}
              </p>
              <div className="mt-6 border-b border-slate-300" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Incoming Supervisor / Relief Signature</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Verified at shift handover</p>
              <div className="mt-6 border-b border-slate-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
