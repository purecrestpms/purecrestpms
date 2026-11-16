import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  BOOTSTRAPPED_ADMIN_EMAILS,
  isBootstrappedAdminEmail,
  OperationType,
  auth,
  db,
  handleFirestoreError,
  withFirestoreRetry,
} from '../firebase';
import { mergeCmsWithDefaults } from '../context/CmsContext';
import { buildRichgatesSeedPayload, generateLicenseKey, RICHGATES_PROPERTY_ID } from '../data/seedData';
import { deterministicOtaReservationId, ParsedIcalEvent, parseIcalEvents } from '../utils/icalParser';
import {
  ASSIGNABLE_ROLE_LABELS,
  AssignablePropertyRole,
  AttendanceRecord,
  BlockedDateRecord,
  ChannelCurrency,
  CmsContent,
  convertCurrencyToNgn,
  DEFAULT_CMS_CONTENT,
  DepartmentName,
  getFxRateToNgn,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  MessageRecipientScope,
  NavSectionId,
  OtaIntegrationRecord,
  PayrollRunRecord,
  PlanInquiryRecord,
  POS_MENU_ITEMS,
  PosMenuItemRecord,
  PosOrderRecord,
  PropertyMessageRecord,
  PropertyRecord,
  PropertyUserAccountRecord,
  PurchaseOrderRecord,
  ReservationRecord,
  RICHGATES_MAX_ROOMS,
  RICHGATES_OFFICIAL_ROOMS,
  RICHGATES_PROPERTY_INFO,
  ROLE_ALLOWED_SECTIONS,
  ROLE_TO_DEPARTMENT,
  RoomRecord,
  RoomSection,
  ShiftScheduleRecord,
  sortRoomsByNumber,
  StaffMemberRecord,
  StaffRole,
  UserRoleProfile,
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
    const snap = await withFirestoreRetry(() => getDoc(propRef), 4, 800);
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
  addSub('pos_menu_items', seed.posMenuItems);
  addSub('ledger_entries', seed.ledgerEntries);
  addSub('inventory_items', seed.inventoryItems);
  addSub('purchase_orders', seed.purchaseOrders);
  addSub('staff_members', seed.staffMembers);
  addSub('shifts', seed.shifts);
  addSub('attendance', seed.attendance);
  addSub('payroll_runs', seed.payrollRuns);
  addSub('maintenance_tickets', seed.maintenanceTickets);
  addSub('ota_channels', seed.otaChannels);
  addSub('messages', seed.messages);

  for (const aud of seed.auditLogs) {
    const { id, ...body } = aud;
    batch.set(doc(db, 'audit_logs', id), { ...body, createdAt: now });
  }

  try {
    await withFirestoreRetry(() => batch.commit(), 3, 800);
    return targetPropId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${targetPropId}/seed`);
  }
}

export async function createReservationWorkflow(params: {
  property: PropertyRecord;
  room?: RoomRecord;
  requestedRoomType?: string;
  nightlyRateNgn?: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  guestAddress?: string;
  guestCity?: string;
  guestNationality?: string;
  guestIdType?: GuestRecord['idType'];
  guestIdNumber?: string;
  checkInDate: string;
  checkOutDate: string;
  bookedDate?: string;
  nights: number;
  adults: number;
  children?: number;
  channel: ReservationRecord['channel'];
  paymentMethod: ReservationRecord['paymentMethod'];
  depositNgn: number;
  immediateCheckIn: boolean;
  initialStatus?: 'confirmed' | 'pending';
  paymentConfirmed?: boolean;
  idVerified?: boolean;
  keyIssued?: boolean;
  actorRole: string;
}) {
  if (params.immediateCheckIn && !params.room) {
    throw new Error('A physical room must be assigned for immediate front desk check-in.');
  }

  const { uid } = getActorContext();
  const resId = cleanId('res');
  const guestId = cleanId('gst');
  const todayIso = new Date().toISOString().slice(0, 10);
  const bookingRef = `RG-${Math.floor(1000 + Math.random() * 8999)}`;
  const effectiveRate = params.room?.nightlyRateNgn ?? params.nightlyRateNgn ?? 55000;
  const roomChargesNgn = effectiveRate * params.nights;
  const roomIdVal = params.room?.id || '';
  const roomNumberVal = params.room?.roomNumber || 'Unassigned';
  const requestedTypeVal =
    params.requestedRoomType || params.room?.roomType || 'Studio';
  const status: ReservationRecord['status'] = params.immediateCheckIn
    ? 'checked_in'
    : params.initialStatus || 'confirmed';
  const authEmails = params.property.authorizedEmails;

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'guests', guestId), {
    propertyId: params.property.id,
    fullName: params.guestName,
    email: params.guestEmail || '',
    phone: params.guestPhone || '+234 706 352 2668',
    address: params.guestAddress || '',
    city: params.guestCity || '',
    nationality: params.guestNationality || 'Nigeria',
    idType: params.guestIdType || 'NIN',
    idNumber: params.guestIdNumber || '',
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
    roomId: roomIdVal,
    roomNumber: roomNumberVal,
    requestedRoomType: requestedTypeVal,
    guestId,
    guestName: params.guestName,
    guestPhone: params.guestPhone || '+234 800 000 0000',
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    bookedDate: params.bookedDate || todayIso,
    nights: params.nights,
    adults: Math.max(1, Math.round(params.adults)),
    children: Math.max(0, Math.round(params.children || 0)),
    channel: params.channel,
    nightlyRateNgn: effectiveRate,
    roomChargesNgn,
    posChargesNgn: 0,
    paidNgn: params.depositNgn,
    status,
    paymentMethod: params.paymentMethod,
    ...(params.guestIdType ? { idType: params.guestIdType } : {}),
    ...(params.guestIdNumber ? { idNumber: params.guestIdNumber } : {}),
    ...(params.immediateCheckIn
      ? {
          paymentConfirmed: params.paymentConfirmed ?? true,
          idVerified: params.idVerified ?? true,
          keyIssued: params.keyIssued ?? true,
          checkedInAtIso: new Date().toISOString(),
        }
      : {}),
    authorizedEmails: authEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  if (params.room) {
    if (params.immediateCheckIn) {
      batch.update(doc(db, 'properties', params.property.id, 'rooms', params.room.id), {
        occupancyStatus: 'occupied',
        currentGuestName: params.guestName,
        currentReservationId: resId,
        updatedAt: now,
      });
    } else if (status === 'confirmed' && params.checkInDate <= todayIso && params.room.occupancyStatus === 'vacant') {
      batch.update(doc(db, 'properties', params.property.id, 'rooms', params.room.id), {
        occupancyStatus: 'reserved',
        currentGuestName: params.guestName,
        currentReservationId: resId,
        updatedAt: now,
      });
    }
  }

  if (params.depositNgn > 0) {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: new Date().toISOString().slice(0, 10),
      entryType: 'revenue',
      category: 'Room Accommodation',
      reference: bookingRef,
      description: `${params.room ? `Room ${params.room.roomNumber}` : requestedTypeVal} booking payment — ${params.guestName}`,
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
      action: params.immediateCheckIn
        ? `Walk-In Check-In Room ${roomNumberVal}`
        : `New Booking ${bookingRef}`,
      details: `${params.guestName} · ${roomNumberVal} (${requestedTypeVal}) · ${params.nights} nights · ${params.channel}`,
      authorizedEmails: authEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/reservations/${resId}`);
  }
}

export async function transitionReservationStatus(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  room?: RoomRecord;
  nextStatus: ReservationRecord['status'];
  settlementAmountNgn?: number;
  paymentMethod?: ReservationRecord['paymentMethod'];
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  const hasRoom = Boolean(params.reservation.roomId);
  const roomRef = hasRoom
    ? doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId)
    : null;

  const extraPayment = params.settlementAmountNgn || 0;
  const newPaid = params.reservation.paidNgn + extraPayment;

  batch.update(resRef, {
    status: params.nextStatus,
    paidNgn: newPaid,
    paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
    updatedAt: now,
  });

  const isRoomHoldingThisRes =
    hasRoom &&
    (!params.room ||
      !params.room.currentReservationId ||
      params.room.currentReservationId === params.reservation.id);

  if (params.nextStatus === 'checked_in' && roomRef) {
    batch.update(roomRef, {
      occupancyStatus: 'occupied',
      currentGuestName: params.reservation.guestName,
      currentReservationId: params.reservation.id,
      updatedAt: now,
    });
  } else if (params.nextStatus === 'confirmed' && isRoomHoldingThisRes && roomRef) {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (params.reservation.checkInDate <= todayIso) {
      batch.update(roomRef, {
        occupancyStatus: 'reserved',
        currentGuestName: params.reservation.guestName,
        currentReservationId: params.reservation.id,
        updatedAt: now,
      });
    }
  } else if (params.nextStatus === 'checked_out') {
    if (roomRef) {
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
        assignedTo: 'Housekeeping Team',
        priority: 'High',
        status: 'pending',
        notes: `Auto-generated on checkout of ${params.reservation.guestName} (${params.reservation.bookingRef})`,
        authorizedEmails: params.property.authorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (extraPayment > 0) {
      const ledId = cleanId('led');
      batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
        propertyId: params.property.id,
        entryDate: new Date().toISOString().slice(0, 10),
        entryType: 'revenue',
        category: 'Room Accommodation',
        reference: params.reservation.bookingRef,
        description: `Final checkout settlement ${params.reservation.roomNumber} — ${params.reservation.guestName}`,
        amountNgn: extraPayment,
        vatNgn: Math.round(extraPayment * 0.075),
        paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
        authorizedEmails: params.property.authorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else if (
    (params.nextStatus === 'cancelled' || params.nextStatus === 'no_show') &&
    isRoomHoldingThisRes &&
    roomRef
  ) {
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
      details: `${params.reservation.roomNumber} · ${params.reservation.guestName} · Settled +₦${extraPayment.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function completeCheckInWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  room?: RoomRecord;
  assignedRoom?: RoomRecord;
  guest?: GuestRecord;
  paymentReceivedNgn: number;
  paymentMethod: ReservationRecord['paymentMethod'];
  paymentConfirmed: boolean;
  idVerified: boolean;
  idType: GuestRecord['idType'];
  idNumber: string;
  keyIssued: boolean;
  roomReadyConfirmed: boolean;
  actorRole: string;
}) {
  if (!params.paymentConfirmed || !params.idVerified || !params.keyIssued || !params.roomReadyConfirmed) {
    throw new Error(
      'All check-in steps (confirm payment, verify guest ID, assign room, and issue key = Yes) must be completed.'
    );
  }

  const targetRoom = params.assignedRoom || params.room;
  const targetRoomId = targetRoom?.id || params.reservation.roomId;
  const targetRoomNumber = targetRoom?.roomNumber || params.reservation.roomNumber;
  if (!targetRoomId) {
    throw new Error('Please assign an available room or suite before completing check-in.');
  }

  const { uid } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const hadPreviousRoom = Boolean(params.reservation.roomId);
  const roomChanged = targetRoomId !== params.reservation.roomId;

  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  const targetRoomRef = doc(db, 'properties', params.property.id, 'rooms', targetRoomId);

  const extraPayment = Math.max(0, Math.round(params.paymentReceivedNgn));
  const newPaid = params.reservation.paidNgn + extraPayment;
  const cleanIdNumber = params.idNumber.trim().slice(0, 64);
  const nextNightlyRate =
    roomChanged && targetRoom ? targetRoom.nightlyRateNgn : params.reservation.nightlyRateNgn;
  const nextRoomCharges = nextNightlyRate * params.reservation.nights;

  batch.update(resRef, {
    roomId: targetRoomId,
    roomNumber: targetRoomNumber,
    ...(targetRoom?.roomType ? { requestedRoomType: targetRoom.roomType } : {}),
    nightlyRateNgn: nextNightlyRate,
    roomChargesNgn: nextRoomCharges,
    status: 'checked_in',
    paidNgn: newPaid,
    paymentMethod: params.paymentMethod,
    paymentConfirmed: true,
    idVerified: true,
    idType: params.idType,
    idNumber: cleanIdNumber,
    keyIssued: true,
    checkedInAtIso: new Date().toISOString(),
    updatedAt: now,
  });

  if (roomChanged && hadPreviousRoom) {
    const oldRoomRef = doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId);
    batch.update(oldRoomRef, {
      occupancyStatus: 'vacant',
      currentGuestName: '',
      currentReservationId: '',
      updatedAt: now,
    });
  }

  const nextHkStatus: RoomRecord['housekeepingStatus'] =
    targetRoom?.housekeepingStatus === 'inspected' ? 'inspected' : 'clean';

  batch.update(targetRoomRef, {
    occupancyStatus: 'occupied',
    housekeepingStatus: nextHkStatus,
    currentGuestName: params.reservation.guestName,
    currentReservationId: params.reservation.id,
    updatedAt: now,
  });

  if (params.guest) {
    batch.update(doc(db, 'properties', params.property.id, 'guests', params.guest.id), {
      idType: params.idType,
      idNumber: cleanIdNumber,
      totalStays: params.guest.totalStays + 1,
      lifetimeSpendNgn: params.guest.lifetimeSpendNgn + extraPayment,
      updatedAt: now,
    });
  }

  if (extraPayment > 0) {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: new Date().toISOString().slice(0, 10),
      entryType: 'revenue',
      category: 'Room Accommodation',
      reference: params.reservation.bookingRef,
      description: `Check-in payment Room ${targetRoomNumber} — ${params.reservation.guestName}`,
      amountNgn: extraPayment,
      vatNgn: Math.round(extraPayment * 0.075),
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
      module: 'Check-In Verification',
      action: `Checked In ${params.reservation.bookingRef} (${targetRoomNumber})`,
      details: `Room ${targetRoomNumber}${roomChanged ? ` (assigned from ${params.reservation.roomNumber || 'Unassigned'})` : ''} · ${params.reservation.guestName} · Key Issued: Yes · ID ${params.idType} (${cleanIdNumber}) · Paid +₦${extraPayment.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function changeInHouseRoomWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  newRoom: RoomRecord;
  adjustRateToNewRoom: boolean;
  reason: string;
  actorRole: string;
}) {
  if (params.newRoom.id === params.reservation.roomId) {
    throw new Error('Selected room is already assigned to this guest.');
  }
  const batch = writeBatch(db);
  const now = serverTimestamp();

  const newRoomRef = doc(db, 'properties', params.property.id, 'rooms', params.newRoom.id);
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);

  const nextRate = params.adjustRateToNewRoom
    ? params.newRoom.nightlyRateNgn
    : params.reservation.nightlyRateNgn;
  const nextRoomCharges = nextRate * params.reservation.nights;

  if (params.reservation.roomId) {
    const oldRoomRef = doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId);
    batch.update(oldRoomRef, {
      occupancyStatus: 'vacant',
      housekeepingStatus: 'dirty',
      currentGuestName: '',
      currentReservationId: '',
      updatedAt: now,
    });
  }

  batch.update(newRoomRef, {
    occupancyStatus: 'occupied',
    currentGuestName: params.reservation.guestName,
    currentReservationId: params.reservation.id,
    updatedAt: now,
  });

  batch.update(resRef, {
    roomId: params.newRoom.id,
    roomNumber: params.newRoom.roomNumber,
    requestedRoomType: params.newRoom.roomType,
    nightlyRateNgn: nextRate,
    roomChargesNgn: nextRoomCharges,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Front Desk Room Move',
      action: `Changed Room ${params.reservation.roomNumber} -> ${params.newRoom.roomNumber}`,
      details: `${params.reservation.bookingRef} (${params.reservation.guestName}) · Rate ₦${nextRate.toLocaleString('en-NG')}/nt · ${params.reason || 'Guest room move'}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function updateReservationDetailsWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  newRoom?: RoomRecord;
  clearRoomAssignment?: boolean;
  requestedRoomType?: string;
  oldRoom?: RoomRecord;
  guestName?: string;
  guestPhone?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults?: number;
  children?: number;
  channel: ReservationRecord['channel'];
  status?: ReservationRecord['status'];
  paymentMethod?: ReservationRecord['paymentMethod'];
  actorRole: string;
}) {
  const safeNights = Math.max(1, Math.round(params.nights));
  const safeAdults = Math.max(1, Math.round(params.adults ?? params.reservation.adults));
  const safeChildren = Math.max(0, Math.round(params.children ?? (params.reservation.children || 0)));
  const targetRoomId = params.clearRoomAssignment
    ? ''
    : params.newRoom
      ? params.newRoom.id
      : params.reservation.roomId;
  const targetRoomNumber = params.clearRoomAssignment
    ? 'Unassigned'
    : params.newRoom
      ? params.newRoom.roomNumber
      : params.reservation.roomNumber;
  const nextRequestedRoomType =
    params.requestedRoomType ||
    params.newRoom?.roomType ||
    params.reservation.requestedRoomType ||
    'Studio';
  const roomChanged = targetRoomId !== params.reservation.roomId;
  const nextNightlyRate =
    roomChanged && params.newRoom
      ? params.newRoom.nightlyRateNgn
      : params.reservation.nightlyRateNgn;
  const nextRoomCharges = nextNightlyRate * safeNights;
  const nextStatus = params.status || params.reservation.status;
  const nextGuestName = (params.guestName || params.reservation.guestName).trim();
  const nextGuestPhone = (params.guestPhone ?? params.reservation.guestPhone ?? '').trim();

  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);

  batch.update(resRef, {
    roomId: targetRoomId,
    roomNumber: targetRoomNumber,
    requestedRoomType: nextRequestedRoomType,
    guestName: nextGuestName,
    guestPhone: nextGuestPhone,
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    nights: safeNights,
    adults: safeAdults,
    children: safeChildren,
    nightlyRateNgn: nextNightlyRate,
    roomChargesNgn: nextRoomCharges,
    channel: params.channel,
    status: nextStatus,
    paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
    updatedAt: now,
  });

  const hadOldRoom = Boolean(params.reservation.roomId);
  const oldRoomHolding =
    hadOldRoom &&
    (!params.oldRoom ||
      !params.oldRoom.currentReservationId ||
      params.oldRoom.currentReservationId === params.reservation.id);

  if (nextStatus === 'cancelled' || nextStatus === 'no_show' || nextStatus === 'checked_out') {
    if (oldRoomHolding) {
      batch.update(doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId), {
        occupancyStatus: 'vacant',
        currentGuestName: '',
        currentReservationId: '',
        ...(nextStatus === 'checked_out' ? { housekeepingStatus: 'dirty' } : {}),
        updatedAt: now,
      });
    }
  } else if (roomChanged) {
    if (oldRoomHolding) {
      batch.update(doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId), {
        occupancyStatus: 'vacant',
        currentGuestName: '',
        currentReservationId: '',
        updatedAt: now,
      });
    }
    if (params.newRoom && (nextStatus === 'checked_in' || nextStatus === 'confirmed')) {
      batch.update(doc(db, 'properties', params.property.id, 'rooms', params.newRoom.id), {
        occupancyStatus: nextStatus === 'checked_in' ? 'occupied' : 'reserved',
        currentGuestName: nextGuestName,
        currentReservationId: params.reservation.id,
        updatedAt: now,
      });
    }
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Reservations',
      action: `Edited Reservation ${params.reservation.bookingRef}`,
      details: `${nextGuestName} · ${targetRoomNumber} (${nextRequestedRoomType}) · ${params.checkInDate} → ${params.checkOutDate} (${safeNights}n, ${safeAdults}A/${safeChildren}C) · ${params.channel} · ${nextStatus}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function recordReservationFolioPayment(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  amountNgn: number;
  paymentMethod: ReservationRecord['paymentMethod'];
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const amount = Math.max(0, Math.round(params.amountNgn));
  if (amount <= 0) return;

  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  const ledId = cleanId('led');

  batch.update(resRef, {
    paidNgn: params.reservation.paidNgn + amount,
    paymentMethod: params.paymentMethod,
    updatedAt: now,
  });

  batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
    propertyId: params.property.id,
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'revenue',
    category: 'Room Accommodation',
    reference: params.reservation.bookingRef,
    description: `Folio payment ${params.reservation.roomNumber} — ${params.reservation.guestName}`,
    amountNgn: amount,
    vatNgn: Math.round(amount * 0.075),
    paymentMethod: params.paymentMethod,
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
      module: 'Guest Folio',
      action: `Recorded Payment ${params.reservation.bookingRef}`,
      details: `+₦${amount.toLocaleString('en-NG')} via ${params.paymentMethod}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function addMiscFolioCharge(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  amountNgn: number;
  description: string;
  actorRole: string;
}) {
  const amount = Math.max(0, Math.round(params.amountNgn));
  if (amount <= 0) return;
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  try {
    await updateDoc(resRef, {
      posChargesNgn: params.reservation.posChargesNgn + amount,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guest Folio',
      action: `Posted Folio Charge ${params.reservation.bookingRef}`,
      details: `${params.description} · +₦${amount.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function extendReservationStay(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  extraNights: number;
  actorRole: string;
}) {
  const delta = Math.max(1, Math.round(params.extraNights));
  const nextNights = params.reservation.nights + delta;
  const nextRoomCharges = params.reservation.roomChargesNgn + params.reservation.nightlyRateNgn * delta;
  const [y, m, d] = params.reservation.checkOutDate.split('-').map(Number);
  const nextOut = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + delta)).toISOString().slice(0, 10);
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  try {
    await updateDoc(resRef, {
      checkOutDate: nextOut,
      nights: nextNights,
      roomChargesNgn: nextRoomCharges,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Front Desk',
      action: `Extended Stay ${params.reservation.bookingRef}`,
      details: `+${delta} night(s) -> Checkout ${nextOut}`,
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

export async function createRoomWorkflow(params: {
  property: PropertyRecord;
  currentRoomCount: number;
  maxRooms: number;
  roomNumber: string;
  name: string;
  roomType: string;
  section: RoomSection;
  floor: number;
  nightlyRateNgn: number;
  maxGuests: number;
  imageUrl: string;
  amenities: string[];
  actorRole: string;
}) {
  const effectiveMax =
    params.property.code === 'RG-ENU-01'
      ? Math.min(params.maxRooms || RICHGATES_MAX_ROOMS, RICHGATES_MAX_ROOMS)
      : Math.max(1, params.maxRooms || 250);

  if (params.currentRoomCount >= effectiveMax) {
    throw new Error(
      `License room limit reached: ${params.property.name} is licensed for a maximum of ${effectiveMax} rooms.`
    );
  }

  const { uid } = getActorContext();
  const id = cleanId('room');
  const roomCode = params.roomNumber.trim().toUpperCase().slice(0, 16);
  const cleanTitle = params.name.trim().slice(0, 80);
  const cleanType = params.roomType.trim().slice(0, 64);
  const cleanAmenities = params.amenities
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 15);
  const nextCount = Math.min(500, params.currentRoomCount + 1);

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'rooms', id), {
    propertyId: params.property.id,
    roomNumber: roomCode,
    name: cleanTitle,
    roomType: cleanType,
    section: params.section,
    floor: Math.max(0, Math.min(50, Math.round(params.floor))),
    nightlyRateNgn: Math.max(5000, Math.round(params.nightlyRateNgn)),
    maxGuests: Math.max(1, Math.min(12, Math.round(params.maxGuests))),
    occupancyStatus: 'vacant',
    housekeepingStatus: 'clean',
    currentGuestName: '',
    currentReservationId: '',
    imageUrl: params.imageUrl.trim(),
    amenities: cleanAmenities.length > 0 ? cleanAmenities : ['King Bed', 'Wi-Fi', '24/7 Power'],
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.update(doc(db, 'properties', params.property.id), {
    roomCount: nextCount,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Rooms',
      action: `Added New Room ${roomCode}`,
      details: `${cleanTitle} (${cleanType} · ${params.section}) · ₦${Math.round(params.nightlyRateNgn).toLocaleString('en-NG')}/nt · ${nextCount}/${effectiveMax} licensed rooms`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `properties/${params.property.id}/rooms/${id}`);
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

export async function syncRichgatesPropertyInfoIfNeeded(property: PropertyRecord): Promise<boolean> {
  if (property.code !== 'RG-ENU-01') return false;
  const needsUpdate =
    property.address !== RICHGATES_PROPERTY_INFO.address ||
    property.phone !== RICHGATES_PROPERTY_INFO.phone ||
    property.whatsapp !== RICHGATES_PROPERTY_INFO.whatsapp ||
    property.email !== RICHGATES_PROPERTY_INFO.email;
  if (!needsUpdate) return false;

  const ref = doc(db, 'properties', property.id);
  try {
    await updateDoc(ref, {
      address: RICHGATES_PROPERTY_INFO.address,
      phone: RICHGATES_PROPERTY_INFO.phone,
      whatsapp: RICHGATES_PROPERTY_INFO.whatsapp,
      email: RICHGATES_PROPERTY_INFO.email,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function updatePropertyProfile(params: {
  property: PropertyRecord;
  updates: Partial<Pick<PropertyRecord, 'name' | 'address' | 'phone' | 'whatsapp' | 'email' | 'logoUrl'>>;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id);
  try {
    await updateDoc(ref, {
      ...params.updates,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Property Profile',
      action: params.updates.logoUrl !== undefined ? 'Updated Property Profile & Logo' : 'Updated Property Contact Info',
      details: `${params.updates.address || params.property.address} · ${params.updates.phone || params.property.phone || ''}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function updatePropertyUsdRateWorkflow(params: {
  property: PropertyRecord;
  usdExchangeRateNgn: number;
  usdRateSource: string;
  actorRole: string;
}) {
  const safeRate = Math.max(100, Math.min(100000, Math.round(params.usdExchangeRateNgn * 100) / 100));
  const nowIso = new Date().toISOString();
  const ref = doc(db, 'properties', params.property.id);
  try {
    await updateDoc(ref, {
      usdExchangeRateNgn: safeRate,
      usdRateUpdatedIso: nowIso,
      usdRateSource: params.usdRateSource.trim().slice(0, 64),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Currency & FX',
      action: 'Updated Daily USD Exchange Rate',
      details: `1 USD = ₦${safeRate.toLocaleString()} (${params.usdRateSource})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function saveMyUserProfile(params: {
  propertyId: string;
  role: StaffRole;
  existingProfile: UserRoleProfile | null;
  displayName: string;
  phone: string;
  whatsapp: string;
  jobTitle: string;
  notes: string;
}) {
  const { uid, email } = getActorContext();
  const docId = params.existingProfile?.id || uid;
  const ref = doc(db, 'users', docId);
  try {
    if (params.existingProfile) {
      await updateDoc(ref, {
        displayName: params.displayName.trim(),
        phone: params.phone.trim(),
        whatsapp: params.whatsapp.trim(),
        jobTitle: params.jobTitle.trim(),
        notes: params.notes.trim(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const safeRole: StaffRole = isBootstrappedAdminEmail(email) ? params.role : 'front_desk';
      await setDoc(ref, {
        uid,
        email: email.toLowerCase(),
        displayName: params.displayName.trim(),
        phone: params.phone.trim(),
        whatsapp: params.whatsapp.trim(),
        jobTitle: params.jobTitle.trim(),
        notes: params.notes.trim(),
        role: safeRole,
        propertyId: params.propertyId,
        active: true,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ref.path);
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

export async function updateGuestRecord(params: {
  property: PropertyRecord;
  guest: GuestRecord;
  updates: Partial<
    Pick<
      GuestRecord,
      'fullName' | 'email' | 'phone' | 'address' | 'city' | 'nationality' | 'idType' | 'idNumber' | 'vipTier' | 'notes'
    >
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'guests', params.guest.id);
  try {
    await updateDoc(ref, {
      ...params.updates,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guest Profile',
      action: `Updated Guest Profile: ${params.updates.fullName || params.guest.fullName}`,
      details: `Tier: ${params.updates.vipTier || params.guest.vipTier} · Phone: ${params.updates.phone || params.guest.phone}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
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

export async function syncDefaultPosMenuIfNeeded(property: PropertyRecord): Promise<boolean> {
  try {
    const colRef = collection(db, 'properties', property.id, 'pos_menu_items');
    const snap = await getDocs(colRef);
    if (!snap.empty) return false;
    const { uid } = getActorContext();
    const batch = writeBatch(db);
    const now = serverTimestamp();
    for (const item of POS_MENU_ITEMS) {
      batch.set(doc(db, 'properties', property.id, 'pos_menu_items', item.id), {
        propertyId: property.id,
        name: item.name,
        category: item.category,
        priceNgn: item.priceNgn,
        costNgn: item.costNgn ?? 0,
        prepMinutes: item.prepMinutes,
        available: item.available ?? true,
        authorizedEmails: property.authorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
    return true;
  } catch {
    return false;
  }
}

export async function createPosMenuItemWorkflow(params: {
  property: PropertyRecord;
  name: string;
  category: string;
  priceNgn: number;
  costNgn: number;
  prepMinutes: number;
  available: boolean;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('menu');
  const ref = doc(db, 'properties', params.property.id, 'pos_menu_items', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      name: params.name.trim().slice(0, 120),
      category: params.category.trim().slice(0, 48) || 'Nigerian Kitchen',
      priceNgn: Math.max(0, Math.round(params.priceNgn)),
      costNgn: Math.max(0, Math.round(params.costNgn)),
      prepMinutes: Math.max(0, Math.min(240, Math.round(params.prepMinutes))),
      available: params.available,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Restaurant POS',
      action: `Added POS Menu Item: ${params.name.trim()}`,
      details: `${params.category} · ₦${Math.round(params.priceNgn).toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function updatePosMenuItemWorkflow(params: {
  property: PropertyRecord;
  item: PosMenuItemRecord;
  updates: {
    name: string;
    category: string;
    priceNgn: number;
    costNgn: number;
    prepMinutes: number;
    available: boolean;
  };
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'pos_menu_items', params.item.id);
  try {
    await updateDoc(ref, {
      name: params.updates.name.trim().slice(0, 120),
      category: params.updates.category.trim().slice(0, 48) || 'Nigerian Kitchen',
      priceNgn: Math.max(0, Math.round(params.updates.priceNgn)),
      costNgn: Math.max(0, Math.round(params.updates.costNgn)),
      prepMinutes: Math.max(0, Math.min(240, Math.round(params.updates.prepMinutes))),
      available: params.updates.available,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Restaurant POS',
      action: `Updated POS Menu Item: ${params.updates.name.trim()}`,
      details: `${params.updates.category} · ₦${Math.round(params.updates.priceNgn).toLocaleString('en-NG')} · ${params.updates.available ? 'Available' : 'Unavailable'}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deletePosMenuItemWorkflow(params: {
  property: PropertyRecord;
  item: PosMenuItemRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'pos_menu_items', params.item.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Restaurant POS',
      action: `Removed POS Menu Item: ${params.item.name}`,
      details: `${params.item.category} · ₦${params.item.priceNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export async function recordPosPurchaseWorkflow(params: {
  property: PropertyRecord;
  itemDescription: string;
  supplierName: string;
  category: 'Restaurant & Bar' | 'Procurement';
  amountNgn: number;
  paymentMethod: string;
  entryDate: string;
  linkedInventoryItem?: InventoryItemRecord;
  restockQty?: number;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const ledId = cleanId('led');
  const refLabel = `POS-PUR-${Math.floor(100 + Math.random() * 899)}`;
  const cleanAmount = Math.max(0, Math.round(params.amountNgn));
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
    propertyId: params.property.id,
    entryDate: params.entryDate || new Date().toISOString().slice(0, 10),
    entryType: 'expense',
    category: params.category,
    reference: refLabel,
    description: `${params.itemDescription.trim().slice(0, 150)} — ${params.supplierName.trim().slice(0, 70)}`,
    amountNgn: cleanAmount,
    vatNgn: 0,
    paymentMethod: params.paymentMethod || 'Cash NGN',
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  if (params.linkedInventoryItem && (params.restockQty || 0) > 0) {
    const qtyDelta = Math.max(0, Number(params.restockQty || 0));
    batch.update(
      doc(db, 'properties', params.property.id, 'inventory_items', params.linkedInventoryItem.id),
      {
        quantityOnHand: params.linkedInventoryItem.quantityOnHand + qtyDelta,
        updatedAt: now,
      }
    );
  }

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Restaurant POS & Supply',
      action: `Recorded POS Purchase ${refLabel}`,
      details: `${params.itemDescription.trim()} (${params.supplierName.trim()}) · ₦${cleanAmount.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `properties/${params.property.id}/ledger_entries/${ledId}`);
  }
}

export async function submitPosOrderWorkflow(params: {
  property: PropertyRecord;
  serviceType: PosOrderRecord['serviceType'];
  tableOrRoom: string;
  guestName?: string;
  notes?: string;
  linkedReservation?: ReservationRecord;
  itemsSummary: string;
  itemCount: number;
  subtotalNgn: number;
  paymentMethod: PosOrderRecord['paymentMethod'];
  actorRole: string;
}): Promise<PosOrderRecord | undefined> {
  const { uid } = getActorContext();
  const id = cleanId('pos');
  const orderNumber = `POS-${Math.floor(100 + Math.random() * 899)}`;
  const orderDate = new Date().toISOString().slice(0, 10);
  const vatNgn = Math.round(params.subtotalNgn * 0.075);
  const totalNgn = params.subtotalNgn + vatNgn;
  const isRoomFolio = Boolean(params.paymentMethod === 'Room Folio' && params.linkedReservation);
  const paymentStatus: PosOrderRecord['paymentStatus'] = isRoomFolio ? 'room_folio' : 'paid';
  const cleanGuestName =
    params.guestName?.trim() || params.linkedReservation?.guestName || 'Walk-in Guest';

  const batch = writeBatch(db);
  const now = serverTimestamp();

  const payload = {
    propertyId: params.property.id,
    orderNumber,
    orderDate,
    serviceType: params.serviceType,
    tableOrRoom: params.tableOrRoom.trim().slice(0, 64) || 'Lounge',
    guestName: cleanGuestName.slice(0, 120),
    reservationId: params.linkedReservation?.id || '',
    itemsSummary: params.itemsSummary.slice(0, 395),
    itemCount: params.itemCount,
    subtotalNgn: params.subtotalNgn,
    vatNgn,
    totalNgn,
    paymentStatus,
    paymentMethod: params.paymentMethod,
    kitchenStatus: 'queued' as const,
    ...(params.notes?.trim() ? { notes: params.notes.trim().slice(0, 300) } : {}),
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(doc(db, 'properties', params.property.id, 'pos_orders', id), payload);

  if (isRoomFolio && params.linkedReservation) {
    batch.update(doc(db, 'properties', params.property.id, 'reservations', params.linkedReservation.id), {
      posChargesNgn: params.linkedReservation.posChargesNgn + totalNgn,
      updatedAt: now,
    });
  } else {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: orderDate,
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
    return {
      id,
      propertyId: params.property.id,
      orderNumber,
      orderDate,
      serviceType: params.serviceType,
      tableOrRoom: params.tableOrRoom.trim().slice(0, 64) || 'Lounge',
      guestName: cleanGuestName,
      reservationId: params.linkedReservation?.id || '',
      itemsSummary: params.itemsSummary.slice(0, 395),
      itemCount: params.itemCount,
      subtotalNgn: params.subtotalNgn,
      vatNgn,
      totalNgn,
      paymentStatus,
      paymentMethod: params.paymentMethod,
      kitchenStatus: 'queued',
      notes: params.notes?.trim() || undefined,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
    };
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

export async function closeShiftWorkflow(params: {
  property: PropertyRecord;
  shift: ShiftScheduleRecord;
  handoverNotes: string;
  actorRole: string;
}) {
  const { email } = getActorContext();
  const ref = doc(db, 'properties', params.property.id, 'shifts', params.shift.id);
  const closedAtIso = new Date().toISOString();
  const cleanNotes = params.handoverNotes.trim().slice(0, 400);
  try {
    await updateDoc(ref, {
      status: 'completed',
      handoverNotes: cleanNotes,
      closedBy: email,
      closedAtIso,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Shifts & Attendance',
      action: `Closed Shift: ${params.shift.staffName}`,
      details: `${params.shift.shiftDate} · ${params.shift.shiftWindow}${cleanNotes ? ` · Notes: ${cleanNotes}` : ''}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
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

export async function updateStaffSalary(params: {
  property: PropertyRecord;
  staff: StaffMemberRecord;
  monthlyBaseSalaryNgn: number;
  monthlyAllowanceNgn: number;
  employmentStatus?: StaffMemberRecord['employmentStatus'];
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'staff_members', params.staff.id);
  try {
    await updateDoc(ref, {
      monthlyBaseSalaryNgn: Math.max(0, Math.round(params.monthlyBaseSalaryNgn)),
      monthlyAllowanceNgn: Math.max(0, Math.round(params.monthlyAllowanceNgn)),
      ...(params.employmentStatus ? { employmentStatus: params.employmentStatus } : {}),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Payroll',
      action: `Updated Monthly Salary for ${params.staff.fullName}`,
      details: `Base ₦${params.monthlyBaseSalaryNgn.toLocaleString('en-NG')} + Allowance ₦${params.monthlyAllowanceNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function runAndPostPayrollWorkflow(params: {
  property: PropertyRecord;
  periodLabel: string;
  payDate?: string;
  paymentMethod?: string;
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
  const effectivePayDate = params.payDate || new Date().toISOString().slice(0, 10);
  const effectiveMethod = params.paymentMethod || 'Bank Transfer';

  const payId = cleanId('pay');
  const ledId = cleanId('led');
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'payroll_runs', payId), {
    propertyId: params.property.id,
    periodLabel: params.periodLabel,
    payDate: effectivePayDate,
    paymentMethod: effectiveMethod,
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
    entryDate: effectivePayDate,
    entryType: 'expense',
    category: 'Payroll',
    reference: payId.toUpperCase(),
    description: `Monthly Payroll (${params.periodLabel}) — ${activeStaff.length} employees · Pay Date ${effectivePayDate}`,
    amountNgn: grossPayNgn,
    vatNgn: 0,
    paymentMethod: effectiveMethod,
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
      action: `Posted ${params.periodLabel} Monthly Payroll`,
      details: `Pay Date ${effectivePayDate} · Gross ₦${grossPayNgn.toLocaleString('en-NG')} · Net ₦${netPayNgn.toLocaleString('en-NG')} · ${activeStaff.length} employees`,
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

export interface OtaSyncResult {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  totalEvents: number;
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function syncOtaChannelWorkflow(params: {
  property: PropertyRecord;
  channel: OtaIntegrationRecord;
  rooms?: RoomRecord[];
  reservations?: ReservationRecord[];
  icsRawText?: string;
  toggleConnect?: boolean;
  toggleAutoSync?: boolean;
  actorRole: string;
}): Promise<OtaSyncResult> {
  const { uid } = getActorContext();
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', params.channel.id);
  const nextConnected = params.toggleConnect ? !params.channel.connected : params.channel.connected;
  const nextAutoSync = params.toggleAutoSync ? !params.channel.autoSync : params.channel.autoSync;

  // Status-only toggle (Connect/Disconnect or AutoSync toggle)
  if (params.toggleConnect || params.toggleAutoSync) {
    try {
      await updateDoc(ref, {
        connected: nextConnected,
        autoSync: nextAutoSync,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        propertyId: params.property.id,
        actorRole: params.actorRole,
        module: 'Channel Manager',
        action: `${nextConnected ? 'Connected' : 'Disconnected'} ${params.channel.channelName}`,
        details: `Connected: ${nextConnected} · AutoSync: ${nextAutoSync}`,
        authorizedEmails: params.property.authorizedEmails,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, ref.path);
    }
    return { created: 0, updated: 0, cancelled: 0, skipped: 0, totalEvents: 0 };
  }

  // Real OTA .ics fetch via server/Edge proxy or uploaded .ics text
  let rawIcs = params.icsRawText?.trim() || '';
  if (!rawIcs) {
    const importUrl = params.channel.icalImportUrl?.trim();
    if (!importUrl) {
      throw new Error(
        `No inbound .ics calendar link is saved for ${params.channel.channelName}. Paste your property OTA .ics link or upload a .ics file.`
      );
    }
    const resp = await fetch(`/api/ical-proxy?url=${encodeURIComponent(importUrl)}`, {
      method: 'GET',
    });
    if (!resp.ok) {
      let errMsg = `Calendar sync failed (HTTP ${resp.status}).`;
      try {
        const json = (await resp.json()) as { error?: string };
        if (json.error) errMsg = json.error;
      } catch {
        // ignore non-JSON error
      }
      throw new Error(errMsg);
    }
    rawIcs = await resp.text();
  }

  const resolvedChannelSource =
    params.channel.channelName === 'Direct Website Engine'
      ? ('Direct Web' as const)
      : params.channel.channelName;

  const parsedEvents = parseIcalEvents(rawIcs, resolvedChannelSource);

  // Load current rooms & reservations if not provided
  let roomList = params.rooms || [];
  if (roomList.length === 0) {
    const roomsSnap = await getDocs(collection(db, 'properties', params.property.id, 'rooms'));
    roomList = roomsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomRecord, 'id'>) }));
  }
  roomList = sortRoomsByNumber(roomList);
  if (roomList.length === 0) {
    throw new Error('No rooms exist in this property to assign imported OTA bookings.');
  }

  let existingReservations = params.reservations || [];
  if (existingReservations.length === 0) {
    const resSnap = await getDocs(
      collection(db, 'properties', params.property.id, 'reservations')
    );
    existingReservations = resSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ReservationRecord, 'id'>),
    }));
  }

  const byId = new Map<string, ReservationRecord>();
  const byExternalUid = new Map<string, ReservationRecord>();
  for (const r of existingReservations) {
    byId.set(r.id, r);
    if (r.externalUid) {
      byExternalUid.set(`${r.channel}::${r.externalUid}`, r);
    }
  }

  const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  const normalizedMappedRoom = (params.channel.roomNumber || '').trim();
  const isSpecificMappedSuite =
    Boolean(normalizedMappedRoom) &&
    normalizedMappedRoom.toLowerCase() !== 'all suites' &&
    normalizedMappedRoom.toLowerCase() !== 'all';

  const findRoomsMatchingHint = (hint?: string): RoomRecord[] => {
    const raw = (hint || '').trim().toLowerCase();
    if (!raw) return [];

    // 1. Direct RM-X code match
    const rmMatch = raw.match(/\b(rm-\d{1,2})\b/i);
    if (rmMatch) {
      const byCode = roomList.filter((r) => r.roomNumber.toLowerCase() === rmMatch[1].toLowerCase());
      if (byCode.length > 0) return byCode;
    }

    // 2. Exact roomNumber or roomName match
    const exactCodeOrName = roomList.filter(
      (r) =>
        r.roomNumber.toLowerCase() === raw ||
        r.name.toLowerCase() === raw ||
        raw.includes(r.name.toLowerCase())
    );
    if (exactCodeOrName.length > 0) return exactCodeOrName;

    // 3. Longest roomType match first (so "Deluxe Studio with Kitchenette" beats "Deluxe Studio")
    const byTypeLengthDesc = [...roomList].sort((a, b) => b.roomType.length - a.roomType.length);
    for (const candidate of byTypeLengthDesc) {
      const rt = candidate.roomType.trim().toLowerCase();
      if (rt && (raw.includes(rt) || rt.includes(raw))) {
        return roomList.filter((r) => r.roomType.trim().toLowerCase() === rt);
      }
    }

    return [];
  };

  const mappedRoomsFromChannel = isSpecificMappedSuite
    ? roomList.filter((r) => r.roomNumber.trim().toLowerCase() === normalizedMappedRoom.toLowerCase())
    : [];

  const pickRoomForEvent = (ev: ParsedIcalEvent, ignoreReservationId?: string): RoomRecord => {
    if (mappedRoomsFromChannel.length > 0) {
      return mappedRoomsFromChannel[0];
    }

    const searchSources = [
      ev.roomHint,
      ev.location,
      ev.calendarName,
      ev.summary,
      ev.description,
      params.channel.propertyListingId,
    ];
    let matchedPool: RoomRecord[] = [];
    for (const src of searchSources) {
      const found = findRoomsMatchingHint(src);
      if (found.length > 0) {
        matchedPool = found;
        break;
      }
    }

    const candidatePool = matchedPool.length > 0 ? matchedPool : roomList;

    const isFree = (room: RoomRecord) =>
      !existingReservations.some(
        (res) =>
          res.id !== ignoreReservationId &&
          res.roomId === room.id &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlap(ev.checkInDate, ev.checkOutDate, res.checkInDate, res.checkOutDate)
      );

    if (matchedPool.length > 0) {
      const freeMatch = matchedPool.find(isFree);
      return freeMatch || matchedPool[0];
    }

    // When unmapped (All Suites & no room hint), prefer an existing room type offset per channel so Airbnb and Booking.com do not pile onto roomList[0]
    let channelHash = 0;
    for (let i = 0; i < params.channel.id.length; i++) {
      channelHash = (channelHash * 31 + params.channel.id.charCodeAt(i)) >>> 0;
    }
    const offset = candidatePool.length > 0 ? channelHash % candidatePool.length : 0;
    const rotatedPool = [
      ...candidatePool.slice(offset),
      ...candidatePool.slice(0, offset),
    ];

    const freeCandidate = rotatedPool.find(isFree);
    if (freeCandidate) return freeCandidate;

    const sortedByLoad = [...rotatedPool].sort((a, b) => {
      const countA = existingReservations.filter(
        (res) =>
          res.id !== ignoreReservationId &&
          res.roomId === a.id &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlap(ev.checkInDate, ev.checkOutDate, res.checkInDate, res.checkOutDate)
      ).length;
      const countB = existingReservations.filter(
        (res) =>
          res.id !== ignoreReservationId &&
          res.roomId === b.id &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlap(ev.checkInDate, ev.checkOutDate, res.checkInDate, res.checkOutDate)
      ).length;
      return countA - countB;
    });
    return sortedByLoad[0] || roomList[0];
  };

  const resolveChannelPricing = (ev: ParsedIcalEvent, assignedRoom: RoomRecord) => {
    const usdRate = params.property.usdExchangeRateNgn;

    if (ev.parsedCurrency && ev.parsedNightlyRate && ev.parsedNightlyRate > 0) {
      const sourceCurrency = ev.parsedCurrency;
      const fxRateToNgn = getFxRateToNgn(sourceCurrency, usdRate);
      const sourceNightlyRate = Number(ev.parsedNightlyRate.toFixed(2));
      const sourceTotalAmount =
        ev.parsedTotalAmount && ev.parsedTotalAmount > 0
          ? Number(ev.parsedTotalAmount.toFixed(2))
          : Number((sourceNightlyRate * ev.nights).toFixed(2));
      const nightlyRateNgn = convertCurrencyToNgn(sourceNightlyRate, sourceCurrency, usdRate);
      const roomChargesNgn = convertCurrencyToNgn(sourceTotalAmount, sourceCurrency, usdRate);
      return {
        sourceCurrency,
        sourceNightlyRate,
        sourceTotalAmount,
        fxRateToNgn,
        nightlyRateNgn,
        roomChargesNgn,
      };
    }

    const nightlyRateNgn = assignedRoom.nightlyRateNgn || 0;
    const roomChargesNgn = nightlyRateNgn * ev.nights;
    return {
      sourceCurrency: 'NGN' as const,
      sourceNightlyRate: nightlyRateNgn,
      sourceTotalAmount: roomChargesNgn,
      fxRateToNgn: 1,
      nightlyRateNgn,
      roomChargesNgn,
    };
  };

  let created = 0;
  let updated = 0;
  let cancelled = 0;
  let skipped = 0;

  const batch = writeBatch(db);
  const now = serverTimestamp();

  for (const ev of parsedEvents) {
    // Ignore events exported by this property's own PMS feed to avoid circular duplicates
    if (ev.uid.endsWith('@richgates-pms')) {
      skipped += 1;
      continue;
    }

    const deterministicId = deterministicOtaReservationId(params.channel.id, ev.uid);
    const existing =
      byId.get(deterministicId) ||
      byExternalUid.get(`${resolvedChannelSource}::${ev.uid}`);

    if (existing) {
      if (
        existing.status === 'checked_out' ||
        existing.status === 'checked_in' ||
        existing.status === 'no_show'
      ) {
        skipped += 1;
        continue;
      }

      if (ev.cancelled && existing.status !== 'cancelled') {
        const resRef = doc(db, 'properties', params.property.id, 'reservations', existing.id);
        batch.update(resRef, {
          status: 'cancelled',
          updatedAt: now,
        });
        cancelled += 1;
        continue;
      }

      if (!ev.cancelled) {
        const assignedRoom = pickRoomForEvent(ev, existing.id);
        const pricing = resolveChannelPricing(ev, assignedRoom);
        const needsUpdate =
          existing.checkInDate !== ev.checkInDate ||
          existing.checkOutDate !== ev.checkOutDate ||
          existing.nights !== ev.nights ||
          existing.guestName !== ev.guestName ||
          (ev.guestPhone && existing.guestPhone !== ev.guestPhone) ||
          existing.roomId !== assignedRoom.id ||
          existing.roomNumber !== assignedRoom.roomNumber ||
          (existing.requestedRoomType || '') !== assignedRoom.roomType ||
          existing.nightlyRateNgn !== pricing.nightlyRateNgn ||
          existing.roomChargesNgn !== pricing.roomChargesNgn ||
          (existing.sourceCurrency || 'NGN') !== pricing.sourceCurrency ||
          (existing.sourceNightlyRate ?? 0) !== pricing.sourceNightlyRate ||
          (existing.sourceTotalAmount ?? 0) !== pricing.sourceTotalAmount ||
          (existing.fxRateToNgn ?? 1) !== pricing.fxRateToNgn;

        if (needsUpdate) {
          const resRef = doc(db, 'properties', params.property.id, 'reservations', existing.id);
          batch.update(resRef, {
            roomId: assignedRoom.id,
            roomNumber: assignedRoom.roomNumber,
            requestedRoomType: assignedRoom.roomType,
            checkInDate: ev.checkInDate,
            checkOutDate: ev.checkOutDate,
            nights: ev.nights,
            guestName: ev.guestName,
            ...(ev.guestPhone ? { guestPhone: ev.guestPhone } : {}),
            nightlyRateNgn: pricing.nightlyRateNgn,
            roomChargesNgn: pricing.roomChargesNgn,
            sourceCurrency: pricing.sourceCurrency,
            sourceNightlyRate: pricing.sourceNightlyRate,
            sourceTotalAmount: pricing.sourceTotalAmount,
            fxRateToNgn: pricing.fxRateToNgn,
            updatedAt: now,
          });
          updated += 1;
          continue;
        }
      }

      skipped += 1;
      continue;
    }

    // Do not import cancelled or historical bookings that checked out before yesterday
    if (ev.cancelled || ev.checkOutDate < yesterdayIso) {
      skipped += 1;
      continue;
    }

    const assignedRoom = pickRoomForEvent(ev);
    const pricing = resolveChannelPricing(ev, assignedRoom);
    const bookingRef = `OTA-${deterministicId.slice(4, 10).toUpperCase()}`;

    const resRef = doc(db, 'properties', params.property.id, 'reservations', deterministicId);
    const newRecord: Omit<ReservationRecord, 'id' | 'createdAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      propertyId: params.property.id,
      bookingRef,
      roomId: assignedRoom.id,
      roomNumber: assignedRoom.roomNumber,
      requestedRoomType: assignedRoom.roomType,
      guestName: ev.guestName,
      ...(ev.guestPhone ? { guestPhone: ev.guestPhone } : {}),
      checkInDate: ev.checkInDate,
      checkOutDate: ev.checkOutDate,
      bookedDate: todayIso,
      nights: ev.nights,
      adults: Math.min(2, assignedRoom.maxGuests || 2),
      children: 0,
      channel: params.channel.channelName === 'Direct Website Engine' ? 'Direct Web' : params.channel.channelName,
      nightlyRateNgn: pricing.nightlyRateNgn,
      roomChargesNgn: pricing.roomChargesNgn,
      posChargesNgn: 0,
      paidNgn: 0,
      sourceCurrency: pricing.sourceCurrency,
      sourceNightlyRate: pricing.sourceNightlyRate,
      sourceTotalAmount: pricing.sourceTotalAmount,
      fxRateToNgn: pricing.fxRateToNgn,
      status: 'confirmed',
      paymentMethod: 'Online Gateway',
      externalUid: ev.uid,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    };

    batch.set(resRef, newRecord);
    existingReservations.push({ id: deterministicId, ...(newRecord as Omit<ReservationRecord, 'id'>) });
    created += 1;
  }

  batch.update(ref, {
    lastSyncedIso: new Date().toISOString(),
    bookingsImported: params.channel.bookingsImported + created,
    updatedAt: now,
  });

  try {
    await batch.commit();
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Synced ${params.channel.channelName}`,
      details: `${parsedEvents.length} calendar events checked · Created: ${created} · Updated: ${updated} · Cancelled: ${cancelled} · Duplicates skipped: ${skipped}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }

  return {
    created,
    updated,
    cancelled,
    skipped,
    totalEvents: parsedEvents.length,
  };
}

export async function createOtaChannelWithIcal(params: {
  property: PropertyRecord;
  channelName: OtaIntegrationRecord['channelName'];
  propertyListingId: string;
  roomNumber: string;
  icalImportUrl: string;
  commissionPct: number;
  autoSync: boolean;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('ota');
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', id);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const normalizedRoom = params.roomNumber || 'All Suites';
  const exportRoom = encodeURIComponent(normalizedRoom === 'All Suites' ? 'ALL' : normalizedRoom);
  const icalExportUrl = `${origin}/?ical=${encodeURIComponent(params.property.id)}&room=${exportRoom}`;

  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      channelName: params.channelName,
      propertyListingId: params.propertyListingId.trim() || `ICAL-${id.slice(-5).toUpperCase()}`,
      roomNumber: normalizedRoom,
      icalImportUrl: params.icalImportUrl.trim(),
      icalExportUrl,
      commissionPct: Math.max(0, Math.min(50, params.commissionPct)),
      autoSync: params.autoSync,
      connected: true,
      lastSyncedIso: '',
      bookingsImported: 0,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Added ${params.channelName} with iCal Link`,
      details: `${normalizedRoom} · ${params.icalImportUrl.trim() || 'Export-only feed'}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function updateOtaChannelIcal(params: {
  property: PropertyRecord;
  channel: OtaIntegrationRecord;
  icalImportUrl: string;
  roomNumber: string;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', params.channel.id);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const normalizedRoom = params.roomNumber || 'All Suites';
  const exportRoom = normalizedRoom === 'All Suites' ? 'ALL' : normalizedRoom;
  const icalExportUrl = `${origin}/?ical=${encodeURIComponent(params.property.id)}&room=${encodeURIComponent(exportRoom)}`;
  const cleanImportUrl = params.icalImportUrl.trim();
  const urlChanged = cleanImportUrl !== (params.channel.icalImportUrl || '').trim();

  try {
    await updateDoc(ref, {
      icalImportUrl: cleanImportUrl,
      roomNumber: normalizedRoom,
      icalExportUrl,
      ...(urlChanged ? { lastSyncedIso: '' } : {}),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Updated iCal Link on ${params.channel.channelName}`,
      details: `${normalizedRoom} · ${cleanImportUrl}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteOtaChannel(params: {
  property: PropertyRecord;
  channel: OtaIntegrationRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', params.channel.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Removed ${params.channel.channelName} (${params.channel.propertyListingId})`,
      details: 'Channel disconnected and removed from Channel Manager.',
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export function buildPropertyIcalFeed(params: {
  propertyName: string;
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  roomNumberFilter?: string;
}): string {
  const target =
    params.roomNumberFilter &&
    params.roomNumberFilter !== 'ALL' &&
    params.roomNumberFilter !== 'All Suites'
      ? params.roomNumberFilter
      : null;
  const toIcalDate = (iso: string) => iso.replace(/-/g, '');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Richgates Apartments//Channel Manager iCal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${params.propertyName}${target ? ` - ${target}` : ''}`,
  ];

  for (const res of params.reservations) {
    if (res.status === 'cancelled' || res.status === 'checked_out') continue;
    if (target && res.roomNumber !== target) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${res.id}@richgates-pms`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(res.checkInDate)}`,
      `DTEND;VALUE=DATE:${toIcalDate(res.checkOutDate)}`,
      `SUMMARY:Reserved (${res.roomNumber}) - ${res.guestName}`,
      `DESCRIPTION:Ref ${res.bookingRef} | Channel ${res.channel}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  for (const blk of params.blockedDates) {
    if (target && blk.roomNumber !== target) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${blk.id}@richgates-pms`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(blk.startDate)}`,
      `DTEND;VALUE=DATE:${toIcalDate(blk.endDate)}`,
      `SUMMARY:Blocked (${blk.roomNumber}) - ${blk.category}`,
      `DESCRIPTION:${blk.reason}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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

export async function saveCmsContentWorkflow(params: {
  property: PropertyRecord;
  cms: CmsContent;
  actorRole: string;
}) {
  const { uid, email } = getActorContext();
  const cmsRef = doc(db, 'app_cms', 'global');
  const now = serverTimestamp();
  const normalized = mergeCmsWithDefaults(params.cms);

  const updatePayload = {
    brand: normalized.brand,
    login: normalized.login,
    dashboard: normalized.dashboard,
    pages: normalized.pages,
    updatedByEmail: email.toLowerCase(),
    updatedAt: now,
  };

  try {
    const existingSnap = await withFirestoreRetry(() => getDoc(cmsRef), 3, 700);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as Record<string, unknown> | undefined;
      if (existingData?.ownerUid && existingData?.createdAt) {
        await updateDoc(cmsRef, updatePayload);
      } else {
        await deleteDoc(cmsRef);
        await setDoc(cmsRef, {
          ...updatePayload,
          ownerUid: uid,
          createdAt: now,
        });
      }
    } else {
      await setDoc(cmsRef, {
        ...updatePayload,
        ownerUid: uid,
        createdAt: now,
      });
    }
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'PCH Super Admin CMS',
      action: 'Published App CMS Copy & Page Text Updates',
      details: `Updated all portal copy, page headings, and dashboard text by ${email}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, cmsRef.path);
  }
}

export async function resetCmsContentWorkflow(params: {
  property: PropertyRecord;
  actorRole: string;
}) {
  await saveCmsContentWorkflow({
    property: params.property,
    cms: DEFAULT_CMS_CONTENT,
    actorRole: params.actorRole,
  });
}

const DEMO_SEED_EMAILS_TO_STRIP = new Set(['gm@richgatesenugu.com']);

function sanitizeAuthorizedEmailList(
  emails: string[],
  property: PropertyRecord,
  fallbackEmail: string
): string[] {
  const cleaned = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && !DEMO_SEED_EMAILS_TO_STRIP.has(e))
    )
  );
  if (cleaned.length === 0) {
    const fallback = (property.adminEmail || fallbackEmail || BOOTSTRAPPED_ADMIN_EMAIL)
      .trim()
      .toLowerCase();
    return [fallback];
  }
  return cleaned.slice(0, 25);
}

async function syncPropertyAuthorizedEmailsAcrossCollections(
  property: PropertyRecord,
  nextEmails: string[]
): Promise<void> {
  const { email } = getActorContext();
  const isBootstrapped = isBootstrappedAdminEmail(email);
  const propId = property.id;
  const safeEmails = sanitizeAuthorizedEmailList(nextEmails, property, email);
  const ops: Array<(batch: ReturnType<typeof writeBatch>, now: ReturnType<typeof serverTimestamp>) => void> = [];

  ops.push((batch, now) => {
    batch.update(doc(db, 'properties', propId), {
      authorizedEmails: safeEmails,
      updatedAt: now,
    });
  });

  const updatableSubs: Array<{
    name: string;
    canUpdateDoc: (data: Record<string, unknown>) => boolean;
  }> = [
    { name: 'rooms', canUpdateDoc: () => true },
    { name: 'blocked_dates', canUpdateDoc: () => true },
    { name: 'guests', canUpdateDoc: () => true },
    {
      name: 'reservations',
      canUpdateDoc: (d) =>
        isBootstrapped ||
        !['checked_out', 'cancelled', 'no_show'].includes(String(d.status || '')),
    },
    {
      name: 'housekeeping_tasks',
      canUpdateDoc: (d) => isBootstrapped || String(d.status || '') !== 'inspected',
    },
    { name: 'pos_menu_items', canUpdateDoc: () => true },
    { name: 'inventory_items', canUpdateDoc: () => true },
    {
      name: 'purchase_orders',
      canUpdateDoc: (d) =>
        isBootstrapped || !['received', 'cancelled'].includes(String(d.status || '')),
    },
    { name: 'staff_members', canUpdateDoc: () => true },
    { name: 'user_accounts', canUpdateDoc: () => true },
    { name: 'shifts', canUpdateDoc: () => true },
    { name: 'attendance', canUpdateDoc: () => true },
    {
      name: 'payroll_runs',
      canUpdateDoc: (d) => isBootstrapped || String(d.status || '') !== 'posted_to_ledger',
    },
    {
      name: 'maintenance_tickets',
      canUpdateDoc: (d) => isBootstrapped || String(d.status || '') !== 'resolved',
    },
    { name: 'ota_channels', canUpdateDoc: () => true },
    { name: 'messages', canUpdateDoc: () => true },
  ];

  for (const sub of updatableSubs) {
    const snap = await getDocs(collection(db, 'properties', propId, sub.name));
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!sub.canUpdateDoc(data)) continue;
      ops.push((batch, now) => {
        batch.update(d.ref, {
          authorizedEmails: safeEmails,
          updatedAt: now,
        });
      });
    }
  }

  const CHUNK_SIZE = 350;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    const now = serverTimestamp();
    for (const fn of chunk) {
      fn(batch, now);
    }
    await batch.commit();
  }
}

async function provisionStaffAuthAccount(
  email: string,
  password: string,
  fullName: string
): Promise<{ provisioned: boolean; note?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  if (!cleanPassword) {
    return { provisioned: false };
  }
  const secApp =
    getApps().find((appInstance) => appInstance.name === 'AccountProvisioner') ||
    initializeApp(firebaseConfig, 'AccountProvisioner');
  const secAuth = getAuth(secApp);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, cleanEmail, cleanPassword);
    if (fullName.trim()) {
      await updateProfile(cred.user, { displayName: fullName.trim() }).catch(() => undefined);
    }
    await signOut(secAuth).catch(() => undefined);
    return {
      provisioned: true,
      note: 'Firebase Email/Password credentials created.',
    };
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      await signOut(secAuth).catch(() => undefined);
      return {
        provisioned: true,
        note: 'Existing Firebase account linked to this property role.',
      };
    }
    await signOut(secAuth).catch(() => undefined);
    throw err;
  }
}

function buildUserAccountDocId(email: string): string {
  const safe = email
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return `usr_${safe || cleanId('acc')}`;
}

export async function createPropertyUserAccountWorkflow(params: {
  property: PropertyRecord;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: DepartmentName;
  role: AssignablePropertyRole;
  privileges: NavSectionId[];
  password?: string;
  alsoCreateStaffRecord?: boolean;
  monthlyBaseSalaryNgn?: number;
  monthlyAllowanceNgn?: number;
  actorRole: string;
}): Promise<{ accountId: string; authNote?: string }> {
  const { uid } = getActorContext();
  const cleanFirst = params.firstName.trim().slice(0, 60);
  const cleanLast = params.lastName.trim().slice(0, 60);
  const cleanEmail = params.email.trim().toLowerCase().slice(0, 120);
  if (!cleanFirst || !cleanLast || !cleanEmail) {
    throw new Error('First name, last name, and email address are required.');
  }

  const fullName = `${cleanFirst} ${cleanLast}`.trim().slice(0, 120);
  const isUnassigned = params.role === 'unassigned';
  const effectivePrivileges: NavSectionId[] =
    params.role === 'unassigned'
      ? []
      : params.privileges.length > 0
        ? Array.from(new Set(params.privileges)).slice(0, 30)
        : [...ROLE_ALLOWED_SECTIONS[params.role]];
  const isActive = !isUnassigned && effectivePrivileges.length > 0;

  let authProvisioned = false;
  let authNote: string | undefined;
  if (params.password && params.password.trim().length > 0) {
    const authRes = await provisionStaffAuthAccount(cleanEmail, params.password, fullName);
    authProvisioned = authRes.provisioned;
    authNote = authRes.note;
  }

  const accountId = buildUserAccountDocId(cleanEmail);
  const nextEmails = isActive
    ? sanitizeAuthorizedEmailList(
        [...params.property.authorizedEmails, cleanEmail],
        params.property,
        cleanEmail
      )
    : sanitizeAuthorizedEmailList(params.property.authorizedEmails, params.property, '');

  let linkedStaffId = '';
  if (params.alsoCreateStaffRecord && !isUnassigned) {
    linkedStaffId = cleanId('stf');
    const staffCode = `RG-${Math.floor(100 + Math.random() * 899)}`;
    const staffRef = doc(db, 'properties', params.property.id, 'staff_members', linkedStaffId);
    try {
      await setDoc(staffRef, {
        propertyId: params.property.id,
        staffCode,
        fullName,
        email: cleanEmail,
        phone: (params.phone || '').trim().slice(0, 32),
        department: params.department,
        role: params.role,
        monthlyBaseSalaryNgn: Math.max(0, Math.round(params.monthlyBaseSalaryNgn ?? 150000)),
        monthlyAllowanceNgn: Math.max(0, Math.round(params.monthlyAllowanceNgn ?? 35000)),
        employmentStatus: 'active',
        authorizedEmails: nextEmails,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, staffRef.path);
    }
  }

  const accountRef = doc(db, 'properties', params.property.id, 'user_accounts', accountId);
  try {
    await setDoc(accountRef, {
      propertyId: params.property.id,
      firstName: cleanFirst,
      lastName: cleanLast,
      fullName,
      email: cleanEmail,
      ...(params.phone?.trim() ? { phone: params.phone.trim().slice(0, 32) } : {}),
      department: params.department,
      role: params.role,
      privileges: effectivePrivileges,
      active: isActive,
      ...(linkedStaffId ? { linkedStaffId } : {}),
      authProvisioned,
      lastRoleUpdatedIso: new Date().toISOString(),
      authorizedEmails: nextEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (isActive) {
      await syncPropertyAuthorizedEmailsAcrossCollections(params.property, nextEmails);
    }

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'User Management',
      action: `Created Account: ${fullName} (${ASSIGNABLE_ROLE_LABELS[params.role]})`,
      details: `${cleanEmail} · ${params.department} · ${effectivePrivileges.length} module privilege(s)`,
      authorizedEmails: nextEmails,
    });

    return { accountId, authNote };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, accountRef.path);
  }
}

export async function updatePropertyUserRolePrivilegesWorkflow(params: {
  property: PropertyRecord;
  account: PropertyUserAccountRecord;
  firstName?: string;
  lastName?: string;
  phone?: string;
  department: DepartmentName;
  role: AssignablePropertyRole;
  privileges: NavSectionId[];
  active: boolean;
  actorRole: string;
}) {
  const cleanFirst = (params.firstName ?? params.account.firstName).trim().slice(0, 60);
  const cleanLast = (params.lastName ?? params.account.lastName).trim().slice(0, 60);
  const fullName = `${cleanFirst} ${cleanLast}`.trim().slice(0, 120) || params.account.fullName;
  const isUnassigned = params.role === 'unassigned';
  const effectivePrivileges: NavSectionId[] = isUnassigned
    ? []
    : Array.from(new Set(params.privileges)).slice(0, 30);
  const nextActive = !isUnassigned && params.active && effectivePrivileges.length > 0;
  const accountEmail = params.account.email.trim().toLowerCase();

  const shouldRetainInProperty =
    isBootstrappedAdminEmail(accountEmail) ||
    params.property.adminEmail.trim().toLowerCase() === accountEmail;

  const baseEmails = params.property.authorizedEmails.map((e) => e.toLowerCase());
  const updatedEmails = nextActive
    ? [...baseEmails, accountEmail]
    : baseEmails.filter((e) => e !== accountEmail || shouldRetainInProperty);
  const nextEmails = sanitizeAuthorizedEmailList(updatedEmails, params.property, '');

  const ref = doc(db, 'properties', params.property.id, 'user_accounts', params.account.id);
  try {
    await updateDoc(ref, {
      firstName: cleanFirst || params.account.firstName,
      lastName: cleanLast || params.account.lastName,
      fullName,
      ...(params.phone !== undefined ? { phone: params.phone.trim().slice(0, 32) } : {}),
      department: params.department,
      role: params.role,
      privileges: effectivePrivileges,
      active: nextActive,
      lastRoleUpdatedIso: new Date().toISOString(),
      authorizedEmails: nextEmails,
      updatedAt: serverTimestamp(),
    });

    if (params.account.linkedStaffId && !isUnassigned) {
      const staffRef = doc(
        db,
        'properties',
        params.property.id,
        'staff_members',
        params.account.linkedStaffId
      );
      await updateDoc(staffRef, {
        fullName,
        department: params.department,
        role: params.role,
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }

    await syncPropertyAuthorizedEmailsAcrossCollections(params.property, nextEmails);

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'User Management',
      action: isUnassigned
        ? `Unassigned Role: ${fullName}`
        : `Updated Role & Privileges: ${fullName}`,
      details: `${accountEmail} -> ${ASSIGNABLE_ROLE_LABELS[params.role]} (${effectivePrivileges.length} privileges, ${nextActive ? 'Active' : 'Inactive'})`,
      authorizedEmails: nextEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function unassignPropertyUserRoleWorkflow(params: {
  property: PropertyRecord;
  account: PropertyUserAccountRecord;
  actorRole: string;
}) {
  await updatePropertyUserRolePrivilegesWorkflow({
    property: params.property,
    account: params.account,
    department: params.account.department || ROLE_TO_DEPARTMENT.front_desk,
    role: 'unassigned',
    privileges: [],
    active: false,
    actorRole: params.actorRole,
  });
}

export async function deletePropertyUserAccountWorkflow(params: {
  property: PropertyRecord;
  account: PropertyUserAccountRecord;
  actorRole: string;
}) {
  const accountEmail = params.account.email.trim().toLowerCase();
  const shouldRetain =
    isBootstrappedAdminEmail(accountEmail) ||
    params.property.adminEmail.trim().toLowerCase() === accountEmail;
  const nextEmails = sanitizeAuthorizedEmailList(
    params.property.authorizedEmails
      .map((e) => e.toLowerCase())
      .filter((e) => e !== accountEmail || shouldRetain),
    params.property,
    ''
  );

  const ref = doc(db, 'properties', params.property.id, 'user_accounts', params.account.id);
  try {
    await deleteDoc(ref);
    await syncPropertyAuthorizedEmailsAcrossCollections(params.property, nextEmails);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'User Management',
      action: `Deleted User Account: ${params.account.fullName}`,
      details: `Removed ${accountEmail} and revoked property workspace access.`,
      authorizedEmails: nextEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export async function updateStaffMemberWorkflow(params: {
  property: PropertyRecord;
  staff: StaffMemberRecord;
  updates: Partial<
    Pick<
      StaffMemberRecord,
      | 'fullName'
      | 'email'
      | 'phone'
      | 'department'
      | 'role'
      | 'monthlyBaseSalaryNgn'
      | 'monthlyAllowanceNgn'
      | 'employmentStatus'
    >
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'staff_members', params.staff.id);
  try {
    await updateDoc(ref, {
      ...params.updates,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'HR & Staff',
      action: `Updated Staff Record: ${params.updates.fullName || params.staff.fullName}`,
      details: `${params.updates.department || params.staff.department} · ${params.updates.role || params.staff.role} · ${params.updates.employmentStatus || params.staff.employmentStatus}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteStaffMemberWorkflow(params: {
  property: PropertyRecord;
  staff: StaffMemberRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'staff_members', params.staff.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'HR & Staff',
      action: `Deleted Staff Record: ${params.staff.fullName} (${params.staff.staffCode})`,
      details: `Removed from ${params.staff.department} roster.`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export async function prepareRichgatesProductionDatabaseWorkflow(params: {
  property: PropertyRecord;
  actorRole: string;
}): Promise<{ roomsResetCount: number; deletedDocsCount: number }> {
  const propId = params.property.id;
  const { email } = getActorContext();
  const subcollectionsToClear = [
    'guests',
    'reservations',
    'blocked_dates',
    'housekeeping_tasks',
    'pos_orders',
    'ledger_entries',
    'messages',
    'staff_members',
    'shifts',
    'attendance',
    'payroll_runs',
    'maintenance_tickets',
    'inventory_items',
    'purchase_orders',
  ] as const;

  const cleanedAuthorizedEmails = sanitizeAuthorizedEmailList(
    params.property.authorizedEmails,
    params.property,
    email
  );

  const ops: Array<(batch: ReturnType<typeof writeBatch>, now: ReturnType<typeof serverTimestamp>) => void> = [];
  let roomsResetCount = 0;
  let deletedDocsCount = 0;

  try {
    // 0. Strip any legacy demo email (e.g. gm@richgatesenugu.com) from property document
    ops.push((batch, now) => {
      batch.update(doc(db, 'properties', propId), {
        authorizedEmails: cleanedAuthorizedEmails,
        updatedAt: now,
      });
    });

    // 1. Preserve all rooms and reset occupancy/housekeeping state to clean & vacant
    const roomsSnap = await getDocs(collection(db, 'properties', propId, 'rooms'));
    for (const roomDoc of roomsSnap.docs) {
      roomsResetCount += 1;
      ops.push((batch, now) => {
        batch.update(roomDoc.ref, {
          occupancyStatus: 'vacant',
          housekeepingStatus: 'clean',
          currentGuestName: '',
          currentReservationId: '',
          authorizedEmails: cleanedAuthorizedEmails,
          updatedAt: now,
        });
      });
    }

    // 2. Delete all demo guest profiles, reservations, blocks, tasks, POS orders, ledger entries, demo staff, shifts, attendance, payroll & maintenance
    for (const subName of subcollectionsToClear) {
      const snap = await getDocs(collection(db, 'properties', propId, subName));
      for (const d of snap.docs) {
        deletedDocsCount += 1;
        ops.push((batch) => {
          batch.delete(d.ref);
        });
      }
    }

    // 3. Delete any legacy demo user accounts (such as gm@richgatesenugu.com) while preserving admin-created real users
    const userAccSnap = await getDocs(collection(db, 'properties', propId, 'user_accounts'));
    for (const uDoc of userAccSnap.docs) {
      const data = uDoc.data() as Partial<PropertyUserAccountRecord>;
      const uEmail = String(data.email || '').trim().toLowerCase();
      if (DEMO_SEED_EMAILS_TO_STRIP.has(uEmail)) {
        deletedDocsCount += 1;
        ops.push((batch) => {
          batch.delete(uDoc.ref);
        });
      } else {
        ops.push((batch, now) => {
          batch.update(uDoc.ref, {
            authorizedEmails: cleanedAuthorizedEmails,
            updatedAt: now,
          });
        });
      }
    }

    // 4. Sync cleaned authorizedEmails to pos_menu_items and reset OTA channel counters
    const menuSnap = await getDocs(collection(db, 'properties', propId, 'pos_menu_items'));
    for (const menuDoc of menuSnap.docs) {
      ops.push((batch, now) => {
        batch.update(menuDoc.ref, {
          authorizedEmails: cleanedAuthorizedEmails,
          updatedAt: now,
        });
      });
    }

    const otaSnap = await getDocs(collection(db, 'properties', propId, 'ota_channels'));
    for (const otaDoc of otaSnap.docs) {
      ops.push((batch, now) => {
        batch.update(otaDoc.ref, {
          bookingsImported: 0,
          authorizedEmails: cleanedAuthorizedEmails,
          updatedAt: now,
        });
      });
    }

    // Execute in batches <= 350 ops
    const CHUNK_SIZE = 350;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      const now = serverTimestamp();
      for (const fn of chunk) {
        fn(batch, now);
      }
      await batch.commit();
    }

    await writeAuditLog({
      propertyId: propId,
      actorRole: params.actorRole,
      module: 'Production Preparation',
      action: 'Cleared Demo Staff, Guests & Sample Operational Data',
      details: `Preserved ${roomsResetCount} rooms (vacant/clean) & POS menu; removed ${deletedDocsCount} demo staff, shifts, attendance, payroll, guest, booking, and folio records.`,
      authorizedEmails: cleanedAuthorizedEmails,
    });

    return { roomsResetCount, deletedDocsCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${propId}/production_prep`);
  }
}

export async function syncRichgatesLicenseCapIfNeeded(
  property: PropertyRecord,
  licenses: LicenseRecord[]
): Promise<boolean> {
  if (property.code !== 'RG-ENU-01') return false;
  const targets = licenses.filter(
    (l) => l.propertyId === property.id && l.maxRooms > RICHGATES_MAX_ROOMS
  );
  if (targets.length === 0) return false;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    for (const lic of targets) {
      batch.update(doc(db, 'licenses', lic.id), {
        maxRooms: RICHGATES_MAX_ROOMS,
        updatedAt: now,
      });
    }
    await batch.commit();
    return true;
  } catch {
    return false;
  }
}

export async function syncDefaultMessagesIfNeeded(property: PropertyRecord): Promise<boolean> {
  const { uid, email } = getActorContext();
  const seed = buildRichgatesSeedPayload(uid, email, property.id);
  if (seed.messages.length === 0) return false;
  const colRef = collection(db, 'properties', property.id, 'messages');
  try {
    const existingSnap = await getDocs(colRef);
    if (!existingSnap.empty) return false;
    const batch = writeBatch(db);
    const now = serverTimestamp();
    for (const msg of seed.messages) {
      const { id, ...body } = msg;
      batch.set(doc(db, 'properties', property.id, 'messages', id), {
        ...body,
        authorizedEmails: property.authorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
    return true;
  } catch {
    return false;
  }
}

export async function sendPropertyMessageWorkflow(params: {
  property: PropertyRecord;
  senderName: string;
  senderRole: string;
  senderDepartment: string;
  recipientScope: MessageRecipientScope;
  targetDepartment?: string;
  recipientEmails: string[];
  recipientNames: string[];
  subject: string;
  body: string;
  priority: 'Normal' | 'Urgent';
}) {
  const { uid, email } = getActorContext();
  const id = cleanId('msg');
  const ref = doc(db, 'properties', params.property.id, 'messages', id);
  const nowIso = new Date().toISOString();
  const cleanEmails = Array.from(
    new Set(params.recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  ).slice(0, 50);
  const cleanNames = params.recipientNames.map((n) => n.trim()).filter(Boolean).slice(0, 50);
  const senderLower = email.toLowerCase();

  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      senderEmail: senderLower,
      senderName: params.senderName.trim() || email,
      senderRole: params.senderRole.trim().slice(0, 64),
      senderDepartment: params.senderDepartment.trim().slice(0, 64),
      recipientScope: params.recipientScope,
      ...(params.targetDepartment ? { targetDepartment: params.targetDepartment.trim().slice(0, 64) } : {}),
      recipientEmails: cleanEmails,
      recipientNames: cleanNames,
      subject: params.subject.trim().slice(0, 140),
      body: params.body.trim().slice(0, 1500),
      priority: params.priority,
      readByEmails: [senderLower],
      createdAtIso: nowIso,
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.senderRole,
      module: 'Department Messaging',
      action: `Sent ${params.priority} Message (${params.recipientScope.replace('_', ' ')})`,
      details: `${params.subject.trim()} -> ${cleanNames.join(', ') || params.targetDepartment || 'All Staff'}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function markMessageReadWorkflow(params: {
  property: PropertyRecord;
  message: PropertyMessageRecord;
  readerEmail: string;
}) {
  const cleanEmail = params.readerEmail.trim().toLowerCase();
  if (!cleanEmail) return;
  if (params.message.readByEmails.includes(cleanEmail)) return;
  const nextRead = Array.from(new Set([...params.message.readByEmails, cleanEmail])).slice(0, 50);
  const ref = doc(db, 'properties', params.property.id, 'messages', params.message.id);
  try {
    await updateDoc(ref, {
      readByEmails: nextRead,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal alert acknowledgement failure
  }
}

export async function markAllMessagesReadWorkflow(params: {
  property: PropertyRecord;
  messages: PropertyMessageRecord[];
  readerEmail: string;
}) {
  const cleanEmail = params.readerEmail.trim().toLowerCase();
  if (!cleanEmail) return;
  const unread = params.messages.filter((m) => !m.readByEmails.includes(cleanEmail));
  if (unread.length === 0) return;

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    for (const msg of unread) {
      const nextRead = Array.from(new Set([...msg.readByEmails, cleanEmail])).slice(0, 50);
      batch.update(doc(db, 'properties', params.property.id, 'messages', msg.id), {
        readByEmails: nextRead,
        updatedAt: now,
      });
    }
    await batch.commit();
  } catch {
    // Ignore non-fatal batch read acknowledgement error
  }
}

export async function submitPublicPlanInquiryWorkflow(params: {
  inquiryType: PlanInquiryRecord['inquiryType'];
  plan: PlanInquiryRecord['plan'];
  billingCycle: PlanInquiryRecord['billingCycle'];
  estimatedTotalNgn: number;
  currency?: 'USD' | 'NGN';
  propertyName: string;
  cityState: string;
  roomCount: number;
  preferredSubdomain: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  paymentOption: string;
  message: string;
}): Promise<PlanInquiryRecord> {
  const id = cleanId('inq');
  const prefix = params.inquiryType === 'plan_purchase' ? 'PCH-ORD' : 'PCH-CNT';
  const referenceCode = `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const payload = {
    referenceCode,
    inquiryType: params.inquiryType,
    plan: params.plan,
    billingCycle: params.billingCycle,
    estimatedTotalNgn: Math.max(0, Math.round(params.estimatedTotalNgn || 0)),
    currency: params.currency ?? ('USD' as const),
    propertyName: params.propertyName.trim().slice(0, 118),
    cityState: params.cityState.trim().slice(0, 118),
    roomCount: Math.max(1, Math.min(5000, Math.round(params.roomCount || 1))),
    preferredSubdomain: params.preferredSubdomain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 60),
    contactName: params.contactName.trim().slice(0, 118),
    contactEmail: params.contactEmail.trim().toLowerCase().slice(0, 118),
    contactPhone: params.contactPhone.trim().slice(0, 30),
    paymentOption: params.paymentOption.trim().slice(0, 60),
    message: params.message.trim().slice(0, 1180),
    status: 'new' as const,
    createdAtIso: nowIso,
  };

  try {
    await withFirestoreRetry(
      () =>
        setDoc(doc(db, 'plan_inquiries', id), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      2,
      600
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `plan_inquiries/${id}`);
  }

  return {
    id,
    ...payload,
  };
}

export async function updatePlanInquiryStatusWorkflow(params: {
  inquiryId: string;
  status: PlanInquiryRecord['status'];
}) {
  const ref = doc(db, 'plan_inquiries', params.inquiryId);
  try {
    await updateDoc(ref, {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}
