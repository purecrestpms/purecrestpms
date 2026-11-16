import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Pencil,
  Plus,
  Printer,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  clockInStaff,
  clockOutAttendance,
  closeShiftWorkflow,
  createShiftSchedule,
  createStaffMember,
  runAndPostPayrollWorkflow,
  updateStaffSalary,
} from '../services/pmsService';
import {
  AttendanceRecord,
  formatNgn,
  NavSectionId,
  PayrollRunRecord,
  PropertyRecord,
  RICHGATES_PROPERTY_INFO,
  ROLE_LABELS,
  ShiftScheduleRecord,
  StaffMemberRecord,
} from '../types/pms';
import { useCms } from '../context/CmsContext';

interface StaffHrPayrollViewProps {
  section: Extract<NavSectionId, 'staff' | 'shifts_attendance' | 'payroll'>;
  property: PropertyRecord;
  staffMembers: StaffMemberRecord[];
  shifts: ShiftScheduleRecord[];
  attendance: AttendanceRecord[];
  payrollRuns: PayrollRunRecord[];
  actorRole: string;
  onNotify: (msg: string) => void;
}

export const StaffHrPayrollView: React.FC<StaffHrPayrollViewProps> = ({
  section,
  property,
  staffMembers,
  shifts,
  attendance,
  payrollRuns,
  actorRole,
  onNotify,
}) => {
  const { cms } = useCms();
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+234 ');
  const [department, setDepartment] =
    useState<StaffMemberRecord['department']>('Front Desk');
  const [role, setRole] = useState<StaffMemberRecord['role']>('front_desk');
  const [baseSalary, setBaseSalary] = useState(150000);
  const [allowance, setAllowance] = useState(35000);

  const [shiftStaffId, setShiftStaffId] = useState(staffMembers[0]?.id || '');
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftWindow, setShiftWindow] = useState<ShiftScheduleRecord['shiftWindow']>(
    'Morning (07:00 - 15:00)'
  );

  // Payroll state
  const nowDate = new Date();
  const defaultPeriod = nowDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const defaultPayDate = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-28`;
  const [payrollPeriod, setPayrollPeriod] = useState(defaultPeriod);
  const [payDate, setPayDate] = useState(defaultPayDate);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [runningPayroll, setRunningPayroll] = useState(false);

  // Inline salary editing
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editBaseNgn, setEditBaseNgn] = useState<number>(0);
  const [editAllowanceNgn, setEditAllowanceNgn] = useState<number>(0);
  const [savingSalary, setSavingSalary] = useState(false);

  // Batch summary modal
  const [selectedRun, setSelectedRun] = useState<PayrollRunRecord | null>(null);

  // Close Shift modal state
  const [closingShiftTarget, setClosingShiftTarget] = useState<ShiftScheduleRecord | null>(null);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [closingShiftBusy, setClosingShiftBusy] = useState(false);

  useEffect(() => {
    if (!shiftStaffId && staffMembers[0]) {
      setShiftStaffId(staffMembers[0].id);
    }
  }, [staffMembers, shiftStaffId]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    const code = `RG-${String(staffMembers.length + 1).padStart(3, '0')}`;
    await createStaffMember({
      property,
      staff: {
        staffCode: code,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        department,
        role,
        monthlyBaseSalaryNgn: Math.max(0, baseSalary),
        monthlyAllowanceNgn: Math.max(0, allowance),
        employmentStatus: 'active',
      },
      actorRole,
    });
    onNotify(`Onboarded ${fullName} (${code})`);
    setShowStaffForm(false);
    setFullName('');
    setEmail('');
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffMembers.find((s) => s.id === shiftStaffId) || staffMembers[0];
    if (!staff) return;
    await createShiftSchedule({
      property,
      staff,
      shiftDate,
      shiftWindow,
    });
    onNotify(`Assigned ${shiftWindow} shift to ${staff.fullName}`);
  };

  const handleSaveSalary = async (staff: StaffMemberRecord) => {
    setSavingSalary(true);
    try {
      await updateStaffSalary({
        property,
        staff,
        monthlyBaseSalaryNgn: editBaseNgn,
        monthlyAllowanceNgn: editAllowanceNgn,
        actorRole,
      });
      onNotify(`Updated monthly salary for ${staff.fullName}`);
      setEditingStaffId(null);
    } finally {
      setSavingSalary(false);
    }
  };

  const handleRunPayroll = async () => {
    setRunningPayroll(true);
    try {
      await runAndPostPayrollWorkflow({
        property,
        periodLabel: payrollPeriod.trim() || defaultPeriod,
        payDate,
        paymentMethod,
        staffList: staffMembers,
        actorRole,
      });
      onNotify(`Paid & posted ${payrollPeriod} Monthly Payroll (Pay Date ${payDate}) to Ledger`);
    } finally {
      setRunningPayroll(false);
    }
  };

  const activeStaff = staffMembers.filter((s) => s.employmentStatus === 'active');
  const previewGross = activeStaff.reduce(
    (sum, s) => sum + s.monthlyBaseSalaryNgn + s.monthlyAllowanceNgn,
    0
  );
  const previewPension = Math.round(previewGross * 0.08);
  const previewPaye = Math.round(previewGross * 0.09);
  const previewDeductions = previewPension + previewPaye;
  const previewNet = previewGross - previewDeductions;

  const isPeriodPaid = payrollRuns.some(
    (run) => run.periodLabel.trim().toLowerCase() === payrollPeriod.trim().toLowerCase()
  );

  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingShiftTarget) return;
    setClosingShiftBusy(true);
    try {
      await closeShiftWorkflow({
        property,
        shift: closingShiftTarget,
        handoverNotes,
        actorRole,
      });
      onNotify(`Closed ${closingShiftTarget.shiftWindow} shift for ${closingShiftTarget.staffName}`);
      setClosingShiftTarget(null);
      setHandoverNotes('');
    } finally {
      setClosingShiftBusy(false);
    }
  };

  const handleExportShiftPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const todayIso = new Date().toISOString().slice(0, 10);
    const propAddress = property.address || RICHGATES_PROPERTY_INFO.address;
    const propPhone = property.phone || RICHGATES_PROPERTY_INFO.phone;

    let textStartX = 14;
    if (property.logoUrl && property.logoUrl.startsWith('data:image/')) {
      try {
        const imgFormat = property.logoUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(property.logoUrl, imgFormat, 14, 12, 15, 15);
        textStartX = 33;
      } catch {
        // Ignore logo if incompatible format
      }
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(property.name, textStartX, 17);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`${propAddress} | ${propPhone}`, textStartX, 22);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text('Shift Roster & Handover Report', 14, 34);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Printed: ${new Date().toLocaleDateString('en-GB')} (${todayIso}) | Prepared by: ${actorRole}`, 14, 39);

    autoTable(doc, {
      startY: 44,
      head: [['Staff Member', 'Department', 'Date', 'Shift Window', 'Status', 'Handover / Closed By']],
      body: shifts.map((sh) => [
        sh.staffName,
        sh.department,
        sh.shiftDate,
        sh.shiftWindow,
        sh.status === 'completed' ? 'Closed' : sh.status,
        sh.status === 'completed'
          ? `${sh.handoverNotes || 'No handover notes'}${sh.closedBy ? ` (${sh.closedBy})` : ''}`
          : '-',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    const shiftFinalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 90;

    autoTable(doc, {
      startY: shiftFinalY + 8,
      head: [['Staff Member', 'Date', 'Clock In', 'Clock Out', 'Attendance Status']],
      body: attendance.map((a) => [
        a.staffName,
        a.date,
        a.clockInTime,
        a.clockOutTime || '-',
        a.status.replace('_', ' '),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [4, 120, 87], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    doc.save(`${property.code.toLowerCase()}-shift-report-${todayIso}.pdf`);
    onNotify('Downloaded Shift Roster & Attendance PDF');
  };

  return (
    <div className="space-y-6">
      {section === 'shifts_attendance' && (
        <div className="hidden print-only border-b-2 border-slate-900 pb-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {property.logoUrl && (
                <img
                  src={property.logoUrl}
                  alt={property.name}
                  className="w-12 h-12 object-contain"
                />
              )}
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">{property.name}</h2>
                <p className="text-xs text-slate-600">
                  {property.address || RICHGATES_PROPERTY_INFO.address}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p className="font-bold text-slate-900">Shift Roster &amp; Handover Report</p>
              <p>Printed: {new Date().toLocaleDateString('en-GB')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {section === 'staff'
              ? `${cms.pages.staff.title} (${staffMembers.length} Employees)`
              : cms.pages[section].title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages[section].subtitle}
          </p>
        </div>

        {section === 'staff' && (
          <button
            type="button"
            onClick={() => setShowStaffForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{cms.pages.staff.ctaLabel || 'Onboard Staff Member'}</span>
          </button>
        )}

        {section === 'shifts_attendance' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Shift Report</span>
            </button>
            <button
              type="button"
              onClick={handleExportShiftPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{cms.pages.shifts_attendance.ctaLabel || 'Export Shift PDF'}</span>
            </button>
          </div>
        )}

        {section === 'payroll' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-slate-500 mb-0.5">Pay Month</label>
              <input
                type="text"
                value={payrollPeriod}
                onChange={(e) => setPayrollPeriod(e.target.value)}
                placeholder="e.g. November 2026"
                className="border border-slate-200 rounded-lg px-3 py-2 w-36 bg-white"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-slate-500 mb-0.5">Pay Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular bg-white"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-slate-500 mb-0.5">Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash NGN">Cash (₦)</option>
                <option value="Corporate Cheque">Corporate Cheque</option>
              </select>
            </div>
            <div className="flex flex-col justify-end pt-4">
              <button
                type="button"
                disabled={runningPayroll || activeStaff.length === 0}
                onClick={handleRunPayroll}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{runningPayroll ? 'Processing...' : cms.pages.payroll.ctaLabel || 'Run & Post Monthly Payroll'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION: STAFF DIRECTORY */}
      {section === 'staff' && (
        <>
          {showStaffForm && (
            <form
              onSubmit={handleAddStaff}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <h2 className="font-display text-sm font-bold text-slate-900">
                Onboard Property Staff
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  required
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  type="email"
                  placeholder="Work Email (optional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="Phone (+234...)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <select
                  value={department}
                  onChange={(e) =>
                    setDepartment(e.target.value as StaffMemberRecord['department'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Management">Management</option>
                  <option value="Front Desk">Front Desk</option>
                  <option value="Housekeeping">Housekeeping</option>
                  <option value="Kitchen & F&B">Kitchen &amp; F&amp;B</option>
                  <option value="Accounts">Accounts</option>
                  <option value="Engineering & Security">Engineering &amp; Security</option>
                </select>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffMemberRecord['role'])}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="front_desk">Front Desk &amp; Reservations</option>
                  <option value="housekeeping">Housekeeping Lead</option>
                  <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                  <option value="accountant">Finance &amp; Payroll Officer</option>
                  <option value="maintenance">Engineering &amp; Maintenance</option>
                  <option value="property_admin">Property Admin (GM)</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    placeholder="Base Salary (₦)"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(Number(e.target.value))}
                    className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    placeholder="Allowance (₦)"
                    value={allowance}
                    onChange={(e) => setAllowance(Number(e.target.value))}
                    className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStaffForm(false)}
                  className="px-4 py-2 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Save Staff Record
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Employee Roster
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Department &amp; Role</th>
                    <th className="py-3 px-4 text-right">Base Salary</th>
                    <th className="py-3 px-4 text-right">Allowance</th>
                    <th className="py-3 px-4 text-right">Gross Monthly</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {staffMembers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                        {s.staffCode}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{s.fullName}</p>
                        <p className="text-[11px] text-slate-500">
                          {s.email || s.phone || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-800">{s.department}</p>
                        <p className="text-[11px] text-slate-500">{ROLE_LABELS[s.role]}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(s.monthlyBaseSalaryNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(s.monthlyAllowanceNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                        {formatNgn(s.monthlyBaseSalaryNgn + s.monthlyAllowanceNgn)}
                      </td>
                      <td className="py-3 px-4 font-medium text-emerald-700 capitalize">
                        {s.employmentStatus.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SECTION: SHIFTS & ATTENDANCE */}
      {section === 'shifts_attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Staff Shifts &amp; Close-Shift Handover
              </h2>
              <span className="font-mono-tabular text-[11px] text-slate-500">
                {shifts.filter((s) => s.status === 'scheduled').length} open ·{' '}
                {shifts.filter((s) => s.status === 'completed').length} closed
              </span>
            </div>
            <form onSubmit={handleAddShift} className="no-print grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <select
                value={shiftStaffId || staffMembers[0]?.id || ''}
                onChange={(e) => setShiftStaffId(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-2"
              />
              <select
                value={shiftWindow}
                onChange={(e) =>
                  setShiftWindow(e.target.value as ShiftScheduleRecord['shiftWindow'])
                }
                className="border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="Morning (07:00 - 15:00)">Morning (07:00 - 15:00)</option>
                <option value="Afternoon (15:00 - 23:00)">Afternoon (15:00 - 23:00)</option>
                <option value="Night (23:00 - 07:00)">Night (23:00 - 07:00)</option>
              </select>
              <button
                type="submit"
                className="sm:col-span-3 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
              >
                Assign Shift
              </button>
            </form>

            <div className="divide-y divide-slate-100 text-xs pt-2">
              {shifts.map((sh) => (
                <div key={sh.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{sh.staffName}</p>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          sh.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {sh.status === 'completed' ? 'Closed' : 'Open'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {sh.department} · {sh.shiftDate} · {sh.shiftWindow}
                    </p>
                    {sh.status === 'completed' && sh.handoverNotes && (
                      <p className="text-[11px] text-slate-600 italic">
                        Handover: {sh.handoverNotes}
                      </p>
                    )}
                    {sh.status === 'completed' && sh.closedAtIso && (
                      <p className="font-mono-tabular text-[10px] text-slate-400">
                        Closed {new Date(sh.closedAtIso).toLocaleString('en-GB')}
                        {sh.closedBy ? ` by ${sh.closedBy}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="no-print shrink-0">
                    {sh.status === 'scheduled' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setClosingShiftTarget(sh);
                          setHandoverNotes('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md cursor-pointer"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Close Shift</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Closed</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {shifts.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">No shifts scheduled yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Daily Attendance Log
                </h2>
              </div>
              <select
                onChange={(e) => {
                  const s = staffMembers.find((m) => m.id === e.target.value);
                  if (s) {
                    clockInStaff({ property, staff: s });
                    onNotify(`Clocked in ${s.fullName}`);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="no-print border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-800 font-semibold"
              >
                <option value="" disabled>
                  + Quick Clock-In Staff
                </option>
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.department})
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {attendance.map((att) => (
                <div key={att.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{att.staffName}</p>
                    <p className="font-mono-tabular text-[11px] text-slate-500">
                      {att.date} · In: {att.clockInTime}
                      {att.clockOutTime ? ` · Out: ${att.clockOutTime}` : ''}
                    </p>
                  </div>
                  {att.status !== 'clocked_out' ? (
                    <button
                      type="button"
                      onClick={() => {
                        clockOutAttendance({ property, record: att });
                        onNotify(`Clocked out ${att.staffName}`);
                      }}
                      className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 rounded text-slate-700 font-medium"
                    >
                      Clock Out
                    </button>
                  ) : (
                    <span className="text-slate-500">Clocked Out</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION: MONTHLY PAYROLL */}
      {section === 'payroll' && (
        <div className="space-y-6">
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Monthly Gross Salaries</p>
              <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {formatNgn(previewGross)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {activeStaff.length} active employees
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Deductions (Pension + Tax)</p>
              <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {formatNgn(previewDeductions)}
              </p>
              <p className="font-mono-tabular text-[11px] text-slate-400 mt-1">
                8% Pension ({formatNgn(previewPension)}) · 9% PAYE ({formatNgn(previewPaye)})
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Net Take-Home Pay</p>
              <p className="font-mono-tabular text-xl font-bold text-emerald-700 mt-1">
                {formatNgn(previewNet)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Disbursed via {paymentMethod}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Scheduled Pay Date</p>
              <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">{payDate}</p>
              <p
                className={`text-[11px] font-semibold mt-1 ${
                  isPeriodPaid ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {payrollPeriod}: {isPeriodPaid ? 'Paid & Posted' : 'Scheduled'}
              </p>
            </div>
          </div>

          {/* Employee Monthly Salary Schedule */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Employee Monthly Salary Breakdown — {payrollPeriod}
                </h2>
                <p className="text-xs text-slate-500">
                  Individual salary, allowances, deductions, net take-home pay, and pay date for each employee
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs font-semibold text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <span>Pay Date: {payDate}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-right">Base Salary</th>
                    <th className="py-3 px-4 text-right">Allowance</th>
                    <th className="py-3 px-4 text-right">Gross Pay</th>
                    <th className="py-3 px-4 text-right">Deductions</th>
                    <th className="py-3 px-4 text-right">Net Take-Home</th>
                    <th className="py-3 px-4">Pay Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {staffMembers.map((emp) => {
                    const gross = emp.monthlyBaseSalaryNgn + emp.monthlyAllowanceNgn;
                    const ded = Math.round(gross * 0.17);
                    const net = gross - ded;
                    const isEditing = editingStaffId === emp.id;
                    const isActive = emp.employmentStatus === 'active';

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{emp.fullName}</p>
                          <p className="font-mono-tabular text-[11px] text-slate-500">
                            {emp.staffCode} · {ROLE_LABELS[emp.role]}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{emp.department}</td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={5000}
                              value={editBaseNgn}
                              onChange={(e) => setEditBaseNgn(Number(e.target.value))}
                              className="w-24 border border-slate-300 rounded px-2 py-1 text-right font-mono-tabular"
                            />
                          ) : (
                            formatNgn(emp.monthlyBaseSalaryNgn)
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={2500}
                              value={editAllowanceNgn}
                              onChange={(e) => setEditAllowanceNgn(Number(e.target.value))}
                              className="w-24 border border-slate-300 rounded px-2 py-1 text-right font-mono-tabular"
                            />
                          ) : (
                            formatNgn(emp.monthlyAllowanceNgn)
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-medium text-slate-900">
                          {formatNgn(gross)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                          -{formatNgn(ded)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-bold text-emerald-700">
                          {formatNgn(net)}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">{payDate}</td>
                        <td className="py-3 px-4">
                          {!isActive ? (
                            <span className="text-slate-500 capitalize">
                              {emp.employmentStatus.replace('_', ' ')}
                            </span>
                          ) : isPeriodPaid ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-700">Scheduled</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={savingSalary}
                                onClick={() => handleSaveSalary(emp)}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded font-semibold cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingStaffId(null)}
                                className="text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStaffId(emp.id);
                                setEditBaseNgn(emp.monthlyBaseSalaryNgn);
                                setEditAllowanceNgn(emp.monthlyAllowanceNgn);
                              }}
                              className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit Salary</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Posted Payroll Payment History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Payroll Payment History
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Pay Period</th>
                    <th className="py-3 px-4">Pay Date</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-right">Employees</th>
                    <th className="py-3 px-4 text-right">Gross Salary</th>
                    <th className="py-3 px-4 text-right">Pension (8%)</th>
                    <th className="py-3 px-4 text-right">PAYE Tax (9%)</th>
                    <th className="py-3 px-4 text-right">Net Paid</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {payrollRuns.map((run) => (
                    <tr
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">{run.periodLabel}</td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-700">
                        {run.payDate || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {run.paymentMethod || 'Bank Transfer'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">{run.staffCount}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(run.grossPayNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(run.pensionDeductionNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(run.payeTaxNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-bold text-emerald-700">
                        {formatNgn(run.netPayNgn)}
                      </td>
                      <td className="py-3 px-4 font-medium text-emerald-700 capitalize">
                        {run.status.replace(/_/g, ' ')}
                      </td>
                    </tr>
                  ))}
                  {payrollRuns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-xs text-slate-500">
                        No payroll runs recorded yet. Choose Pay Month and Pay Date above to process salaries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payroll Batch Summary Modal */}
          {selectedRun && (
            <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Payroll Summary — {selectedRun.periodLabel}
                    </h3>
                    <p className="font-mono-tabular text-xs text-slate-500">
                      Pay Date: {selectedRun.payDate || 'Recorded'} · Method:{' '}
                      {selectedRun.paymentMethod || 'Bank Transfer'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRun(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Employees Paid</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {selectedRun.staffCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Gross Salary</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(selectedRun.grossPayNgn)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Pension Deduction (8%)</span>
                    <span className="font-mono-tabular text-slate-700">
                      -{formatNgn(selectedRun.pensionDeductionNgn)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">PAYE Tax Deduction (9%)</span>
                    <span className="font-mono-tabular text-slate-700">
                      -{formatNgn(selectedRun.payeTaxNgn)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                    <span className="text-slate-900">Total Net Disbursed</span>
                    <span className="font-mono-tabular text-emerald-700">
                      {formatNgn(selectedRun.netPayNgn)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedRun(null)}
                    className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
                  >
                    Close Summary
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Close Shift Modal */}
      {closingShiftTarget && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleCloseShiftSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Close Shift — {closingShiftTarget.staffName}
                </h3>
                <p className="text-slate-500 mt-0.5">
                  {closingShiftTarget.department} · {closingShiftTarget.shiftDate} ·{' '}
                  {closingShiftTarget.shiftWindow}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClosingShiftTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Shift Handover Summary &amp; Cash Drawer Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="e.g. Keys verified, POS terminal settled, handover completed to incoming desk..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClosingShiftTarget(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={closingShiftBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{closingShiftBusy ? 'Closing...' : 'Confirm & Close Shift'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
