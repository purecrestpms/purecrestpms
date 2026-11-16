import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  BOOTSTRAPPED_ADMIN_EMAILS,
  isBootstrappedAdminEmail,
  OperationType,
  auth,
  db,
  handleFirestoreError,
} from '../firebase';
import { buildRichgatesSeedPayload, generateLicenseKey, RICHGATES_PROPERTY_ID } from '../data/seedData';
import {
  AttendanceRecord,
  BlockedDateRecord,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  OtaIntegrationRecord,
  PayrollRunRecord,
  PosOrderRecord,
  PropertyRecord,
  PurchaseOrderRecord,
  ReservationRecord,
  RICHGATES_OFFICIAL_ROOMS,
  RoomRecord,
  ShiftScheduleRecord,
  StaffMemberRecord,
  StaffRole,
} from '../types/pms';

function cleanId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function getActorContext() {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  return {
    uid: user.uid,
    email: user.email || BOOTSTRAPPED_ADMIN_EMAIL,
  };
}

export async function writeAuditLog(params: {
  propertyId: string;
  actorRole: string;
  module: string;
  action: string;
  details: string;
  authorizedEmails: string[];
}) {
  const { uid, email } = getActorContext();
  const id = cleanId('aud');
  const path = `audit_logs/${id}`;
  try {
    await setDoc(doc(db, 'audit_logs', id), {
      propertyId: params.propertyId,
      actorEmail: email,
      actorRole: params.actorRole,
      module: params.module,
      action: params.action,
      details: params.details.slice(0, 495),
      timestampIso: new Date().toISOString(),
      authorizedEmails: params.authorizedEmails.slice(0, 25),
      ownerUid: uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function seedRichgatesIfNeeded(customPropertyId?: string): Promise<string | null> {
  const { uid, email } = getActorContext();
  const isBootstrapped = isBootstrappedAdminEmail(email);
  const targetPropId =
    customPropertyId || (isBootstrapped ? RICHGATES_PROPERTY_ID : `rg-${uid.slice(0, 10)}`);
  const propRef = doc(db, 'properties', targetPropId);
  try {
    const snap = await getDoc(propRef);
    if (snap.exists()) return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `properties/${targetPropId}`);
  }

  const seed = buildRichgatesSeedPayload(uid, email, targetPropId);
  const batch = writeBatch(db);
  const now = serverTimestamp();

  const { id: propId, ...propBody } = seed.property;
  batch.set(doc(db, 'properties', propId), { ...propBody, createdAt: now, updatedAt: now });

  for (const lic of seed.licenses) {
    const { id, ...body } = lic;
    batch.set(doc(db, 'licenses', id), { ...body, createdAt: now, updatedAt: now });
  }

  const addSub = (subName: string, items: Array<{ id: string } & Record<string, unknown>>) => {
    for (const item of items) {
      const { id, ...body } = item;
      batch.set(doc(db, 'properties', targetPropId, subName, id), {
        ...body,
        createdAt: now,
        updatedAt: now,
      });
    }
  };

  addSub('rooms', seed.rooms);
  addSub('blocked_dates', seed.blockedDates);
  addSub('guests', seed.guests);
  addSub('reservations', seed.reservations);
  addSub('housekeeping_tasks', seed.housekeepingTasks);
  addSub('pos_orders', seed.posOrders);
  addSub('ledger_entries', seed.ledgerEntries);
  addSub('inventory_items', seed.inventoryItems);
  addSub('purchase_orders', seed.purchaseOrders);
  addSub('staff_members', seed.staffMembers);
  addSub('shifts', seed.shifts);
  addSub('attendance', seed.attendance);
  addSub('payroll_runs', seed.payrollRuns);
  addSub('maintenance_tickets', seed.maintenanceTickets);
  addSub('ota_channels', seed.otaChannels);

  for (const aud of seed.auditLogs) {
    const { id, ...body } = aud;
    batch.set(doc(db, 'audit_logs', id), { ...body, createdAt: now });
  }

  try {
    await batch.commit();
    return targetPropId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${targetPropId}/seed`);
  }
}

export async function createReservationWorkflow(params: {
  property: PropertyRecord;
  room: RoomRecord;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  channel: ReservationRecord['channel'];
  paymentMethod: ReservationRecord['paymentMethod'];
  depositNgn: number;
  immediateCheckIn: boolean;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const resId = cleanId('res');
  const guestId = cleanId('gst');
  const bookingRef = `RG-${Math.floor(1000 + Math.random() * 8999)}`;
  const roomChargesNgn = params.room.nightlyRateNgn * params.nights;
  const status = params.immediateCheckIn ? 'checked_in' : 'confirmed';
  const authEmails = params.property.authorizedEmails;

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'guests', guestId), {
    propertyId: params.property.id,
    fullName: params.guestName,
    email: params.guestEmail || '',
    phone: params.guestPhone || '+234 800 000 0000',
    nationality: 'Nigerian',
    idType: 'NIN',
    idNumber: '',
    vipTier: 'Standard',
    totalStays: params.immediateCheckIn ? 1 : 0,
    lifetimeSpendNgn: params.depositNgn,
    notes: `Created via ${params.channel}`,
    authorizedEmails: authEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'properties', params.property.id, 'reservations', resId), {
    propertyId: params.property.id,
    bookingRef,
    roomId: params.room.id,
    roomNumber: params.room.roomNumber,
    guestId,
    guestName: params.guestName,
    guestPhone: params.guestPhone || '+234 800 000 0000',
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    nights: params.nights,
    adults: params.adults,
    channel: params.channel,
    nightlyRateNgn: params.room.nightlyRateNgn,
    roomChargesNgn,
    posChargesNgn: 0,
    paidNgn: params.depositNgn,
    status,
    paymentMethod: params.paymentMethod,
    authorizedEmails: authEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.update(doc(db, 'properties', params.property.id, 'rooms', params.room.id), {
    occupancyStatus: params.immediateCheckIn ? 'occupied' : 'reserved',
    currentGuestName: params.guestName,
    currentReservationId: resId,
    updatedAt: now,
  });

  if (params.depositNgn > 0) {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: new Date().toISOString().slice(0, 10),
      entryType: 'revenue',
      category: 'Room Accommodation',
      reference: bookingRef,
      description: `Room ${params.room.roomNumber} booking payment — ${params.guestName}`,
      amountNgn: params.depositNgn,
      vatNgn: Math.round(params.depositNgn * 0.075),
      paymentMethod: params.paymentMethod,
      authorizedEmails: authEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Reservations',
      action: params.immediateCheckIn ? `Walk-In Check-In Room ${params.room.roomNumber}` : `New Booking ${bookingRef}`,
      details: `${params.guestName} · Room ${params.room.roomNumber} · ${params.nights} nights · ${params.channel}`,
      authorizedEmails: authEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/reservations/${resId}`);
  }
}

export async function transitionReservationStatus(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  nextStatus: 'checked_in' | 'checked_out' | 'cancelled';
  settlementAmountNgn?: number;
  paymentMethod?: ReservationRecord['paymentMethod'];
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  const roomRef = doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId);

  const extraPayment = params.settlementAmountNgn || 0;
  const newPaid = params.reservation.paidNgn + extraPayment;

  batch.update(resRef, {
    status: params.nextStatus,
    paidNgn: newPaid,
    paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
    updatedAt: now,
  });

  if (params.nextStatus === 'checked_in') {
    batch.update(roomRef, {
      occupancyStatus: 'occupied',
      currentGuestName: params.reservation.guestName,
      currentReservationId: params.reservation.id,
      updatedAt: now,
    });
  } else if (params.nextStatus === 'checked_out') {
    batch.update(roomRef, {
      occupancyStatus: 'vacant',
      housekeepingStatus: 'dirty',
      currentGuestName: '',
      currentReservationId: '',
      updatedAt: now,
    });

    const hkId = cleanId('hk');
    batch.set(doc(db, 'properties', params.property.id, 'housekeeping_tasks', hkId), {
      propertyId: params.property.id,
      roomId: params.reservation.roomId,
      roomNumber: params.reservation.roomNumber,
      taskType: 'Checkout Turnover',
      assignedTo: 'Ngozi Ugwu',
      priority: 'High',
      status: 'pending',
      notes: `Auto-generated on checkout of ${params.reservation.guestName} (${params.reservation.bookingRef})`,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });

    if (extraPayment > 0) {
      const ledId = cleanId('led');
      batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
        propertyId: params.property.id,
        entryDate: new Date().toISOString().slice(0, 10),
        entryType: 'revenue',
        category: 'Room Accommodation',
        reference: params.reservation.bookingRef,
        description: `Final checkout settlement Room ${params.reservation.roomNumber} — ${params.reservation.guestName}`,
        amountNgn: extraPayment,
        vatNgn: Math.round(extraPayment * 0.075),
        paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
        authorizedEmails: params.property.authorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else if (params.nextStatus === 'cancelled') {
    batch.update(roomRef, {
      occupancyStatus: 'vacant',
      currentGuestName: '',
      currentReservationId: '',
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Front Desk',
      action: `Reservation ${params.reservation.bookingRef} -> ${params.nextStatus.replace('_', ' ')}`,
      details: `Room ${params.reservation.roomNumber} · ${params.reservation.guestName} · Settled +₦${extraPayment.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function updateRoomStatus(params: {
  property: PropertyRecord;
  room: RoomRecord;
  updates: Partial<
    Pick<
      RoomRecord,
      | 'roomNumber'
      | 'name'
      | 'roomType'
      | 'section'
      | 'maxGuests'
      | 'occupancyStatus'
      | 'housekeepingStatus'
      | 'nightlyRateNgn'
      | 'imageUrl'
      | 'amenities'
    >
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'rooms', params.room.id);
  try {
    await updateDoc(ref, {
      ...params.updates,
      updatedAt: serverTimestamp(),
    });
    const logSummary = Object.entries(params.updates)
      .map(([k, v]) => (k === 'imageUrl' ? 'imageUrl: [updated]' : `${k}: ${String(v)}`))
      .join(', ');
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Rooms',
      action: `Updated Room ${params.updates.roomNumber || params.room.roomNumber}`,
      details: logSummary,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function createBlockedDate(params: {
  property: PropertyRecord;
  room: RoomRecord;
  startDate: string;
  endDate: string;
  reason: string;
  category: BlockedDateRecord['category'];
  actorRole: string;
}) {
  const { uid, email } = getActorContext();
  const id = cleanId('blk');
  const ref = doc(db, 'properties', params.property.id, 'blocked_dates', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      roomId: params.room.id,
      roomNumber: params.room.roomNumber,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason.trim(),
      category: params.category,
      createdByEmail: email,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Availability Calendar',
      action: `Blocked ${params.room.roomNumber} (${params.category})`,
      details: `${params.startDate} to ${params.endDate} · ${params.reason}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function deleteBlockedDate(params: {
  property: PropertyRecord;
  block: BlockedDateRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'blocked_dates', params.block.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Availability Calendar',
      action: `Unblocked ${params.block.roomNumber}`,
      details: `Removed ${params.block.category} (${params.block.startDate} → ${params.block.endDate})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export async function syncRichgatesOfficialCatalogIfNeeded(params: {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  housekeepingTasks: HousekeepingTaskRecord[];
  actorRole: string;
}): Promise<boolean> {
  if (params.property.code !== 'RG-ENU-01' || params.rooms.length === 0) return false;
  const specMap = new Map(RICHGATES_OFFICIAL_ROOMS.map((s) => [s.id, s]));
  const needsRoomUpdate = params.rooms.some((r) => {
    const spec = specMap.get(r.id);
    if (!spec) return false;
    return r.roomNumber !== spec.roomNumber || !r.section || !r.imageUrl;
  });
  if (!needsRoomUpdate) return false;

  const { email } = getActorContext();
  const isBootstrapped = isBootstrappedAdminEmail(email);
  const batch = writeBatch(db);
  const now = serverTimestamp();

  for (const room of params.rooms) {
    const spec = specMap.get(room.id);
    if (!spec) continue;
    batch.update(doc(db, 'properties', params.property.id, 'rooms', room.id), {
      roomNumber: spec.roomNumber,
      name: spec.name,
      roomType: spec.roomType,
      section: spec.section,
      nightlyRateNgn: spec.nightlyRateNgn,
      maxGuests: spec.maxGuests,
      imageUrl: spec.imageUrl,
      amenities: spec.amenities,
      updatedAt: now,
    });
  }

  for (const res of params.reservations) {
    const spec = specMap.get(res.roomId);
    if (!spec || res.roomNumber === spec.roomNumber) continue;
    if (!isBootstrapped && (res.status === 'checked_out' || res.status === 'cancelled')) continue;
    batch.update(doc(db, 'properties', params.property.id, 'reservations', res.id), {
      roomNumber: spec.roomNumber,
      nightlyRateNgn: spec.nightlyRateNgn,
      updatedAt: now,
    });
  }

  for (const hk of params.housekeepingTasks) {
    const spec = specMap.get(hk.roomId);
    if (!spec || hk.roomNumber === spec.roomNumber) continue;
    if (!isBootstrapped && hk.status === 'inspected') continue;
    batch.update(doc(db, 'properties', params.property.id, 'housekeeping_tasks', hk.id), {
      roomNumber: spec.roomNumber,
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Room Catalog',
      action: 'Synced Richgates Official Room Types & Rates (RM-1 to RM-8)',
      details: 'Applied Serviced Apartment Section & Hotel Rooms rates and official photography.',
      authorizedEmails: params.property.authorizedEmails,
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/rooms`);
  }
}

export async function createGuestRecord(params: {
  property: PropertyRecord;
  guest: Omit<GuestRecord, 'id' | 'propertyId' | 'authorizedEmails' | 'ownerUid'>;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('gst');
  const ref = doc(db, 'properties', params.property.id, 'guests', id);
  try {
    await setDoc(ref, {
      ...params.guest,
      propertyId: params.property.id,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guests',
      action: `Registered Guest ${params.guest.fullName}`,
      details: `VIP: ${params.guest.vipTier} · ID: ${params.guest.idType}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function createHousekeepingTask(params: {
  property: PropertyRecord;
  room: RoomRecord;
  taskType: HousekeepingTaskRecord['taskType'];
  assignedTo: string;
  priority: HousekeepingTaskRecord['priority'];
  notes: string;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('hk');
  const ref = doc(db, 'properties', params.property.id, 'housekeeping_tasks', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      roomId: params.room.id,
      roomNumber: params.room.roomNumber,
      taskType: params.taskType,
      assignedTo: params.assignedTo,
      priority: params.priority,
      status: 'pending',
      notes: params.notes,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function advanceHousekeepingTask(params: {
  property: PropertyRecord;
  task: HousekeepingTaskRecord;
  nextStatus: HousekeepingTaskRecord['status'];
  actorRole: string;
}) {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const taskRef = doc(db, 'properties', params.property.id, 'housekeeping_tasks', params.task.id);
  const roomRef = doc(db, 'properties', params.property.id, 'rooms', params.task.roomId);

  batch.update(taskRef, { status: params.nextStatus, updatedAt: now });
  const mappedRoomHk: RoomRecord['housekeepingStatus'] =
    params.nextStatus === 'in_progress'
      ? 'cleaning'
      : params.nextStatus === 'completed'
        ? 'clean'
        : params.nextStatus === 'inspected'
          ? 'inspected'
          : 'dirty';
  batch.update(roomRef, { housekeepingStatus: mappedRoomHk, updatedAt: now });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Housekeeping',
      action: `Room ${params.task.roomNumber} housekeeping -> ${mappedRoomHk}`,
      details: `${params.task.taskType} by ${params.task.assignedTo}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, taskRef.path);
  }
}

export async function submitPosOrderWorkflow(params: {
  property: PropertyRecord;
  serviceType: PosOrderRecord['serviceType'];
  tableOrRoom: string;
  linkedReservation?: ReservationRecord;
  itemsSummary: string;
  itemCount: number;
  subtotalNgn: number;
  paymentMethod: PosOrderRecord['paymentMethod'];
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('pos');
  const orderNumber = `POS-${Math.floor(100 + Math.random() * 899)}`;
  const vatNgn = Math.round(params.subtotalNgn * 0.075);
  const totalNgn = params.subtotalNgn + vatNgn;
  const isRoomFolio = params.paymentMethod === 'Room Folio' && params.linkedReservation;

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'pos_orders', id), {
    propertyId: params.property.id,
    orderNumber,
    serviceType: params.serviceType,
    tableOrRoom: params.tableOrRoom,
    reservationId: params.linkedReservation?.id || '',
    itemsSummary: params.itemsSummary.slice(0, 395),
    itemCount: params.itemCount,
    subtotalNgn: params.subtotalNgn,
    vatNgn,
    totalNgn,
    paymentStatus: isRoomFolio ? 'room_folio' : 'paid',
    paymentMethod: params.paymentMethod,
    kitchenStatus: 'queued',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  if (isRoomFolio && params.linkedReservation) {
    batch.update(doc(db, 'properties', params.property.id, 'reservations', params.linkedReservation.id), {
      posChargesNgn: params.linkedReservation.posChargesNgn + totalNgn,
      updatedAt: now,
    });
  } else {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: new Date().toISOString().slice(0, 10),
      entryType: 'revenue',
      category: 'Restaurant & Bar',
      reference: orderNumber,
      description: `${params.serviceType} (${params.tableOrRoom}) — ${params.itemsSummary.slice(0, 100)}`,
      amountNgn: totalNgn,
      vatNgn,
      paymentMethod: params.paymentMethod,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Restaurant POS',
      action: `Fired ${orderNumber} to Kitchen (${params.paymentMethod})`,
      details: `${params.tableOrRoom} · Total ₦${totalNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `properties/${params.property.id}/pos_orders/${id}`);
  }
}

export async function advanceKitchenOrder(params: {
  property: PropertyRecord;
  order: PosOrderRecord;
  nextKitchenStatus: PosOrderRecord['kitchenStatus'];
}) {
  const ref = doc(db, 'properties', params.property.id, 'pos_orders', params.order.id);
  try {
    await updateDoc(ref, {
      kitchenStatus: params.nextKitchenStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function createLedgerEntry(params: {
  property: PropertyRecord;
  entry: Omit<LedgerEntryRecord, 'id' | 'propertyId' | 'authorizedEmails' | 'ownerUid'>;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('led');
  const ref = doc(db, 'properties', params.property.id, 'ledger_entries', id);
  try {
    await setDoc(ref, {
      ...params.entry,
      propertyId: params.property.id,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Accounting',
      action: `Recorded ${params.entry.entryType} (${params.entry.category})`,
      details: `${params.entry.description} · ₦${params.entry.amountNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function createInventoryItem(params: {
  property: PropertyRecord;
  item: Omit<InventoryItemRecord, 'id' | 'propertyId' | 'authorizedEmails' | 'ownerUid'>;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('inv');
  const ref = doc(db, 'properties', params.property.id, 'inventory_items', id);
  try {
    await setDoc(ref, {
      ...params.item,
      propertyId: params.property.id,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Inventory',
      action: `Added SKU ${params.item.sku}`,
      details: `${params.item.name} · ${params.item.quantityOnHand} ${params.item.unit}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function adjustInventoryQty(params: {
  property: PropertyRecord;
  item: InventoryItemRecord;
  newQty: number;
}) {
  const ref = doc(db, 'properties', params.property.id, 'inventory_items', params.item.id);
  try {
    await updateDoc(ref, {
      quantityOnHand: Math.max(0, params.newQty),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function createPurchaseOrder(params: {
  property: PropertyRecord;
  supplierName: string;
  item?: InventoryItemRecord;
  itemName: string;
  quantity: number;
  unitCostNgn: number;
  expectedDate: string;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('po');
  const poNumber = `PO-RG-${Math.floor(500 + Math.random() * 499)}`;
  const totalCostNgn = params.quantity * params.unitCostNgn;
  const ref = doc(db, 'properties', params.property.id, 'purchase_orders', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      poNumber,
      supplierName: params.supplierName,
      itemId: params.item?.id || '',
      itemName: params.itemName,
      quantity: params.quantity,
      unitCostNgn: params.unitCostNgn,
      totalCostNgn,
      status: 'approved',
      expectedDate: params.expectedDate,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Procurement',
      action: `Issued ${poNumber}`,
      details: `${params.itemName} x${params.quantity} from ${params.supplierName} (₦${totalCostNgn.toLocaleString('en-NG')})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function receivePurchaseOrderWorkflow(params: {
  property: PropertyRecord;
  po: PurchaseOrderRecord;
  linkedItem?: InventoryItemRecord;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.update(doc(db, 'properties', params.property.id, 'purchase_orders', params.po.id), {
    status: 'received',
    updatedAt: now,
  });

  if (params.linkedItem) {
    batch.update(doc(db, 'properties', params.property.id, 'inventory_items', params.linkedItem.id), {
      quantityOnHand: params.linkedItem.quantityOnHand + params.po.quantity,
      updatedAt: now,
    });
  }

  const ledId = cleanId('led');
  batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
    propertyId: params.property.id,
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'expense',
    category: 'Procurement',
    reference: params.po.poNumber,
    description: `Received ${params.po.itemName} x${params.po.quantity} — ${params.po.supplierName}`,
    amountNgn: params.po.totalCostNgn,
    vatNgn: 0,
    paymentMethod: 'Bank Transfer',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Procurement',
      action: `Received ${params.po.poNumber} into Store & Ledger`,
      details: `${params.po.itemName} +${params.po.quantity} · Expense ₦${params.po.totalCostNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/purchase_orders/${params.po.id}`);
  }
}

export async function createStaffMember(params: {
  property: PropertyRecord;
  staff: Omit<StaffMemberRecord, 'id' | 'propertyId' | 'authorizedEmails' | 'ownerUid'>;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('stf');
  const ref = doc(db, 'properties', params.property.id, 'staff_members', id);
  try {
    await setDoc(ref, {
      ...params.staff,
      propertyId: params.property.id,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'HR & Staff',
      action: `Onboarded ${params.staff.fullName} (${params.staff.staffCode})`,
      details: `${params.staff.department} · Base ₦${params.staff.monthlyBaseSalaryNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function createShiftSchedule(params: {
  property: PropertyRecord;
  staff: StaffMemberRecord;
  shiftDate: string;
  shiftWindow: ShiftScheduleRecord['shiftWindow'];
}) {
  const { uid } = getActorContext();
  const id = cleanId('shf');
  const ref = doc(db, 'properties', params.property.id, 'shifts', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      staffId: params.staff.id,
      staffName: params.staff.fullName,
      department: params.staff.department,
      shiftDate: params.shiftDate,
      shiftWindow: params.shiftWindow,
      status: 'scheduled',
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function clockInStaff(params: {
  property: PropertyRecord;
  staff: StaffMemberRecord;
}) {
  const { uid } = getActorContext();
  const id = cleanId('att');
  const nowDate = new Date();
  const timeStr = nowDate.toTimeString().slice(0, 5);
  const ref = doc(db, 'properties', params.property.id, 'attendance', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      staffId: params.staff.id,
      staffName: params.staff.fullName,
      date: nowDate.toISOString().slice(0, 10),
      clockInTime: timeStr,
      status: 'present',
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function clockOutAttendance(params: {
  property: PropertyRecord;
  record: AttendanceRecord;
}) {
  const ref = doc(db, 'properties', params.property.id, 'attendance', params.record.id);
  try {
    await updateDoc(ref, {
      clockOutTime: new Date().toTimeString().slice(0, 5),
      status: 'clocked_out',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function runAndPostPayrollWorkflow(params: {
  property: PropertyRecord;
  periodLabel: string;
  staffList: StaffMemberRecord[];
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const activeStaff = params.staffList.filter((s) => s.employmentStatus === 'active');
  const grossPayNgn = activeStaff.reduce(
    (sum, s) => sum + s.monthlyBaseSalaryNgn + s.monthlyAllowanceNgn,
    0
  );
  const pensionDeductionNgn = Math.round(grossPayNgn * 0.08);
  const payeTaxNgn = Math.round(grossPayNgn * 0.09);
  const netPayNgn = grossPayNgn - pensionDeductionNgn - payeTaxNgn;

  const payId = cleanId('pay');
  const ledId = cleanId('led');
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'payroll_runs', payId), {
    propertyId: params.property.id,
    periodLabel: params.periodLabel,
    staffCount: activeStaff.length,
    grossPayNgn,
    pensionDeductionNgn,
    payeTaxNgn,
    netPayNgn,
    status: 'posted_to_ledger',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
    propertyId: params.property.id,
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'expense',
    category: 'Payroll',
    reference: payId.toUpperCase(),
    description: `Payroll disbursement (${params.periodLabel}) — ${activeStaff.length} staff`,
    amountNgn: grossPayNgn,
    vatNgn: 0,
    paymentMethod: 'Bank Transfer',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Payroll',
      action: `Posted ${params.periodLabel} Payroll`,
      details: `Gross ₦${grossPayNgn.toLocaleString('en-NG')} · Net ₦${netPayNgn.toLocaleString('en-NG')} · ${activeStaff.length} employees`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/payroll_runs/${payId}`);
  }
}

export async function createMaintenanceTicket(params: {
  property: PropertyRecord;
  room?: RoomRecord;
  locationLabel: string;
  issueTitle: string;
  category: MaintenanceTicketRecord['category'];
  priority: MaintenanceTicketRecord['priority'];
  assignedTo: string;
  estimatedCostNgn: number;
  markRoomOutOfOrder: boolean;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('mnt');
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'maintenance_tickets', id), {
    propertyId: params.property.id,
    roomId: params.room?.id || '',
    locationLabel: params.locationLabel,
    issueTitle: params.issueTitle,
    category: params.category,
    priority: params.priority,
    assignedTo: params.assignedTo,
    estimatedCostNgn: params.estimatedCostNgn,
    status: 'open',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  if (params.markRoomOutOfOrder && params.room) {
    batch.update(doc(db, 'properties', params.property.id, 'rooms', params.room.id), {
      occupancyStatus: 'out_of_order',
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Maintenance',
      action: `Opened Ticket: ${params.locationLabel}`,
      details: `${params.issueTitle} (${params.priority})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `properties/${params.property.id}/maintenance_tickets/${id}`);
  }
}

export async function resolveMaintenanceTicket(params: {
  property: PropertyRecord;
  ticket: MaintenanceTicketRecord;
  nextStatus: MaintenanceTicketRecord['status'];
  actorRole: string;
}) {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.update(doc(db, 'properties', params.property.id, 'maintenance_tickets', params.ticket.id), {
    status: params.nextStatus,
    updatedAt: now,
  });

  if (params.nextStatus === 'resolved' && params.ticket.roomId) {
    batch.update(doc(db, 'properties', params.property.id, 'rooms', params.ticket.roomId), {
      occupancyStatus: 'vacant',
      housekeepingStatus: 'dirty',
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Maintenance',
      action: `Ticket ${params.ticket.locationLabel} -> ${params.nextStatus}`,
      details: params.ticket.issueTitle,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `properties/${params.property.id}/maintenance_tickets/${params.ticket.id}`
    );
  }
}

export async function syncOtaChannelWorkflow(params: {
  property: PropertyRecord;
  channel: OtaIntegrationRecord;
  toggleConnect?: boolean;
  toggleAutoSync?: boolean;
  importSampleBooking?: boolean;
  availableRoom?: RoomRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', params.channel.id);
  const nextConnected = params.toggleConnect ? !params.channel.connected : params.channel.connected;
  const nextAutoSync = params.toggleAutoSync ? !params.channel.autoSync : params.channel.autoSync;
  const importedDelta = params.importSampleBooking ? 1 : 0;

  try {
    await updateDoc(ref, {
      connected: nextConnected,
      autoSync: nextAutoSync,
      lastSyncedIso: new Date().toISOString(),
      bookingsImported: params.channel.bookingsImported + importedDelta,
      updatedAt: serverTimestamp(),
    });

    if (params.importSampleBooking && params.availableRoom) {
      const today = new Date();
      const checkIn = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
      const checkOut = new Date(today.getTime() + 86400000 * 3).toISOString().slice(0, 10);
      await createReservationWorkflow({
        property: params.property,
        room: params.availableRoom,
        guestName: `${params.channel.channelName} Guest (${Math.floor(100 + Math.random() * 899)})`,
        guestPhone: '+234 803 555 0142',
        checkInDate: checkIn,
        checkOutDate: checkOut,
        nights: 2,
        adults: 2,
        channel:
          params.channel.channelName === 'Direct Website Engine'
            ? 'Direct Web'
            : params.channel.channelName,
        paymentMethod: 'Online Gateway',
        depositNgn: params.availableRoom.nightlyRateNgn * 2,
        immediateCheckIn: false,
        actorRole: params.actorRole,
      });
    }

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'OTA Channels',
      action: `Synced ${params.channel.channelName}`,
      details: `Connected: ${nextConnected} · AutoSync: ${nextAutoSync}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function createNewPropertyWithRooms(params: {
  name: string;
  code: string;
  city: string;
  state: string;
  address: string;
  adminEmail: string;
  roomCount: number;
  baseRateNgn: number;
  actorRole: string;
}) {
  const { uid, email } = getActorContext();
  const propId = cleanId(params.code.toLowerCase());
  const authorizedEmails = Array.from(
    new Set([
      ...BOOTSTRAPPED_ADMIN_EMAILS,
      email.toLowerCase(),
      params.adminEmail.trim().toLowerCase(),
    ].filter(Boolean))
  ).slice(0, 25);
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', propId), {
    name: params.name,
    code: params.code.toUpperCase(),
    city: params.city,
    state: params.state,
    country: 'Nigeria',
    address: params.address,
    phone: '+234 800 000 0000',
    email: params.adminEmail,
    currency: 'NGN',
    roomCount: params.roomCount,
    status: 'onboarding',
    licenseKey: '',
    licensePlan: 'Starter',
    adminEmail: params.adminEmail,
    authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  const count = Math.min(Math.max(params.roomCount, 1), 20);
  for (let i = 1; i <= count; i++) {
    const roomNum = `RM-${i}`;
    const roomId = `room-${100 + i}`;
    batch.set(doc(db, 'properties', propId, 'rooms', roomId), {
      propertyId: propId,
      roomNumber: roomNum,
      name: `Suite ${roomNum}`,
      roomType: i === count ? 'One Bedroom Suite' : 'Deluxe Studio',
      section: i <= 3 ? 'Serviced Apartment' : 'Hotel Rooms',
      floor: i <= 4 ? 1 : 2,
      nightlyRateNgn: params.baseRateNgn + (i - 1) * 5000,
      maxGuests: 2,
      occupancyStatus: 'vacant',
      housekeepingStatus: 'clean',
      imageUrl: '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png',
      amenities: ['King Bed', 'Wi-Fi', 'Smart TV', '24/7 Power'],
      authorizedEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });
  }

  batch.set(doc(db, 'properties', propId, 'ota_channels', 'ota-direct'), {
    propertyId: propId,
    channelName: 'Direct Website Engine',
    propertyListingId: `WEB-${params.code.toUpperCase()}`,
    commissionPct: 0,
    autoSync: true,
    connected: true,
    lastSyncedIso: new Date().toISOString(),
    bookingsImported: 0,
    authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: propId,
      actorRole: params.actorRole,
      module: 'Multi-Property Admin',
      action: `Provisioned Property: ${params.name}`,
      details: `${params.city}, ${params.state} · ${count} rooms initialized`,
      authorizedEmails,
    });
    return propId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `properties/${propId}`);
  }
}

export async function generateCentralLicense(params: {
  property: PropertyRecord;
  plan: LicenseRecord['plan'];
  billingCycle: LicenseRecord['billingCycle'];
  maxRooms: number;
  priceNgn: number;
  durationDays: number;
  autoActivate: boolean;
  actorRole: string;
}) {
  const { uid, email } = getActorContext();
  const id = cleanId('lic');
  const isLifetime = params.billingCycle === 'lifetime' || params.plan === 'Lifetime Sovereign';
  const licenseKey = generateLicenseKey(params.property.code, params.plan, isLifetime);
  const nowIso = new Date().toISOString().slice(0, 10);
  const expiresAt = isLifetime
    ? 'LIFETIME'
    : new Date(Date.now() + params.durationDays * 86400000).toISOString().slice(0, 10);

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'licenses', id), {
    licenseKey,
    propertyId: params.property.id,
    propertyName: params.property.name,
    plan: params.plan,
    billingCycle: isLifetime ? 'lifetime' : params.billingCycle,
    isLifetime,
    maxRooms: params.maxRooms,
    priceNgn: params.priceNgn,
    status: params.autoActivate ? 'active' : 'pending',
    issuedAt: nowIso,
    activatedAt: params.autoActivate ? nowIso : '',
    expiresAt,
    activatedByEmail: params.autoActivate ? email : '',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  if (params.autoActivate) {
    batch.update(doc(db, 'properties', params.property.id), {
      licenseKey,
      licensePlan: params.plan,
      status: 'active',
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'PureCrest Licensing',
      action: `Generated License ${licenseKey}`,
      details: `${params.plan} (${expiresAt}) for ${params.property.name}`,
      authorizedEmails: params.property.authorizedEmails,
    });
    return licenseKey;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `licenses/${id}`);
  }
}

export async function activateLicenseKeyWorkflow(params: {
  license: LicenseRecord;
  targetProperty: PropertyRecord;
  actorRole: string;
}) {
  const { email } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const nowIso = new Date().toISOString().slice(0, 10);

  batch.update(doc(db, 'licenses', params.license.id), {
    propertyId: params.targetProperty.id,
    propertyName: params.targetProperty.name,
    status: 'active',
    activatedAt: nowIso,
    activatedByEmail: email,
    updatedAt: now,
  });

  batch.update(doc(db, 'properties', params.targetProperty.id), {
    licenseKey: params.license.licenseKey,
    licensePlan: params.license.plan,
    status: 'active',
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.targetProperty.id,
      actorRole: params.actorRole,
      module: 'PureCrest Licensing',
      action: `Activated Key ${params.license.licenseKey}`,
      details: `Bound to ${params.targetProperty.name} (${params.license.plan})`,
      authorizedEmails: params.targetProperty.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `licenses/${params.license.id}`);
  }
}

export async function updateLicenseStatus(params: {
  license: LicenseRecord;
  nextStatus: LicenseRecord['status'];
  actorRole: string;
}) {
  const ref = doc(db, 'licenses', params.license.id);
  try {
    await updateDoc(ref, {
      status: params.nextStatus,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.license.propertyId,
      actorRole: params.actorRole,
      module: 'PureCrest Licensing',
      action: `License ${params.license.licenseKey} -> ${params.nextStatus}`,
      details: `${params.license.propertyName} (${params.license.plan})`,
      authorizedEmails: params.license.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function authorizeUserEmailForProperty(params: {
  property: PropertyRecord;
  email: string;
  displayName: string;
  role: StaffRole;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const normalizedEmail = params.email.trim().toLowerCase();
  const userDocId = normalizedEmail.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const nextEmails = Array.from(new Set([...params.property.authorizedEmails, normalizedEmail])).slice(0, 25);

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.update(doc(db, 'properties', params.property.id), {
    authorizedEmails: nextEmails,
    updatedAt: now,
  });

  batch.set(doc(db, 'users', userDocId), {
    uid: userDocId,
    email: normalizedEmail,
    displayName: params.displayName,
    role: params.role,
    propertyId: params.property.id,
    active: true,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'RBAC Access',
      action: `Granted ${params.role} to ${normalizedEmail}`,
      details: `Authorized on ${params.property.name}`,
      authorizedEmails: nextEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userDocId}`);
  }
}
