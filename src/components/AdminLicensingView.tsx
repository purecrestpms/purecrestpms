import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  CloudUpload,
  Copy,
  Download,
  Globe,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import {
  activateLicenseKeyWorkflow,
  authorizeUserEmailForProperty,
  buildPropertyIcalFeed,
  createNewPropertyWithRooms,
  createOtaChannelWithIcal,
  deleteOtaChannel,
  generateCentralLicense,
  prepareRichgatesProductionDatabaseWorkflow,
  syncOtaChannelWorkflow,
  updateLicenseStatus,
  updateOtaChannelIcal,
  updatePlanInquiryStatusWorkflow,
} from '../services/pmsService';
import {
  AuditLogRecord,
  BlockedDateRecord,
  formatNgn,
  formatUsd,
  getPortalUrl,
  getPropertySubdomainSlug,
  LicenseRecord,
  NavSectionId,
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
  sortRoomsByNumber,
  StaffRole,
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
  // New property state
  const [showPropForm, setShowPropForm] = useState(false);
  const [propName, setPropName] = useState('');
  const [propCode, setPropCode] = useState('');
  const [propCity, setPropCity] = useState('Abuja');
  const [propState, setPropState] = useState('FCT');
  const [propAddress, setPropAddress] = useState('');
  const [propAdminEmail, setPropAdminEmail] = useState('');
  const [propRooms, setPropRooms] = useState(10);
  const [propBaseRate, setPropBaseRate] = useState(80000);

  // License generator state
  const [licPropId, setLicPropId] = useState(property.id);
  const [licPlan, setLicPlan] = useState<LicenseRecord['plan']>('Enterprise');
  const [licCycle, setLicCycle] = useState<LicenseRecord['billingCycle']>('annual');
  const [licDurationDays, setLicDurationDays] = useState(365);
  const [licAutoActivate, setLicAutoActivate] = useState(true);
  const [activationKeyInput, setActivationKeyInput] = useState('');
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
  const [newChannelSuite, setNewChannelSuite] = useState('All Suites');
  const [newListingId, setNewListingId] = useState('');
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newCommissionPct, setNewCommissionPct] = useState(15);
  const [newAutoSync, setNewAutoSync] = useState(true);
  const [exportSuiteFilter, setExportSuiteFilter] = useState('ALL');
  const [icalDrafts, setIcalDrafts] = useState<
    Record<string, { url: string; room: string }>
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
        roomNumber: o.roomNumber || 'All Suites',
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
    if (!propName.trim() || !propCode.trim()) return;
    setBusy(true);
    try {
      const newId = await createNewPropertyWithRooms({
        name: propName.trim(),
        code: propCode.trim().toUpperCase(),
        city: propCity.trim(),
        state: propState.trim(),
        address: propAddress.trim() || `${propCity}, ${propState}, Nigeria`,
        adminEmail: propAdminEmail.trim() || 'purecresthospitality@gmail.com',
        roomCount: propRooms,
        baseRateNgn: propBaseRate,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Provisioned property ${propName} with ${propRooms} rooms`);
      setShowPropForm(false);
      setPropName('');
      setPropCode('');
      if (newId) onSelectProperty(newId);
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
  const [syncingAllChannels, setSyncingAllChannels] = useState(false);

  const persistDraftIfDirty = async (
    channel: OtaIntegrationRecord
  ): Promise<OtaIntegrationRecord> => {
    const draft = icalDrafts[channel.id];
    if (!draft) return channel;
    const nextUrl = draft.url.trim();
    const nextRoom = draft.room || 'All Suites';

    const isDirty =
      nextUrl !== (channel.icalImportUrl || '').trim() ||
      nextRoom !== (channel.roomNumber || 'All Suites');

    if (!isDirty) return channel;

    await updateOtaChannelIcal({
      property,
      channel,
      icalImportUrl: nextUrl,
      roomNumber: nextRoom,
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
    };
  };

  const handleSyncSingleChannel = async (
    channel: OtaIntegrationRecord,
    icsRawText?: string
  ) => {
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
    let totalErrors = 0;
    try {
      for (const ch of syncable) {
        try {
          const effectiveChannel = await persistDraftIfDirty(ch);
          const res = await syncOtaChannelWorkflow({
            property,
            channel: effectiveChannel,
            rooms: sortedRooms,
            reservations,
            actorRole: ROLE_LABELS[activeRole],
          });
          totalCreated += res.created;
          totalUpdated += res.updated;
        } catch {
          totalErrors += 1;
        }
      }
      onNotify(
        `Synced ${syncable.length} OTA feed(s): ${totalCreated} new booking(s), ${totalUpdated} updated${
          totalErrors > 0 ? `, ${totalErrors} error(s)` : ''
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
    const suffix = roomFilter && roomFilter !== 'ALL' ? `-${roomFilter}` : '-all-suites';
    a.download = `${property.code.toLowerCase()}${suffix}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(`Downloaded iCal calendar feed (${roomFilter && roomFilter !== 'ALL' ? roomFilter : 'All Suites'})`);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createOtaChannelWithIcal({
        property,
        channelName: newChannelName,
        propertyListingId: newListingId,
        roomNumber: newChannelSuite,
        icalImportUrl: newIcalUrl,
        commissionPct: newCommissionPct,
        autoSync: newAutoSync,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Added ${newChannelName} (${newChannelSuite}) to Channel Manager`);
      setShowChannelForm(false);
      setNewListingId('');
      setNewIcalUrl('');
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
                      if (val === 'Direct Website Engine' || val === 'Custom iCal') {
                        setNewCommissionPct(0);
                      } else if (val === 'VRBO') {
                        setNewCommissionPct(8);
                      } else {
                        setNewCommissionPct(15);
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
                  <label className="block font-medium text-slate-700 mb-1">Suite Mapping</label>
                  <select
                    value={newChannelSuite}
                    onChange={(e) => setNewChannelSuite(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="All Suites">All Suites (Property-wide)</option>
                    {sortedRooms.map((r) => (
                      <option key={r.id} value={r.roomNumber}>
                        {r.roomNumber} · {r.roomType}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Listing / Ext ID</label>
                  <input
                    type="text"
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
                    type="url"
                    required
                    value={newIcalUrl}
                    onChange={(e) => setNewIcalUrl(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-slate-700">
                    <span>Commission %:</span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={newCommissionPct}
                      onChange={(e) => setNewCommissionPct(Number(e.target.value))}
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1 font-mono-tabular"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAutoSync}
                      onChange={(e) => setNewAutoSync(e.target.checked)}
                    />
                    <span>Enable two-way auto sync</span>
                  </label>
                </div>

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
                <option value="ALL">All Suites ({property.code})</option>
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
              const draft = icalDrafts[ch.id] ?? {
                url: ch.icalImportUrl || '',
                room: ch.roomNumber || 'All Suites',
              };
              const suiteParam = encodeURIComponent(
                !draft.room || draft.room === 'All Suites' ? 'ALL' : draft.room
              );
              const channelExportUrl =
                ch.icalExportUrl ||
                (typeof window !== 'undefined'
                  ? `${window.location.origin}/?ical=${encodeURIComponent(property.id)}&room=${suiteParam}`
                  : `/?ical=${property.id}&room=${suiteParam}`);
              const mappedRoomObj =
                draft.room && draft.room !== 'All Suites'
                  ? sortedRooms.find(
                      (r) => r.roomNumber.toLowerCase() === draft.room.toLowerCase()
                    )
                  : undefined;
              const mappedLabel = mappedRoomObj
                ? `${mappedRoomObj.roomNumber} · ${mappedRoomObj.roomType}`
                : draft.room || 'All Suites';

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
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          ch.connected ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {ch.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono-tabular">
                      <span className="truncate">Listing: {ch.propertyListingId}</span>
                      <span className="font-semibold text-slate-800 truncate text-right">
                        {mappedLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs border-t border-slate-100">
                      <div>
                        <p className="text-slate-500">Commission</p>
                        <p className="font-mono-tabular font-semibold text-slate-900">
                          {ch.commissionPct}%
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Bookings Imported</p>
                        <p className="font-mono-tabular font-semibold text-slate-900">
                          {ch.bookingsImported}
                        </p>
                      </div>
                    </div>

                    {/* Inbound iCal Link, Suite Assignment & Customer Billing Currency */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <label className="font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0">
                          <Link2 className="w-3 h-3 text-slate-400" />
                          <span>Suite &amp; iCal (.ics)</span>
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
                          <option value="All Suites">All Suites</option>
                          {sortedRooms.map((r) => (
                            <option key={r.id} value={r.roomNumber}>
                              {r.roomNumber} · {r.roomType}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="url"
                          aria-label="Inbound iCal link"
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
                              await updateOtaChannelIcal({
                                property,
                                channel: ch,
                                icalImportUrl: draft.url,
                                roomNumber: draft.room,
                                actorRole: ROLE_LABELS[activeRole],
                              });
                              setIcalDrafts((prev) => {
                                const next = { ...prev };
                                delete next[ch.id];
                                return next;
                              });
                              onNotify(`Saved iCal settings for ${ch.channelName}`);
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
                        onClick={() => {
                          void syncOtaChannelWorkflow({
                            property,
                            channel: ch,
                            toggleConnect: true,
                            actorRole: ROLE_LABELS[activeRole],
                          });
                          onNotify(`${ch.channelName} ${ch.connected ? 'disconnected' : 'connected'}`);
                        }}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {ch.connected ? 'Disconnect' : 'Connect'}
                      </button>
                      <label
                        title="Upload .ics calendar exported from Booking.com / Airbnb"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>.ics</span>
                        <input
                          type="file"
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
                        onClick={() => {
                          void deleteOtaChannel({
                            property,
                            channel: ch,
                            actorRole: ROLE_LABELS[activeRole],
                          });
                          onNotify(`Removed ${ch.channelName}`);
                        }}
                        title="Remove channel"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:text-rose-700 hover:border-rose-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!ch.connected || syncingChannelId === ch.id}
                      onClick={() => void handleSyncSingleChannel(ch)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncingChannelId === ch.id ? 'animate-spin' : ''}`}
                      />
                      <span>{syncingChannelId === ch.id ? 'Syncing...' : 'Sync Live iCal'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
              <h2 className="font-display text-sm font-bold text-slate-900">
                Provision New Property in PCH Network
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Name</label>
                  <input
                    required
                    type="text"
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Code</label>
                  <input
                    required
                    type="text"
                    value={propCode}
                    onChange={(e) => setPropCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">City</label>
                  <input
                    required
                    type="text"
                    value={propCity}
                    onChange={(e) => setPropCity(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">State</label>
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
                    value={propAddress}
                    onChange={(e) => setPropAddress(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Admin Email</label>
                  <input
                    type="email"
                    value={propAdminEmail}
                    onChange={(e) => setPropAdminEmail(e.target.value)}
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
                  className="px-4 py-2 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Create Property &amp; Initialize Rooms
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {properties.map((p) => {
              const isCurrent = p.id === property.id;
              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-xl p-5 space-y-3 ${
                    isCurrent ? 'border-emerald-600' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
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
                    <span className="text-xs font-semibold text-emerald-700 capitalize">
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
                      {getPropertySubdomainSlug(p)}.pchpms.com · /staff
                    </span>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => onSelectProperty(p.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
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
                Cloudflare Pages global edge hosting connected to Firebase Firestore.
              </p>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono-tabular overflow-x-auto">
{`npm install
npm run build
npx wrangler pages deploy dist --project-name=pch-pms`}
              </pre>
              <p className="text-xs text-slate-500">
                After deploying to Cloudflare Pages, add your <code className="font-mono-tabular">*.pages.dev</code> domain
                under Firebase Console → Authentication → Authorized Domains.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="font-display text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                Direct Portal Login Links
              </h2>
              {(
                [
                  { id: 'home', label: 'Software Homepage & Pricing (app.pchpms.com)' },
                  { id: 'richgates-admin', label: 'Richgates Property Admin Login' },
                  { id: 'staff', label: 'Richgates Staff Login' },
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

          {/* Direct Custom Subdomain Routing (admin.pchpms.com & property.pchpms.com/staff) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Globe className="w-4 h-4 text-[#1c46be]" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Direct Custom Domains (admin.pchpms.com, richgates.pchpms.com &amp; /staff)
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The application routes each property by subdomain, with Staff access nested directly under each property&apos;s own domain (<code className="font-mono-tabular">/staff</code>):
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-mono-tabular font-bold text-[#1c46be]">app.pchpms.com</p>
                <p className="font-semibold text-slate-900">Homepage &amp; Pricing</p>
                <p className="text-slate-600">
                  Public product showcase, software plans, purchase orders &amp; contact form.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-mono-tabular font-bold text-[#1c46be]">admin.pchpms.com</p>
                <p className="font-semibold text-slate-900">PCH Super Admin Console</p>
                <p className="text-slate-600">
                  Central PCH console to manage Richgates, onboard new properties, issue license keys, and edit CMS.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-mono-tabular font-bold text-emerald-700">richgates.pchpms.com</p>
                <p className="font-semibold text-slate-900">Richgates Property Admin</p>
                <p className="text-slate-600">
                  Opens Richgates Property Admin login and locks the workspace to Richgates Apartments.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <p className="font-mono-tabular font-bold text-slate-800">richgates.pchpms.com/staff</p>
                <p className="font-semibold text-slate-900">Property Staff Portal (/staff)</p>
                <p className="text-slate-600">
                  Routes Front Desk, Housekeeping, Kitchen, Accounts, and Engineering teams under that property&apos;s domain.
                </p>
              </div>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <li>
                In <strong>Cloudflare Dashboard → Workers &amp; Pages → pch-pms → Custom domains</strong>, click{' '}
                <strong>Set up a custom domain</strong> and add <code className="font-mono-tabular">app.pchpms.com</code>, <code className="font-mono-tabular">admin.pchpms.com</code>, and{' '}
                <code className="font-mono-tabular">richgates.pchpms.com</code> (plus any future <code className="font-mono-tabular">&lt;property&gt;.pchpms.com</code>).
              </li>
              <li>
                In your Cloudflare DNS for <code className="font-mono-tabular">pchpms.com</code>, ensure each subdomain has a{' '}
                <strong>CNAME</strong> record pointing to <code className="font-mono-tabular">pch-pms.pages.dev</code> (Proxied orange cloud ON, SSL mode <strong>Full (strict)</strong>). No separate DNS record is needed for <code className="font-mono-tabular">/staff</code>.
              </li>
              <li>
                In <strong>Firebase Console → Authentication → Settings → Authorized domains</strong>, add{' '}
                <code className="font-mono-tabular">app.pchpms.com</code>, <code className="font-mono-tabular">admin.pchpms.com</code>, and <code className="font-mono-tabular">richgates.pchpms.com</code> so Google Sign-In works on both Property Admin and <code className="font-mono-tabular">/staff</code>.
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
                  2. Remove Demo Guests from Live Firestore DB
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
