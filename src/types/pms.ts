import {
  DEFAULT_ROOM_COVER_IMAGE_URL,
  resolveAppImageUrl,
  RICHGATES_EXTERIOR_IMAGE_URL,
  ROOM_MEDIA_PATHS,
} from '../utils/mediaAssets';

export type PortalMode = 'home' | 'pch-admin' | 'richgates-admin' | 'staff';

export type StaffRole =
  | 'pch_admin'
  | 'property_admin'
  | 'front_desk'
  | 'housekeeping'
  | 'fnb_kitchen'
  | 'accountant'
  | 'maintenance';

export type AssignablePropertyRole = Exclude<StaffRole, 'pch_admin'> | 'unassigned';

export type NavSectionId =
  | 'dashboard'
  | 'rooms'
  | 'calendar'
  | 'reservations'
  | 'arrivals'
  | 'in_house'
  | 'walk_in'
  | 'front_desk'
  | 'guests'
  | 'housekeeping'
  | 'pos_kitchen'
  | 'accounting'
  | 'reports'
  | 'inventory'
  | 'procurement'
  | 'staff'
  | 'user_management'
  | 'staff_sessions'
  | 'shifts_attendance'
  | 'payroll'
  | 'maintenance'
  | 'ota_channels'
  | 'properties_admin'
  | 'licensing'
  | 'rbac_audit'
  | 'messages'
  | 'training_help'
  | 'shift_daily_report'
  | 'invoices'
  | 'deployment'
  | 'profile'
  | 'cms';

export const RICHGATES_MAX_ROOMS = 20;

export type RoomSection = 'Serviced Apartment' | 'Hotel Rooms';

export type DepartmentName =
  | 'Management'
  | 'Front Desk'
  | 'Housekeeping'
  | 'Kitchen & F&B'
  | 'Accounts'
  | 'Engineering & Security';

export const ALL_DEPARTMENTS: DepartmentName[] = [
  'Management',
  'Front Desk',
  'Housekeeping',
  'Kitchen & F&B',
  'Accounts',
  'Engineering & Security',
];

export const ROLE_TO_DEPARTMENT: Record<StaffRole, DepartmentName> = {
  pch_admin: 'Management',
  property_admin: 'Management',
  front_desk: 'Front Desk',
  housekeeping: 'Housekeeping',
  fnb_kitchen: 'Kitchen & F&B',
  accountant: 'Accounts',
  maintenance: 'Engineering & Security',
};

export const RICHGATES_PROPERTY_INFO = {
  name: 'Richgates Apartments, Enugu',
  address: 'Plot C16-C, Fabian Okafor Close, Along Old Airport Road, Thinkers Corner, Enugu',
  phone: '+234 706 352 2668',
  whatsapp: '+234 706 352 2668',
  whatsappUrl: 'https://wa.me/2347063522668',
  email: 'support@richgatesapartment.com',
} as const;

export const RICHGATES_EXTERIOR_IMAGE = RICHGATES_EXTERIOR_IMAGE_URL;

export const RICHGATES_GALLERY_ASSETS: Array<{
  id: string;
  label: string;
  url: string;
}> = [
  {
    id: 'rg-kitchenette-studio',
    label: 'Serviced Studio Lounge & Kitchenette',
    url: ROOM_MEDIA_PATHS.servicedStudioLounge,
  },
  {
    id: 'rg-suite-living',
    label: 'One Bedroom Living Area',
    url: ROOM_MEDIA_PATHS.oneBedroomLivingSuite,
  },
  {
    id: 'rg-deluxe-bedroom',
    label: 'Deluxe Studio Bedroom',
    url: ROOM_MEDIA_PATHS.deluxeStudioBedroom,
  },
  {
    id: 'rg-tufted-bedroom',
    label: 'Standard Studio King Bed Detail',
    url: ROOM_MEDIA_PATHS.standardStudioKingBed,
  },
  {
    id: 'rg-exterior',
    label: 'Richgates Apartments Exterior',
    url: RICHGATES_EXTERIOR_IMAGE,
  },
];

export interface OfficialRoomSpec {
  id: string;
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
}

export const RICHGATES_OFFICIAL_ROOMS: OfficialRoomSpec[] = [
  {
    id: 'room-101',
    roomNumber: 'RM-1',
    name: 'RM-1 Deluxe Studio Apartment',
    roomType: 'Deluxe Studio with Kitchenette',
    section: 'Serviced Apartment',
    floor: 1,
    nightlyRateNgn: 65500,
    maxGuests: 2,
    imageUrl: ROOM_MEDIA_PATHS.servicedStudioLounge,
    amenities: ['Fitted Kitchenette', 'Lounge & Smart TV', 'PS5 & Workspace', '24/7 Power'],
  },
  {
    id: 'room-102',
    roomNumber: 'RM-2',
    name: 'RM-2 Executive One Bedroom',
    roomType: 'One Bedroom Suite Apartment',
    section: 'Serviced Apartment',
    floor: 1,
    nightlyRateNgn: 80000,
    maxGuests: 3,
    imageUrl: ROOM_MEDIA_PATHS.oneBedroomLivingSuite,
    amenities: ['Full Kitchenette', 'Separate Living Room', 'King Bed Suite', 'Starlink Wi-Fi'],
  },
  {
    id: 'room-103',
    roomNumber: 'RM-3',
    name: 'RM-3 Standard Studio Apartment',
    roomType: 'Standard Studio with Kitchenette',
    section: 'Serviced Apartment',
    floor: 1,
    nightlyRateNgn: 55000,
    maxGuests: 2,
    imageUrl: ROOM_MEDIA_PATHS.servicedStudioLounge,
    amenities: ['Kitchenette Counter', 'Bar Seating', 'Smart TV', 'Inverter + Diesel Backup'],
  },
  {
    id: 'room-104',
    roomNumber: 'RM-4',
    name: 'RM-4 Deluxe Hotel Studio',
    roomType: 'Deluxe Studio',
    section: 'Hotel Rooms',
    floor: 1,
    nightlyRateNgn: 55000,
    maxGuests: 2,
    imageUrl: ROOM_MEDIA_PATHS.deluxeStudioBedroom,
    amenities: ['King Bed', 'Lounge Armchair', 'Smart TV', 'En-Suite Rainfall Shower'],
  },
  {
    id: 'room-201',
    roomNumber: 'RM-5',
    name: 'RM-5 Standard Hotel Studio',
    roomType: 'Standard Studio',
    section: 'Hotel Rooms',
    floor: 2,
    nightlyRateNgn: 58000,
    maxGuests: 2,
    imageUrl: ROOM_MEDIA_PATHS.standardStudioKingBed,
    amenities: ['Tufted King Bed', 'Work Desk', 'High-Speed Wi-Fi', '24/7 Power'],
  },
  {
    id: 'room-202',
    roomNumber: 'RM-6',
    name: 'RM-6 Standard Hotel Studio',
    roomType: 'Standard Studio',
    section: 'Hotel Rooms',
    floor: 2,
    nightlyRateNgn: 55000,
    maxGuests: 2,
    imageUrl: ROOM_MEDIA_PATHS.deluxeStudioBedroom,
    amenities: ['King Bed', 'Smart TV', 'Tea & Coffee Station', 'Split AC'],
  },
  {
    id: 'room-203',
    roomNumber: 'RM-7',
    name: 'RM-7 Superior Standard Studio',
    roomType: 'Standard Studio',
    section: 'Hotel Rooms',
    floor: 2,
    nightlyRateNgn: 65000,
    maxGuests: 2,
    imageUrl: ROOM_MEDIA_PATHS.standardStudioKingBed,
    amenities: ['King Bed', 'Reading Lounge', 'Smart TV', 'Private Balcony'],
  },
  {
    id: 'room-204',
    roomNumber: 'RM-8',
    name: 'RM-8 Presidential One Bedroom',
    roomType: 'One Bedroom Suite',
    section: 'Hotel Rooms',
    floor: 2,
    nightlyRateNgn: 75000,
    maxGuests: 3,
    imageUrl: ROOM_MEDIA_PATHS.oneBedroomLivingSuite,
    amenities: ['Separate Parlour', 'King Bedroom Suite', 'Dining Bar', 'VIP Room Service'],
  },
];

export interface PropertyRecord {
  id: string;
  systemPropertyId?: string;
  subdomainSlug?: string;
  name: string;
  code: string;
  city: string;
  state: string;
  country: string;
  address: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  logoUrl?: string;
  currency: 'NGN';
  usdExchangeRateNgn?: number;
  usdRateUpdatedIso?: string;
  usdRateSource?: string;
  roomCount: number;
  status: 'active' | 'onboarding' | 'suspended';
  licenseKey?: string;
  licensePlan?: 'Starter' | 'Professional' | 'Enterprise' | 'Lifetime Sovereign';
  posServiceChargeRate?: number;
  posTaxRate?: number;
  posReceiptHeader?: string;
  posReceiptFooter?: string;
  posCategories?: string[];
  adminEmail: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export function getPropertyCodePrefix(
  property?: Pick<PropertyRecord, 'code' | 'id'> | null
): string {
  const raw = (property?.code || 'PCH').split('-')[0].replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return raw.slice(0, 4) || 'PCH';
}

export const STARTING_PROPERTY_SEQ = 11;

export function formatSystemPropertyId(seq: number): string {
  const safeSeq = Math.max(STARTING_PROPERTY_SEQ, Math.floor(Number.isFinite(seq) ? seq : STARTING_PROPERTY_SEQ));
  return `PCH-PROP-${String(safeSeq).padStart(6, '0')}`;
}

export function parseSystemPropertySeq(systemId?: string | null): number | null {
  if (!systemId) return null;
  const match = /^PCH-PROP-(\d+)$/.exec(systemId.trim().toUpperCase());
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) && num >= STARTING_PROPERTY_SEQ ? num : null;
}

export function getPropertySystemId(
  property?: Pick<PropertyRecord, 'id' | 'code' | 'systemPropertyId'> | null
): string {
  if (!property) return formatSystemPropertyId(STARTING_PROPERTY_SEQ);
  if (property.systemPropertyId && /^PCH-PROP-\d{6,}$/.test(property.systemPropertyId)) {
    return property.systemPropertyId;
  }
  if (property.id === 'richgates-enugu' || property.code === 'RG-ENU-01') {
    return formatSystemPropertyId(STARTING_PROPERTY_SEQ);
  }
  return 'PCH-PROP-PENDING';
}

export interface LicenseRecord {
  id: string;
  licenseKey: string;
  propertyId: string;
  propertyName: string;
  plan: 'Starter' | 'Professional' | 'Enterprise' | 'Lifetime Sovereign';
  billingCycle: 'monthly' | 'annual' | 'lifetime';
  isLifetime: boolean;
  maxRooms: number;
  priceNgn: number;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  issuedAt: string;
  activatedAt?: string;
  expiresAt: string;
  activatedByEmail?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface UserRoleProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  whatsapp?: string;
  jobTitle?: string;
  notes?: string;
  role: StaffRole;
  propertyId: string;
  active: boolean;
  ownerUid: string;
}

export interface AuditLogRecord {
  id: string;
  propertyId: string;
  actorEmail: string;
  actorRole: string;
  module: string;
  action: string;
  details: string;
  timestampIso: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface RoomRecord {
  id: string;
  propertyId: string;
  roomNumber: string;
  name: string;
  roomType: string;
  section?: RoomSection;
  floor: number;
  nightlyRateNgn: number;
  maxGuests: number;
  occupancyStatus: 'vacant' | 'occupied' | 'reserved' | 'out_of_order';
  housekeepingStatus: 'clean' | 'dirty' | 'cleaning' | 'inspected';
  currentGuestName?: string;
  currentReservationId?: string;
  imageUrl?: string;
  galleryImages?: string[];
  amenities?: string[];
  authorizedEmails: string[];
  ownerUid: string;
}

export function getRoomGalleryImages(
  room: Pick<RoomRecord, 'imageUrl' | 'galleryImages' | 'section' | 'roomNumber'>
): Array<{ url: string; label: string }> {
  const defaultCover = resolveAppImageUrl(
    room.imageUrl,
    RICHGATES_GALLERY_ASSETS[2]?.url || DEFAULT_ROOM_COVER_IMAGE_URL
  );
  const assetLabelMap = new Map(RICHGATES_GALLERY_ASSETS.map((a) => [a.url, a.label]));

  const customList = (room.galleryImages || [])
    .map((u) => (typeof u === 'string' ? resolveAppImageUrl(u, '') : ''))
    .filter(Boolean);

  if (customList.length > 0) {
    const ordered = Array.from(new Set([defaultCover, ...customList])).slice(0, 6);
    return ordered.map((url, idx) => ({
      url,
      label: assetLabelMap.get(url) || `${room.roomNumber} Photo ${idx + 1}`,
    }));
  }

  // Provide a curated multi-slide gallery per room using existing property imagery
  const sectionDefaults =
    room.section === 'Serviced Apartment'
      ? [
          RICHGATES_GALLERY_ASSETS[0],
          RICHGATES_GALLERY_ASSETS[1],
          RICHGATES_GALLERY_ASSETS[2],
          RICHGATES_GALLERY_ASSETS[4],
        ]
      : [
          RICHGATES_GALLERY_ASSETS[2],
          RICHGATES_GALLERY_ASSETS[3],
          RICHGATES_GALLERY_ASSETS[1],
          RICHGATES_GALLERY_ASSETS[4],
        ];

  const seen = new Set<string>();
  const slides: Array<{ url: string; label: string }> = [];
  const pushSlide = (url: string, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    slides.push({ url, label });
  };

  pushSlide(defaultCover, assetLabelMap.get(defaultCover) || `${room.roomNumber} Main View`);
  for (const item of sectionDefaults) {
    if (item) pushSlide(item.url, item.label);
  }
  return slides.slice(0, 4);
}

export interface BlockedDateRecord {
  id: string;
  propertyId: string;
  roomId: string;
  roomNumber: string;
  startDate: string;
  endDate: string;
  reason: string;
  category: 'Owner Hold' | 'Maintenance' | 'VIP Hold' | 'Deep Clean';
  createdByEmail: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface GuestRecord {
  id: string;
  propertyId: string;
  fullName: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  nationality?: string;
  idType: 'NIN' | 'International Passport' | 'Driver License' | 'Voter Card';
  idNumber?: string;
  idExpiryDate?: string;
  vipTier: 'Standard' | 'Silver' | 'Gold' | 'Diplomatic';
  totalStays: number;
  lifetimeSpendNgn: number;
  notes?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export type BookingSourceOption =
  | 'Walk-in'
  | 'Website'
  | 'Phone'
  | 'WhatsApp'
  | 'Direct Walk-In'
  | 'Direct Web'
  | 'Booking.com'
  | 'Airbnb'
  | 'Expedia'
  | 'Hotels.ng'
  | 'VRBO'
  | 'Custom iCal';

export const PRIMARY_BOOKING_SOURCES: Array<{ value: BookingSourceOption; label: string }> = [
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Website', label: 'Website' },
  { value: 'Phone', label: 'Phone' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Booking.com', label: 'Booking.com' },
  { value: 'Airbnb', label: 'Airbnb' },
  { value: 'Expedia', label: 'Expedia' },
  { value: 'VRBO', label: 'VRBO' },
  { value: 'Custom iCal', label: 'Custom iCal' },
];

export type ReservationStatus =
  | 'confirmed'
  | 'pending'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export type PaymentStatusLabel = 'Paid' | 'Partial' | 'Unpaid' | 'Paid to OTA';

export type OtaPayoutStatus = 'pending' | 'received';

export function formatPaymentCollectionLabel(mode: OtaPaymentCollectionMode): string {
  return mode === 'ota_prepaid' ? 'Collected by OTA' : 'Collect at Property';
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  checked_in: 'Checked-in',
  checked_out: 'Checked-out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export interface ReservationRecord {
  id: string;
  propertyId: string;
  bookingRef: string;
  roomId: string;
  roomNumber: string;
  requestedRoomType?: string;
  guestId?: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestAddress?: string;
  guestCity?: string;
  guestState?: string;
  guestCountry?: string;
  checkInDate: string;
  checkOutDate: string;
  bookedDate?: string;
  nights: number;
  adults: number;
  children?: number;
  channel: BookingSourceOption;
  nightlyRateNgn: number;
  roomChargesNgn: number;
  posChargesNgn: number;
  paidNgn: number;
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
  otaPayoutReceivedAtIso?: string;
  amountDueAtPropertyNgn?: number;
  paymentManuallyEdited?: boolean;
  hotelPaidNgn?: number;
  status: ReservationStatus;
  paymentMethod:
    | 'Bank Transfer'
    | 'Card POS'
    | 'Cash NGN'
    | 'Corporate Invoice'
    | 'Online Gateway'
    | 'OTA Platform Payout';
  paymentStatus?: PaymentStatusLabel;
  cautionDepositEnabled?: boolean;
  cautionDepositNgn?: number;
  cautionDepositCollectedNgn?: number;
  cautionDepositRefunded?: boolean;
  cautionDepositRefundedAtIso?: string;
  paymentConfirmed?: boolean;
  idVerified?: boolean;
  idType?: GuestRecord['idType'];
  idNumber?: string;
  idExpiryDate?: string;
  ratePlan?: string;
  specialRequests?: string;
  keyIssued?: boolean;
  checkedInAtIso?: string;
  checkOutTime?: string;
  lateCheckoutFeeNgn?: number;
  lateCheckoutApplied?: boolean;
  checkedOutAtIso?: string;
  cancellationType?: 'free' | 'paid';
  cancellationFeeNgn?: number;
  cancellationReason?: string;
  cancelledAtIso?: string;
  externalUid?: string;
  createdAt?: { toDate?: () => Date } | string;
  authorizedEmails: string[];
  ownerUid: string;
}

export function formatBookingSourceLabel(channel: string): string {
  if (channel === 'Direct Walk-In' || channel === 'Walk-in') return 'Walk-in';
  if (channel === 'Direct Web' || channel === 'Website') return 'Website';
  if (channel === 'Hotels.ng') return 'Booking.com';
  return channel;
}

export function matchesBookingSourceFilter(channel: string, filter: string): boolean {
  if (filter === 'ALL') return true;
  return formatBookingSourceLabel(channel) === formatBookingSourceLabel(filter);
}

export function isOtaBookingChannel(channel: string | undefined): boolean {
  const ch = String(channel || '').trim().toLowerCase();
  if (!ch) return false;
  return (
    ch === 'airbnb' ||
    ch === 'booking.com' ||
    ch === 'expedia' ||
    ch === 'hotels.ng' ||
    ch === 'vrbo' ||
    ch === 'custom ical' ||
    ch === 'agoda' ||
    ch === 'hotels.com' ||
    ch === 'trip.com' ||
    ch === 'hostelworld' ||
    ch.includes('airbnb') ||
    ch.includes('booking.com') ||
    ch.includes('expedia') ||
    ch.includes('vrbo') ||
    ch.includes('agoda') ||
    ch.includes('ical') ||
    ch.includes('ota')
  );
}

export function isOtaReservation(
  res:
    | (Pick<ReservationRecord, 'channel'> &
        Partial<Pick<ReservationRecord, 'externalUid' | 'paymentCollectionMode'>>)
    | null
    | undefined
): boolean {
  if (!res) return false;
  return (
    isOtaBookingChannel(res.channel) ||
    Boolean(res.externalUid && res.externalUid.trim().length > 0) ||
    res.paymentCollectionMode === 'ota_prepaid'
  );
}

export function getOtaPlatformLabel(
  res:
    | (Pick<ReservationRecord, 'channel'> &
        Partial<Pick<ReservationRecord, 'externalUid' | 'paymentCollectionMode'>>)
    | null
    | undefined
): string {
  if (!res) return 'OTA';
  const raw = formatBookingSourceLabel(res.channel || '').trim();
  if (raw && isOtaBookingChannel(raw)) return raw;
  if (raw && raw.toLowerCase() !== 'walk-in' && raw.toLowerCase() !== 'website') return raw;
  return 'the OTA booking platform';
}

function normalizeOtaIsoDate(raw: string | undefined): string {
  const cleaned = String(raw || '').trim();
  const match = cleaned.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : cleaned;
}

export function getOtaCheckInRestriction(
  res:
    | (Pick<ReservationRecord, 'channel' | 'checkInDate'> &
        Partial<Pick<ReservationRecord, 'externalUid' | 'paymentCollectionMode'>>)
    | null
    | undefined,
  todayIso: string
): {
  restricted: boolean;
  isOta: boolean;
  platformLabel: string;
  checkInIso: string;
  message: string;
} {
  const ota = isOtaReservation(res);
  const platformLabel = getOtaPlatformLabel(res);
  const checkInIso = normalizeOtaIsoDate(res?.checkInDate);
  const normalizedToday = normalizeOtaIsoDate(todayIso);
  if (ota && checkInIso && normalizedToday && normalizedToday < checkInIso) {
    return {
      restricted: true,
      isOta: true,
      platformLabel,
      checkInIso,
      message: `${platformLabel} reservations cannot be checked in before their scheduled arrival date (${checkInIso}).`,
    };
  }
  return {
    restricted: false,
    isOta: ota,
    platformLabel,
    checkInIso,
    message: '',
  };
}

export const RATE_PLAN_OPTIONS = [
  'Standard Rate',
  'Corporate Rate',
  'Weekend Special',
  'Long Stay Rate',
  'OTA Channel Rate',
  'Complimentary / VIP',
] as const;

export function getCheckInDateRestriction(
  res:
    | (Pick<ReservationRecord, 'channel' | 'checkInDate'> &
        Partial<Pick<ReservationRecord, 'externalUid' | 'paymentCollectionMode'>>)
    | null
    | undefined,
  todayIso: string
): {
  restricted: boolean;
  isOta: boolean;
  platformLabel: string;
  checkInIso: string;
  message: string;
} {
  const ota = isOtaReservation(res);
  const platformLabel = getOtaPlatformLabel(res);
  const checkInIso = normalizeOtaIsoDate(res?.checkInDate);
  const normalizedToday = normalizeOtaIsoDate(todayIso);
  if (checkInIso && normalizedToday && normalizedToday < checkInIso) {
    return {
      restricted: true,
      isOta: ota,
      platformLabel,
      checkInIso,
      message: ota
        ? `${platformLabel} reservations cannot be checked in before their scheduled arrival date (${checkInIso}).`
        : `Check-in is only allowed on or after the scheduled arrival date (${checkInIso}).`,
    };
  }
  return {
    restricted: false,
    isOta: ota,
    platformLabel,
    checkInIso,
    message: '',
  };
}

export function getOtaCancellationRestriction(
  res:
    | (Pick<ReservationRecord, 'channel'> &
        Partial<Pick<ReservationRecord, 'externalUid' | 'paymentCollectionMode'>>)
    | null
    | undefined
): {
  restricted: boolean;
  platformLabel: string;
  message: string;
} {
  const ota = isOtaReservation(res);
  const platformLabel = getOtaPlatformLabel(res);
  if (ota) {
    return {
      restricted: true,
      platformLabel,
      message: `${platformLabel} reservations cannot be cancelled directly from the PMS. Please direct the guest to cancel through ${platformLabel} (their original booking platform).`,
    };
  }
  return {
    restricted: false,
    platformLabel,
    message: '',
  };
}

export function getDefaultOtaChannelCurrency(channelName: string | undefined): ChannelCurrency {
  const ch = String(channelName || '').trim().toLowerCase();
  if (
    ch === 'direct website engine' ||
    ch === 'direct web' ||
    ch === 'direct walk-in' ||
    ch === 'walk-in' ||
    ch === 'website' ||
    ch === 'phone' ||
    ch === 'whatsapp'
  ) {
    return 'NGN';
  }
  return 'USD';
}

export function getReservationPaymentSummary(
  res: Pick<ReservationRecord, 'roomChargesNgn' | 'posChargesNgn' | 'paidNgn'> &
    Partial<
      Pick<
        ReservationRecord,
        | 'channel'
        | 'nightlyRateNgn'
        | 'status'
        | 'cancellationType'
        | 'cancellationFeeNgn'
        | 'lateCheckoutFeeNgn'
        | 'paymentCollectionMode'
        | 'otaPaidNgn'
        | 'otaPaidSourceAmount'
        | 'expectedPayoutNgn'
        | 'actualPayoutReceivedNgn'
        | 'otaPayoutStatus'
        | 'otaPayoutReceivedAtIso'
        | 'amountDueAtPropertyNgn'
        | 'paymentManuallyEdited'
        | 'hotelPaidNgn'
        | 'sourceCurrency'
        | 'sourceNightlyRate'
        | 'sourceTotalAmount'
        | 'fxRateToNgn'
        | 'paymentStatus'
        | 'cautionDepositEnabled'
        | 'cautionDepositNgn'
        | 'cautionDepositCollectedNgn'
        | 'cautionDepositRefunded'
      >
    >,
  usdExchangeRateNgn?: number
): {
  totalAmount: number;
  totalAmountUsd: number;
  expectedPayoutNgn: number;
  expectedPayoutUsd: number;
  actualPayoutReceivedNgn: number;
  otaPayoutStatus: OtaPayoutStatus | 'not_applicable';
  otaPaidAmount: number;
  hotelPaidAmount: number;
  hotelPaidUsd: number;
  totalReceivedByHotelNgn: number;
  amountPaid: number;
  amountDueAtPropertyNgn: number;
  balance: number;
  balanceUsd: number;
  paymentStatus: PaymentStatusLabel;
  paymentCollectionMode: OtaPaymentCollectionMode;
  sourceCurrency: ChannelCurrency;
  sourceNightlyRate: number;
  sourceTotalAmount: number;
  fxRateToNgn: number;
  internalUsdRateNgn: number;
  otaPaidSourceAmount: number;
  hotelPaidSourceAmount: number;
  sourceBalanceAmount: number;
  cautionDepositEnabled: boolean;
  cautionDepositNgn: number;
  cautionDepositCollectedNgn: number;
  cautionDepositRefunded: boolean;
  cautionDepositPendingRefundNgn: number;
} {
  const lateFee = Math.max(0, res.lateCheckoutFeeNgn || 0);
  const cancelFee = Math.max(0, res.cancellationFeeNgn || 0);
  const roomChargesNgn = Math.max(0, res.roomChargesNgn || 0);
  const expectedPayoutNgn =
    res.status === 'cancelled'
      ? res.cancellationType === 'paid'
        ? cancelFee
        : 0
      : typeof res.expectedPayoutNgn === 'number' && res.expectedPayoutNgn >= 0
        ? Math.round(res.expectedPayoutNgn)
        : roomChargesNgn;

  const effectiveRoomCharge =
    isOtaBookingChannel(res.channel) && typeof res.expectedPayoutNgn === 'number' && res.expectedPayoutNgn >= 0
      ? Math.max(roomChargesNgn, 0) > 0
        ? roomChargesNgn
        : expectedPayoutNgn
      : roomChargesNgn;

  const totalAmount =
    res.status === 'cancelled'
      ? res.cancellationType === 'paid'
        ? Math.max(0, cancelFee + (res.posChargesNgn || 0))
        : 0
      : Math.max(0, effectiveRoomCharge + (res.posChargesNgn || 0) + lateFee);

  const isOtaChannel = isOtaBookingChannel(res.channel);
  const sourceCurrency: ChannelCurrency = res.sourceCurrency || 'NGN';
  const internalUsdRateNgn =
    usdExchangeRateNgn && usdExchangeRateNgn > 0
      ? Math.round(usdExchangeRateNgn)
      : sourceCurrency === 'USD' && res.fxRateToNgn && res.fxRateToNgn > 1
        ? Math.round(res.fxRateToNgn)
        : DEFAULT_USD_RATE_NGN;
  const fxRate =
    res.fxRateToNgn && res.fxRateToNgn > 0
      ? res.fxRateToNgn
      : getFxRateToNgn(sourceCurrency, internalUsdRateNgn);

  const rawPaidNgn = Math.max(0, res.paidNgn || 0);
  let otaPaidAmount = 0;

  if (typeof res.otaPaidNgn === 'number' && res.otaPaidNgn >= 0) {
    otaPaidAmount = Math.round(res.otaPaidNgn);
  } else if (typeof res.otaPaidSourceAmount === 'number' && res.otaPaidSourceAmount > 0 && isOtaChannel) {
    otaPaidAmount =
      sourceCurrency === 'NGN'
        ? Math.round(res.otaPaidSourceAmount)
        : Math.round(res.otaPaidSourceAmount * fxRate);
  } else if (isOtaChannel && res.paymentCollectionMode === 'ota_prepaid') {
    otaPaidAmount = Math.max(0, effectiveRoomCharge);
  }

  const paymentCollectionMode: OtaPaymentCollectionMode =
    res.paymentCollectionMode ||
    (isOtaChannel && (otaPaidAmount > 0 || res.paymentStatus === 'Paid to OTA')
      ? 'ota_prepaid'
      : 'hotel_collect');
  const isCollectedByOta = paymentCollectionMode === 'ota_prepaid';

  // Direct payments collected at the property (never treat OTA booking amounts as direct property receipts)
  const hotelPaidAmount =
    typeof res.hotelPaidNgn === 'number' && res.hotelPaidNgn >= 0
      ? Math.round(res.hotelPaidNgn)
      : isCollectedByOta
        ? 0
        : rawPaidNgn;

  // Track OTA Payout separately as Pending or Received
  const otaPayoutStatus: OtaPayoutStatus | 'not_applicable' = isCollectedByOta
    ? res.otaPayoutStatus === 'received' || res.otaPayoutStatus === 'pending'
      ? res.otaPayoutStatus
      : typeof res.actualPayoutReceivedNgn === 'number' && res.actualPayoutReceivedNgn > 0
        ? 'received'
        : 'pending'
    : 'not_applicable';

  const actualPayoutReceivedNgn =
    otaPayoutStatus === 'received'
      ? typeof res.actualPayoutReceivedNgn === 'number' && res.actualPayoutReceivedNgn >= 0
        ? Math.round(res.actualPayoutReceivedNgn)
        : expectedPayoutNgn
      : 0;

  // Money actually received by the hotel = direct property receipts + OTA payouts marked Received
  const totalReceivedByHotelNgn = hotelPaidAmount + actualPayoutReceivedNgn;
  const amountPaid = totalReceivedByHotelNgn;

  // Amount Due at Property (₦0 for OTA-paid room stays unless extras exist or admin overrides)
  const computedDueAtProperty =
    res.status === 'cancelled' && res.cancellationType !== 'paid'
      ? 0
      : typeof res.amountDueAtPropertyNgn === 'number' && res.amountDueAtPropertyNgn >= 0
        ? Math.round(res.amountDueAtPropertyNgn)
        : isCollectedByOta || res.paymentStatus === 'Paid to OTA'
          ? Math.max(0, (res.posChargesNgn || 0) + lateFee - hotelPaidAmount)
          : Math.max(0, totalAmount - hotelPaidAmount);

  const amountDueAtPropertyNgn = computedDueAtProperty;
  const balance = amountDueAtPropertyNgn;

  let paymentStatus: PaymentStatusLabel = 'Unpaid';
  if (
    res.paymentManuallyEdited &&
    (res.paymentStatus === 'Paid to OTA' ||
      res.paymentStatus === 'Paid' ||
      res.paymentStatus === 'Partial' ||
      res.paymentStatus === 'Unpaid')
  ) {
    paymentStatus = res.paymentStatus;
  } else if (res.paymentStatus === 'Paid to OTA') {
    paymentStatus = 'Paid to OTA';
  } else if (isCollectedByOta) {
    paymentStatus = 'Paid to OTA';
  } else if (res.status === 'cancelled' && res.cancellationType === 'free') {
    paymentStatus = 'Paid';
  } else if (balance <= 0 && (totalAmount > 0 || hotelPaidAmount > 0)) {
    paymentStatus = 'Paid';
  } else if (hotelPaidAmount > 0) {
    paymentStatus = 'Partial';
  } else if (
    res.paymentStatus === 'Paid' ||
    res.paymentStatus === 'Partial' ||
    res.paymentStatus === 'Unpaid'
  ) {
    paymentStatus = res.paymentStatus;
  }

  const sourceNightlyRate =
    typeof res.sourceNightlyRate === 'number' && res.sourceNightlyRate > 0
      ? res.sourceNightlyRate
      : sourceCurrency === 'NGN'
        ? res.nightlyRateNgn || 0
        : Number(((res.nightlyRateNgn || 0) / fxRate).toFixed(2));
  const otaPaidSourceAmount =
    typeof res.otaPaidSourceAmount === 'number' && res.otaPaidSourceAmount >= 0
      ? res.otaPaidSourceAmount
      : sourceCurrency === 'NGN'
        ? otaPaidAmount
        : Number((otaPaidAmount / fxRate).toFixed(2));
  const sourceTotalAmount =
    typeof res.sourceTotalAmount === 'number' && res.sourceTotalAmount > 0
      ? res.sourceTotalAmount
      : otaPaidSourceAmount > 0 && sourceCurrency !== 'NGN'
        ? otaPaidSourceAmount
        : sourceCurrency === 'NGN'
          ? totalAmount
          : Number((totalAmount / fxRate).toFixed(2));
  const hotelPaidSourceAmount =
    sourceCurrency === 'NGN'
      ? hotelPaidAmount
      : Number((hotelPaidAmount / fxRate).toFixed(2));
  const sourceBalanceAmount =
    sourceCurrency === 'NGN'
      ? balance
      : Number((balance / fxRate).toFixed(2));

  const totalAmountUsd =
    sourceCurrency === 'USD' && sourceTotalAmount > 0
      ? Number(sourceTotalAmount.toFixed(2))
      : Number((totalAmount / Math.max(1, internalUsdRateNgn)).toFixed(2));
  const expectedPayoutUsd = Number(
    (expectedPayoutNgn / Math.max(1, internalUsdRateNgn)).toFixed(2)
  );
  const hotelPaidUsd = Number(
    (hotelPaidAmount / Math.max(1, internalUsdRateNgn)).toFixed(2)
  );
  const balanceUsd = Number((balance / Math.max(1, internalUsdRateNgn)).toFixed(2));

  const cautionDepositNgn = Math.max(0, Math.round(res.cautionDepositNgn || 0));
  const cautionDepositCollectedNgn = Math.max(
    0,
    Math.round(res.cautionDepositCollectedNgn || 0)
  );
  const cautionDepositEnabled = Boolean(
    res.cautionDepositEnabled || cautionDepositNgn > 0 || cautionDepositCollectedNgn > 0
  );
  const cautionDepositRefunded = Boolean(res.cautionDepositRefunded);
  const cautionDepositPendingRefundNgn = cautionDepositRefunded
    ? 0
    : cautionDepositCollectedNgn;

  return {
    totalAmount,
    totalAmountUsd,
    expectedPayoutNgn,
    expectedPayoutUsd,
    actualPayoutReceivedNgn,
    otaPayoutStatus,
    otaPaidAmount,
    hotelPaidAmount,
    hotelPaidUsd,
    totalReceivedByHotelNgn,
    amountPaid,
    amountDueAtPropertyNgn,
    balance,
    balanceUsd,
    paymentStatus,
    paymentCollectionMode,
    sourceCurrency,
    sourceNightlyRate,
    sourceTotalAmount,
    fxRateToNgn: fxRate,
    internalUsdRateNgn,
    otaPaidSourceAmount,
    hotelPaidSourceAmount,
    sourceBalanceAmount,
    cautionDepositEnabled,
    cautionDepositNgn,
    cautionDepositCollectedNgn,
    cautionDepositRefunded,
    cautionDepositPendingRefundNgn,
  };
}

export function getReservationBookedDate(
  res: Pick<ReservationRecord, 'bookedDate' | 'checkInDate' | 'createdAt'>
): string {
  if (res.bookedDate) return res.bookedDate;
  if (res.createdAt && typeof res.createdAt === 'object' && typeof res.createdAt.toDate === 'function') {
    try {
      return res.createdAt.toDate().toISOString().slice(0, 10);
    } catch {
      // ignore fallback
    }
  }
  if (typeof res.createdAt === 'string' && res.createdAt.length >= 10) {
    return res.createdAt.slice(0, 10);
  }
  return res.checkInDate;
}

export function getReservationRoomDisplay(
  res: Pick<ReservationRecord, 'roomId' | 'roomNumber' | 'requestedRoomType'>,
  rooms: RoomRecord[]
): {
  isAssigned: boolean;
  roomNumberLabel: string;
  roomTypeLabel: string;
  room?: RoomRecord;
} {
  const assignedRoom = res.roomId ? rooms.find((r) => r.id === res.roomId) : undefined;
  const rawNum = (res.roomNumber || '').trim();
  const isAssigned =
    Boolean(res.roomId) &&
    rawNum.length > 0 &&
    rawNum.toLowerCase() !== 'unassigned';
  const catalogRoom = !assignedRoom && isAssigned
    ? RICHGATES_OFFICIAL_ROOMS.find((rm) => rm.roomNumber === rawNum)
    : undefined;
  const roomTypeLabel =
    assignedRoom?.roomType ||
    res.requestedRoomType ||
    catalogRoom?.roomType ||
    'Studio';

  return {
    isAssigned,
    roomNumberLabel: isAssigned ? assignedRoom?.roomNumber || rawNum : 'Unassigned',
    roomTypeLabel,
    room: assignedRoom,
  };
}

export interface HousekeepingTaskRecord {
  id: string;
  propertyId: string;
  roomId: string;
  roomNumber: string;
  taskType: 'Checkout Turnover' | 'Daily Stayover' | 'Deep Clean' | 'VIP Inspection';
  assignedTo: string;
  priority: 'Normal' | 'High' | 'Urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'inspected';
  notes?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface PosOrderRecord {
  id: string;
  propertyId: string;
  orderNumber: string;
  orderDate?: string;
  serviceType: 'Dine-In' | 'Room Service' | 'Bar Lounge' | 'Takeaway';
  tableOrRoom: string;
  guestName?: string;
  reservationId?: string;
  itemsSummary: string;
  itemCount: number;
  subtotalNgn: number;
  serviceChargeNgn?: number;
  discountNgn?: number;
  vatNgn: number;
  totalNgn: number;
  paymentStatus: 'paid' | 'room_folio' | 'unpaid';
  paymentMethod: 'Room Folio' | 'Card POS' | 'Bank Transfer' | 'Cash NGN';
  kitchenStatus: 'queued' | 'preparing' | 'ready' | 'served';
  notes?: string;
  createdAt?: { toDate?: () => Date } | string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface LedgerEntryRecord {
  id: string;
  propertyId: string;
  entryDate: string;
  entryType: 'revenue' | 'expense';
  category:
    | 'Room Accommodation'
    | 'Restaurant & Bar'
    | 'Procurement'
    | 'Payroll'
    | 'Utilities & Diesel'
    | 'Maintenance'
    | 'OTA Commission'
    | 'Other';
  reference?: string;
  description: string;
  amountNgn: number;
  vatNgn: number;
  paymentMethod: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface InventoryItemRecord {
  id: string;
  propertyId: string;
  sku: string;
  name: string;
  category: 'Kitchen & Pantry' | 'Bar & Beverage' | 'Housekeeping Linen & Amenities' | 'Engineering & Diesel';
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostNgn: number;
  supplierName: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface PurchaseOrderRecord {
  id: string;
  propertyId: string;
  poNumber: string;
  supplierName: string;
  itemId?: string;
  itemName: string;
  quantity: number;
  unitCostNgn: number;
  totalCostNgn: number;
  status: 'draft' | 'approved' | 'received' | 'cancelled';
  expectedDate: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface StaffMemberRecord {
  id: string;
  propertyId: string;
  staffCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  department: 'Management' | 'Front Desk' | 'Housekeeping' | 'Kitchen & F&B' | 'Accounts' | 'Engineering & Security';
  role: 'property_admin' | 'front_desk' | 'housekeeping' | 'fnb_kitchen' | 'accountant' | 'maintenance';
  monthlyBaseSalaryNgn: number;
  monthlyAllowanceNgn: number;
  employmentStatus: 'active' | 'on_leave' | 'suspended';
  authorizedEmails: string[];
  ownerUid: string;
}

export interface PropertyUserAccountRecord {
  id: string;
  propertyId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  department: DepartmentName;
  role: AssignablePropertyRole;
  privileges: NavSectionId[];
  active: boolean;
  linkedStaffId?: string;
  authProvisioned?: boolean;
  lastRoleUpdatedIso?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface StaffSessionRecord {
  id: string;
  propertyId: string;
  uid: string;
  email: string;
  fullName: string;
  assignedRole: AssignablePropertyRole | 'pch_admin';
  department: string;
  portal: 'richgates-admin' | 'staff' | 'pch-admin';
  status: 'logged_in' | 'logged_out';
  loginAtIso: string;
  lastActiveIso: string;
  loggedOutAtIso?: string;
  userAgentLabel?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface ShiftScheduleRecord {
  id: string;
  propertyId: string;
  staffId: string;
  staffName: string;
  department: string;
  shiftDate: string;
  shiftWindow: 'Morning (07:00 - 15:00)' | 'Afternoon (15:00 - 23:00)' | 'Night (23:00 - 07:00)';
  status: 'scheduled' | 'completed' | 'missed';
  handoverNotes?: string;
  closedBy?: string;
  closedAtIso?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface AttendanceRecord {
  id: string;
  propertyId: string;
  staffId: string;
  staffName: string;
  date: string;
  clockInTime: string;
  clockOutTime?: string;
  status: 'present' | 'late' | 'absent' | 'clocked_out';
  authorizedEmails: string[];
  ownerUid: string;
}

export interface PayrollRunRecord {
  id: string;
  propertyId: string;
  periodLabel: string;
  payDate?: string;
  paymentMethod?: string;
  staffCount: number;
  grossPayNgn: number;
  pensionDeductionNgn: number;
  payeTaxNgn: number;
  netPayNgn: number;
  status: 'draft' | 'posted_to_ledger';
  authorizedEmails: string[];
  ownerUid: string;
}

export interface MaintenanceTicketRecord {
  id: string;
  propertyId: string;
  roomId?: string;
  locationLabel: string;
  issueTitle: string;
  category: 'HVAC & AC' | 'Plumbing' | 'Electrical & Inverter' | 'Carpentry' | 'Generator & Power';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assignedTo: string;
  estimatedCostNgn: number;
  status: 'open' | 'in_progress' | 'resolved';
  authorizedEmails: string[];
  ownerUid: string;
}

export type ChannelCurrency = 'NGN' | 'USD' | 'GBP' | 'EUR';

export type OtaPaymentCollectionMode = 'ota_prepaid' | 'hotel_collect';

export const SUPPORTED_CHANNEL_CURRENCIES: ChannelCurrency[] = ['NGN', 'USD', 'GBP', 'EUR'];

export interface OtaIntegrationRecord {
  id: string;
  propertyId: string;
  channelName: 'Booking.com' | 'Airbnb' | 'Expedia' | 'Hotels.ng' | 'VRBO' | 'Direct Website Engine' | 'Custom iCal';
  propertyListingId: string;
  roomNumber?: string;
  defaultCurrency?: ChannelCurrency;
  defaultNightlyRate?: number;
  paymentCollectionMode?: OtaPaymentCollectionMode;
  icalImportUrl?: string;
  icalExportUrl?: string;
  commissionPct: number;
  autoSync: boolean;
  connected: boolean;
  disconnectedAtIso?: string;
  lastSyncedIso: string;
  bookingsImported: number;
  authorizedEmails: string[];
  ownerUid: string;
}

export type MessageRecipientScope = 'department' | 'direct_staff' | 'bulk_staff' | 'all_staff';

export interface PropertyMessageRecord {
  id: string;
  propertyId: string;
  senderEmail: string;
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
  readByEmails: string[];
  createdAtIso: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export type PosSection = 'Kitchen' | 'Food & Beverage';

export const POS_SECTIONS: PosSection[] = ['Kitchen', 'Food & Beverage'];

export const POS_DEFAULT_CATEGORIES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snacks',
  'Drinks',
  'Nigerian Kitchen',
  'Grill & Continental',
  'Bar & Cocktails',
] as const;

export interface PosMenuItem {
  id: string;
  name: string;
  section?: PosSection;
  category: string;
  priceNgn: number;
  costNgn?: number;
  prepMinutes: number;
  available?: boolean;
}

export interface PosMenuItemRecord extends PosMenuItem {
  propertyId: string;
  section?: PosSection;
  available: boolean;
  authorizedEmails: string[];
  ownerUid: string;
}

export function inferPosItemSection(item: Pick<PosMenuItem, 'section' | 'category'>): PosSection {
  if (item.section === 'Kitchen' || item.section === 'Food & Beverage') {
    return item.section;
  }
  const cat = (item.category || '').toLowerCase();
  if (
    cat.includes('drink') ||
    cat.includes('beverage') ||
    cat.includes('bar') ||
    cat.includes('cocktail') ||
    cat.includes('snack') ||
    cat.includes('juice')
  ) {
    return 'Food & Beverage';
  }
  return 'Kitchen';
}

export const STANDARD_POS_MENU_TEMPLATE: Array<{
  name: string;
  section: PosSection;
  category: string;
  priceNgn: number;
  costNgn: number;
  prepMinutes: number;
}> = [
  { name: 'Fried Rice', section: 'Kitchen', category: 'Lunch', priceNgn: 3000, costNgn: 1400, prepMinutes: 15 },
  { name: 'Jollof Rice', section: 'Kitchen', category: 'Lunch', priceNgn: 3000, costNgn: 1400, prepMinutes: 15 },
  { name: 'Plain Rice', section: 'Kitchen', category: 'Lunch', priceNgn: 2000, costNgn: 900, prepMinutes: 10 },
  { name: 'Fried Plantain', section: 'Kitchen', category: 'Breakfast', priceNgn: 1500, costNgn: 700, prepMinutes: 10 },
  { name: 'Grilled Chicken', section: 'Kitchen', category: 'Dinner', priceNgn: 5000, costNgn: 2500, prepMinutes: 20 },
  { name: 'Chicken Stew', section: 'Kitchen', category: 'Lunch', priceNgn: 4000, costNgn: 1900, prepMinutes: 15 },
  { name: 'Beef Stew', section: 'Kitchen', category: 'Dinner', priceNgn: 4500, costNgn: 2200, prepMinutes: 15 },
  { name: 'Fish Pepper Soup', section: 'Kitchen', category: 'Dinner', priceNgn: 5000, costNgn: 2400, prepMinutes: 20 },
  { name: 'Vegetable Soup', section: 'Kitchen', category: 'Lunch', priceNgn: 3500, costNgn: 1600, prepMinutes: 15 },
  { name: 'Egusi Soup', section: 'Kitchen', category: 'Lunch', priceNgn: 3500, costNgn: 1600, prepMinutes: 15 },
  { name: 'Pounded Yam', section: 'Kitchen', category: 'Dinner', priceNgn: 3000, costNgn: 1200, prepMinutes: 15 },
  { name: 'Amala', section: 'Kitchen', category: 'Dinner', priceNgn: 3000, costNgn: 1200, prepMinutes: 15 },
  { name: 'French Fries', section: 'Food & Beverage', category: 'Snacks', priceNgn: 2000, costNgn: 850, prepMinutes: 10 },
  { name: 'Spring Rolls', section: 'Food & Beverage', category: 'Snacks', priceNgn: 1500, costNgn: 650, prepMinutes: 8 },
  { name: 'Meat Pie', section: 'Food & Beverage', category: 'Snacks', priceNgn: 1500, costNgn: 650, prepMinutes: 5 },
  { name: 'Samosa', section: 'Food & Beverage', category: 'Snacks', priceNgn: 1500, costNgn: 650, prepMinutes: 8 },
  { name: 'Fresh Juice', section: 'Food & Beverage', category: 'Drinks', priceNgn: 1500, costNgn: 600, prepMinutes: 5 },
  { name: 'Soft Drink', section: 'Food & Beverage', category: 'Drinks', priceNgn: 1000, costNgn: 450, prepMinutes: 2 },
  { name: 'Water 50cl', section: 'Food & Beverage', category: 'Drinks', priceNgn: 500, costNgn: 200, prepMinutes: 2 },
  { name: 'Chapman', section: 'Food & Beverage', category: 'Drinks', priceNgn: 1500, costNgn: 650, prepMinutes: 5 },
];

export const POS_MENU_ITEMS: PosMenuItem[] = [];

export const ROLE_LABELS: Record<StaffRole, string> = {
  pch_admin: 'PCH Super Admin',
  property_admin: 'Property Admin (GM)',
  front_desk: 'Front Desk & Reservations',
  housekeeping: 'Housekeeping Lead',
  fnb_kitchen: 'Restaurant POS & Kitchen',
  accountant: 'Finance & Payroll Officer',
  maintenance: 'Engineering & Maintenance',
};

export const ASSIGNABLE_ROLE_LABELS: Record<AssignablePropertyRole, string> = {
  property_admin: 'Property Admin (GM)',
  front_desk: 'Front Desk & Reservations',
  housekeeping: 'Housekeeping Lead',
  fnb_kitchen: 'Restaurant POS & Kitchen',
  accountant: 'Finance & Payroll Officer',
  maintenance: 'Engineering & Maintenance',
  unassigned: 'Unassigned (No Role)',
};

export const PROPERTY_PRIVILEGE_OPTIONS: Array<{
  id: NavSectionId;
  label: string;
  group: string;
}> = [
  { id: 'dashboard', label: 'Executive Dashboard', group: 'Operations' },
  { id: 'reservations', label: 'Reservations', group: 'Operations' },
  { id: 'calendar', label: 'Calendar & Blocks', group: 'Operations' },
  { id: 'arrivals', label: 'Arrivals', group: 'Operations' },
  { id: 'in_house', label: 'In-House Guests', group: 'Operations' },
  { id: 'walk_in', label: 'Walk-In Check-In', group: 'Operations' },
  { id: 'front_desk', label: 'Front Desk & Folios', group: 'Operations' },
  { id: 'invoices', label: 'Invoices & Receipts', group: 'Operations' },
  { id: 'rooms', label: 'Rooms & Rates', group: 'Operations' },
  { id: 'guests', label: 'Guest Profiles', group: 'Operations' },
  { id: 'housekeeping', label: 'Housekeeping', group: 'Operations' },
  { id: 'messages', label: 'Messages & Alerts', group: 'Operations' },
  { id: 'pos_kitchen', label: 'Restaurant POS & KDS', group: 'Food & Supply' },
  { id: 'inventory', label: 'Store Inventory', group: 'Food & Supply' },
  { id: 'procurement', label: 'Procurement & POs', group: 'Food & Supply' },
  { id: 'accounting', label: 'Accounting Ledger', group: 'Finance & HR' },
  { id: 'reports', label: 'Financial Reports', group: 'Finance & HR' },
  { id: 'staff', label: 'Staff, Users & Performance', group: 'Finance & HR' },
  { id: 'shifts_attendance', label: 'Shifts & Attendance', group: 'Finance & HR' },
  { id: 'shift_daily_report', label: 'Shift Daily Report', group: 'Operations' },
  { id: 'payroll', label: 'Monthly Payroll', group: 'Finance & HR' },
  { id: 'maintenance', label: 'Maintenance', group: 'Finance & HR' },
  { id: 'user_management', label: 'User Management', group: 'Admin' },
  { id: 'staff_sessions', label: 'Staff Sessions & Links', group: 'Admin' },
  { id: 'ota_channels', label: 'Channel Manager & iCal', group: 'Admin' },
  { id: 'licensing', label: 'Software Licensing', group: 'Admin' },
  { id: 'profile', label: 'Property Profile', group: 'Admin' },
  { id: 'training_help', label: 'Docs & Help', group: 'Support' },
];

export const ADMIN_ONLY_SECTIONS: NavSectionId[] = [
  'accounting',
  'reports',
  'payroll',
  'staff',
  'user_management',
  'staff_sessions',
  'licensing',
  'properties_admin',
  'rbac_audit',
  'cms',
  'deployment',
];

export const ROLE_ALLOWED_SECTIONS: Record<StaffRole, NavSectionId[]> = {
  pch_admin: [
    'dashboard',
    'rooms',
    'calendar',
    'reservations',
    'arrivals',
    'in_house',
    'walk_in',
    'front_desk',
    'invoices',
    'guests',
    'housekeeping',
    'pos_kitchen',
    'accounting',
    'reports',
    'shift_daily_report',
    'inventory',
    'procurement',
    'staff',
    'user_management',
    'staff_sessions',
    'shifts_attendance',
    'payroll',
    'maintenance',
    'ota_channels',
    'messages',
    'training_help',
    'properties_admin',
    'licensing',
    'rbac_audit',
    'deployment',
    'profile',
    'cms',
  ],
  property_admin: [
    'dashboard',
    'rooms',
    'calendar',
    'reservations',
    'arrivals',
    'in_house',
    'walk_in',
    'front_desk',
    'invoices',
    'guests',
    'housekeeping',
    'pos_kitchen',
    'accounting',
    'reports',
    'shift_daily_report',
    'inventory',
    'procurement',
    'staff',
    'user_management',
    'staff_sessions',
    'shifts_attendance',
    'payroll',
    'maintenance',
    'ota_channels',
    'messages',
    'training_help',
    'licensing',
    'profile',
  ],
  front_desk: ['dashboard', 'rooms', 'calendar', 'reservations', 'arrivals', 'in_house', 'walk_in', 'front_desk', 'invoices', 'guests', 'housekeeping', 'pos_kitchen', 'shifts_attendance', 'shift_daily_report', 'messages', 'training_help', 'profile'],
  housekeeping: ['dashboard', 'rooms', 'calendar', 'housekeeping', 'maintenance', 'inventory', 'shifts_attendance', 'shift_daily_report', 'messages', 'training_help', 'profile'],
  fnb_kitchen: ['dashboard', 'pos_kitchen', 'inventory', 'procurement', 'shifts_attendance', 'shift_daily_report', 'messages', 'training_help', 'profile'],
  accountant: ['dashboard', 'inventory', 'procurement', 'shifts_attendance', 'shift_daily_report', 'messages', 'training_help', 'profile'],
  maintenance: ['dashboard', 'rooms', 'calendar', 'maintenance', 'inventory', 'shifts_attendance', 'shift_daily_report', 'messages', 'training_help', 'profile'],
};

export function getRoomSection(room: Pick<RoomRecord, 'section' | 'roomNumber' | 'roomType'>): RoomSection {
  if (room.section === 'Serviced Apartment' || room.section === 'Hotel Rooms') {
    return room.section;
  }
  const num = room.roomNumber.toUpperCase();
  if (
    num === 'RM-1' ||
    num === 'RM-2' ||
    num === 'RM-3' ||
    room.roomType.toLowerCase().includes('kitchenette') ||
    room.roomType.toLowerCase().includes('apartment')
  ) {
    return 'Serviced Apartment';
  }
  return 'Hotel Rooms';
}

export function sortRoomsByNumber<T extends Pick<RoomRecord, 'roomNumber'>>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export function formatNgn(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const hasDecimals = Math.abs(safe - Math.trunc(safe)) > 0.0001;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 4,
  }).format(safe);
}

export function formatPriceInputWithCommas(rawOrNumber: string | number): string {
  const raw =
    typeof rawOrNumber === 'number'
      ? Number.isFinite(rawOrNumber)
        ? String(rawOrNumber)
        : ''
      : String(rawOrNumber ?? '');
  if (!raw) return '';
  let sanitized = raw.replace(/[^0-9.]/g, '');
  const firstDot = sanitized.indexOf('.');
  if (firstDot !== -1) {
    sanitized =
      sanitized.slice(0, firstDot + 1) +
      sanitized.slice(firstDot + 1).replace(/\./g, '');
  }
  const hasDot = firstDot !== -1;
  const [intRaw = '', decRaw = ''] = sanitized.split('.');
  if (!intRaw && !hasDot) return '';
  const normalizedInt = intRaw === '' ? '0' : intRaw.replace(/^0+(?=\d)/, '');
  const formattedInt = normalizedInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return hasDot ? `${formattedInt}.${decRaw}` : formattedInt;
}

export function parseFormattedPriceInput(raw: string): number | null {
  const cleaned = String(raw ?? '').replace(/,/g, '').trim();
  if (!cleaned || cleaned === '.') return null;
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export const DEFAULT_USD_RATE_NGN = 1580;

export function formatUsd(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function convertNgnToUsd(amountNgn: number, rateNgnPerUsd?: number): number {
  const rate = rateNgnPerUsd && rateNgnPerUsd > 0 ? rateNgnPerUsd : DEFAULT_USD_RATE_NGN;
  return (Number.isFinite(amountNgn) ? amountNgn : 0) / rate;
}

export function getFxRateToNgn(currency: ChannelCurrency, rateNgnPerUsd?: number): number {
  if (currency === 'NGN') return 1;
  const usdRate = rateNgnPerUsd && rateNgnPerUsd > 0 ? rateNgnPerUsd : DEFAULT_USD_RATE_NGN;
  if (currency === 'USD') return Math.round(usdRate);
  if (currency === 'EUR') return Math.round(usdRate * 1.08);
  if (currency === 'GBP') return Math.round(usdRate * 1.27);
  return 1;
}

export function convertCurrencyToNgn(
  amount: number,
  currency: ChannelCurrency,
  rateNgnPerUsd?: number
): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (currency === 'NGN') return Math.round(safeAmount);
  return Math.round(safeAmount * getFxRateToNgn(currency, rateNgnPerUsd));
}

export function formatChannelCurrency(
  amount: number,
  currency: ChannelCurrency = 'NGN',
  decimals?: number
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (currency === 'NGN') return formatNgn(safeAmount);
  const dec = typeof decimals === 'number' ? decimals : 2;
  const locale = currency === 'GBP' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(safeAmount);
}

const ROOT_DOMAIN_STORAGE_KEY = 'pch_connected_root_domain';

export function isPlatformPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  const hostedPreviewSuffix = ['.web', 'app'].join('.');
  const altPreviewSuffix = ['.firebase', 'app', '.com'].join('');
  return (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.pages.dev') ||
    host.endsWith(hostedPreviewSuffix) ||
    host.endsWith(altPreviewSuffix) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  );
}

export function extractApexDomain(hostname: string): string | null {
  const host = hostname.toLowerCase().trim().replace(/:\d+$/, '');
  if (isPlatformPreviewHost(host)) return null;
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) return host;
  // Handle common second-level TLDs like .com.ng / .co.uk
  const sldCandidates = new Set(['com', 'co', 'org', 'net', 'gov', 'edu']);
  if (parts.length >= 3 && parts[parts.length - 1].length === 2 && sldCandidates.has(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

export function getConnectedRootDomain(): string {
  if (typeof window !== 'undefined') {
    const detected = extractApexDomain(window.location.hostname);
    if (detected) return detected;
    try {
      const saved = window.localStorage.getItem(ROOT_DOMAIN_STORAGE_KEY);
      if (saved && saved.includes('.')) return saved.toLowerCase().trim();
    } catch {
      // ignore storage errors
    }
  }
  return 'pchpms.com';
}

export function saveConnectedRootDomain(domain: string): string {
  const cleaned = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  const valid = cleaned.includes('.') ? cleaned : 'pchpms.com';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ROOT_DOMAIN_STORAGE_KEY, valid);
    } catch {
      // ignore storage errors
    }
  }
  return valid;
}

export function normalizeSubdomainSlug(rawSlug: string): string {
  return rawSlug
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('.')[0]
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function getPropertySubdomainSlug(
  property?: Pick<PropertyRecord, 'id' | 'code' | 'name' | 'subdomainSlug'> | null
): string {
  if (!property) return 'richgates';
  if (property.subdomainSlug && property.subdomainSlug.trim()) {
    const clean = normalizeSubdomainSlug(property.subdomainSlug);
    if (clean) return clean;
  }
  if (
    property.id === 'prop_richgates_enugu' ||
    property.id === 'richgates-enugu' ||
    property.code === 'RG-ENU-01' ||
    property.name.toLowerCase().includes('richgates')
  ) {
    return 'richgates';
  }
  const slug = property.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || property.code.toLowerCase().replace(/[^a-z0-9]/g, '') || 'property';
}

export function extractPropertySubdomainSlug(hostname: string): string | null {
  const host = hostname.toLowerCase().trim().replace(/:\d+$/, '');
  if (!host || isPlatformPreviewHost(host)) return null;
  if (host.startsWith('admin.') || host.startsWith('pch.') || host.startsWith('superadmin.')) {
    return null;
  }
  const apex = extractApexDomain(host);
  if (!apex || host === apex) return null;
  const sub = host.slice(0, -(apex.length + 1)).split('.')[0];
  if (!sub || sub === 'www' || sub === 'app' || sub === 'admin' || sub === 'pch' || sub === 'superadmin') {
    return null;
  }
  return sub;
}

export type HostPortalKind = 'public_marketing' | 'super_admin' | 'tenant_subdomain' | 'preview';

export function getHostPortalContext(hostname?: string): {
  kind: HostPortalKind;
  tenantSlug: string | null;
  apexDomain: string | null;
} {
  const rawHost =
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  const host = rawHost.toLowerCase().trim().replace(/:\d+$/, '');
  if (!host || isPlatformPreviewHost(host)) {
    return { kind: 'preview', tenantSlug: null, apexDomain: null };
  }
  const apex = extractApexDomain(host);
  if (
    host === 'app.pchpms.com' ||
    host === 'pchpms.com' ||
    host === 'www.pchpms.com' ||
    host === 'app.pchmps.com' ||
    host === 'pchmps.com' ||
    host === 'www.pchmps.com'
  ) {
    return { kind: 'public_marketing', tenantSlug: null, apexDomain: apex || 'pchpms.com' };
  }
  if (
    host === `admin.${apex}` ||
    host === `pch.${apex}` ||
    host === `superadmin.${apex}` ||
    host.startsWith('admin.') ||
    host.startsWith('pch.') ||
    host.startsWith('superadmin.')
  ) {
    return { kind: 'super_admin', tenantSlug: null, apexDomain: apex };
  }
  if (
    host === apex ||
    host === `www.${apex}` ||
    host === `app.${apex}` ||
    host.startsWith('app.') ||
    host.startsWith('www.')
  ) {
    return { kind: 'public_marketing', tenantSlug: null, apexDomain: apex };
  }
  const tenantSlug = extractPropertySubdomainSlug(host);
  if (tenantSlug) {
    return { kind: 'tenant_subdomain', tenantSlug, apexDomain: apex };
  }
  return { kind: 'public_marketing', tenantSlug: null, apexDomain: apex };
}

export interface SubdomainLinkItem {
  id: string;
  label: string;
  description: string;
  url: string;
  portal: PortalMode;
  propertyId?: string;
}

export function buildAllSubdomainLinks(
  rootDomain: string,
  properties: Array<Pick<PropertyRecord, 'id' | 'code' | 'name' | 'subdomainSlug'>>
): SubdomainLinkItem[] {
  const domain = rootDomain.toLowerCase().trim() || 'pchpms.com';
  const items: SubdomainLinkItem[] = [
    {
      id: 'sub-home',
      label: 'Public PCHPMS Website',
      description: 'Public marketing website, USD pricing plans & contact desk',
      url: `https://app.${domain}`,
      portal: 'home',
    },
    {
      id: 'sub-pch-admin',
      label: 'PCH Super Admin Console',
      description: 'Multi-client SaaS control plane, licensing, subdomains & provisioning',
      url: `https://admin.${domain}`,
      portal: 'pch-admin',
    },
  ];

  for (const prop of properties) {
    const slug = getPropertySubdomainSlug(prop);
    items.push(
      {
        id: `sub-prop-admin-${prop.id}`,
        label: `${prop.name} · Private Property Dashboard`,
        description: 'Property admin dashboard, rooms, folios, staff & reports',
        url: `https://${slug}.${domain}`,
        portal: 'richgates-admin',
        propertyId: prop.id,
      },
      {
        id: `sub-prop-staff-${prop.id}`,
        label: `${prop.name} · Staff Portal`,
        description: 'Front Desk, Housekeeping, POS & Kitchen, Maintenance',
        url: `https://${slug}.${domain}/staff`,
        portal: 'staff',
        propertyId: prop.id,
      }
    );
  }

  return items;
}

export function getPortalUrl(
  portal: PortalMode | 'admin' | 'richgates',
  property?: Pick<PropertyRecord, 'id' | 'code' | 'name' | 'subdomainSlug'> | null
): string {
  if (typeof window === 'undefined') {
    if (portal === 'home') return '/home';
    if (portal === 'staff') return '/staff';
    if (portal === 'pch-admin') return '/pch-admin';
    return '/admin';
  }
  const host = window.location.hostname.toLowerCase();
  const slug = getPropertySubdomainSlug(property);
  const apex = extractApexDomain(host);

  if (apex) {
    const proto = window.location.protocol || 'https:';
    if (portal === 'home') {
      return `${proto}//app.${apex}`;
    }
    if (portal === 'pch-admin') {
      return `${proto}//admin.${apex}`;
    }
    if (portal === 'staff') {
      return `${proto}//${slug}.${apex}/staff`;
    }
    return `${proto}//${slug}.${apex}`;
  }

  if (portal === 'home') {
    return `${window.location.origin}/home`;
  }
  if (portal === 'staff') {
    return `${window.location.origin}/login`;
  }
  if (portal === 'pch-admin') {
    return `${window.location.origin}/pch-admin`;
  }
  return `${window.location.origin}/admin`;
}

export interface PlanInquiryRecord {
  id: string;
  referenceCode: string;
  inquiryType: 'plan_purchase' | 'contact_demo';
  plan: LicenseRecord['plan'] | 'Custom';
  billingCycle: LicenseRecord['billingCycle'] | 'n/a';
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
  status: 'new' | 'contacted' | 'provisioned';
  createdAtIso: string;
}

export interface CmsPageCopy {
  navLabel: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
}

export interface CmsBrandCopy {
  pchPortalName: string;
  richgatesPortalName: string;
  pchRoleSubtitle: string;
  richgatesAdminSubtitle: string;
  richgatesStaffSubtitle: string;
  portalLinksButton: string;
  announcementBanner: string;
  checkInPolicyNote: string;
  folioFooterNote: string;
}

export interface CmsLoginCopy {
  richgatesHeroKicker: string;
  richgatesHeroTitle: string;
  richgatesHeroDesc: string;
  staffHeroKicker: string;
  staffHeroTitle: string;
  staffHeroDesc: string;
  pchHeroKicker: string;
  pchHeroTitle: string;
  pchHeroDesc: string;
  richgatesSignInTitle: string;
  richgatesSignInSubtitle: string;
  staffSignInTitle: string;
  staffSignInSubtitle: string;
  pchSignInTitle: string;
  pchSignInSubtitle: string;
  signInLinksHeading: string;
}

export interface CmsDashboardCopy {
  reservationsLedgerTitle: string;
  reservationsLedgerSubtitle: string;
  roomOverviewTitle: string;
  scheduleTitle: string;
  servicedSectionTitle: string;
  servicedSectionSubtitle: string;
  hotelSectionTitle: string;
  hotelSectionSubtitle: string;
  quickWalkInLabel: string;
  quickReservationsLabel: string;
  quickArrivalsLabel: string;
  quickInHouseLabel: string;
  quickFrontDeskLabel: string;
  quickCalendarLabel: string;
  quickChannelManagerLabel: string;
}

export interface CmsContent {
  brand: CmsBrandCopy;
  login: CmsLoginCopy;
  dashboard: CmsDashboardCopy;
  pages: Record<NavSectionId, CmsPageCopy>;
  updatedByEmail?: string;
}

export const DEFAULT_CMS_CONTENT: CmsContent = {
  brand: {
    pchPortalName: 'PCH PMS',
    richgatesPortalName: 'Richgates PMS',
    pchRoleSubtitle: 'PCH Super Admin',
    richgatesAdminSubtitle: 'Richgates Property Admin',
    richgatesStaffSubtitle: 'Richgates Staff Ops',
    portalLinksButton: 'Portal Links',
    announcementBanner: '',
    checkInPolicyNote:
      'All guest check-ins must confirm payment, assign a room, verify government ID, and issue room key before completion.',
    folioFooterNote:
      'Thank you for choosing Richgates Apartments, Enugu. Official NGN receipt issued at Front Desk.',
  },
  login: {
    richgatesHeroKicker: 'Serviced Apartments & Hotel Rooms',
    richgatesHeroTitle: 'Richgates Apartments, Enugu',
    richgatesHeroDesc:
      'Manage room reservations, arrivals, in-house folios, nightly Naira rates, availability calendar blocks, and iCal booking channels.',
    staffHeroKicker: 'Department Staff Workspace',
    staffHeroTitle: 'Richgates Apartments Staff Operations',
    staffHeroDesc:
      'Dedicated staff sign-in for Front Desk folios, Housekeeping dispatch, Restaurant POS & Kitchen, Accounts, and Engineering.',
    pchHeroKicker: 'Central Management Console',
    pchHeroTitle: 'PCH PMS Multi-Property Administration',
    pchHeroDesc:
      'Manage multi-property portfolios, software licensing keys, role-based access, and platform audit logs.',
    richgatesSignInTitle: 'Richgates Admin sign-in',
    richgatesSignInSubtitle: 'Sign in with your Richgates Apartments property administrator account.',
    staffSignInTitle: 'Richgates Staff sign-in',
    staffSignInSubtitle: 'Sign in with your verified Richgates staff account.',
    pchSignInTitle: 'PCH Super Admin sign-in',
    pchSignInSubtitle: 'Sign in with your PCH multi-property administrator account.',
    signInLinksHeading: 'SIGN-IN LINKS',
  },
  dashboard: {
    reservationsLedgerTitle: 'Reservations',
    reservationsLedgerSubtitle:
      'Guest name, room assignment, room type, stay dates, occupancy, booking source, folio balances, payment & reservation status, date booked, and actions',
    roomOverviewTitle: 'Room Overview',
    scheduleTitle: "Today's Schedule",
    servicedSectionTitle: 'Serviced Apartment Section',
    servicedSectionSubtitle: 'Self-contained studios and rooms equipped with fitted kitchenettes',
    hotelSectionTitle: 'Hotel Rooms Section',
    hotelSectionSubtitle: 'Individual executive studios and one-bedroom hospitality rooms',
    quickWalkInLabel: 'Walk-in Check-in',
    quickReservationsLabel: 'Reservations',
    quickArrivalsLabel: 'Arrivals',
    quickInHouseLabel: 'In-House',
    quickFrontDeskLabel: 'Front Desk & Folios',
    quickCalendarLabel: 'Calendar',
    quickChannelManagerLabel: 'Channel Manager',
  },
  pages: {
    dashboard: {
      navLabel: 'Dashboard',
      title: 'Property Operations Dashboard',
      subtitle: 'Live occupancy, reservations overview, room availability, and daily schedule',
      ctaLabel: 'Reservations',
    },
    reservations: {
      navLabel: 'Reservations',
      title: 'Reservations',
      subtitle:
        'Manage bookings, assign rooms, verify payment & payment status, track check-in/out dates, and execute front desk actions',
      ctaLabel: 'New Reservation',
    },
    calendar: {
      navLabel: 'Calendar',
      title: 'Availability Calendar, Search & Date Blocking',
      subtitle:
        'Search stays or available rooms by date range, place owner/maintenance date blocks, or click any open date cell to book.',
      ctaLabel: 'Block Room Dates',
    },
    arrivals: {
      navLabel: 'Arrivals',
      title: 'Arrivals',
      subtitle: 'Confirmed and pending reservations awaiting front desk verification and check-in',
      ctaLabel: 'New Reservation',
    },
    in_house: {
      navLabel: 'In-House',
      title: 'In-House Guests',
      subtitle: 'Currently checked-in guests, live room folios, room changes, extensions, and departures due',
      ctaLabel: 'New Reservation',
    },
    walk_in: {
      navLabel: 'Walk-in Check-in',
      title: 'Walk-in Check-in',
      subtitle: 'Register walk-in guest KYC details, assign an available room, and check in immediately',
      ctaLabel: 'View In-House Guests',
    },
    front_desk: {
      navLabel: 'Front Desk & Folios',
      title: 'Front Desk Operations & Guest Folios',
      subtitle: 'Active stays, room charges, POS postings, folio payments, and check-out settlements',
      ctaLabel: 'New Reservation',
    },
    invoices: {
      navLabel: 'Invoices & Receipts',
      title: 'Guest Invoices & Folio Receipts',
      subtitle: 'Search, preview, print, and download itemized NGN & FX guest stay invoices',
      ctaLabel: 'Download PDF',
    },
    rooms: {
      navLabel: 'Rooms',
      title: 'Rooms, Rates & Photo Gallery',
      subtitle:
        'Browse room galleries, view amenities, update nightly Naira rates, and manage room availability',
      ctaLabel: 'Sync Official Rates',
    },
    guests: {
      navLabel: 'Guest Profiles',
      title: 'Guest Profiles & KYC Directory',
      subtitle: 'Click any guest row to view full guest profile, contact details, KYC, and stay history',
      ctaLabel: 'Register Guest',
    },
    housekeeping: {
      navLabel: 'Housekeeping',
      title: 'Housekeeping Dispatch & Room Readiness',
      subtitle: 'Live turnover schedule, attendant assignments, and room inspection workflow',
      ctaLabel: 'Assign Housekeeping Task',
    },
    pos_kitchen: {
      navLabel: 'Restaurant POS & KDS',
      title: 'Restaurant POS & Kitchen Display System (KDS)',
      subtitle:
        'Create dine-in, bar, or room-service tickets in Nigerian Naira (7.5% VAT), post directly to occupied Room Folios, and track live kitchen preparation.',
      ctaLabel: 'Send Order to Kitchen',
    },
    accounting: {
      navLabel: 'Payments',
      title: 'Payments & Accounting Ledger (Nigerian Naira ₦)',
      subtitle: 'Real-time double-linked journal across Room Settlements, Restaurant POS, Procurement & Payroll',
      ctaLabel: 'Post Journal Entry',
    },
    reports: {
      navLabel: 'Reports',
      title: 'Admin Management Reports & Analytics',
      subtitle: 'Real-time executive analytics covering P&L, occupancy, ADR, RevPAR, booking sources, POS sales, departments, inventory, and staff performance',
      ctaLabel: 'Export PDF',
    },
    inventory: {
      navLabel: 'Store Inventory',
      title: 'Central Store Inventory Control',
      subtitle: 'Live stock quantities, reorder thresholds, and automated PO-to-Ledger receiving',
      ctaLabel: 'Add Inventory Item',
    },
    procurement: {
      navLabel: 'Procurement & POs',
      title: 'Procurement & Supplier Purchase Orders',
      subtitle: 'Live stock quantities, reorder thresholds, and automated PO-to-Ledger receiving',
      ctaLabel: 'New Purchase Order',
    },
    staff: {
      navLabel: 'Staff & Performance',
      title: 'Staff, User Accounts & Performance',
      subtitle: 'Create user accounts, assign roles & privileges, manage staff records, and review performance metrics',
      ctaLabel: 'Onboard Staff Member',
    },
    user_management: {
      navLabel: 'User Management',
      title: 'User Management, Roles & Privileges',
      subtitle: 'Create property user accounts, assign or unassign roles, manage module privileges, and inspect staff performance',
      ctaLabel: 'Create User Account',
    },
    staff_sessions: {
      navLabel: 'Staff Sessions & Links',
      title: 'Employee Login Monitor & Portal Links',
      subtitle: 'Monitor active employee logins, logout timestamps, assigned roles, and share Staff (/login) & Admin (/admin) portal links',
      ctaLabel: 'Broadcast Login Link',
    },
    shifts_attendance: {
      navLabel: 'Shifts & Attendance',
      title: 'Shift Roster & Daily Attendance',
      subtitle: 'Assign morning/afternoon/night duty rosters and record real-time clock-ins',
      ctaLabel: 'Export Shift PDF',
    },
    shift_daily_report: {
      navLabel: 'Shift Daily Report',
      title: 'Employee Shift Daily Report',
      subtitle: 'Printable daily operational shift handover summary for check-ins, departures, housekeeping, kitchen tickets, and attendance',
      ctaLabel: 'Print Shift Report',
    },
    payroll: {
      navLabel: 'Monthly Payroll',
      title: 'Monthly Payroll & Employee Salaries',
      subtitle: 'View individual monthly employee salaries, deductions, net take-home pay, pay dates, and payment history',
      ctaLabel: 'Run & Post Monthly Payroll',
    },
    maintenance: {
      navLabel: 'Maintenance',
      title: 'Engineering & Preventive Maintenance',
      subtitle: 'Facility work orders, generator & inverter servicing, and room out-of-order controls',
      ctaLabel: 'Log Maintenance Ticket',
    },
    ota_channels: {
      navLabel: 'Channel Manager & iCal',
      title: 'Channel Manager & iCal Links',
      subtitle:
        'Connect channels with inbound iCal (.ics) links, export room calendars, import CSVs, and sync OTA bookings in real time',
      ctaLabel: 'Add Channel / iCal Link',
    },
    properties_admin: {
      navLabel: 'Multi-Property Admin',
      title: 'Multi-Property Administration',
      subtitle: 'Central portfolio administration across hospitality properties',
      ctaLabel: 'Add New Property',
    },
    licensing: {
      navLabel: 'Software Licensing',
      title: 'Centralized PureCrest Software Licensing & Activation',
      subtitle: 'Generate, activate, and enforce property-bound Lifetime and Subscription license keys',
      ctaLabel: 'Generate License Key',
    },
    rbac_audit: {
      navLabel: 'RBAC & Audit Logs',
      title: 'Role-Based Access Control & Audit Trail',
      subtitle: 'Authorized user emails, portal role matrix, and immutable chronological audit logs',
      ctaLabel: 'Authorize User Email',
    },
    messages: {
      navLabel: 'Messages & Alerts',
      title: 'Inter-Departmental Messaging & Staff Broadcasts',
      subtitle:
        'Send direct department handovers, urgent operational alerts, and bulk messages to staff across all property teams.',
      ctaLabel: 'New Message',
    },
    training_help: {
      navLabel: 'Docs, Training & Help',
      title: 'PMS Documentation, Video Training & Help Desk',
      subtitle:
        'Interactive video walkthroughs, standard operating procedures, and direct support contacts for every department.',
      ctaLabel: 'Watch Training',
    },
    deployment: {
      navLabel: 'Cloudflare Deploy',
      title: 'Cloudflare Edge Deployment & Portal Links',
      subtitle: 'Direct portal links and Cloudflare Pages edge deployment configuration',
      ctaLabel: 'Copy Link',
    },
    profile: {
      navLabel: 'Settings',
      title: 'Settings & Property Profile',
      subtitle: 'Manage your signed-in operator details and official property contact profile',
      ctaLabel: 'Update Property Info',
    },
    cms: {
      navLabel: 'App CMS & Text Editor',
      title: 'PCH Super Admin CMS — Edit All Pages & App Copy',
      subtitle:
        'Customize page titles, navigation labels, login pages, dashboard headings, and operational notices across the entire application.',
      ctaLabel: 'Publish CMS Changes',
    },
  },
};

