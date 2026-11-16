import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCheck,
  Inbox,
  Mail,
  Megaphone,
  Reply,
  Search,
  Send,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  markAllMessagesReadWorkflow,
  markMessageReadWorkflow,
  sendPropertyMessageWorkflow,
} from '../services/pmsService';
import {
  ALL_DEPARTMENTS,
  DepartmentName,
  MessageRecipientScope,
  PropertyMessageRecord,
  PropertyRecord,
  ROLE_LABELS,
  ROLE_TO_DEPARTMENT,
  StaffMemberRecord,
  StaffRole,
} from '../types/pms';

interface DepartmentMessagingViewProps {
  property: PropertyRecord;
  messages: PropertyMessageRecord[];
  staffMembers: StaffMemberRecord[];
  activeRole: StaffRole;
  userEmail: string;
  userName: string;
  onNotify: (msg: string) => void;
}

type MessageFolder = 'inbox' | 'unread' | 'all' | 'sent';

export function isMessageForOperator(
  msg: PropertyMessageRecord,
  activeRole: StaffRole,
  userEmail: string
): boolean {
  const emailLower = userEmail.trim().toLowerCase();
  const userDept = ROLE_TO_DEPARTMENT[activeRole];
  const isAdmin = activeRole === 'pch_admin' || activeRole === 'property_admin';
  if (msg.recipientScope === 'all_staff') return true;
  if (msg.recipientScope === 'department') {
    if (isAdmin && (msg.targetDepartment === 'Management' || msg.targetDepartment === 'All Departments')) {
      return true;
    }
    return msg.targetDepartment === userDept;
  }
  if (msg.recipientEmails.some((e) => e.toLowerCase() === emailLower)) return true;
  if (isAdmin && msg.targetDepartment === 'Management') return true;
  return false;
}

export function isMessageUnreadForUser(
  msg: PropertyMessageRecord,
  activeRole: StaffRole,
  userEmail: string
): boolean {
  const emailLower = userEmail.trim().toLowerCase();
  if (!emailLower) return false;
  if (msg.senderEmail.toLowerCase() === emailLower) return false;
  if (msg.readByEmails.some((e) => e.toLowerCase() === emailLower)) return false;
  if (activeRole === 'pch_admin' || activeRole === 'property_admin') return true;
  return isMessageForOperator(msg, activeRole, userEmail);
}

export const DepartmentMessagingView: React.FC<DepartmentMessagingViewProps> = ({
  property,
  messages,
  staffMembers,
  activeRole,
  userEmail,
  userName,
  onNotify,
}) => {
  const { cms } = useCms();
  const isAdmin = activeRole === 'pch_admin' || activeRole === 'property_admin';
  const myDepartment = ROLE_TO_DEPARTMENT[activeRole];
  const myEmailLower = userEmail.trim().toLowerCase();

  const [folder, setFolder] = useState<MessageFolder>('inbox');
  const [deptFilter, setDeptFilter] = useState<'ALL' | string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [showComposeModal, setShowComposeModal] = useState(false);

  // Compose state
  const [scope, setScope] = useState<MessageRecipientScope>('department');
  const [targetDept, setTargetDept] = useState<DepartmentName>('Front Desk');
  const [directStaffId, setDirectStaffId] = useState<string>(staffMembers[0]?.id || '');
  const [bulkSelectedStaffIds, setBulkSelectedStaffIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<'Normal' | 'Urgent'>('Normal');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [messages]
  );

  const unreadList = useMemo(
    () => sortedMessages.filter((m) => isMessageUnreadForUser(m, activeRole, userEmail)),
    [sortedMessages, activeRole, userEmail]
  );

  const inboxList = useMemo(
    () =>
      sortedMessages.filter(
        (m) => isAdmin || isMessageForOperator(m, activeRole, userEmail) || m.senderEmail.toLowerCase() === myEmailLower
      ),
    [sortedMessages, isAdmin, activeRole, userEmail, myEmailLower]
  );

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base =
      folder === 'unread'
        ? unreadList
        : folder === 'sent'
          ? sortedMessages.filter((m) => m.senderEmail.toLowerCase() === myEmailLower)
          : folder === 'all'
            ? sortedMessages
            : inboxList;

    return base.filter((m) => {
      if (deptFilter !== 'ALL') {
        const matchesDept =
          m.senderDepartment === deptFilter || m.targetDepartment === deptFilter;
        if (!matchesDept) return false;
      }
      if (!q) return true;
      return (
        m.subject.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q) ||
        m.senderDepartment.toLowerCase().includes(q) ||
        (m.targetDepartment || '').toLowerCase().includes(q) ||
        m.recipientNames.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [folder, unreadList, sortedMessages, inboxList, deptFilter, searchQuery, myEmailLower]);

  const activeMessage = useMemo(() => {
    if (selectedMessageId) {
      const found = sortedMessages.find((m) => m.id === selectedMessageId);
      if (found) return found;
    }
    return filteredMessages[0] || null;
  }, [selectedMessageId, sortedMessages, filteredMessages]);

  const handleSelectMessage = async (msg: PropertyMessageRecord) => {
    setSelectedMessageId(msg.id);
    if (isMessageUnreadForUser(msg, activeRole, userEmail)) {
      await markMessageReadWorkflow({ property, message: msg, readerEmail: userEmail });
    }
  };

  const openNewCompose = (preset?: {
    scope?: MessageRecipientScope;
    dept?: DepartmentName;
    subject?: string;
  }) => {
    setComposeError(null);
    setScope(preset?.scope || 'department');
    setTargetDept(preset?.dept || (myDepartment === 'Front Desk' ? 'Housekeeping' : 'Front Desk'));
    setDirectStaffId(staffMembers[0]?.id || '');
    setBulkSelectedStaffIds([]);
    setPriority('Normal');
    setSubject(preset?.subject || '');
    setBody('');
    setShowComposeModal(true);
  };

  const toggleBulkStaff = (id: string) => {
    setBulkSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectBulkByDept = (dept: DepartmentName) => {
    const ids = staffMembers.filter((s) => s.department === dept).map((s) => s.id);
    setBulkSelectedStaffIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeError(null);
    if (subject.trim().length < 2) {
      setComposeError('Please enter a subject (at least 2 characters).');
      return;
    }
    if (!body.trim()) {
      setComposeError('Please write a message body before sending.');
      return;
    }

    let recipientEmails: string[] = [];
    let recipientNames: string[] = [];
    let targetDepartmentValue: string | undefined;

    if (scope === 'department') {
      targetDepartmentValue = targetDept;
      const deptStaff = staffMembers.filter((s) => s.department === targetDept);
      recipientEmails = deptStaff.map((s) => s.email || '').filter(Boolean);
      recipientNames = [targetDept];
    } else if (scope === 'direct_staff') {
      const picked = staffMembers.find((s) => s.id === directStaffId);
      if (!picked) {
        setComposeError('Please select a staff member to message.');
        return;
      }
      recipientEmails = picked.email ? [picked.email] : [];
      recipientNames = [`${picked.fullName} (${picked.department})`];
      targetDepartmentValue = picked.department;
    } else if (scope === 'bulk_staff') {
      const pickedStaff = staffMembers.filter((s) => bulkSelectedStaffIds.includes(s.id));
      if (pickedStaff.length === 0) {
        setComposeError('Select at least one staff member for your bulk message.');
        return;
      }
      recipientEmails = pickedStaff.map((s) => s.email || '').filter(Boolean);
      recipientNames = pickedStaff.map((s) => s.fullName);
      targetDepartmentValue = `Bulk (${pickedStaff.length} Staff)`;
    } else if (scope === 'all_staff') {
      targetDepartmentValue = 'All Departments';
      recipientEmails = Array.from(
        new Set([
          ...property.authorizedEmails,
          ...staffMembers.map((s) => s.email || '').filter(Boolean),
        ])
      );
      recipientNames = [`All Staff (${staffMembers.length} Employees)`];
    }

    setSending(true);
    try {
      await sendPropertyMessageWorkflow({
        property,
        senderName: userName,
        senderRole: ROLE_LABELS[activeRole],
        senderDepartment: myDepartment,
        recipientScope: scope,
        targetDepartment: targetDepartmentValue,
        recipientEmails,
        recipientNames,
        subject: subject.trim(),
        body: body.trim(),
        priority,
      });
      onNotify(
        scope === 'bulk_staff'
          ? `Sent bulk message to ${recipientNames.length} staff members`
          : scope === 'all_staff'
            ? 'Broadcast sent to all property staff'
            : `Message sent to ${recipientNames[0] || targetDepartmentValue}`
      );
      setShowComposeModal(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {cms.pages.messages?.title || 'Inter-Departmental Messaging & Staff Broadcasts'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages.messages?.subtitle ||
              'Send direct department handovers, urgent operational alerts, and bulk messages to staff across all Richgates teams.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {unreadList.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                await markAllMessagesReadWorkflow({
                  property,
                  messages: unreadList,
                  readerEmail: userEmail,
                });
                onNotify(`Marked ${unreadList.length} message alerts as read`);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Mark All Read ({unreadList.length})</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => openNewCompose({ scope: 'bulk_staff' })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Bulk Message Staff</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openNewCompose()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{cms.pages.messages?.ctaLabel || 'New Message'}</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500">Unread Alerts</p>
          <p className="font-mono-tabular text-xl font-bold text-rose-700 mt-0.5 flex items-center gap-2">
            <span>{unreadList.length}</span>
            {unreadList.length > 0 && <BellRing className="w-4 h-4 text-rose-600" />}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500">My Department ({myDepartment})</p>
          <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-0.5">
            {inboxList.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500">Urgent Dispatches</p>
          <p className="font-mono-tabular text-xl font-bold text-amber-700 mt-0.5">
            {sortedMessages.filter((m) => m.priority === 'Urgent').length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500">Active Staff Roster</p>
          <p className="font-mono-tabular text-xl font-bold text-emerald-700 mt-0.5">
            {staffMembers.filter((s) => s.employmentStatus === 'active').length}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'inbox', label: 'Inbox' },
              { id: 'unread', label: `Unread Alerts (${unreadList.length})` },
              { id: 'all', label: 'All Departments' },
              { id: 'sent', label: 'Sent by Me' },
            ] as Array<{ id: MessageFolder; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFolder(tab.id)}
              className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                folder === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="ALL">All Departments</option>
            {ALL_DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, staff, dept..."
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* Master-Detail Inbox Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Thread List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <Inbox className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">No messages in this view</p>
              <p>Send a message to any department or staff member to coordinate operations.</p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const unread = isMessageUnreadForUser(msg, activeRole, userEmail);
              const selected = activeMessage?.id === msg.id;
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => handleSelectMessage(msg)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer space-y-1.5 ${
                    selected
                      ? 'bg-emerald-50/60'
                      : unread
                        ? 'bg-amber-50/40 hover:bg-slate-50'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-700 truncate">
                      {msg.senderName}{' '}
                      <span className="font-normal text-slate-500">({msg.senderDepartment})</span>
                    </span>
                    <span className="font-mono-tabular text-slate-400 shrink-0">
                      {msg.createdAtIso.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-xs truncate ${
                        unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                      }`}
                    >
                      {msg.subject}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {msg.priority === 'Urgent' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Urgent</span>
                        </span>
                      )}
                      {unread && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                          New
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2">{msg.body}</p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span className="truncate">
                      To:{' '}
                      <strong className="text-slate-700">
                        {msg.targetDepartment || msg.recipientNames.join(', ') || 'Property Team'}
                      </strong>
                    </span>
                    <span className="font-mono-tabular shrink-0">
                      Read by {msg.readByEmails.length}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Message Reader Pane */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between min-h-[420px]">
          {!activeMessage ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-500 space-y-2 py-12">
              <Mail className="w-8 h-8 text-slate-300" />
              <p className="font-semibold text-slate-700">Select a message to read</p>
              <p>Or click New Message to dispatch an update across Richgates departments.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {activeMessage.priority === 'Urgent' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Urgent Alert</span>
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                      {activeMessage.recipientScope === 'all_staff'
                        ? 'All Staff Broadcast'
                        : activeMessage.recipientScope === 'bulk_staff'
                          ? 'Bulk Staff Message'
                          : activeMessage.recipientScope === 'direct_staff'
                            ? 'Direct Staff Message'
                            : 'Department Notice'}
                    </span>
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {activeMessage.subject}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {isMessageUnreadForUser(activeMessage, activeRole, userEmail) ? (
                    <button
                      type="button"
                      onClick={() =>
                        markMessageReadWorkflow({
                          property,
                          message: activeMessage,
                          readerEmail: userEmail,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark as Read</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Read</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const replyDept = ALL_DEPARTMENTS.includes(
                        activeMessage.senderDepartment as DepartmentName
                      )
                        ? (activeMessage.senderDepartment as DepartmentName)
                        : 'Management';
                      openNewCompose({
                        scope: 'department',
                        dept: replyDept,
                        subject: activeMessage.subject.startsWith('Re:')
                          ? activeMessage.subject
                          : `Re: ${activeMessage.subject}`,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>Reply Dept</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div>
                  <p className="text-[11px] text-slate-500">From</p>
                  <p className="font-semibold text-slate-900">
                    {activeMessage.senderName} · {activeMessage.senderDepartment}
                  </p>
                  <p className="font-mono-tabular text-[11px] text-slate-500">
                    {activeMessage.senderEmail}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Recipients</p>
                  <p className="font-semibold text-slate-900">
                    {activeMessage.targetDepartment || activeMessage.recipientNames.join(', ')}
                  </p>
                  {activeMessage.recipientNames.length > 0 && (
                    <p className="text-[11px] text-slate-500 truncate">
                      {activeMessage.recipientNames.join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-white border border-slate-100 rounded-xl p-4">
                {activeMessage.body}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-mono-tabular">
                  Sent: {activeMessage.createdAtIso.slice(0, 19).replace('T', ' ')} UTC
                </span>
                <span>
                  Acknowledged by:{' '}
                  <strong className="text-slate-700">
                    {activeMessage.readByEmails.length > 0
                      ? activeMessage.readByEmails.join(', ')
                      : 'Awaiting acknowledgement'}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Message / Bulk Staff Dispatch Modal */}
      {showComposeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSendMessage}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 text-xs my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Compose Department or Staff Message
                </h2>
                <p className="text-slate-500">
                  Sending as <strong>{userName}</strong> ({myDepartment})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowComposeModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {composeError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
                {composeError}
              </div>
            )}

            {/* Recipient Mode Selector */}
            <div className="space-y-2">
              <label className="block font-semibold text-slate-700">Recipient Audience</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('department')}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-semibold cursor-pointer ${
                    scope === 'department'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Department</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScope('direct_staff')}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-semibold cursor-pointer ${
                    scope === 'direct_staff'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Direct Staff</span>
                </button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => setScope('bulk_staff')}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-semibold cursor-pointer ${
                        scope === 'bulk_staff'
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Bulk Staff</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope('all_staff')}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-semibold cursor-pointer ${
                        scope === 'all_staff'
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Megaphone className="w-3.5 h-3.5" />
                      <span>All Staff</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {scope === 'department' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Target Department *
                  </label>
                  <select
                    value={targetDept}
                    onChange={(e) => setTargetDept(e.target.value as DepartmentName)}
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
                  <label className="block font-medium text-slate-700 mb-1">Alert Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'Normal' | 'Urgent')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Normal">Normal Operational Notice</option>
                    <option value="Urgent">Urgent Alert (Immediate Notification)</option>
                  </select>
                </div>
              </div>
            )}

            {scope === 'direct_staff' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Staff Member *</label>
                  <select
                    value={directStaffId}
                    onChange={(e) => setDirectStaffId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {staffMembers.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName} · {st.department}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Alert Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'Normal' | 'Urgent')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent Alert</option>
                  </select>
                </div>
              </div>
            )}

            {scope === 'bulk_staff' && isAdmin && (
              <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Select Staff Recipients ({bulkSelectedStaffIds.length} selected)
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBulkSelectedStaffIds(staffMembers.map((s) => s.id))}
                      className="px-2 py-1 rounded bg-white border border-slate-200 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => selectBulkByDept('Housekeeping')}
                      className="px-2 py-1 rounded bg-white border border-slate-200 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      + Housekeeping
                    </button>
                    <button
                      type="button"
                      onClick={() => selectBulkByDept('Front Desk')}
                      className="px-2 py-1 rounded bg-white border border-slate-200 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      + Front Desk
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSelectedStaffIds([])}
                      className="px-2 py-1 rounded bg-white border border-slate-200 font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {staffMembers.map((st) => {
                    const checked = bulkSelectedStaffIds.includes(st.id);
                    return (
                      <label
                        key={st.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${
                          checked
                            ? 'bg-emerald-50 border-emerald-300 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulkStaff(st.id)}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        <span className="min-w-0 truncate">
                          <strong className="block truncate">{st.fullName}</strong>
                          <span className="text-[10px] text-slate-500">
                            {st.department} {st.email ? `· ${st.email}` : ''}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {scope === 'all_staff' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-slate-700">
                  Broadcasts to all <strong>{staffMembers.length} staff members</strong> across every
                  department at {property.name}.
                </p>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'Normal' | 'Urgent')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Normal">Normal Property Broadcast</option>
                  <option value="Urgent">Urgent Property-Wide Alert</option>
                </select>
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">Subject *</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Weekend VIP Arrival Preparation or Kitchen Inventory Notice"
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Message Details *</label>
              <textarea
                rows={4}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write clear instructions, suite numbers, or handover notes..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowComposeModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Sending...' : 'Send Message'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
