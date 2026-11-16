export type PortalMode = 'pch-admin' | 'richgates-admin' | 'staff';

export type StaffRole =
  | 'pch_admin'
  | 'property_admin'
  | 'front_desk'
  | 'housekeeping'
  | 'fnb_kitchen'
  | 'accountant'
  | 'maintenance';

export type NavSectionId =
  | 'dashboard'
  | 'rooms'
  | 'calendar'
  | 'reservations'
  | 'front_desk'
  | 'guests'
  | 'housekeeping'
  | 'pos_kitchen'
  | 'accounting'
  | 'reports'
  | 'inventory'
  | 'procurement'
  | 'staff'
  | 'shifts_attendance'
  | 'payroll'
  | 'maintenance'
  | 'ota_channels'
  | 'properties_admin'
  | 'licensing'
  | 'rbac_audit'
  | 'deployment';

export type RoomSection = 'Serviced Apartment' | 'Hotel Rooms';

export const RICHGATES_EXTERIOR_IMAGE =
  '/assets/aistudio/file_000000003fc881f4b5e66b7352a17edc_c7ca46a2.png';

export const RICHGATES_GALLERY_ASSETS: Array<{
  id: string;
  label: string;
  url: string;
}> = [
  {
    id: 'rg-kitchenette-studio',
    label: 'Serviced Studio Lounge & Kitchenette',
    url: '/assets/aistudio/IMG_1945_d08c4168.webp',
  },
  {
    id: 'rg-suite-living',
    label: 'One Bedroom Suite Living Area',
    url: '/assets/aistudio/B8CC7C05-AC7B-438D-B422-4033B0713BA1_f0334307.png',
  },
  {
    id: 'rg-deluxe-bedroom',
    label: 'Deluxe Studio Bedroom Suite',
    url: '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png',
  },
  {
    id: 'rg-tufted-bedroom',
    label: 'Standard Studio King Bed Detail',
    url: '/assets/aistudio/IMG_1819_00d6cdc5.jpeg',
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
    imageUrl: '/assets/aistudio/IMG_1945_d08c4168.webp',
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
    imageUrl: '/assets/aistudio/B8CC7C05-AC7B-438D-B422-4033B0713BA1_f0334307.png',
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
    imageUrl: '/assets/aistudio/IMG_1945_d08c4168.webp',
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
    imageUrl: '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png',
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
    imageUrl: '/assets/aistudio/IMG_1819_00d6cdc5.jpeg',
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
    imageUrl: '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png',
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
    imageUrl: '/assets/aistudio/IMG_1819_00d6cdc5.jpeg',
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
    imageUrl: '/assets/aistudio/B8CC7C05-AC7B-438D-B422-4033B0713BA1_f0334307.png',
    amenities: ['Separate Parlour', 'King Bedroom Suite', 'Dining Bar', 'VIP Room Service'],
  },
];

export interface PropertyRecord {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  country: string;
  address: string;
  phone?: string;
  email?: string;
  currency: 'NGN';
  roomCount: number;
  status: 'active' | 'onboarding' | 'suspended';
  licenseKey?: string;
  licensePlan?: 'Starter' | 'Professional' | 'Enterprise' | 'Lifetime Sovereign';
  adminEmail: string;
  authorizedEmails: string[];
  ownerUid: string;
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
  amenities?: string[];
  authorizedEmails: string[];
  ownerUid: string;
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
  nationality?: string;
  idType: 'NIN' | 'International Passport' | 'Driver License' | 'Voter Card';
  idNumber?: string;
  vipTier: 'Standard' | 'Silver' | 'Gold' | 'Diplomatic';
  totalStays: number;
  lifetimeSpendNgn: number;
  notes?: string;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface ReservationRecord {
  id: string;
  propertyId: string;
  bookingRef: string;
  roomId: string;
  roomNumber: string;
  guestId?: string;
  guestName: string;
  guestPhone?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  channel: 'Direct Walk-In' | 'Direct Web' | 'Booking.com' | 'Airbnb' | 'Expedia' | 'Hotels.ng';
  nightlyRateNgn: number;
  roomChargesNgn: number;
  posChargesNgn: number;
  paidNgn: number;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  paymentMethod: 'Bank Transfer' | 'Card POS' | 'Cash NGN' | 'Corporate Invoice' | 'Online Gateway';
  authorizedEmails: string[];
  ownerUid: string;
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
  serviceType: 'Dine-In' | 'Room Service' | 'Bar Lounge' | 'Takeaway';
  tableOrRoom: string;
  reservationId?: string;
  itemsSummary: string;
  itemCount: number;
  subtotalNgn: number;
  vatNgn: number;
  totalNgn: number;
  paymentStatus: 'paid' | 'room_folio' | 'unpaid';
  paymentMethod: 'Room Folio' | 'Card POS' | 'Bank Transfer' | 'Cash NGN';
  kitchenStatus: 'queued' | 'preparing' | 'ready' | 'served';
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

export interface ShiftScheduleRecord {
  id: string;
  propertyId: string;
  staffId: string;
  staffName: string;
  department: string;
  shiftDate: string;
  shiftWindow: 'Morning (07:00 - 15:00)' | 'Afternoon (15:00 - 23:00)' | 'Night (23:00 - 07:00)';
  status: 'scheduled' | 'completed' | 'missed';
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

export interface OtaIntegrationRecord {
  id: string;
  propertyId: string;
  channelName: 'Booking.com' | 'Airbnb' | 'Expedia' | 'Hotels.ng' | 'Direct Website Engine';
  propertyListingId: string;
  commissionPct: number;
  autoSync: boolean;
  connected: boolean;
  lastSyncedIso: string;
  bookingsImported: number;
  authorizedEmails: string[];
  ownerUid: string;
}

export interface PosMenuItem {
  id: string;
  name: string;
  category: 'Nigerian Kitchen' | 'Grill & Continental' | 'Bar & Cocktails' | 'Breakfast';
  priceNgn: number;
  prepMinutes: number;
}

export const POS_MENU_ITEMS: PosMenuItem[] = [
  { id: 'menu-1', name: 'Smoky Party Jollof & Grilled Croaker', category: 'Nigerian Kitchen', priceNgn: 18500, prepMinutes: 22 },
  { id: 'menu-2', name: 'Ofe Onugbu (Bitterleaf) & Pounded Yam', category: 'Nigerian Kitchen', priceNgn: 16000, prepMinutes: 18 },
  { id: 'menu-3', name: 'Enugu Goat Meat Pepper Soup', category: 'Nigerian Kitchen', priceNgn: 12500, prepMinutes: 15 },
  { id: 'menu-4', name: 'Richgates Signature Suya Platter', category: 'Grill & Continental', priceNgn: 14500, prepMinutes: 16 },
  { id: 'menu-5', name: 'Herb-Crusted Ribeye & Garlic Mash', category: 'Grill & Continental', priceNgn: 29000, prepMinutes: 25 },
  { id: 'menu-6', name: 'Executive Continental Breakfast Tray', category: 'Breakfast', priceNgn: 13500, prepMinutes: 14 },
  { id: 'menu-7', name: 'Zobo Chapman Pitchers (Non-Alcoholic)', category: 'Bar & Cocktails', priceNgn: 6500, prepMinutes: 5 },
  { id: 'menu-8', name: 'Hennessy VS Glass / Lounge Pour', category: 'Bar & Cocktails', priceNgn: 19000, prepMinutes: 3 },
  { id: 'menu-9', name: 'Fresh Pineapple & Ginger Cold Press', category: 'Bar & Cocktails', priceNgn: 5000, prepMinutes: 4 },
];

export const ROLE_LABELS: Record<StaffRole, string> = {
  pch_admin: 'PCH Super Admin',
  property_admin: 'Property Admin (GM)',
  front_desk: 'Front Desk & Reservations',
  housekeeping: 'Housekeeping Lead',
  fnb_kitchen: 'Restaurant POS & Kitchen',
  accountant: 'Finance & Payroll Officer',
  maintenance: 'Engineering & Maintenance',
};

export const ROLE_ALLOWED_SECTIONS: Record<StaffRole, NavSectionId[]> = {
  pch_admin: [
    'dashboard',
    'rooms',
    'calendar',
    'reservations',
    'front_desk',
    'guests',
    'housekeeping',
    'pos_kitchen',
    'accounting',
    'reports',
    'inventory',
    'procurement',
    'staff',
    'shifts_attendance',
    'payroll',
    'maintenance',
    'ota_channels',
    'properties_admin',
    'licensing',
    'rbac_audit',
    'deployment',
  ],
  property_admin: [
    'dashboard',
    'rooms',
    'calendar',
    'reservations',
    'front_desk',
    'guests',
    'housekeeping',
    'pos_kitchen',
    'accounting',
    'reports',
    'inventory',
    'procurement',
    'staff',
    'shifts_attendance',
    'payroll',
    'maintenance',
    'ota_channels',
    'licensing',
    'rbac_audit',
  ],
  front_desk: ['dashboard', 'rooms', 'calendar', 'reservations', 'front_desk', 'guests', 'housekeeping', 'pos_kitchen', 'ota_channels'],
  housekeeping: ['dashboard', 'rooms', 'calendar', 'housekeeping', 'maintenance', 'inventory', 'shifts_attendance'],
  fnb_kitchen: ['dashboard', 'pos_kitchen', 'inventory', 'procurement', 'shifts_attendance'],
  accountant: ['dashboard', 'accounting', 'reports', 'inventory', 'procurement', 'payroll', 'rbac_audit'],
  maintenance: ['dashboard', 'rooms', 'calendar', 'maintenance', 'inventory', 'shifts_attendance'],
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
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function getPortalUrl(portal: PortalMode | 'admin'): string {
  if (typeof window === 'undefined') return `/?portal=${portal}`;
  return `${window.location.origin}/?portal=${portal}`;
}
