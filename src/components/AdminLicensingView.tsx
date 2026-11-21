import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Copy,
  Download,
  FileSpreadsheet,
  Globe,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import {
  activateLicenseKeyWorkflow,
  authorizeUserEmailForProperty,
  buildPropertyIcalFeed,
  createNewPropertyWithRooms,
  createOtaChannelWithIcal,
  deleteOtaChannel,
  generateCentralLicense,
  importOtaCsvReservationsWorkflow,
  prepareRichgatesProductionDatabaseWorkflow,
  syncOtaChannelWorkflow,
  updateLicenseStatus,
  updateOtaChannelIcal,
  updatePlanInquiryStatusWorkflow,
  updatePropertyTenantConfigWorkflow,
} from '../services/pmsService';
import {
  buildSampleOtaCsvTemplate,
  ParsedOtaCsvRow,
  parseOtaCsvText,
} from '../utils/otaCsvParser';
import {
  AuditLogRecord,
  BlockedDateRecord,
  buildAllSubdomainLinks,
  ChannelCurrency,
  formatBookingSourceLabel,
  formatChannelCurrency,
  formatNgn,
  formatUsd,
  getConnectedRootDomain,
  getDefaultOtaChannelCurrency,
  getFxRateToNgn,
  getPortalUrl,
  getPropertySubdomainSlug,
  getPropertySystemId,
  getReservationPaymentSummary,
  isOtaBookingChannel,
  LicenseRecord,
  NavSectionId,
  normalizeSubdomainSlug,
  OtaIntegrationRecord,
  PlanInquiryRecord,
  PortalMode,
  PosMenuItemRecord,
  PropertyRecord,
  ReservationRecord,
  RICHGATES_MAX_ROOMS,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  RoomRecord,
  saveConnectedRootDomain,
  sortRoomsByNumber,
  StaffRole,
  SUPPORTED_CHANNEL_CURRENCIES,
} from '../types/pms';
import { useCms } from '../context/CmsContext';
import { resolveAppImageUrl } from '../utils/mediaAssets';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';

interface AdminLicensingViewProps {
  section: Extract<
    NavSectionId,
    'ota_channels' | 'properties_admin' | 'licensing' | 'rbac_audit' | 'deployment'
  >;
  property: PropertyRecord;
  properties: PropertyRecord[];
  rooms: RoomRecord[];
  reservations?: ReservationRecord[];
  blockedDates?: BlockedDateRecord[];
  otaChannels: OtaIntegrationRecord[];
  posMenuItems?: PosMenuItemRecord[];
  licenses: LicenseRecord[];
  planInquiries?: PlanInquiryRecord[];
  auditLogs: AuditLogRecord[];
  activeRole: StaffRole;
  onSelectProperty: (id: string) => void;
  onSwitchPortal: (portal: PortalMode) => void;
  onNavigate?: (section: NavSectionId) => void;
  onNotify: (msg: string) => void;
}

const PLAN_PRICING: Record<LicenseRecord['plan'], { monthly: number; annual: number; lifetime: number; rooms: number }> = {
  Starter: { monthly: 75000, annual: 750000, lifetime: 2200000, rooms: 12 },
  Professional: { monthly: 145000, annual: 1450000, lifetime: 3200000, rooms: 30 },
  Enterprise: { monthly: 220000, annual: 1850000, lifetime: 4500000, rooms: 80 },
  'Lifetime Sovereign': { monthly: 4500000, annual: 4500000, lifetime: 4500000, rooms: 250 },
};

function getDefaultOtaCommissionPct(
  channelName: OtaIntegrationRecord['channelName'] | string
): number {
  switch (channelName) {
    case 'Booking.com':
    case 'Hotels.ng':
      return 15;
    case 'Airbnb':
      return 14;
    case 'Expedia':
      return 18;
    case 'VRBO':
      return 12;
    case 'Custom iCal':
      return 10;
    case 'Direct Website Engine':
      return 0;
    default:
      return 15;
  }
}

export const AdminLicensingView: React.FC<AdminLicensingViewProps> = ({
  section,
  property,
  properties,
  rooms,
  reservations = [],
  blockedDates = [],
  otaChannels,
  posMenuItems = [],
  licenses,
  planInquiries = [],
  auditLogs,
  activeRole,
  onSelectProperty,
  onSwitchPortal,
  onNavigate,
  onNotify,
}) => {
  const { cms } = useCms();
  // New property state (Super Admin multi-client provisioning)
  const [showPropForm, setShowPropForm] = useState(false);
  const [propName, setPropName] = useState('');
  const [propCode, setPropCode] = useState('');
  const [propSubdomainSlug, setPropSubdomainSlug] = useState('');
  const [propCity, setPropCity] = useState('Abuja');
  const [propState, setPropState] = useState('FCT');
  const [propAddress, setPropAddress] = useState('');
  const [propAdminName, setPropAdminName] = useState('');
  const [propAdminEmail, setPropAdminEmail] = useState('');
  const [propAdminPassword, setPropAdminPassword] = useState('');
  const [propInitialPlan, setPropInitialPlan] = useState<LicenseRecord['plan']>('Professional');
  const [propRooms, setPropRooms] = useState(10);
  const [propBaseRate, setPropBaseRate] = useState(80000);

  // Edit existing client tenant modal
  const [editingTenantProp, setEditingTenantProp] = useState<PropertyRecord | null>(null);
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantSlug, setEditTenantSlug] = useState('');
  const [editTenantAdminEmail, setEditTenantAdminEmail] = useState('');
  const [editTenantStatus, setEditTenantStatus] = useState<PropertyRecord['status']>('active');

  // License generator state
  const [licPropId, setLicPropId] = useState(property.id);
  const [licPlan, setLicPlan] = useState<LicenseRecord['plan']>('Enterprise');
  const [licCycle, setLicCycle] = useState<LicenseRecord['billingCycle']>('annual');
  const [licDurationDays, setLicDurationDays] = useState(365);
  const [licAutoActivate, setLicAutoActivate] = useState(true);
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [connectedDomainInput, setConnectedDomainInput] = useState(() => getConnectedRootDomain());
  const [savedRootDomain, setSavedRootDomain] = useState(() => getConnectedRootDomain());
  const [activationPropId, setActivationPropId] = useState(property.id);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  React.useEffect(() => {
    setLicPropId(property.id);
    setActivationPropId(property.id);
  }, [property.id]);

  // RBAC grant access state
  const [grantEmail, setGrantEmail] = useState('');
  const [grantFirstName, setGrantFirstName] = useState('');
  const [grantLastName, setGrantLastName] = useState('');
  const [grantRole, setGrantRole] = useState<StaffRole>('front_desk');

  // Channel Manager & iCal state
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [newChannelName, setNewChannelName] =
    useState<OtaIntegrationRecord['channelName']>('Airbnb');
  const [newChannelSuite, setNewChannelSuite] = useState('All Rooms');
  const [newListingId, setNewListingId] = useState('');
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newCommissionPct, setNewCommissionPct] = useState('14');
  const [newAutoSync, setNewAutoSync] = useState(true);
  const [exportSuiteFilter, setExportSuiteFilter] = useState('ALL');
  const [icalDrafts, setIcalDrafts] = useState<
    Record<
      string,
      {
        url: string;
        room: string;
        listingId: string;
        commissionPct: string;
        autoSync: boolean;
      }
    >
  >({});

  const [busy, setBusy] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const sortedRooms = sortRoomsByNumber(rooms);

  const handleDownloadCleanProductionBackup = () => {
    const cleanRooms = sortedRooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      name: r.name,
      roomType: r.roomType,
      section: r.section,
      floor: r.floor,
      nightlyRateNgn: r.nightlyRateNgn,
      maxGuests: r.maxGuests,
      occupancyStatus: 'vacant' as const,
      housekeepingStatus: 'clean' as const,
      currentGuestName: '',
      currentReservationId: '',
      imageUrl: resolveAppImageUrl(r.imageUrl, ''),
      amenities: r.amenities || [],
    }));

    const backupPayload = {
      schemaVersion: '1.0-production',
      exportedAt: new Date().toISOString(),
      deploymentTarget: 'cloudflare-pages',
      property: {
        id: property.id,
        name: property.name,
        code: property.code,
        city: property.city,
        state: property.state,
        country: property.country,
        address: property.address,
        phone: property.phone || '',
        whatsapp: property.whatsapp || '',
        email: property.email || '',
        currency: property.currency,
        roomCount: cleanRooms.length,
        status: property.status,
        licenseKey: property.licenseKey || '',
        licensePlan: property.licensePlan || 'Lifetime Sovereign',
        adminEmail: property.adminEmail,
        authorizedEmails: property.authorizedEmails,
      },
      licenses: licenses.filter((l) => l.propertyId === property.id),
      rooms: cleanRooms,
      posMenuItems: posMenuItems.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        priceNgn: m.priceNgn,
        costNgn: m.costNgn ?? 0,
        prepMinutes: m.prepMinutes,
        available: m.available,
      })),
      otaChannels: otaChannels.map((o) => ({
        id: o.id,
        channelName: o.channelName,
        propertyListingId: o.propertyListingId,
        roomNumber: !o.roomNumber || o.roomNumber === 'All Suites' ? 'All Rooms' : o.roomNumber,
        commissionPct: o.commissionPct,
        autoSync: o.autoSync,
        connected: o.connected,
        bookingsImported: 0,
      })),
      guests: [],
      reservations: [],
      blockedDates: [],
      housekeepingTasks: [],
      posOrders: [],
      ledgerEntries: [],
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${property.code.toLowerCase()}-production-backup-rooms-only.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Downloaded clean production backup (${cleanRooms.length} rooms, 0 demo guests)`);
  };

  const handleConfirmPurgeDemoGuests = async () => {
    setBusy(true);
    try {
      const result = await prepareRichgatesProductionDatabaseWorkflow({
        property,
        actorRole: ROLE_LABELS[activeRole],
      });
      setShowPurgeConfirm(false);
      onNotify(
        `Production ready: kept ${result.roomsResetCount} rooms (vacant & clean) and removed ${result.deletedDocsCount} demo records`
      );
    } catch (err) {
      onNotify(
        getUserFriendlyErrorMessage(err, 'Unable to clear demo records. Please try again.', 'Admin:PurgeDemo')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopiedKey(null);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName.trim() || !propCode.trim() || !propAdminEmail.trim()) {
      onNotify('Property name, code, and Property Admin email are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await createNewPropertyWithRooms({
        name: propName.trim(),
        code: propCode.trim().toUpperCase(),
        subdomainSlug: propSubdomainSlug.trim() || undefined,
        city: propCity.trim(),
        state: propState.trim(),
        address: propAddress.trim() || `${propCity}, ${propState}, Nigeria`,
        adminName: propAdminName.trim() || undefined,
        adminEmail: propAdminEmail.trim(),
        adminPassword: propAdminPassword.trim() || undefined,
        initialPlan: propInitialPlan,
        roomCount: propRooms,
        baseRateNgn: propBaseRate,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(
        `Provisioned ${propName} (${created.systemPropertyId}) · ${created.subdomainSlug}.${savedRootDomain} · License ${created.licenseKey}${created.authNote ? ` · ${created.authNote}` : ''}`
      );
      setShowPropForm(false);
      setPropName('');
      setPropCode('');
      setPropSubdomainSlug('');
      setPropAddress('');
      setPropAdminName('');
      setPropAdminEmail('');
      setPropAdminPassword('');
      if (created.propertyId) onSelectProperty(created.propertyId);
    } catch (err) {
      onNotify(
        getUserFriendlyErrorMessage(
          err,
          'Unable to provision client property. Please try again.',
          'Admin:CreateProperty'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTenantConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenantProp || !editTenantAdminEmail.trim()) return;
    setBusy(true);
    try {
      await updatePropertyTenantConfigWorkflow({
        property: editingTenantProp,
        name: editTenantName.trim(),
        subdomainSlug: editTenantSlug.trim() || getPropertySubdomainSlug(editingTenantProp),
        adminEmail: editTenantAdminEmail.trim(),
        status: editTenantStatus,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Updated client subdomain & admin settings for ${editTenantName || editingTenantProp.name}`);
      setEditingTenantProp(null);
    } catch (err) {
      onNotify(
        getUserFriendlyErrorMessage(
          err,
          'Unable to update client tenant settings. Please try again.',
          'Admin:UpdateTenant'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProp = properties.find((p) => p.id === licPropId) || property;
    const pricing = PLAN_PRICING[licPlan];
    const effectiveCycle = licPlan === 'Lifetime Sovereign' ? 'lifetime' : licCycle;
    const priceNgn =
      effectiveCycle === 'lifetime'
        ? pricing.lifetime
        : effectiveCycle === 'annual'
          ? pricing.annual
          : pricing.monthly;

    const cappedMaxRooms =
      targetProp.code === 'RG-ENU-01'
        ? Math.min(pricing.rooms, RICHGATES_MAX_ROOMS)
        : pricing.rooms;

    setBusy(true);
    try {
      const key = await generateCentralLicense({
        property: targetProp,
        plan: licPlan,
        billingCycle: effectiveCycle,
        maxRooms: cappedMaxRooms,
        priceNgn,
        durationDays: effectiveCycle === 'monthly' ? 30 : licDurationDays,
        autoActivate: licAutoActivate,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Generated PureCrest license key ${key} (Max ${cappedMaxRooms} rooms)`);
    } finally {
      setBusy(false);
    }
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const matched = licenses.find(
      (l) => l.licenseKey.toUpperCase() === activationKeyInput.trim().toUpperCase()
    );
    const targetProp = properties.find((p) => p.id === activationPropId) || property;
    if (!matched) {
      onNotify('License key not found in Centralized PureCrest Registry');
      return;
    }
    setBusy(true);
    try {
      await activateLicenseKeyWorkflow({
        license: matched,
        targetProperty: targetProp,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Activated ${matched.licenseKey} for ${targetProp.name}`);
      setActivationKeyInput('');
    } finally {
      setBusy(false);
    }
  };

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedGrantName = `${grantFirstName.trim()} ${grantLastName.trim()}`.trim();
    if (!grantEmail.trim() || !grantFirstName.trim() || !grantLastName.trim()) return;
    setBusy(true);
    try {
      await authorizeUserEmailForProperty({
        property,
        email: grantEmail.trim(),
        displayName: combinedGrantName,
        role: grantRole,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Granted ${ROLE_LABELS[grantRole]} access to ${grantEmail}`);
      setGrantEmail('');
      setGrantFirstName('');
      setGrantLastName('');
    } finally {
      setBusy(false);
    }
  };

  const outboundFeedUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ical=${encodeURIComponent(property.id)}&room=${encodeURIComponent(exportSuiteFilter)}`
      : `/?ical=${property.id}&room=${exportSuiteFilter}`;

  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [togglingChannelId, setTogglingChannelId] = useState<string | null>(null);
  const [syncingAllChannels, setSyncingAllChannels] = useState(false);

  // Channel Manager clean tabbed workspace state
  const [otaSubTab, setOtaSubTab] = useState<'channels' | 'csv' | 'ledger'>('channels');
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [lastCsvImportSummary, setLastCsvImportSummary] = useState<{
    channel: string;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  // Channel Manager CSV Import state
  const [csvChannelName, setCsvChannelName] =
    useState<OtaIntegrationRecord['channelName']>('Booking.com');
  const [csvDefaultCurrency, setCsvDefaultCurrency] = useState<ChannelCurrency>('USD');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvParsedRows, setCsvParsedRows] = useState<ParsedOtaCsvRow[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  const formatChannelError = (err: unknown, fallback: string): string =>
    getUserFriendlyErrorMessage(err, fallback, 'Admin:ChannelManager');

  const getDisplayChannelName = (name: string) =>
    name === 'Hotels.ng' ? 'Booking.com' : name;

  const normalizeChannelRoom = (room?: string) => {
    const raw = (room || '').trim();
    if (!raw || raw.toLowerCase() === 'all suites' || raw.toLowerCase() === 'all rooms') {
      return 'All Rooms';
    }
    return raw;
  };

  const persistDraftIfDirty = async (
    channel: OtaIntegrationRecord
  ): Promise<OtaIntegrationRecord> => {
    const draft = icalDrafts[channel.id];
    const propertyCurrency: ChannelCurrency = (property.currency as ChannelCurrency) || 'NGN';
    const inferredMode =
      channel.channelName === 'Direct Website Engine' ? 'hotel_collect' : 'ota_prepaid';
    const currentCommission =
      typeof channel.commissionPct === 'number'
        ? channel.commissionPct
        : getDefaultOtaCommissionPct(channel.channelName);

    if (!draft) {
      if (channel.defaultCurrency !== propertyCurrency) {
        await updateOtaChannelIcal({
          property,
          channel,
          icalImportUrl: (channel.icalImportUrl || '').trim(),
          roomNumber: normalizeChannelRoom(channel.roomNumber),
          propertyListingId: channel.propertyListingId,
          commissionPct: currentCommission,
          defaultCurrency: propertyCurrency,
          defaultNightlyRate: 0,
          paymentCollectionMode: inferredMode,
          actorRole: ROLE_LABELS[activeRole],
        });
        return {
          ...channel,
          defaultCurrency: propertyCurrency,
          defaultNightlyRate: 0,
          commissionPct: currentCommission,
          paymentCollectionMode: inferredMode,
        };
      }
      return channel;
    }

    const nextUrl = draft.url.trim();
    const nextRoom = normalizeChannelRoom(draft.room);
    const nextListingId = draft.listingId.trim() || channel.propertyListingId;
    const parsedPct = Number(draft.commissionPct);
    const nextCommission = Number.isFinite(parsedPct)
      ? Math.max(0, Math.min(50, Number(parsedPct.toFixed(2))))
      : currentCommission;
    const nextAutoSync = Boolean(draft.autoSync);

    const isDirty =
      nextUrl !== (channel.icalImportUrl || '').trim() ||
      nextRoom !== normalizeChannelRoom(channel.roomNumber) ||
      nextListingId !== (channel.propertyListingId || '').trim() ||
      Math.abs(nextCommission - currentCommission) > 0.001 ||
      nextAutoSync !== Boolean(channel.autoSync) ||
      channel.defaultCurrency !== propertyCurrency;

    if (!isDirty) return channel;

    await updateOtaChannelIcal({
      property,
      channel,
      icalImportUrl: nextUrl,
      roomNumber: nextRoom,
      propertyListingId: nextListingId,
      commissionPct: nextCommission,
      autoSync: nextAutoSync,
      defaultCurrency: propertyCurrency,
      defaultNightlyRate: 0,
      paymentCollectionMode: inferredMode,
      recalculateExistingPayouts: true,
      actorRole: ROLE_LABELS[activeRole],
    });
    setIcalDrafts((prev) => {
      const next = { ...prev };
      delete next[channel.id];
      return next;
    });
    return {
      ...channel,
      icalImportUrl: nextUrl,
      roomNumber: nextRoom,
      propertyListingId: nextListingId,
      commissionPct: nextCommission,
      autoSync: nextAutoSync,
      defaultCurrency: propertyCurrency,
      defaultNightlyRate: 0,
      paymentCollectionMode: inferredMode,
    };
  };

  const handleToggleChannelConnection = async (channel: OtaIntegrationRecord) => {
    const label = getDisplayChannelName(channel.channelName);
    setTogglingChannelId(channel.id);
    try {
      const result = await syncOtaChannelWorkflow({
        property,
        channel,
        toggleConnect: true,
        actorRole: ROLE_LABELS[activeRole],
      });
      const isNowConnected = result.connected ?? !channel.connected;
      onNotify(
        isNowConnected
          ? `${label} connected and ready to sync.`
          : `${label} disconnected. It will remain disconnected until you manually reconnect it.`
      );
    } catch (err) {
      onNotify(formatChannelError(err, `Failed updating connection status for ${label}`));
    } finally {
      setTogglingChannelId(null);
    }
  };

  const handleSyncSingleChannel = async (
    channel: OtaIntegrationRecord,
    icsRawText?: string
  ) => {
    const label = getDisplayChannelName(channel.channelName);
    if (!channel.connected) {
      onNotify(`${label} is disconnected. Click Connect before syncing.`);
      return;
    }
    setSyncingChannelId(channel.id);
    try {
      const effectiveChannel = await persistDraftIfDirty(channel);
      const result = await syncOtaChannelWorkflow({
        property,
        channel: effectiveChannel,
        rooms: sortedRooms,
        reservations,
        icsRawText,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(
        `${label}: ${result.created} new, ${result.updated} updated, ${result.cancelled} cancelled, ${result.skipped} unchanged`
      );
    } catch (err) {
      onNotify(formatChannelError(err, `Failed syncing ${label}`));
    } finally {
      setSyncingChannelId(null);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const csv = buildSampleOtaCsvTemplate(csvChannelName);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${csvChannelName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-bookings-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(`Downloaded ${csvChannelName} CSV import template`);
  };

  const handleCsvFileSelected = (file: File) => {
    setCsvFileName(file.name);
    setLastCsvImportSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseOtaCsvText(text, csvDefaultCurrency);
      setCsvParsedRows(parsed.rows);
      setCsvWarnings(parsed.warnings);
      if (parsed.rows.length === 0) {
        onNotify(parsed.warnings[0] || 'No valid booking rows found in this CSV file.');
      } else {
        onNotify(
          `Parsed ${parsed.rows.length} reservation row(s) from ${file.name}${
            parsed.skippedRows > 0 ? ` (${parsed.skippedRows} skipped)` : ''
          }`
        );
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = async () => {
    if (csvParsedRows.length === 0) return;
    setCsvImporting(true);
    try {
      const res = await importOtaCsvReservationsWorkflow({
        property,
        channelName: csvChannelName,
        defaultCurrency: csvDefaultCurrency,
        rows: csvParsedRows,
        rooms: sortedRooms,
        reservations,
        otaChannels,
        actorRole: ROLE_LABELS[activeRole],
      });
      setLastCsvImportSummary({
        channel: csvChannelName,
        created: res.created,
        updated: res.updated,
        skipped: res.skipped,
      });
      onNotify(
        `Saved ${res.created} new & ${res.updated} updated ${csvChannelName} reservation(s) to Reservations`
      );
      setCsvParsedRows([]);
      setCsvWarnings([]);
      setCsvFileName('');
    } catch (err) {
      onNotify(formatChannelError(err, `Failed importing ${csvChannelName} CSV`));
    } finally {
      setCsvImporting(false);
    }
  };

  const handleSyncAllChannels = async () => {
    const syncable = otaChannels.filter((c) => {
      const url = (icalDrafts[c.id]?.url ?? c.icalImportUrl ?? '').trim();
      return c.connected && Boolean(url);
    });
    if (syncable.length === 0) {
      onNotify('Add an inbound .ics URL to at least one connected channel first.');
      return;
    }
    setSyncingAllChannels(true);
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalCancelled = 0;
    let totalErrors = 0;
    let firstError = '';
    try {
      for (const ch of syncable) {
        try {
          const effectiveChannel = await persistDraftIfDirty(ch);
          // Omit stale reservations prop so each sequential channel reads newly committed bookings from Firestore
          const res = await syncOtaChannelWorkflow({
            property,
            channel: effectiveChannel,
            rooms: sortedRooms,
            actorRole: ROLE_LABELS[activeRole],
          });
          totalCreated += res.created;
          totalUpdated += res.updated;
          totalCancelled += res.cancelled;
        } catch (err) {
          totalErrors += 1;
          if (!firstError) {
            firstError = `${ch.channelName}: ${formatChannelError(err, 'Sync failed.')}`;
          }
        }
      }
      onNotify(
        `Synced ${syncable.length} OTA feed(s): ${totalCreated} new, ${totalUpdated} updated, ${totalCancelled} cancelled${
          totalErrors > 0 ? ` · ${totalErrors} error(s)${firstError ? ` (${firstError})` : ''}` : ''
        }`
      );
    } finally {
      setSyncingAllChannels(false);
    }
  };

  const handleDownloadIcs = (roomFilter?: string) => {
    const ics = buildPropertyIcalFeed({
      propertyName: property.name,
      reservations,
      blockedDates,
      roomNumberFilter: roomFilter,
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = roomFilter && roomFilter !== 'ALL' ? `-${roomFilter}` : '-all-rooms';
    a.download = `${property.code.toLowerCase()}${suffix}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(`Downloaded iCal calendar feed (${roomFilter && roomFilter !== 'ALL' ? roomFilter : 'All Rooms'})`);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPct = Number(newCommissionPct);
    const safeCommissionPct = Number.isFinite(parsedPct)
      ? Math.max(0, Math.min(50, parsedPct))
      : getDefaultOtaCommissionPct(newChannelName);
    const propertyCurrency: ChannelCurrency = (property.currency as ChannelCurrency) || 'NGN';
    setBusy(true);
    try {
      await createOtaChannelWithIcal({
        property,
        channelName: newChannelName,
        propertyListingId: newListingId,
        roomNumber: newChannelSuite,
        icalImportUrl: newIcalUrl,
        commissionPct: safeCommissionPct,
        defaultCurrency: propertyCurrency,
        defaultNightlyRate: 0,
        paymentCollectionMode:
          newChannelName === 'Direct Website Engine' ? 'hotel_collect' : 'ota_prepaid',
        autoSync: newAutoSync,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(
        `Added ${newChannelName} (${newChannelSuite} · ${safeCommissionPct}% commission · ${propertyCurrency}) to Channel Manager`
      );
      setShowChannelForm(false);
      setNewListingId('');
      setNewIcalUrl('');
      setNewCommissionPct(String(getDefaultOtaCommissionPct(newChannelName)));
    } catch (err) {
      onNotify(
        getUserFriendlyErrorMessage(
          err,
          `Unable to add ${newChannelName}. Please try again.`,
          'Admin:AddChannel'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  if (
    (section === 'properties_admin' || section === 'rbac_audit' || section === 'deployment') &&
    activeRole !== 'pch_admin'
  ) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-2">
        <Shield className="w-7 h-7 text-slate-400 mx-auto" />
        <h2 className="font-display text-base font-bold text-slate-900">
          Section Restricted to Platform Administration
        </h2>
        <p className="text-xs text-slate-500">
          This configuration module is managed centrally and is not part of the property workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {section === 'properties_admin'
              ? `${cms.pages.properties_admin.title} (${properties.length} Properties)`
              : section === 'licensing' && activeRole !== 'pch_admin'
                ? 'Property Software Licensing & Activation'
                : cms.pages[section].title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages[section].subtitle}
          </p>
        </div>

        {section === 'ota_channels' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncingAllChannels}
              onClick={() => void handleSyncAllChannels()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingAllChannels ? 'animate-spin' : ''}`} />
              <span>{syncingAllChannels ? 'Syncing...' : 'Sync Connected'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOtaSubTab('channels');
                setShowChannelForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#061539] hover:bg-[#0d245d] text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Channel</span>
            </button>
          </div>
        )}

        {section === 'properties_admin' && activeRole === 'pch_admin' && (
          <button
            type="button"
            onClick={() => setShowPropForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{cms.pages.properties_admin.ctaLabel || 'Add New Property'}</span>
          </button>
        )}
      </div>

      {/* SECTION: CHANNEL MANAGER & iCAL LINKS */}
      {section === 'ota_channels' &&
        (() => {
          const connectedCount = otaChannels.filter((c) => c.connected).length;
          const otaBookings = reservations
            .filter((r) => isOtaBookingChannel(r.channel))
            .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));
          const otaPaidNgnTotal = otaBookings.reduce((sum, r) => {
            const p = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
            return sum + p.otaPaidAmount;
          }, 0);
          const expectedNgnTotal = otaBookings.reduce((sum, r) => {
            const p = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
            return sum + p.expectedPayoutNgn;
          }, 0);
          const propertyCurrency = (property.currency as ChannelCurrency) || 'NGN';

          return (
            <div className="space-y-5">
              {/* Calm Summary Strip & Clean Segmented Tabs */}
              <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Connected Channels</span>
                    <span className="font-mono-tabular text-sm font-bold text-slate-900">
                      {connectedCount}{' '}
                      <span className="font-normal text-slate-400">/ {otaChannels.length}</span>
                    </span>
                  </div>
                  <div className="h-7 w-px bg-slate-200 hidden sm:block" />
                  <div>
                    <span className="text-slate-500 block text-[11px]">OTA Reservations</span>
                    <span className="font-mono-tabular text-sm font-bold text-slate-900">
                      {otaBookings.length}
                    </span>
                  </div>
                  <div className="h-7 w-px bg-slate-200 hidden sm:block" />
                  <div>
                    <span className="text-slate-500 block text-[11px]">Synced Rate Currency</span>
                    <span className="font-mono-tabular text-sm font-bold text-slate-900">
                      {propertyCurrency}
                      <span className="font-sans font-normal text-xs text-slate-500 ml-1.5">
                        (Room rates)
                      </span>
                    </span>
                  </div>
                </div>

                <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start md:self-auto">
                  {(
                    [
                      { id: 'channels', label: 'Channels & iCal', count: otaChannels.length },
                      { id: 'csv', label: 'Import CSV', count: null },
                      { id: 'ledger', label: 'Export & Bookings', count: otaBookings.length },
                    ] as Array<{
                      id: 'channels' | 'csv' | 'ledger';
                      label: string;
                      count: number | null;
                    }>
                  ).map((tab) => {
                    const active = otaSubTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setOtaSubTab(tab.id)}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          active
                            ? 'bg-white text-[#061539] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                        {tab.count !== null && (
                          <span className="ml-1.5 font-mono-tabular text-[11px] text-slate-400">
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TAB 1: CHANNELS & iCAL */}
              {otaSubTab === 'channels' && (
                <div className="space-y-4">
                  {showChannelForm && (
                    <form
                      onSubmit={handleCreateChannel}
                      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <h2 className="font-display text-sm font-bold text-slate-900">
                            Connect New OTA Channel
                          </h2>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Add an inbound iCal (.ics) feed for Booking.com, Airbnb, Expedia, or VRBO.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowChannelForm(false)}
                          className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                          aria-label="Close form"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Channel Platform
                          </label>
                          <select
                            value={newChannelName}
                            onChange={(e) => {
                              const val = e.target.value as OtaIntegrationRecord['channelName'];
                              setNewChannelName(val);
                              setNewCommissionPct(String(getDefaultOtaCommissionPct(val)));
                            }}
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                          >
                            <option value="Booking.com">Booking.com (15%)</option>
                            <option value="Airbnb">Airbnb (14%)</option>
                            <option value="Expedia">Expedia (18%)</option>
                            <option value="VRBO">VRBO (12%)</option>
                            <option value="Custom iCal">Custom iCal (10%)</option>
                            <option value="Direct Website Engine">Direct Website Engine (0%)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Room Mapping
                          </label>
                          <select
                            value={newChannelSuite}
                            onChange={(e) => setNewChannelSuite(e.target.value)}
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                          >
                            <option value="All Rooms">All Rooms (Property-wide)</option>
                            {sortedRooms.map((r) => (
                              <option key={r.id} value={r.roomNumber}>
                                {r.roomNumber} · {r.roomType}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Booking Commission (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={0.1}
                            placeholder="e.g. 15"
                            value={newCommissionPct}
                            onChange={(e) => setNewCommissionPct(e.target.value)}
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-medium text-slate-700 mb-1">
                            Inbound iCal URL (.ics)
                          </label>
                          <input
                            type="text"
                            placeholder="https://... or webcal://..."
                            value={newIcalUrl}
                            onChange={(e) => setNewIcalUrl(e.target.value)}
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                          />
                        </div>

                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Listing ID (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. BKG-ENUGU-88412"
                            value={newListingId}
                            onChange={(e) => setNewListingId(e.target.value)}
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-1">
                          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newAutoSync}
                              onChange={(e) => setNewAutoSync(e.target.checked)}
                            />
                            <span>Enable auto-sync</span>
                          </label>
                          <p className="text-[11px] text-slate-500">
                            Synced bookings automatically use your property currency ({propertyCurrency}) and room rates.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowChannelForm(false)}
                          className="px-3.5 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-4 py-2 bg-[#061539] hover:bg-[#0d245d] disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                        >
                          Save &amp; Connect Channel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Clean 2-Column Channel Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {otaChannels.map((ch) => {
                      const displayName = getDisplayChannelName(ch.channelName);
                      const effectiveCommission =
                        typeof ch.commissionPct === 'number'
                          ? ch.commissionPct
                          : getDefaultOtaCommissionPct(displayName);
                      const draft = icalDrafts[ch.id] ?? {
                        url: ch.icalImportUrl || '',
                        room: normalizeChannelRoom(ch.roomNumber),
                        listingId: ch.propertyListingId || '',
                        commissionPct: String(effectiveCommission),
                        autoSync: Boolean(ch.autoSync),
                      };
                      const resolvedSource =
                        ch.channelName === 'Direct Website Engine'
                          ? 'Direct Web'
                          : ch.channelName === 'Hotels.ng'
                            ? 'Booking.com'
                            : ch.channelName;
                      const normalizedChRoom = normalizeChannelRoom(ch.roomNumber);
                      const isSpecificRoomMap =
                        Boolean(normalizedChRoom) && normalizedChRoom !== 'All Rooms';
                      const liveChannelBookingsCount = reservations.filter((r) => {
                        if (r.channel !== resolvedSource || r.status === 'cancelled') return false;
                        if (isSpecificRoomMap) {
                          return (
                            (r.roomNumber || '').trim().toLowerCase() ===
                              normalizedChRoom.toLowerCase() ||
                            r.roomId === normalizedChRoom
                          );
                        }
                        return true;
                      }).length;
                      const displayImportedCount = Math.max(
                        liveChannelBookingsCount,
                        ch.bookingsImported || 0
                      );
                      const parsedDraftFee = Number(draft.commissionPct);
                      const previewFeePct = Number.isFinite(parsedDraftFee)
                        ? Math.max(0, Math.min(50, parsedDraftFee))
                        : effectiveCommission;
                      const suiteParam = encodeURIComponent(
                        !draft.room || draft.room === 'All Rooms' ? 'ALL' : draft.room
                      );
                      const channelExportUrl =
                        ch.icalExportUrl ||
                        (typeof window !== 'undefined'
                          ? `${window.location.origin}/?ical=${encodeURIComponent(property.id)}&room=${suiteParam}`
                          : `/?ical=${property.id}&room=${suiteParam}`);
                      const isExpanded = expandedChannelId === ch.id;

                      return (
                        <div
                          key={ch.id}
                          className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors hover:border-slate-300"
                        >
                          {/* Top Row: Identity & Connection Status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                                  ch.connected
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-400'
                                }`}
                              >
                                <Globe className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h2 className="font-display text-sm font-bold text-slate-900 truncate">
                                  {displayName}
                                </h2>
                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                  {draft.room || 'All Rooms'} ·{' '}
                                  <button
                                    type="button"
                                    onClick={() => setExpandedChannelId(ch.id)}
                                    title="Click to edit OTA booking fee percentage"
                                    className="font-mono-tabular font-semibold text-[#1c46be] hover:underline cursor-pointer"
                                  >
                                    {draft.commissionPct || '0'}% OTA fee
                                  </button>{' '}
                                  · {propertyCurrency}
                                  {draft.url.trim() ? ' · iCal linked' : ' · No iCal URL'}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`text-xs font-semibold shrink-0 ${
                                ch.connected ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {ch.connected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {/* Clean 3-Column Metadata Row */}
                          <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-100 text-xs">
                            <div className="min-w-0">
                              <span className="block text-[11px] text-slate-400">Listing ID</span>
                              <span className="font-mono-tabular font-medium text-slate-800 block truncate mt-0.5">
                                {draft.listingId || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[11px] text-slate-400">Synced Bookings</span>
                              <span className="font-mono-tabular font-semibold text-slate-900 block mt-0.5">
                                {displayImportedCount} booking{displayImportedCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[11px] text-slate-400">Last Synced</span>
                              <span className="font-mono-tabular text-slate-700 block truncate mt-0.5">
                                {ch.lastSyncedIso
                                  ? ch.lastSyncedIso.slice(0, 16).replace('T', ' ')
                                  : 'Not yet'}
                              </span>
                            </div>
                          </div>

                          {/* Expandable Edit iCal & Booking Fee Drawer */}
                          {isExpanded && (
                            <div className="space-y-3.5 bg-slate-50/70 border border-slate-200/80 rounded-lg p-4 text-xs">
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                                <span className="font-display font-bold text-[#061539] text-xs">
                                  Edit {displayName} iCal &amp; Booking Fee
                                </span>
                                <span className="font-mono-tabular text-[11px] text-slate-600">
                                  OTA keeps {previewFeePct}% · Net payout{' '}
                                  <strong className="text-emerald-700">
                                    {Number((100 - previewFeePct).toFixed(2))}%
                                  </strong>
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    OTA Booking Fee (%)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={50}
                                    step={0.1}
                                    placeholder="e.g. 15"
                                    value={draft.commissionPct}
                                    onChange={(e) =>
                                      setIcalDrafts((prev) => ({
                                        ...prev,
                                        [ch.id]: {
                                          ...draft,
                                          commissionPct: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full h-9 border border-slate-300 focus:border-[#1c46be] focus:outline-none rounded-lg px-2.5 font-mono-tabular bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Room Mapping
                                  </label>
                                  <select
                                    value={draft.room}
                                    onChange={(e) =>
                                      setIcalDrafts((prev) => ({
                                        ...prev,
                                        [ch.id]: { ...draft, room: e.target.value },
                                      }))
                                    }
                                    className="w-full h-9 border border-slate-200 rounded-lg px-2.5 bg-white"
                                  >
                                    <option value="All Rooms">All Rooms</option>
                                    {sortedRooms.map((r) => (
                                      <option key={r.id} value={r.roomNumber}>
                                        {r.roomNumber} · {r.roomType}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Property Listing ID
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="OTA Listing ID"
                                    value={draft.listingId}
                                    onChange={(e) =>
                                      setIcalDrafts((prev) => ({
                                        ...prev,
                                        [ch.id]: { ...draft, listingId: e.target.value },
                                      }))
                                    }
                                    className="w-full h-9 border border-slate-200 rounded-lg px-2.5 font-mono-tabular bg-white"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Inbound iCal Link (.ics)
                                </label>
                                <input
                                  type="text"
                                  placeholder="https://... or webcal://... (.ics)"
                                  value={draft.url}
                                  onChange={(e) =>
                                    setIcalDrafts((prev) => ({
                                      ...prev,
                                      [ch.id]: { ...draft, url: e.target.value },
                                    }))
                                  }
                                  className="w-full h-9 border border-slate-200 rounded-lg px-2.5 font-mono-tabular bg-white"
                                />
                                <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                                  <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={draft.autoSync}
                                      onChange={(e) =>
                                        setIcalDrafts((prev) => ({
                                          ...prev,
                                          [ch.id]: { ...draft, autoSync: e.target.checked },
                                        }))
                                      }
                                    />
                                    <span>Auto-sync every 10 minutes</span>
                                  </label>
                                  <span className="text-[11px] text-slate-500">
                                    Currency matches {property.name} ({propertyCurrency})
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200/70">
                                <div className="flex items-center gap-3">
                                  <label
                                    className={`inline-flex items-center gap-1.5 font-medium ${
                                      ch.connected
                                        ? 'text-slate-700 hover:text-slate-950 cursor-pointer'
                                        : 'text-slate-400 cursor-not-allowed'
                                    }`}
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Upload .ics</span>
                                    <input
                                      type="file"
                                      disabled={!ch.connected}
                                      accept=".ics,text/calendar"
                                      className="sr-only"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          const text =
                                            typeof reader.result === 'string' ? reader.result : '';
                                          if (text) void handleSyncSingleChannel(ch, text);
                                        };
                                        reader.readAsText(file);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() => handleCopy(channelExportUrl, `exp-${ch.id}`)}
                                    className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline font-medium cursor-pointer"
                                  >
                                    {copiedKey === `exp-${ch.id}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Copied Export Link</span>
                                      </>
                                    ) : (
                                      <>
                                        <Link2 className="w-3.5 h-3.5" />
                                        <span>Copy Export Feed</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await deleteOtaChannel({
                                          property,
                                          channel: ch,
                                          actorRole: ROLE_LABELS[activeRole],
                                        });
                                        onNotify(`Removed ${displayName}`);
                                      } catch (err) {
                                        onNotify(
                                          formatChannelError(err, `Failed removing ${displayName}`)
                                        );
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Remove</span>
                                  </button>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIcalDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[ch.id];
                                        return next;
                                      });
                                      setExpandedChannelId(null);
                                    }}
                                    className="h-9 px-3 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-medium cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={async () => {
                                      setBusy(true);
                                      try {
                                        const parsedPct = Number(draft.commissionPct);
                                        const safePct = Number.isFinite(parsedPct)
                                          ? Math.max(0, Math.min(50, Number(parsedPct.toFixed(2))))
                                          : effectiveCommission;
                                        const res = await updateOtaChannelIcal({
                                          property,
                                          channel: ch,
                                          icalImportUrl: draft.url,
                                          roomNumber: draft.room,
                                          propertyListingId: draft.listingId,
                                          commissionPct: safePct,
                                          autoSync: draft.autoSync,
                                          defaultCurrency: propertyCurrency,
                                          defaultNightlyRate: 0,
                                          paymentCollectionMode:
                                            ch.channelName === 'Direct Website Engine'
                                              ? 'hotel_collect'
                                              : 'ota_prepaid',
                                          recalculateExistingPayouts: true,
                                          actorRole: ROLE_LABELS[activeRole],
                                        });
                                        setIcalDrafts((prev) => {
                                          const next = { ...prev };
                                          delete next[ch.id];
                                          return next;
                                        });
                                        setExpandedChannelId(null);
                                        onNotify(
                                          `Saved ${displayName} (${safePct}% OTA fee)${
                                            res.updatedReservationsCount > 0
                                              ? ` · Recalculated expected payout on ${res.updatedReservationsCount} reservation${res.updatedReservationsCount === 1 ? '' : 's'}`
                                              : ''
                                          }`
                                        );
                                      } catch (err) {
                                        onNotify(
                                          formatChannelError(
                                            err,
                                            `Unable to save ${displayName} settings`
                                          )
                                        );
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                    className="h-9 px-4 bg-[#061539] hover:bg-[#0d245d] disabled:opacity-50 text-white rounded-lg font-semibold shrink-0 cursor-pointer"
                                  >
                                    {busy ? 'Saving...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Bottom Action Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={
                                  togglingChannelId === ch.id || syncingChannelId === ch.id
                                }
                                onClick={() => void handleToggleChannelConnection(ch)}
                                className={`px-3 py-1.5 border rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                                  ch.connected
                                    ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                    : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                }`}
                              >
                                {togglingChannelId === ch.id
                                  ? 'Updating...'
                                  : ch.connected
                                    ? 'Disconnect'
                                    : 'Connect'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedChannelId((curr) => (curr === ch.id ? null : ch.id))
                                }
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-semibold cursor-pointer transition-colors ${
                                  isExpanded
                                    ? 'border-[#1c46be] bg-[#1c46be]/5 text-[#1c46be]'
                                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>{isExpanded ? 'Close Edit' : 'Edit iCal / Fee'}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            <button
                              type="button"
                              disabled={
                                !ch.connected ||
                                syncingChannelId === ch.id ||
                                togglingChannelId === ch.id
                              }
                              onClick={() => void handleSyncSingleChannel(ch)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  syncingChannelId === ch.id ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {syncingChannelId === ch.id
                                  ? 'Syncing...'
                                  : ch.connected
                                    ? 'Sync iCal'
                                    : 'Paused'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: IMPORT OTA RESERVATIONS CSV */}
              {otaSubTab === 'csv' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">
                        Import OTA Reservations from CSV
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Upload Booking.com, Airbnb, Expedia, or VRBO CSV exports to save reservations directly to your property ledger in exact USD/original currency and converted ₦.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadCsvTemplate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Template</span>
                    </button>
                  </div>

                  {lastCsvImportSummary && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-emerald-900">
                        <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>
                          Saved{' '}
                          <strong className="font-mono-tabular">
                            {lastCsvImportSummary.created}
                          </strong>{' '}
                          new and{' '}
                          <strong className="font-mono-tabular">
                            {lastCsvImportSummary.updated}
                          </strong>{' '}
                          updated <strong>{lastCsvImportSummary.channel}</strong> reservation(s) to
                          Reservations.
                        </span>
                      </div>
                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate('reservations')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold cursor-pointer"
                        >
                          <span>View in Reservations</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1.5">
                        OTA Platform
                      </label>
                      <select
                        value={csvChannelName}
                        onChange={(e) => {
                          const val = e.target.value as OtaIntegrationRecord['channelName'];
                          setCsvChannelName(val);
                          setCsvDefaultCurrency(getDefaultOtaChannelCurrency(val));
                        }}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                      >
                        <option value="Booking.com">Booking.com</option>
                        <option value="Airbnb">Airbnb</option>
                        <option value="Expedia">Expedia</option>
                        <option value="VRBO">VRBO</option>
                        <option value="Custom iCal">Custom iCal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1.5">
                        Default Currency
                      </label>
                      <select
                        value={csvDefaultCurrency}
                        onChange={(e) =>
                          setCsvDefaultCurrency(e.target.value as ChannelCurrency)
                        }
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white font-semibold"
                      >
                        {SUPPORTED_CHANNEL_CURRENCIES.map((cur) => (
                          <option key={cur} value={cur}>
                            {cur}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1.5">
                        CSV Export File
                      </label>
                      <label className="flex items-center justify-center gap-2 h-10 px-3 border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg font-semibold cursor-pointer transition-colors">
                        <FileSpreadsheet className="w-4 h-4 text-[#061539]" />
                        <span className="truncate">
                          {csvFileName || 'Choose .csv file'}
                        </span>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCsvFileSelected(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {csvWarnings.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-0.5">
                      {csvWarnings.slice(0, 4).map((w, idx) => (
                        <p key={idx}>• {w}</p>
                      ))}
                    </div>
                  )}

                  {csvParsedRows.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs min-w-[760px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              <th className="py-2.5 px-4">Guest &amp; Ref</th>
                              <th className="py-2.5 px-4">Stay Dates</th>
                              <th className="py-2.5 px-4">Room</th>
                              <th className="py-2.5 px-4 text-right">OTA Paid</th>
                              <th className="py-2.5 px-4 text-right">Converted (₦)</th>
                              <th className="py-2.5 px-4 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {csvParsedRows.slice(0, 15).map((row) => {
                              const fx = getFxRateToNgn(
                                row.currency,
                                property.usdExchangeRateNgn
                              );
                              const paidOrig =
                                row.otaPaidSourceAmount ?? row.sourceTotalAmount ?? 0;
                              const paidNgn =
                                row.currency === 'NGN'
                                  ? Math.round(paidOrig)
                                  : Math.round(paidOrig * fx);
                              return (
                                <tr key={`${row.rowNumber}-${row.externalRef}`}>
                                  <td className="py-2.5 px-4">
                                    <p className="font-semibold text-slate-900">
                                      {row.guestName}
                                    </p>
                                    <p className="font-mono-tabular text-[11px] text-slate-500">
                                      {row.externalRef}
                                    </p>
                                  </td>
                                  <td className="py-2.5 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                                    {row.checkInDate} → {row.checkOutDate} ({row.nights}n)
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-700">
                                    {row.roomHint || 'Auto-assign'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono-tabular font-bold text-[#061539] whitespace-nowrap">
                                    {formatChannelCurrency(paidOrig, row.currency)}{' '}
                                    {row.currency}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono-tabular font-semibold text-emerald-700 whitespace-nowrap">
                                    {formatNgn(paidNgn)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right capitalize text-slate-700">
                                    {row.status}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-600">
                          Ready to save{' '}
                          <strong className="text-slate-900">{csvParsedRows.length}</strong>{' '}
                          {csvChannelName} reservation(s) into Reservations.
                          {csvParsedRows.length > 15 ? ' (Showing first 15 rows)' : ''}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCsvParsedRows([]);
                              setCsvWarnings([]);
                              setCsvFileName('');
                            }}
                            className="px-3.5 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            disabled={csvImporting}
                            onClick={() => void handleConfirmCsvImport()}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                          >
                            {csvImporting
                              ? 'Saving to Reservations...'
                              : `Save ${csvParsedRows.length} to Reservations`}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: OUTBOUND EXPORT & SYNCED OTA BOOKINGS */}
              {otaSubTab === 'ledger' && (
                <div className="space-y-4">
                  {/* Outbound iCal Feed Export Generator */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#061539]" />
                        <h2 className="font-display text-sm font-bold text-slate-900">
                          Outbound Property iCal Feed (.ics)
                        </h2>
                      </div>
                      <p className="text-xs text-slate-500">
                        Paste this link into Booking.com, Airbnb, or VRBO to block reserved dates automatically.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <select
                        value={exportSuiteFilter}
                        onChange={(e) => setExportSuiteFilter(e.target.value)}
                        className="h-9 border border-slate-200 rounded-lg px-3 bg-white"
                      >
                        <option value="ALL">All Rooms ({property.code})</option>
                        {sortedRooms.map((r) => (
                          <option key={r.id} value={r.roomNumber}>
                            {r.roomNumber} · {r.roomType}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleCopy(outboundFeedUrl, 'outbound-ical')}
                        className="h-9 inline-flex items-center gap-1.5 px-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-800 cursor-pointer"
                      >
                        {copiedKey === 'outbound-ical' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadIcs(exportSuiteFilter)}
                        className="h-9 inline-flex items-center gap-1.5 px-3.5 bg-[#061539] hover:bg-[#0d245d] text-white rounded-lg font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .ics</span>
                      </button>
                    </div>
                  </div>

                  {/* Synced OTA Reservations Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-sm font-bold text-slate-900">
                          OTA Reservations Ledger
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Exact booking amounts in original currency alongside Naira payouts.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tabular">
                        <div>
                          <span className="text-slate-400 font-sans mr-1.5">OTA Prepayments:</span>
                          <strong className="text-[#061539]">
                            {formatNgn(otaPaidNgnTotal)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 font-sans mr-1.5">Exp. Payout:</span>
                          <strong className="text-emerald-700">
                            {formatNgn(expectedNgnTotal)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {otaBookings.length === 0 ? (
                      <div className="px-5 py-10 text-center text-xs text-slate-500">
                        No OTA bookings imported yet. Sync a connected iCal channel or import a CSV export to populate this ledger.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[880px] text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              <th className="py-2.5 px-4">Guest &amp; Ref</th>
                              <th className="py-2.5 px-4">Channel</th>
                              <th className="py-2.5 px-4">Room &amp; Dates</th>
                              <th className="py-2.5 px-4 text-right">Booking Total</th>
                              <th className="py-2.5 px-4 text-right">Paid to OTA</th>
                              <th className="py-2.5 px-4 text-right">Expected Payout</th>
                              <th className="py-2.5 px-4 text-right">Direct Paid</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {otaBookings.map((r) => {
                              const pay = getReservationPaymentSummary(
                                r,
                                property.usdExchangeRateNgn
                              );
                              return (
                                <tr key={r.id} className="hover:bg-slate-50/70">
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <p className="font-semibold text-slate-900">{r.guestName}</p>
                                    <p className="font-mono-tabular text-[11px] text-slate-500">
                                      {r.bookingRef}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <span className="font-semibold text-slate-800">
                                      {formatBookingSourceLabel(r.channel)}
                                    </span>
                                    <span className="ml-1.5 font-mono-tabular text-[11px] text-slate-500">
                                      {pay.sourceCurrency}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                                    <span className="font-semibold text-slate-900">
                                      {r.roomNumber || 'Unassigned'}
                                    </span>{' '}
                                    · {r.checkInDate} → {r.checkOutDate} ({r.nights}n)
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                                    <p className="font-bold text-slate-900">
                                      {formatChannelCurrency(
                                        pay.sourceTotalAmount,
                                        pay.sourceCurrency
                                      )}{' '}
                                      {pay.sourceCurrency}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      {pay.sourceCurrency === 'USD'
                                        ? `≈ ${formatNgn(pay.totalAmount)}`
                                        : `≈ ${formatUsd(pay.totalAmountUsd)} USD`}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                                    <p className="font-bold text-[#061539]">
                                      {formatChannelCurrency(
                                        pay.otaPaidSourceAmount,
                                        pay.sourceCurrency
                                      )}{' '}
                                      {pay.sourceCurrency}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      ≈ {formatNgn(pay.otaPaidAmount)}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                                    <p className="font-semibold text-emerald-700">
                                      {formatNgn(pay.expectedPayoutNgn)}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      ≈ {formatUsd(pay.expectedPayoutUsd)} USD
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-700 whitespace-nowrap">
                                    <p>{formatNgn(pay.hotelPaidAmount)}</p>
                                    {pay.hotelPaidAmount > 0 && (
                                      <p className="text-[10px] text-slate-500">
                                        ≈ {formatUsd(pay.hotelPaidUsd)} USD
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* SECTION: MULTI-PROPERTY ADMIN */}
      {section === 'properties_admin' && (
        <div className="space-y-6">
          {showPropForm && (
            <form
              onSubmit={handleCreateProperty}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Provision New Client Property, Subdomain &amp; Property Admin
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Assigns permanent Property ID (<span className="font-mono-tabular font-semibold text-[#1c46be]">PCH-PROP-XXXXXX</span>), custom client subdomain, active license, and initial Property Admin credentials.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Name *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Lagos Harbour Suites"
                    value={propName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPropName(val);
                      if (!propSubdomainSlug) {
                        // auto-preview remains dynamic unless explicitly typed
                      }
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Code *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. LHS-LOS-01"
                    value={propCode}
                    onChange={(e) => setPropCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Custom Subdomain Slug
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. harbour"
                    value={propSubdomainSlug}
                    onChange={(e) => setPropSubdomainSlug(normalizeSubdomainSlug(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular lowercase"
                  />
                  <span className="text-[10px] font-mono-tabular text-[#1c46be] block mt-0.5">
                    https://{propSubdomainSlug || normalizeSubdomainSlug(propName) || 'client'}.{savedRootDomain}
                  </span>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Initial License Plan</label>
                  <select
                    value={propInitialPlan}
                    onChange={(e) => setPropInitialPlan(e.target.value as LicenseRecord['plan'])}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Starter">Starter</option>
                    <option value="Professional">Professional</option>
                    <option value="Enterprise">Enterprise</option>
                    <option value="Lifetime Sovereign">Lifetime Sovereign</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">City *</label>
                  <input
                    required
                    type="text"
                    value={propCity}
                    onChange={(e) => setPropCity(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">State *</label>
                  <input
                    required
                    type="text"
                    value={propState}
                    onChange={(e) => setPropState(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    placeholder="Street & district"
                    value={propAddress}
                    onChange={(e) => setPropAddress(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Property Admin Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Adaobi Okafor"
                    value={propAdminName}
                    onChange={(e) => setPropAdminName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Property Admin Email *
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="gm@clienthotel.com"
                    value={propAdminEmail}
                    onChange={(e) => setPropAdminEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Admin Initial Password (Optional)
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Min 6 chars (sends verification)"
                    value={propAdminPassword}
                    onChange={(e) => setPropAdminPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Rooms</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={propRooms}
                      onChange={(e) => setPropRooms(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Base Rate (₦)</label>
                    <input
                      type="number"
                      min={10000}
                      step={5000}
                      value={propBaseRate}
                      onChange={(e) => setPropBaseRate(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPropForm(false)}
                  className="px-4 py-2 text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                >
                  {busy ? 'Provisioning Client...' : 'Create Client Property & Admin'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {properties.map((p) => {
              const isCurrent = p.id === property.id;
              const slug = getPropertySubdomainSlug(p);
              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-xl p-5 space-y-3 ${
                    isCurrent ? 'border-emerald-600' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono-tabular font-bold text-[#1c46be]">
                          {getPropertySystemId(p)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular font-semibold">{p.code}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {p.city}, {p.state}
                        </span>
                      </div>
                      <h3 className="font-display text-base font-bold text-slate-900 mt-1">
                        {p.name}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">{p.address}</p>
                    </div>
                    <span
                      className={`text-xs font-semibold capitalize ${
                        p.status === 'suspended'
                          ? 'text-rose-700'
                          : p.status === 'onboarding'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
                    <div>
                      <p className="text-slate-500">Rooms</p>
                      <p className="font-mono-tabular font-semibold text-slate-900">
                        {p.roomCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Plan</p>
                      <p className="font-semibold text-slate-900">
                        {p.licensePlan || 'Starter'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">License Key</p>
                      <p className="font-mono-tabular text-slate-800 truncate">
                        {p.licenseKey || 'Pending'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      Admin: <strong className="text-slate-700">{p.adminEmail}</strong>
                    </span>
                    <span className="font-mono-tabular text-[#1c46be]">
                      {slug}.{savedRootDomain} · /staff
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTenantProp(p);
                        setEditTenantName(p.name);
                        setEditTenantSlug(slug);
                        setEditTenantAdminEmail(p.adminEmail);
                        setEditTenantStatus(p.status);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit Subdomain &amp; Admin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectProperty(p.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        isCurrent
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {isCurrent ? 'Active Workspace' : 'Switch to Property'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {editingTenantProp && (
            <div className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4">
              <form
                onSubmit={handleSaveTenantConfig}
                className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Configure Client Subdomain &amp; Admin
                    </h3>
                    <p className="text-[11px] font-mono-tabular text-[#1c46be]">
                      {getPropertySystemId(editingTenantProp)} · {editingTenantProp.code}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingTenantProp(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Property Name</label>
                    <input
                      required
                      type="text"
                      value={editTenantName}
                      onChange={(e) => setEditTenantName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Client Subdomain Slug
                    </label>
                    <input
                      required
                      type="text"
                      value={editTenantSlug}
                      onChange={(e) => setEditTenantSlug(normalizeSubdomainSlug(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular lowercase"
                    />
                    <span className="text-[10px] font-mono-tabular text-slate-500 mt-0.5 block">
                      Portal URL: https://{editTenantSlug || 'client'}.{savedRootDomain}
                    </span>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Primary Property Admin Email
                    </label>
                    <input
                      required
                      type="email"
                      value={editTenantAdminEmail}
                      onChange={(e) => setEditTenantAdminEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Client Status</label>
                    <select
                      value={editTenantStatus}
                      onChange={(e) =>
                        setEditTenantStatus(e.target.value as PropertyRecord['status'])
                      }
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="active">Active</option>
                      <option value="onboarding">Onboarding</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingTenantProp(null)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 bg-[#1c46be] hover:bg-[#17399c] disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                  >
                    {busy ? 'Saving...' : 'Save Client Settings'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* SECTION: SOFTWARE LICENSING & ACTIVATION */}
      {section === 'licensing' && (
        <div className="space-y-6">
          <div className={`grid grid-cols-1 ${activeRole === 'pch_admin' ? 'lg:grid-cols-2' : ''} gap-6`}>
            {/* License Key Generator (PCH Super Admin Only) */}
            {activeRole === 'pch_admin' && (
              <form
                onSubmit={handleGenerateLicense}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
              >
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <KeyRound className="w-4 h-4 text-emerald-700" />
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    PureCrest License Key Generator
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Target Property
                    </label>
                    <select
                      value={licPropId}
                      onChange={(e) => setLicPropId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    >
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Subscription Tier
                    </label>
                    <select
                      value={licPlan}
                      onChange={(e) => {
                        const next = e.target.value as LicenseRecord['plan'];
                        setLicPlan(next);
                        if (next === 'Lifetime Sovereign') setLicCycle('lifetime');
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="Starter">Starter (Up to 12 rooms)</option>
                      <option value="Professional">Professional (Up to 30 rooms)</option>
                      <option value="Enterprise">Enterprise (Up to 80 rooms)</option>
                      <option value="Lifetime Sovereign">Lifetime Sovereign (Up to 250 rooms)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Billing &amp; Expiry Model
                    </label>
                    <select
                      value={licPlan === 'Lifetime Sovereign' ? 'lifetime' : licCycle}
                      onChange={(e) =>
                        setLicCycle(e.target.value as LicenseRecord['billingCycle'])
                      }
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="monthly">Monthly Subscription (30 days)</option>
                      <option value="annual">Annual Subscription (365 days)</option>
                      <option value="lifetime">Lifetime Activation (Never Expires)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Validity Days (Non-Lifetime)
                    </label>
                    <input
                      type="number"
                      min={7}
                      disabled={licCycle === 'lifetime' || licPlan === 'Lifetime Sovereign'}
                      value={licCycle === 'monthly' ? 30 : licDurationDays}
                      onChange={(e) => setLicDurationDays(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={licAutoActivate}
                      onChange={(e) => setLicAutoActivate(e.target.checked)}
                    />
                    <span>Activate &amp; bind to property immediately</span>
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg"
                  >
                    {cms.pages.licensing.ctaLabel || 'Generate License Key'}
                  </button>
                </div>
              </form>
            )}

            {/* License Activation Terminal */}
            <form
              onSubmit={handleActivateKey}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Building2 className="w-4 h-4 text-slate-700" />
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Property License Activation Terminal
                  </h2>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Enter Property License Key
                  </label>
                  <input
                    required
                    type="text"
                    value={activationKeyInput}
                    onChange={(e) => setActivationKeyInput(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular uppercase"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Bind to Property
                  </label>
                  <select
                    value={activationPropId}
                    onChange={(e) => setActivationPropId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg"
                >
                  Validate &amp; Activate Key
                </button>
              </div>
            </form>
          </div>

          {/* License Registry Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                {activeRole === 'pch_admin' ? 'Centralized PureCrest License Registry' : 'Property License Registry'}
              </h2>
              <span className="font-mono-tabular text-xs text-slate-500">
                {licenses.length} issued keys
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">License Key</th>
                    <th className="py-3 px-4">Bound Property</th>
                    <th className="py-3 px-4">Plan &amp; Quota</th>
                    <th className="py-3 px-4">Expiry</th>
                    <th className="py-3 px-4 text-right">Fee (₦)</th>
                    <th className="py-3 px-4">Status &amp; Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {licenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{lic.licenseKey}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(lic.licenseKey, lic.id)}
                            className="text-slate-400 hover:text-slate-700"
                            title="Copy License Key"
                          >
                            {copiedKey === lic.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-800">{lic.propertyName}</td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{lic.plan}</p>
                        <p className="text-[11px] text-slate-500 capitalize">
                          {lic.billingCycle} · Max {lic.maxRooms} rooms
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-800">
                        {lic.isLifetime ? 'LIFETIME' : lic.expiresAt}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {formatNgn(lic.priceNgn)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold capitalize ${
                              lic.status === 'active'
                                ? 'text-emerald-700'
                                : lic.status === 'pending'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {lic.status}
                          </span>
                          {activeRole === 'pch_admin' && lic.status === 'active' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateLicenseStatus({
                                  license: lic,
                                  nextStatus: 'revoked',
                                  actorRole: ROLE_LABELS[activeRole],
                                })
                              }
                              className="px-2 py-1 border border-slate-200 rounded text-red-700 hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          )}
                          {activeRole === 'pch_admin' && lic.status !== 'active' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateLicenseStatus({
                                  license: lic,
                                  nextStatus: 'active',
                                  actorRole: ROLE_LABELS[activeRole],
                                })
                              }
                              className="px-2 py-1 bg-emerald-600 text-white rounded"
                            >
                              Activate
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

          {activeRole === 'pch_admin' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div>
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Plan Purchases &amp; Onboarding Inquiries
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Live orders and demo requests submitted by hospitality properties
                    </p>
                  </div>
                  <span className="font-mono-tabular text-xs text-slate-500">
                    {planInquiries.length} submissions
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-3 px-4">Reference &amp; Date</th>
                        <th className="py-3 px-4">Property &amp; Location</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4">Plan &amp; Rooms</th>
                        <th className="py-3 px-4 text-right">Est. Total</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {planInquiries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 px-4 text-center text-slate-500">
                            No plan purchases or inquiries submitted yet.
                          </td>
                        </tr>
                      ) : (
                        planInquiries.map((inq) => (
                          <tr key={inq.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <p className="font-mono-tabular font-semibold text-slate-900">
                                {inq.referenceCode}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono-tabular">
                                {inq.createdAtIso.slice(0, 10)}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900">{inq.propertyName}</p>
                              <p className="text-[11px] font-mono-tabular text-slate-500">
                                {inq.cityState}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{inq.contactName}</p>
                              <p className="text-[11px] text-slate-500 font-mono-tabular">
                                {inq.contactEmail} · {inq.contactPhone}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900">
                                {inq.plan} ({inq.billingCycle})
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono-tabular">
                                {inq.roomCount} rooms · {inq.paymentOption}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                              {inq.estimatedTotalNgn > 0
                                ? inq.currency === 'NGN'
                                  ? formatNgn(inq.estimatedTotalNgn)
                                  : `${formatUsd(inq.estimatedTotalNgn, 0)} USD`
                                : '—'}
                            </td>
                          <td className="py-3 px-4">
                            <select
                              value={inq.status}
                              onChange={async (e) => {
                                const next = e.target.value as PlanInquiryRecord['status'];
                                await updatePlanInquiryStatusWorkflow({
                                  inquiryId: inq.id,
                                  status: next,
                                });
                                onNotify(`Updated ${inq.referenceCode} to ${next}`);
                              }}
                              className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-white font-medium"
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="provisioned">Provisioned</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION: RBAC & AUDIT LOGS */}
      {section === 'rbac_audit' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleGrantAccess}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <UserPlus className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Authorize User Account for {property.name}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                  <input
                    required
                    type="text"
                    value={grantFirstName}
                    onChange={(e) => setGrantFirstName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                  <input
                    required
                    type="text"
                    value={grantLastName}
                    onChange={(e) => setGrantLastName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Account Email *</label>
                  <input
                    required
                    type="email"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={grantRole}
                    onChange={(e) => setGrantRole(e.target.value as StaffRole)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="property_admin">Property Admin (GM)</option>
                    <option value="front_desk">Front Desk</option>
                    <option value="housekeeping">Housekeeping</option>
                    <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                    <option value="accountant">Accountant</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">
                  Authorized emails: {property.authorizedEmails.join(', ')}
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg whitespace-nowrap"
                >
                  {cms.pages.rbac_audit.ctaLabel || 'Authorize User Email'}
                </button>
              </div>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Shield className="w-4 h-4 text-slate-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Role Permission Matrix
                </h2>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(Object.keys(ROLE_LABELS) as StaffRole[]).map((role) => (
                  <div
                    key={role}
                    className="flex items-center justify-between py-1 border-b border-slate-100"
                  >
                    <span className="font-semibold text-slate-900">{ROLE_LABELS[role]}</span>
                    <span className="font-mono-tabular text-slate-500">
                      {ROLE_ALLOWED_SECTIONS[role].length} modules enabled
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Immutable Security &amp; Operations Audit Trail
              </h2>
              <span className="font-mono-tabular text-xs text-slate-500">
                {auditLogs.length} events logged
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor &amp; Role</th>
                    <th className="py-3 px-4">Module</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                        {log.timestampIso.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{log.actorEmail}</p>
                        <p className="text-[11px] text-slate-500">{log.actorRole}</p>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{log.module}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{log.action}</td>
                      <td className="py-3 px-4 text-slate-600">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: CLOUDFLARE DEPLOYMENT & PORTAL LINKS */}
      {section === 'deployment' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CloudUpload className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Cloudflare Pages Deployment Configuration
                </h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                PCH PMS is configured with <code className="font-mono-tabular">wrangler.toml</code>{' '}
                and <code className="font-mono-tabular">public/_redirects</code> for zero-server
                Cloudflare Pages global edge hosting connected to the PCH PMS Cloud Database.
              </p>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono-tabular overflow-x-auto">
{`npm install
npm run build
npx wrangler pages deploy dist --project-name=pch-pms`}
              </pre>
              <p className="text-xs text-slate-500">
                Branded password reset and email verification links route through{' '}
                <code className="font-mono-tabular">https://{savedRootDomain}/auth-action</code> for all properties.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="font-display text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                Direct Portal Login Links
              </h2>
              {(
                [
                  { id: 'home', label: 'Software Homepage & Pricing (app.pchpms.com)' },
                  { id: 'pch-admin', label: 'PCH Super Admin Login' },
                ] as Array<{ id: PortalMode; label: string }>
              ).map((item) => {
                const url = getPortalUrl(item.id, property);
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{item.label}</p>
                      <p className="font-mono-tabular text-[11px] text-slate-500 truncate">
                        {url}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(url, item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium"
                      >
                        {copiedKey === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{cms.pages.deployment.ctaLabel || 'Copy Link'}</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSwitchPortal(item.id)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium"
                      >
                        Launch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direct Custom Subdomain Routing (Cloudflare Domain & Subdomain Generator) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#1c46be]" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Cloudflare Connected Domain &amp; Subdomain Routing ({savedRootDomain})
                </h2>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = saveConnectedRootDomain(connectedDomainInput);
                  setConnectedDomainInput(next);
                  setSavedRootDomain(next);
                  onNotify(`Updated Cloudflare domain links for ${next}`);
                }}
                className="flex items-center gap-2"
              >
                <label className="text-[11px] font-medium text-slate-600 whitespace-nowrap">
                  Connected Domain:
                </label>
                <input
                  type="text"
                  value={connectedDomainInput}
                  onChange={(e) => setConnectedDomainInput(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono-tabular w-44"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#1c46be] hover:bg-[#17399c] text-white rounded-lg text-xs font-semibold"
                >
                  Apply Domain
                </button>
              </form>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The application detects each subdomain automatically on load, with property staff portals hosted under{' '}
              <code className="font-mono-tabular">/staff</code> on each property&apos;s own subdomain:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {buildAllSubdomainLinks(savedRootDomain, properties).map((linkItem) => (
                <div
                  key={linkItem.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-slate-900">{linkItem.label}</p>
                    <p className="font-mono-tabular font-bold text-[#1c46be] truncate">
                      {linkItem.url}
                    </p>
                    <p className="text-[11px] text-slate-600">{linkItem.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(linkItem.url, linkItem.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-medium shrink-0"
                  >
                    {copiedKey === linkItem.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <li>
                Deploy this app to Cloudflare Pages (<code className="font-mono-tabular">npm run build</code> → output <code className="font-mono-tabular">dist</code>, project <code className="font-mono-tabular">pch-pms</code>).
              </li>
              <li>
                In <strong>Cloudflare Dashboard → Workers &amp; Pages → pch-pms → Custom domains</strong>, add{' '}
                <code className="font-mono-tabular">{savedRootDomain}</code>,{' '}
                <code className="font-mono-tabular">app.{savedRootDomain}</code>,{' '}
                <code className="font-mono-tabular">admin.{savedRootDomain}</code>, and{' '}
                {properties.map((p, idx) => (
                  <React.Fragment key={p.id}>
                    {idx > 0 ? ', ' : ''}
                    <code className="font-mono-tabular">
                      {getPropertySubdomainSlug(p)}.{savedRootDomain}
                    </code>
                  </React.Fragment>
                ))}
                .
              </li>
              <li>
                In <strong>Cloudflare DNS ({savedRootDomain})</strong>, ensure the root domain and each subdomain have a proxied{' '}
                <strong>CNAME</strong> pointing to <code className="font-mono-tabular">pch-pms.pages.dev</code> (orange cloud ON, SSL mode <strong>Full (strict)</strong>). No separate DNS record is needed for <code className="font-mono-tabular">/staff</code> or <code className="font-mono-tabular">/auth-action</code>.
              </li>
              <li>
                In <strong>Authentication Settings → Authorized domains</strong>, register{' '}
                <code className="font-mono-tabular">{savedRootDomain}</code> (covers all property subdomains),{' '}
                <code className="font-mono-tabular">app.{savedRootDomain}</code>, and{' '}
                <code className="font-mono-tabular">admin.{savedRootDomain}</code>.
              </li>
              <li>
                In <strong>Authentication → Templates</strong> (Password Reset, Email Verification, Email Change), set{' '}
                <strong>Action URL</strong> to{' '}
                <code className="font-mono-tabular">https://{savedRootDomain}/auth-action</code>, set{' '}
                <strong>Public App Name</strong> to <strong>PCH PMS</strong>, and enable custom SMTP from{' '}
                <code className="font-mono-tabular">PCH PMS &lt;noreply@{savedRootDomain}&gt;</code> so every security email uses your branded domain.
              </li>
            </ol>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
              {[
                {
                  id: 'auth-action-url',
                  label: 'Custom Email Action URL',
                  value: `https://${savedRootDomain}/auth-action`,
                },
                {
                  id: 'auth-sender-email',
                  label: 'Branded Email Sender',
                  value: `PCH PMS <noreply@${savedRootDomain}>`,
                },
                {
                  id: 'auth-app-name',
                  label: 'Public App Display Name',
                  value: 'PCH PMS',
                },
              ].map((cfg) => (
                <div
                  key={cfg.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-500">{cfg.label}</p>
                    <p className="font-mono-tabular text-xs font-bold text-slate-900 truncate">
                      {cfg.value}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(cfg.value, cfg.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer"
                  >
                    {copiedKey === cfg.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Clean Production Backup & Demo Guest Purge */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Richgates Production Backup &amp; Live Database Prep (Cloudflare Ready)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Preserve all {sortedRooms.length} configured rooms ({sortedRooms.map((r) => r.roomNumber).join(', ') || 'RM-1..RM-8'}) with rates &amp; photos while removing all demo guests, demo bookings, and sample folios.
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg shrink-0">
                {sortedRooms.length} Rooms Intact · Clean State
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <p className="text-xs font-bold text-slate-900">
                  1. Download Clean Production Backup File (.json)
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Exports {property.name} property settings, license key, all {sortedRooms.length} vacant/clean rooms, POS menu items, and channel config with zero demo guests or sample folios.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadCleanProductionBackup}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Clean Production Backup (.json)</span>
                </button>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                <p className="text-xs font-bold text-slate-900">
                  2. Remove Demo Guests from Live Cloud Database
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Resets all {sortedRooms.length} rooms to Vacant &amp; Clean and permanently clears existing demo guests, sample reservations, date blocks, POS orders, and sample ledger entries before go-live.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowPurgeConfirm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Demo Guests &amp; Keep Rooms</span>
                </button>
              </div>
            </div>
          </div>

          {showPurgeConfirm && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Prepare {property.name} for Production?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This keeps all {sortedRooms.length} rooms (with their room numbers, Naira rates, sections, and photos) and resets them to <strong>Vacant</strong> and <strong>Clean</strong>, while removing all guest profiles, reservations, POS orders, housekeeping tasks, and ledger entries currently in the database.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowPurgeConfirm(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConfirmPurgeDemoGuests}
                    className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-60"
                  >
                    {busy ? 'Clearing...' : 'Confirm & Keep Rooms'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
