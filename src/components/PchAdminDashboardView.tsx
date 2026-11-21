import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  ExternalLink,
  KeyRound,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  formatNgn,
  getConnectedRootDomain,
  getPortalUrl,
  getPropertySubdomainSlug,
  getPropertySystemId,
  LicenseRecord,
  NavSectionId,
  PlanInquiryRecord,
  PropertyRecord,
} from '../types/pms';
import { RICHGATES_EXTERIOR_IMAGE_URL } from '../utils/mediaAssets';

interface PchAdminDashboardViewProps {
  properties: PropertyRecord[];
  activePropertyId: string;
  licenses: LicenseRecord[];
  planInquiries: PlanInquiryRecord[];
  userName: string;
  onSelectProperty: (propertyId: string) => void;
  onNavigate: (section: NavSectionId) => void;
  onCreateLoginForProperty: (propertyId: string) => void;
  onOpenPortalLinksModal: () => void;
}

function getTimeGreeting(): string {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

const HERO_IMAGE = RICHGATES_EXTERIOR_IMAGE_URL;

export const PchAdminDashboardView: React.FC<PchAdminDashboardViewProps> = ({
  properties,
  activePropertyId,
  licenses,
  planInquiries,
  userName,
  onSelectProperty,
  onNavigate,
  onCreateLoginForProperty,
  onOpenPortalLinksModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PropertyRecord['status']>('all');
  const rootDomain = getConnectedRootDomain();
  const firstName = (userName || 'Admin').trim().split(/\s+/)[0] || 'Admin';

  const metrics = useMemo(() => {
    const totalProperties = properties.length;
    const activeProperties = properties.filter((p) => p.status === 'active').length;
    const onboardingProperties = properties.filter((p) => p.status === 'onboarding').length;
    const totalRooms = properties.reduce((sum, p) => sum + (Number(p.roomCount) || 0), 0);

    const activeLicenses = licenses.filter((l) => l.status === 'active');
    const licensedCapacity = activeLicenses.reduce(
      (sum, l) => sum + (Number(l.maxRooms) || 0),
      0
    );
    const openInquiries = planInquiries.filter((i) => i.status !== 'provisioned').length;
    const pipelineValueNgn = planInquiries
      .filter((i) => i.status !== 'provisioned' && i.currency === 'NGN')
      .reduce((sum, i) => sum + (Number(i.estimatedTotalNgn) || 0), 0);

    return {
      totalProperties,
      activeProperties,
      onboardingProperties,
      totalRooms,
      activeLicensesCount: activeLicenses.length,
      licensedCapacity,
      openInquiries,
      pipelineValueNgn,
    };
  }, [properties, licenses, planInquiries]);

  const filteredProperties = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...properties]
      .filter((p) => {
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.city || '').toLowerCase().includes(q) ||
          (p.state || '').toLowerCase().includes(q) ||
          (p.adminEmail || '').toLowerCase().includes(q) ||
          getPropertySystemId(p).toLowerCase().includes(q) ||
          getPropertySubdomainSlug(p).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [properties, searchQuery, statusFilter]);

  const maxRoomCount = useMemo(
    () => Math.max(10, ...properties.map((p) => Number(p.roomCount) || 0)),
    [properties]
  );

  const recentInquiries = useMemo(
    () =>
      [...planInquiries]
        .sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || ''))
        .slice(0, 5),
    [planInquiries]
  );

  return (
    <div className="space-y-6">
      {/* Multi-Property Executive Welcome Banner */}
      <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="relative z-10 px-5 py-5 sm:px-6 sm:py-5 max-w-2xl">
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight">
            <span className="text-[#0a367a]">{getTimeGreeting()},</span>{' '}
            <span className="text-slate-900">{firstName}!</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Multi-property platform overview across{' '}
            <strong className="text-slate-900 font-mono-tabular">
              {metrics.totalProperties}
            </strong>{' '}
            {metrics.totalProperties === 1 ? 'property' : 'properties'} on{' '}
            <span className="font-mono-tabular font-semibold text-[#0a367a]">
              admin.{rootDomain}
            </span>
            .
          </p>
          <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
            <button
              type="button"
              onClick={() => onNavigate('properties_admin')}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Property</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('user_management')}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#0a367a]" />
              <span>Create Property Login</span>
            </button>
          </div>
        </div>

        {/* Right Architectural Accent Photo with Smooth Scrim */}
        <div className="hidden md:block absolute inset-y-0 right-0 w-[42%] pointer-events-none">
          <img
            src={HERO_IMAGE}
            alt="Multi-property hospitality portfolio"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/75 to-transparent" />
        </div>
      </div>

      {/* 4 Portfolio KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => onNavigate('properties_admin')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 hover:border-[#0a367a] transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Total Properties</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {String(metrics.totalProperties).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-[#0a367a] mt-0.5">
              {metrics.activeProperties} active · {metrics.onboardingProperties} onboarding
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('properties_admin')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 hover:border-[#0a367a] transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Portfolio Rooms</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {metrics.totalRooms}
            </p>
            <p className="text-[11px] font-semibold text-[#1557b0] mt-0.5">
              Across all registered properties
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('licensing')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 hover:border-[#0a367a] transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Active Licenses</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {String(metrics.activeLicensesCount).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-[#0a367a] mt-0.5 font-mono-tabular">
              {metrics.licensedCapacity} rooms licensed
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('licensing')}
          className="text-left bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 hover:border-[#0a367a] transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Onboarding Inquiries</p>
            <p className="font-display font-mono-tabular text-xl sm:text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {String(metrics.openInquiries).padStart(2, '0')}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 font-mono-tabular">
              {metrics.pipelineValueNgn > 0
                ? `${formatNgn(metrics.pipelineValueNgn)} pipeline`
                : `${planInquiries.length} total inquiries`}
            </p>
          </div>
        </button>
      </div>

      {/* Row 2: Property Room Capacity Comparison + Quick Platform Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0a367a]" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Room Inventory by Property
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-mono-tabular">
              {metrics.totalRooms} total rooms
            </span>
          </div>

          {properties.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-slate-700">No properties onboarded yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Provision your first hospitality property to start managing tenants across PCH PMS.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('properties_admin')}
                className="mt-4 h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Property</span>
              </button>
            </div>
          ) : (
            <div className="h-52 flex items-end gap-3 sm:gap-5 pt-6 pb-2 px-2 overflow-x-auto">
              {properties.slice(0, 8).map((prop) => {
                const count = Number(prop.roomCount) || 0;
                const heightPct = Math.max(12, Math.round((count / maxRoomCount) * 100));
                const isSelected = prop.id === activePropertyId;
                return (
                  <button
                    key={prop.id}
                    type="button"
                    onClick={() => onSelectProperty(prop.id)}
                    className="flex-1 min-w-[72px] flex flex-col items-center gap-1.5 group cursor-pointer"
                    title={`${prop.name}: ${count} rooms (${prop.licensePlan || 'Starter'})`}
                  >
                    <span className="font-mono-tabular text-xs font-bold text-slate-800">
                      {count}
                    </span>
                    <div className="w-full max-w-[52px] h-36 bg-slate-100 rounded-t-lg flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          isSelected
                            ? 'bg-[#0a367a]'
                            : 'bg-[#1557b0] group-hover:bg-[#0a367a]'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-600 truncate max-w-[92px]">
                      {prop.name.split(',')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Platform Actions (Dark Blue Card) */}
        <div className="lg:col-span-4 bg-[#0a367a] rounded-2xl p-5 text-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-blue-200" />
            <h2 className="font-display text-base font-bold text-white">Quick Actions</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1">
            <button
              type="button"
              onClick={() => onNavigate('properties_admin')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <Building2 className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-semibold leading-tight">Add Property</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('user_management')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <UserPlus className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-semibold leading-tight">Property Login</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('licensing')}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <KeyRound className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-semibold leading-tight">Licenses</span>
            </button>

            <button
              type="button"
              onClick={onOpenPortalLinksModal}
              className="bg-white hover:bg-blue-50 text-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer"
            >
              <ExternalLink className="w-5 h-5 text-[#0a367a]" />
              <span className="text-xs font-semibold leading-tight">Portal Links</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Multi-Property Portfolio Directory */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Registered Properties Portfolio
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Switch workspaces, issue full-access Property Admin logins, or inspect tenant portals
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(['all', 'active', 'onboarding', 'suspended'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search property, city, email..."
                className="w-full h-9 pl-8 pr-3 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0a367a]"
              />
            </div>
          </div>
        </div>

        {filteredProperties.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            {properties.length === 0
              ? 'No properties registered yet. Click "Add New Property" above to onboard your first client.'
              : 'No properties match your search or status filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-5">Property</th>
                  <th className="py-3 px-3">Portal URL</th>
                  <th className="py-3 px-3">Primary Admin</th>
                  <th className="py-3 px-3 text-right">Rooms</th>
                  <th className="py-3 px-3">Plan & Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProperties.map((prop) => {
                  const slug = getPropertySubdomainSlug(prop);
                  const adminUrl = getPortalUrl('richgates-admin', prop);
                  const activeLic = licenses.find(
                    (l) => l.propertyId === prop.id && l.status === 'active'
                  );
                  return (
                    <tr key={prop.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-slate-900">{prop.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                          {getPropertySystemId(prop)} · {prop.city}, {prop.state}
                        </p>
                      </td>
                      <td className="py-3.5 px-3 font-mono-tabular">
                        <a
                          href={adminUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0a367a] hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          <span>
                            {slug}.{rootDomain}
                          </span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="py-3.5 px-3 text-slate-700 font-mono-tabular">
                        {prop.adminEmail || 'Not set'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-semibold text-slate-900">
                        {prop.roomCount}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-medium text-slate-800">
                          {activeLic?.plan || prop.licensePlan || 'Starter'}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span
                          className={`font-semibold capitalize ${
                            prop.status === 'suspended'
                              ? 'text-rose-700'
                              : prop.status === 'onboarding'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {prop.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onCreateLoginForProperty(prop.id)}
                            className="h-8 px-3 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Create Login
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProperty(prop.id);
                              onNavigate('properties_admin');
                            }}
                            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 4: Recent Plan Inquiries (Compact Essential View) */}
      {recentInquiries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Recent Onboarding &amp; Plan Inquiries
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('licensing')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a367a] hover:underline cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-5">Property</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentInquiries.map((inq) => (
                  <tr key={inq.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-semibold text-slate-900">
                      {inq.propertyName}
                      <span className="block text-[11px] font-normal text-slate-500">
                        {inq.cityState}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {inq.contactName}
                      <span className="block text-[11px] font-mono-tabular text-slate-500">
                        {inq.contactEmail}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {inq.plan} ({inq.roomCount} rooms)
                    </td>
                    <td className="py-3 px-5 text-right capitalize font-semibold text-slate-700">
                      {inq.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
