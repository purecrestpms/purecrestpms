import { BOOTSTRAPPED_ADMIN_EMAILS } from '../firebase';
import { RICHGATES_OFFICIAL_ROOMS } from '../types/pms';

export const RICHGATES_PROPERTY_ID = 'richgates-enugu';

export function generateLicenseKey(propertyCode: string, plan: string, isLifetime: boolean): string {
  const cleanCode = propertyCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) || 'PCHP';
  const tierCode = isLifetime
    ? 'LIFE'
    : plan === 'Enterprise'
      ? 'ENTP'
      : plan === 'Professional'
        ? 'PROF'
        : 'STRT';
  const seg1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const seg2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PCH-${cleanCode}-${tierCode}-${seg1}-${seg2}`;
}

export function buildRichgatesSeedPayload(
  ownerUid: string,
  ownerEmail: string,
  targetPropertyId: string = RICHGATES_PROPERTY_ID
) {
  const authorizedEmails = Array.from(
    new Set([...BOOTSTRAPPED_ADMIN_EMAILS, ownerEmail.toLowerCase(), 'gm@richgatesenugu.com'])
  );
  const today = '2026-11-15';
  const isDefaultProp = targetPropertyId === RICHGATES_PROPERTY_ID;

  const property = {
    id: targetPropertyId,
    name: 'Richgates Apartments, Enugu',
    code: 'RG-ENU-01',
    city: 'Enugu',
    state: 'Enugu State',
    country: 'Nigeria',
    address: 'Plot 14, Independence Layout, Enugu, Nigeria',
    phone: '+234 803 740 8820',
    email: 'reservations@richgatesenugu.com',
    currency: 'NGN' as const,
    roomCount: 8,
    status: 'active' as const,
    licenseKey: 'PCH-RG01-LIFE-8842-ENUG',
    licensePlan: 'Lifetime Sovereign' as const,
    adminEmail: ownerEmail,
    authorizedEmails,
    ownerUid,
  };

  const licPrefix = isDefaultProp ? 'lic' : `lic-${ownerUid.slice(0, 6)}`;
  const licenses = [
    {
      id: `${licPrefix}-richgates-lifetime`,
      licenseKey: 'PCH-RG01-LIFE-8842-ENUG',
      propertyId: targetPropertyId,
      propertyName: 'Richgates Apartments, Enugu',
      plan: 'Lifetime Sovereign' as const,
      billingCycle: 'lifetime' as const,
      isLifetime: true,
      maxRooms: 25,
      priceNgn: 4500000,
      status: 'active' as const,
      issuedAt: '2026-01-10',
      activatedAt: '2026-01-12',
      expiresAt: 'LIFETIME',
      activatedByEmail: ownerEmail,
      authorizedEmails,
      ownerUid,
    },
    {
      id: `${licPrefix}-pch-abuja-trial`,
      licenseKey: 'PCH-ABJ2-ENTP-5190-NGN1',
      propertyId: 'pending-assignment',
      propertyName: 'PureCrest Reserve Pool (Unassigned)',
      plan: 'Enterprise' as const,
      billingCycle: 'annual' as const,
      isLifetime: false,
      maxRooms: 60,
      priceNgn: 1850000,
      status: 'pending' as const,
      issuedAt: '2026-11-01',
      expiresAt: '2027-11-01',
      authorizedEmails,
      ownerUid,
    },
  ];

  const roomStatusOverrides: Record<
    string,
    {
      occupancyStatus: 'vacant' | 'occupied' | 'reserved' | 'out_of_order';
      housekeepingStatus: 'clean' | 'dirty' | 'cleaning' | 'inspected';
      currentGuestName?: string;
      currentReservationId?: string;
    }
  > = {
    'room-101': {
      occupancyStatus: 'occupied',
      housekeepingStatus: 'clean',
      currentGuestName: 'Engr. Chinedu Okafor',
      currentReservationId: 'res-rg-1001',
    },
    'room-102': {
      occupancyStatus: 'occupied',
      housekeepingStatus: 'clean',
      currentGuestName: 'Dr. Amaka Nwosu',
      currentReservationId: 'res-rg-1002',
    },
    'room-103': {
      occupancyStatus: 'vacant',
      housekeepingStatus: 'dirty',
    },
    'room-104': {
      occupancyStatus: 'reserved',
      housekeepingStatus: 'inspected',
      currentGuestName: 'Barr. Tunde Adeyemi',
      currentReservationId: 'res-rg-1003',
    },
    'room-201': {
      occupancyStatus: 'occupied',
      housekeepingStatus: 'clean',
      currentGuestName: 'Mrs. Zainab Ibrahim-Bello',
      currentReservationId: 'res-rg-1004',
    },
    'room-202': {
      occupancyStatus: 'vacant',
      housekeepingStatus: 'inspected',
    },
    'room-203': {
      occupancyStatus: 'occupied',
      housekeepingStatus: 'clean',
      currentGuestName: 'Chief Emeka & Family Eze',
      currentReservationId: 'res-rg-1005',
    },
    'room-204': {
      occupancyStatus: 'vacant',
      housekeepingStatus: 'clean',
    },
  };

  const rooms = RICHGATES_OFFICIAL_ROOMS.map((spec) => {
    const state = roomStatusOverrides[spec.id] || {
      occupancyStatus: 'vacant' as const,
      housekeepingStatus: 'clean' as const,
    };
    return {
      ...spec,
      occupancyStatus: state.occupancyStatus,
      housekeepingStatus: state.housekeepingStatus,
      currentGuestName: state.currentGuestName || '',
      currentReservationId: state.currentReservationId || '',
      propertyId: targetPropertyId,
      authorizedEmails,
      ownerUid,
    };
  });

  const guests = [
    {
      id: 'guest-1',
      fullName: 'Engr. Chinedu Okafor',
      email: 'chinedu.okafor@enugupower.ng',
      phone: '+234 803 442 1190',
      nationality: 'Nigerian',
      idType: 'NIN' as const,
      idNumber: '48291044312',
      vipTier: 'Gold' as const,
      totalStays: 6,
      lifetimeSpendNgn: 1240000,
      notes: 'Prefers serviced kitchenette apartment, sparkling water on arrival.',
    },
    {
      id: 'guest-2',
      fullName: 'Dr. Amaka Nwosu',
      email: 'amaka.nwosu@unn.edu.ng',
      phone: '+234 809 312 8845',
      nationality: 'Nigerian',
      idType: 'International Passport' as const,
      idNumber: 'A50928174',
      vipTier: 'Silver' as const,
      totalStays: 3,
      lifetimeSpendNgn: 560000,
      notes: 'Requires formal VAT receipt for conference reimbursement.',
    },
    {
      id: 'guest-3',
      fullName: 'Barr. Tunde Adeyemi',
      email: 't.adeyemi@lagoschambers.ng',
      phone: '+234 802 998 4412',
      nationality: 'Nigerian',
      idType: 'Driver License' as const,
      idNumber: 'FKJ99201AA',
      vipTier: 'Diplomatic' as const,
      totalStays: 9,
      lifetimeSpendNgn: 2450000,
      notes: 'Late arrival today; airport shuttle scheduled.',
    },
    {
      id: 'guest-4',
      fullName: 'Mrs. Zainab Ibrahim-Bello',
      email: 'zainab.bello@northstarng.com',
      phone: '+234 818 552 0019',
      nationality: 'Nigerian',
      idType: 'International Passport' as const,
      idNumber: 'B11920483',
      vipTier: 'Gold' as const,
      totalStays: 4,
      lifetimeSpendNgn: 980000,
      notes: 'Halal dining preference; extra pillows.',
    },
    {
      id: 'guest-5',
      fullName: 'Chief Emeka & Family Eze',
      email: 'emeka.eze@coalcityholdings.com',
      phone: '+234 805 619 7731',
      nationality: 'Nigerian',
      idType: 'NIN' as const,
      idNumber: '77410299384',
      vipTier: 'Diplomatic' as const,
      totalStays: 12,
      lifetimeSpendNgn: 4820000,
      notes: 'Long-stay executive family guest.',
    },
  ].map((g) => ({ ...g, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const reservations = [
    {
      id: 'res-rg-1001',
      bookingRef: 'RG-2611-01',
      roomId: 'room-101',
      roomNumber: 'RM-1',
      guestId: 'guest-1',
      guestName: 'Engr. Chinedu Okafor',
      guestPhone: '+234 803 442 1190',
      checkInDate: '2026-11-13',
      checkOutDate: '2026-11-17',
      nights: 4,
      adults: 1,
      channel: 'Direct Web' as const,
      nightlyRateNgn: 65500,
      roomChargesNgn: 262000,
      posChargesNgn: 31000,
      paidNgn: 262000,
      status: 'checked_in' as const,
      paymentMethod: 'Bank Transfer' as const,
    },
    {
      id: 'res-rg-1002',
      bookingRef: 'RG-2611-02',
      roomId: 'room-102',
      roomNumber: 'RM-2',
      guestId: 'guest-2',
      guestName: 'Dr. Amaka Nwosu',
      guestPhone: '+234 809 312 8845',
      checkInDate: '2026-11-14',
      checkOutDate: '2026-11-16',
      nights: 2,
      adults: 1,
      channel: 'Booking.com' as const,
      nightlyRateNgn: 80000,
      roomChargesNgn: 160000,
      posChargesNgn: 13500,
      paidNgn: 160000,
      status: 'checked_in' as const,
      paymentMethod: 'Card POS' as const,
    },
    {
      id: 'res-rg-1003',
      bookingRef: 'RG-2611-03',
      roomId: 'room-104',
      roomNumber: 'RM-4',
      guestId: 'guest-3',
      guestName: 'Barr. Tunde Adeyemi',
      guestPhone: '+234 802 998 4412',
      checkInDate: today,
      checkOutDate: '2026-11-18',
      nights: 3,
      adults: 1,
      channel: 'Hotels.ng' as const,
      nightlyRateNgn: 55000,
      roomChargesNgn: 165000,
      posChargesNgn: 0,
      paidNgn: 100000,
      status: 'confirmed' as const,
      paymentMethod: 'Online Gateway' as const,
    },
    {
      id: 'res-rg-1004',
      bookingRef: 'RG-2611-04',
      roomId: 'room-201',
      roomNumber: 'RM-5',
      guestId: 'guest-4',
      guestName: 'Mrs. Zainab Ibrahim-Bello',
      guestPhone: '+234 818 552 0019',
      checkInDate: '2026-11-12',
      checkOutDate: '2026-11-16',
      nights: 4,
      adults: 2,
      channel: 'Airbnb' as const,
      nightlyRateNgn: 58000,
      roomChargesNgn: 232000,
      posChargesNgn: 0,
      paidNgn: 232000,
      status: 'checked_in' as const,
      paymentMethod: 'Online Gateway' as const,
    },
    {
      id: 'res-rg-1005',
      bookingRef: 'RG-2611-05',
      roomId: 'room-203',
      roomNumber: 'RM-7',
      guestId: 'guest-5',
      guestName: 'Chief Emeka & Family Eze',
      guestPhone: '+234 805 619 7731',
      checkInDate: '2026-11-10',
      checkOutDate: '2026-11-20',
      nights: 10,
      adults: 2,
      channel: 'Direct Walk-In' as const,
      nightlyRateNgn: 65000,
      roomChargesNgn: 650000,
      posChargesNgn: 48000,
      paidNgn: 500000,
      status: 'checked_in' as const,
      paymentMethod: 'Corporate Invoice' as const,
    },
  ].map((r) => ({ ...r, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const blockedDates = [
    {
      id: 'blk-rm6-clean',
      roomId: 'room-202',
      roomNumber: 'RM-6',
      startDate: '2026-11-18',
      endDate: '2026-11-20',
      reason: 'Scheduled quarterly AC & upholstery deep clean',
      category: 'Deep Clean' as const,
      createdByEmail: ownerEmail,
    },
  ].map((b) => ({ ...b, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const housekeepingTasks = [
    {
      id: 'hk-103',
      roomId: 'room-103',
      roomNumber: 'RM-3',
      taskType: 'Checkout Turnover' as const,
      assignedTo: 'Ngozi Ugwu',
      priority: 'Urgent' as const,
      status: 'pending' as const,
      notes: 'Full kitchenette sanitize, linen swap, restock coffee & water bottles.',
    },
    {
      id: 'hk-203',
      roomId: 'room-203',
      roomNumber: 'RM-7',
      taskType: 'Daily Stayover' as const,
      assignedTo: 'Chidinma Oko',
      priority: 'Normal' as const,
      status: 'in_progress' as const,
      notes: 'Afternoon refresh requested at 14:00.',
    },
  ].map((t) => ({ ...t, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const posOrders = [
    {
      id: 'pos-101',
      orderNumber: 'POS-901',
      serviceType: 'Room Service' as const,
      tableOrRoom: 'RM-1',
      reservationId: 'res-rg-1001',
      itemsSummary: '1x Smoky Party Jollof & Grilled Croaker, 1x Enugu Goat Meat Pepper Soup',
      itemCount: 2,
      subtotalNgn: 31000,
      vatNgn: 2325,
      totalNgn: 33325,
      paymentStatus: 'room_folio' as const,
      paymentMethod: 'Room Folio' as const,
      kitchenStatus: 'preparing' as const,
    },
    {
      id: 'pos-102',
      orderNumber: 'POS-902',
      serviceType: 'Dine-In' as const,
      tableOrRoom: 'Table 04',
      itemsSummary: '2x Richgates Signature Suya Platter, 2x Zobo Chapman Pitchers',
      itemCount: 4,
      subtotalNgn: 42000,
      vatNgn: 3150,
      totalNgn: 45150,
      paymentStatus: 'paid' as const,
      paymentMethod: 'Card POS' as const,
      kitchenStatus: 'queued' as const,
    },
  ].map((o) => ({ ...o, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const ledgerEntries = [
    {
      id: 'led-1',
      entryDate: '2026-11-13',
      entryType: 'revenue' as const,
      category: 'Room Accommodation' as const,
      reference: 'RG-2611-01',
      description: 'RM-1 deposit settlement — Engr. Chinedu Okafor',
      amountNgn: 262000,
      vatNgn: 19650,
      paymentMethod: 'Bank Transfer',
    },
    {
      id: 'led-2',
      entryDate: '2026-11-14',
      entryType: 'revenue' as const,
      category: 'Room Accommodation' as const,
      reference: 'RG-2611-04',
      description: 'RM-5 Airbnb payout — Mrs. Zainab Ibrahim-Bello',
      amountNgn: 232000,
      vatNgn: 17400,
      paymentMethod: 'Online Gateway',
    },
    {
      id: 'led-3',
      entryDate: '2026-11-14',
      entryType: 'expense' as const,
      category: 'Utilities & Diesel' as const,
      reference: 'DSL-114',
      description: '400L AGO Diesel delivery for 100kVA Perkins Generator',
      amountNgn: 540000,
      vatNgn: 0,
      paymentMethod: 'Bank Transfer',
    },
    {
      id: 'led-4',
      entryDate: today,
      entryType: 'revenue' as const,
      category: 'Restaurant & Bar' as const,
      reference: 'POS-902',
      description: 'Table 04 Lounge Order Settlement',
      amountNgn: 45150,
      vatNgn: 3150,
      paymentMethod: 'Card POS',
    },
  ].map((l) => ({ ...l, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const inventoryItems = [
    {
      id: 'inv-1',
      sku: 'KIT-RICE-50',
      name: 'Basmati Long-Grain Rice (50kg Bag)',
      category: 'Kitchen & Pantry' as const,
      unit: 'Bags',
      quantityOnHand: 9,
      reorderLevel: 4,
      unitCostNgn: 82000,
      supplierName: 'Ogbete Wholesale Provisions Ltd',
    },
    {
      id: 'inv-2',
      sku: 'BAR-HEN-01',
      name: 'Hennessy VS 70cl Bottle',
      category: 'Bar & Beverage' as const,
      unit: 'Bottles',
      quantityOnHand: 3,
      reorderLevel: 5,
      unitCostNgn: 68000,
      supplierName: 'Enugu Premium Cellars',
    },
    {
      id: 'inv-3',
      sku: 'HK-TOWEL-01',
      name: 'Egyptian Cotton Bath Towel Set (600gsm)',
      category: 'Housekeeping Linen & Amenities' as const,
      unit: 'Sets',
      quantityOnHand: 28,
      reorderLevel: 12,
      unitCostNgn: 18500,
      supplierName: 'PureCrest Linen Supply',
    },
    {
      id: 'inv-4',
      sku: 'ENG-AGO-01',
      name: 'Automotive Gas Oil (AGO Generator Diesel)',
      category: 'Engineering & Diesel' as const,
      unit: 'Litres',
      quantityOnHand: 320,
      reorderLevel: 400,
      unitCostNgn: 1350,
      supplierName: 'Eastern Energy Depots',
    },
  ].map((i) => ({ ...i, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const purchaseOrders = [
    {
      id: 'po-101',
      poNumber: 'PO-RG-401',
      supplierName: 'Enugu Premium Cellars',
      itemId: 'inv-2',
      itemName: 'Hennessy VS 70cl Bottle',
      quantity: 6,
      unitCostNgn: 68000,
      totalCostNgn: 408000,
      status: 'approved' as const,
      expectedDate: '2026-11-16',
    },
    {
      id: 'po-102',
      poNumber: 'PO-RG-402',
      supplierName: 'Eastern Energy Depots',
      itemId: 'inv-4',
      itemName: 'Automotive Gas Oil (AGO Generator Diesel)',
      quantity: 500,
      unitCostNgn: 1350,
      totalCostNgn: 675000,
      status: 'draft' as const,
      expectedDate: '2026-11-17',
    },
  ].map((p) => ({ ...p, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const staffMembers = [
    {
      id: 'stf-1',
      staffCode: 'RG-001',
      fullName: 'Adaeze Chukwuemeka',
      email: 'gm@richgatesenugu.com',
      phone: '+234 803 111 2201',
      department: 'Management' as const,
      role: 'property_admin' as const,
      monthlyBaseSalaryNgn: 420000,
      monthlyAllowanceNgn: 130000,
      employmentStatus: 'active' as const,
    },
    {
      id: 'stf-2',
      staffCode: 'RG-002',
      fullName: 'Kelechi Nnamdi',
      email: 'frontdesk@richgatesenugu.com',
      phone: '+234 806 230 9912',
      department: 'Front Desk' as const,
      role: 'front_desk' as const,
      monthlyBaseSalaryNgn: 165000,
      monthlyAllowanceNgn: 45000,
      employmentStatus: 'active' as const,
    },
    {
      id: 'stf-3',
      staffCode: 'RG-003',
      fullName: 'Ngozi Ugwu',
      email: 'housekeeping@richgatesenugu.com',
      phone: '+234 807 401 3340',
      department: 'Housekeeping' as const,
      role: 'housekeeping' as const,
      monthlyBaseSalaryNgn: 120000,
      monthlyAllowanceNgn: 30000,
      employmentStatus: 'active' as const,
    },
    {
      id: 'stf-4',
      staffCode: 'RG-004',
      fullName: 'Chidinma Oko',
      phone: '+234 812 882 4019',
      department: 'Housekeeping' as const,
      role: 'housekeeping' as const,
      monthlyBaseSalaryNgn: 115000,
      monthlyAllowanceNgn: 25000,
      employmentStatus: 'active' as const,
    },
    {
      id: 'stf-5',
      staffCode: 'RG-005',
      fullName: 'Chef Obinna Ani',
      email: 'kitchen@richgatesenugu.com',
      phone: '+234 803 774 5109',
      department: 'Kitchen & F&B' as const,
      role: 'fnb_kitchen' as const,
      monthlyBaseSalaryNgn: 240000,
      monthlyAllowanceNgn: 60000,
      employmentStatus: 'active' as const,
    },
    {
      id: 'stf-6',
      staffCode: 'RG-006',
      fullName: 'Uchechukwu Onuoha',
      email: 'accounts@richgatesenugu.com',
      phone: '+234 809 119 6702',
      department: 'Accounts' as const,
      role: 'accountant' as const,
      monthlyBaseSalaryNgn: 260000,
      monthlyAllowanceNgn: 70000,
      employmentStatus: 'active' as const,
    },
    {
      id: 'stf-7',
      staffCode: 'RG-007',
      fullName: 'Ifeanyi Okolie',
      email: 'maintenance@richgatesenugu.com',
      phone: '+234 814 550 8831',
      department: 'Engineering & Security' as const,
      role: 'maintenance' as const,
      monthlyBaseSalaryNgn: 155000,
      monthlyAllowanceNgn: 40000,
      employmentStatus: 'active' as const,
    },
  ].map((s) => ({ ...s, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const shifts = [
    {
      id: 'shf-1',
      staffId: 'stf-2',
      staffName: 'Kelechi Nnamdi',
      department: 'Front Desk',
      shiftDate: today,
      shiftWindow: 'Morning (07:00 - 15:00)' as const,
      status: 'scheduled' as const,
    },
    {
      id: 'shf-2',
      staffId: 'stf-3',
      staffName: 'Ngozi Ugwu',
      department: 'Housekeeping',
      shiftDate: today,
      shiftWindow: 'Morning (07:00 - 15:00)' as const,
      status: 'scheduled' as const,
    },
    {
      id: 'shf-3',
      staffId: 'stf-5',
      staffName: 'Chef Obinna Ani',
      department: 'Kitchen & F&B',
      shiftDate: today,
      shiftWindow: 'Afternoon (15:00 - 23:00)' as const,
      status: 'scheduled' as const,
    },
  ].map((sh) => ({ ...sh, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const attendance = [
    {
      id: 'att-1',
      staffId: 'stf-2',
      staffName: 'Kelechi Nnamdi',
      date: today,
      clockInTime: '06:54',
      status: 'present' as const,
    },
    {
      id: 'att-2',
      staffId: 'stf-3',
      staffName: 'Ngozi Ugwu',
      date: today,
      clockInTime: '07:02',
      status: 'present' as const,
    },
    {
      id: 'att-3',
      staffId: 'stf-7',
      staffName: 'Ifeanyi Okolie',
      date: today,
      clockInTime: '07:18',
      status: 'late' as const,
    },
  ].map((a) => ({ ...a, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const payrollRuns = [
    {
      id: 'pay-2026-10',
      periodLabel: 'October 2026',
      staffCount: 7,
      grossPayNgn: 1870000,
      pensionDeductionNgn: 149600,
      payeTaxNgn: 168300,
      netPayNgn: 1552100,
      status: 'posted_to_ledger' as const,
    },
  ].map((pr) => ({ ...pr, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const maintenanceTickets = [
    {
      id: 'mnt-1',
      roomId: 'room-202',
      locationLabel: 'RM-6 Hotel Room',
      issueTitle: 'Service split AC filter & verify inverter changeover',
      category: 'HVAC & AC' as const,
      priority: 'Medium' as const,
      assignedTo: 'Ifeanyi Okolie',
      estimatedCostNgn: 18000,
      status: 'in_progress' as const,
    },
    {
      id: 'mnt-2',
      locationLabel: 'Generator House',
      issueTitle: '100kVA Perkins oil filter scheduled 250-hr service',
      category: 'Generator & Power' as const,
      priority: 'High' as const,
      assignedTo: 'Ifeanyi Okolie',
      estimatedCostNgn: 45000,
      status: 'open' as const,
    },
  ].map((m) => ({ ...m, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const otaChannels = [
    {
      id: 'ota-booking',
      channelName: 'Booking.com' as const,
      propertyListingId: 'BKG-ENUGU-88412',
      commissionPct: 15,
      autoSync: true,
      connected: true,
      lastSyncedIso: '2026-11-15T18:10:00Z',
      bookingsImported: 18,
    },
    {
      id: 'ota-airbnb',
      channelName: 'Airbnb' as const,
      propertyListingId: 'AIR-RICHGATES-08',
      commissionPct: 14,
      autoSync: true,
      connected: true,
      lastSyncedIso: '2026-11-15T18:12:00Z',
      bookingsImported: 14,
    },
    {
      id: 'ota-hotelsng',
      channelName: 'Hotels.ng' as const,
      propertyListingId: 'HNG-ENU-2291',
      commissionPct: 12,
      autoSync: true,
      connected: true,
      lastSyncedIso: '2026-11-15T18:05:00Z',
      bookingsImported: 11,
    },
    {
      id: 'ota-expedia',
      channelName: 'Expedia' as const,
      propertyListingId: 'EXP-RG-5501',
      commissionPct: 18,
      autoSync: false,
      connected: false,
      lastSyncedIso: '2026-11-10T09:00:00Z',
      bookingsImported: 3,
    },
    {
      id: 'ota-direct',
      channelName: 'Direct Website Engine' as const,
      propertyListingId: 'WEB-RICHGATES-DIRECT',
      commissionPct: 0,
      autoSync: true,
      connected: true,
      lastSyncedIso: '2026-11-15T18:20:00Z',
      bookingsImported: 27,
    },
  ].map((o) => ({ ...o, propertyId: targetPropertyId, authorizedEmails, ownerUid }));

  const audPrefix = isDefaultProp ? 'aud' : `aud-${ownerUid.slice(0, 6)}`;
  const auditLogs = [
    {
      id: `${audPrefix}-seed-1`,
      propertyId: targetPropertyId,
      actorEmail: ownerEmail,
      actorRole: 'PCH Super Admin',
      module: 'Licensing & Provisioning',
      action: 'Initialized Richgates Apartments, Enugu (RM-1 to RM-8)',
      details: 'Provisioned Serviced Apartment Section & Hotel Rooms with Lifetime Sovereign key PCH-RG01-LIFE-8842-ENUG.',
      timestampIso: new Date().toISOString(),
      authorizedEmails,
      ownerUid,
    },
  ];

  return {
    property,
    licenses,
    rooms,
    blockedDates,
    guests,
    reservations,
    housekeepingTasks,
    posOrders,
    ledgerEntries,
    inventoryItems,
    purchaseOrders,
    staffMembers,
    shifts,
    attendance,
    payrollRuns,
    maintenanceTickets,
    otaChannels,
    auditLogs,
  };
}
