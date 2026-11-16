import React, { useEffect, useState } from 'react';
import { Clock, Plus, Users, Wallet } from 'lucide-react';
import {
  clockInStaff,
  clockOutAttendance,
  createShiftSchedule,
  createStaffMember,
  runAndPostPayrollWorkflow,
} from '../services/pmsService';
import {
  AttendanceRecord,
  formatNgn,
  NavSectionId,
  PayrollRunRecord,
  PropertyRecord,
  ROLE_LABELS,
  ShiftScheduleRecord,
  StaffMemberRecord,
} from '../types/pms';

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
  const [shiftDate, setShiftDate] = useState('2026-11-16');
  const [shiftWindow, setShiftWindow] = useState<ShiftScheduleRecord['shiftWindow']>(
    'Morning (07:00 - 15:00)'
  );

  const [payrollPeriod, setPayrollPeriod] = useState('November 2026');
  const [runningPayroll, setRunningPayroll] = useState(false);

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

  const handleRunPayroll = async () => {
    setRunningPayroll(true);
    try {
      await runAndPostPayrollWorkflow({
        property,
        periodLabel: payrollPeriod,
        staffList: staffMembers,
        actorRole,
      });
      onNotify(`Computed & posted ${payrollPeriod} Nigerian Payroll to Accounting Ledger`);
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
  const previewNet = previewGross - previewPension - previewPaye;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {section === 'staff'
              ? `Staff Management (${staffMembers.length} Personnel)`
              : section === 'shifts_attendance'
                ? 'Shift Roster & Daily Attendance'
                : 'Nigerian Payroll Engine (PAYE & 8% Pension)'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {section === 'staff'
              ? 'Manage property employees, department roles, and Naira compensation structures'
              : section === 'shifts_attendance'
                ? 'Assign morning/afternoon/night duty rosters and record real-time clock-ins'
                : 'Automated Nigerian statutory deductions and one-click ledger posting'}
          </p>
        </div>

        {section === 'staff' && (
          <button
            type="button"
            onClick={() => setShowStaffForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Onboard Staff Member</span>
          </button>
        )}

        {section === 'payroll' && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={payrollPeriod}
              onChange={(e) => setPayrollPeriod(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs w-36"
            />
            <button
              type="button"
              disabled={runningPayroll || activeStaff.length === 0}
              onClick={handleRunPayroll}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{runningPayroll ? 'Posting...' : 'Run & Post Payroll'}</span>
            </button>
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
                        {s.employmentStatus}
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
          {/* Shift Scheduler */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Schedule Staff Shift
            </h2>
            <form onSubmit={handleAddShift} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
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
                className="sm:col-span-3 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg"
              >
                Assign Shift
              </button>
            </form>

            <div className="divide-y divide-slate-100 text-xs pt-2">
              {shifts.map((sh) => (
                <div key={sh.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{sh.staffName}</p>
                    <p className="text-[11px] text-slate-500">
                      {sh.department} · {sh.shiftDate}
                    </p>
                  </div>
                  <span className="font-mono-tabular text-slate-700">{sh.shiftWindow}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Attendance Clock-In / Clock-Out */}
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
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-800 font-semibold"
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

      {/* SECTION: PAYROLL */}
      {section === 'payroll' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Monthly Gross Payroll</p>
              <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {formatNgn(previewGross)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Employee Pension (8%)</p>
              <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {formatNgn(previewPension)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">PAYE Tax Estimate (9%)</p>
              <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-1">
                {formatNgn(previewPaye)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Net Disbursement</p>
              <p className="font-mono-tabular text-xl font-bold text-emerald-700 mt-1">
                {formatNgn(previewNet)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Posted Payroll Batches
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4 text-right">Headcount</th>
                    <th className="py-3 px-4 text-right">Gross Pay</th>
                    <th className="py-3 px-4 text-right">Pension (8%)</th>
                    <th className="py-3 px-4 text-right">PAYE Tax</th>
                    <th className="py-3 px-4 text-right">Net Paid</th>
                    <th className="py-3 px-4">Ledger Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {payrollRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">{run.periodLabel}</td>
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
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
