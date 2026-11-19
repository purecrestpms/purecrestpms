import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
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
  OtaPaymentCollectionMode,
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
  onNotify: (msg: string) => void;
}

const PLAN_PRICING: Record<LicenseRecord['plan'], { monthly: number; annual: number; lifetime: number; rooms: number }> = {
  Starter: { monthly: 75000, annual: 750000, lifetime: 2200000, rooms: 12 },
  Professional: { monthly: 145000, annual: 1450000, lifetime: 3200000, rooms: 30 },
  Enterprise: { monthly: 220000, annual: 1850000, lifetime: 4500000, rooms: 80 },
  'Lifetime Sovereign': { monthly: 4500000, annual: 4500000, lifetime: 4500000, rooms: 250 },
};

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
  const [newDefaultCurrency, setNewDefaultCurrency] = useState<ChannelCurrency>('USD');
  const [newDefaultNightlyRate, setNewDefaultNightlyRate] = useState('');
  const [newCollectionMode, setNewCollectionMode] =
    useState<OtaPaymentCollectionMode>('ota_prepaid');
  const [newAutoSync, setNewAutoSync] = useState(true);
  const [exportSuiteFilter, setExportSuiteFilter] = useState('ALL');
  const [icalDrafts, setIcalDrafts] = useState<
    Record<
      string,
      {
        url: string;
        room: string;
        listingId: string;
        defaultCurrency: ChannelCurrency;
        defaultNightlyRate: string;
        paymentCollectionMode: OtaPaymentCollectionMode;
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
      imageUrl: r.imageUrl || '',
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
    onNotify(`Downloaded clean production backup (${cleanRooms.length} suites, 0 demo guests)`);
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
      onNotify(err instanceof Error ? err.message : 'Unable to clear demo records.');
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
      onNotify(err instanceof Error ? err.message : 'Unable to provision client property.');
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
      onNotify(err instanceof Error ? err.message : 'Unable to update client tenant settings.');
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

  // Channel Manager CSV Import state
  const [showCsvImportPanel, setShowCsvImportPanel] = useState(false);
  const [csvChannelName, setCsvChannelName] =
    useState<OtaIntegrationRecord['channelName']>('Airbnb');
  const [csvDefaultCurrency, setCsvDefaultCurrency] = useState<ChannelCurrency>('USD');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvParsedRows, setCsvParsedRows] = useState<ParsedOtaCsvRow[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

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
    const isIntlOta =
      channel.channelName === 'Airbnb' ||
      channel.channelName === 'Booking.com' ||
      channel.channelName === 'Expedia' ||
      channel.channelName === 'VRBO' ||
      channel.channelName === 'Custom iCal';
    const effectiveStoredCurrency: ChannelCurrency =
      isIntlOta && (!channel.defaultCurrency || channel.defaultCurrency === 'NGN')
        ? getDefaultOtaChannelCurrency(channel.channelName)
        : channel.defaultCurrency || getDefaultOtaChannelCurrency(channel.channelName);
    if (!draft) {
      if (isIntlOta && channel.defaultCurrency !== effectiveStoredCurrency) {
        await updateOtaChannelIcal({
          property,
          channel,
          icalImportUrl: (channel.icalImportUrl || '').trim(),
          roomNumber: normalizeChannelRoom(channel.roomNumber),
          propertyListingId: channel.propertyListingId,
          defaultCurrency: effectiveStoredCurrency,
          defaultNightlyRate: channel.defaultNightlyRate ?? 0,
          paymentCollectionMode: channel.paymentCollectionMode || 'ota_prepaid',
          actorRole: ROLE_LABELS[activeRole],
        });
        return { ...channel, defaultCurrency: effectiveStoredCurrency };
      }
      return channel;
    }
    const currentDefaultCurrency: ChannelCurrency =
      channel.defaultCurrency || getDefaultOtaChannelCurrency(channel.channelName);
    const currentMode: OtaPaymentCollectionMode =
      channel.paymentCollectionMode ||
      (channel.channelName === 'Direct Website Engine' ? 'hotel_collect' : 'ota_prepaid');
    const nextUrl = draft.url.trim();
    const nextRoom = normalizeChannelRoom(draft.room);
    const nextListingId = draft.listingId.trim() || channel.propertyListingId;
    const nextCurrency: ChannelCurrency = draft.defaultCurrency || effectiveStoredCurrency;
    const parsedRate = Number(draft.defaultNightlyRate.replace(/,/g, ''));
    const nextRate = Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : channel.defaultNightlyRate ?? 0;
    const nextMode: OtaPaymentCollectionMode = draft.paymentCollectionMode || currentMode;

    const isDirty =
      nextUrl !== (channel.icalImportUrl || '').trim() ||
      nextRoom !== normalizeChannelRoom(channel.roomNumber) ||
      nextListingId !== (channel.propertyListingId || '').trim() ||
      nextCurrency !== currentDefaultCurrency ||
      nextRate !== (channel.defaultNightlyRate ?? 0) ||
      nextMode !== currentMode;

    if (!isDirty) return channel;

    await updateOtaChannelIcal({
      property,
      channel,
      icalImportUrl: nextUrl,
      roomNumber: nextRoom,
      propertyListingId: nextListingId,
      defaultCurrency: nextCurrency,
      defaultNightlyRate: nextRate,
      paymentCollectionMode: nextMode,
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
      defaultCurrency: nextCurrency,
      defaultNightlyRate: nextRate,
      paymentCollectionMode: nextMode,
    };
  };

  const handleToggleChannelConnection = async (channel: OtaIntegrationRecord) => {
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
          ? `${channel.channelName} reconnected and ready to sync.`
          : `${channel.channelName} disconnected permanently. It will remain disconnected until you manually reconnect it.`
      );
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : `Failed updating connection status for ${channel.channelName}`
      );
    } finally {
      setTogglingChannelId(null);
    }
  };

  const handleSyncSingleChannel = async (
    channel: OtaIntegrationRecord,
    icsRawText?: string
  ) => {
    if (!channel.connected) {
      onNotify(`${channel.channelName} is disconnected. Reconnect it manually before syncing.`);
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
        `${effectiveChannel.channelName}: ${result.created} new, ${result.updated} updated, ${result.cancelled} cancelled, ${result.skipped} unchanged`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : `Failed syncing ${channel.channelName}`
      );
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
      onNotify(
        `${csvChannelName} CSV imported: ${res.created} new, ${res.updated} updated, ${res.skipped} skipped`
      );
      setCsvParsedRows([]);
      setCsvWarnings([]);
      setCsvFileName('');
      setShowCsvImportPanel(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : `Failed importing ${csvChannelName} CSV`);
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
          if (!firstError && err instanceof Error) {
            firstError = `${ch.channelName}: ${err.message}`;
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
    const parsedDefaultRate = Number(newDefaultNightlyRate.replace(/,/g, ''));
    const safeDefaultRate = Number.isFinite(parsedDefaultRate) && parsedDefaultRate > 0 ? parsedDefaultRate : 0;
    setBusy(true);
    try {
      await createOtaChannelWithIcal({
        property,
        channelName: newChannelName,
        propertyListingId: newListingId,
        roomNumber: newChannelSuite,
        icalImportUrl: newIcalUrl,
        defaultCurrency: newDefaultCurrency,
        defaultNightlyRate: safeDefaultRate,
        paymentCollectionMode: newCollectionMode,
        autoSync: newAutoSync,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(
        `Added ${newChannelName} (${newChannelSuite} · ${newDefaultCurrency}) to Channel Manager`
      );
      setShowChannelForm(false);
      setNewListingId('');
      setNewIcalUrl('');
      setNewDefaultNightlyRate('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : `Unable to add ${newChannelName}`);
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
              onClick={() => setShowCsvImportPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              disabled={syncingAllChannels}
              onClick={() => void handleSyncAllChannels()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingAllChannels ? 'animate-spin' : ''}`} />
              <span>{syncingAllChannels ? 'Syncing OTAs...' : 'Sync All Connected'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowChannelForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{cms.pages.ota_channels.ctaLabel || 'Add Channel / iCal Link'}</span>
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
      {section === 'ota_channels' && (
        <div className="space-y-6">
          {/* Add New Channel + iCal Link Form */}
          {showChannelForm && (
            <form
              onSubmit={handleCreateChannel}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Add Channel to Channel Manager (Inbound iCal .ics)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowChannelForm(false)}
                  className="text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Channel Platform</label>
                  <select
                    value={newChannelName}
                    onChange={(e) => {
                      const val = e.target.value as OtaIntegrationRecord['channelName'];
                      setNewChannelName(val);
                      if (val === 'Direct Website Engine' || val === 'Hotels.ng') {
                        setNewDefaultCurrency('NGN');
                      } else if (val === 'Airbnb' || val === 'Booking.com' || val === 'Expedia' || val === 'VRBO') {
                        setNewDefaultCurrency('USD');
                      }
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Airbnb">Airbnb</option>
                    <option value="Booking.com">Booking.com</option>
                    <option value="VRBO">VRBO</option>
                    <option value="Hotels.ng">Hotels.ng</option>
                    <option value="Expedia">Expedia</option>
                    <option value="Custom iCal">Custom iCal</option>
                    <option value="Direct Website Engine">Direct Website Engine</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Room Mapping</label>
                  <select
                    value={newChannelSuite}
                    onChange={(e) => setNewChannelSuite(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
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
                  <label className="block font-medium text-slate-700 mb-1">Property Listing ID</label>
                  <input
                    type="text"
                    placeholder="e.g. BKG-ENUGU-88412"
                    value={newListingId}
                    onChange={(e) => setNewListingId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Inbound iCal URL (.ics)
                  </label>
                  <input
                    type="text"
                    placeholder="https://... or webcal://..."
                    value={newIcalUrl}
                    onChange={(e) => setNewIcalUrl(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Channel Booking Currency
                  </label>
                  <select
                    value={newDefaultCurrency}
                    onChange={(e) => setNewDefaultCurrency(e.target.value as ChannelCurrency)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-semibold"
                  >
                    {SUPPORTED_CHANNEL_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Channel Nightly Rate ({newDefaultCurrency})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 200.00 (optional fallback)"
                    value={newDefaultNightlyRate}
                    onChange={(e) => setNewDefaultNightlyRate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payment Collection Mode
                  </label>
                  <select
                    value={newCollectionMode}
                    onChange={(e) =>
                      setNewCollectionMode(e.target.value as OtaPaymentCollectionMode)
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="ota_prepaid">Guest Paid to OTA (Prepaid)</option>
                    <option value="hotel_collect">Pay at Property (Hotel Collect)</option>
                  </select>
                </div>

                <div className="flex items-end pb-1">
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Paid amounts in iCal events (e.g. <span className="font-mono-tabular font-semibold">200 USD</span>) are stored verbatim in original currency without converting to ₦.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAutoSync}
                    onChange={(e) => setNewAutoSync(e.target.checked)}
                  />
                  <span>Enable two-way calendar sync (.ics dates, guest &amp; exact OTA currency capture)</span>
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Save Channel &amp; Connect iCal
                </button>
              </div>
            </form>
          )}

          {/* Import OTA Reservations CSV Panel */}
          {showCsvImportPanel && (
            <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                  <div>
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Import OTA Reservations via CSV (Airbnb, Booking.com, Expedia, VRBO)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Captures exact guest-paid amount in original USD/currency and converts to Naira at 1 USD = ₦{(property.usdExchangeRateNgn || 1600).toLocaleString()}.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCsvImportPanel(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="Close CSV import"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">OTA Platform</label>
                  <select
                    value={csvChannelName}
                    onChange={(e) => {
                      const val = e.target.value as OtaIntegrationRecord['channelName'];
                      setCsvChannelName(val);
                      setCsvDefaultCurrency(getDefaultOtaChannelCurrency(val));
                    }}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                  >
                    <option value="Airbnb">Airbnb</option>
                    <option value="Booking.com">Booking.com</option>
                    <option value="VRBO">VRBO</option>
                    <option value="Expedia">Expedia</option>
                    <option value="Hotels.ng">Hotels.ng</option>
                    <option value="Custom iCal">Custom iCal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Default Currency (if CSV omits Currency column)
                  </label>
                  <select
                    value={csvDefaultCurrency}
                    onChange={(e) => setCsvDefaultCurrency(e.target.value as ChannelCurrency)}
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
                  <label className="block font-medium text-slate-700 mb-1">Select CSV File</label>
                  <label className="flex items-center justify-center gap-2 h-10 px-3 border border-dashed border-blue-300 bg-blue-50/60 hover:bg-blue-50 text-blue-900 rounded-lg font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span className="truncate">
                      {csvFileName || 'Choose .csv export file'}
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
                <div className="space-y-3">
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs min-w-[760px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          <th className="py-2 px-3">Ref &amp; Guest</th>
                          <th className="py-2 px-3">Stay Dates</th>
                          <th className="py-2 px-3">Room Hint</th>
                          <th className="py-2 px-3 text-right">OTA Paid (Exact)</th>
                          <th className="py-2 px-3 text-right">Converted (₦)</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvParsedRows.slice(0, 12).map((row) => {
                          const fx = getFxRateToNgn(row.currency, property.usdExchangeRateNgn);
                          const paidOrig = row.otaPaidSourceAmount ?? row.sourceTotalAmount ?? 0;
                          const paidNgn =
                            row.currency === 'NGN' ? Math.round(paidOrig) : Math.round(paidOrig * fx);
                          return (
                            <tr key={`${row.rowNumber}-${row.externalRef}`}>
                              <td className="py-2 px-3">
                                <p className="font-semibold text-slate-900">{row.guestName}</p>
                                <p className="font-mono-tabular text-[11px] text-slate-500">
                                  {row.externalRef}
                                </p>
                              </td>
                              <td className="py-2 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                                {row.checkInDate} → {row.checkOutDate} ({row.nights}n)
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {row.roomHint || 'Auto-assign'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono-tabular font-bold text-blue-800 whitespace-nowrap">
                                {formatChannelCurrency(paidOrig, row.currency)} {row.currency}
                              </td>
                              <td className="py-2 px-3 text-right font-mono-tabular font-semibold text-emerald-700 whitespace-nowrap">
                                {formatNgn(paidNgn)}
                              </td>
                              <td className="py-2 px-3 text-right capitalize text-slate-700">
                                {row.status}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-600">
                      Ready to import <span className="font-bold text-slate-900">{csvParsedRows.length}</span>{' '}
                      reservation(s) into <span className="font-semibold">{csvChannelName}</span>.
                      {csvParsedRows.length > 12 ? ' (Showing first 12 rows in preview)' : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCsvParsedRows([]);
                          setCsvWarnings([]);
                          setCsvFileName('');
                        }}
                        className="px-3 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                          ? 'Importing CSV...'
                          : `Import ${csvParsedRows.length} Reservation(s)`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Outbound iCal Feed Export Generator */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Outbound Property iCal Export Feed (.ics)
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Paste this outbound iCal link into Airbnb, Booking.com, or VRBO to block booked &amp; held dates automatically.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <select
                value={exportSuiteFilter}
                onChange={(e) => setExportSuiteFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
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
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg font-medium text-slate-800 cursor-pointer"
              >
                {copiedKey === 'outbound-ical' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Feed Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy iCal Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleDownloadIcs(exportSuiteFilter)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .ics</span>
              </button>
            </div>
          </div>

          {/* Connected Channels Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {otaChannels.map((ch) => {
              const isIntlOta =
                ch.channelName === 'Airbnb' ||
                ch.channelName === 'Booking.com' ||
                ch.channelName === 'Expedia' ||
                ch.channelName === 'VRBO' ||
                ch.channelName === 'Custom iCal';
              const effectiveDefaultCurrency: ChannelCurrency =
                isIntlOta && (!ch.defaultCurrency || ch.defaultCurrency === 'NGN')
                  ? getDefaultOtaChannelCurrency(ch.channelName)
                  : ch.defaultCurrency || getDefaultOtaChannelCurrency(ch.channelName);
              const effectiveCollectionMode: OtaPaymentCollectionMode =
                ch.paymentCollectionMode ||
                (ch.channelName === 'Direct Website Engine' ? 'hotel_collect' : 'ota_prepaid');
              const draft = icalDrafts[ch.id] ?? {
                url: ch.icalImportUrl || '',
                room: normalizeChannelRoom(ch.roomNumber),
                listingId: ch.propertyListingId || '',
                defaultCurrency: effectiveDefaultCurrency,
                defaultNightlyRate:
                  ch.defaultNightlyRate && ch.defaultNightlyRate > 0
                    ? String(ch.defaultNightlyRate)
                    : '',
                paymentCollectionMode: effectiveCollectionMode,
              };
              const suiteParam = encodeURIComponent(
                !draft.room || draft.room === 'All Rooms' ? 'ALL' : draft.room
              );
              const channelExportUrl =
                ch.icalExportUrl ||
                (typeof window !== 'undefined'
                  ? `${window.location.origin}/?ical=${encodeURIComponent(property.id)}&room=${suiteParam}`
                  : `/?ical=${property.id}&room=${suiteParam}`);
              const mappedRoomObj =
                draft.room && draft.room !== 'All Rooms'
                  ? sortedRooms.find(
                      (r) => r.roomNumber.toLowerCase() === draft.room.toLowerCase()
                    )
                  : undefined;
              const mappedLabel = mappedRoomObj
                ? `${mappedRoomObj.roomNumber} · ${mappedRoomObj.roomType}`
                : draft.room || 'All Rooms';

              return (
                <div
                  key={ch.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-slate-700" />
                        <h2 className="font-display text-sm font-bold text-slate-900">
                          {ch.channelName}
                        </h2>
                        <span className="font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                          {draft.defaultCurrency}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          ch.connected ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {ch.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    {!ch.connected && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                        Calendar disconnected permanently. Auto-sync is paused until you manually click <span className="font-semibold">Connect</span>.
                      </div>
                    )}

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2 text-slate-500 font-mono-tabular">
                        <label htmlFor={`listing-${ch.id}`} className="font-sans font-semibold text-slate-700 shrink-0">
                          Property Listing ID
                        </label>
                        <span className="font-semibold text-slate-800 truncate text-right">
                          {mappedLabel}
                        </span>
                      </div>
                      <input
                        id={`listing-${ch.id}`}
                        type="text"
                        placeholder="Enter OTA Listing / Hotel ID"
                        value={draft.listingId}
                        onChange={(e) =>
                          setIcalDrafts((prev) => ({
                            ...prev,
                            [ch.id]: { ...draft, listingId: e.target.value },
                          }))
                        }
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono-tabular bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    {/* Currency, Nightly Rate & Collection Mode */}
                    <div className="grid grid-cols-3 gap-1.5 pt-2 text-[11px] border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Currency
                        </label>
                        <select
                          value={draft.defaultCurrency}
                          onChange={(e) =>
                            setIcalDrafts((prev) => ({
                              ...prev,
                              [ch.id]: {
                                ...draft,
                                defaultCurrency: e.target.value as ChannelCurrency,
                              },
                            }))
                          }
                          className="w-full border border-slate-200 rounded-md px-2 py-1 bg-white font-semibold"
                        >
                          {SUPPORTED_CHANNEL_CURRENCIES.map((cur) => (
                            <option key={cur} value={cur}>
                              {cur}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Rate ({draft.defaultCurrency}/nt)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={
                            draft.defaultCurrency === 'NGN' ? 'Room ₦' : 'e.g. 200'
                          }
                          value={draft.defaultNightlyRate}
                          onChange={(e) =>
                            setIcalDrafts((prev) => ({
                              ...prev,
                              [ch.id]: { ...draft, defaultNightlyRate: e.target.value },
                            }))
                          }
                          className="w-full border border-slate-200 rounded-md px-2 py-1 font-mono-tabular bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Collection
                        </label>
                        <select
                          value={draft.paymentCollectionMode}
                          onChange={(e) =>
                            setIcalDrafts((prev) => ({
                              ...prev,
                              [ch.id]: {
                                ...draft,
                                paymentCollectionMode: e.target.value as OtaPaymentCollectionMode,
                              },
                            }))
                          }
                          className="w-full border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                        >
                          <option value="ota_prepaid">Paid to OTA</option>
                          <option value="hotel_collect">Pay at Hotel</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs border-t border-slate-100">
                      <div>
                        <p className="text-slate-500">Sync Mode</p>
                        <p className="font-semibold text-slate-900">
                          {ch.autoSync ? 'Two-way Calendar Sync' : 'Manual Sync'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Bookings Imported</p>
                        <p className="font-mono-tabular font-semibold text-slate-900">
                          {ch.bookingsImported}
                          {Number(draft.defaultNightlyRate) > 0 && (
                            <span className="ml-1 text-[10px] font-normal text-blue-700">
                              ({formatChannelCurrency(Number(draft.defaultNightlyRate), draft.defaultCurrency)}/nt)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Inbound iCal Link & Room Mapping */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <label className="font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0">
                          <Link2 className="w-3 h-3 text-slate-400" />
                          <span>Room &amp; iCal (.ics)</span>
                        </label>
                        <select
                          value={draft.room}
                          onChange={(e) =>
                            setIcalDrafts((prev) => ({
                              ...prev,
                              [ch.id]: { ...draft, room: e.target.value },
                            }))
                          }
                          className="border border-slate-200 rounded px-2 py-1 text-[11px] bg-white max-w-[190px] truncate"
                        >
                          <option value="All Rooms">All Rooms</option>
                          {sortedRooms.map((r) => (
                            <option key={r.id} value={r.roomNumber}>
                              {r.roomNumber} · {r.roomType}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          aria-label="Inbound iCal link"
                          placeholder="https://... or webcal://... (.ics)"
                          value={draft.url}
                          onChange={(e) =>
                            setIcalDrafts((prev) => ({
                              ...prev,
                              [ch.id]: { ...draft, url: e.target.value },
                            }))
                          }
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono-tabular bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const parsedRate = Number(draft.defaultNightlyRate.replace(/,/g, ''));
                              await updateOtaChannelIcal({
                                property,
                                channel: ch,
                                icalImportUrl: draft.url,
                                roomNumber: draft.room,
                                propertyListingId: draft.listingId,
                                defaultCurrency: draft.defaultCurrency,
                                defaultNightlyRate:
                                  Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : 0,
                                paymentCollectionMode: draft.paymentCollectionMode,
                                actorRole: ROLE_LABELS[activeRole],
                              });
                              setIcalDrafts((prev) => {
                                const next = { ...prev };
                                delete next[ch.id];
                                return next;
                              });
                              onNotify(
                                `Saved ${draft.defaultCurrency} & iCal settings for ${ch.channelName}`
                              );
                            } catch (err) {
                              onNotify(
                                err instanceof Error
                                  ? err.message
                                  : `Unable to save ${ch.channelName} settings`
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer"
                        >
                          Save iCal
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        <span className="truncate font-mono-tabular pr-2">
                          Last Sync:{' '}
                          {ch.lastSyncedIso
                            ? ch.lastSyncedIso.slice(0, 16).replace('T', ' ')
                            : 'Never synced'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(channelExportUrl, `exp-${ch.id}`)}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium shrink-0 cursor-pointer"
                        >
                          {copiedKey === `exp-${ch.id}` ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Copied Feed</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Export Feed</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={togglingChannelId === ch.id || syncingChannelId === ch.id}
                        onClick={() => void handleToggleChannelConnection(ch)}
                        className={`px-2.5 py-1.5 border rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                          ch.connected
                            ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        {togglingChannelId === ch.id
                          ? 'Saving...'
                          : ch.connected
                            ? 'Disconnect'
                            : 'Connect'}
                      </button>
                      <label
                        title={
                          ch.connected
                            ? 'Upload .ics calendar exported from Booking.com / Airbnb'
                            : 'Reconnect this channel before uploading an .ics file'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-lg font-medium ${
                          ch.connected
                            ? 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                            : 'text-slate-400 bg-slate-50 cursor-not-allowed'
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>.ics</span>
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
                              const text = typeof reader.result === 'string' ? reader.result : '';
                              if (text) void handleSyncSingleChannel(ch, text);
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteOtaChannel({
                              property,
                              channel: ch,
                              actorRole: ROLE_LABELS[activeRole],
                            });
                            onNotify(`Removed ${ch.channelName}`);
                          } catch (err) {
                            onNotify(
                              err instanceof Error ? err.message : `Failed removing ${ch.channelName}`
                            );
                          }
                        }}
                        title="Remove channel"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:text-rose-700 hover:border-rose-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!ch.connected || syncingChannelId === ch.id || togglingChannelId === ch.id}
                      onClick={() => void handleSyncSingleChannel(ch)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncingChannelId === ch.id ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {syncingChannelId === ch.id
                          ? 'Syncing...'
                          : ch.connected
                            ? 'Sync Live iCal'
                            : 'Disconnected'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Synced OTA Reservations — Exact Original Booking Currency & Paid to OTA Ledger */}
          {(() => {
            const otaBookings = reservations
              .filter((r) => isOtaBookingChannel(r.channel))
              .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));
            const usdOtaPaidTotal = otaBookings.reduce((sum, r) => {
              const p = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
              return p.sourceCurrency === 'USD' ? sum + p.otaPaidSourceAmount : sum;
            }, 0);
            const expectedNgnTotal = otaBookings.reduce((sum, r) => {
              const p = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
              return sum + p.expectedPayoutNgn;
            }, 0);
            const needsUsdResync = otaBookings.some((r) => {
              const p = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
              const chDefault = getDefaultOtaChannelCurrency(r.channel);
              return chDefault !== 'NGN' && p.sourceCurrency === 'NGN';
            });

            return (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Synced OTA Reservations — Original Currency &amp; Guest Paid to OTA
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Displays the exact guest booking amount captured in original currency (e.g.{' '}
                      <span className="font-mono-tabular font-semibold text-blue-800">$200.00 USD</span>) alongside expected property payout in ₦.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                      OTA Paid (USD): {formatUsd(usdOtaPaidTotal)} USD
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                      Exp. Payout: {formatNgn(expectedNgnTotal)}
                    </span>
                    {needsUsdResync && (
                      <button
                        type="button"
                        disabled={syncingAllChannels}
                        onClick={() => void handleSyncAllChannels()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-sans font-semibold cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingAllChannels ? 'animate-spin' : ''}`} />
                        <span>Refresh USD Currency</span>
                      </button>
                    )}
                  </div>
                </div>

                {otaBookings.length === 0 ? (
                  <div className="px-5 py-8 text-center text-xs text-slate-500">
                    No OTA bookings imported yet. Paste an Airbnb or Booking.com iCal URL above and click <span className="font-semibold text-slate-800">Sync Live iCal</span> to capture bookings in USD.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[920px] text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          <th className="py-2.5 px-4">Guest &amp; Ref</th>
                          <th className="py-2.5 px-4">OTA Channel</th>
                          <th className="py-2.5 px-4">Room &amp; Dates</th>
                          <th className="py-2.5 px-4 text-right">Booking Total (Orig. Currency)</th>
                          <th className="py-2.5 px-4 text-right">Guest Paid to OTA</th>
                          <th className="py-2.5 px-4 text-right">Expected Payout (₦)</th>
                          <th className="py-2.5 px-4 text-right">Direct at Property</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {otaBookings.map((r) => {
                          const pay = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <p className="font-semibold text-slate-900">{r.guestName}</p>
                                <p className="font-mono-tabular text-[11px] text-slate-500">
                                  {r.bookingRef}
                                </p>
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold text-[11px]">
                                  {formatBookingSourceLabel(r.channel)}
                                </span>
                                <span className="ml-1.5 font-mono-tabular text-[10px] font-bold text-blue-700">
                                  {pay.sourceCurrency}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                                <span className="font-semibold text-slate-900">
                                  {r.roomNumber || 'Unassigned'}
                                </span>{' '}
                                · {r.checkInDate} → {r.checkOutDate} ({r.nights}n)
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular whitespace-nowrap">
                                <p className="font-bold text-slate-900">
                                  {formatChannelCurrency(pay.sourceTotalAmount, pay.sourceCurrency)}{' '}
                                  {pay.sourceCurrency}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {pay.sourceCurrency === 'USD'
                                    ? `≈ ${formatNgn(pay.totalAmount)}`
                                    : `≈ ${formatUsd(pay.totalAmountUsd)} USD`}
                                </p>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular whitespace-nowrap">
                                <p className="font-bold text-blue-800">
                                  {formatChannelCurrency(pay.otaPaidSourceAmount, pay.sourceCurrency)}{' '}
                                  {pay.sourceCurrency}
                                </p>
                                <p className="text-[10px] text-blue-600">
                                  ≈ {formatNgn(pay.otaPaidAmount)}
                                </p>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular whitespace-nowrap">
                                <p className="font-semibold text-emerald-700">
                                  {formatNgn(pay.expectedPayoutNgn)}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  ≈ {formatUsd(pay.expectedPayoutUsd)} USD
                                </p>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-700 whitespace-nowrap">
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
            );
          })()}
        </div>
      )}

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
                  Authorize Google Account for {property.name}
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
                  <label className="block font-medium text-slate-700 mb-1">Google Email</label>
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
                Central authentication routes through <code className="font-mono-tabular">https://{savedRootDomain}/__/auth/handler</code> and <code className="font-mono-tabular">https://{savedRootDomain}/auth-action</code> for all properties.
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
                In <strong>Cloudflare DNS ({savedRootDomain})</strong>, ensure each subdomain has a proxied{' '}
                <strong>CNAME</strong> pointing to <code className="font-mono-tabular">pch-pms.pages.dev</code> (orange cloud ON, SSL mode <strong>Full (strict)</strong>). No separate DNS record is needed for <code className="font-mono-tabular">/staff</code>.
              </li>
              <li>
                In <strong>Authentication Settings → Authorized domains</strong>, register{' '}
                <code className="font-mono-tabular">{savedRootDomain}</code> (used centrally by all properties),{' '}
                <code className="font-mono-tabular">app.{savedRootDomain}</code>, and{' '}
                <code className="font-mono-tabular">admin.{savedRootDomain}</code>, and add{' '}
                <code className="font-mono-tabular">https://{savedRootDomain}/__/auth/handler</code> to your Google OAuth Authorized Redirect URIs.
              </li>
            </ol>
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
                {sortedRooms.length} Suites Intact · Clean State
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
