import { BOOTSTRAPPED_ADMIN_EMAILS } from '../firebase';
import { RICHGATES_OFFICIAL_ROOMS, RICHGATES_PROPERTY_INFO } from '../types/pms';

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
    new Set([...BOOTSTRAPPED_ADMIN_EMAILS, ownerEmail.toLowerCase()])
  );
  const isDefaultProp = targetPropertyId === RICHGATES_PROPERTY_ID;

  const property = {
    id: targetPropertyId,
    systemPropertyId: 'PCH-PROP-000011',
    subdomainSlug: 'richgates',
    name: RICHGATES_PROPERTY_INFO.name,
    code: 'RG-ENU-01',
    city: 'Enugu',
    state: 'Enugu State',
    country: 'Nigeria',
    address: RICHGATES_PROPERTY_INFO.address,
    phone: RICHGATES_PROPERTY_INFO.phone,
    whatsapp: RICHGATES_PROPERTY_INFO.whatsapp,
    email: RICHGATES_PROPERTY_INFO.email,
    currency: 'NGN' as const,
    roomCount: RICHGATES_OFFICIAL_ROOMS.length,
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
      maxRooms: 20,
      priceNgn: 4500000,
      status: 'active' as const,
      issuedAt: '2026-01-10',
      activatedAt: '2026-01-12',
      expiresAt: 'LIFETIME',
      activatedByEmail: ownerEmail,
      authorizedEmails,
      ownerUid,
    },
  ];

  // Production-ready suites (RM-1 to RM-8): all vacant & clean with zero demo guest occupancy
  const rooms = RICHGATES_OFFICIAL_ROOMS.map((spec) => ({
    ...spec,
    occupancyStatus: 'vacant' as const,
    housekeepingStatus: 'clean' as const,
    currentGuestName: '',
    currentReservationId: '',
    propertyId: targetPropertyId,
    authorizedEmails,
    ownerUid,
  }));

  const posMenuItems: Array<{ id: string } & Record<string, unknown>> = [];

  const otaChannels = [
    {
      id: 'ota-booking',
      channelName: 'Booking.com' as const,
      propertyListingId: 'BKG-ENUGU-88412',
      commissionPct: 15,
      autoSync: true,
      connected: true,
      lastSyncedIso: '',
      bookingsImported: 0,
    },
    {
      id: 'ota-airbnb',
      channelName: 'Airbnb' as const,
      propertyListingId: 'AIR-RICHGATES-08',
      commissionPct: 14,
      autoSync: true,
      connected: true,
      lastSyncedIso: '',
      bookingsImported: 0,
    },
    {
      id: 'ota-hotelsng',
      channelName: 'Hotels.ng' as const,
      propertyListingId: 'HNG-ENU-2291',
      commissionPct: 12,
      autoSync: true,
      connected: true,
      lastSyncedIso: '',
      bookingsImported: 0,
    },
    {
      id: 'ota-expedia',
      channelName: 'Expedia' as const,
      propertyListingId: 'EXP-RG-5501',
      commissionPct: 18,
      autoSync: false,
      connected: false,
      lastSyncedIso: '',
      bookingsImported: 0,
    },
    {
      id: 'ota-direct',
      channelName: 'Direct Website Engine' as const,
      propertyListingId: 'WEB-RICHGATES-DIRECT',
      commissionPct: 0,
      autoSync: true,
      connected: true,
      lastSyncedIso: '',
      bookingsImported: 0,
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
      action: 'Initialized Production Richgates Apartments, Enugu (RM-1 to RM-8)',
      details: 'Provisioned clean production suites RM-1 to RM-8 with Lifetime Sovereign key PCH-RG01-LIFE-8842-ENUG (20-room max license) and zero demo guests.',
      timestampIso: new Date().toISOString(),
      authorizedEmails,
      ownerUid,
    },
  ];

  // Clean production baseline: no demo guests, no demo bookings, no demo financial/folio transactions
  return {
    property,
    licenses,
    rooms,
    blockedDates: [] as Array<{ id: string } & Record<string, unknown>>,
    guests: [] as Array<{ id: string } & Record<string, unknown>>,
    reservations: [] as Array<{ id: string } & Record<string, unknown>>,
    housekeepingTasks: [] as Array<{ id: string } & Record<string, unknown>>,
    posOrders: [] as Array<{ id: string } & Record<string, unknown>>,
    posMenuItems,
    ledgerEntries: [] as Array<{ id: string } & Record<string, unknown>>,
    inventoryItems: [] as Array<{ id: string } & Record<string, unknown>>,
    purchaseOrders: [] as Array<{ id: string } & Record<string, unknown>>,
    staffMembers: [] as Array<{ id: string } & Record<string, unknown>>,
    shifts: [] as Array<{ id: string } & Record<string, unknown>>,
    attendance: [] as Array<{ id: string } & Record<string, unknown>>,
    payrollRuns: [] as Array<{ id: string } & Record<string, unknown>>,
    maintenanceTickets: [] as Array<{ id: string } & Record<string, unknown>>,
    otaChannels,
    messages: [] as Array<{ id: string } & Record<string, unknown>>,
    auditLogs,
  };
}
