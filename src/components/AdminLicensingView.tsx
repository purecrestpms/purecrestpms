import React, { useState } from 'react';
import {
  Building2,
  Check,
  CloudUpload,
  Copy,
  Globe,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  UserPlus,
} from 'lucide-react';
import {
  activateLicenseKeyWorkflow,
  authorizeUserEmailForProperty,
  createNewPropertyWithRooms,
  generateCentralLicense,
  syncOtaChannelWorkflow,
  updateLicenseStatus,
} from '../services/pmsService';
import {
  AuditLogRecord,
  formatNgn,
  getPortalUrl,
  LicenseRecord,
  NavSectionId,
  OtaIntegrationRecord,
  PortalMode,
  PropertyRecord,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  RoomRecord,
  StaffRole,
} from '../types/pms';

interface AdminLicensingViewProps {
  section: Extract<
    NavSectionId,
    'ota_channels' | 'properties_admin' | 'licensing' | 'rbac_audit' | 'deployment'
  >;
  property: PropertyRecord;
  properties: PropertyRecord[];
  rooms: RoomRecord[];
  otaChannels: OtaIntegrationRecord[];
  licenses: LicenseRecord[];
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
  otaChannels,
  licenses,
  auditLogs,
  activeRole,
  onSelectProperty,
  onSwitchPortal,
  onNotify,
}) => {
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
  const [grantName, setGrantName] = useState('');
  const [grantRole, setGrantRole] = useState<StaffRole>('front_desk');

  const [busy, setBusy] = useState(false);

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

    setBusy(true);
    try {
      const key = await generateCentralLicense({
        property: targetProp,
        plan: licPlan,
        billingCycle: effectiveCycle,
        maxRooms: pricing.rooms,
        priceNgn,
        durationDays: effectiveCycle === 'monthly' ? 30 : licDurationDays,
        autoActivate: licAutoActivate,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Generated PureCrest license key ${key}`);
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
    if (!grantEmail.trim() || !grantName.trim()) return;
    setBusy(true);
    try {
      await authorizeUserEmailForProperty({
        property,
        email: grantEmail.trim(),
        displayName: grantName.trim(),
        role: grantRole,
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify(`Granted ${ROLE_LABELS[grantRole]} access to ${grantEmail}`);
      setGrantEmail('');
      setGrantName('');
    } finally {
      setBusy(false);
    }
  };

  const availableRoom = rooms.find((r) => r.occupancyStatus === 'vacant');

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {section === 'ota_channels'
              ? 'Online Booking & OTA Channel Integrations'
              : section === 'properties_admin'
                ? `Multi-Property Administration (${properties.length} Properties)`
                : section === 'licensing'
                  ? 'Centralized PureCrest Software Licensing & Activation'
                  : section === 'rbac_audit'
                    ? 'Role-Based Access Control & Audit Trail'
                    : 'Cloudflare Edge Deployment & Portal Links'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {section === 'ota_channels'
              ? 'Two-way inventory sync with Booking.com, Airbnb, Hotels.ng, Expedia, and Direct Booking Engine'
              : section === 'properties_admin'
                ? 'Central PureCrest portfolio administration across Nigerian hospitality properties'
                : section === 'licensing'
                  ? 'Generate, activate, and enforce property-bound Lifetime and Subscription license keys'
                  : section === 'rbac_audit'
                    ? 'Authorized user emails, portal role matrix, and immutable chronological audit logs'
                    : 'Direct portal links and Cloudflare Pages edge deployment configuration'}
          </p>
        </div>

        {section === 'properties_admin' && activeRole === 'pch_admin' && (
          <button
            type="button"
            onClick={() => setShowPropForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Property</span>
          </button>
        )}
      </div>

      {/* SECTION: OTA CHANNELS */}
      {section === 'ota_channels' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {otaChannels.map((ch) => (
            <div
              key={ch.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
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

                <p className="font-mono-tabular text-xs text-slate-500">
                  Listing ID: {ch.propertyListingId}
                </p>

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
                <p className="font-mono-tabular text-[11px] text-slate-500">
                  Last Sync: {ch.lastSyncedIso.slice(0, 16).replace('T', ' ')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    syncOtaChannelWorkflow({
                      property,
                      channel: ch,
                      toggleConnect: true,
                      actorRole: ROLE_LABELS[activeRole],
                    });
                    onNotify(`${ch.channelName} ${ch.connected ? 'disconnected' : 'connected'}`);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
                >
                  {ch.connected ? 'Disconnect' : 'Connect'}
                </button>
                <button
                  type="button"
                  disabled={!ch.connected}
                  onClick={() => {
                    syncOtaChannelWorkflow({
                      property,
                      channel: ch,
                      importSampleBooking: Boolean(availableRoom),
                      availableRoom,
                      actorRole: ROLE_LABELS[activeRole],
                    });
                    onNotify(
                      availableRoom
                        ? `Synced ${ch.channelName} & imported booking into Room ${availableRoom.roomNumber}`
                        : `Synced inventory with ${ch.channelName}`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync &amp; Pull Booking</span>
                </button>
              </div>
            </div>
          ))}
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
                <input
                  required
                  type="text"
                  placeholder="Property Name (e.g. PureCrest Suites Abuja)"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  required
                  type="text"
                  placeholder="Code (e.g. PC-ABJ-02)"
                  value={propCode}
                  onChange={(e) => setPropCode(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  required
                  type="text"
                  placeholder="City"
                  value={propCity}
                  onChange={(e) => setPropCity(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  required
                  type="text"
                  placeholder="State"
                  value={propState}
                  onChange={(e) => setPropState(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="Street Address"
                  value={propAddress}
                  onChange={(e) => setPropAddress(e.target.value)}
                  className="lg:col-span-2 border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  type="email"
                  placeholder="Property Admin Email"
                  value={propAdminEmail}
                  onChange={(e) => setPropAdminEmail(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={propRooms}
                    onChange={(e) => setPropRooms(Number(e.target.value))}
                    placeholder="Rooms"
                    className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                  <input
                    type="number"
                    min={10000}
                    step={5000}
                    value={propBaseRate}
                    onChange={(e) => setPropBaseRate(Number(e.target.value))}
                    placeholder="Base ₦"
                    className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
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

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">Admin: {p.adminEmail}</span>
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

      {/* SECTION: CENTRALIZED PURECREST SOFTWARE LICENSING & ACTIVATION */}
      {section === 'licensing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* License Key Generator */}
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
                  disabled={busy || activeRole !== 'pch_admin'}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg"
                >
                  Generate License Key
                </button>
              </div>
              {activeRole !== 'pch_admin' && (
                <p className="text-[11px] text-amber-700">
                  Only PCH Super Admin can issue new PureCrest keys.{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchPortal('pch-admin')}
                    className="font-semibold underline hover:text-amber-900 cursor-pointer"
                  >
                    Switch to PCH Super Admin Portal
                  </button>
                </p>
              )}
            </form>

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
                    Enter PureCrest License Key
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. PCH-ABJ2-ENTP-5190-NGN1"
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

          {/* Centralized License Registry Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Centralized PureCrest License Registry
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  type="text"
                  placeholder="Staff Name"
                  value={grantName}
                  onChange={(e) => setGrantName(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  required
                  type="email"
                  placeholder="Google Email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <select
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as StaffRole)}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="property_admin">Property Admin (GM)</option>
                  <option value="front_desk">Front Desk</option>
                  <option value="housekeeping">Housekeeping</option>
                  <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                  <option value="accountant">Accountant</option>
                  <option value="maintenance">Maintenance</option>
                </select>
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
                  Grant Portal Access
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
                { id: 'pch-admin', label: 'PCH Super Admin Login' },
                { id: 'richgates-admin', label: 'Richgates Apartments Property Admin Login' },
                { id: 'staff', label: 'Staff Operations Login' },
              ] as Array<{ id: PortalMode; label: string }>
            ).map((item) => {
              const url = getPortalUrl(item.id);
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
                          <span>Copy</span>
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
      )}
    </div>
  );
};
