import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Link2,
  Lock,
  Mail,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
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
  createPropertyUserAccountWorkflow,
  createShiftSchedule,
  createStaffMember,
  deleteAttendanceWorkflow,
  deletePropertyUserAccountWorkflow,
  deleteShiftWorkflow,
  deleteStaffMemberWorkflow,
  runAndPostPayrollWorkflow,
  sendPropertyMessageWorkflow,
  unassignPropertyUserRoleWorkflow,
  updatePropertyUserRolePrivilegesWorkflow,
  updateStaffMemberWorkflow,
  updateStaffSalary,
} from '../services/pmsService';
import {
  ALL_DEPARTMENTS,
  ASSIGNABLE_ROLE_LABELS,
  AssignablePropertyRole,
  AttendanceRecord,
  DepartmentName,
  formatNgn,
  getPortalUrl,
  getPropertyCodePrefix,
  getPropertySystemId,
  HousekeepingTaskRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  PayrollRunRecord,
  PortalMode,
  PosOrderRecord,
  PROPERTY_PRIVILEGE_OPTIONS,
  PropertyRecord,
  PropertyUserAccountRecord,
  RICHGATES_PROPERTY_INFO,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  ROLE_TO_DEPARTMENT,
  ShiftScheduleRecord,
  StaffMemberRecord,
  StaffRole,
  StaffSessionRecord,
} from '../types/pms';
import { useCms } from '../context/CmsContext';

type StaffAdminTab = 'users' | 'roster' | 'performance';

interface StaffHrPayrollViewProps {
  section: Extract<NavSectionId, 'staff' | 'shifts_attendance' | 'payroll'>;
  initialTab?: StaffAdminTab;
  portalMode?: PortalMode;
  property: PropertyRecord;
  properties?: PropertyRecord[];
  onSelectProperty?: (propertyId: string) => void;
  prefillLoginPropertyId?: string | null;
  onConsumePrefillLoginPropertyId?: () => void;
  activeRole: StaffRole;
  staffMembers: StaffMemberRecord[];
  userAccounts: PropertyUserAccountRecord[];
  staffSessions?: StaffSessionRecord[];
  currentUserEmail?: string;
  currentUserName?: string;
  shifts: ShiftScheduleRecord[];
  attendance: AttendanceRecord[];
  payrollRuns: PayrollRunRecord[];
  housekeepingTasks: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  posOrders: PosOrderRecord[];
  actorRole: string;
  onNotify: (msg: string) => void;
  onOpenSessionMonitor?: () => void;
  onOpenShiftDailyReport?: () => void;
  onSendPasswordSetupEmail?: (email: string) => Promise<void>;
}

const PRIVILEGE_GROUPS = Array.from(new Set(PROPERTY_PRIVILEGE_OPTIONS.map((p) => p.group)));

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  let out = 'Pch@';
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function launchMailtoDraft(to: string, subject: string, body: string): void {
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const a = document.createElement('a');
  a.href = href;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const StaffHrPayrollView: React.FC<StaffHrPayrollViewProps> = ({
  section,
  initialTab,
  portalMode,
  property,
  properties = [],
  onSelectProperty,
  prefillLoginPropertyId,
  onConsumePrefillLoginPropertyId,
  activeRole,
  staffMembers,
  userAccounts,
  staffSessions = [],
  currentUserEmail = '',
  currentUserName = '',
  shifts,
  attendance,
  payrollRuns,
  housekeepingTasks,
  maintenanceTickets,
  posOrders,
  actorRole,
  onNotify,
  onOpenSessionMonitor,
  onOpenShiftDailyReport,
  onSendPasswordSetupEmail,
}) => {
  const { cms } = useCms();
  const isPchPlatformMode = portalMode === 'pch-admin';
  const isAdminManager = activeRole === 'property_admin' || activeRole === 'pch_admin';
  const [staffTab, setStaffTab] = useState<StaffAdminTab>(initialTab || 'users');

  useEffect(() => {
    if (initialTab) {
      setStaffTab(initialTab);
    }
  }, [initialTab]);

  // Create Staff Roster State
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+234 ');
  const [department, setDepartment] =
    useState<StaffMemberRecord['department']>('Front Desk');
  const [role, setRole] = useState<StaffMemberRecord['role']>('front_desk');
  const [baseSalary, setBaseSalary] = useState(150000);
  const [allowance, setAllowance] = useState(35000);

  // User Accounts, Roles & Privileges State
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [uFirstName, setUFirstName] = useState('');
  const [uLastName, setULastName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('+234 ');
  const [uDepartment, setUDepartment] = useState<DepartmentName>('Front Desk');
  const [uRole, setURole] = useState<AssignablePropertyRole>('front_desk');
  const [uPrivileges, setUPrivileges] = useState<NavSectionId[]>([
    ...ROLE_ALLOWED_SECTIONS.front_desk,
  ]);
  const [uPassword, setUPassword] = useState('');
  const [showUPassword, setShowUPassword] = useState(false);
  const [uCreateStaff, setUCreateStaff] = useState(true);
  const [uBaseSalary, setUBaseSalary] = useState(150000);
  const [uAllowance, setUAllowance] = useState(35000);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userActionError, setUserActionError] = useState<string | null>(null);

  // PCH Platform Admin — Create Property Login state (never defaults to Richgates)
  const [targetPropertyId, setTargetPropertyId] = useState<string>(prefillLoginPropertyId || '');
  const [propAdminFirstName, setPropAdminFirstName] = useState('');
  const [propAdminLastName, setPropAdminLastName] = useState('');
  const [propAdminEmail, setPropAdminEmail] = useState('');
  const [propAdminPhone, setPropAdminPhone] = useState('+234 ');
  const [propAdminPassword, setPropAdminPassword] = useState('');
  const [showPropAdminPassword, setShowPropAdminPassword] = useState(false);
  const [creatingPropLogin, setCreatingPropLogin] = useState(false);
  const [createdPropLoginSummary, setCreatedPropLoginSummary] = useState<{
    propertyName: string;
    portalUrl: string;
    fullName: string;
    email: string;
    password: string;
  } | null>(null);

  // Property Admin — Newly Created User summary for immediate "Share Details via Email"
  const [createdPropertyUserSummary, setCreatedPropertyUserSummary] = useState<{
    fullName: string;
    email: string;
    roleLabel: string;
    department: string;
    portalUrl: string;
    password: string;
  } | null>(null);
  const [sharingEmailBusy, setSharingEmailBusy] = useState(false);
  const [shareEmailStatus, setShareEmailStatus] = useState<string | null>(null);

  useEffect(() => {
    if (prefillLoginPropertyId) {
      setTargetPropertyId(prefillLoginPropertyId);
      onConsumePrefillLoginPropertyId?.();
    }
  }, [prefillLoginPropertyId, onConsumePrefillLoginPropertyId]);

  // Edit User Role & Privileges Modal
  const [editingAccount, setEditingAccount] = useState<PropertyUserAccountRecord | null>(null);
  const [editUFirstName, setEditUFirstName] = useState('');
  const [editULastName, setEditULastName] = useState('');
  const [editUPhone, setEditUPhone] = useState('');
  const [editUDept, setEditUDept] = useState<DepartmentName>('Front Desk');
  const [editURole, setEditURole] = useState<AssignablePropertyRole>('front_desk');
  const [editUPrivileges, setEditUPrivileges] = useState<NavSectionId[]>([]);
  const [editUActive, setEditUActive] = useState(true);
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Edit Staff Record Modal
  const [editingStaffModal, setEditingStaffModal] = useState<StaffMemberRecord | null>(null);
  const [editSFirstName, setEditSFirstName] = useState('');
  const [editSLastName, setEditSLastName] = useState('');
  const [editSEmail, setEditSEmail] = useState('');
  const [editSPhone, setEditSPhone] = useState('');
  const [editSDept, setEditSDept] = useState<DepartmentName>('Front Desk');
  const [editSRole, setEditSRole] = useState<StaffMemberRecord['role']>('front_desk');
  const [editSStatus, setEditSStatus] =
    useState<StaffMemberRecord['employmentStatus']>('active');
  const [editSBase, setEditSBase] = useState(0);
  const [editSAllowance, setEditSAllowance] = useState(0);
  const [savingStaffEdit, setSavingStaffEdit] = useState(false);

  // Staff Detail & Performance Modal
  const [viewingStaffDetail, setViewingStaffDetail] = useState<StaffMemberRecord | null>(null);

  // Inline Confirmations (no window.confirm)
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string | null>(null);
  const [confirmUnassignAccId, setConfirmUnassignAccId] = useState<string | null>(null);
  const [confirmDeleteAccId, setConfirmDeleteAccId] = useState<string | null>(null);
  const [confirmDeleteShiftId, setConfirmDeleteShiftId] = useState<string | null>(null);
  const [confirmDeleteAttId, setConfirmDeleteAttId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Share Login Details via Email Modal state (Property Admin)
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [copiedUserLinkId, setCopiedUserLinkId] = useState<string | null>(null);
  const [notifyAccTarget, setNotifyAccTarget] = useState<PropertyUserAccountRecord | null>(null);
  const [notifyAccPortal, setNotifyAccPortal] = useState<'staff' | 'richgates-admin'>('staff');
  const [notifyAccSubject, setNotifyAccSubject] = useState('');
  const [notifyAccBody, setNotifyAccBody] = useState('');
  const [notifyAccBusy, setNotifyAccBusy] = useState(false);
  const [notifyAccResetBusy, setNotifyAccResetBusy] = useState(false);
  const [notifyAccFeedback, setNotifyAccFeedback] = useState<string | null>(null);

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

  const handleSelectCreateRole = (nextRole: AssignablePropertyRole) => {
    setURole(nextRole);
    if (nextRole === 'unassigned') {
      setUPrivileges([]);
      setUCreateStaff(false);
    } else {
      setUDepartment(ROLE_TO_DEPARTMENT[nextRole]);
      setUPrivileges([...ROLE_ALLOWED_SECTIONS[nextRole]]);
    }
  };

  const toggleCreatePrivilege = (priv: NavSectionId) => {
    setUPrivileges((prev) =>
      prev.includes(priv) ? prev.filter((item) => item !== priv) : [...prev, priv]
    );
  };

  const shareLoginDetailsViaEmail = async (params: {
    to: string;
    subject: string;
    body: string;
    propertyName: string;
  }): Promise<{ delivered: boolean; message: string }> => {
    try {
      const resp = await fetch('/api/share-login-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.to,
          subject: params.subject,
          text: params.body,
          propertyName: params.propertyName,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { delivered?: boolean; message?: string; from?: string };
        if (data.delivered) {
          return {
            delivered: true,
            message:
              data.message ||
              `Login details emailed directly to ${params.to} from ${data.from || 'noreply@pchpms.com'}.`,
          };
        }
      }
    } catch {
      // Fall through cleanly to pre-populated mailto draft
    }

    launchMailtoDraft(params.to, params.subject, params.body);
    return {
      delivered: false,
      message: `Opened pre-filled email draft to ${params.to}. Click Send in your email client (or copy the details below).`,
    };
  };

  const handleCreatePropertyAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionError(null);
    setCreatedPropLoginSummary(null);

    const chosenProp = properties.find((p) => p.id === targetPropertyId);
    if (!chosenProp) {
      setUserActionError('Please select a property before creating a Property Login.');
      return;
    }
    if (!propAdminFirstName.trim() || !propAdminLastName.trim() || !propAdminEmail.trim()) {
      setUserActionError('First name, last name, and admin email are required.');
      return;
    }
    if (propAdminPassword.trim() && propAdminPassword.trim().length < 6) {
      setUserActionError('Password must be at least 6 characters.');
      return;
    }

    setCreatingPropLogin(true);
    try {
      const fullName = `${propAdminFirstName.trim()} ${propAdminLastName.trim()}`.trim();
      const emailClean = propAdminEmail.trim().toLowerCase();
      const passClean = propAdminPassword.trim();
      const res = await createPropertyUserAccountWorkflow({
        property: chosenProp,
        firstName: propAdminFirstName.trim(),
        lastName: propAdminLastName.trim(),
        email: emailClean,
        phone: propAdminPhone.trim(),
        department: 'Management',
        role: 'property_admin',
        privileges: [...ROLE_ALLOWED_SECTIONS.property_admin],
        password: passClean,
        alsoCreateStaffRecord: false,
        monthlyBaseSalaryNgn: 0,
        monthlyAllowanceNgn: 0,
        actorRole,
      });

      onSelectProperty?.(chosenProp.id);
      const portalUrl = getPortalUrl('richgates-admin', chosenProp);
      setCreatedPropLoginSummary({
        propertyName: chosenProp.name,
        portalUrl,
        fullName,
        email: emailClean,
        password: passClean,
      });
      onNotify(
        `Created Property Admin login for ${chosenProp.name} (${emailClean})${res.authNote ? ` · ${res.authNote}` : ''}`
      );
      setPropAdminFirstName('');
      setPropAdminLastName('');
      setPropAdminEmail('');
      setPropAdminPhone('+234 ');
      setPropAdminPassword('');
    } catch (err) {
      setUserActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingPropLogin(false);
    }
  };

  const handleCreateUserAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionError(null);
    setShareEmailStatus(null);
    if (!uFirstName.trim() || !uLastName.trim() || !uEmail.trim()) {
      setUserActionError('First name, last name, and work email are required.');
      return;
    }
    setCreatingUser(true);
    try {
      const createdFullName = `${uFirstName.trim()} ${uLastName.trim()}`.trim();
      const createdEmail = uEmail.trim().toLowerCase();
      const createdPassword = uPassword.trim();
      const createdRoleLabel = ASSIGNABLE_ROLE_LABELS[uRole];
      const createdDept = uDepartment;
      const portalUrl = uRole === 'property_admin' ? adminLoginUrl : staffLoginUrl;

      const res = await createPropertyUserAccountWorkflow({
        property,
        firstName: uFirstName,
        lastName: uLastName,
        email: createdEmail,
        phone: uPhone,
        department: uDepartment,
        role: uRole,
        privileges: uPrivileges,
        password: createdPassword,
        alsoCreateStaffRecord: uCreateStaff,
        monthlyBaseSalaryNgn: uBaseSalary,
        monthlyAllowanceNgn: uAllowance,
        actorRole,
      });
      onNotify(
        `Created user account for ${createdFullName} (${createdRoleLabel})${res.authNote ? ` · ${res.authNote}` : ''}`
      );
      setCreatedPropertyUserSummary({
        fullName: createdFullName,
        email: createdEmail,
        roleLabel: createdRoleLabel,
        department: createdDept,
        portalUrl,
        password: createdPassword,
      });
      setShowUserForm(false);
      setUFirstName('');
      setULastName('');
      setUEmail('');
      setUPhone('+234 ');
      setUPassword('');
      setURole('front_desk');
      setUDepartment('Front Desk');
      setUPrivileges([...ROLE_ALLOWED_SECTIONS.front_desk]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUserActionError(msg);
    } finally {
      setCreatingUser(false);
    }
  };

  const openEditUserModal = (acc: PropertyUserAccountRecord) => {
    setEditingAccount(acc);
    setEditUFirstName(acc.firstName);
    setEditULastName(acc.lastName);
    setEditUPhone(acc.phone || '');
    setEditUDept(acc.department);
    setEditURole(acc.role);
    setEditUPrivileges([...acc.privileges]);
    setEditUActive(acc.active);
    setUserActionError(null);
  };

  const handleEditRoleSelect = (nextRole: AssignablePropertyRole) => {
    setEditURole(nextRole);
    if (nextRole === 'unassigned') {
      setEditUPrivileges([]);
      setEditUActive(false);
    } else {
      setEditUDept(ROLE_TO_DEPARTMENT[nextRole]);
      if (editUPrivileges.length === 0) {
        setEditUPrivileges([...ROLE_ALLOWED_SECTIONS[nextRole]]);
      }
      setEditUActive(true);
    }
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSavingUserEdit(true);
    setUserActionError(null);
    try {
      await updatePropertyUserRolePrivilegesWorkflow({
        property,
        account: editingAccount,
        firstName: editUFirstName,
        lastName: editULastName,
        phone: editUPhone,
        department: editUDept,
        role: editURole,
        privileges: editUPrivileges,
        active: editUActive,
        actorRole,
      });
      onNotify(
        `Updated role & privileges for ${editUFirstName.trim()} ${editULastName.trim()}`
      );
      setEditingAccount(null);
    } catch (err) {
      setUserActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleUnassignAccount = async (acc: PropertyUserAccountRecord) => {
    setBusyActionId(acc.id);
    setUserActionError(null);
    try {
      await unassignPropertyUserRoleWorkflow({
        property,
        account: acc,
        actorRole,
      });
      onNotify(`Removed role & unassigned ${acc.fullName}`);
      setConfirmUnassignAccId(null);
    } catch (err) {
      setUserActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDeleteAccount = async (acc: PropertyUserAccountRecord) => {
    setBusyActionId(acc.id);
    setUserActionError(null);
    try {
      await deletePropertyUserAccountWorkflow({
        property,
        account: acc,
        actorRole,
      });
      onNotify(`Deleted user account ${acc.email}`);
      setConfirmDeleteAccId(null);
    } catch (err) {
      setUserActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  };

  const openEditStaffModal = (staff: StaffMemberRecord) => {
    const parsed = splitFullName(staff.fullName);
    setEditingStaffModal(staff);
    setEditSFirstName(parsed.firstName);
    setEditSLastName(parsed.lastName);
    setEditSEmail(staff.email || '');
    setEditSPhone(staff.phone || '');
    setEditSDept(staff.department);
    setEditSRole(staff.role);
    setEditSStatus(staff.employmentStatus);
    setEditSBase(staff.monthlyBaseSalaryNgn);
    setEditSAllowance(staff.monthlyAllowanceNgn);
  };

  const handleSaveStaffModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffModal) return;
    const combined = `${editSFirstName.trim()} ${editSLastName.trim()}`.trim();
    if (!combined) return;
    setActionError(null);
    setSavingStaffEdit(true);
    try {
      await updateStaffMemberWorkflow({
        property,
        staff: editingStaffModal,
        updates: {
          fullName: combined,
          email: editSEmail.trim(),
          phone: editSPhone.trim(),
          department: editSDept,
          role: editSRole,
          employmentStatus: editSStatus,
          monthlyBaseSalaryNgn: Math.max(0, Math.round(editSBase)),
          monthlyAllowanceNgn: Math.max(0, Math.round(editSAllowance)),
        },
        actorRole,
      });
      onNotify(`Updated staff record for ${combined}`);
      setEditingStaffModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingStaffEdit(false);
    }
  };

  const handleDeleteStaff = async (staff: StaffMemberRecord) => {
    setActionError(null);
    setBusyActionId(staff.id);
    try {
      await deleteStaffMemberWorkflow({
        property,
        staff,
        actorRole,
      });
      onNotify(`Deleted staff record ${staff.fullName} (${staff.staffCode})`);
      setConfirmDeleteStaffId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  };

  const staffLoginUrl = getPortalUrl('staff', property);
  const adminLoginUrl = getPortalUrl('richgates-admin', property);

  const openShareEmailModal = (acc: PropertyUserAccountRecord) => {
    const portalChoice: 'staff' | 'richgates-admin' =
      acc.role === 'property_admin' ? 'richgates-admin' : 'staff';
    const linkUrl = portalChoice === 'richgates-admin' ? adminLoginUrl : staffLoginUrl;
    setNotifyAccTarget(acc);
    setNotifyAccPortal(portalChoice);
    setNotifyAccSubject(`Your ${property.name} Login Details`);
    setNotifyAccBody(
      `Hello ${acc.fullName},\n\nYour user login for ${property.name} is ready.\n\nRole: ${ASSIGNABLE_ROLE_LABELS[acc.role]}\nDepartment: ${acc.department}\nPortal URL: ${linkUrl}\nEmail: ${acc.email}\n\nPlease sign in with your work email and assigned password (or use the password setup link if sent separately).\n\nBest regards,\n${currentUserName || property.name}`
    );
    setNotifyAccFeedback(null);
  };

  const handleNotifyAccPortalSwitch = (portal: 'staff' | 'richgates-admin') => {
    setNotifyAccPortal(portal);
    if (!notifyAccTarget) return;
    const nextUrl = portal === 'richgates-admin' ? adminLoginUrl : staffLoginUrl;
    setNotifyAccBody(
      `Hello ${notifyAccTarget.fullName},\n\nYour user login for ${property.name} is ready.\n\nRole: ${ASSIGNABLE_ROLE_LABELS[notifyAccTarget.role]}\nDepartment: ${notifyAccTarget.department}\nPortal URL (${portal === 'richgates-admin' ? 'Property Admin /admin' : 'Staff Portal /login'}): ${nextUrl}\nEmail: ${notifyAccTarget.email}\n\nPlease sign in with your work email and assigned password.\n\nBest regards,\n${currentUserName || property.name}`
    );
  };

  const handleShareAccDetailsViaEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyAccTarget) return;
    setNotifyAccBusy(true);
    setNotifyAccFeedback(null);
    try {
      const subject = notifyAccSubject.trim() || `Your ${property.name} Login Details`;
      const body = notifyAccBody.trim();
      const result = await shareLoginDetailsViaEmail({
        to: notifyAccTarget.email.trim(),
        subject,
        body,
        propertyName: property.name,
      });
      // Also log an in-app copy silently so the employee has it on login too
      try {
        await sendPropertyMessageWorkflow({
          property,
          senderName: currentUserName || 'Property Admin',
          senderRole: actorRole,
          senderDepartment: 'Management',
          recipientScope: 'direct_staff',
          recipientEmails: [notifyAccTarget.email.trim().toLowerCase()],
          recipientNames: [notifyAccTarget.fullName],
          subject,
          body,
          priority: 'Normal',
        });
      } catch {
        // Non-blocking
      }
      setNotifyAccFeedback(result.message);
      onNotify(result.message);
    } catch (err) {
      setNotifyAccFeedback(err instanceof Error ? err.message : 'Unable to share email details.');
    } finally {
      setNotifyAccBusy(false);
    }
  };

  const handleShareCreatedUserViaEmail = async () => {
    if (!createdPropertyUserSummary) return;
    setSharingEmailBusy(true);
    setShareEmailStatus(null);
    const subject = `Your ${property.name} Login Details`;
    const body = [
      `Hello ${createdPropertyUserSummary.fullName},`,
      '',
      `Your account for ${property.name} has been created.`,
      '',
      `Role: ${createdPropertyUserSummary.roleLabel}`,
      `Department: ${createdPropertyUserSummary.department}`,
      `Login Portal: ${createdPropertyUserSummary.portalUrl}`,
      `Work Email: ${createdPropertyUserSummary.email}`,
      createdPropertyUserSummary.password
        ? `Temporary Password: ${createdPropertyUserSummary.password}`
        : 'Password: Use the password setup email sent to your inbox to set your password.',
      '',
      `Best regards,`,
      `${currentUserName || property.name}`,
    ].join('\n');

    try {
      const result = await shareLoginDetailsViaEmail({
        to: createdPropertyUserSummary.email,
        subject,
        body,
        propertyName: property.name,
      });
      setShareEmailStatus(result.message);
      onNotify(result.message);
    } finally {
      setSharingEmailBusy(false);
    }
  };

  const handleSendAccPasswordSetup = async () => {
    if (!notifyAccTarget || !onSendPasswordSetupEmail) return;
    setNotifyAccResetBusy(true);
    setNotifyAccFeedback(null);
    try {
      await onSendPasswordSetupEmail(notifyAccTarget.email);
      setNotifyAccFeedback(
        `Password setup email sent to ${notifyAccTarget.email}. They can set their password and sign in.`
      );
    } catch (err) {
      setNotifyAccFeedback(err instanceof Error ? err.message : 'Unable to send password setup email.');
    } finally {
      setNotifyAccResetBusy(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedFullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim() || !lastName.trim()) return;
    setActionError(null);
    const code = `${getPropertyCodePrefix(property)}-${String(staffMembers.length + 1).padStart(3, '0')}`;
    try {
      await createStaffMember({
        property,
        staff: {
          staffCode: code,
          fullName: combinedFullName,
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
      onNotify(`Onboarded ${combinedFullName} (${code})`);
      setShowStaffForm(false);
      setFirstName('');
      setLastName('');
      setEmail('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffMembers.find((s) => s.id === shiftStaffId) || staffMembers[0];
    if (!staff) return;
    setActionError(null);
    try {
      await createShiftSchedule({
        property,
        staff,
        shiftDate,
        shiftWindow,
      });
      onNotify(`Assigned ${shiftWindow} shift to ${staff.fullName}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteShift = async (sh: ShiftScheduleRecord) => {
    setActionError(null);
    setBusyActionId(sh.id);
    try {
      await deleteShiftWorkflow({ property, shift: sh, actorRole });
      onNotify(`Deleted shift for ${sh.staffName} (${sh.shiftDate})`);
      setConfirmDeleteShiftId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDeleteAttendance = async (att: AttendanceRecord) => {
    setActionError(null);
    setBusyActionId(att.id);
    try {
      await deleteAttendanceWorkflow({ property, record: att, actorRole });
      onNotify(`Deleted attendance log for ${att.staffName} (${att.date})`);
      setConfirmDeleteAttId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleSaveSalary = async (staff: StaffMemberRecord) => {
    setActionError(null);
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSalary(false);
    }
  };

  const handleRunPayroll = async () => {
    setActionError(null);
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningPayroll(false);
    }
  };

  const sessionByEmailMap = useMemo(() => {
    const map = new Map<string, StaffSessionRecord>();
    for (const s of staffSessions) {
      const em = (s.email || '').trim().toLowerCase();
      if (!em) continue;
      const prev = map.get(em);
      if (!prev || (s.lastActiveIso || '') > (prev.lastActiveIso || '')) {
        map.set(em, s);
      }
    }
    return map;
  }, [staffSessions]);

  const filteredAccounts = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    return userAccounts.filter((a) => {
      if (userFilter === 'assigned' && (a.role === 'unassigned' || !a.active)) return false;
      if (userFilter === 'unassigned' && a.role !== 'unassigned' && a.active) return false;
      if (q) {
        const hay =
          `${a.fullName} ${a.email} ${a.department} ${ASSIGNABLE_ROLE_LABELS[a.role]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [userAccounts, userFilter, userSearchQuery]);

  const staffPerformanceRows = useMemo(() => {
    return staffMembers.map((staff) => {
      const staffNameLower = staff.fullName.trim().toLowerCase();
      const staffEmailLower = (staff.email || '').trim().toLowerCase();
      const linkedAccount = userAccounts.find(
        (acc) =>
          acc.linkedStaffId === staff.id ||
          (staffEmailLower && acc.email.trim().toLowerCase() === staffEmailLower)
      );

      const staffShifts = shifts.filter(
        (sh) => sh.staffId === staff.id || sh.staffName.trim().toLowerCase() === staffNameLower
      );
      const completedShifts = staffShifts.filter((sh) => sh.status === 'completed').length;
      const missedShifts = staffShifts.filter((sh) => sh.status === 'missed').length;

      const staffAtt = attendance.filter(
        (a) => a.staffId === staff.id || a.staffName.trim().toLowerCase() === staffNameLower
      );
      const onTimeOrOut = staffAtt.filter(
        (a) => a.status === 'present' || a.status === 'clocked_out'
      ).length;
      const lateCount = staffAtt.filter((a) => a.status === 'late').length;

      const assignedHk = housekeepingTasks.filter(
        (t) => t.assignedTo.trim().toLowerCase() === staffNameLower
      );
      const completedHk = assignedHk.filter(
        (t) => t.status === 'completed' || t.status === 'inspected'
      ).length;

      const assignedMnt = maintenanceTickets.filter(
        (m) => m.assignedTo.trim().toLowerCase() === staffNameLower
      );
      const resolvedMnt = assignedMnt.filter((m) => m.status === 'resolved').length;

      const totalTasks = assignedHk.length + assignedMnt.length;
      const doneTasks = completedHk + resolvedMnt;

      const scores: number[] = [];
      if (staffShifts.length > 0) {
        scores.push(Math.round((completedShifts / staffShifts.length) * 100));
      }
      if (staffAtt.length > 0) {
        scores.push(Math.round((onTimeOrOut / staffAtt.length) * 100));
      }
      if (totalTasks > 0) {
        scores.push(Math.round((doneTasks / totalTasks) * 100));
      }
      const overallScore =
        scores.length > 0
          ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length)
          : null;

      return {
        staff,
        linkedAccount,
        staffShifts,
        completedShifts,
        missedShifts,
        staffAtt,
        onTimeOrOut,
        lateCount,
        assignedHk,
        completedHk,
        assignedMnt,
        resolvedMnt,
        totalTasks,
        doneTasks,
        overallScore,
      };
    });
  }, [staffMembers, userAccounts, shifts, attendance, housekeepingTasks, maintenanceTickets]);

  const perfSummary = useMemo(() => {
    const totalShifts = shifts.length;
    const closedShifts = shifts.filter((s) => s.status === 'completed').length;
    const shiftRate = totalShifts > 0 ? Math.round((closedShifts / totalShifts) * 100) : 0;

    const totalAtt = attendance.length;
    const goodAtt = attendance.filter(
      (a) => a.status === 'present' || a.status === 'clocked_out'
    ).length;
    const attRate = totalAtt > 0 ? Math.round((goodAtt / totalAtt) * 100) : 0;

    const totalOpsTasks = housekeepingTasks.length + maintenanceTickets.length;
    const doneOpsTasks =
      housekeepingTasks.filter((t) => t.status === 'completed' || t.status === 'inspected')
        .length + maintenanceTickets.filter((m) => m.status === 'resolved').length;

    return {
      activeUsers: userAccounts.filter((a) => a.role !== 'unassigned' && a.active).length,
      unassignedUsers: userAccounts.filter((a) => a.role === 'unassigned' || !a.active).length,
      shiftRate,
      closedShifts,
      totalShifts,
      attRate,
      goodAtt,
      totalAtt,
      doneOpsTasks,
      totalOpsTasks,
      servedOrders: posOrders.filter((o) => o.kitchenStatus === 'served').length,
    };
  }, [userAccounts, shifts, attendance, housekeepingTasks, maintenanceTickets, posOrders]);

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
    setActionError(null);
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
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

  if (!isAdminManager && (section === 'staff' || section === 'payroll')) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-slate-900">
          Administrator Authorization Required
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Staff Payroll disbursements, User Management, and salary schedules are restricted exclusively to Property Administrators. Employees can access and print their Shift Daily Report instead.
        </p>
        {onOpenShiftDailyReport && (
          <button
            type="button"
            onClick={onOpenShiftDailyReport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#061539] hover:bg-[#0c2b70] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Open My Shift Daily Report</span>
          </button>
        )}
      </div>
    );
  }

  // DEDICATED CLEAN MODERN "CREATE PROPERTY LOGIN" SCREEN FOR admin.pchpms.com
  if (isPchPlatformMode && section === 'staff') {
    const selectedProp = properties.find((p) => p.id === targetPropertyId) || null;
    const propertyAdminAccounts = userAccounts.filter(
      (a) => selectedProp && a.propertyId === selectedProp.id && a.role === 'property_admin'
    );

    return (
      <div className="space-y-6">
        {/* Clean Modern Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0a367a] text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">
                Create Property Login
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 max-w-2xl">
                Provision a Property Admin login for any registered property. Each property receives full access to its entire dashboard, and its Property Admin manages internal staff roles.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-[#0a367a] shrink-0">
            <Building2 className="w-3.5 h-3.5" />
            <span>{properties.length} Properties Registered</span>
          </span>
        </div>

        {userActionError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-2">
            <span>{userActionError}</span>
            <button
              type="button"
              onClick={() => setUserActionError(null)}
              className="text-rose-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {createdPropLoginSummary && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3 text-xs shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <span>Property Login Created for {createdPropLoginSummary.propertyName}</span>
              </div>
              <button
                type="button"
                onClick={() => setCreatedPropLoginSummary(null)}
                className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white border border-emerald-200/80 rounded-xl p-3.5">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Property Admin</p>
                <p className="font-semibold text-slate-900 mt-0.5">{createdPropLoginSummary.fullName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Login Email</p>
                <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5 break-all">
                  {createdPropLoginSummary.email}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Password</p>
                <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                  {createdPropLoginSummary.password || 'Password setup link required'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Property Portal URL</p>
                <p className="font-mono-tabular font-semibold text-[#0a367a] mt-0.5 truncate">
                  {createdPropLoginSummary.portalUrl}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const text = `Property: ${createdPropLoginSummary.propertyName}\nAdmin: ${createdPropLoginSummary.fullName}\nPortal URL: ${createdPropLoginSummary.portalUrl}\nEmail: ${createdPropLoginSummary.email}${
                    createdPropLoginSummary.password ? `\nPassword: ${createdPropLoginSummary.password}` : ''
                  }`;
                  await navigator.clipboard.writeText(text);
                  onNotify(`Copied login credentials for ${createdPropLoginSummary.propertyName}`);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Property Credentials</span>
              </button>
            </div>
          </div>
        )}

        {/* Clean Modern Create Property Login Form (No Assign Roles, No Module Privileges, No Send User Login) */}
        <form
          onSubmit={handleCreatePropertyAdminLogin}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-800 mb-1.5">
                Select Property *
              </label>
              <select
                required
                value={targetPropertyId}
                onChange={(e) => {
                  setTargetPropertyId(e.target.value);
                  if (e.target.value) {
                    onSelectProperty?.(e.target.value);
                  }
                }}
                className="w-full h-11 border border-slate-200 rounded-xl px-3.5 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:border-[#0a367a] focus:ring-2 focus:ring-emerald-600/15"
              >
                <option value="">Choose a property...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({getPropertySystemId(p)} · {p.city}, {p.country})
                  </option>
                ))}
              </select>
              {selectedProp && (
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-[#0a367a]" />
                  <span>
                    Admin Dashboard URL:{' '}
                    <strong className="font-mono-tabular text-slate-700">
                      {getPortalUrl('richgates-admin', selectedProp)}
                    </strong>
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">First Name *</label>
              <input
                required
                type="text"
                placeholder="e.g. Chidi"
                value={propAdminFirstName}
                onChange={(e) => setPropAdminFirstName(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-[#0a367a]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">Last Name *</label>
              <input
                required
                type="text"
                placeholder="e.g. Nwosu"
                value={propAdminLastName}
                onChange={(e) => setPropAdminLastName(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-[#0a367a]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">Admin Email *</label>
              <input
                required
                type="email"
                placeholder="admin@propertydomain.com"
                value={propAdminEmail}
                onChange={(e) => setPropAdminEmail(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-[#0a367a]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">Phone Number</label>
              <input
                type="text"
                value={propAdminPhone}
                onChange={(e) => setPropAdminPhone(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3.5 text-sm font-mono-tabular text-slate-900 focus:outline-none focus:border-[#0a367a]"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-800">
                  Sign-In Password (min 6 characters) *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPropAdminPassword(generateStrongPassword());
                    setShowPropAdminPassword(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0a367a] hover:underline cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Generate Password</span>
                </button>
              </div>
              <div className="relative">
                <input
                  required
                  minLength={6}
                  type={showPropAdminPassword ? 'text' : 'password'}
                  placeholder="Enter a secure password"
                  value={propAdminPassword}
                  onChange={(e) => setPropAdminPassword(e.target.value)}
                  className="w-full h-10 border border-slate-200 rounded-xl pl-3.5 pr-10 text-sm font-mono-tabular text-slate-900 focus:outline-none focus:border-[#0a367a]"
                />
                <button
                  type="button"
                  onClick={() => setShowPropAdminPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPropAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-[#0a367a] shrink-0" />
              <span>
                Full property dashboard access is granted automatically; the property admin assigns staff roles inside their workspace.
              </span>
            </div>
            <button
              type="submit"
              disabled={creatingPropLogin || !targetPropertyId}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#0a367a] hover:bg-[#07275a] disabled:opacity-50 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>{creatingPropLogin ? 'Creating Login...' : 'Create Property Login'}</span>
            </button>
          </div>
        </form>

        {/* Existing Property Admin Logins for Selected Property */}
        {selectedProp && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Existing Property Logins — {selectedProp.name} ({propertyAdminAccounts.length})
              </h2>
              <span className="text-xs text-slate-500 font-mono-tabular">
                {getPropertySystemId(selectedProp)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Admin Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Access Scope</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {propertyAdminAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No property admin login created for {selectedProp.name} yet. Use the form above to create one.
                      </td>
                    </tr>
                  ) : (
                    propertyAdminAccounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-semibold text-slate-900">{acc.fullName}</td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600">{acc.email}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#0a367a] font-semibold text-[11px]">
                            Full Property Dashboard
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              acc.active
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {acc.active ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc)}
                            disabled={busyActionId === acc.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="no-print bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
              ? `${cms.pages.staff.title} (${userAccounts.length} Accounts · ${staffMembers.length} Staff)`
              : cms.pages[section].title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages[section].subtitle}
          </p>
        </div>

        {section === 'staff' && isAdminManager && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStaffTab('users');
                setShowUserForm((v) => !v);
                setUserActionError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create User Account</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStaffTab('roster');
                setShowStaffForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{cms.pages.staff.ctaLabel || 'Onboard Staff Member'}</span>
            </button>
            {onOpenSessionMonitor && (
              <button
                type="button"
                onClick={onOpenSessionMonitor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#061539] rounded-lg cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-[#1c46be]" />
                <span>Monitor Employee Logins</span>
              </button>
            )}
          </div>
        )}

        {section === 'shifts_attendance' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {onOpenShiftDailyReport && (
              <button
                type="button"
                onClick={onOpenShiftDailyReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold bg-[#061539] hover:bg-[#0c2b70] text-white rounded-lg cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-300" />
                <span>Shift Daily Report</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Roster</span>
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

      {/* SECTION: USER ACCOUNTS, STAFF RECORDS & PERFORMANCE */}
      {section === 'staff' && (
        <div className="space-y-6">

          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
            {isAdminManager && (
              <button
                type="button"
                onClick={() => setStaffTab('users')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  staffTab === 'users'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>User Accounts, Roles &amp; Privileges ({userAccounts.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setStaffTab('roster')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                staffTab === 'roster' || !isAdminManager
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Records &amp; Roster ({staffMembers.length})</span>
            </button>
            {isAdminManager && (
              <button
                type="button"
                onClick={() => setStaffTab('performance')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  staffTab === 'performance'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Staff Performance &amp; Analytics</span>
              </button>
            )}
          </div>

          {userActionError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800 flex items-center justify-between gap-2">
              <span>{userActionError}</span>
              <button
                type="button"
                onClick={() => setUserActionError(null)}
                className="text-red-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: USER ACCOUNTS, ROLES & PRIVILEGES */}
          {isAdminManager && staffTab === 'users' && (
            <div className="space-y-5">
              {/* Simple 3-Step Guide + Quick Property Portal Links */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-sm font-bold text-[#061539]">
                      How Property User Access Works
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Add a team member, assign their role &amp; pages, and send them the Staff (/login) or Admin (/admin) sign-in link.
                    </p>
                  </div>
                  {onOpenSessionMonitor && (
                    <button
                      type="button"
                      onClick={onOpenSessionMonitor}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#061539] hover:bg-[#0c2b70] text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-amber-300" />
                      <span>Open Employee Login Monitor</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <p className="font-bold text-[#061539]">1. Create User &amp; Pick Role</p>
                    <p className="text-slate-600">
                      Roles like Front Desk, Housekeeping, or Kitchen automatically pre-select the right workspace pages.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <p className="font-bold text-[#061539]">2. Share Details via Email</p>
                    <p className="text-slate-600">
                      After creating a user login, click <strong>Share Details via Email</strong> to email their portal link, role, and sign-in details directly.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <p className="font-bold text-[#061539]">3. Unassign Anytime</p>
                    <p className="text-slate-600">
                      Unassigning removes login access immediately without deleting payroll or shift history.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        <span>Staff Login Link (/login)</span>
                      </p>
                      <p className="font-mono-tabular text-xs font-semibold text-slate-900 truncate">
                        {staffLoginUrl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(staffLoginUrl);
                        setCopiedUserLinkId('staff-url');
                        onNotify(`Copied Staff Login link: ${staffLoginUrl}`);
                        setTimeout(() => setCopiedUserLinkId(null), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-md font-semibold text-slate-800 shrink-0 cursor-pointer"
                    >
                      {copiedUserLinkId === 'staff-url' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase text-[#1c46be] flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        <span>Property Admin Link (/admin)</span>
                      </p>
                      <p className="font-mono-tabular text-xs font-semibold text-slate-900 truncate">
                        {adminLoginUrl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(adminLoginUrl);
                        setCopiedUserLinkId('admin-url');
                        onNotify(`Copied Admin Login link: ${adminLoginUrl}`);
                        setTimeout(() => setCopiedUserLinkId(null), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-md font-semibold text-slate-800 shrink-0 cursor-pointer"
                    >
                      {copiedUserLinkId === 'admin-url' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Post-Creation Share Details via Email Card */}
              {createdPropertyUserSummary && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3.5 text-xs shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                      <span>
                        User Login Created for {createdPropertyUserSummary.fullName} — Share Details via Email
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedPropertyUserSummary(null);
                        setShareEmailStatus(null);
                      }}
                      className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white border border-emerald-200/80 rounded-xl p-3.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Role</p>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {createdPropertyUserSummary.roleLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Email</p>
                      <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5 break-all">
                        {createdPropertyUserSummary.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Password</p>
                      <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                        {createdPropertyUserSummary.password || 'Password setup link'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Portal URL</p>
                      <p className="font-mono-tabular font-semibold text-[#0a367a] mt-0.5 truncate">
                        {createdPropertyUserSummary.portalUrl}
                      </p>
                    </div>
                  </div>

                  {shareEmailStatus && (
                    <div className="px-3.5 py-2.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 font-medium">
                      {shareEmailStatus}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={sharingEmailBusy}
                      onClick={handleShareCreatedUserViaEmail}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0a367a] hover:bg-[#07275a] disabled:opacity-50 text-white font-semibold cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{sharingEmailBusy ? 'Sharing via Email...' : 'Share Details via Email'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const txt = `Hello ${createdPropertyUserSummary.fullName},\n\nYour ${property.name} login details:\nRole: ${createdPropertyUserSummary.roleLabel}\nPortal URL: ${createdPropertyUserSummary.portalUrl}\nEmail: ${createdPropertyUserSummary.email}${
                          createdPropertyUserSummary.password
                            ? `\nPassword: ${createdPropertyUserSummary.password}`
                            : ''
                        }`;
                        await navigator.clipboard.writeText(txt);
                        onNotify(`Copied login details for ${createdPropertyUserSummary.fullName}`);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100/50 text-emerald-950 font-semibold cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Details</span>
                    </button>

                    {onSendPasswordSetupEmail && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onSendPasswordSetupEmail(createdPropertyUserSummary.email);
                          setShareEmailStatus(
                            `Password setup email sent to ${createdPropertyUserSummary.email}.`
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Send Password Setup Link</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {showUserForm && (
                <form
                  onSubmit={handleCreateUserAccount}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        Create User Account, Role &amp; Module Privileges
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Provision credentials, assign a role (or leave unassigned), and select exact module privileges.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowUserForm(false)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                      <input
                        required
                        type="text"
                        value={uFirstName}
                        onChange={(e) => setUFirstName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                      <input
                        required
                        type="text"
                        value={uLastName}
                        onChange={(e) => setULastName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Account Email *</label>
                      <input
                        required
                        type="email"
                        value={uEmail}
                        onChange={(e) => setUEmail(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={uPhone}
                        onChange={(e) => setUPhone(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Department</label>
                      <select
                        value={uDepartment}
                        onChange={(e) => setUDepartment(e.target.value as DepartmentName)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                      >
                        {ALL_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Assign Role</label>
                      <select
                        value={uRole}
                        onChange={(e) =>
                          handleSelectCreateRole(e.target.value as AssignablePropertyRole)
                        }
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                      >
                        <option value="front_desk">Front Desk &amp; Reservations</option>
                        <option value="housekeeping">Housekeeping Lead</option>
                        <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                        <option value="accountant">Finance &amp; Payroll Officer</option>
                        <option value="maintenance">Engineering &amp; Maintenance</option>
                        <option value="property_admin">Property Admin (GM)</option>
                        <option value="unassigned">Unassigned (No Role / Pending)</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-medium text-slate-700">
                          Sign-In Password (Optional, min 6 chars)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setUPassword(generateStrongPassword());
                            setShowUPassword(true);
                          }}
                          className="text-[10px] font-semibold text-[#0a367a] hover:underline cursor-pointer"
                        >
                          Generate
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showUPassword ? 'text' : 'password'}
                          minLength={6}
                          value={uPassword}
                          onChange={(e) => setUPassword(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg pl-3 pr-9 py-2 font-mono-tabular"
                        />
                        <button
                          type="button"
                          onClick={() => setShowUPassword((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          aria-label="Toggle password visibility"
                        >
                          {showUPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        You can share login details via email right after creating the user.
                      </span>
                    </div>
                    {uRole !== 'unassigned' && (
                      <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-5">
                        <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={uCreateStaff}
                            onChange={(e) => setUCreateStaff(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          <span>Also add employee to Staff Roster &amp; Payroll</span>
                        </label>
                        {uCreateStaff && (
                          <div className="flex items-center gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-500">Base Salary (₦)</label>
                              <input
                                type="number"
                                min={0}
                                step={5000}
                                value={uBaseSalary}
                                onChange={(e) => setUBaseSalary(Number(e.target.value))}
                                className="w-28 border border-slate-200 rounded px-2 py-1 font-mono-tabular"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500">Allowance (₦)</label>
                              <input
                                type="number"
                                min={0}
                                step={5000}
                                value={uAllowance}
                                onChange={(e) => setUAllowance(Number(e.target.value))}
                                className="w-28 border border-slate-200 rounded px-2 py-1 font-mono-tabular"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Privileges Matrix */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Module Privileges ({uPrivileges.length} selected)
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Controls which sections this user can open when signed into {property.name}.
                        </p>
                      </div>
                      {uRole !== 'unassigned' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setUPrivileges([...ROLE_ALLOWED_SECTIONS[uRole]])}
                            className="px-2.5 py-1 border border-slate-200 bg-white rounded text-[11px] font-medium text-slate-700 cursor-pointer"
                          >
                            Reset Role Defaults
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setUPrivileges(PROPERTY_PRIVILEGE_OPTIONS.map((p) => p.id))
                            }
                            className="px-2.5 py-1 border border-slate-200 bg-white rounded text-[11px] font-medium text-slate-700 cursor-pointer"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setUPrivileges([])}
                            className="px-2.5 py-1 border border-slate-200 bg-white rounded text-[11px] font-medium text-slate-700 cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {uRole === 'unassigned' ? (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Account will be created with no assigned role and zero active privileges until you assign a role.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {PRIVILEGE_GROUPS.map((groupName) => (
                          <div
                            key={groupName}
                            className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              {groupName}
                            </p>
                            {PROPERTY_PRIVILEGE_OPTIONS.filter((p) => p.group === groupName).map(
                              (opt) => (
                                <label
                                  key={opt.id}
                                  className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={uPrivileges.includes(opt.id)}
                                    onChange={() => toggleCreatePrivilege(opt.id)}
                                    className="rounded border-slate-300 text-emerald-600"
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUserForm(false)}
                      className="px-4 py-2 text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingUser}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                    >
                      {creatingUser ? 'Saving Account...' : 'Create User Account'}
                    </button>
                  </div>
                </form>
              )}

              {/* User Accounts Filter & List */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Property User Accounts ({filteredAccounts.length})
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Filter name, email or role..."
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1c46be]"
                    />
                    {(
                      [
                        { id: 'all', label: `All (${userAccounts.length})` },
                        {
                          id: 'assigned',
                          label: `Active Roles (${userAccounts.filter((a) => a.role !== 'unassigned' && a.active).length})`,
                        },
                        {
                          id: 'unassigned',
                          label: `Unassigned (${userAccounts.filter((a) => a.role === 'unassigned' || !a.active).length})`,
                        },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setUserFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
                          userFilter === f.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-3 px-4">Employee &amp; Login Session</th>
                        <th className="py-3 px-4">Role &amp; Department</th>
                        <th className="py-3 px-4">Allowed Pages</th>
                        <th className="py-3 px-4">Sign-In Permission</th>
                        <th className="py-3 px-4 text-right">Actions &amp; Login Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredAccounts.map((acc) => {
                        const isUnassigned = acc.role === 'unassigned' || !acc.active;
                        const sess = sessionByEmailMap.get(acc.email.trim().toLowerCase());
                        return (
                          <tr key={acc.id} className="hover:bg-slate-50 align-top">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-900">{acc.fullName}</p>
                                {sess?.status === 'logged_in' ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Online
                                  </span>
                                ) : sess?.status === 'logged_out' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                                    Logged Out
                                  </span>
                                ) : null}
                              </div>
                              <p className="font-mono-tabular text-[11px] text-slate-500 mt-0.5">
                                {acc.email}
                              </p>
                              {acc.phone && (
                                <p className="font-mono-tabular text-[10px] text-slate-400">
                                  {acc.phone}
                                </p>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  acc.role === 'unassigned'
                                    ? 'bg-amber-100 text-amber-800'
                                    : acc.role === 'property_admin'
                                      ? 'bg-blue-50 text-[#061539]'
                                      : 'bg-emerald-50 text-emerald-800'
                                }`}
                              >
                                {ASSIGNABLE_ROLE_LABELS[acc.role]}
                              </span>
                              <p className="text-[11px] text-slate-500 mt-1">{acc.department}</p>
                            </td>
                            <td className="py-3.5 px-4 max-w-xs">
                              {acc.privileges.length === 0 ? (
                                <span className="text-[11px] text-slate-400 italic">
                                  No pages enabled yet
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {acc.privileges.slice(0, 4).map((p) => (
                                    <span
                                      key={p}
                                      className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]"
                                    >
                                      {PROPERTY_PRIVILEGE_OPTIONS.find((o) => o.id === p)?.label ||
                                        p}
                                    </span>
                                  ))}
                                  {acc.privileges.length > 4 && (
                                    <span className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded text-[10px] font-semibold">
                                      +{acc.privileges.length - 4} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {isUnassigned ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px]">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>Paused / Unassigned</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-[11px]">
                                  <UserCheck className="w-3 h-3" />
                                  <span>Active ({acc.privileges.length} pages)</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right space-y-1.5">
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openShareEmailModal(acc)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[#0a367a] font-semibold rounded cursor-pointer"
                                >
                                  <Mail className="w-3 h-3 text-[#0a367a]" />
                                  <span>Share via Email</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditUserModal(acc)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit Role</span>
                                </button>
                                {acc.role !== 'unassigned' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmUnassignAccId(acc.id);
                                      setConfirmDeleteAccId(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded cursor-pointer"
                                  >
                                    <UserMinus className="w-3 h-3" />
                                    <span>Unassign</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteAccId(acc.id);
                                    setConfirmUnassignAccId(null);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>

                              {confirmUnassignAccId === acc.id && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-left space-y-1.5">
                                  <p className="text-[11px] font-medium text-amber-900">
                                    Remove role &amp; revoke access for {acc.fullName}? Account stays as Unassigned.
                                  </p>
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setConfirmUnassignAccId(null)}
                                      className="px-2 py-1 text-[11px] text-slate-600 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyActionId === acc.id}
                                      onClick={() => handleUnassignAccount(acc)}
                                      className="px-2.5 py-1 text-[11px] bg-amber-700 text-white font-semibold rounded cursor-pointer"
                                    >
                                      {busyActionId === acc.id ? 'Removing...' : 'Confirm Unassign'}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {confirmDeleteAccId === acc.id && (
                                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-left space-y-1.5">
                                  <p className="text-[11px] font-medium text-rose-900">
                                    Permanently delete user account {acc.email}?
                                  </p>
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteAccId(null)}
                                      className="px-2 py-1 text-[11px] text-slate-600 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyActionId === acc.id}
                                      onClick={() => handleDeleteAccount(acc)}
                                      className="px-2.5 py-1 text-[11px] bg-rose-600 text-white font-semibold rounded cursor-pointer"
                                    >
                                      {busyActionId === acc.id ? 'Deleting...' : 'Confirm Delete'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredAccounts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-xs text-slate-500">
                            No user accounts in this filter yet. Click &ldquo;Create User Account&rdquo; above to add property admins or staff users and assign their roles &amp; privileges.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STAFF RECORDS & ROSTER */}
          {(staffTab === 'roster' || !isAdminManager) && (
            <>
              {showStaffForm && isAdminManager && (
                <form
                  onSubmit={handleAddStaff}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
                >
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Onboard Property Staff
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                      <input
                        required
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                      <input
                        required
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Work Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Department</label>
                      <select
                        value={department}
                        onChange={(e) =>
                          setDepartment(e.target.value as StaffMemberRecord['department'])
                        }
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                      >
                        {ALL_DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Role</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as StaffMemberRecord['role'])}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                      >
                        <option value="front_desk">Front Desk &amp; Reservations</option>
                        <option value="housekeeping">Housekeeping Lead</option>
                        <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                        <option value="accountant">Finance &amp; Payroll Officer</option>
                        <option value="maintenance">Engineering &amp; Maintenance</option>
                        <option value="property_admin">Property Admin (GM)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Base Salary (₦)</label>
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        value={baseSalary}
                        onChange={(e) => setBaseSalary(Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Allowance (₦)</label>
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        value={allowance}
                        onChange={(e) => setAllowance(Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStaffForm(false)}
                      className="px-4 py-2 text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg cursor-pointer"
                    >
                      Save Staff Record
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-700" />
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Employee Roster &amp; Records
                    </h2>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {activeStaff.length} active of {staffMembers.length} total
                  </span>
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
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {staffMembers.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 align-top">
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
                          <td className="py-3 px-4 font-medium capitalize">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                s.employmentStatus === 'active'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : s.employmentStatus === 'on_leave'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {s.employmentStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-y-1.5">
                            <div className="inline-flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingStaffDetail(s)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Record</span>
                              </button>
                              {isAdminManager && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditStaffModal(s)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteStaffId(s.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                </>
                              )}
                            </div>

                            {confirmDeleteStaffId === s.id && (
                              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-left space-y-1.5">
                                <p className="text-[11px] font-medium text-rose-900">
                                  Delete staff record for {s.fullName}?
                                </p>
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteStaffId(null)}
                                    className="px-2 py-1 text-[11px] text-slate-600 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyActionId === s.id}
                                    onClick={() => handleDeleteStaff(s)}
                                    className="px-2.5 py-1 text-[11px] bg-rose-600 text-white font-semibold rounded cursor-pointer"
                                  >
                                    {busyActionId === s.id ? 'Deleting...' : 'Confirm Delete'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {staffMembers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-xs text-slate-500">
                            No staff records on roster yet. Onboard staff directly or check &ldquo;Also add employee to Staff Roster&rdquo; when creating a user account.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: STAFF PERFORMANCE & ANALYTICS */}
          {isAdminManager && staffTab === 'performance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Active User Accounts</p>
                  <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                    {perfSummary.activeUsers}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {perfSummary.unassignedUsers} unassigned / paused
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Shift Completion Rate</p>
                  <p className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
                    {perfSummary.shiftRate}%
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {perfSummary.closedShifts} closed of {perfSummary.totalShifts} shifts
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Attendance On-Time Rate</p>
                  <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                    {perfSummary.attRate}%
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {perfSummary.goodAtt} present/completed of {perfSummary.totalAtt} logs
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Tasks &amp; Tickets Completed</p>
                  <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                    {perfSummary.doneOpsTasks} / {perfSummary.totalOpsTasks}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {perfSummary.servedOrders} POS orders served
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-700" />
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Individual Staff Records &amp; Operational Performance
                    </h2>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Computed from live shifts, attendance logs, housekeeping &amp; maintenance tasks
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-3 px-4">Staff Member</th>
                        <th className="py-3 px-4">Role &amp; Account</th>
                        <th className="py-3 px-4 text-right">Shifts (Done/Total)</th>
                        <th className="py-3 px-4 text-right">Attendance (On-Time/Logs)</th>
                        <th className="py-3 px-4 text-right">Tasks &amp; Tickets Done</th>
                        <th className="py-3 px-4 text-right">Performance Score</th>
                        <th className="py-3 px-4 text-right">Full Record</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {staffPerformanceRows.map((row) => (
                        <tr key={row.staff.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{row.staff.fullName}</p>
                            <p className="font-mono-tabular text-[11px] text-slate-500">
                              {row.staff.staffCode} · {row.staff.department}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-800">
                              {ROLE_LABELS[row.staff.role]}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {row.linkedAccount
                                ? `${ASSIGNABLE_ROLE_LABELS[row.linkedAccount.role]} (${row.linkedAccount.privileges.length} priv.)`
                                : 'No portal login linked'}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular">
                            {row.completedShifts} / {row.staffShifts.length}
                            {row.missedShifts > 0 && (
                              <span className="block text-[10px] text-rose-600">
                                {row.missedShifts} missed
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular">
                            {row.onTimeOrOut} / {row.staffAtt.length}
                            {row.lateCount > 0 && (
                              <span className="block text-[10px] text-amber-700">
                                {row.lateCount} late
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular">
                            {row.doneTasks} / {row.totalTasks}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular">
                            {row.overallScore === null ? (
                              <span className="text-slate-400">No activity yet</span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  row.overallScore >= 85
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : row.overallScore >= 65
                                      ? 'bg-amber-50 text-amber-800'
                                      : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {row.overallScore}%
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setViewingStaffDetail(row.staff)}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Record</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {staffPerformanceRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                            No staff records available yet. Add employees in the Staff Roster or User Accounts tab to track real-time performance.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
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
            {isAdminManager && (
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
            )}

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
                  <div className="no-print shrink-0 flex items-center gap-1.5">
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
                    {isAdminManager && confirmDeleteShiftId !== sh.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteShiftId(sh.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    {isAdminManager && confirmDeleteShiftId === sh.id && (
                      <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteShiftId(null)}
                          className="text-[10px] text-slate-600 px-1 cursor-pointer"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          disabled={busyActionId === sh.id}
                          onClick={() => void handleDeleteShift(sh)}
                          className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          {busyActionId === sh.id ? '...' : 'Del'}
                        </button>
                      </div>
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
                onChange={async (e) => {
                  const s = staffMembers.find((m) => m.id === e.target.value);
                  if (s) {
                    setActionError(null);
                    try {
                      await clockInStaff({ property, staff: s });
                      onNotify(`Clocked in ${s.fullName}`);
                    } catch (err) {
                      setActionError(err instanceof Error ? err.message : String(err));
                    }
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    {att.status !== 'clocked_out' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await clockOutAttendance({ property, record: att });
                            onNotify(`Clocked out ${att.staffName}`);
                          } catch (err) {
                            setActionError(err instanceof Error ? err.message : String(err));
                          }
                        }}
                        className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 rounded text-slate-700 font-medium cursor-pointer"
                      >
                        Clock Out
                      </button>
                    ) : (
                      <span className="text-slate-500">Clocked Out</span>
                    )}
                    {isAdminManager && confirmDeleteAttId !== att.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAttId(att.id)}
                        className="no-print inline-flex items-center gap-1 px-2 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    {isAdminManager && confirmDeleteAttId === att.id && (
                      <div className="no-print inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAttId(null)}
                          className="text-[10px] text-slate-600 px-1 cursor-pointer"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          disabled={busyActionId === att.id}
                          onClick={() => void handleDeleteAttendance(att)}
                          className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          {busyActionId === att.id ? '...' : 'Del'}
                        </button>
                      </div>
                    )}
                  </div>
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

      {/* Edit User Account Role & Privileges Modal */}
      {editingAccount && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveUserEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Manage Role &amp; Privileges — {editingAccount.fullName}
                </h3>
                <p className="font-mono-tabular text-[11px] text-slate-500">
                  {editingAccount.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                <input
                  required
                  type="text"
                  value={editUFirstName}
                  onChange={(e) => setEditUFirstName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                <input
                  required
                  type="text"
                  value={editULastName}
                  onChange={(e) => setEditULastName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={editUPhone}
                  onChange={(e) => setEditUPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Department</label>
                <select
                  value={editUDept}
                  onChange={(e) => setEditUDept(e.target.value as DepartmentName)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  {ALL_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Assigned Role</label>
                <select
                  value={editURole}
                  onChange={(e) =>
                    handleEditRoleSelect(e.target.value as AssignablePropertyRole)
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="front_desk">Front Desk &amp; Reservations</option>
                  <option value="housekeeping">Housekeeping Lead</option>
                  <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                  <option value="accountant">Finance &amp; Payroll Officer</option>
                  <option value="maintenance">Engineering &amp; Maintenance</option>
                  <option value="property_admin">Property Admin (GM)</option>
                  <option value="unassigned">Unassigned (Delete Role / Revoke)</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={editURole === 'unassigned'}
                    checked={editUActive && editURole !== 'unassigned'}
                    onChange={(e) => setEditUActive(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Account Active</span>
                </label>
              </div>
            </div>

            {editURole !== 'unassigned' ? (
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    Granted Module Privileges ({editUPrivileges.length} selected)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditUPrivileges([...ROLE_ALLOWED_SECTIONS[editURole]])}
                      className="px-2.5 py-1 border border-slate-200 bg-white rounded text-[11px] font-medium cursor-pointer"
                    >
                      Apply Role Defaults
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditUPrivileges(PROPERTY_PRIVILEGE_OPTIONS.map((p) => p.id))
                      }
                      className="px-2.5 py-1 border border-slate-200 bg-white rounded text-[11px] font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditUPrivileges([])}
                      className="px-2.5 py-1 border border-slate-200 bg-white rounded text-[11px] font-medium cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                  {PRIVILEGE_GROUPS.map((groupName) => (
                    <div
                      key={groupName}
                      className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {groupName}
                      </p>
                      {PROPERTY_PRIVILEGE_OPTIONS.filter((p) => p.group === groupName).map(
                        (opt) => (
                          <label
                            key={opt.id}
                            className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={editUPrivileges.includes(opt.id)}
                              onChange={() =>
                                setEditUPrivileges((prev) =>
                                  prev.includes(opt.id)
                                    ? prev.filter((x) => x !== opt.id)
                                    : [...prev, opt.id]
                                )
                              }
                              className="rounded border-slate-300 text-emerald-600"
                            />
                            <span>{opt.label}</span>
                          </label>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                Setting role to Unassigned removes all module privileges and blocks property workspace login until a role is reassigned.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="px-4 py-2 text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingUserEdit}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                {savingUserEdit ? 'Saving...' : 'Save Role & Privileges'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Staff Record Modal */}
      {editingStaffModal && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStaffModal}
            className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Edit Staff Record — {editingStaffModal.staffCode}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Update employment status, department, role, and compensation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStaffModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                <input
                  required
                  type="text"
                  value={editSFirstName}
                  onChange={(e) => setEditSFirstName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                <input
                  required
                  type="text"
                  value={editSLastName}
                  onChange={(e) => setEditSLastName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Work Email</label>
                <input
                  type="email"
                  value={editSEmail}
                  onChange={(e) => setEditSEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={editSPhone}
                  onChange={(e) => setEditSPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Department</label>
                <select
                  value={editSDept}
                  onChange={(e) => setEditSDept(e.target.value as DepartmentName)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  {ALL_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={editSRole}
                  onChange={(e) => setEditSRole(e.target.value as StaffMemberRecord['role'])}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="front_desk">Front Desk &amp; Reservations</option>
                  <option value="housekeeping">Housekeeping Lead</option>
                  <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                  <option value="accountant">Finance &amp; Payroll Officer</option>
                  <option value="maintenance">Engineering &amp; Maintenance</option>
                  <option value="property_admin">Property Admin (GM)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Base Salary (₦)</label>
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={editSBase}
                  onChange={(e) => setEditSBase(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Allowance (₦)</label>
                <input
                  type="number"
                  min={0}
                  step={2500}
                  value={editSAllowance}
                  onChange={(e) => setEditSAllowance(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Employment Status</label>
                <select
                  value={editSStatus}
                  onChange={(e) =>
                    setEditSStatus(e.target.value as StaffMemberRecord['employmentStatus'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingStaffModal(null)}
                className="px-4 py-2 text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStaffEdit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                {savingStaffEdit ? 'Saving...' : 'Save Staff Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Record & Performance Detail Modal */}
      {viewingStaffDetail && (() => {
        const detailRow = staffPerformanceRows.find(
          (r) => r.staff.id === viewingStaffDetail.id
        );
        const gross =
          viewingStaffDetail.monthlyBaseSalaryNgn + viewingStaffDetail.monthlyAllowanceNgn;
        const pension = Math.round(gross * 0.08);
        const paye = Math.round(gross * 0.09);
        const net = gross - pension - paye;

        return (
          <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-5 text-xs my-8">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <p className="font-mono-tabular text-[11px] font-semibold text-emerald-700">
                    {viewingStaffDetail.staffCode} · {viewingStaffDetail.department}
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {viewingStaffDetail.fullName} — Staff Record &amp; Performance
                  </h3>
                  <p className="text-slate-500">
                    {ROLE_LABELS[viewingStaffDetail.role]} ·{' '}
                    {viewingStaffDetail.email || 'No email'} ·{' '}
                    {viewingStaffDetail.phone || 'No phone'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingStaffDetail(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-500">Performance Score</p>
                  <p className="font-mono-tabular text-lg font-bold text-slate-900 mt-0.5">
                    {detailRow?.overallScore === null || detailRow?.overallScore === undefined
                      ? '—'
                      : `${detailRow.overallScore}%`}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-500">Shifts Closed</p>
                  <p className="font-mono-tabular text-lg font-bold text-slate-900 mt-0.5">
                    {detailRow?.completedShifts ?? 0} / {detailRow?.staffShifts.length ?? 0}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-500">Attendance On-Time</p>
                  <p className="font-mono-tabular text-lg font-bold text-slate-900 mt-0.5">
                    {detailRow?.onTimeOrOut ?? 0} / {detailRow?.staffAtt.length ?? 0}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-500">Tasks &amp; Tickets</p>
                  <p className="font-mono-tabular text-lg font-bold text-slate-900 mt-0.5">
                    {detailRow?.doneTasks ?? 0} / {detailRow?.totalTasks ?? 0}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <h4 className="font-display text-xs font-bold text-slate-900">
                    Monthly Compensation &amp; Payroll Profile
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Base Salary</span>
                    <span className="font-mono-tabular font-semibold">
                      {formatNgn(viewingStaffDetail.monthlyBaseSalaryNgn)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Allowance</span>
                    <span className="font-mono-tabular font-semibold">
                      {formatNgn(viewingStaffDetail.monthlyAllowanceNgn)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5">
                    <span className="text-slate-600">Gross Monthly</span>
                    <span className="font-mono-tabular font-bold">{formatNgn(gross)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Pension (8%) + PAYE (9%)</span>
                    <span className="font-mono-tabular">-{formatNgn(pension + paye)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-emerald-700">
                    <span>Estimated Net Take-Home</span>
                    <span className="font-mono-tabular">{formatNgn(net)}</span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-xs font-bold text-slate-900">
                      Portal User Account &amp; Privileges
                    </h4>
                    {detailRow?.linkedAccount && isAdminManager && (
                      <button
                        type="button"
                        onClick={() => {
                          const acc = detailRow.linkedAccount!;
                          setViewingStaffDetail(null);
                          openEditUserModal(acc);
                        }}
                        className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Edit Role/Privileges
                      </button>
                    )}
                  </div>
                  {detailRow?.linkedAccount ? (
                    <>
                      <p className="font-mono-tabular text-slate-700">
                        {detailRow.linkedAccount.email}
                      </p>
                      <p>
                        Role:{' '}
                        <span className="font-semibold text-slate-900">
                          {ASSIGNABLE_ROLE_LABELS[detailRow.linkedAccount.role]}
                        </span>{' '}
                        · {detailRow.linkedAccount.active ? 'Active' : 'Unassigned / Paused'}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {detailRow.linkedAccount.privileges.map((priv) => (
                          <span
                            key={priv}
                            className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]"
                          >
                            {PROPERTY_PRIVILEGE_OPTIONS.find((o) => o.id === priv)?.label || priv}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-500">
                      No portal login linked to this staff record yet. Create an account under User
                      Accounts, Roles &amp; Privileges to grant PMS access.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 space-y-2 max-h-48 overflow-y-auto">
                  <h4 className="font-display text-xs font-bold text-slate-900">
                    Recent Shifts &amp; Handover Logs ({detailRow?.staffShifts.length ?? 0})
                  </h4>
                  {(detailRow?.staffShifts || []).slice(0, 6).map((sh) => (
                    <div key={sh.id} className="border-b border-slate-100 pb-1.5">
                      <p className="font-semibold text-slate-800">
                        {sh.shiftDate} · {sh.shiftWindow} ({sh.status})
                      </p>
                      {sh.handoverNotes && (
                        <p className="text-[11px] text-slate-500 italic">{sh.handoverNotes}</p>
                      )}
                    </div>
                  ))}
                  {(detailRow?.staffShifts.length ?? 0) === 0 && (
                    <p className="text-slate-500">No shifts recorded for this staff member yet.</p>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-4 space-y-2 max-h-48 overflow-y-auto">
                  <h4 className="font-display text-xs font-bold text-slate-900">
                    Recent Attendance &amp; Assigned Tasks
                  </h4>
                  {(detailRow?.staffAtt || []).slice(0, 4).map((att) => (
                    <div key={att.id} className="border-b border-slate-100 pb-1">
                      <p className="font-mono-tabular text-slate-800">
                        {att.date} · In {att.clockInTime}
                        {att.clockOutTime ? ` · Out ${att.clockOutTime}` : ''} ({att.status})
                      </p>
                    </div>
                  ))}
                  {(detailRow?.assignedHk || []).slice(0, 3).map((t) => (
                    <div key={t.id} className="border-b border-slate-100 pb-1">
                      <p className="text-slate-700">
                        Housekeeping {t.roomNumber}: {t.taskType} ({t.status})
                      </p>
                    </div>
                  ))}
                  {(detailRow?.assignedMnt || []).slice(0, 3).map((m) => (
                    <div key={m.id} className="border-b border-slate-100 pb-1">
                      <p className="text-slate-700">
                        Maintenance {m.locationLabel}: {m.issueTitle} ({m.status})
                      </p>
                    </div>
                  ))}
                  {(detailRow?.staffAtt.length ?? 0) === 0 &&
                    (detailRow?.totalTasks ?? 0) === 0 && (
                      <p className="text-slate-500">No attendance or task activity recorded yet.</p>
                    )}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setViewingStaffDetail(null)}
                  className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Close Record
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Share Login Details via Email Modal (Property Admin) */}
      {notifyAccTarget && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleShareAccDetailsViaEmail}
            className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 text-xs my-8 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Share Login Details via Email — {notifyAccTarget.fullName}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Recipient: <strong className="font-mono-tabular text-slate-700">{notifyAccTarget.email}</strong> · {ASSIGNABLE_ROLE_LABELS[notifyAccTarget.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifyAccTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block font-semibold text-slate-700">
                Choose Login Portal Link
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleNotifyAccPortalSwitch('staff')}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${
                    notifyAccPortal === 'staff'
                      ? 'border-[#0a367a] bg-emerald-50 text-[#0a367a]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">Staff Portal (/login)</p>
                  <p className="font-mono-tabular text-[10px] truncate mt-0.5">{staffLoginUrl}</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleNotifyAccPortalSwitch('richgates-admin')}
                  className={`p-3 rounded-xl border text-left cursor-pointer ${
                    notifyAccPortal === 'richgates-admin'
                      ? 'border-[#0a367a] bg-emerald-50 text-[#0a367a]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">Property Admin (/admin)</p>
                  <p className="font-mono-tabular text-[10px] truncate mt-0.5">{adminLoginUrl}</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email Subject
              </label>
              <input
                type="text"
                required
                value={notifyAccSubject}
                onChange={(e) => setNotifyAccSubject(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email Body &amp; Login Details
              </label>
              <textarea
                rows={7}
                required
                value={notifyAccBody}
                onChange={(e) => setNotifyAccBody(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-sans leading-relaxed"
              />
            </div>

            {notifyAccFeedback && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{notifyAccFeedback}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${notifyAccSubject}\n\n${notifyAccBody}`);
                    onNotify(`Copied email details for ${notifyAccTarget.fullName}`);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Email</span>
                </button>

                {onSendPasswordSetupEmail && (
                  <button
                    type="button"
                    disabled={notifyAccResetBusy}
                    onClick={handleSendAccPasswordSetup}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg font-semibold cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{notifyAccResetBusy ? 'Sending...' : 'Send Password Setup Email'}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNotifyAccTarget(null)}
                  className="px-3.5 py-2 text-slate-600 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={notifyAccBusy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0a367a] hover:bg-[#07275a] disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{notifyAccBusy ? 'Sharing...' : 'Share Details via Email'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
