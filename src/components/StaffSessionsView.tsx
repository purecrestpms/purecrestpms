import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Mail,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { sendPropertyMessageWorkflow } from '../services/pmsService';
import {
  ASSIGNABLE_ROLE_LABELS,
  AssignablePropertyRole,
  getConnectedRootDomain,
  getPortalUrl,
  getPropertySubdomainSlug,
  NavSectionId,
  PropertyRecord,
  PropertyUserAccountRecord,
  ROLE_LABELS,
  StaffMemberRecord,
  StaffRole,
  StaffSessionRecord,
} from '../types/pms';

interface StaffSessionsViewProps {
  property: PropertyRecord;
  activeRole: StaffRole;
  userAccounts: PropertyUserAccountRecord[];
  staffSessions: StaffSessionRecord[];
  staffMembers: StaffMemberRecord[];
  currentUserEmail: string;
  currentUserName: string;
  actorRole: string;
  onNotify: (msg: string) => void;
  onNavigateSection?: (section: NavSectionId) => void;
  onSendPasswordSetupEmail?: (email: string) => Promise<void>;
}

type SessionFilter = 'all' | 'logged_in' | 'logged_out' | 'never' | 'admins' | 'staff';

interface CombinedMonitorRow {
  key: string;
  fullName: string;
  email: string;
  department: string;
  assignedRole: AssignablePropertyRole | 'pch_admin';
  accountActive: boolean;
  hasAccount: boolean;
  session: StaffSessionRecord | null;
  status: 'logged_in' | 'logged_out' | 'never';
}

function formatDateTimeShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRoleLabel(role: AssignablePropertyRole | 'pch_admin'): string {
  if (role === 'pch_admin') return ROLE_LABELS.pch_admin;
  return ASSIGNABLE_ROLE_LABELS[role] || role;
}

export const StaffSessionsView: React.FC<StaffSessionsViewProps> = ({
  property,
  activeRole,
  userAccounts,
  staffSessions,
  staffMembers,
  currentUserEmail,
  currentUserName,
  actorRole,
  onNotify,
  onNavigateSection,
  onSendPasswordSetupEmail,
}) => {
  const isAdminManager = activeRole === 'property_admin' || activeRole === 'pch_admin';
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Notification & Login Link Modal state
  const [notifyTarget, setNotifyTarget] = useState<{
    mode: 'single' | 'broadcast';
    fullName: string;
    email: string;
    roleLabel: string;
    defaultPortal: 'staff' | 'richgates-admin';
  } | null>(null);
  const [selectedPortalLink, setSelectedPortalLink] = useState<'staff' | 'richgates-admin'>('staff');
  const [notifySubject, setNotifySubject] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyPriority, setNotifyPriority] = useState<'Normal' | 'Urgent'>('Normal');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);

  const rootDomain = getConnectedRootDomain();
  const slug = getPropertySubdomainSlug(property);
  const staffDirectUrl = getPortalUrl('staff', property);
  const adminDirectUrl = getPortalUrl('richgates-admin', property);
  const staffSubdomainUrl = `https://${slug}.${rootDomain}/staff`;
  const adminSubdomainUrl = `https://${slug}.${rootDomain}`;

  const portalLinks = [
    {
      id: 'staff-login',
      title: 'Staff Operations Login (/login)',
      subtitle: 'Front Desk, Housekeeping, Kitchen POS, Accounts & Maintenance employees',
      primaryUrl: staffDirectUrl,
      subdomainUrl: staffSubdomainUrl,
      portal: 'staff' as const,
    },
    {
      id: 'admin-login',
      title: 'Property Admin Login (/admin)',
      subtitle: 'General Managers & Property Administrators',
      primaryUrl: adminDirectUrl,
      subdomainUrl: adminSubdomainUrl,
      portal: 'richgates-admin' as const,
    },
  ];

  const handleCopyUrl = async (id: string, url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(id);
      onNotify(`Copied ${label}: ${url}`);
      setTimeout(() => setCopiedLinkId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      onNotify('Unable to copy link automatically. Select and copy manually.');
    }
  };

  const openNotifyModalForEmployee = (row: CombinedMonitorRow) => {
    const portalChoice: 'staff' | 'richgates-admin' =
      row.assignedRole === 'property_admin' || row.assignedRole === 'pch_admin'
        ? 'richgates-admin'
        : 'staff';
    const loginUrl = portalChoice === 'richgates-admin' ? adminDirectUrl : staffDirectUrl;
    const roleTitle = formatRoleLabel(row.assignedRole);

    setNotifyTarget({
      mode: 'single',
      fullName: row.fullName,
      email: row.email,
      roleLabel: roleTitle,
      defaultPortal: portalChoice,
    });
    setSelectedPortalLink(portalChoice);
    setNotifySubject(`Your ${property.name} Portal Login Link & Assigned Role`);
    setNotifyBody(
      `Hello ${row.fullName},\n\nYour assigned role at ${property.name} is: ${roleTitle}.\nPlease sign in using the portal link below:\n${loginUrl}\n\nYour sign-in email: ${row.email}`
    );
    setNotifyPriority('Normal');
    setModalFeedback(null);
  };

  const openBroadcastModal = () => {
    setNotifyTarget({
      mode: 'broadcast',
      fullName: 'All Property Staff & Operators',
      email: '',
      roleLabel: 'All Assigned Roles',
      defaultPortal: 'staff',
    });
    setSelectedPortalLink('staff');
    setNotifySubject(`${property.name} — Staff Workspace Login Link (/login)`);
    setNotifyBody(
      `Hello Team,\n\nPlease use the official Staff Portal link below to sign in for your shift and check your assigned modules:\n${staffDirectUrl}\n\nAdministrators sign in via:\n${adminDirectUrl}`
    );
    setNotifyPriority('Normal');
    setModalFeedback(null);
  };

  const handleSwitchModalPortalLink = (portal: 'staff' | 'richgates-admin') => {
    setSelectedPortalLink(portal);
    if (!notifyTarget) return;
    const nextUrl = portal === 'richgates-admin' ? adminDirectUrl : staffDirectUrl;
    if (notifyTarget.mode === 'single') {
      setNotifyBody(
        `Hello ${notifyTarget.fullName},\n\nYour assigned role at ${property.name} is: ${notifyTarget.roleLabel}.\nPlease sign in using the ${portal === 'richgates-admin' ? 'Property Admin' : 'Staff'} portal link below:\n${nextUrl}\n\nYour sign-in email: ${notifyTarget.email}`
      );
    } else {
      setNotifyBody(
        `Hello Team,\n\nPlease use the ${portal === 'richgates-admin' ? 'Property Admin (/admin)' : 'Staff Login (/login)'} link below to access ${property.name}:\n${nextUrl}`
      );
    }
  };

  const handleSendInAppNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyTarget) return;
    setSendingNotification(true);
    setModalFeedback(null);
    try {
      const targetEmails =
        notifyTarget.mode === 'single'
          ? [notifyTarget.email.trim().toLowerCase()]
          : Array.from(
              new Set([
                ...userAccounts.map((a) => a.email.trim().toLowerCase()),
                ...staffMembers.map((s) => (s.email || '').trim().toLowerCase()),
              ].filter(Boolean))
            );

      await sendPropertyMessageWorkflow({
        property,
        senderName: currentUserName || 'Property Admin',
        senderRole: actorRole,
        senderDepartment: 'Management',
        recipientScope: notifyTarget.mode === 'single' ? 'direct_staff' : 'all_staff',
        recipientEmails: targetEmails,
        recipientNames:
          notifyTarget.mode === 'single' ? [notifyTarget.fullName] : ['All Property Staff'],
        subject: notifySubject.trim() || `${property.name} Login Link`,
        body: notifyBody.trim(),
        priority: notifyPriority,
      });

      const confirmation =
        notifyTarget.mode === 'single'
          ? `Sent in-app notification & login link to ${notifyTarget.fullName} (${notifyTarget.email}).`
          : `Broadcasted login link notification to all staff (${targetEmails.length} email(s)).`;
      setModalFeedback(confirmation);
      onNotify(confirmation);
    } catch (err) {
      setModalFeedback(err instanceof Error ? err.message : 'Unable to send notification.');
    } finally {
      setSendingNotification(false);
    }
  };

  const handleSendPasswordLink = async () => {
    if (!notifyTarget || notifyTarget.mode !== 'single' || !onSendPasswordSetupEmail) return;
    setSendingReset(true);
    setModalFeedback(null);
    try {
      await onSendPasswordSetupEmail(notifyTarget.email);
      setModalFeedback(
        `Password setup / reset email sent to ${notifyTarget.email}. They can use it to create or update their password, then open the login link.`
      );
    } catch (err) {
      setModalFeedback(
        err instanceof Error ? err.message : 'Unable to send password setup email.'
      );
    } finally {
      setSendingReset(false);
    }
  };

  const monitorRows = useMemo<CombinedMonitorRow[]>(() => {
    const sessionsByEmail = new Map<string, StaffSessionRecord>();
    for (const s of staffSessions) {
      const em = (s.email || '').trim().toLowerCase();
      if (!em) continue;
      const existing = sessionsByEmail.get(em);
      if (!existing || (s.lastActiveIso || '') > (existing.lastActiveIso || '')) {
        sessionsByEmail.set(em, s);
      }
    }

    const rows: CombinedMonitorRow[] = [];
    const coveredEmails = new Set<string>();

    for (const acc of userAccounts) {
      const em = acc.email.trim().toLowerCase();
      coveredEmails.add(em);
      const sess = sessionsByEmail.get(em) || null;
      rows.push({
        key: `acc-${acc.id}`,
        fullName: acc.fullName,
        email: acc.email,
        department: acc.department,
        assignedRole: acc.role,
        accountActive: acc.active && acc.role !== 'unassigned',
        hasAccount: true,
        session: sess,
        status: sess ? sess.status : 'never',
      });
    }

    for (const sess of staffSessions) {
      const em = (sess.email || '').trim().toLowerCase();
      if (!em || coveredEmails.has(em)) continue;
      coveredEmails.add(em);
      rows.push({
        key: `sess-${sess.id}`,
        fullName: sess.fullName,
        email: sess.email,
        department: sess.department || 'Management',
        assignedRole: sess.assignedRole,
        accountActive: sess.assignedRole !== 'unassigned',
        hasAccount: false,
        session: sess,
        status: sess.status,
      });
    }

    const orderWeight: Record<CombinedMonitorRow['status'], number> = {
      logged_in: 0,
      logged_out: 1,
      never: 2,
    };

    return rows.sort((a, b) => {
      const wDiff = orderWeight[a.status] - orderWeight[b.status];
      if (wDiff !== 0) return wDiff;
      const aTime = a.session?.lastActiveIso || '';
      const bTime = b.session?.lastActiveIso || '';
      if (aTime !== bTime) return bTime.localeCompare(aTime);
      return a.fullName.localeCompare(b.fullName);
    });
  }, [userAccounts, staffSessions]);

  const counts = useMemo(() => {
    const loggedIn = monitorRows.filter((r) => r.status === 'logged_in').length;
    const loggedOut = monitorRows.filter((r) => r.status === 'logged_out').length;
    const never = monitorRows.filter((r) => r.status === 'never').length;
    const admins = monitorRows.filter(
      (r) => r.assignedRole === 'property_admin' || r.assignedRole === 'pch_admin'
    ).length;
    const staff = monitorRows.filter(
      (r) =>
        r.assignedRole !== 'property_admin' &&
        r.assignedRole !== 'pch_admin' &&
        r.assignedRole !== 'unassigned'
    ).length;
    return {
      total: monitorRows.length,
      loggedIn,
      loggedOut,
      never,
      admins,
      staff,
    };
  }, [monitorRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return monitorRows.filter((row) => {
      if (filter === 'logged_in' && row.status !== 'logged_in') return false;
      if (filter === 'logged_out' && row.status !== 'logged_out') return false;
      if (filter === 'never' && row.status !== 'never') return false;
      if (
        filter === 'admins' &&
        row.assignedRole !== 'property_admin' &&
        row.assignedRole !== 'pch_admin'
      ) {
        return false;
      }
      if (
        filter === 'staff' &&
        (row.assignedRole === 'property_admin' ||
          row.assignedRole === 'pch_admin' ||
          row.assignedRole === 'unassigned')
      ) {
        return false;
      }
      if (q) {
        const hay =
          `${row.fullName} ${row.email} ${row.department} ${formatRoleLabel(row.assignedRole)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [monitorRows, filter, searchQuery]);

  if (!isAdminManager) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 text-[#061539] mx-auto" />
        <h2 className="font-display text-base font-bold text-slate-900">
          Administrator Access Required
        </h2>
        <p className="text-xs text-slate-500">
          Only Property Administrators can monitor employee login sessions and portal links.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Employee Login Monitor &amp; Portal Links
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track live logged-in employees, logout activity, assigned roles, and share direct Staff (/login) or Admin (/admin) sign-in links for {property.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {onNavigateSection && (
            <button
              type="button"
              onClick={() => onNavigateSection('user_management')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Manage Users &amp; Roles</span>
            </button>
          )}
          <button
            type="button"
            onClick={openBroadcastModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold bg-[#061539] hover:bg-[#0c2b70] text-white rounded-lg cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-amber-300" />
            <span>Broadcast Login Link</span>
          </button>
        </div>
      </div>

      {/* Property Login Links ("Bring Links") Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#1c46be]" />
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Property Login Links ({property.name})
              </h2>
              <p className="text-[11px] text-slate-500">
                Copy or send the exact sign-in link to staff employees (/login) or property admins (/admin).
              </p>
            </div>
          </div>
          <span className="font-mono-tabular text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
            Host Slug: {slug}.{rootDomain}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {portalLinks.map((item) => (
            <div
              key={item.id}
              className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-sm font-bold text-[#061539]">{item.title}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{item.subtitle}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    item.portal === 'staff'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-[#061539]'
                  }`}
                >
                  {item.portal === 'staff' ? '/login' : '/admin'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">
                      Active Portal Link
                    </p>
                    <p className="font-mono-tabular text-xs font-semibold text-slate-900 truncate">
                      {item.primaryUrl}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(`${item.id}-primary`, item.primaryUrl, item.title)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedLinkId === `${item.id}-primary` ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-300" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>

                {item.subdomainUrl !== item.primaryUrl && (
                  <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">
                        Custom Subdomain Link
                      </p>
                      <p className="font-mono-tabular text-xs text-slate-700 truncate">
                        {item.subdomainUrl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyUrl(`${item.id}-sub`, item.subdomainUrl, `${item.title} Subdomain`)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      {copiedLinkId === `${item.id}-sub` ? (
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
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4 Live Session KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Currently Logged In</span>
            <LogIn className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
            {counts.loggedIn}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Active sessions online now</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Logged Out</span>
            <LogOut className="w-4 h-4 text-slate-500" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
            {counts.loggedOut}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Recorded sign-outs</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Assigned Staff / Admins</span>
            <ShieldCheck className="w-4 h-4 text-[#1c46be]" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-[#061539] mt-1">
            {counts.staff + counts.admins}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {counts.admins} admin · {counts.staff} department staff
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Not Signed In Yet</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-amber-700 mt-1">
            {counts.never}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Pending first login activity</p>
        </div>
      </div>

      {/* Employee Session Monitor Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1c46be]" />
            <h2 className="font-display text-sm font-bold text-slate-900">
              Live Employee Login / Logout &amp; Role Monitor ({filteredRows.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee, email, role..."
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1c46be]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'all', label: `All (${counts.total})` },
                  { id: 'logged_in', label: `Logged In (${counts.loggedIn})` },
                  { id: 'logged_out', label: `Logged Out (${counts.loggedOut})` },
                  { id: 'never', label: `Pending (${counts.never})` },
                  { id: 'staff', label: `Staff (${counts.staff})` },
                  { id: 'admins', label: `Admins (${counts.admins})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium cursor-pointer ${
                    filter === tab.id
                      ? 'bg-[#061539] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Assigned Role &amp; Department</th>
                <th className="py-3 px-4">Session Status</th>
                <th className="py-3 px-4">Active Portal</th>
                <th className="py-3 px-4">Last Login &amp; Activity</th>
                <th className="py-3 px-4">Logout Time</th>
                <th className="py-3 px-4 text-right">Notify &amp; Login Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.map((row) => {
                const isSelf = row.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
                return (
                  <tr key={row.key} className="hover:bg-slate-50 align-top">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900">{row.fullName}</p>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1c46be] text-[10px] font-bold">
                            You
                          </span>
                        )}
                      </div>
                      <p className="font-mono-tabular text-[11px] text-slate-500">{row.email}</p>
                      {row.session?.userAgentLabel && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Device: {row.session.userAgentLabel}
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          row.assignedRole === 'unassigned'
                            ? 'bg-amber-100 text-amber-800'
                            : row.assignedRole === 'property_admin' ||
                                row.assignedRole === 'pch_admin'
                              ? 'bg-blue-50 text-[#061539]'
                              : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {formatRoleLabel(row.assignedRole)}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1">{row.department}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      {row.status === 'logged_in' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Logged In</span>
                        </span>
                      ) : row.status === 'logged_out' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[11px]">
                          <LogOut className="w-3 h-3 text-slate-500" />
                          <span>Logged Out</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px]">
                          <Clock className="w-3 h-3" />
                          <span>Not Logged In Yet</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {row.session ? (
                        <span className="font-mono-tabular text-[11px] font-medium text-slate-700">
                          {row.session.portal === 'staff'
                            ? '/login (Staff)'
                            : row.session.portal === 'richgates-admin'
                              ? '/admin (Admin)'
                              : '/pch-admin (Group)'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono-tabular text-[11px] text-slate-700">
                      {row.session ? (
                        <div className="space-y-0.5">
                          <p>
                            <span className="text-slate-400">In:</span>{' '}
                            {formatDateTimeShort(row.session.loginAtIso)}
                          </p>
                          <p className="text-slate-500">
                            <span className="text-slate-400">Seen:</span>{' '}
                            {formatDateTimeShort(row.session.lastActiveIso)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400">No login recorded</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono-tabular text-[11px] text-slate-700">
                      {row.status === 'logged_out' && row.session?.loggedOutAtIso ? (
                        <span className="text-slate-800 font-medium">
                          {formatDateTimeShort(row.session.loggedOutAtIso)}
                        </span>
                      ) : row.status === 'logged_in' ? (
                        <span className="text-emerald-700 font-medium">Active session</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openNotifyModalForEmployee(row)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#061539] font-semibold cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Link &amp; Notify</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    No employees match the selected session filter yet. Create user accounts under User Management or share the Staff Login link above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send Notification & Login Link Modal */}
      {notifyTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSendInAppNotification}
            className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4 text-xs my-8 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {notifyTarget.mode === 'single'
                    ? `Send Notification & Login Link — ${notifyTarget.fullName}`
                    : 'Broadcast Login Link Notification to All Staff'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {notifyTarget.mode === 'single'
                    ? `${notifyTarget.email} · Assigned Role: ${notifyTarget.roleLabel}`
                    : `All staff and operators in ${property.name}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifyTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block font-semibold text-slate-700">
                Choose Login Portal Link to Include
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSwitchModalPortalLink('staff')}
                  className={`p-3 rounded-lg border text-left cursor-pointer ${
                    selectedPortalLink === 'staff'
                      ? 'border-[#061539] bg-blue-50 text-[#061539]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">Staff Portal (/login)</p>
                  <p className="font-mono-tabular text-[10px] truncate mt-0.5">{staffDirectUrl}</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchModalPortalLink('richgates-admin')}
                  className={`p-3 rounded-lg border text-left cursor-pointer ${
                    selectedPortalLink === 'richgates-admin'
                      ? 'border-[#061539] bg-blue-50 text-[#061539]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">Property Admin (/admin)</p>
                  <p className="font-mono-tabular text-[10px] truncate mt-0.5">{adminDirectUrl}</p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Notification Subject
                </label>
                <input
                  type="text"
                  required
                  value={notifySubject}
                  onChange={(e) => setNotifySubject(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={notifyPriority}
                  onChange={(e) => setNotifyPriority(e.target.value as 'Normal' | 'Urgent')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Normal">Normal</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Message &amp; Login Link
              </label>
              <textarea
                rows={5}
                required
                value={notifyBody}
                onChange={(e) => setNotifyBody(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-sans leading-relaxed"
              />
            </div>

            {modalFeedback && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{modalFeedback}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyUrl(
                      'modal-copy',
                      selectedPortalLink === 'richgates-admin' ? adminDirectUrl : staffDirectUrl,
                      'Login Link'
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </button>

                {notifyTarget.mode === 'single' && (
                  <>
                    <a
                      href={`mailto:${encodeURIComponent(notifyTarget.email)}?subject=${encodeURIComponent(
                        notifySubject
                      )}&body=${encodeURIComponent(notifyBody)}`}
                      className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Draft</span>
                    </a>

                    {onSendPasswordSetupEmail && (
                      <button
                        type="button"
                        disabled={sendingReset}
                        onClick={handleSendPasswordLink}
                        className="inline-flex items-center gap-1 px-3 py-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg font-semibold cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{sendingReset ? 'Sending...' : 'Send Password Setup Email'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNotifyTarget(null)}
                  className="px-3.5 py-2 text-slate-600 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={sendingNotification}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#061539] hover:bg-[#0c2b70] disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {sendingNotification ? 'Sending...' : 'Send In-App Notification'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
