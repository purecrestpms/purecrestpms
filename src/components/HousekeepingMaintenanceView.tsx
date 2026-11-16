import React, { useEffect, useState } from 'react';
import { Plus, Sparkles, Wrench } from 'lucide-react';
import {
  advanceHousekeepingTask,
  createHousekeepingTask,
  createMaintenanceTicket,
  resolveMaintenanceTicket,
} from '../services/pmsService';
import {
  formatNgn,
  HousekeepingTaskRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  PropertyRecord,
  RoomRecord,
} from '../types/pms';

interface HousekeepingMaintenanceViewProps {
  section: Extract<NavSectionId, 'housekeeping' | 'maintenance'>;
  property: PropertyRecord;
  rooms: RoomRecord[];
  housekeepingTasks: HousekeepingTaskRecord[];
  maintenanceTickets: MaintenanceTicketRecord[];
  actorRole: string;
  onNotify: (msg: string) => void;
}

export const HousekeepingMaintenanceView: React.FC<HousekeepingMaintenanceViewProps> = ({
  section,
  property,
  rooms,
  housekeepingTasks,
  maintenanceTickets,
  actorRole,
  onNotify,
}) => {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || '');
  const [taskType, setTaskType] = useState<HousekeepingTaskRecord['taskType']>('Checkout Turnover');
  const [assignee, setAssignee] = useState('Ngozi Ugwu');
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
  const [maintAssignee, setMaintAssignee] = useState('Ifeanyi Okolie');
  const [estimatedCostNgn, setEstimatedCostNgn] = useState(15000);
  const [markOutOfOrder, setMarkOutOfOrder] = useState(false);

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
    await createHousekeepingTask({
      property,
      room,
      taskType,
      assignedTo: assignee,
      priority: hkPriority,
      notes: hkNotes.trim(),
      actorRole,
    });
    onNotify(`Dispatched ${taskType} for Room ${room.roomNumber}`);
    setShowTaskForm(false);
    setHkNotes('');
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = rooms.find((r) => r.id === maintRoomId);
    const label = locationLabel.trim() || (room ? `Room ${room.roomNumber}` : 'Main Facility');
    if (!issueTitle.trim()) return;
    await createMaintenanceTicket({
      property,
      room,
      locationLabel: label,
      issueTitle: issueTitle.trim(),
      category: maintCategory,
      priority: maintPriority,
      assignedTo: maintAssignee,
      estimatedCostNgn: Math.max(0, estimatedCostNgn),
      markRoomOutOfOrder: markOutOfOrder && Boolean(room),
      actorRole,
    });
    onNotify(`Opened maintenance ticket for ${label}`);
    setShowMaintForm(false);
    setIssueTitle('');
    setLocationLabel('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {section === 'housekeeping'
              ? 'Housekeeping Dispatch & Room Readiness'
              : 'Engineering & Preventive Maintenance'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {section === 'housekeeping'
              ? 'Live turnover schedule, attendant assignments, and suite inspection workflow'
              : 'Facility work orders, generator & inverter servicing, and room out-of-order controls'}
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
          <span>
            {section === 'housekeeping' ? 'Assign Housekeeping Task' : 'Log Maintenance Ticket'}
          </span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  {sortedRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} — {r.name} ({r.housekeepingStatus})
                    </option>
                  ))}
                </select>
                <select
                  value={taskType}
                  onChange={(e) =>
                    setTaskType(e.target.value as HousekeepingTaskRecord['taskType'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Checkout Turnover">Checkout Turnover</option>
                  <option value="Daily Stayover">Daily Stayover</option>
                  <option value="Deep Clean">Deep Clean</option>
                  <option value="VIP Inspection">VIP Inspection</option>
                </select>
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Attendant Name"
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <select
                  value={hkPriority}
                  onChange={(e) =>
                    setHkPriority(e.target.value as HousekeepingTaskRecord['priority'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Normal">Normal Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <input
                type="text"
                value={hkNotes}
                onChange={(e) => setHkNotes(e.target.value)}
                placeholder="Instructions (e.g., Fresh VIP bathrobes, restock Nespresso capsules)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
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

          {/* Room Cleanliness Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {sortedRooms.map((r) => (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded-xl p-3 space-y-1"
              >
                <p className="font-mono-tabular text-sm font-bold text-slate-900">
                  Rm {r.roomNumber}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{r.name}</p>
                <p
                  className={`text-xs font-semibold capitalize pt-1 ${
                    r.housekeepingStatus === 'dirty'
                      ? 'text-red-700'
                      : r.housekeepingStatus === 'cleaning'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {r.housekeepingStatus}
                </p>
              </div>
            ))}
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
                            {task.status.replace('_', ' ')}
                          </span>
                          {task.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() =>
                                advanceHousekeepingTask({
                                  property,
                                  task,
                                  nextStatus: 'in_progress',
                                  actorRole,
                                })
                              }
                              className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium"
                            >
                              Start Clean
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <button
                              type="button"
                              onClick={() =>
                                advanceHousekeepingTask({
                                  property,
                                  task,
                                  nextStatus: 'completed',
                                  actorRole,
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium"
                            >
                              Mark Clean
                            </button>
                          )}
                          {task.status === 'completed' && (
                            <button
                              type="button"
                              onClick={() =>
                                advanceHousekeepingTask({
                                  property,
                                  task,
                                  nextStatus: 'inspected',
                                  actorRole,
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-700 text-white rounded font-medium"
                            >
                              Verify Inspect
                            </button>
                          )}
                        </div>
                      </td>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <select
                  value={maintRoomId}
                  onChange={(e) => setMaintRoomId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">General Facility / Power Plant</option>
                  {sortedRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} — {r.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="Location override (e.g. Inverter Room)"
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  required
                  type="text"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="Issue description"
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <select
                  value={maintCategory}
                  onChange={(e) =>
                    setMaintCategory(e.target.value as MaintenanceTicketRecord['category'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="HVAC & AC">HVAC &amp; AC</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Electrical & Inverter">Electrical &amp; Inverter</option>
                  <option value="Carpentry">Carpentry</option>
                  <option value="Generator & Power">Generator &amp; Power</option>
                </select>
                <select
                  value={maintPriority}
                  onChange={(e) =>
                    setMaintPriority(e.target.value as MaintenanceTicketRecord['priority'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={maintAssignee}
                    onChange={(e) => setMaintAssignee(e.target.value)}
                    placeholder="Technician"
                    className="border border-slate-200 rounded-lg px-3 py-2"
                  />
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={estimatedCostNgn}
                    onChange={(e) => setEstimatedCostNgn(Number(e.target.value))}
                    placeholder="Est. NGN"
                    className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
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
                              onClick={() =>
                                resolveMaintenanceTicket({
                                  property,
                                  ticket,
                                  nextStatus: 'in_progress',
                                  actorRole,
                                })
                              }
                              className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium"
                            >
                              Start Work
                            </button>
                          )}
                          {ticket.status !== 'resolved' && (
                            <button
                              type="button"
                              onClick={() => {
                                resolveMaintenanceTicket({
                                  property,
                                  ticket,
                                  nextStatus: 'resolved',
                                  actorRole,
                                });
                                onNotify(`Resolved maintenance on ${ticket.locationLabel}`);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
