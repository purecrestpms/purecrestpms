import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  BOOTSTRAPPED_ADMIN_EMAILS,
  CENTRAL_AUTH_DOMAIN,
  CENTRAL_AUTH_ORIGIN,
  effectiveFirebaseConfig,
  getPchActionCodeSettings,
  isBootstrappedAdminEmail,
  OperationType,
  auth,
  db,
  handleFirestoreError,
  withFirestoreRetry,
} from '../firebase';
import { mergeCmsWithDefaults } from '../context/CmsContext';
import { buildRichgatesSeedPayload, generateLicenseKey, RICHGATES_PROPERTY_ID } from '../data/seedData';
import {
  checkRoomDateRangeAvailability,
  datesOverlapIso,
  getLocalIsoDate,
  matchesRoomRecord,
  normalizeIsoDate,
} from '../utils/availability';
import { deterministicOtaReservationId, ParsedIcalEvent, parseIcalEvents } from '../utils/icalParser';
import {
  DEFAULT_ROOM_COVER_IMAGE_URL,
  isLegacyOrAiStudioImageUrl,
  resolveAppImageUrl,
  resolveGalleryImageUrls,
} from '../utils/mediaAssets';
import { ParsedOtaCsvRow } from '../utils/otaCsvParser';
import {
  ASSIGNABLE_ROLE_LABELS,
  AssignablePropertyRole,
  AttendanceRecord,
  BlockedDateRecord,
  ChannelCurrency,
  CmsContent,
  DEFAULT_CMS_CONTENT,
  DepartmentName,
  formatSystemPropertyId,
  getDefaultOtaChannelCurrency,
  getFxRateToNgn,
  getPropertyCodePrefix,
  getPropertySubdomainSlug,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  isOtaBookingChannel,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  MessageRecipientScope,
  NavSectionId,
  normalizeSubdomainSlug,
  OtaIntegrationRecord,
  OtaPaymentCollectionMode,
  OtaPayoutStatus,
  parseSystemPropertySeq,
  PaymentStatusLabel,
  formatPaymentCollectionLabel,
  PayrollRunRecord,
  PlanInquiryRecord,
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
  STARTING_PROPERTY_SEQ,
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
  const safeEmails = Array.from(
    new Set([
      ...BOOTSTRAPPED_ADMIN_EMAILS,
      email.trim().toLowerCase(),
      ...params.authorizedEmails.map((e) => e.trim().toLowerCase()),
    ].filter(Boolean))
  ).slice(0, 25);

  try {
    await setDoc(doc(db, 'audit_logs', id), {
      propertyId: params.propertyId,
      actorEmail: email.trim().toLowerCase(),
      actorRole: params.actorRole,
      module: params.module,
      action: params.action,
      details: params.details.slice(0, 495),
      timestampIso: new Date().toISOString(),
      authorizedEmails: safeEmails,
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
  guestState?: string;
  guestCountry?: string;
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
  paymentStatus?: PaymentStatusLabel;
  depositNgn: number;
  sourceCurrency?: ChannelCurrency;
  sourceNightlyRate?: number;
  sourceTotalAmount?: number;
  fxRateToNgn?: number;
  paymentCollectionMode?: OtaPaymentCollectionMode;
  otaPaidNgn?: number;
  otaPaidSourceAmount?: number;
  expectedPayoutNgn?: number;
  actualPayoutReceivedNgn?: number;
  otaPayoutStatus?: OtaPayoutStatus;
  amountDueAtPropertyNgn?: number;
  paymentManuallyEdited?: boolean;
  hotelPaidNgn?: number;
  cautionDepositEnabled?: boolean;
  cautionDepositNgn?: number;
  cautionDepositCollectedNgn?: number;
  cautionDepositRefunded?: boolean;
  cautionDepositRefundedAtIso?: string;
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

  // Enforce real Firestore-level room availability check to block double-booking
  // against any active direct reservation, OTA booking (Airbnb/Booking.com/Expedia/VRBO), or blocked date.
  if (params.room) {
    let liveConflictMessage: string | null = null;
    try {
      const [liveResSnap, liveBlkSnap] = await Promise.all([
        getDocs(collection(db, 'properties', params.property.id, 'reservations')),
        getDocs(collection(db, 'properties', params.property.id, 'blocked_dates')),
      ]);
      const liveReservations = liveResSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ReservationRecord, 'id'>),
      }));
      const liveBlocks = liveBlkSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<BlockedDateRecord, 'id'>),
      }));
      const liveCheck = checkRoomDateRangeAvailability({
        room: params.room,
        checkInDate: params.checkInDate,
        checkOutDate: params.checkOutDate,
        reservations: liveReservations,
        blockedDates: liveBlocks,
      });
      if (!liveCheck.available) {
        liveConflictMessage = liveCheck.message;
      }
    } catch {
      // If offline/transient read error, let client-side check govern rather than blocking unexpectedly
    }
    if (liveConflictMessage) {
      throw new Error(liveConflictMessage);
    }
  }

  const { uid } = getActorContext();
  const resId = cleanId('res');
  const guestId = cleanId('gst');
  const todayIso = new Date().toISOString().slice(0, 10);
  const propPrefix = getPropertyCodePrefix(params.property);
  const bookingRef = `${propPrefix}-${Math.floor(1000 + Math.random() * 8999)}`;
  const isOta = isOtaBookingChannel(params.channel);
  const safeNights = Math.max(1, Math.round(params.nights));
  const baseEffectiveRate = params.room?.nightlyRateNgn ?? params.nightlyRateNgn ?? 55000;
  const baseRoomChargesNgn = baseEffectiveRate * safeNights;
  const expectedPayoutNgn =
    typeof params.expectedPayoutNgn === 'number' && params.expectedPayoutNgn >= 0
      ? Math.round(params.expectedPayoutNgn)
      : baseRoomChargesNgn;
  const roomChargesNgn =
    isOta && typeof params.expectedPayoutNgn === 'number' && params.expectedPayoutNgn > 0
      ? expectedPayoutNgn
      : baseRoomChargesNgn;
  const effectiveRate =
    isOta && typeof params.expectedPayoutNgn === 'number' && params.expectedPayoutNgn > 0
      ? Math.round(expectedPayoutNgn / safeNights)
      : baseEffectiveRate;

  const roomIdVal = params.room?.id || '';
  const roomNumberVal = params.room?.roomNumber || 'Unassigned';
  const requestedTypeVal =
    params.requestedRoomType || params.room?.roomType || 'Studio';
  const status: ReservationRecord['status'] = params.immediateCheckIn
    ? 'checked_in'
    : params.initialStatus || 'confirmed';
  const authEmails = params.property.authorizedEmails;

  const sourceCurrency: ChannelCurrency =
    params.sourceCurrency || (isOta ? getDefaultOtaChannelCurrency(params.channel) : 'NGN');
  const fxRateToNgn =
    params.fxRateToNgn && params.fxRateToNgn > 0
      ? params.fxRateToNgn
      : getFxRateToNgn(sourceCurrency, params.property.usdExchangeRateNgn);

  const otaPaidSourceAmount = isOta
    ? Math.max(0, Number(params.otaPaidSourceAmount ?? 0))
    : 0;
  const otaPaidNgn = isOta
    ? params.otaPaidNgn !== undefined
      ? Math.max(0, Math.round(params.otaPaidNgn))
      : otaPaidSourceAmount > 0
        ? sourceCurrency === 'NGN'
          ? Math.round(otaPaidSourceAmount)
          : Math.round(otaPaidSourceAmount * fxRateToNgn)
        : 0
    : 0;
  const defaultMode: OtaPaymentCollectionMode =
    params.paymentCollectionMode ||
    (isOta || otaPaidSourceAmount > 0 || otaPaidNgn > 0 ? 'ota_prepaid' : 'hotel_collect');
  const effectiveOtaPaidNgn =
    defaultMode === 'ota_prepaid' ? (otaPaidNgn > 0 ? otaPaidNgn : roomChargesNgn) : 0;
  const effectiveOtaPaidSource =
    defaultMode === 'ota_prepaid'
      ? otaPaidSourceAmount > 0
        ? otaPaidSourceAmount
        : sourceCurrency === 'NGN'
          ? effectiveOtaPaidNgn
          : Number((effectiveOtaPaidNgn / fxRateToNgn).toFixed(2))
      : 0;
  const hotelPaidNgn = Math.max(
    0,
    Math.round(params.hotelPaidNgn ?? (defaultMode === 'ota_prepaid' ? 0 : params.depositNgn))
  );
  const resolvedOtaPayoutStatus: OtaPayoutStatus =
    defaultMode === 'ota_prepaid' ? params.otaPayoutStatus || 'pending' : 'pending';
  const resolvedActualPayoutReceivedNgn =
    defaultMode === 'ota_prepaid' && resolvedOtaPayoutStatus === 'received'
      ? Math.max(0, Math.round(params.actualPayoutReceivedNgn ?? expectedPayoutNgn))
      : 0;
  const resolvedOtaPayoutReceivedAtIso =
    defaultMode === 'ota_prepaid' && resolvedOtaPayoutStatus === 'received'
      ? new Date().toISOString()
      : '';
  // Strictly money actually received by the hotel (never count pending OTA bookings as hotel money)
  const totalPaidNgn = Math.max(0, hotelPaidNgn + resolvedActualPayoutReceivedNgn);
  const resolvedAmountDueAtPropertyNgn =
    params.amountDueAtPropertyNgn !== undefined
      ? Math.max(0, Math.round(params.amountDueAtPropertyNgn))
      : defaultMode === 'ota_prepaid'
        ? 0
        : Math.max(0, roomChargesNgn - hotelPaidNgn);

  const sourceNightlyRate =
    params.sourceNightlyRate !== undefined
      ? params.sourceNightlyRate
      : sourceCurrency === 'NGN'
        ? effectiveRate
        : Number((effectiveRate / fxRateToNgn).toFixed(2));
  const sourceTotalAmount =
    params.sourceTotalAmount !== undefined
      ? params.sourceTotalAmount
      : otaPaidSourceAmount > 0 && sourceCurrency !== 'NGN'
        ? otaPaidSourceAmount
        : sourceCurrency === 'NGN'
          ? roomChargesNgn
          : Number((roomChargesNgn / fxRateToNgn).toFixed(2));

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', params.property.id, 'guests', guestId), {
    propertyId: params.property.id,
    fullName: params.guestName,
    email: params.guestEmail || '',
    phone: params.guestPhone || '+234 706 352 2668',
    address: params.guestAddress || '',
    city: params.guestCity || '',
    state: params.guestState || '',
    country: params.guestCountry || params.guestNationality || 'Nigeria',
    nationality: params.guestNationality || params.guestCountry || 'Nigeria',
    idType: params.guestIdType || 'NIN',
    idNumber: params.guestIdNumber || '',
    vipTier: 'Standard',
    totalStays: params.immediateCheckIn ? 1 : 0,
    lifetimeSpendNgn: hotelPaidNgn + (isOta && otaPaidNgn > 0 ? expectedPayoutNgn : 0),
    notes: `Created via ${params.channel}`,
    authorizedEmails: authEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  const cautionEnabled = Boolean(params.cautionDepositEnabled);
  const cautionFeeNgn = cautionEnabled ? Math.max(0, Math.round(params.cautionDepositNgn ?? 0)) : 0;
  const cautionCollectedNgn = cautionEnabled
    ? Math.max(0, Math.round(params.cautionDepositCollectedNgn ?? 0))
    : 0;
  const cautionRefunded = cautionEnabled && Boolean(params.cautionDepositRefunded);
  const cautionRefundedAtIso = cautionRefunded
    ? params.cautionDepositRefundedAtIso || new Date().toISOString()
    : '';
  const derivedPaymentStatus: PaymentStatusLabel =
    params.paymentStatus ||
    (defaultMode === 'ota_prepaid'
      ? 'Paid to OTA'
      : hotelPaidNgn <= 0
        ? 'Unpaid'
        : resolvedAmountDueAtPropertyNgn <= 0
          ? 'Paid'
          : 'Partial');

  const reservationPayload: Omit<ReservationRecord, 'id'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    propertyId: params.property.id,
    bookingRef,
    roomId: roomIdVal,
    roomNumber: roomNumberVal,
    requestedRoomType: requestedTypeVal,
    guestId,
    guestName: params.guestName,
    guestPhone: params.guestPhone || '+234 800 000 0000',
    ...(params.guestEmail?.trim() ? { guestEmail: params.guestEmail.trim().slice(0, 120) } : {}),
    ...(params.guestAddress?.trim() ? { guestAddress: params.guestAddress.trim().slice(0, 200) } : {}),
    ...(params.guestCity?.trim() ? { guestCity: params.guestCity.trim().slice(0, 80) } : {}),
    ...(params.guestState?.trim() ? { guestState: params.guestState.trim().slice(0, 80) } : {}),
    ...(params.guestCountry?.trim() ? { guestCountry: params.guestCountry.trim().slice(0, 80) } : {}),
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    bookedDate: params.bookedDate || todayIso,
    nights: safeNights,
    adults: Math.max(1, Math.round(params.adults)),
    children: Math.max(0, Math.round(params.children || 0)),
    channel: params.channel,
    nightlyRateNgn: effectiveRate,
    roomChargesNgn,
    posChargesNgn: 0,
    paidNgn: totalPaidNgn,
    sourceCurrency,
    sourceNightlyRate,
    sourceTotalAmount,
    fxRateToNgn,
    paymentCollectionMode: defaultMode,
    otaPaidNgn: effectiveOtaPaidNgn,
    otaPaidSourceAmount: effectiveOtaPaidSource,
    expectedPayoutNgn,
    actualPayoutReceivedNgn: resolvedActualPayoutReceivedNgn,
    otaPayoutStatus: resolvedOtaPayoutStatus,
    ...(resolvedOtaPayoutReceivedAtIso
      ? { otaPayoutReceivedAtIso: resolvedOtaPayoutReceivedAtIso }
      : {}),
    amountDueAtPropertyNgn: resolvedAmountDueAtPropertyNgn,
    paymentManuallyEdited: Boolean(params.paymentManuallyEdited),
    hotelPaidNgn,
    paymentStatus: derivedPaymentStatus,
    cautionDepositEnabled: cautionEnabled,
    cautionDepositNgn: cautionFeeNgn,
    cautionDepositCollectedNgn: cautionCollectedNgn,
    cautionDepositRefunded: cautionRefunded,
    ...(cautionRefundedAtIso ? { cautionDepositRefundedAtIso: cautionRefundedAtIso } : {}),
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
      : {
          ...(totalPaidNgn > 0 ? { paymentConfirmed: true } : {}),
        }),
    authorizedEmails: authEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(doc(db, 'properties', params.property.id, 'reservations', resId), reservationPayload);

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

  if (hotelPaidNgn > 0) {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: new Date().toISOString().slice(0, 10),
      entryType: 'revenue',
      category: 'Room Accommodation',
      reference: bookingRef,
      description: `${params.room ? `Room ${params.room.roomNumber}` : requestedTypeVal} direct property payment — ${params.guestName}`,
      amountNgn: hotelPaidNgn,
      vatNgn: Math.round(hotelPaidNgn * 0.075),
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
    }).catch(() => undefined);
    return {
      id: resId,
      bookingRef,
      reservation: {
        id: resId,
        ...(reservationPayload as Omit<ReservationRecord, 'id'>),
      } as ReservationRecord,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/reservations/${resId}`);
    throw error;
  }
}

export async function transitionReservationStatus(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  room?: RoomRecord;
  nextStatus: ReservationRecord['status'];
  settlementAmountNgn?: number;
  paymentMethod?: ReservationRecord['paymentMethod'];
  cancellationType?: 'free' | 'paid';
  cancellationFeeNgn?: number;
  cancellationReason?: string;
  collectCancellationFeeNow?: boolean;
  checkOutTime?: string;
  lateCheckoutFeeNgn?: number;
  cautionDepositRefunded?: boolean;
  allBillsSettledConfirmed?: boolean;
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

  let extraPayment = Math.max(0, Math.round(params.settlementAmountNgn || 0));
  const resUpdates: Record<string, unknown> = {
    status: params.nextStatus,
    paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
    updatedAt: now,
  };

  if (params.nextStatus === 'cancelled') {
    const requestedFee = Math.max(0, Math.round(params.cancellationFeeNgn || 0));
    const cancelType: 'free' | 'paid' =
      params.cancellationType === 'paid' && requestedFee > 0 ? 'paid' : 'free';
    const cancelFee = cancelType === 'paid' ? requestedFee : 0;
    const collectNow = cancelType === 'paid' && Boolean(params.collectCancellationFeeNow) && cancelFee > 0;
    extraPayment = collectNow ? cancelFee : 0;

    resUpdates.cancellationType = cancelType;
    resUpdates.cancellationFeeNgn = cancelFee;
    resUpdates.cancellationReason = (params.cancellationReason || '').trim().slice(0, 240);
    resUpdates.cancelledAtIso = new Date().toISOString();

    if (collectNow) {
      const ledId = cleanId('led');
      batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
        propertyId: params.property.id,
        entryDate: new Date().toISOString().slice(0, 10),
        entryType: 'revenue',
        category: 'Room Accommodation',
        reference: params.reservation.bookingRef,
        description: `Cancellation fee (${params.reservation.roomNumber}) — ${params.reservation.guestName}`,
        amountNgn: cancelFee,
        vatNgn: Math.round(cancelFee * 0.075),
        paymentMethod: params.paymentMethod || params.reservation.paymentMethod,
        authorizedEmails: params.property.authorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else if (params.nextStatus === 'checked_out') {
    resUpdates.checkedOutAtIso = new Date().toISOString();
    if (params.checkOutTime !== undefined) {
      resUpdates.checkOutTime = params.checkOutTime.trim().slice(0, 16);
    }
    if (params.lateCheckoutFeeNgn !== undefined) {
      const cleanLateFee = Math.max(0, Math.round(params.lateCheckoutFeeNgn));
      resUpdates.lateCheckoutFeeNgn = cleanLateFee;
      resUpdates.lateCheckoutApplied = cleanLateFee > 0;
    }
    if (params.cautionDepositRefunded && params.reservation.cautionDepositEnabled) {
      resUpdates.cautionDepositRefunded = true;
      resUpdates.cautionDepositRefundedAtIso = new Date().toISOString();
    }
    if (params.allBillsSettledConfirmed) {
      resUpdates.amountDueAtPropertyNgn = 0;
      resUpdates.paymentConfirmed = true;
      if (params.reservation.paymentCollectionMode !== 'ota_prepaid') {
        resUpdates.paymentStatus = 'Paid';
      }
    }
  }

  const existingHotelPaid = Math.max(
    0,
    Math.round(
      params.reservation.hotelPaidNgn ??
        (params.reservation.paymentCollectionMode === 'ota_prepaid'
          ? 0
          : params.reservation.paidNgn || 0)
    )
  );
  const existingActualPayout =
    params.reservation.otaPayoutStatus === 'received'
      ? Math.max(
          0,
          Math.round(
            params.reservation.actualPayoutReceivedNgn ?? params.reservation.expectedPayoutNgn ?? 0
          )
        )
      : 0;
  const nextHotelPaid = existingHotelPaid + extraPayment;
  const newPaid = nextHotelPaid + existingActualPayout;
  resUpdates.hotelPaidNgn = nextHotelPaid;
  resUpdates.paidNgn = newPaid;
  if (extraPayment > 0 && typeof params.reservation.amountDueAtPropertyNgn === 'number') {
    resUpdates.amountDueAtPropertyNgn = Math.max(
      0,
      Math.round(params.reservation.amountDueAtPropertyNgn) - extraPayment
    );
  }
  batch.update(resRef, resUpdates);

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
      const lateFeeAmt = Math.max(
        0,
        Math.round(params.lateCheckoutFeeNgn ?? params.reservation.lateCheckoutFeeNgn ?? 0)
      );
      batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
        propertyId: params.property.id,
        entryDate: new Date().toISOString().slice(0, 10),
        entryType: 'revenue',
        category: 'Room Accommodation',
        reference: params.reservation.bookingRef,
        description: `Final checkout settlement ${params.reservation.roomNumber} — ${params.reservation.guestName}${lateFeeAmt > 0 ? ` (incl. ₦${lateFeeAmt.toLocaleString('en-NG')} late checkout)` : ''}`,
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
    const cancelDetail =
      params.nextStatus === 'cancelled'
        ? params.cancellationType === 'paid' && (params.cancellationFeeNgn || 0) > 0
          ? `Paid Cancellation Fee ₦${Math.round(params.cancellationFeeNgn || 0).toLocaleString('en-NG')}${params.cancellationReason ? ` (${params.cancellationReason})` : ''}`
          : `Free Cancellation (₦0)${params.cancellationReason ? ` (${params.cancellationReason})` : ''}`
        : `Settled +₦${extraPayment.toLocaleString('en-NG')}`;
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Front Desk',
      action: `Reservation ${params.reservation.bookingRef} -> ${params.nextStatus.replace('_', ' ')}`,
      details: `${params.reservation.roomNumber} · ${params.reservation.guestName} · ${cancelDetail}`,
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
    throw new Error('Please assign an available room before completing check-in.');
  }

  const { uid } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const hadPreviousRoom = Boolean(params.reservation.roomId);
  const roomChanged = targetRoomId !== params.reservation.roomId;

  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  const targetRoomRef = doc(db, 'properties', params.property.id, 'rooms', targetRoomId);

  const extraPayment = Math.max(0, Math.round(params.paymentReceivedNgn));
  const existingHotelPaid = Math.max(
    0,
    Math.round(
      params.reservation.hotelPaidNgn ??
        (params.reservation.paymentCollectionMode === 'ota_prepaid'
          ? 0
          : params.reservation.paidNgn || 0)
    )
  );
  const existingActualPayout =
    params.reservation.otaPayoutStatus === 'received'
      ? Math.max(
          0,
          Math.round(
            params.reservation.actualPayoutReceivedNgn ?? params.reservation.expectedPayoutNgn ?? 0
          )
        )
      : 0;
  const nextHotelPaid = existingHotelPaid + extraPayment;
  const newPaid = nextHotelPaid + existingActualPayout;
  const cleanIdNumber = params.idNumber.trim().slice(0, 64);
  const nextNightlyRate =
    roomChanged && targetRoom ? targetRoom.nightlyRateNgn : params.reservation.nightlyRateNgn;
  const nextRoomCharges = nextNightlyRate * params.reservation.nights;
  const nextAmountDue =
    extraPayment > 0 && typeof params.reservation.amountDueAtPropertyNgn === 'number'
      ? Math.max(0, Math.round(params.reservation.amountDueAtPropertyNgn) - extraPayment)
      : undefined;

  batch.update(resRef, {
    roomId: targetRoomId,
    roomNumber: targetRoomNumber,
    ...(targetRoom?.roomType ? { requestedRoomType: targetRoom.roomType } : {}),
    nightlyRateNgn: nextNightlyRate,
    roomChargesNgn: nextRoomCharges,
    status: 'checked_in',
    hotelPaidNgn: nextHotelPaid,
    paidNgn: newPaid,
    ...(nextAmountDue !== undefined ? { amountDueAtPropertyNgn: nextAmountDue } : {}),
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

  // Enforce live Firestore availability check on the target room before moving guest
  let moveConflictMessage: string | null = null;
  try {
    const [liveResSnap, liveBlkSnap] = await Promise.all([
      getDocs(collection(db, 'properties', params.property.id, 'reservations')),
      getDocs(collection(db, 'properties', params.property.id, 'blocked_dates')),
    ]);
    const liveReservations = liveResSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ReservationRecord, 'id'>),
    }));
    const liveBlocks = liveBlkSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<BlockedDateRecord, 'id'>),
    }));
    const moveCheck = checkRoomDateRangeAvailability({
      room: params.newRoom,
      checkInDate: params.reservation.checkInDate,
      checkOutDate: params.reservation.checkOutDate,
      reservations: liveReservations,
      blockedDates: liveBlocks,
      excludeReservationId: params.reservation.id,
    });
    if (!moveCheck.available) {
      moveConflictMessage = moveCheck.message;
    }
  } catch {
    // Allow fallback when offline
  }
  if (moveConflictMessage) {
    throw new Error(moveConflictMessage);
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
  guestEmail?: string;
  guestAddress?: string;
  guestCity?: string;
  guestState?: string;
  guestCountry?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults?: number;
  children?: number;
  channel: ReservationRecord['channel'];
  status?: ReservationRecord['status'];
  paymentMethod?: ReservationRecord['paymentMethod'];
  paymentStatus?: PaymentStatusLabel;
  paymentCollectionMode?: OtaPaymentCollectionMode;
  otaPayoutStatus?: OtaPayoutStatus;
  actualPayoutReceivedNgn?: number;
  amountDueAtPropertyNgn?: number;
  paymentManuallyEdited?: boolean;
  nightlyRateNgn?: number;
  sourceCurrency?: ChannelCurrency;
  sourceNightlyRate?: number;
  sourceTotalAmount?: number;
  fxRateToNgn?: number;
  otaPaidSourceAmount?: number;
  expectedPayoutNgn?: number;
  hotelPaidNgn?: number;
  cautionDepositEnabled?: boolean;
  cautionDepositNgn?: number;
  cautionDepositCollectedNgn?: number;
  cautionDepositRefunded?: boolean;
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
  const isOta = isOtaBookingChannel(params.channel);
  const roomChanged = targetRoomId !== params.reservation.roomId;
  const nextStatusCheck = params.status ?? params.reservation.status;
  const willBlockInventory =
    nextStatusCheck === 'confirmed' ||
    nextStatusCheck === 'checked_in' ||
    nextStatusCheck === 'pending';

  // Enforce live Firestore overlap verification when editing dates, room assignment, or reactivating a booking
  if (willBlockInventory && targetRoomId) {
    let editConflictMessage: string | null = null;
    try {
      const [liveResSnap, liveBlkSnap, liveRoomsSnap] = await Promise.all([
        getDocs(collection(db, 'properties', params.property.id, 'reservations')),
        getDocs(collection(db, 'properties', params.property.id, 'blocked_dates')),
        params.newRoom
          ? Promise.resolve(null)
          : getDocs(collection(db, 'properties', params.property.id, 'rooms')),
      ]);
      const resolvedTargetRoom: RoomRecord | undefined =
        params.newRoom ||
        liveRoomsSnap?.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<RoomRecord, 'id'>) }))
          .find((rm) => rm.id === targetRoomId);

      if (resolvedTargetRoom) {
        const liveReservations = liveResSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReservationRecord, 'id'>),
        }));
        const liveBlocks = liveBlkSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BlockedDateRecord, 'id'>),
        }));
        const editCheck = checkRoomDateRangeAvailability({
          room: resolvedTargetRoom,
          checkInDate: params.checkInDate,
          checkOutDate: params.checkOutDate,
          reservations: liveReservations,
          blockedDates: liveBlocks,
          excludeReservationId: params.reservation.id,
        });
        if (!editCheck.available) {
          editConflictMessage = editCheck.message;
        }
      }
    } catch {
      // Allow fallback when offline
    }
    if (editConflictMessage) {
      throw new Error(editConflictMessage);
    }
  }
  const baseNightlyRate =
    typeof params.nightlyRateNgn === 'number' && params.nightlyRateNgn >= 0
      ? Math.round(params.nightlyRateNgn)
      : roomChanged && params.newRoom
        ? params.newRoom.nightlyRateNgn
        : params.reservation.nightlyRateNgn;

  const hasExplicitExpectedPayout =
    typeof params.expectedPayoutNgn === 'number' && params.expectedPayoutNgn >= 0;
  const nextExpectedPayoutNgn = hasExplicitExpectedPayout
    ? Math.round(params.expectedPayoutNgn!)
    : roomChanged && params.newRoom
      ? params.newRoom.nightlyRateNgn * safeNights
      : typeof params.reservation.expectedPayoutNgn === 'number'
        ? params.reservation.expectedPayoutNgn
        : baseNightlyRate * safeNights;

  const nextRoomCharges =
    isOta && hasExplicitExpectedPayout
      ? nextExpectedPayoutNgn
      : baseNightlyRate * safeNights;
  const nextNightlyRate =
    isOta && hasExplicitExpectedPayout
      ? Math.round(nextExpectedPayoutNgn / safeNights)
      : baseNightlyRate;

  const srcCurrency: ChannelCurrency =
    params.sourceCurrency ||
    params.reservation.sourceCurrency ||
    (isOta ? getDefaultOtaChannelCurrency(params.channel) : 'NGN');
  const fxRate =
    params.fxRateToNgn && params.fxRateToNgn > 0
      ? params.fxRateToNgn
      : params.reservation.fxRateToNgn && params.reservation.fxRateToNgn > 0
        ? params.reservation.fxRateToNgn
        : getFxRateToNgn(srcCurrency, params.property.usdExchangeRateNgn);

  const nextOtaPaidSourceAmount = isOta
    ? params.otaPaidSourceAmount !== undefined
      ? Math.max(0, Number(params.otaPaidSourceAmount))
      : Math.max(0, Number(params.reservation.otaPaidSourceAmount ?? 0))
    : 0;
  const nextOtaPaidNgn = isOta
    ? nextOtaPaidSourceAmount > 0
      ? srcCurrency === 'NGN'
        ? Math.round(nextOtaPaidSourceAmount)
        : Math.round(nextOtaPaidSourceAmount * fxRate)
      : params.otaPaidSourceAmount !== undefined
        ? 0
        : Math.max(0, Math.round(params.reservation.otaPaidNgn ?? 0))
    : 0;
  const nextHotelPaidNgn =
    params.hotelPaidNgn !== undefined
      ? Math.max(0, Math.round(params.hotelPaidNgn))
      : Math.max(0, Math.round(params.reservation.hotelPaidNgn ?? 0));

  const nextMode: OtaPaymentCollectionMode = isOta
    ? params.paymentCollectionMode ||
      params.reservation.paymentCollectionMode ||
      'ota_prepaid'
    : 'hotel_collect';
  const resolvedOtaPaidNgn =
    nextMode === 'ota_prepaid' ? (nextOtaPaidNgn > 0 ? nextOtaPaidNgn : nextRoomCharges) : 0;
  const resolvedOtaPaidSource =
    nextMode === 'ota_prepaid'
      ? nextOtaPaidSourceAmount > 0
        ? nextOtaPaidSourceAmount
        : srcCurrency === 'NGN'
          ? resolvedOtaPaidNgn
          : Number((resolvedOtaPaidNgn / fxRate).toFixed(2))
      : 0;
  const nextOtaPayoutStatus: OtaPayoutStatus =
    nextMode === 'ota_prepaid'
      ? params.otaPayoutStatus || params.reservation.otaPayoutStatus || 'pending'
      : 'pending';
  const nextActualPayoutReceivedNgn =
    nextMode === 'ota_prepaid' && nextOtaPayoutStatus === 'received'
      ? Math.max(
          0,
          Math.round(
            params.actualPayoutReceivedNgn ??
              params.reservation.actualPayoutReceivedNgn ??
              nextExpectedPayoutNgn
          )
        )
      : 0;
  const nextOtaPayoutReceivedAtIso =
    nextMode === 'ota_prepaid' && nextOtaPayoutStatus === 'received'
      ? params.reservation.otaPayoutReceivedAtIso || new Date().toISOString()
      : '';
  // Money actually received by hotel = direct property receipts + OTA payouts marked Received
  const nextPaidNgn = nextHotelPaidNgn + nextActualPayoutReceivedNgn;

  const nextSourceNightlyRate =
    typeof params.sourceNightlyRate === 'number' && params.sourceNightlyRate >= 0
      ? Number(params.sourceNightlyRate.toFixed(2))
      : srcCurrency === 'NGN'
        ? nextNightlyRate
        : Number((nextNightlyRate / fxRate).toFixed(2));
  const nextSourceTotalAmount =
    typeof params.sourceTotalAmount === 'number' && params.sourceTotalAmount >= 0
      ? Number(params.sourceTotalAmount.toFixed(2))
      : nextOtaPaidSourceAmount > 0 && srcCurrency !== 'NGN'
        ? nextOtaPaidSourceAmount
        : srcCurrency === 'NGN'
          ? nextRoomCharges
          : Number((nextRoomCharges / fxRate).toFixed(2));
  const nextStatus = params.status || params.reservation.status;
  const nextGuestName = (params.guestName || params.reservation.guestName).trim();
  const nextGuestPhone = (params.guestPhone ?? params.reservation.guestPhone ?? '').trim();

  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);

  const nextCautionEnabled =
    params.cautionDepositEnabled !== undefined
      ? Boolean(params.cautionDepositEnabled)
      : Boolean(params.reservation.cautionDepositEnabled);
  const nextCautionNgn = nextCautionEnabled
    ? Math.max(
        0,
        Math.round(
          params.cautionDepositNgn !== undefined
            ? params.cautionDepositNgn
            : (params.reservation.cautionDepositNgn ?? 0)
        )
      )
    : 0;
  const nextCautionCollectedNgn = nextCautionEnabled
    ? Math.max(
        0,
        Math.round(
          params.cautionDepositCollectedNgn !== undefined
            ? params.cautionDepositCollectedNgn
            : (params.reservation.cautionDepositCollectedNgn ?? 0)
        )
      )
    : 0;
  const nextCautionRefunded =
    nextCautionEnabled &&
    (params.cautionDepositRefunded !== undefined
      ? Boolean(params.cautionDepositRefunded)
      : Boolean(params.reservation.cautionDepositRefunded));
  const nextCautionRefundedAtIso = nextCautionRefunded
    ? params.reservation.cautionDepositRefundedAtIso || new Date().toISOString()
    : '';
  const totalBillNgn = nextRoomCharges + Math.max(0, Number(params.reservation.posChargesNgn ?? 0));
  const nextAmountDueAtPropertyNgn =
    params.amountDueAtPropertyNgn !== undefined
      ? Math.max(0, Math.round(params.amountDueAtPropertyNgn))
      : nextMode === 'ota_prepaid'
        ? Math.max(0, Math.round(params.reservation.posChargesNgn ?? 0) - nextHotelPaidNgn)
        : Math.max(0, totalBillNgn - nextHotelPaidNgn);
  const nextPaymentStatus: PaymentStatusLabel =
    params.paymentStatus ||
    (nextMode === 'ota_prepaid'
      ? 'Paid to OTA'
      : nextHotelPaidNgn <= 0
        ? 'Unpaid'
        : nextAmountDueAtPropertyNgn <= 0
          ? 'Paid'
          : 'Partial');

  batch.update(resRef, {
    roomId: targetRoomId,
    roomNumber: targetRoomNumber,
    requestedRoomType: nextRequestedRoomType,
    guestName: nextGuestName,
    guestPhone: nextGuestPhone,
    ...(params.guestEmail !== undefined ? { guestEmail: params.guestEmail.trim().slice(0, 120) } : {}),
    ...(params.guestAddress !== undefined ? { guestAddress: params.guestAddress.trim().slice(0, 200) } : {}),
    ...(params.guestCity !== undefined ? { guestCity: params.guestCity.trim().slice(0, 80) } : {}),
    ...(params.guestState !== undefined ? { guestState: params.guestState.trim().slice(0, 80) } : {}),
    ...(params.guestCountry !== undefined ? { guestCountry: params.guestCountry.trim().slice(0, 80) } : {}),
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    nights: safeNights,
    adults: safeAdults,
    children: safeChildren,
    nightlyRateNgn: nextNightlyRate,
    roomChargesNgn: nextRoomCharges,
    sourceCurrency: srcCurrency,
    sourceNightlyRate: nextSourceNightlyRate,
    sourceTotalAmount: nextSourceTotalAmount,
    fxRateToNgn: fxRate,
    paymentCollectionMode: nextMode,
    otaPaidSourceAmount: resolvedOtaPaidSource,
    otaPaidNgn: resolvedOtaPaidNgn,
    expectedPayoutNgn: nextExpectedPayoutNgn,
    actualPayoutReceivedNgn: nextActualPayoutReceivedNgn,
    otaPayoutStatus: nextOtaPayoutStatus,
    otaPayoutReceivedAtIso: nextOtaPayoutReceivedAtIso,
    amountDueAtPropertyNgn: nextAmountDueAtPropertyNgn,
    paymentManuallyEdited: params.paymentManuallyEdited ?? true,
    hotelPaidNgn: nextHotelPaidNgn,
    paidNgn: nextPaidNgn,
    paymentStatus: nextPaymentStatus,
    paymentConfirmed:
      nextPaymentStatus === 'Paid' || nextPaymentStatus === 'Paid to OTA' || nextPaidNgn > 0,
    cautionDepositEnabled: nextCautionEnabled,
    cautionDepositNgn: nextCautionNgn,
    cautionDepositCollectedNgn: nextCautionCollectedNgn,
    cautionDepositRefunded: nextCautionRefunded,
    cautionDepositRefundedAtIso: nextCautionRefundedAtIso,
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

  const existingHotelPaid = Math.max(
    0,
    Math.round(
      params.reservation.hotelPaidNgn ??
        (params.reservation.paymentCollectionMode === 'ota_prepaid'
          ? 0
          : params.reservation.paidNgn || 0)
    )
  );
  const existingActualPayout =
    params.reservation.otaPayoutStatus === 'received'
      ? Math.max(
          0,
          Math.round(
            params.reservation.actualPayoutReceivedNgn ?? params.reservation.expectedPayoutNgn ?? 0
          )
        )
      : 0;
  const nextHotelPaid = existingHotelPaid + amount;
  const nextPaidNgn = nextHotelPaid + existingActualPayout;

  const updateFields: Record<string, unknown> = {
    hotelPaidNgn: nextHotelPaid,
    paidNgn: nextPaidNgn,
    paymentMethod: params.paymentMethod,
    updatedAt: now,
  };
  if (typeof params.reservation.amountDueAtPropertyNgn === 'number') {
    const nextDue = Math.max(0, Math.round(params.reservation.amountDueAtPropertyNgn) - amount);
    updateFields.amountDueAtPropertyNgn = nextDue;
    if (params.reservation.paymentCollectionMode !== 'ota_prepaid') {
      updateFields.paymentStatus = nextDue <= 0 ? 'Paid' : 'Partial';
    }
  }

  batch.update(resRef, updateFields);

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

export async function updateReservationPaymentWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  paymentCollectionMode: OtaPaymentCollectionMode;
  paymentStatus: PaymentStatusLabel;
  amountDueAtPropertyNgn: number;
  otaPaidNgn?: number;
  otaPaidSourceAmount?: number;
  hotelPaidNgn: number;
  paymentMethod: ReservationRecord['paymentMethod'];
  otaPayoutStatus: OtaPayoutStatus;
  expectedPayoutNgn: number;
  actualPayoutReceivedNgn: number;
  postPayoutToLedger?: boolean;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);

  const isOtaCollected = params.paymentCollectionMode === 'ota_prepaid';
  const cleanHotelPaid = Math.max(0, Math.round(params.hotelPaidNgn));
  const cleanAmountDue = Math.max(0, Math.round(params.amountDueAtPropertyNgn));
  const cleanExpectedPayout = Math.max(0, Math.round(params.expectedPayoutNgn));
  const resolvedPayoutStatus: OtaPayoutStatus = isOtaCollected ? params.otaPayoutStatus : 'pending';
  const cleanActualPayout =
    isOtaCollected && resolvedPayoutStatus === 'received'
      ? Math.max(0, Math.round(params.actualPayoutReceivedNgn))
      : 0;
  const payoutReceivedAtIso =
    isOtaCollected && resolvedPayoutStatus === 'received'
      ? params.reservation.otaPayoutReceivedAtIso || new Date().toISOString()
      : '';

  const cleanOtaPaidNgn = isOtaCollected
    ? Math.max(
        0,
        Math.round(
          params.otaPaidNgn !== undefined
            ? params.otaPaidNgn
            : (params.reservation.otaPaidNgn ?? params.reservation.roomChargesNgn ?? 0)
        )
      )
    : 0;
  const fxRate =
    params.reservation.fxRateToNgn && params.reservation.fxRateToNgn > 0
      ? params.reservation.fxRateToNgn
      : getFxRateToNgn(
          params.reservation.sourceCurrency || 'NGN',
          params.property.usdExchangeRateNgn
        );
  const cleanOtaPaidSource = isOtaCollected
    ? params.otaPaidSourceAmount !== undefined
      ? Math.max(0, Number(params.otaPaidSourceAmount))
      : (params.reservation.sourceCurrency || 'NGN') === 'NGN'
        ? cleanOtaPaidNgn
        : Number((cleanOtaPaidNgn / fxRate).toFixed(2))
    : 0;

  // Money actually received by the hotel = direct property payments + received OTA payouts
  const resolvedPaidNgn = cleanHotelPaid + cleanActualPayout;

  batch.update(resRef, {
    paymentCollectionMode: params.paymentCollectionMode,
    paymentStatus: params.paymentStatus,
    amountDueAtPropertyNgn: cleanAmountDue,
    otaPaidNgn: cleanOtaPaidNgn,
    otaPaidSourceAmount: cleanOtaPaidSource,
    hotelPaidNgn: cleanHotelPaid,
    paidNgn: resolvedPaidNgn,
    paymentMethod: params.paymentMethod,
    expectedPayoutNgn: cleanExpectedPayout,
    otaPayoutStatus: resolvedPayoutStatus,
    actualPayoutReceivedNgn: cleanActualPayout,
    otaPayoutReceivedAtIso: payoutReceivedAtIso,
    paymentConfirmed:
      params.paymentStatus === 'Paid' ||
      params.paymentStatus === 'Paid to OTA' ||
      resolvedPaidNgn > 0,
    paymentManuallyEdited: true,
    updatedAt: now,
  });

  const shouldPostPayout =
    Boolean(params.postPayoutToLedger) &&
    isOtaCollected &&
    resolvedPayoutStatus === 'received' &&
    cleanActualPayout > 0 &&
    params.reservation.otaPayoutStatus !== 'received';

  if (shouldPostPayout) {
    const ledId = cleanId('led');
    batch.set(doc(db, 'properties', params.property.id, 'ledger_entries', ledId), {
      propertyId: params.property.id,
      entryDate: new Date().toISOString().slice(0, 10),
      entryType: 'revenue',
      category: 'Room Accommodation',
      reference: params.reservation.bookingRef,
      description: `OTA Payout Received (${params.reservation.channel}) — ${params.reservation.guestName} (${params.reservation.roomNumber})`,
      amountNgn: cleanActualPayout,
      vatNgn: Math.round(cleanActualPayout * 0.075),
      paymentMethod: 'OTA Platform Payout',
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
      module: 'Payments',
      action: `Updated Payment ${params.reservation.bookingRef}`,
      details: `${formatPaymentCollectionLabel(params.paymentCollectionMode)} · Status: ${params.paymentStatus} · Due at property: ₦${cleanAmountDue.toLocaleString('en-NG')} · Direct paid: ₦${cleanHotelPaid.toLocaleString('en-NG')}${isOtaCollected ? ` · OTA Payout: ${resolvedPayoutStatus} (Exp ₦${cleanExpectedPayout.toLocaleString('en-NG')} / Recv ₦${cleanActualPayout.toLocaleString('en-NG')})` : ''}`,
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

export async function applyLateCheckoutWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  checkOutTime: string;
  lateCheckoutFeeNgn: number;
  actorRole: string;
}) {
  const cleanTime = params.checkOutTime.trim().slice(0, 16) || '14:00';
  const cleanFee = Math.max(0, Math.round(params.lateCheckoutFeeNgn || 0));
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  try {
    await updateDoc(resRef, {
      checkOutTime: cleanTime,
      lateCheckoutFeeNgn: cleanFee,
      lateCheckoutApplied: cleanFee > 0,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guest Folio',
      action: `Late Check-Out Updated ${params.reservation.bookingRef}`,
      details: `Time: ${cleanTime} · Fee applied to bill: ₦${cleanFee.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export async function deleteReservationWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  room?: RoomRecord;
  actorRole: string;
}) {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  batch.delete(resRef);

  if (
    params.reservation.roomId &&
    (!params.room ||
      !params.room.currentReservationId ||
      params.room.currentReservationId === params.reservation.id)
  ) {
    batch.update(doc(db, 'properties', params.property.id, 'rooms', params.reservation.roomId), {
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
      module: 'Reservations',
      action: `Deleted Reservation ${params.reservation.bookingRef}`,
      details: `${params.reservation.guestName} · ${params.reservation.roomNumber} (${params.reservation.checkInDate} → ${params.reservation.checkOutDate})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, resRef.path);
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
      | 'galleryImages'
      | 'amenities'
    >
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'rooms', params.room.id);
  try {
    const payload: Record<string, unknown> = {
      ...params.updates,
      updatedAt: serverTimestamp(),
    };
    if (typeof params.updates.roomNumber === 'string') {
      payload.roomNumber = (params.updates.roomNumber.trim() || params.room.roomNumber).slice(0, 16);
    }
    if (typeof params.updates.name === 'string') {
      const cleanName = params.updates.name.trim() || params.room.name;
      payload.name = (cleanName.length >= 2 ? cleanName : `${cleanName} Room`).slice(0, 80);
    }
    if (typeof params.updates.roomType === 'string') {
      const cleanType = params.updates.roomType.trim() || params.room.roomType;
      payload.roomType = (cleanType.length >= 2 ? cleanType : 'Standard Room').slice(0, 64);
    }
    if (typeof params.updates.nightlyRateNgn === 'number') {
      payload.nightlyRateNgn = Math.max(1000, Math.round(params.updates.nightlyRateNgn));
    }
    if (typeof params.updates.maxGuests === 'number') {
      payload.maxGuests = Math.min(12, Math.max(1, Math.round(params.updates.maxGuests)));
    }
    if (typeof params.updates.imageUrl === 'string') {
      const normalizedCover = resolveAppImageUrl(
        params.updates.imageUrl,
        DEFAULT_ROOM_COVER_IMAGE_URL
      );
      payload.imageUrl = normalizedCover.trim().slice(0, 350000);
    }
    if (Array.isArray(params.updates.galleryImages)) {
      payload.galleryImages = resolveGalleryImageUrls(
        params.updates.galleryImages,
        DEFAULT_ROOM_COVER_IMAGE_URL
      ).slice(0, 6);
    }
    if (Array.isArray(params.updates.amenities)) {
      payload.amenities = params.updates.amenities
        .map((a) => (typeof a === 'string' ? a.trim() : ''))
        .filter(Boolean)
        .slice(0, 15);
    }
    await updateDoc(ref, payload);
    const logSummary = Object.entries(params.updates)
      .map(([k, v]) =>
        k === 'imageUrl'
          ? 'imageUrl: [updated]'
          : k === 'galleryImages'
            ? `galleryImages: [${Array.isArray(v) ? v.length : 0} slides]`
            : `${k}: ${String(v)}`
      )
      .join(', ');
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Rooms',
      action: `Updated Room ${params.updates.roomNumber || params.room.roomNumber}`,
      details: logSummary,
      authorizedEmails: params.property.authorizedEmails,
    }).catch(() => undefined);
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
  galleryImages?: string[];
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
  const normalizedCover = resolveAppImageUrl(params.imageUrl, DEFAULT_ROOM_COVER_IMAGE_URL);
  const cleanGallery = resolveGalleryImageUrls(
    params.galleryImages || [],
    normalizedCover
  ).slice(0, 6);
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
    imageUrl: normalizedCover.slice(0, 350000),
    ...(cleanGallery.length > 0 ? { galleryImages: cleanGallery } : {}),
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

export async function deleteRoomWorkflow(params: {
  property: PropertyRecord;
  room: RoomRecord;
  currentRoomCount: number;
  actorRole: string;
}) {
  if (params.room.occupancyStatus === 'occupied') {
    throw new Error(
      `Room ${params.room.roomNumber} currently has an occupied guest. Check out or move the guest before deleting this room.`
    );
  }
  const roomRef = doc(db, 'properties', params.property.id, 'rooms', params.room.id);
  const propRef = doc(db, 'properties', params.property.id);
  const nextCount = Math.max(1, params.currentRoomCount - 1);
  try {
    await deleteDoc(roomRef);
    await updateDoc(propRef, {
      roomCount: nextCount,
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Rooms',
      action: `Deleted Room ${params.room.roomNumber}`,
      details: `${params.room.name} (${params.room.roomType}) removed from inventory.`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, roomRef.path);
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
  if (!params.startDate || !params.endDate || params.endDate <= params.startDate) {
    throw new Error('Block release date must be at least 1 day after the start date.');
  }

  // Live Firestore overlap check so a date block cannot overwrite an active reservation or duplicate an existing block
  let blockConflictMessage: string | null = null;
  try {
    const [liveResSnap, liveBlkSnap] = await Promise.all([
      getDocs(collection(db, 'properties', params.property.id, 'reservations')),
      getDocs(collection(db, 'properties', params.property.id, 'blocked_dates')),
    ]);
    const liveReservations = liveResSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ReservationRecord, 'id'>),
    }));
    const liveBlocks = liveBlkSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<BlockedDateRecord, 'id'>),
    }));
    const availCheck = checkRoomDateRangeAvailability({
      room: params.room,
      checkInDate: params.startDate,
      checkOutDate: params.endDate,
      reservations: liveReservations,
      blockedDates: liveBlocks,
    });
    if (!availCheck.available && availCheck.status !== 'out_of_order') {
      blockConflictMessage = availCheck.message;
    }
  } catch {
    // Allow fallback when offline
  }
  if (blockConflictMessage) {
    throw new Error(blockConflictMessage);
  }

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
    const hasLegacyGallery =
      Array.isArray(r.galleryImages) &&
      r.galleryImages.some((u) => isLegacyOrAiStudioImageUrl(u));
    return (
      r.roomNumber !== spec.roomNumber ||
      !r.section ||
      !r.imageUrl ||
      isLegacyOrAiStudioImageUrl(r.imageUrl) ||
      hasLegacyGallery
    );
  });
  if (!needsRoomUpdate) return false;

  const { email } = getActorContext();
  const isBootstrapped = isBootstrappedAdminEmail(email);
  const batch = writeBatch(db);
  const now = serverTimestamp();

  for (const room of params.rooms) {
    const spec = specMap.get(room.id);
    if (!spec) continue;
    const preservedOrMigratedCover =
      room.imageUrl && !isLegacyOrAiStudioImageUrl(room.imageUrl)
        ? room.imageUrl
        : resolveAppImageUrl(room.imageUrl, spec.imageUrl);
    const updateData: Record<string, unknown> = {
      roomNumber: spec.roomNumber,
      name: spec.name,
      roomType: spec.roomType,
      section: spec.section,
      nightlyRateNgn: spec.nightlyRateNgn,
      maxGuests: spec.maxGuests,
      imageUrl: preservedOrMigratedCover,
      amenities: spec.amenities,
      updatedAt: now,
    };
    if (Array.isArray(room.galleryImages) && room.galleryImages.length > 0) {
      updateData.galleryImages = resolveGalleryImageUrls(
        room.galleryImages,
        preservedOrMigratedCover
      );
    }
    batch.update(doc(db, 'properties', params.property.id, 'rooms', room.id), updateData);
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
  const sanitizedUpdates = { ...params.updates };
  if (typeof sanitizedUpdates.logoUrl === 'string') {
    sanitizedUpdates.logoUrl = sanitizedUpdates.logoUrl.trim()
      ? resolveAppImageUrl(sanitizedUpdates.logoUrl, '').slice(0, 350000)
      : '';
  }
  try {
    await updateDoc(ref, {
      ...sanitizedUpdates,
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
  const cleanName = (params.guest.fullName || '').trim().slice(0, 120);
  if (cleanName.length < 2) {
    throw new Error('Guest full name must be at least 2 characters.');
  }
  const cleanPhone = (params.guest.phone || '').trim().slice(0, 32) || 'Not Provided';
  const payload: Record<string, unknown> = {
    propertyId: params.property.id,
    fullName: cleanName,
    phone: cleanPhone,
    email: (params.guest.email || '').trim().slice(0, 120),
    address: (params.guest.address || '').trim().slice(0, 200),
    city: (params.guest.city || '').trim().slice(0, 80),
    state: (params.guest.state || '').trim().slice(0, 80),
    country: (params.guest.country || params.guest.nationality || 'Nigeria').trim().slice(0, 80),
    nationality: (params.guest.nationality || params.guest.country || 'Nigeria').trim().slice(0, 64),
    idType: params.guest.idType || 'NIN',
    idNumber: (params.guest.idNumber || '').trim().slice(0, 64),
    vipTier: params.guest.vipTier || 'Standard',
    totalStays: Math.max(0, Math.round(Number(params.guest.totalStays) || 0)),
    lifetimeSpendNgn: Math.max(0, Math.round(Number(params.guest.lifetimeSpendNgn) || 0)),
    notes: (params.guest.notes || '').trim().slice(0, 400),
    authorizedEmails: params.property.authorizedEmails,
    ownerUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guests',
      action: `Registered Guest ${cleanName}`,
      details: `VIP: ${payload.vipTier} · ID: ${payload.idType}`,
      authorizedEmails: params.property.authorizedEmails,
    }).catch(() => undefined);
    return id;
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
      'fullName' | 'email' | 'phone' | 'address' | 'city' | 'state' | 'country' | 'nationality' | 'idType' | 'idNumber' | 'vipTier' | 'notes'
    >
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'guests', params.guest.id);
  const sanitized: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (params.updates.fullName !== undefined) {
    const cleanName = params.updates.fullName.trim().slice(0, 120);
    if (cleanName.length < 2) throw new Error('Guest full name must be at least 2 characters.');
    sanitized.fullName = cleanName;
  }
  if (params.updates.email !== undefined) sanitized.email = params.updates.email.trim().slice(0, 120);
  if (params.updates.phone !== undefined) sanitized.phone = params.updates.phone.trim().slice(0, 32) || 'Not Provided';
  if (params.updates.address !== undefined) sanitized.address = params.updates.address.trim().slice(0, 200);
  if (params.updates.city !== undefined) sanitized.city = params.updates.city.trim().slice(0, 80);
  if (params.updates.state !== undefined) sanitized.state = params.updates.state.trim().slice(0, 80);
  if (params.updates.country !== undefined) sanitized.country = params.updates.country.trim().slice(0, 80);
  if (params.updates.nationality !== undefined) sanitized.nationality = params.updates.nationality.trim().slice(0, 64);
  if (params.updates.idType !== undefined) sanitized.idType = params.updates.idType;
  if (params.updates.idNumber !== undefined) sanitized.idNumber = params.updates.idNumber.trim().slice(0, 64);
  if (params.updates.vipTier !== undefined) sanitized.vipTier = params.updates.vipTier;
  if (params.updates.notes !== undefined) sanitized.notes = params.updates.notes.trim().slice(0, 400);

  try {
    await updateDoc(ref, sanitized);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guest Profile',
      action: `Updated Guest Profile: ${(sanitized.fullName as string) || params.guest.fullName}`,
      details: `Tier: ${(sanitized.vipTier as string) || params.guest.vipTier} · Phone: ${(sanitized.phone as string) || params.guest.phone}`,
      authorizedEmails: params.property.authorizedEmails,
    }).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteGuestRecordWorkflow(params: {
  property: PropertyRecord;
  guest: GuestRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'guests', params.guest.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Guest Profile',
      action: `Deleted Guest Record: ${params.guest.fullName}`,
      details: `Removed profile (${params.guest.phone}) from directory.`,
      authorizedEmails: params.property.authorizedEmails,
    }).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
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

export async function updateHousekeepingTaskWorkflow(params: {
  property: PropertyRecord;
  task: HousekeepingTaskRecord;
  updates: Pick<HousekeepingTaskRecord, 'taskType' | 'assignedTo' | 'priority' | 'notes'>;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'housekeeping_tasks', params.task.id);
  try {
    await updateDoc(ref, {
      taskType: params.updates.taskType,
      assignedTo: params.updates.assignedTo.trim().slice(0, 80),
      priority: params.updates.priority,
      notes: (params.updates.notes || '').trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Housekeeping',
      action: `Edited Task Room ${params.task.roomNumber}`,
      details: `${params.updates.taskType} · ${params.updates.assignedTo} (${params.updates.priority})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteHousekeepingTaskWorkflow(params: {
  property: PropertyRecord;
  task: HousekeepingTaskRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'housekeeping_tasks', params.task.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Housekeeping',
      action: `Deleted Housekeeping Task (Room ${params.task.roomNumber})`,
      details: `${params.task.taskType} assigned to ${params.task.assignedTo}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export async function syncDefaultPosMenuIfNeeded(_property: PropertyRecord): Promise<boolean> {
  // No demo restaurant menu seeding; operators create real dishes & beverages via Menu Management.
  return false;
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

export async function updateLedgerEntryWorkflow(params: {
  property: PropertyRecord;
  entry: LedgerEntryRecord;
  updates: Pick<
    LedgerEntryRecord,
    'entryDate' | 'entryType' | 'category' | 'description' | 'amountNgn' | 'vatNgn' | 'paymentMethod'
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'ledger_entries', params.entry.id);
  const cleanAmount = Math.max(0, Math.round(params.updates.amountNgn));
  try {
    await updateDoc(ref, {
      entryDate: params.updates.entryDate.trim().slice(0, 24),
      entryType: params.updates.entryType,
      category: params.updates.category,
      description: params.updates.description.trim().slice(0, 240),
      amountNgn: cleanAmount,
      vatNgn: Math.max(0, Math.round(params.updates.vatNgn)),
      paymentMethod: params.updates.paymentMethod.trim().slice(0, 48),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Accounting',
      action: `Edited Ledger Entry (${params.entry.reference || params.entry.category})`,
      details: `${params.updates.description.trim()} · ₦${cleanAmount.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteLedgerEntryWorkflow(params: {
  property: PropertyRecord;
  entry: LedgerEntryRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'ledger_entries', params.entry.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Accounting',
      action: `Deleted Ledger Entry (${params.entry.reference || params.entry.category})`,
      details: `${params.entry.description} · ₦${params.entry.amountNgn.toLocaleString('en-NG')}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
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

export async function updateInventoryItemWorkflow(params: {
  property: PropertyRecord;
  item: InventoryItemRecord;
  updates: Omit<InventoryItemRecord, 'id' | 'propertyId' | 'authorizedEmails' | 'ownerUid'>;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'inventory_items', params.item.id);
  try {
    await updateDoc(ref, {
      sku: params.updates.sku.trim().toUpperCase().slice(0, 32),
      name: params.updates.name.trim().slice(0, 120),
      category: params.updates.category,
      unit: params.updates.unit.trim().slice(0, 24),
      quantityOnHand: Math.max(0, Math.round(params.updates.quantityOnHand)),
      reorderLevel: Math.max(0, Math.round(params.updates.reorderLevel)),
      unitCostNgn: Math.max(0, Math.round(params.updates.unitCostNgn)),
      supplierName: params.updates.supplierName.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Inventory',
      action: `Edited SKU ${params.updates.sku.trim().toUpperCase()}`,
      details: `${params.updates.name.trim()} · ${params.updates.quantityOnHand} ${params.updates.unit}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteInventoryItemWorkflow(params: {
  property: PropertyRecord;
  item: InventoryItemRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'inventory_items', params.item.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Inventory',
      action: `Deleted SKU ${params.item.sku}`,
      details: `${params.item.name} removed from store catalog.`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
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
  const poNumber = `PO-${getPropertyCodePrefix(params.property)}-${Math.floor(500 + Math.random() * 499)}`;
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

export async function deleteShiftWorkflow(params: {
  property: PropertyRecord;
  shift: ShiftScheduleRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'shifts', params.shift.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Shifts & Attendance',
      action: `Deleted Shift: ${params.shift.staffName}`,
      details: `${params.shift.shiftDate} · ${params.shift.shiftWindow}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
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

export async function clockInCurrentStaffWorkflow(params: {
  property: PropertyRecord;
  staffId?: string;
  staffName: string;
  actorRole: string;
}): Promise<{ id: string; clockInTime: string; date: string }> {
  const { uid, email } = getActorContext();
  const id = cleanId('att');
  const nowDate = new Date();
  const timeStr = nowDate.toTimeString().slice(0, 5);
  const dateIso = nowDate.toISOString().slice(0, 10);
  const resolvedStaffId = (params.staffId || uid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || uid;
  const resolvedName = (params.staffName.trim() || email || 'Staff Member').slice(0, 120);
  const safeName = resolvedName.length >= 2 ? resolvedName : `${resolvedName} Staff`;
  const ref = doc(db, 'properties', params.property.id, 'attendance', id);
  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      staffId: resolvedStaffId,
      staffName: safeName,
      date: dateIso,
      clockInTime: timeStr,
      status: 'present',
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Shifts & Attendance',
      action: `Clocked In: ${safeName}`,
      details: `${dateIso} · Clocked in at ${timeStr}`,
      authorizedEmails: params.property.authorizedEmails,
    }).catch(() => undefined);
    return { id, clockInTime: timeStr, date: dateIso };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ref.path);
  }
}

export async function clockOutAttendance(params: {
  property: PropertyRecord;
  record: AttendanceRecord;
  actorRole?: string;
}): Promise<string> {
  const ref = doc(db, 'properties', params.property.id, 'attendance', params.record.id);
  const clockOutTime = new Date().toTimeString().slice(0, 5);
  try {
    await updateDoc(ref, {
      clockOutTime,
      status: 'clocked_out',
      updatedAt: serverTimestamp(),
    });
    if (params.actorRole) {
      await writeAuditLog({
        propertyId: params.property.id,
        actorRole: params.actorRole,
        module: 'Shifts & Attendance',
        action: `Clocked Out: ${params.record.staffName}`,
        details: `${params.record.date} · In: ${params.record.clockInTime} · Out: ${clockOutTime}`,
        authorizedEmails: params.property.authorizedEmails,
      }).catch(() => undefined);
    }
    return clockOutTime;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function endStaffShiftWorkflow(params: {
  property: PropertyRecord;
  activeAttendance?: AttendanceRecord | null;
  activeShift?: ShiftScheduleRecord | null;
  staffId?: string;
  staffName: string;
  department: string;
  handoverNotes: string;
  actorRole: string;
}): Promise<{ clockOutTime: string; closedAtIso: string }> {
  const { uid, email } = getActorContext();
  const nowDate = new Date();
  const clockOutTime = nowDate.toTimeString().slice(0, 5);
  const closedAtIso = nowDate.toISOString();
  const dateIso = closedAtIso.slice(0, 10);
  const cleanNotes = params.handoverNotes.trim().slice(0, 400);
  const safeName = (params.staffName.trim() || email || 'Staff Member').slice(0, 120);

  if (params.activeAttendance && !params.activeAttendance.clockOutTime) {
    await clockOutAttendance({
      property: params.property,
      record: params.activeAttendance,
    });
  }

  if (params.activeShift && params.activeShift.status === 'scheduled') {
    await closeShiftWorkflow({
      property: params.property,
      shift: params.activeShift,
      handoverNotes: cleanNotes,
      actorRole: params.actorRole,
    });
  } else {
    const hour = nowDate.getHours();
    const shiftWindow: ShiftScheduleRecord['shiftWindow'] =
      hour >= 7 && hour < 15
        ? 'Morning (07:00 - 15:00)'
        : hour >= 15 && hour < 23
          ? 'Afternoon (15:00 - 23:00)'
          : 'Night (23:00 - 07:00)';
    const id = cleanId('shf');
    const ref = doc(db, 'properties', params.property.id, 'shifts', id);
    try {
      await setDoc(ref, {
        propertyId: params.property.id,
        staffId: (params.staffId || uid).slice(0, 128),
        staffName: safeName.length >= 2 ? safeName : `${safeName} Staff`,
        department: (params.department || 'Front Desk').slice(0, 64),
        shiftDate: dateIso,
        shiftWindow,
        status: 'completed',
        handoverNotes: cleanNotes,
        closedBy: email.slice(0, 120),
        closedAtIso,
        authorizedEmails: params.property.authorizedEmails,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        propertyId: params.property.id,
        actorRole: params.actorRole,
        module: 'Shifts & Attendance',
        action: `Ended Shift: ${safeName}`,
        details: `${dateIso} · ${shiftWindow} · Out: ${clockOutTime}${cleanNotes ? ` · Notes: ${cleanNotes}` : ''}`,
        authorizedEmails: params.property.authorizedEmails,
      }).catch(() => undefined);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, ref.path);
    }
  }

  return { clockOutTime, closedAtIso };
}

export async function deleteAttendanceWorkflow(params: {
  property: PropertyRecord;
  record: AttendanceRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'attendance', params.record.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Shifts & Attendance',
      action: `Deleted Attendance Log: ${params.record.staffName}`,
      details: `${params.record.date} · In: ${params.record.clockInTime}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
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

export async function updateMaintenanceTicketWorkflow(params: {
  property: PropertyRecord;
  ticket: MaintenanceTicketRecord;
  updates: Pick<
    MaintenanceTicketRecord,
    'locationLabel' | 'issueTitle' | 'category' | 'priority' | 'assignedTo' | 'estimatedCostNgn'
  >;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'maintenance_tickets', params.ticket.id);
  try {
    await updateDoc(ref, {
      locationLabel: params.updates.locationLabel.trim().slice(0, 80),
      issueTitle: params.updates.issueTitle.trim().slice(0, 160),
      category: params.updates.category,
      priority: params.updates.priority,
      assignedTo: params.updates.assignedTo.trim().slice(0, 80),
      estimatedCostNgn: Math.max(0, Math.round(params.updates.estimatedCostNgn)),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Maintenance',
      action: `Edited Ticket: ${params.updates.locationLabel.trim()}`,
      details: `${params.updates.issueTitle.trim()} (${params.updates.priority})`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
}

export async function deleteMaintenanceTicketWorkflow(params: {
  property: PropertyRecord;
  ticket: MaintenanceTicketRecord;
  actorRole: string;
}) {
  const ref = doc(db, 'properties', params.property.id, 'maintenance_tickets', params.ticket.id);
  try {
    await deleteDoc(ref);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Maintenance',
      action: `Deleted Ticket: ${params.ticket.locationLabel}`,
      details: params.ticket.issueTitle,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, ref.path);
  }
}

export async function updateReservationCautionDepositWorkflow(params: {
  property: PropertyRecord;
  reservation: ReservationRecord;
  cautionDepositEnabled: boolean;
  cautionDepositNgn: number;
  cautionDepositCollectedNgn: number;
  cautionDepositRefunded: boolean;
  actorRole: string;
}) {
  const resRef = doc(db, 'properties', params.property.id, 'reservations', params.reservation.id);
  const enabled = Boolean(params.cautionDepositEnabled);
  const feeNgn = enabled ? Math.max(0, Math.round(params.cautionDepositNgn)) : 0;
  const collectedNgn = enabled ? Math.max(0, Math.round(params.cautionDepositCollectedNgn)) : 0;
  const refunded = enabled && Boolean(params.cautionDepositRefunded);
  const refundedAtIso = refunded
    ? params.reservation.cautionDepositRefundedAtIso || new Date().toISOString()
    : '';
  try {
    await updateDoc(resRef, {
      cautionDepositEnabled: enabled,
      cautionDepositNgn: feeNgn,
      cautionDepositCollectedNgn: collectedNgn,
      cautionDepositRefunded: refunded,
      cautionDepositRefundedAtIso: refundedAtIso,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Reservations',
      action: refunded
        ? `Refunded Caution Deposit (${params.reservation.bookingRef})`
        : `Updated Caution Deposit (${params.reservation.bookingRef})`,
      details: enabled
        ? `Fee ₦${feeNgn.toLocaleString()} · Collected ₦${collectedNgn.toLocaleString()} · Refunded: ${refunded ? 'Yes' : 'No'}`
        : 'Caution deposit disabled',
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, resRef.path);
  }
}

export interface OtaSyncResult {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  totalEvents: number;
  connected?: boolean;
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function normalizeIcalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const converted = trimmed.replace(/^webcals?:\/\//i, 'https://');
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(converted) ? converted : `https://${converted}`;
}

async function fetchRemoteIcsFeed(rawImportUrl: string, channelName: string): Promise<string> {
  const normalizedUrl = normalizeIcalUrl(rawImportUrl);
  if (!normalizedUrl) {
    throw new Error(
      `No inbound .ics calendar link is saved for ${channelName}. Paste your property OTA .ics link or upload a .ics file.`
    );
  }

  let proxyErrorMsg = '';
  try {
    const resp = await fetch(`/api/ical-proxy?url=${encodeURIComponent(normalizedUrl)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (resp.ok) {
      const text = (await resp.text()).replace(/^\uFEFF/, '');
      if (/begin:vcalendar/i.test(text)) {
        return text;
      }
      proxyErrorMsg = 'Calendar endpoint did not return an .ics calendar feed.';
    } else {
      proxyErrorMsg = `Calendar sync failed (HTTP ${resp.status}).`;
      try {
        const json = (await resp.json()) as { error?: string };
        if (json.error) proxyErrorMsg = json.error;
      } catch {
        // ignore non-JSON error
      }
    }
  } catch (err) {
    proxyErrorMsg = err instanceof Error ? err.message : 'Unable to reach calendar sync proxy.';
  }

  // Fallback: direct CORS-enabled fetch if host does not mount /api/ical-proxy
  try {
    const directResp = await fetch(normalizedUrl, {
      method: 'GET',
      headers: { Accept: 'text/calendar, text/plain, */*' },
    });
    if (directResp.ok) {
      const directText = (await directResp.text()).replace(/^\uFEFF/, '');
      if (/begin:vcalendar/i.test(directText)) {
        return directText;
      }
    }
  } catch {
    // Browser CORS blocked direct fetch; surface the proxy error below
  }

  throw new Error(
    proxyErrorMsg ||
      `Unable to fetch valid iCalendar (.ics) data for ${channelName}. Verify the link or upload the .ics file directly.`
  );
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

  // Status-only toggle (Connect/Disconnect or AutoSync toggle) — persisted permanently in Firestore
  if (params.toggleConnect || params.toggleAutoSync) {
    const disconnectPatch = params.toggleConnect
      ? nextConnected
        ? { connected: true, disconnectedAtIso: '' }
        : { connected: false, autoSync: false, disconnectedAtIso: new Date().toISOString() }
      : { connected: nextConnected, autoSync: nextAutoSync };
    try {
      await updateDoc(ref, {
        ...disconnectPatch,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        propertyId: params.property.id,
        actorRole: params.actorRole,
        module: 'Channel Manager',
        action: `${nextConnected ? 'Connected' : 'Disconnected'} ${params.channel.channelName}`,
        details: `Connected: ${nextConnected} · AutoSync: ${nextConnected ? nextAutoSync : false}`,
        authorizedEmails: params.property.authorizedEmails,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, ref.path);
    }
    return {
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
      totalEvents: 0,
      connected: nextConnected,
    };
  }

  // Strictly block syncing disconnected calendars until manually reconnected
  if (!params.channel.connected) {
    throw new Error(
      `${params.channel.channelName} is currently disconnected. Click Connect to reconnect this calendar manually before syncing.`
    );
  }

  // Real OTA .ics fetch via server/Edge proxy or uploaded .ics text
  let rawIcs = (params.icsRawText || '').replace(/^\uFEFF/, '').trim();
  if (rawIcs) {
    if (!/begin:vcalendar/i.test(rawIcs)) {
      throw new Error(
        `The uploaded file for ${params.channel.channelName} is not a valid iCalendar (.ics) file.`
      );
    }
  } else {
    const importUrl = params.channel.icalImportUrl?.trim();
    if (!importUrl) {
      throw new Error(
        `No inbound .ics calendar link is saved for ${params.channel.channelName}. Paste your property OTA .ics link or upload a .ics file.`
      );
    }
    rawIcs = await fetchRemoteIcsFeed(importUrl, params.channel.channelName);
  }

  const resolvedChannelSource =
    params.channel.channelName === 'Direct Website Engine'
      ? ('Direct Web' as const)
      : params.channel.channelName === 'Hotels.ng'
        ? ('Booking.com' as const)
        : params.channel.channelName;

  const parsedEvents = parseIcalEvents(rawIcs, resolvedChannelSource);

  // Load current rooms, reservations & guests fresh when not supplied
  let roomList = params.rooms ? params.rooms.map((r) => ({ ...r })) : [];
  if (roomList.length === 0) {
    const roomsSnap = await getDocs(collection(db, 'properties', params.property.id, 'rooms'));
    roomList = roomsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomRecord, 'id'>) }));
  }
  roomList = sortRoomsByNumber(roomList);
  if (roomList.length === 0) {
    throw new Error('No rooms exist in this property to assign imported OTA bookings.');
  }

  // Always read live reservations from Firestore so sequential/multi-room OTA syncs never work on stale state
  const resSnap = await getDocs(
    collection(db, 'properties', params.property.id, 'reservations')
  );
  const existingReservations: ReservationRecord[] = resSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ReservationRecord, 'id'>),
  }));

  const guestsSnap = await getDocs(collection(db, 'properties', params.property.id, 'guests'));
  const existingGuests: GuestRecord[] = guestsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<GuestRecord, 'id'>),
  }));

  const guestByEmail = new Map<string, GuestRecord>();
  const guestByPhone = new Map<string, GuestRecord>();
  const guestByName = new Map<string, GuestRecord>();
  for (const g of existingGuests) {
    if (g.email && g.email.trim()) guestByEmail.set(g.email.trim().toLowerCase(), g);
    if (g.phone && g.phone.trim() && g.phone !== 'Not Provided') {
      guestByPhone.set(g.phone.replace(/\s+/g, ''), g);
    }
    if (g.fullName && g.fullName.trim()) guestByName.set(g.fullName.trim().toLowerCase(), g);
  }

  const byId = new Map<string, ReservationRecord>();
  const byExternalUid = new Map<string, ReservationRecord[]>();
  const byBookingRef = new Map<string, ReservationRecord[]>();
  for (const r of existingReservations) {
    byId.set(r.id, r);
    if (r.externalUid) {
      const key = `${r.channel}::${r.externalUid}`;
      const list = byExternalUid.get(key) || [];
      list.push(r);
      byExternalUid.set(key, list);
    }
    if (r.bookingRef) {
      const key = `${r.channel}::${r.bookingRef.toUpperCase()}`;
      const list = byBookingRef.get(key) || [];
      list.push(r);
      byBookingRef.set(key, list);
    }
  }

  // Keep 7-day buffer so UTC vs local timezone differences never drop active or recent OTA bookings
  const recentCutoffIso = getLocalIsoDate(new Date(Date.now() - 7 * 86400000));
  const todayIso = getLocalIsoDate();
  const { email: actorEmail } = getActorContext();
  const syncAuthEmails = Array.from(
    new Set(
      [
        ...(params.property.authorizedEmails || []),
        ...(actorEmail ? [actorEmail, actorEmail.toLowerCase()] : []),
      ].filter(Boolean)
    )
  );

  const normalizedMappedRoom = (params.channel.roomNumber || '').trim();
  const isSpecificMappedRoom =
    Boolean(normalizedMappedRoom) &&
    normalizedMappedRoom.toLowerCase() !== 'all rooms' &&
    normalizedMappedRoom.toLowerCase() !== 'all suites' &&
    normalizedMappedRoom.toLowerCase() !== 'all';

  const findRoomsMatchingHint = (hint?: string): RoomRecord[] => {
    const raw = (hint || '').trim().toLowerCase();
    if (!raw) return [];

    // 1. Direct flexible room matcher (RM-1, Room 1, RM 01, room.name, or roomId)
    const directMatches = roomList.filter((r) => matchesRoomRecord(r, raw, hint));
    if (directMatches.length > 0) return directMatches;

    // 2. Direct RM-X code inside longer text
    const rmMatch = raw.match(/\b(rm-\d{1,2})\b/i);
    if (rmMatch) {
      const byCode = roomList.filter((r) => matchesRoomRecord(r, undefined, rmMatch[1]));
      if (byCode.length > 0) return byCode;
    }

    // 3. Exact roomNumber or roomName substring match
    const exactCodeOrName = roomList.filter(
      (r) =>
        r.roomNumber.toLowerCase() === raw ||
        r.name.toLowerCase() === raw ||
        raw.includes(r.name.toLowerCase())
    );
    if (exactCodeOrName.length > 0) return exactCodeOrName;

    // 4. Longest roomType match first (so "Deluxe Studio with Kitchenette" beats "Deluxe Studio")
    const byTypeLengthDesc = [...roomList].sort((a, b) => b.roomType.length - a.roomType.length);
    for (const candidate of byTypeLengthDesc) {
      const rt = candidate.roomType.trim().toLowerCase();
      if (rt && (raw.includes(rt) || rt.includes(raw))) {
        return roomList.filter((r) => r.roomType.trim().toLowerCase() === rt);
      }
    }

    return [];
  };

  const mappedRoomsFromChannel = isSpecificMappedRoom
    ? roomList.filter((r) => matchesRoomRecord(r, normalizedMappedRoom, normalizedMappedRoom))
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
      ev.listingIdHint,
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
          matchesRoomRecord(room, res.roomId, res.roomNumber) &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlapIso(ev.checkInDate, ev.checkOutDate, res.checkInDate, res.checkOutDate)
      );

    if (matchedPool.length > 0) {
      const freeMatch = matchedPool.find(isFree);
      return freeMatch || matchedPool[0];
    }

    // When unmapped (All Rooms & no room hint), spread channels deterministically across available rooms
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
          matchesRoomRecord(a, res.roomId, res.roomNumber) &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlapIso(ev.checkInDate, ev.checkOutDate, res.checkInDate, res.checkOutDate)
      ).length;
      const countB = existingReservations.filter(
        (res) =>
          res.id !== ignoreReservationId &&
          matchesRoomRecord(b, res.roomId, res.roomNumber) &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlapIso(ev.checkInDate, ev.checkOutDate, res.checkInDate, res.checkOutDate)
      ).length;
      return countA - countB;
    });
    return sortedByLoad[0] || roomList[0];
  };

  const propertyCurrency: ChannelCurrency =
    (params.property.currency as ChannelCurrency) || 'NGN';

  const resolveChannelRoomPricing = (ev: ParsedIcalEvent, assignedRoom: RoomRecord) => {
    const channelCurrency: ChannelCurrency = ev.paidCurrency || propertyCurrency;
    const fxRateToNgn = getFxRateToNgn(channelCurrency, params.property.usdExchangeRateNgn);

    let sourceNightlyRate = 0;
    let sourceTotalAmount = 0;

    if (typeof ev.sourceNightlyRate === 'number' && ev.sourceNightlyRate > 0) {
      sourceNightlyRate = Number(ev.sourceNightlyRate.toFixed(2));
    } else if (typeof ev.sourceTotalAmount === 'number' && ev.sourceTotalAmount > 0) {
      sourceNightlyRate = Number((ev.sourceTotalAmount / Math.max(1, ev.nights)).toFixed(2));
    } else if (typeof ev.paidAmount === 'number' && ev.paidAmount > 0) {
      sourceNightlyRate = Number((ev.paidAmount / Math.max(1, ev.nights)).toFixed(2));
    } else {
      const roomNgn = assignedRoom.nightlyRateNgn || 0;
      sourceNightlyRate =
        channelCurrency === 'NGN'
          ? roomNgn
          : Number((roomNgn / Math.max(1, fxRateToNgn)).toFixed(2));
    }

    if (typeof ev.sourceTotalAmount === 'number' && ev.sourceTotalAmount > 0) {
      sourceTotalAmount = Number(ev.sourceTotalAmount.toFixed(2));
    } else if (typeof ev.sourceNightlyRate === 'number' && ev.sourceNightlyRate > 0) {
      sourceTotalAmount = Number((sourceNightlyRate * Math.max(1, ev.nights)).toFixed(2));
    } else if (typeof ev.paidAmount === 'number' && ev.paidAmount > 0) {
      sourceTotalAmount = Number(ev.paidAmount.toFixed(2));
    } else {
      const roomTotalNgn = (assignedRoom.nightlyRateNgn || 0) * Math.max(1, ev.nights);
      sourceTotalAmount =
        channelCurrency === 'NGN'
          ? Number(roomTotalNgn.toFixed(2))
          : Number((roomTotalNgn / Math.max(1, fxRateToNgn)).toFixed(2));
    }

    const commissionPct = Math.max(0, Math.min(50, Number(params.channel.commissionPct ?? 0)));
    const isDirectChannel =
      params.channel.channelName === 'Direct Website Engine' ||
      resolvedChannelSource === 'Direct Web';
    const collectionMode: OtaPaymentCollectionMode =
      typeof ev.paidAmount === 'number' && ev.paidAmount > 0
        ? 'ota_prepaid'
        : isDirectChannel
          ? 'hotel_collect'
          : 'ota_prepaid';

    const otaPaidSourceAmount =
      typeof ev.paidAmount === 'number' && ev.paidAmount > 0
        ? Number(ev.paidAmount.toFixed(2))
        : collectionMode === 'ota_prepaid' && sourceTotalAmount > 0
          ? sourceTotalAmount
          : 0;

    const grossNgn =
      channelCurrency === 'NGN'
        ? Math.round(sourceTotalAmount)
        : Math.round(sourceTotalAmount * fxRateToNgn);
    const nightlyRateNgn =
      channelCurrency === 'NGN'
        ? Math.round(sourceNightlyRate)
        : Math.round(sourceNightlyRate * fxRateToNgn);
    const otaPaidNgn =
      channelCurrency === 'NGN'
        ? Math.round(otaPaidSourceAmount)
        : Math.round(otaPaidSourceAmount * fxRateToNgn);
    const expectedPayoutNgn = Math.max(0, Math.round(grossNgn * (1 - commissionPct / 100)));
    const roomChargesNgn =
      expectedPayoutNgn > 0
        ? expectedPayoutNgn
        : (assignedRoom.nightlyRateNgn || 0) * Math.max(1, ev.nights);

    return {
      nightlyRateNgn: nightlyRateNgn > 0 ? nightlyRateNgn : assignedRoom.nightlyRateNgn || 0,
      roomChargesNgn,
      expectedPayoutNgn: expectedPayoutNgn > 0 ? expectedPayoutNgn : roomChargesNgn,
      sourceCurrency: channelCurrency,
      sourceNightlyRate,
      sourceTotalAmount,
      fxRateToNgn,
      otaPaidSourceAmount,
      otaPaidNgn,
      paymentCollectionMode:
        otaPaidSourceAmount > 0 ? ('ota_prepaid' as const) : collectionMode,
    };
  };

  let created = 0;
  let updated = 0;
  let cancelled = 0;
  let skipped = 0;

  type QueuedWrite =
    | { kind: 'set'; ref: ReturnType<typeof doc>; data: Record<string, unknown> }
    | { kind: 'update'; ref: ReturnType<typeof doc>; data: Record<string, unknown> };
  const writes: QueuedWrite[] = [];
  const now = serverTimestamp();

  const ensureGuestForEvent = (ev: ParsedIcalEvent, chargeNgn: number): string | undefined => {
    const safeName = (ev.guestName || `${resolvedChannelSource} Guest`).trim().slice(0, 120);
    if (safeName.length < 2) return undefined;

    const emailKey = ev.guestEmail?.trim().toLowerCase() || '';
    const phoneRaw = ev.guestPhone?.trim().slice(0, 32) || '';
    const phoneKey = phoneRaw.replace(/\s+/g, '');
    const nameKey = safeName.toLowerCase();

    const matched =
      (emailKey && guestByEmail.get(emailKey)) ||
      (phoneKey.length >= 6 && guestByPhone.get(phoneKey)) ||
      guestByName.get(nameKey);

    if (matched) {
      const updates: Record<string, unknown> = {};
      if (emailKey && (!matched.email || matched.email !== emailKey)) {
        updates.email = emailKey;
        matched.email = emailKey;
        guestByEmail.set(emailKey, matched);
      }
      if (phoneRaw.length >= 6 && (matched.phone === 'Not Provided' || !matched.phone)) {
        updates.phone = phoneRaw;
        matched.phone = phoneRaw;
        guestByPhone.set(phoneKey, matched);
      }
      if (Object.keys(updates).length > 0) {
        writes.push({
          kind: 'update',
          ref: doc(db, 'properties', params.property.id, 'guests', matched.id),
          data: { ...updates, updatedAt: now },
        });
      }
      return matched.id;
    }

    const guestId = cleanId('gst');
    const validPhone = phoneRaw.length >= 6 ? phoneRaw : 'Not Provided';
    const newGuest: Omit<GuestRecord, 'id'> & Record<string, unknown> = {
      propertyId: params.property.id,
      fullName: safeName,
      ...(emailKey ? { email: emailKey } : {}),
      phone: validPhone,
      ...(ev.guestAddress ? { address: ev.guestAddress } : {}),
      ...(ev.guestCity ? { city: ev.guestCity } : {}),
      ...(ev.guestState ? { state: ev.guestState } : {}),
      ...(ev.guestCountry ? { country: ev.guestCountry } : {}),
      idType: 'International Passport',
      vipTier: 'Standard',
      totalStays: 1,
      lifetimeSpendNgn: Math.max(0, chargeNgn),
      notes: `Synced from ${resolvedChannelSource} iCal`.slice(0, 400),
      authorizedEmails: params.property.authorizedEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    };

    writes.push({
      kind: 'set',
      ref: doc(db, 'properties', params.property.id, 'guests', guestId),
      data: newGuest,
    });
    const cachedGuest: GuestRecord = { id: guestId, ...(newGuest as Omit<GuestRecord, 'id'>) };
    if (emailKey) guestByEmail.set(emailKey, cachedGuest);
    if (validPhone !== 'Not Provided') guestByPhone.set(validPhone.replace(/\s+/g, ''), cachedGuest);
    guestByName.set(nameKey, cachedGuest);
    return guestId;
  };

  const processedReservationIds = new Set<string>();

  for (const ev of parsedEvents) {
    // Ignore events exported by this property's own PMS feed to avoid circular duplicates
    if (ev.uid.endsWith('@richgates-pms') || ev.uid.endsWith('@pchpms.com')) {
      skipped += 1;
      continue;
    }

    const uidSeed = ev.rawUid || ev.uid;
    let deterministicId = deterministicOtaReservationId(params.channel.id, uidSeed);
    const uidCandidates = byExternalUid.get(`${resolvedChannelSource}::${ev.uid}`) || [];
    const refCandidates = ev.otaBookingRef
      ? byBookingRef.get(`${resolvedChannelSource}::${ev.otaBookingRef.toUpperCase()}`) || []
      : [];
    const belongsToThisChannelRoom = (cand?: ReservationRecord): boolean => {
      if (!cand) return false;
      if (processedReservationIds.has(cand.id)) return false;
      if (mappedRoomsFromChannel.length === 0) return true;
      return mappedRoomsFromChannel.some((rm) =>
        matchesRoomRecord(rm, cand.roomId, cand.roomNumber)
      );
    };
    const isDateConsistentForGenericEvent = (cand: ReservationRecord): boolean => {
      if (ev.otaBookingRef && cand.bookingRef?.toUpperCase() === ev.otaBookingRef.toUpperCase()) {
        return true;
      }
      // If event has no explicit confirmation code (e.g. "Airbnb (Not available)"), match same/overlapping dates
      return (
        cand.checkInDate === ev.checkInDate ||
        cand.checkOutDate === ev.checkOutDate ||
        datesOverlapIso(ev.checkInDate, ev.checkOutDate, cand.checkInDate, cand.checkOutDate)
      );
    };
    const directIdCandidate = byId.get(deterministicId);
    const matchedById =
      directIdCandidate &&
      !processedReservationIds.has(directIdCandidate.id) &&
      (ev.otaBookingRef || isDateConsistentForGenericEvent(directIdCandidate))
        ? directIdCandidate
        : undefined;
    const matchedByUid = uidCandidates.find(
      (c) => belongsToThisChannelRoom(c) && (ev.otaBookingRef || isDateConsistentForGenericEvent(c))
    );
    const matchedByRef = refCandidates.find((c) => belongsToThisChannelRoom(c));

    let existing = matchedById || matchedByUid || matchedByRef;

    // Guard: never let two distinct VEVENTs in the same feed overwrite each other or collide on ID
    if (!existing && directIdCandidate) {
      deterministicId = deterministicOtaReservationId(
        params.channel.id,
        `${uidSeed}::${ev.checkInDate}::${ev.checkOutDate}`
      );
      const dateScopedCand = byId.get(deterministicId);
      if (dateScopedCand && !processedReservationIds.has(dateScopedCand.id)) {
        existing = dateScopedCand;
      }
    }
    if (existing && processedReservationIds.has(existing.id)) {
      deterministicId = deterministicOtaReservationId(
        params.channel.id,
        `${uidSeed}::${ev.checkInDate}::${ev.checkOutDate}`
      );
      const retryCand = byId.get(deterministicId);
      existing = retryCand && !processedReservationIds.has(retryCand.id) ? retryCand : undefined;
    }
    processedReservationIds.add(existing ? existing.id : deterministicId);

    const safeGuestName = (ev.guestName || `${resolvedChannelSource} Guest`).trim().slice(0, 120);
    const safeAdults = Math.max(1, Math.min(20, ev.adults ?? 2));
    const safeChildren = Math.max(0, Math.min(20, ev.children ?? 0));
    const safeBookingRef =
      ev.otaBookingRef && ev.otaBookingRef.length >= 4
        ? ev.otaBookingRef.slice(0, 32)
        : `OTA-${deterministicId.slice(4, 10).toUpperCase()}`;

    if (existing) {
      if (existing.status === 'checked_out' || existing.status === 'no_show') {
        skipped += 1;
        continue;
      }

      if (ev.cancelled) {
        if (existing.status !== 'cancelled') {
          const resRef = doc(db, 'properties', params.property.id, 'reservations', existing.id);
          writes.push({
            kind: 'update',
            ref: resRef,
            data: {
              status: 'cancelled',
              cancellationType: 'free',
              cancellationFeeNgn: 0,
              cancellationReason: `Cancelled via ${resolvedChannelSource} iCal sync`,
              cancelledAtIso: new Date().toISOString(),
              updatedAt: now,
            },
          });
          const heldRoom = roomList.find((r) => r.currentReservationId === existing.id);
          if (heldRoom && heldRoom.occupancyStatus === 'reserved') {
            writes.push({
              kind: 'update',
              ref: doc(db, 'properties', params.property.id, 'rooms', heldRoom.id),
              data: {
                occupancyStatus: 'vacant',
                currentGuestName: '',
                currentReservationId: '',
                updatedAt: now,
              },
            });
            heldRoom.occupancyStatus = 'vacant';
            heldRoom.currentGuestName = '';
            heldRoom.currentReservationId = '';
          }
          existing.status = 'cancelled';
          cancelled += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const assignedRoom =
        existing.status === 'checked_in'
          ? roomList.find((r) => r.id === existing.roomId) || pickRoomForEvent(ev, existing.id)
          : pickRoomForEvent(ev, existing.id);
      const pricing = resolveChannelRoomPricing(ev, assignedRoom);
      const linkedGuestId = existing.guestId || ensureGuestForEvent(ev, pricing.roomChargesNgn);
      const nextAdults = Math.max(
        1,
        Math.min(20, ev.adults ?? existing.adults ?? Math.min(2, assignedRoom.maxGuests || 2))
      );
      const nextChildren = Math.max(0, Math.min(20, ev.children ?? existing.children ?? 0));
      const targetBookingRef =
        ev.otaBookingRef && ev.otaBookingRef.length >= 4
          ? ev.otaBookingRef.slice(0, 32)
          : existing.bookingRef;
      const targetStatus = existing.status === 'cancelled' ? 'confirmed' : existing.status;

      const existingHotelPaid = Math.max(0, Number(existing.hotelPaidNgn ?? 0));
      const existingActualPayout =
        existing.otaPayoutStatus === 'received'
          ? Math.max(0, Math.round(existing.actualPayoutReceivedNgn ?? 0))
          : 0;
      const isOtaImport = isOtaBookingChannel(resolvedChannelSource);
      const channelDefaultRateSet = Math.max(0, Number(params.channel.defaultNightlyRate ?? 0)) > 0;
      const hasExplicitIcalPayment =
        (ev.paidAmount !== undefined && ev.paidAmount > 0) ||
        (ev.sourceTotalAmount !== undefined && ev.sourceTotalAmount > 0) ||
        (ev.sourceNightlyRate !== undefined && ev.sourceNightlyRate > 0) ||
        Boolean(ev.paidCurrency);
      const currencyOrAmountUpgradeNeeded =
        existing.sourceCurrency !== pricing.sourceCurrency ||
        ((existing.otaPaidSourceAmount ?? 0) === 0 && pricing.otaPaidSourceAmount > 0) ||
        ((existing.sourceTotalAmount ?? 0) === 0 && pricing.sourceTotalAmount > 0) ||
        Math.abs((existing.expectedPayoutNgn ?? 0) - pricing.expectedPayoutNgn) > 1 ||
        (channelDefaultRateSet &&
          (Math.abs((existing.sourceNightlyRate ?? 0) - pricing.sourceNightlyRate) > 0.01 ||
            Math.abs((existing.sourceTotalAmount ?? 0) - pricing.sourceTotalAmount) > 0.01));
      // Preserve manual hotel payment settings across subsequent iCal syncs
      const shouldUpdatePayment =
        !existing.paymentManuallyEdited &&
        ((hasExplicitIcalPayment &&
          (Math.abs((existing.otaPaidSourceAmount ?? 0) - pricing.otaPaidSourceAmount) > 0.01 ||
            Math.abs((existing.sourceTotalAmount ?? 0) - pricing.sourceTotalAmount) > 0.01 ||
            Math.abs((existing.sourceNightlyRate ?? 0) - pricing.sourceNightlyRate) > 0.01 ||
            existing.sourceCurrency !== pricing.sourceCurrency)) ||
          currencyOrAmountUpgradeNeeded);

      const needsUpdate =
        existing.checkInDate !== ev.checkInDate ||
        existing.checkOutDate !== ev.checkOutDate ||
        existing.nights !== ev.nights ||
        existing.guestName !== safeGuestName ||
        (ev.guestPhone && existing.guestPhone !== ev.guestPhone) ||
        (ev.guestEmail && existing.guestEmail !== ev.guestEmail) ||
        (ev.guestAddress && existing.guestAddress !== ev.guestAddress) ||
        (ev.guestCity && existing.guestCity !== ev.guestCity) ||
        (ev.guestState && existing.guestState !== ev.guestState) ||
        (ev.guestCountry && existing.guestCountry !== ev.guestCountry) ||
        (linkedGuestId && existing.guestId !== linkedGuestId) ||
        existing.bookingRef !== targetBookingRef ||
        existing.adults !== nextAdults ||
        (existing.children ?? 0) !== nextChildren ||
        existing.roomId !== assignedRoom.id ||
        existing.roomNumber !== assignedRoom.roomNumber ||
        (existing.requestedRoomType || '') !== assignedRoom.roomType.slice(0, 64) ||
        existing.status !== targetStatus ||
        shouldUpdatePayment;

      if (needsUpdate) {
        const resRef = doc(db, 'properties', params.property.id, 'reservations', existing.id);
        const resolvedImportMode: OtaPaymentCollectionMode = isOtaImport
          ? 'ota_prepaid'
          : pricing.paymentCollectionMode;
        const paymentPatch = shouldUpdatePayment
          ? {
              sourceCurrency: pricing.sourceCurrency,
              sourceNightlyRate: pricing.sourceNightlyRate,
              sourceTotalAmount: pricing.sourceTotalAmount,
              fxRateToNgn: pricing.fxRateToNgn,
              otaPaidSourceAmount: pricing.otaPaidSourceAmount,
              otaPaidNgn: pricing.otaPaidNgn,
              expectedPayoutNgn: pricing.expectedPayoutNgn,
              roomChargesNgn: pricing.roomChargesNgn,
              nightlyRateNgn: pricing.nightlyRateNgn,
              // Never treat unreceived OTA booking amount as money received by the hotel
              paidNgn: existingHotelPaid + existingActualPayout,
              paymentCollectionMode: resolvedImportMode,
              otaPayoutStatus: existing.otaPayoutStatus || 'pending',
              actualPayoutReceivedNgn: existingActualPayout,
              amountDueAtPropertyNgn:
                resolvedImportMode === 'ota_prepaid'
                  ? 0
                  : Math.max(0, pricing.roomChargesNgn - existingHotelPaid),
              paymentStatus:
                resolvedImportMode === 'ota_prepaid'
                  ? ('Paid to OTA' as const)
                  : existingHotelPaid <= 0
                    ? ('Unpaid' as const)
                    : existingHotelPaid >= pricing.roomChargesNgn
                      ? ('Paid' as const)
                      : ('Partial' as const),
              paymentConfirmed: resolvedImportMode === 'ota_prepaid' || existingHotelPaid > 0,
            }
          : {};
        writes.push({
          kind: 'update',
          ref: resRef,
          data: {
            bookingRef: targetBookingRef,
            ...(linkedGuestId ? { guestId: linkedGuestId } : {}),
            roomId: assignedRoom.id,
            roomNumber: assignedRoom.roomNumber,
            requestedRoomType: assignedRoom.roomType.slice(0, 64),
            checkInDate: ev.checkInDate,
            checkOutDate: ev.checkOutDate,
            nights: ev.nights,
            adults: nextAdults,
            children: nextChildren,
            guestName: safeGuestName,
            ...(ev.guestPhone ? { guestPhone: ev.guestPhone.slice(0, 32) } : {}),
            ...(ev.guestEmail ? { guestEmail: ev.guestEmail.slice(0, 120) } : {}),
            ...(ev.guestAddress ? { guestAddress: ev.guestAddress.slice(0, 200) } : {}),
            ...(ev.guestCity ? { guestCity: ev.guestCity.slice(0, 80) } : {}),
            ...(ev.guestState ? { guestState: ev.guestState.slice(0, 80) } : {}),
            ...(ev.guestCountry ? { guestCountry: ev.guestCountry.slice(0, 80) } : {}),
            status: targetStatus,
            ...paymentPatch,
            updatedAt: now,
          },
        });

        existing.bookingRef = targetBookingRef;
        existing.roomId = assignedRoom.id;
        existing.roomNumber = assignedRoom.roomNumber;
        existing.checkInDate = ev.checkInDate;
        existing.checkOutDate = ev.checkOutDate;
        existing.nights = ev.nights;
        existing.guestName = safeGuestName;
        existing.status = targetStatus;
        if (shouldUpdatePayment) {
          existing.sourceCurrency = pricing.sourceCurrency;
          existing.sourceNightlyRate = pricing.sourceNightlyRate;
          existing.sourceTotalAmount = pricing.sourceTotalAmount;
          existing.otaPaidSourceAmount = pricing.otaPaidSourceAmount;
          existing.otaPaidNgn = pricing.otaPaidNgn;
          existing.expectedPayoutNgn = pricing.expectedPayoutNgn;
        }
        // Automatically mark room reserved when updated OTA stay covers today
        if (
          targetStatus === 'confirmed' &&
          ev.checkInDate <= todayIso &&
          ev.checkOutDate > todayIso &&
          assignedRoom.occupancyStatus === 'vacant'
        ) {
          writes.push({
            kind: 'update',
            ref: doc(db, 'properties', params.property.id, 'rooms', assignedRoom.id),
            data: {
              occupancyStatus: 'reserved',
              currentGuestName: safeGuestName,
              currentReservationId: existing.id,
              updatedAt: now,
            },
          });
          assignedRoom.occupancyStatus = 'reserved';
          assignedRoom.currentGuestName = safeGuestName;
          assignedRoom.currentReservationId = existing.id;
        }
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    // Do not import cancelled or historical bookings that checked out more than 7 days ago
    if (ev.cancelled || ev.checkOutDate < recentCutoffIso) {
      skipped += 1;
      continue;
    }

    const assignedRoom = pickRoomForEvent(ev);
    const pricing = resolveChannelRoomPricing(ev, assignedRoom);
    const guestId = ensureGuestForEvent(ev, pricing.roomChargesNgn);

    const isOtaImport = isOtaBookingChannel(resolvedChannelSource);
    const importCollectionMode: OtaPaymentCollectionMode = isOtaImport
      ? 'ota_prepaid'
      : pricing.paymentCollectionMode;
    const resRef = doc(db, 'properties', params.property.id, 'reservations', deterministicId);
    const newRecord: Omit<ReservationRecord, 'id' | 'createdAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      propertyId: params.property.id,
      bookingRef: safeBookingRef,
      roomId: assignedRoom.id,
      roomNumber: assignedRoom.roomNumber,
      requestedRoomType: assignedRoom.roomType.slice(0, 64),
      ...(guestId ? { guestId } : {}),
      guestName: safeGuestName,
      ...(ev.guestPhone ? { guestPhone: ev.guestPhone.slice(0, 32) } : {}),
      ...(ev.guestEmail ? { guestEmail: ev.guestEmail.slice(0, 120) } : {}),
      ...(ev.guestAddress ? { guestAddress: ev.guestAddress.slice(0, 200) } : {}),
      ...(ev.guestCity ? { guestCity: ev.guestCity.slice(0, 80) } : {}),
      ...(ev.guestState ? { guestState: ev.guestState.slice(0, 80) } : {}),
      ...(ev.guestCountry ? { guestCountry: ev.guestCountry.slice(0, 80) } : {}),
      checkInDate: ev.checkInDate,
      checkOutDate: ev.checkOutDate,
      bookedDate: todayIso,
      nights: ev.nights,
      adults: Math.max(1, Math.min(20, ev.adults ?? Math.min(2, assignedRoom.maxGuests || 2))),
      children: safeChildren,
      channel: resolvedChannelSource,
      nightlyRateNgn: pricing.nightlyRateNgn,
      roomChargesNgn: pricing.roomChargesNgn,
      posChargesNgn: 0,
      // Do NOT treat OTA booking amount as money received by the hotel
      paidNgn: 0,
      sourceCurrency: pricing.sourceCurrency,
      sourceNightlyRate: pricing.sourceNightlyRate,
      sourceTotalAmount: pricing.sourceTotalAmount,
      fxRateToNgn: pricing.fxRateToNgn,
      paymentCollectionMode: importCollectionMode,
      otaPaidNgn: importCollectionMode === 'ota_prepaid' ? pricing.otaPaidNgn : 0,
      otaPaidSourceAmount: importCollectionMode === 'ota_prepaid' ? pricing.otaPaidSourceAmount : 0,
      expectedPayoutNgn: pricing.expectedPayoutNgn,
      actualPayoutReceivedNgn: 0,
      otaPayoutStatus: 'pending',
      amountDueAtPropertyNgn: importCollectionMode === 'ota_prepaid' ? 0 : pricing.roomChargesNgn,
      paymentManuallyEdited: false,
      hotelPaidNgn: 0,
      paymentStatus: importCollectionMode === 'ota_prepaid' ? 'Paid to OTA' : 'Unpaid',
      paymentConfirmed: importCollectionMode === 'ota_prepaid',
      status: 'confirmed',
      paymentMethod:
        importCollectionMode === 'ota_prepaid' ? 'OTA Platform Payout' : 'Bank Transfer',
      externalUid: ev.uid.slice(0, 160),
      authorizedEmails: syncAuthEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    };

    writes.push({
      kind: 'set',
      ref: resRef,
      data: newRecord as Record<string, unknown>,
    });

    // Mark vacant room as reserved when stay covers today
    if (
      ev.checkInDate <= todayIso &&
      ev.checkOutDate > todayIso &&
      assignedRoom.occupancyStatus === 'vacant'
    ) {
      writes.push({
        kind: 'update',
        ref: doc(db, 'properties', params.property.id, 'rooms', assignedRoom.id),
        data: {
          occupancyStatus: 'reserved',
          currentGuestName: safeGuestName,
          currentReservationId: deterministicId,
          updatedAt: now,
        },
      });
      assignedRoom.occupancyStatus = 'reserved';
      assignedRoom.currentGuestName = safeGuestName;
      assignedRoom.currentReservationId = deterministicId;
    }

    const cachedRes: ReservationRecord = {
      id: deterministicId,
      ...(newRecord as Omit<ReservationRecord, 'id'>),
    };
    existingReservations.push(cachedRes);
    byId.set(deterministicId, cachedRes);
    const uidKey = `${resolvedChannelSource}::${ev.uid}`;
    byExternalUid.set(uidKey, [...(byExternalUid.get(uidKey) || []), cachedRes]);
    if (safeBookingRef) {
      const refKey = `${resolvedChannelSource}::${safeBookingRef.toUpperCase()}`;
      byBookingRef.set(refKey, [...(byBookingRef.get(refKey) || []), cachedRes]);
    }
    created += 1;
  }

  const totalActiveChannelBookings = existingReservations.filter((r) => {
    if (r.channel !== resolvedChannelSource || r.status === 'cancelled') return false;
    if (mappedRoomsFromChannel.length > 0) {
      return mappedRoomsFromChannel.some((rm) => matchesRoomRecord(rm, r.roomId, r.roomNumber));
    }
    return true;
  }).length;

  writes.push({
    kind: 'update',
    ref,
    data: {
      lastSyncedIso: new Date().toISOString(),
      bookingsImported: totalActiveChannelBookings,
      ...(params.channel.defaultCurrency !== propertyCurrency
        ? { defaultCurrency: propertyCurrency }
        : {}),
      updatedAt: now,
    },
  });

  // Deduplicate/merge multiple queued writes targeting the same Firestore document path
  const mergedWritesMap = new Map<string, QueuedWrite>();
  for (const op of writes) {
    const existingOp = mergedWritesMap.get(op.ref.path);
    if (!existingOp) {
      mergedWritesMap.set(op.ref.path, { kind: op.kind, ref: op.ref, data: { ...op.data } });
    } else if (existingOp.kind === 'set' || op.kind === 'set') {
      mergedWritesMap.set(op.ref.path, {
        kind: 'set',
        ref: op.ref,
        data: { ...existingOp.data, ...op.data },
      });
    } else {
      mergedWritesMap.set(op.ref.path, {
        kind: 'update',
        ref: op.ref,
        data: { ...existingOp.data, ...op.data },
      });
    }
  }
  const deduplicatedWrites = Array.from(mergedWritesMap.values());

  try {
    // Commit in chunks <= 350 to stay well under Firestore's 500-operation batch limit
    const CHUNK_SIZE = 350;
    for (let i = 0; i < deduplicatedWrites.length; i += CHUNK_SIZE) {
      const chunk = deduplicatedWrites.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.kind === 'set') {
          batch.set(op.ref, op.data);
        } else {
          batch.update(op.ref, op.data);
        }
      }
      await batch.commit();
    }

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Synced ${params.channel.channelName}`,
      details: `${parsedEvents.length} calendar events checked · Created: ${created} · Updated: ${updated} · Cancelled: ${cancelled} · Unchanged/Skipped: ${skipped}`,
      authorizedEmails: params.property.authorizedEmails,
    }).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }

  return {
    created,
    updated,
    cancelled,
    skipped,
    totalEvents: parsedEvents.length,
    connected: true,
  };
}

export async function importOtaCsvReservationsWorkflow(params: {
  property: PropertyRecord;
  channelName: OtaIntegrationRecord['channelName'];
  defaultCurrency: ChannelCurrency;
  rows: ParsedOtaCsvRow[];
  rooms?: RoomRecord[];
  reservations?: ReservationRecord[];
  otaChannels?: OtaIntegrationRecord[];
  actorRole: string;
}): Promise<{ created: number; updated: number; skipped: number; totalRows: number }> {
  const { uid, email: actorEmail } = getActorContext();
  if (!params.rows.length) {
    throw new Error('No valid reservation rows found to import from CSV.');
  }

  const normalizeChannel = (
    ch: OtaIntegrationRecord['channelName'] | ReservationRecord['channel']
  ): ReservationRecord['channel'] => {
    if (ch === 'Direct Website Engine') return 'Direct Web';
    if (ch === 'Hotels.ng') return 'Booking.com';
    return ch;
  };

  const defaultResolvedChannelSource: ReservationRecord['channel'] = normalizeChannel(
    params.channelName
  );
  const safeAuthorizedEmails = Array.from(
    new Set(
      [...(params.property.authorizedEmails || []), actorEmail]
        .map((e) => (e || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 25);

  let roomList = params.rooms ? params.rooms.map((r) => ({ ...r })) : [];
  if (roomList.length === 0) {
    const roomsSnap = await getDocs(collection(db, 'properties', params.property.id, 'rooms'));
    roomList = roomsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomRecord, 'id'>) }));
  }
  roomList = sortRoomsByNumber(roomList);
  if (roomList.length === 0) {
    throw new Error('No rooms exist in this property to assign imported CSV bookings.');
  }

  let existingReservations = params.reservations ? [...params.reservations] : [];
  if (existingReservations.length === 0) {
    const resSnap = await getDocs(collection(db, 'properties', params.property.id, 'reservations'));
    existingReservations = resSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ReservationRecord, 'id'>),
    }));
  }

  const guestsSnap = await getDocs(collection(db, 'properties', params.property.id, 'guests'));
  const existingGuests: GuestRecord[] = guestsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<GuestRecord, 'id'>),
  }));

  const guestByEmail = new Map<string, GuestRecord>();
  const guestByName = new Map<string, GuestRecord>();
  for (const g of existingGuests) {
    if (g.email?.trim()) guestByEmail.set(g.email.trim().toLowerCase(), g);
    if (g.fullName?.trim()) guestByName.set(g.fullName.trim().toLowerCase(), g);
  }

  const byExternalUid = new Map<string, ReservationRecord>();
  const byBookingRef = new Map<string, ReservationRecord>();
  for (const r of existingReservations) {
    if (r.externalUid) byExternalUid.set(`${r.channel}::${r.externalUid}`, r);
    if (r.bookingRef) byBookingRef.set(`${r.channel}::${r.bookingRef.toUpperCase()}`, r);
  }

  const matchRoom = (roomHint: string | undefined, checkIn: string, checkOut: string): RoomRecord => {
    const isFreeForDates = (candidate: RoomRecord) =>
      !existingReservations.some(
        (res) =>
          matchesRoomRecord(candidate, res.roomId, res.roomNumber) &&
          res.status !== 'cancelled' &&
          res.status !== 'no_show' &&
          res.status !== 'checked_out' &&
          datesOverlapIso(checkIn, checkOut, res.checkInDate, res.checkOutDate)
      );

    const hint = (roomHint || '').trim().toLowerCase();
    if (hint) {
      const exactMatches = roomList.filter(
        (r) =>
          matchesRoomRecord(r, roomHint, roomHint) ||
          r.roomNumber.toLowerCase() === hint ||
          r.name.toLowerCase() === hint ||
          hint.includes(r.roomNumber.toLowerCase()) ||
          hint.includes(r.name.toLowerCase())
      );
      if (exactMatches.length > 0) {
        return exactMatches.find(isFreeForDates) || exactMatches[0];
      }
      const byType = roomList.filter(
        (r) => r.roomType.toLowerCase().includes(hint) || hint.includes(r.roomType.toLowerCase())
      );
      if (byType.length > 0) {
        return byType.find(isFreeForDates) || byType[0];
      }
    }
    return roomList.find(isFreeForDates) || roomList[0];
  };

  type QueuedWrite =
    | { kind: 'set'; ref: ReturnType<typeof doc>; data: Record<string, unknown> }
    | { kind: 'update'; ref: ReturnType<typeof doc>; data: Record<string, unknown> };
  const writes: QueuedWrite[] = [];
  const now = serverTimestamp();
  const todayIso = getLocalIsoDate();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rawRow of params.rows) {
    const row = {
      ...rawRow,
      checkInDate: normalizeIsoDate(rawRow.checkInDate),
      checkOutDate: normalizeIsoDate(rawRow.checkOutDate),
    };
    const resolvedChannelSource: ReservationRecord['channel'] = row.channelOverride
      ? normalizeChannel(row.channelOverride)
      : defaultResolvedChannelSource;
    const assignedRoom = matchRoom(row.roomHint, row.checkInDate, row.checkOutDate);
    const channelCurrency: ChannelCurrency = row.currency || params.defaultCurrency || 'USD';
    const fxRate = getFxRateToNgn(channelCurrency, params.property.usdExchangeRateNgn);
    const safeNights = Math.max(1, Math.round(Number(row.nights) || 1));
    const safeAdults = Math.max(1, Math.min(12, Math.round(Number(row.adults) || 1)));
    const safeChildren = Math.max(0, Math.min(20, Math.round(Number(row.children) || 0)));

    const sourceTotalAmount =
      row.sourceTotalAmount && row.sourceTotalAmount > 0
        ? Number(row.sourceTotalAmount.toFixed(2))
        : row.otaPaidSourceAmount && row.otaPaidSourceAmount > 0
          ? Number(row.otaPaidSourceAmount.toFixed(2))
          : row.sourceNightlyRate && row.sourceNightlyRate > 0
            ? Number((row.sourceNightlyRate * safeNights).toFixed(2))
            : channelCurrency === 'NGN'
              ? assignedRoom.nightlyRateNgn * safeNights
              : Number(((assignedRoom.nightlyRateNgn * safeNights) / fxRate).toFixed(2));

    const sourceNightlyRate =
      row.sourceNightlyRate && row.sourceNightlyRate > 0
        ? Number(row.sourceNightlyRate.toFixed(2))
        : Number((sourceTotalAmount / safeNights).toFixed(2));

    const otaPaidSourceAmount =
      row.otaPaidSourceAmount !== undefined
        ? Number(Math.max(0, row.otaPaidSourceAmount).toFixed(2))
        : isOtaBookingChannel(resolvedChannelSource)
          ? sourceTotalAmount
          : 0;

    const otaPaidNgn =
      channelCurrency === 'NGN'
        ? Math.round(otaPaidSourceAmount)
        : Math.round(otaPaidSourceAmount * fxRate);
    const expectedPayoutNgn =
      row.expectedPayoutSourceAmount && row.expectedPayoutSourceAmount > 0
        ? channelCurrency === 'NGN'
          ? Math.round(row.expectedPayoutSourceAmount)
          : Math.round(row.expectedPayoutSourceAmount * fxRate)
        : row.expectedPayoutNgn && row.expectedPayoutNgn > 0
          ? Math.round(row.expectedPayoutNgn)
          : channelCurrency === 'NGN'
            ? Math.round(sourceTotalAmount)
            : Math.round(sourceTotalAmount * fxRate);

    const roomChargesNgn = Math.max(
      0,
      expectedPayoutNgn > 0 ? expectedPayoutNgn : assignedRoom.nightlyRateNgn * safeNights
    );
    const nightlyRateNgn = Math.max(0, Math.round(roomChargesNgn / safeNights));
    const hotelPaidNgn = Math.max(0, Math.round(row.directPaidNgn ?? 0));
    const isOtaPrepaidCsv = otaPaidSourceAmount > 0 || isOtaBookingChannel(resolvedChannelSource);
    const paidNgn = hotelPaidNgn;
    const csvAmountDue = isOtaPrepaidCsv ? 0 : Math.max(0, roomChargesNgn - hotelPaidNgn);
    const paymentStatus: PaymentStatusLabel = isOtaPrepaidCsv
      ? 'Paid to OTA'
      : hotelPaidNgn <= 0
        ? 'Unpaid'
        : csvAmountDue <= 0
          ? 'Paid'
          : 'Partial';

    const cleanChannelSlug = resolvedChannelSource.toLowerCase().replace(/[^a-z0-9]/g, '');
    const rawRef = (row.externalRef || '').trim();
    const paddedRef =
      rawRef.length >= 4
        ? rawRef
        : `CSV-${rawRef || `${row.checkInDate.replace(/-/g, '')}-${row.rowNumber}`}`;
    const bookingRef = paddedRef.slice(0, 32);
    const externalUid = `csv-${cleanChannelSlug}-${bookingRef}`.slice(0, 160);
    const deterministicId = deterministicOtaReservationId(`csv-${cleanChannelSlug}`, externalUid);

    const existing =
      byExternalUid.get(`${resolvedChannelSource}::${externalUid}`) ||
      byBookingRef.get(`${resolvedChannelSource}::${bookingRef.toUpperCase()}`);

    const trimmedGuest = (row.guestName || '').trim();
    const safeGuestName = (trimmedGuest.length >= 2 ? trimmedGuest : 'OTA Guest').slice(0, 120);
    const emailKey = (row.guestEmail || '').trim().toLowerCase();
    const trimmedPhone = (row.guestPhone || '').trim();
    const safeGuestDocPhone = trimmedPhone.length >= 6 ? trimmedPhone.slice(0, 32) : 'Not Provided';

    let guestId = existing?.guestId;
    if (!guestId) {
      const matchedGuest =
        (emailKey && guestByEmail.get(emailKey)) || guestByName.get(safeGuestName.toLowerCase());
      if (matchedGuest) {
        guestId = matchedGuest.id;
      } else {
        guestId = cleanId('gst');
        const guestDoc: Omit<GuestRecord, 'id'> & Record<string, unknown> = {
          propertyId: params.property.id,
          fullName: safeGuestName,
          ...(emailKey ? { email: emailKey.slice(0, 120) } : {}),
          phone: safeGuestDocPhone,
          ...(row.guestCountry ? { country: row.guestCountry.trim().slice(0, 80) } : {}),
          idType: 'International Passport',
          vipTier: 'Standard',
          totalStays: 1,
          lifetimeSpendNgn: roomChargesNgn,
          notes: `Imported via ${resolvedChannelSource} CSV`,
          authorizedEmails: safeAuthorizedEmails,
          ownerUid: uid,
          createdAt: now,
          updatedAt: now,
        };
        writes.push({
          kind: 'set',
          ref: doc(db, 'properties', params.property.id, 'guests', guestId),
          data: guestDoc,
        });
        const cachedGuest: GuestRecord = { id: guestId, ...(guestDoc as Omit<GuestRecord, 'id'>) };
        if (emailKey) guestByEmail.set(emailKey, cachedGuest);
        guestByName.set(safeGuestName.toLowerCase(), cachedGuest);
      }
    }

    if (existing) {
      if (existing.status === 'checked_out' || existing.status === 'no_show') {
        skipped += 1;
        continue;
      }
      const keptHotelPaid = Math.max(hotelPaidNgn, Math.round(existing.hotelPaidNgn ?? 0));
      const keptActualPayout =
        existing.otaPayoutStatus === 'received'
          ? Math.max(0, Math.round(existing.actualPayoutReceivedNgn ?? 0))
          : 0;
      const mergedPaidNgn = keptHotelPaid + keptActualPayout;
      const mergedPaymentPatch = existing.paymentManuallyEdited
        ? {}
        : {
            sourceCurrency: channelCurrency,
            sourceNightlyRate,
            sourceTotalAmount,
            fxRateToNgn: fxRate,
            otaPaidSourceAmount,
            otaPaidNgn,
            expectedPayoutNgn,
            roomChargesNgn,
            nightlyRateNgn,
            hotelPaidNgn: keptHotelPaid,
            paidNgn: mergedPaidNgn,
            otaPayoutStatus: existing.otaPayoutStatus || ('pending' as const),
            actualPayoutReceivedNgn: keptActualPayout,
            amountDueAtPropertyNgn: isOtaPrepaidCsv
              ? 0
              : Math.max(0, roomChargesNgn - keptHotelPaid),
            paymentStatus: isOtaPrepaidCsv
              ? ('Paid to OTA' as const)
              : keptHotelPaid <= 0
                ? ('Unpaid' as const)
                : keptHotelPaid >= roomChargesNgn
                  ? ('Paid' as const)
                  : ('Partial' as const),
            paymentConfirmed: isOtaPrepaidCsv || mergedPaidNgn > 0,
            paymentCollectionMode: isOtaPrepaidCsv
              ? ('ota_prepaid' as const)
              : ('hotel_collect' as const),
          };
      writes.push({
        kind: 'update',
        ref: doc(db, 'properties', params.property.id, 'reservations', existing.id),
        data: {
          guestName: safeGuestName,
          ...(trimmedPhone ? { guestPhone: trimmedPhone.slice(0, 32) } : {}),
          ...(emailKey ? { guestEmail: emailKey.slice(0, 120) } : {}),
          ...(row.guestCountry ? { guestCountry: row.guestCountry.trim().slice(0, 80) } : {}),
          checkInDate: row.checkInDate,
          checkOutDate: row.checkOutDate,
          nights: safeNights,
          adults: safeAdults,
          children: safeChildren,
          ...mergedPaymentPatch,
          ...(row.status === 'cancelled' ? { status: 'cancelled' } : {}),
          updatedAt: now,
        },
      });
      updated += 1;
    } else {
      const resData: Omit<ReservationRecord, 'id' | 'createdAt'> & {
        createdAt: ReturnType<typeof serverTimestamp>;
        updatedAt: ReturnType<typeof serverTimestamp>;
      } = {
        propertyId: params.property.id,
        bookingRef,
        roomId: assignedRoom.id,
        roomNumber: assignedRoom.roomNumber,
        requestedRoomType: assignedRoom.roomType.slice(0, 64),
        guestId,
        guestName: safeGuestName,
        ...(trimmedPhone ? { guestPhone: trimmedPhone.slice(0, 32) } : {}),
        ...(emailKey ? { guestEmail: emailKey.slice(0, 120) } : {}),
        ...(row.guestCountry ? { guestCountry: row.guestCountry.trim().slice(0, 80) } : {}),
        checkInDate: row.checkInDate,
        checkOutDate: row.checkOutDate,
        bookedDate: todayIso,
        nights: safeNights,
        adults: safeAdults,
        children: safeChildren,
        channel: resolvedChannelSource,
        nightlyRateNgn,
        roomChargesNgn,
        posChargesNgn: 0,
        paidNgn,
        sourceCurrency: channelCurrency,
        sourceNightlyRate,
        sourceTotalAmount,
        fxRateToNgn: fxRate,
        paymentCollectionMode: isOtaPrepaidCsv ? 'ota_prepaid' : 'hotel_collect',
        otaPaidNgn: isOtaPrepaidCsv ? otaPaidNgn : 0,
        otaPaidSourceAmount: isOtaPrepaidCsv ? otaPaidSourceAmount : 0,
        expectedPayoutNgn,
        actualPayoutReceivedNgn: 0,
        otaPayoutStatus: 'pending',
        amountDueAtPropertyNgn: csvAmountDue,
        paymentManuallyEdited: false,
        hotelPaidNgn,
        paymentStatus,
        paymentConfirmed: isOtaPrepaidCsv || paidNgn > 0,
        status: row.status,
        paymentMethod: isOtaPrepaidCsv ? 'OTA Platform Payout' : 'Bank Transfer',
        externalUid,
        authorizedEmails: safeAuthorizedEmails,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      };
      writes.push({
        kind: 'set',
        ref: doc(db, 'properties', params.property.id, 'reservations', deterministicId),
        data: resData as Record<string, unknown>,
      });
      // Automatically mark vacant room as reserved when imported OTA booking covers today
      if (
        row.status !== 'cancelled' &&
        row.checkInDate <= todayIso &&
        row.checkOutDate > todayIso &&
        assignedRoom.occupancyStatus === 'vacant'
      ) {
        writes.push({
          kind: 'update',
          ref: doc(db, 'properties', params.property.id, 'rooms', assignedRoom.id),
          data: {
            occupancyStatus: 'reserved',
            currentGuestName: safeGuestName,
            currentReservationId: deterministicId,
            updatedAt: now,
          },
        });
        assignedRoom.occupancyStatus = 'reserved';
        assignedRoom.currentGuestName = safeGuestName;
        assignedRoom.currentReservationId = deterministicId;
      }
      const cached: ReservationRecord = { id: deterministicId, ...(resData as Omit<ReservationRecord, 'id'>) };
      existingReservations.push(cached);
      byExternalUid.set(`${resolvedChannelSource}::${externalUid}`, cached);
      byBookingRef.set(`${resolvedChannelSource}::${bookingRef.toUpperCase()}`, cached);
      created += 1;
    }
  }

  try {
    // Commit reservations and guests first so imported reservations always save reliably
    const CHUNK_SIZE = 350;
    for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
      const chunk = writes.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.kind === 'set') batch.set(op.ref, op.data);
        else batch.update(op.ref, op.data);
      }
      await batch.commit();
    }

    // Update matching OTA channel counters separately (non-blocking) without altering `connected` state
    const matchingChannel = (params.otaChannels || []).find(
      (c) =>
        c.channelName === params.channelName ||
        (params.channelName === 'Booking.com' && c.channelName === 'Hotels.ng')
    );
    if (matchingChannel && created + updated > 0) {
      await updateDoc(
        doc(db, 'properties', params.property.id, 'ota_channels', matchingChannel.id),
        {
          lastSyncedIso: new Date().toISOString(),
          bookingsImported: (matchingChannel.bookingsImported || 0) + created,
          updatedAt: serverTimestamp(),
        }
      ).catch(() => undefined);
    }

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Imported ${defaultResolvedChannelSource} CSV (${created} new, ${updated} updated)`,
      details: `${params.rows.length} rows processed · Default currency: ${params.defaultCurrency} · Skipped: ${skipped}`,
      authorizedEmails: safeAuthorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `properties/${params.property.id}/reservations`);
  }

  return { created, updated, skipped, totalRows: params.rows.length };
}

export async function createOtaChannelWithIcal(params: {
  property: PropertyRecord;
  channelName: OtaIntegrationRecord['channelName'];
  propertyListingId: string;
  roomNumber: string;
  icalImportUrl: string;
  commissionPct?: number;
  defaultCurrency?: ChannelCurrency;
  defaultNightlyRate?: number;
  paymentCollectionMode?: OtaPaymentCollectionMode;
  autoSync: boolean;
  actorRole: string;
}) {
  const { uid } = getActorContext();
  const id = cleanId('ota');
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', id);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const rawRoom = (params.roomNumber || '').trim();
  const normalizedRoom = !rawRoom || rawRoom.toLowerCase() === 'all suites' ? 'All Rooms' : rawRoom;
  const exportRoom = encodeURIComponent(normalizedRoom === 'All Rooms' ? 'ALL' : normalizedRoom);
  const icalExportUrl = `${origin}/?ical=${encodeURIComponent(params.property.id)}&room=${exportRoom}`;
  const cleanListingId = params.propertyListingId.trim().slice(0, 120) || `ICAL-${id.slice(-5).toUpperCase()}`;
  const cleanImportUrl = params.icalImportUrl.trim().slice(0, 2000);
  const defaultCurrency: ChannelCurrency =
    params.defaultCurrency || ((params.property.currency as ChannelCurrency) || 'NGN');
  const defaultNightlyRate = Math.max(0, Number(params.defaultNightlyRate ?? 0));
  const paymentCollectionMode: OtaPaymentCollectionMode =
    params.paymentCollectionMode ||
    (params.channelName === 'Direct Website Engine' ? 'hotel_collect' : 'ota_prepaid');
  const safeCommissionPct = Math.max(0, Math.min(50, params.commissionPct ?? 0));

  try {
    await setDoc(ref, {
      propertyId: params.property.id,
      channelName: params.channelName,
      propertyListingId: cleanListingId,
      roomNumber: normalizedRoom,
      defaultCurrency,
      defaultNightlyRate,
      paymentCollectionMode,
      icalImportUrl: cleanImportUrl,
      icalExportUrl,
      commissionPct: safeCommissionPct,
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
      details: `${cleanListingId} · ${normalizedRoom} · ${safeCommissionPct}% commission · ${defaultCurrency} · ${cleanImportUrl || 'Export-only feed'}`,
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
  propertyListingId?: string;
  commissionPct?: number;
  autoSync?: boolean;
  defaultCurrency?: ChannelCurrency;
  defaultNightlyRate?: number;
  paymentCollectionMode?: OtaPaymentCollectionMode;
  recalculateExistingPayouts?: boolean;
  actorRole: string;
}): Promise<{ updatedReservationsCount: number }> {
  const ref = doc(db, 'properties', params.property.id, 'ota_channels', params.channel.id);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const rawRoom = (params.roomNumber || '').trim();
  const normalizedRoom = !rawRoom || rawRoom.toLowerCase() === 'all suites' ? 'All Rooms' : rawRoom;
  const exportRoom = normalizedRoom === 'All Rooms' ? 'ALL' : normalizedRoom;
  const icalExportUrl = `${origin}/?ical=${encodeURIComponent(params.property.id)}&room=${encodeURIComponent(exportRoom)}`;
  const cleanImportUrl = params.icalImportUrl.trim().slice(0, 2000);
  const cleanListingId =
    params.propertyListingId !== undefined
      ? params.propertyListingId.trim().slice(0, 120) || params.channel.propertyListingId
      : params.channel.propertyListingId;
  const urlChanged = cleanImportUrl !== (params.channel.icalImportUrl || '').trim();

  const migratedChannelName =
    params.channel.channelName === 'Hotels.ng' ? ('Booking.com' as const) : params.channel.channelName;
  const safeCommissionPct =
    params.commissionPct !== undefined
      ? Math.max(0, Math.min(50, Number(Number(params.commissionPct).toFixed(2))))
      : params.channel.commissionPct;
  const commissionChanged =
    params.commissionPct !== undefined &&
    Math.abs(safeCommissionPct - Number(params.channel.commissionPct ?? 0)) > 0.001;

  let updatedReservationsCount = 0;

  try {
    await updateDoc(ref, {
      ...(params.channel.channelName === 'Hotels.ng' ? { channelName: migratedChannelName } : {}),
      propertyListingId: cleanListingId,
      ...(params.commissionPct !== undefined ? { commissionPct: safeCommissionPct } : {}),
      ...(params.autoSync !== undefined ? { autoSync: Boolean(params.autoSync) } : {}),
      ...(params.defaultCurrency !== undefined ? { defaultCurrency: params.defaultCurrency } : {}),
      ...(params.defaultNightlyRate !== undefined
        ? { defaultNightlyRate: Math.max(0, Number(params.defaultNightlyRate)) }
        : {}),
      ...(params.paymentCollectionMode !== undefined
        ? { paymentCollectionMode: params.paymentCollectionMode }
        : {}),
      icalImportUrl: cleanImportUrl,
      roomNumber: normalizedRoom,
      icalExportUrl,
      ...(urlChanged ? { lastSyncedIso: '' } : {}),
      updatedAt: serverTimestamp(),
    });

    // When OTA booking commission % is corrected, recalculate expected payout on existing non-manually-edited reservations for this channel
    const shouldRecalculate =
      (params.recalculateExistingPayouts ?? true) &&
      commissionChanged &&
      migratedChannelName !== 'Direct Website Engine';

    if (shouldRecalculate) {
      const resolvedChannelSource: ReservationRecord['channel'] = migratedChannelName;
      const [resSnap, roomsSnap] = await Promise.all([
        getDocs(collection(db, 'properties', params.property.id, 'reservations')),
        getDocs(collection(db, 'properties', params.property.id, 'rooms')),
      ]);
      const propRooms = roomsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RoomRecord, 'id'>),
      }));
      const isSpecificRoom =
        Boolean(normalizedRoom) &&
        normalizedRoom.toLowerCase() !== 'all rooms' &&
        normalizedRoom.toLowerCase() !== 'all suites' &&
        normalizedRoom.toLowerCase() !== 'all';
      const mappedRooms = isSpecificRoom
        ? propRooms.filter((rm) => matchesRoomRecord(rm, normalizedRoom, normalizedRoom))
        : [];

      const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];
      const now = serverTimestamp();

      for (const snapDoc of resSnap.docs) {
        const res = { id: snapDoc.id, ...(snapDoc.data() as Omit<ReservationRecord, 'id'>) };
        if (res.channel !== resolvedChannelSource) continue;
        if (res.status === 'cancelled' || res.status === 'no_show') continue;
        if (res.paymentManuallyEdited) continue;
        if (mappedRooms.length > 0 && !mappedRooms.some((rm) => matchesRoomRecord(rm, res.roomId, res.roomNumber))) {
          continue;
        }

        // Compute gross booking total in NGN from source total, otaPaidNgn, or nightlyRate * nights
        const fx = getFxRateToNgn(
          (res.sourceCurrency as ChannelCurrency) || (params.property.currency as ChannelCurrency) || 'NGN',
          params.property.usdExchangeRateNgn
        );
        const grossFromSource =
          typeof res.sourceTotalAmount === 'number' && res.sourceTotalAmount > 0
            ? res.sourceCurrency && res.sourceCurrency !== 'NGN'
              ? Math.round(res.sourceTotalAmount * (res.fxRateToNgn || fx))
              : Math.round(res.sourceTotalAmount)
            : 0;
        const grossNgn =
          grossFromSource > 0
            ? grossFromSource
            : typeof res.otaPaidNgn === 'number' && res.otaPaidNgn > 0
              ? Math.round(res.otaPaidNgn)
              : Math.round((res.nightlyRateNgn || 0) * Math.max(1, res.nights || 1));

        if (grossNgn <= 0) continue;
        const nextExpectedPayoutNgn = Math.max(0, Math.round(grossNgn * (1 - safeCommissionPct / 100)));
        if (Math.abs((res.expectedPayoutNgn ?? 0) - nextExpectedPayoutNgn) <= 1) continue;

        const patch: Record<string, unknown> = {
          expectedPayoutNgn: nextExpectedPayoutNgn,
          updatedAt: now,
        };
        if (res.paymentCollectionMode === 'ota_prepaid' && res.otaPayoutStatus !== 'received') {
          patch.roomChargesNgn = nextExpectedPayoutNgn;
        }
        updates.push({
          ref: doc(db, 'properties', params.property.id, 'reservations', res.id),
          data: patch,
        });
      }

      const CHUNK_SIZE = 350;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        for (const item of updates.slice(i, i + CHUNK_SIZE)) {
          batch.update(item.ref, item.data);
        }
        await batch.commit();
      }
      updatedReservationsCount = updates.length;
    }

    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Channel Manager',
      action: `Updated OTA & iCal Settings on ${migratedChannelName}`,
      details: `Listing ${cleanListingId} · ${normalizedRoom} · ${safeCommissionPct}% OTA fee · ${params.defaultCurrency || params.property.currency || 'NGN'}${updatedReservationsCount > 0 ? ` · Recalculated ${updatedReservationsCount} reservation payout(s)` : ''}`,
      authorizedEmails: params.property.authorizedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, ref.path);
  }
  return { updatedReservationsCount };
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
  const filterClean = (params.roomNumberFilter || '').trim();
  const target =
    filterClean &&
    filterClean.toUpperCase() !== 'ALL' &&
    filterClean.toLowerCase() !== 'all rooms' &&
    filterClean.toLowerCase() !== 'all suites'
      ? filterClean
      : null;
  const toIcalDate = (iso: string) => iso.replace(/-/g, '');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escapeIcal = (val: string) =>
    val.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PCH PMS//Channel Manager iCal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(params.propertyName)}${target ? ` - ${escapeIcal(target)}` : ''}`,
  ];

  for (const res of params.reservations) {
    if (res.status === 'cancelled' || res.status === 'checked_out') continue;
    if (target && res.roomNumber !== target) continue;

    const nameParts = res.guestName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || res.guestName;
    const lastName = nameParts.slice(1).join(' ');

    const descParts = [
      `Ref: ${res.bookingRef}`,
      `Channel: ${res.channel}`,
      `Room: ${res.roomNumber}`,
      res.requestedRoomType ? `Room Type: ${res.requestedRoomType}` : '',
      `Guest Name: ${res.guestName}`,
      `First Name: ${firstName}`,
      lastName ? `Last Name: ${lastName}` : '',
      res.guestPhone ? `Phone: ${res.guestPhone}` : '',
      `Adults: ${res.adults}`,
      `Children: ${res.children ?? 0}`,
    ].filter(Boolean);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${res.id}@pchpms.com`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(res.checkInDate)}`,
      `DTEND;VALUE=DATE:${toIcalDate(res.checkOutDate)}`,
      `SUMMARY:${escapeIcal(`Reserved (${res.roomNumber}) - ${res.guestName}`)}`,
      `LOCATION:${escapeIcal(`${res.roomNumber}${res.requestedRoomType ? ` - ${res.requestedRoomType}` : ''} | ${params.propertyName}`)}`,
      `DESCRIPTION:${escapeIcal(descParts.join('\n'))}`,
      `X-BOOKING-REF:${res.bookingRef}`,
      ...(res.requestedRoomType ? [`X-ROOM-TYPE:${escapeIcal(res.requestedRoomType)}`] : []),
      `X-ADULTS:${res.adults}`,
      `X-CHILDREN:${res.children ?? 0}`,
      ...(res.guestPhone ? [`X-GUEST-PHONE:${escapeIcal(res.guestPhone)}`] : []),
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  for (const blk of params.blockedDates) {
    if (target && blk.roomNumber !== target) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${blk.id}@pchpms.com`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(blk.startDate)}`,
      `DTEND;VALUE=DATE:${toIcalDate(blk.endDate)}`,
      `SUMMARY:${escapeIcal(`Blocked (${blk.roomNumber}) - ${blk.category}`)}`,
      `LOCATION:${escapeIcal(`${blk.roomNumber} | ${params.propertyName}`)}`,
      `DESCRIPTION:${escapeIcal(blk.reason)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function allocateNextSystemPropertyId(): Promise<string> {
  try {
    const snap = await getDocs(collection(db, 'properties'));
    let maxSeq = STARTING_PROPERTY_SEQ - 1;
    snap.forEach((d) => {
      const data = d.data() as Partial<PropertyRecord>;
      const seq = parseSystemPropertySeq(data.systemPropertyId);
      if (seq !== null && seq > maxSeq) maxSeq = seq;
    });
    return formatSystemPropertyId(Math.max(STARTING_PROPERTY_SEQ, maxSeq + 1));
  } catch {
    return formatSystemPropertyId(STARTING_PROPERTY_SEQ);
  }
}

export async function backfillMissingSystemPropertyIdsWorkflow(
  existingProperties?: PropertyRecord[]
): Promise<number> {
  const { email } = getActorContext();
  if (!isBootstrappedAdminEmail(email)) return 0;

  try {
    let propsList: PropertyRecord[] = existingProperties ? [...existingProperties] : [];
    if (propsList.length === 0) {
      const snap = await getDocs(collection(db, 'properties'));
      propsList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PropertyRecord, 'id'>) }));
    }

    const missing = propsList.filter((p) => !parseSystemPropertySeq(p.systemPropertyId));
    if (missing.length === 0) return 0;

    let maxSeq = STARTING_PROPERTY_SEQ - 1;
    for (const p of propsList) {
      const seq = parseSystemPropertySeq(p.systemPropertyId);
      if (seq !== null && seq > maxSeq) maxSeq = seq;
    }

    const batch = writeBatch(db);
    let updatedCount = 0;

    const sortedMissing = [...missing].sort((a, b) => {
      if (a.id === RICHGATES_PROPERTY_ID) return -1;
      if (b.id === RICHGATES_PROPERTY_ID) return 1;
      return a.id.localeCompare(b.id);
    });

    for (const prop of sortedMissing) {
      let nextId: string;
      if (prop.id === RICHGATES_PROPERTY_ID && maxSeq < STARTING_PROPERTY_SEQ) {
        nextId = formatSystemPropertyId(STARTING_PROPERTY_SEQ);
        maxSeq = STARTING_PROPERTY_SEQ;
      } else {
        maxSeq = Math.max(STARTING_PROPERTY_SEQ, maxSeq + 1);
        nextId = formatSystemPropertyId(maxSeq);
      }
      batch.update(doc(db, 'properties', prop.id), {
        systemPropertyId: nextId,
        updatedAt: serverTimestamp(),
      });
      updatedCount += 1;
    }

    if (updatedCount > 0) {
      await batch.commit();
    }
    return updatedCount;
  } catch {
    return 0;
  }
}

export async function createNewPropertyWithRooms(params: {
  name: string;
  code: string;
  subdomainSlug?: string;
  city: string;
  state: string;
  address: string;
  adminName?: string;
  adminEmail: string;
  adminPassword?: string;
  initialPlan?: LicenseRecord['plan'];
  roomCount: number;
  baseRateNgn: number;
  actorRole: string;
}): Promise<{ propertyId: string; systemPropertyId: string; subdomainSlug: string; licenseKey?: string; authNote?: string }> {
  const { uid, email } = getActorContext();
  const propId = cleanId(params.code.toLowerCase());
  const systemPropertyId = await allocateNextSystemPropertyId();
  const cleanAdminEmail = params.adminEmail.trim().toLowerCase();
  const cleanAdminName = (params.adminName || '').trim() || cleanAdminEmail.split('@')[0] || 'Property Admin';
  const rawSlug = params.subdomainSlug?.trim() || params.name;
  const subdomainSlug =
    normalizeSubdomainSlug(rawSlug) ||
    normalizeSubdomainSlug(params.code) ||
    `client-${systemPropertyId.slice(-4).toLowerCase()}`;

  const authorizedEmails = Array.from(
    new Set(
      [
        ...BOOTSTRAPPED_ADMIN_EMAILS,
        email.trim().toLowerCase(),
        cleanAdminEmail,
      ].filter(Boolean)
    )
  ).slice(0, 25);

  let authProvisioned = false;
  let authNote: string | undefined;
  if (params.adminPassword && params.adminPassword.trim().length > 0 && cleanAdminEmail) {
    const targetAdminPortalUrl = `https://${subdomainSlug}.pchpms.com`;
    const authRes = await provisionStaffAuthAccount(
      cleanAdminEmail,
      params.adminPassword,
      cleanAdminName,
      targetAdminPortalUrl
    );
    authProvisioned = authRes.provisioned;
    authNote = authRes.note;
  }

  const initialPlan: LicenseRecord['plan'] = params.initialPlan || 'Starter';
  const isLifetime = initialPlan === 'Lifetime Sovereign';
  const licenseKey = generateLicenseKey(params.code, initialPlan, isLifetime);
  const licId = cleanId('lic');
  const nowIso = new Date().toISOString().slice(0, 10);
  const expiresAt = isLifetime
    ? 'LIFETIME'
    : new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.set(doc(db, 'properties', propId), {
    systemPropertyId,
    subdomainSlug,
    name: params.name,
    code: params.code.toUpperCase(),
    city: params.city,
    state: params.state,
    country: 'Nigeria',
    address: params.address,
    phone: '+234 800 000 0000',
    email: cleanAdminEmail,
    currency: 'NGN',
    roomCount: params.roomCount,
    status: 'active',
    licenseKey,
    licensePlan: initialPlan,
    adminEmail: cleanAdminEmail,
    authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  // Activate an initial license cleanly for the client
  batch.set(doc(db, 'licenses', licId), {
    licenseKey,
    propertyId: propId,
    propertyName: params.name,
    plan: initialPlan,
    billingCycle: isLifetime ? 'lifetime' : 'annual',
    isLifetime,
    maxRooms: Math.max(params.roomCount, 20),
    priceNgn: initialPlan === 'Enterprise' ? 1200000 : initialPlan === 'Professional' ? 650000 : 350000,
    status: 'active',
    issuedAt: nowIso,
    activatedAt: nowIso,
    expiresAt,
    activatedByEmail: email.toLowerCase(),
    authorizedEmails,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  });

  // Provision initial Property Admin account inside the tenant workspace
  if (cleanAdminEmail) {
    const adminParts = cleanAdminName.split(/\s+/).filter(Boolean);
    const firstName = adminParts[0] || 'Property';
    const lastName = adminParts.slice(1).join(' ') || 'Admin';
    const adminAccountId = buildUserAccountDocId(cleanAdminEmail);
    batch.set(doc(db, 'properties', propId, 'user_accounts', adminAccountId), {
      propertyId: propId,
      firstName,
      lastName,
      fullName: cleanAdminName,
      email: cleanAdminEmail,
      department: 'Management',
      role: 'property_admin',
      privileges: [...ROLE_ALLOWED_SECTIONS.property_admin],
      active: true,
      authProvisioned,
      lastRoleUpdatedIso: new Date().toISOString(),
      authorizedEmails,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });
  }

  const count = Math.min(Math.max(params.roomCount, 1), 20);
  for (let i = 1; i <= count; i++) {
    const roomNum = `RM-${i}`;
    const roomId = `room-${100 + i}`;
    batch.set(doc(db, 'properties', propId, 'rooms', roomId), {
      propertyId: propId,
      roomNumber: roomNum,
      name: `Room ${roomNum}`,
      roomType: i === count ? 'One Bedroom Suite' : 'Deluxe Studio',
      section: i <= 3 ? 'Serviced Apartment' : 'Hotel Rooms',
      floor: i <= 4 ? 1 : 2,
      nightlyRateNgn: params.baseRateNgn + (i - 1) * 5000,
      maxGuests: 2,
      occupancyStatus: 'vacant',
      housekeepingStatus: 'clean',
      imageUrl: DEFAULT_ROOM_COVER_IMAGE_URL,
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
      action: `Provisioned Client Property: ${params.name} (${systemPropertyId})`,
      details: `${systemPropertyId} · https://${subdomainSlug}.pchpms.com · Admin: ${cleanAdminEmail} · ${count} rooms · License: ${licenseKey}`,
      authorizedEmails,
    });
    return {
      propertyId: propId,
      systemPropertyId,
      subdomainSlug,
      licenseKey,
      authNote,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `properties/${propId}`);
  }
}

export async function updatePropertyTenantConfigWorkflow(params: {
  property: PropertyRecord;
  name?: string;
  subdomainSlug: string;
  adminEmail: string;
  status: PropertyRecord['status'];
  actorRole: string;
}) {
  const { email } = getActorContext();
  const cleanSubdomain =
    normalizeSubdomainSlug(params.subdomainSlug) || getPropertySubdomainSlug(params.property);
  const cleanAdminEmail = params.adminEmail.trim().toLowerCase();
  const nextAuthorized = Array.from(
    new Set(
      [
        ...BOOTSTRAPPED_ADMIN_EMAILS,
        email.trim().toLowerCase(),
        ...params.property.authorizedEmails.map((e) => e.trim().toLowerCase()),
        cleanAdminEmail,
      ].filter(Boolean)
    )
  ).slice(0, 25);

  const propRef = doc(db, 'properties', params.property.id);
  try {
    await updateDoc(propRef, {
      ...(params.name?.trim() ? { name: params.name.trim() } : {}),
      subdomainSlug: cleanSubdomain,
      adminEmail: cleanAdminEmail,
      status: params.status,
      authorizedEmails: nextAuthorized,
      updatedAt: serverTimestamp(),
    });
    await syncPropertyAuthorizedEmailsAcrossCollections(params.property, nextAuthorized);
    await writeAuditLog({
      propertyId: params.property.id,
      actorRole: params.actorRole,
      module: 'Multi-Property Admin',
      action: `Updated Client Tenant Config: ${params.name?.trim() || params.property.name}`,
      details: `Subdomain: ${cleanSubdomain}.pchpms.com · Status: ${params.status} · Admin: ${cleanAdminEmail}`,
      authorizedEmails: nextAuthorized,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, propRef.path);
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
  const safeEmails = Array.from(
    new Set([
      ...BOOTSTRAPPED_ADMIN_EMAILS,
      email.trim().toLowerCase(),
      ...params.property.authorizedEmails.map((e) => e.trim().toLowerCase()),
    ].filter(Boolean))
  ).slice(0, 25);

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
    activatedByEmail: params.autoActivate ? email.toLowerCase() : '',
    authorizedEmails: safeEmails,
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
      authorizedEmails: safeEmails,
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
  const rawEmail = params.email.trim();
  const normalizedEmail = rawEmail.toLowerCase();
  const userDocId = normalizedEmail.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const nextEmails = sanitizeAuthorizedEmailList(
    [
      ...params.property.authorizedEmails,
      normalizedEmail,
      ...(rawEmail && rawEmail !== normalizedEmail ? [rawEmail] : []),
    ],
    params.property,
    normalizedEmail
  );

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
  const cleanedSet = new Set<string>();
  for (const raw of [...BOOTSTRAPPED_ADMIN_EMAILS, ...emails]) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (DEMO_SEED_EMAILS_TO_STRIP.has(lower)) continue;
    cleanedSet.add(lower);
    if (trimmed !== lower) {
      cleanedSet.add(trimmed);
    }
  }
  const cleaned = Array.from(cleanedSet);
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
  const propId = property.id;
  const safeEmails = sanitizeAuthorizedEmailList(nextEmails, property, email);

  // Update primary property document first so access is granted cleanly
  await updateDoc(doc(db, 'properties', propId), {
    authorizedEmails: safeEmails,
    updatedAt: serverTimestamp(),
  });

  // Also keep central license records for this property synced
  try {
    const licSnap = await getDocs(
      query(collection(db, 'licenses'), where('propertyId', '==', propId))
    );
    for (const d of licSnap.docs) {
      await updateDoc(d.ref, {
        authorizedEmails: safeEmails,
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }
  } catch {
    // non-fatal if non-super-admin does not hold global licenses permission
  }

  const subNames = [
    'rooms',
    'blocked_dates',
    'guests',
    'reservations',
    'housekeeping_tasks',
    'pos_menu_items',
    'inventory_items',
    'purchase_orders',
    'staff_members',
    'user_accounts',
    'staff_sessions',
    'shifts',
    'attendance',
    'payroll_runs',
    'maintenance_tickets',
    'ota_channels',
    'messages',
  ];

  // Sync subcollections per collection so one legacy document can never fail user creation or updates
  for (const subName of subNames) {
    try {
      const snap = await getDocs(collection(db, 'properties', propId, subName));
      if (snap.empty) continue;
      for (let i = 0; i < snap.docs.length; i += 250) {
        const chunk = snap.docs.slice(i, i + 250);
        const batch = writeBatch(db);
        const now = serverTimestamp();
        for (const d of chunk) {
          batch.update(d.ref, {
            authorizedEmails: safeEmails,
            updatedAt: now,
          });
        }
        try {
          await batch.commit();
        } catch {
          for (const d of chunk) {
            await updateDoc(d.ref, {
              authorizedEmails: safeEmails,
              updatedAt: serverTimestamp(),
            }).catch((docErr) => {
              console.warn(`Skipped email sync for ${subName}/${d.id}:`, docErr);
            });
          }
        }
      }
    } catch (subErr) {
      console.warn(`Unable to sync authorizedEmails for subcollection ${subName}:`, subErr);
    }
  }
}

async function provisionStaffAuthAccount(
  email: string,
  password: string,
  fullName: string,
  customActionUrl?: string
): Promise<{ provisioned: boolean; note?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  if (!cleanPassword) {
    return { provisioned: false };
  }
  const secApp =
    getApps().find((appInstance) => appInstance.name === 'AccountProvisioner') ||
    initializeApp(effectiveFirebaseConfig, 'AccountProvisioner');
  const secAuth = getAuth(secApp);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, cleanEmail, cleanPassword);
    if (fullName.trim()) {
      await updateProfile(cred.user, { displayName: fullName.trim() }).catch(() => undefined);
    }
    const actionSettings = getPchActionCodeSettings(customActionUrl);
    try {
      await sendEmailVerification(cred.user, actionSettings);
    } catch (verifyErr) {
      const verifyCode = (verifyErr as { code?: string })?.code || '';
      if (
        verifyCode === 'auth/unauthorized-continue-uri' ||
        verifyCode === 'auth/invalid-continue-uri'
      ) {
        await sendEmailVerification(cred.user, {
          url: CENTRAL_AUTH_ORIGIN,
          handleCodeInApp: false,
        }).catch(() => undefined);
      }
    }
    await signOut(secAuth).catch(() => undefined);
    return {
      provisioned: true,
      note: 'Login credentials created and PCH PMS verification email sent.',
    };
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      await signOut(secAuth).catch(() => undefined);
      return {
        provisioned: true,
        note: 'Existing login account linked to this property role.',
      };
    }
    await signOut(secAuth).catch(() => undefined);
    throw err;
  }
}

export async function sendBrandedPasswordResetWorkflow(
  email: string,
  targetActionUrl?: string
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const actionSettings = getPchActionCodeSettings(targetActionUrl);
  try {
    await sendPasswordResetEmail(auth, cleanEmail, actionSettings);
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
      try {
        await sendPasswordResetEmail(auth, cleanEmail, {
          url: CENTRAL_AUTH_ORIGIN,
          handleCodeInApp: false,
        });
        return;
      } catch {
        throw new Error(
          `Custom domain "${CENTRAL_AUTH_DOMAIN}" must be listed under Authorized Domains before sending branded password reset links.`
        );
      }
    }
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
    const slug = getPropertySubdomainSlug(params.property);
    const isStaffRole = params.role !== 'property_admin';
    const currentHost =
      typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const isCustomPchHost =
      currentHost === CENTRAL_AUTH_DOMAIN || currentHost.endsWith(`.${CENTRAL_AUTH_DOMAIN}`);
    const tenantPortalUrl = isCustomPchHost
      ? `https://${slug}.${CENTRAL_AUTH_DOMAIN}${isStaffRole ? '/staff' : ''}`
      : typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : `https://${slug}.${CENTRAL_AUTH_DOMAIN}`;
    const authRes = await provisionStaffAuthAccount(
      cleanEmail,
      params.password,
      fullName,
      tenantPortalUrl
    );
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
    const staffCode = `${getPropertyCodePrefix(params.property)}-${Math.floor(100 + Math.random() * 899)}`;
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
  const rawAccountEmail = params.account.email.trim();
  const accountEmail = rawAccountEmail.toLowerCase();

  const shouldRetainInProperty =
    isBootstrappedAdminEmail(accountEmail) ||
    params.property.adminEmail.trim().toLowerCase() === accountEmail;

  const baseEmails = params.property.authorizedEmails.map((e) => e.trim()).filter(Boolean);
  const updatedEmails = nextActive
    ? [...baseEmails, accountEmail, ...(rawAccountEmail !== accountEmail ? [rawAccountEmail] : [])]
    : baseEmails.filter((e) => e.toLowerCase() !== accountEmail || shouldRetainInProperty);
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
      .map((e) => e.trim())
      .filter((e) => e.toLowerCase() !== accountEmail || shouldRetain),
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

function getSafeUserAgentLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Google Chrome';
  if (ua.includes('Firefox/')) return 'Mozilla Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Apple Safari';
  return 'Web Browser';
}

export async function upsertStaffSessionLoginWorkflow(params: {
  property: PropertyRecord;
  uid: string;
  email: string;
  fullName: string;
  assignedRole: AssignablePropertyRole | 'pch_admin';
  department: string;
  portal: 'richgates-admin' | 'staff' | 'pch-admin';
}): Promise<void> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!params.uid || !cleanEmail) return;
  const nowIso = new Date().toISOString();
  const safeEmails = sanitizeAuthorizedEmailList(
    [...(params.property.authorizedEmails || []), cleanEmail],
    params.property,
    cleanEmail
  );
  const sessionRef = doc(db, 'properties', params.property.id, 'staff_sessions', params.uid);
  try {
    const existingSnap = await getDoc(sessionRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const preservedLoginAtIso =
      existingData && existingData.status === 'logged_in' && typeof existingData.loginAtIso === 'string'
        ? existingData.loginAtIso
        : nowIso;
    const basePayload = {
      propertyId: params.property.id,
      uid: params.uid,
      email: cleanEmail.slice(0, 120),
      fullName: (params.fullName.trim() || cleanEmail).slice(0, 120),
      assignedRole: params.assignedRole,
      department: (params.department || 'Management').slice(0, 64),
      portal: params.portal,
      status: 'logged_in' as const,
      loginAtIso: preservedLoginAtIso,
      lastActiveIso: nowIso,
      userAgentLabel: getSafeUserAgentLabel().slice(0, 120),
      authorizedEmails: safeEmails,
    };

    if (existingData) {
      await setDoc(sessionRef, {
        ...basePayload,
        ownerUid: existingData.ownerUid || params.uid,
        createdAt: existingData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(sessionRef, {
        ...basePayload,
        ownerUid: params.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-blocking session tracking telemetry
  }
}

export async function heartbeatStaffSessionWorkflow(params: {
  propertyId: string;
  uid: string;
}): Promise<void> {
  if (!params.propertyId || !params.uid) return;
  const sessionRef = doc(db, 'properties', params.propertyId, 'staff_sessions', params.uid);
  try {
    await updateDoc(sessionRef, {
      status: 'logged_in',
      lastActiveIso: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking heartbeat update
  }
}

export async function recordStaffSessionLogoutWorkflow(params: {
  propertyId: string;
  uid: string;
}): Promise<void> {
  if (!params.propertyId || !params.uid) return;
  const nowIso = new Date().toISOString();
  const sessionRef = doc(db, 'properties', params.propertyId, 'staff_sessions', params.uid);
  try {
    await updateDoc(sessionRef, {
      status: 'logged_out',
      lastActiveIso: nowIso,
      loggedOutAtIso: nowIso,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking logout status update
  }
}

export async function migrateLegacyMediaUrlsInFirestore(params: {
  properties: PropertyRecord[];
  activeProperty?: PropertyRecord | null;
  rooms: RoomRecord[];
}): Promise<number> {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  let updatedCount = 0;

  for (const prop of params.properties) {
    if (prop.logoUrl && isLegacyOrAiStudioImageUrl(prop.logoUrl)) {
      const migratedLogo = resolveAppImageUrl(prop.logoUrl, '');
      if (migratedLogo !== prop.logoUrl) {
        batch.update(doc(db, 'properties', prop.id), {
          logoUrl: migratedLogo,
          updatedAt: now,
        });
        updatedCount += 1;
      }
    }
  }

  if (params.activeProperty) {
    for (const room of params.rooms) {
      const hasLegacyCover = Boolean(room.imageUrl && isLegacyOrAiStudioImageUrl(room.imageUrl));
      const hasLegacyGallery =
        Array.isArray(room.galleryImages) &&
        room.galleryImages.some((u) => isLegacyOrAiStudioImageUrl(u));
      if (!hasLegacyCover && !hasLegacyGallery) continue;

      const updatePayload: Record<string, unknown> = { updatedAt: now };
      if (hasLegacyCover) {
        updatePayload.imageUrl = resolveAppImageUrl(room.imageUrl, DEFAULT_ROOM_COVER_IMAGE_URL);
      }
      if (hasLegacyGallery) {
        const fallbackCover =
          typeof updatePayload.imageUrl === 'string'
            ? updatePayload.imageUrl
            : resolveAppImageUrl(room.imageUrl, DEFAULT_ROOM_COVER_IMAGE_URL);
        updatePayload.galleryImages = resolveGalleryImageUrls(room.galleryImages, fallbackCover);
      }
      batch.update(doc(db, 'properties', params.activeProperty.id, 'rooms', room.id), updatePayload);
      updatedCount += 1;
    }
  }

  if (updatedCount === 0) return 0;

  try {
    await batch.commit();
    return updatedCount;
  } catch {
    return 0;
  }
}


