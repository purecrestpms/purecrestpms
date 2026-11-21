import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  advanceHousekeepingTask,
  createHousekeepingTask,
  createMaintenanceTicket,
  deleteHousekeepingTaskWorkflow,
  deleteMaintenanceTicketWorkflow,
  resolveMaintenanceTicket,
  updateHousekeepingTaskWorkflow,
  updateMaintenanceTicketWorkflow,
  updateRoomStatus,
} from '../services/pmsService';
import {
  formatNgn,
  HousekeepingTaskRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  PropertyRecord,
  RoomRecord,
} from '../types/pms';
import { useCms } from '../context/CmsContext';

interface HousekeepingMaintenanceViewProps {
  section: Extract<NavSectionId, 'housekeeping' | 'maintenance'>;
  property: PropertyRecord;
  rooms: RoomRecord[];
  housekeepingTasks: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  canManageRecords?: boolean;
  actorRole: string;
  onNotify: (msg: string) => void;
}

export const HousekeepingMaintenanceView: React.FC<HousekeepingMaintenanceViewProps> = ({
  section,
  property,
  rooms,
  housekeepingTasks,
  maintenanceTickets,
  canManageRecords = false,
  actorRole,
  onNotify,
}) => {
  const { cms } = useCms();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || '');
  const [taskType, setTaskType] = useState<HousekeepingTaskRecord['taskType']>('Checkout Turnover');
  const [assigneeFirstName, setAssigneeFirstName] = useState('');
  const [assigneeLastName, setAssigneeLastName] = useState('');
  const [hkPriority, setHkPriority] = useState<HousekeepingTaskRecord['priority']>('High');
  const [hkNotes, setHkNotes] = useState('');

  const [showMaintForm, setShowMaintForm] = useState(false);
  const [maintRoomId, setMaintRoomId] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [maintCategory, setMaintCategory] =
    useState<MaintenanceTicketRecord['category']>('HVAC & AC');
  const [maintPriority, setMaintPriority] =
    useState<MaintenanceTicketRecord['priority']>('Medium');
  const [maintFirstName, setMaintFirstName] = useState('');
  const [maintLastName, setMaintLastName] = useState('');
  const [estimatedCostNgn, setEstimatedCostNgn] = useState(15000);
  const [markOutOfOrder, setMarkOutOfOrder] = useState(false);

  // Edit & Delete Housekeeping Task State
  const [editingTask, setEditingTask] = useState<HousekeepingTaskRecord | null>(null);
  const [editTaskType, setEditTaskType] =
    useState<HousekeepingTaskRecord['taskType']>('Checkout Turnover');
  const [editTaskAssignedTo, setEditTaskAssignedTo] = useState('');
  const [editTaskPriority, setEditTaskPriority] =
    useState<HousekeepingTaskRecord['priority']>('High');
  const [editTaskNotes, setEditTaskNotes] = useState('');
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  // Edit & Delete Maintenance Ticket State
  const [editingTicket, setEditingTicket] = useState<MaintenanceTicketRecord | null>(null);
  const [editTicketLocation, setEditTicketLocation] = useState('');
  const [editTicketTitle, setEditTicketTitle] = useState('');
  const [editTicketCategory, setEditTicketCategory] =
    useState<MaintenanceTicketRecord['category']>('HVAC & AC');
  const [editTicketPriority, setEditTicketPriority] =
    useState<MaintenanceTicketRecord['priority']>('Medium');
  const [editTicketAssignedTo, setEditTicketAssignedTo] = useState('');
  const [editTicketCost, setEditTicketCost] = useState(0);
  const [confirmDeleteTicketId, setConfirmDeleteTicketId] = useState<string | null>(null);

  const sortedRooms = [...rooms].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));

  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) {
      const sorted = [...rooms].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
      if (sorted[0]) setSelectedRoomId(sorted[0].id);
    }
  }, [rooms, selectedRoomId]);

  const handleCreateHkTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = rooms.find((r) => r.id === selectedRoomId) || sortedRooms[0];
    if (!room) return;
    const assignedName = `${assigneeFirstName.trim()} ${assigneeLastName.trim()}`.trim();
    if (!assignedName) return;
    setActionError(null);
    try {
      await createHousekeepingTask({
        property,
        room,
        taskType,
        assignedTo: assignedName,
        priority: hkPriority,
        notes: hkNotes.trim(),
        actorRole,
      });
      onNotify(`Dispatched ${taskType} for Room ${room.roomNumber}`);
      setShowTaskForm(false);
      setHkNotes('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const openEditTaskModal = (task: HousekeepingTaskRecord) => {
    setActionError(null);
    setEditingTask(task);
    setEditTaskType(task.taskType);
    setEditTaskAssignedTo(task.assignedTo);
    setEditTaskPriority(task.priority);
    setEditTaskNotes(task.notes || '');
  };

  const handleSaveTaskEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setActionError(null);
    setBusyRecordId(editingTask.id);
    try {
      await updateHousekeepingTaskWorkflow({
        property,
        task: editingTask,
        updates: {
          taskType: editTaskType,
          assignedTo: editTaskAssignedTo.trim() || editingTask.assignedTo,
          priority: editTaskPriority,
          notes: editTaskNotes.trim(),
        },
        actorRole,
      });
      onNotify(`Updated housekeeping task for Room ${editingTask.roomNumber}`);
      setEditingTask(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleDeleteTask = async (task: HousekeepingTaskRecord) => {
    setActionError(null);
    setBusyRecordId(task.id);
    try {
      await deleteHousekeepingTaskWorkflow({ property, task, actorRole });
      onNotify(`Deleted housekeeping task for Room ${task.roomNumber}`);
      setConfirmDeleteTaskId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = rooms.find((r) => r.id === maintRoomId);
    const label = locationLabel.trim() || (room ? `Room ${room.roomNumber}` : 'Main Facility');
    const techName = `${maintFirstName.trim()} ${maintLastName.trim()}`.trim();
    if (!issueTitle.trim() || !techName) return;
    setActionError(null);
    try {
      await createMaintenanceTicket({
        property,
        room,
        locationLabel: label,
        issueTitle: issueTitle.trim(),
        category: maintCategory,
        priority: maintPriority,
        assignedTo: techName,
        estimatedCostNgn: Math.max(0, estimatedCostNgn),
        markRoomOutOfOrder: markOutOfOrder && Boolean(room),
        actorRole,
      });
      onNotify(`Opened maintenance ticket for ${label}`);
      setShowMaintForm(false);
      setIssueTitle('');
      setLocationLabel('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const openEditTicketModal = (ticket: MaintenanceTicketRecord) => {
    setActionError(null);
    setEditingTicket(ticket);
    setEditTicketLocation(ticket.locationLabel);
    setEditTicketTitle(ticket.issueTitle);
    setEditTicketCategory(ticket.category);
    setEditTicketPriority(ticket.priority);
    setEditTicketAssignedTo(ticket.assignedTo);
    setEditTicketCost(ticket.estimatedCostNgn);
  };

  const handleSaveTicketEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    if (editTicketLocation.trim().length < 2 || editTicketTitle.trim().length < 2) {
      setActionError('Location and issue title must be at least 2 characters.');
      return;
    }
    setActionError(null);
    setBusyRecordId(editingTicket.id);
    try {
      await updateMaintenanceTicketWorkflow({
        property,
        ticket: editingTicket,
        updates: {
          locationLabel: editTicketLocation.trim(),
          issueTitle: editTicketTitle.trim(),
          category: editTicketCategory,
          priority: editTicketPriority,
          assignedTo: editTicketAssignedTo.trim() || editingTicket.assignedTo,
          estimatedCostNgn: Math.max(0, editTicketCost),
        },
        actorRole,
      });
      onNotify(`Updated maintenance ticket for ${editTicketLocation.trim()}`);
      setEditingTicket(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleDeleteTicket = async (ticket: MaintenanceTicketRecord) => {
    setActionError(null);
    setBusyRecordId(ticket.id);
    try {
      await deleteMaintenanceTicketWorkflow({ property, ticket, actorRole });
      onNotify(`Deleted maintenance ticket for ${ticket.locationLabel}`);
      setConfirmDeleteTicketId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyRecordId(null);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-2">
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

      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {cms.pages[section].title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages[section].subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            section === 'housekeeping'
              ? setShowTaskForm((v) => !v)
              : setShowMaintForm((v) => !v)
          }
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{cms.pages[section].ctaLabel}</span>
        </button>
      </div>

      {/* HOUSEKEEPING VIEW */}
      {section === 'housekeeping' && (
        <>
          {showTaskForm && (
            <form
              onSubmit={handleCreateHkTask}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <h2 className="font-display text-sm font-bold text-slate-900">
                Assign Housekeeping Task
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Room *</label>
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {sortedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} — {r.name} ({r.housekeepingStatus})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Task Type *</label>
                  <select
                    value={taskType}
                    onChange={(e) =>
                      setTaskType(e.target.value as HousekeepingTaskRecord['taskType'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Checkout Turnover">Checkout Turnover</option>
                    <option value="Daily Stayover">Daily Stayover</option>
                    <option value="Deep Clean">Deep Clean</option>
                    <option value="VIP Inspection">VIP Inspection</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Attendant First Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={assigneeFirstName}
                    onChange={(e) => setAssigneeFirstName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Attendant Last Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={assigneeLastName}
                    onChange={(e) => setAssigneeLastName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Priority</label>
                  <select
                    value={hkPriority}
                    onChange={(e) =>
                      setHkPriority(e.target.value as HousekeepingTaskRecord['priority'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Normal">Normal Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Instructions</label>
                <input
                  type="text"
                  value={hkNotes}
                  onChange={(e) => setHkNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTaskForm(false)}
                  className="px-4 py-2 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Create Task
                </button>
              </div>
            </form>
          )}

          {/* Housekeeping Status Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {(
              [
                {
                  key: 'clean',
                  label: 'Clean & Ready',
                  count: sortedRooms.filter(
                    (r) => r.housekeepingStatus === 'clean' || r.housekeepingStatus === 'inspected'
                  ).length,
                  accent: 'text-emerald-700',
                },
                {
                  key: 'cleaning',
                  label: 'In Progress',
                  count: sortedRooms.filter((r) => r.housekeepingStatus === 'cleaning').length,
                  accent: 'text-amber-700',
                },
                {
                  key: 'dirty',
                  label: 'Dirty / Needs Turnover',
                  count: sortedRooms.filter((r) => r.housekeepingStatus === 'dirty').length,
                  accent: 'text-rose-700',
                },
              ] as const
            ).map((stat) => (
              <div
                key={stat.key}
                className="bg-white border border-slate-200 rounded-xl px-4 py-3.5"
              >
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                <p className={`font-mono-tabular text-2xl font-bold mt-1 ${stat.accent}`}>
                  {stat.count}
                </p>
              </div>
            ))}
          </div>

          {/* Interactive Room Housekeeping Board */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Room Housekeeping Status &amp; Quick Controls
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update cleanliness status across all property rooms directly from Housekeeping Management.
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-slate-500">
                {sortedRooms.length} room{sortedRooms.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {sortedRooms.map((r) => (
                <div
                  key={r.id}
                  className="border border-slate-200 rounded-xl p-3.5 space-y-2.5 bg-slate-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono-tabular text-sm font-bold text-slate-900">
                        {r.roomNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{r.roomType || r.name}</p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold capitalize shrink-0 ${
                        r.housekeepingStatus === 'dirty'
                          ? 'text-rose-700'
                          : r.housekeepingStatus === 'cleaning'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {r.housekeepingStatus === 'inspected' ? 'clean' : r.housekeepingStatus}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 capitalize">
                    Occupancy: <span className="font-medium text-slate-700">{r.occupancyStatus.replace('_', ' ')}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {(['clean', 'cleaning', 'dirty'] as const).map((hk) => {
                      const normalizedHk =
                        r.housekeepingStatus === 'inspected' ? 'clean' : r.housekeepingStatus;
                      const isActive = normalizedHk === hk;
                      return (
                        <button
                          key={hk}
                          type="button"
                          disabled={busyRecordId === `hk-${r.id}`}
                          onClick={async () => {
                            setActionError(null);
                            setBusyRecordId(`hk-${r.id}`);
                            try {
                              await updateRoomStatus({
                                property,
                                room: r,
                                updates: { housekeepingStatus: hk },
                                actorRole,
                              });
                              onNotify(`Marked ${r.roomNumber} as ${hk}`);
                            } catch (err) {
                              setActionError(err instanceof Error ? err.message : String(err));
                            } finally {
                              setBusyRecordId(null);
                            }
                          }}
                          className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold capitalize transition-colors cursor-pointer disabled:opacity-50 ${
                            isActive
                              ? 'bg-[#0a367a] border-[#0a367a] text-white'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {hk}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Housekeeping Work Queue
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Room</th>
                    <th className="py-3 px-4">Task Type</th>
                    <th className="py-3 px-4">Assigned To</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4">Status &amp; Advance</th>
                    {canManageRecords && (
                      <th className="py-3 px-4 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {housekeepingTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-tabular font-bold text-slate-900">
                        Room {task.roomNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{task.taskType}</td>
                      <td className="py-3 px-4 text-slate-700">{task.assignedTo}</td>
                      <td className="py-3 px-4 font-semibold text-amber-700">{task.priority}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {task.notes || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="capitalize font-medium text-slate-700">
                            {task.status === 'inspected'
                              ? 'completed'
                              : task.status.replace('_', ' ')}
                          </span>
                          {task.status === 'pending' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError(null);
                                try {
                                  await advanceHousekeepingTask({
                                    property,
                                    task,
                                    nextStatus: 'in_progress',
                                    actorRole,
                                  });
                                } catch (err) {
                                  setActionError(err instanceof Error ? err.message : String(err));
                                }
                              }}
                              className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium cursor-pointer"
                            >
                              Start Clean
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError(null);
                                try {
                                  await advanceHousekeepingTask({
                                    property,
                                    task,
                                    nextStatus: 'completed',
                                    actorRole,
                                  });
                                } catch (err) {
                                  setActionError(err instanceof Error ? err.message : String(err));
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium cursor-pointer"
                            >
                              Mark Clean
                            </button>
                          )}
                        </div>
                      </td>
                      {canManageRecords && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditTaskModal(task)}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            {confirmDeleteTaskId !== task.id ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTaskId(task.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTaskId(null)}
                                  className="text-[10px] text-slate-600 px-1 cursor-pointer"
                                >
                                  No
                                </button>
                                <button
                                  type="button"
                                  disabled={busyRecordId === task.id}
                                  onClick={() => void handleDeleteTask(task)}
                                  className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  {busyRecordId === task.id ? '...' : 'Del'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MAINTENANCE VIEW */}
      {section === 'maintenance' && (
        <>
          {showMaintForm && (
            <form
              onSubmit={handleCreateMaintenance}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <h2 className="font-display text-sm font-bold text-slate-900">
                Log Engineering / Maintenance Ticket
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Room / Facility</label>
                  <select
                    value={maintRoomId}
                    onChange={(e) => setMaintRoomId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="">General Facility / Power Plant</option>
                    {sortedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} — {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Location Override</label>
                  <input
                    type="text"
                    value={locationLabel}
                    onChange={(e) => setLocationLabel(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-600 mb-1">
                    Issue Description *
                  </label>
                  <input
                    required
                    type="text"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Category</label>
                  <select
                    value={maintCategory}
                    onChange={(e) =>
                      setMaintCategory(e.target.value as MaintenanceTicketRecord['category'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="HVAC & AC">HVAC &amp; AC</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical & Inverter">Electrical &amp; Inverter</option>
                    <option value="Carpentry">Carpentry</option>
                    <option value="Generator & Power">Generator &amp; Power</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Priority</label>
                  <select
                    value={maintPriority}
                    onChange={(e) =>
                      setMaintPriority(e.target.value as MaintenanceTicketRecord['priority'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Technician First Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={maintFirstName}
                    onChange={(e) => setMaintFirstName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Technician Last Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={maintLastName}
                    onChange={(e) => setMaintLastName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Estimated Cost (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={estimatedCostNgn}
                    onChange={(e) => setEstimatedCostNgn(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markOutOfOrder}
                    onChange={(e) => setMarkOutOfOrder(e.target.checked)}
                    disabled={!maintRoomId}
                  />
                  <span>Place selected room Out of Order until resolved</span>
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Maintenance Work Orders
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Issue &amp; Category</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Technician</th>
                    <th className="py-3 px-4 text-right">Est. Cost</th>
                    <th className="py-3 px-4">Workflow</th>
                    {canManageRecords && (
                      <th className="py-3 px-4 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {maintenanceTickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {ticket.locationLabel}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{ticket.issueTitle}</p>
                        <p className="text-[11px] text-slate-500">{ticket.category}</p>
                      </td>
                      <td className="py-3 px-4 font-semibold text-amber-700">
                        {ticket.priority}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{ticket.assignedTo}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(ticket.estimatedCostNgn)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="capitalize text-slate-700">
                            {ticket.status.replace('_', ' ')}
                          </span>
                          {ticket.status === 'open' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError(null);
                                try {
                                  await resolveMaintenanceTicket({
                                    property,
                                    ticket,
                                    nextStatus: 'in_progress',
                                    actorRole,
                                  });
                                } catch (err) {
                                  setActionError(err instanceof Error ? err.message : String(err));
                                }
                              }}
                              className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium cursor-pointer"
                            >
                              Start Work
                            </button>
                          )}
                          {ticket.status !== 'resolved' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError(null);
                                try {
                                  await resolveMaintenanceTicket({
                                    property,
                                    ticket,
                                    nextStatus: 'resolved',
                                    actorRole,
                                  });
                                  onNotify(`Resolved maintenance on ${ticket.locationLabel}`);
                                } catch (err) {
                                  setActionError(err instanceof Error ? err.message : String(err));
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium cursor-pointer"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                      {canManageRecords && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditTicketModal(ticket)}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            {confirmDeleteTicketId !== ticket.id ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTicketId(ticket.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTicketId(null)}
                                  className="text-[10px] text-slate-600 px-1 cursor-pointer"
                                >
                                  No
                                </button>
                                <button
                                  type="button"
                                  disabled={busyRecordId === ticket.id}
                                  onClick={() => void handleDeleteTicket(ticket)}
                                  className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  {busyRecordId === ticket.id ? '...' : 'Del'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit Housekeeping Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTaskEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                Edit Housekeeping Task — Room {editingTask.roomNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Task Type</label>
                <select
                  value={editTaskType}
                  onChange={(e) =>
                    setEditTaskType(e.target.value as HousekeepingTaskRecord['taskType'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Checkout Turnover">Checkout Turnover</option>
                  <option value="Daily Stayover">Daily Stayover</option>
                  <option value="Deep Clean">Deep Clean</option>
                  <option value="VIP Inspection">VIP Inspection</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Assigned Attendant</label>
                <input
                  required
                  type="text"
                  value={editTaskAssignedTo}
                  onChange={(e) => setEditTaskAssignedTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={editTaskPriority}
                  onChange={(e) =>
                    setEditTaskPriority(e.target.value as HousekeepingTaskRecord['priority'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Instructions / Notes</label>
                <input
                  type="text"
                  value={editTaskNotes}
                  onChange={(e) => setEditTaskNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-3.5 py-2 text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyRecordId === editingTask.id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyRecordId === editingTask.id ? 'Saving...' : 'Save Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Maintenance Ticket Modal */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTicketEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                Edit Maintenance Ticket
              </h3>
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Location *</label>
                <input
                  required
                  type="text"
                  minLength={2}
                  value={editTicketLocation}
                  onChange={(e) => setEditTicketLocation(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Issue Title *</label>
                <input
                  required
                  type="text"
                  minLength={2}
                  value={editTicketTitle}
                  onChange={(e) => setEditTicketTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={editTicketCategory}
                    onChange={(e) =>
                      setEditTicketCategory(e.target.value as MaintenanceTicketRecord['category'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="HVAC & AC">HVAC &amp; AC</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical & Inverter">Electrical &amp; Inverter</option>
                    <option value="Carpentry">Carpentry</option>
                    <option value="Generator & Power">Generator &amp; Power</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={editTicketPriority}
                    onChange={(e) =>
                      setEditTicketPriority(e.target.value as MaintenanceTicketRecord['priority'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Technician</label>
                  <input
                    required
                    type="text"
                    value={editTicketAssignedTo}
                    onChange={(e) => setEditTicketAssignedTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Est. Cost (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={editTicketCost}
                    onChange={(e) => setEditTicketCost(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                className="px-3.5 py-2 text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyRecordId === editingTicket.id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyRecordId === editingTicket.id ? 'Saving...' : 'Save Ticket'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
