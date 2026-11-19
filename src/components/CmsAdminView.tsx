import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileEdit,
  Globe,
  LayoutDashboard,
  Lock,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  resetCmsContentWorkflow,
  saveCmsContentWorkflow,
} from '../services/pmsService';
import {
  CmsContent,
  CmsPageCopy,
  DEFAULT_CMS_CONTENT,
  NavSectionId,
  PropertyRecord,
  StaffRole,
} from '../types/pms';

interface CmsAdminViewProps {
  property: PropertyRecord;
  activeRole: StaffRole;
  actorRole: string;
  onNavigate: (section: NavSectionId) => void;
  onNotify: (msg: string) => void;
}

type CmsTabId = 'pages' | 'dashboard' | 'login' | 'brand';

const PAGE_ORDER: NavSectionId[] = [
  'dashboard',
  'reservations',
  'calendar',
  'arrivals',
  'in_house',
  'walk_in',
  'front_desk',
  'rooms',
  'guests',
  'housekeeping',
  'pos_kitchen',
  'inventory',
  'procurement',
  'accounting',
  'reports',
  'staff',
  'shifts_attendance',
  'payroll',
  'maintenance',
  'ota_channels',
  'messages',
  'training_help',
  'properties_admin',
  'licensing',
  'rbac_audit',
  'profile',
  'deployment',
  'cms',
];

function countChangedFields(a: CmsContent, b: CmsContent): number {
  let diffs = 0;
  for (const k of Object.keys(a.brand) as Array<keyof CmsContent['brand']>) {
    if (a.brand[k] !== b.brand[k]) diffs += 1;
  }
  for (const k of Object.keys(a.login) as Array<keyof CmsContent['login']>) {
    if (a.login[k] !== b.login[k]) diffs += 1;
  }
  for (const k of Object.keys(a.dashboard) as Array<keyof CmsContent['dashboard']>) {
    if (a.dashboard[k] !== b.dashboard[k]) diffs += 1;
  }
  for (const sec of PAGE_ORDER) {
    const pA = a.pages[sec];
    const pB = b.pages[sec];
    if (
      pA.navLabel !== pB.navLabel ||
      pA.title !== pB.title ||
      pA.subtitle !== pB.subtitle ||
      pA.ctaLabel !== pB.ctaLabel
    ) {
      diffs += 1;
    }
  }
  return diffs;
}

export const CmsAdminView: React.FC<CmsAdminViewProps> = ({
  property,
  activeRole,
  actorRole,
  onNavigate,
  onNotify,
}) => {
  const { cms, setCms } = useCms();
  const [draft, setDraft] = useState<CmsContent>(cms);
  const [activeTab, setActiveTab] = useState<CmsTabId>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cms);
  }, [cms]);

  const dirtyCount = useMemo(() => countChangedFields(draft, cms), [draft, cms]);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return PAGE_ORDER.filter((secId) => {
      if (!q) return true;
      const p = draft.pages[secId];
      return (
        secId.toLowerCase().includes(q) ||
        p.navLabel.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.ctaLabel.toLowerCase().includes(q)
      );
    });
  }, [draft.pages, searchQuery]);

  if (activeRole !== 'pch_admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="font-display text-base font-bold text-slate-900">
          PCH Super Admin Access Required
        </h2>
        <p className="text-xs text-slate-500">
          Only PCH Super Admin can edit global application copy and CMS page labels.
        </p>
      </div>
    );
  }

  const updatePageField = (
    secId: NavSectionId,
    field: keyof CmsPageCopy,
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        [secId]: {
          ...prev.pages[secId],
          [field]: value,
        },
      },
    }));
  };

  const resetSinglePage = (secId: NavSectionId) => {
    setDraft((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        [secId]: { ...DEFAULT_CMS_CONTENT.pages[secId] },
      },
    }));
    onNotify(`Restored default copy for ${DEFAULT_CMS_CONTENT.pages[secId].navLabel} (click Publish to save)`);
  };

  const updateDashboardField = (
    field: keyof CmsContent['dashboard'],
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      dashboard: {
        ...prev.dashboard,
        [field]: value,
      },
    }));
  };

  const updateLoginField = (
    field: keyof CmsContent['login'],
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      login: {
        ...prev.login,
        [field]: value,
      },
    }));
  };

  const updateBrandField = (
    field: keyof CmsContent['brand'],
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      brand: {
        ...prev.brand,
        [field]: value,
      },
    }));
  };

  const handlePublish = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      await saveCmsContentWorkflow({
        property,
        cms: draft,
        actorRole,
      });
      setCms(draft);
      onNotify('Published CMS updates live across all portals & pages');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save CMS changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmResetAll = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      await resetCmsContentWorkflow({
        property,
        actorRole,
      });
      setDraft(DEFAULT_CMS_CONTENT);
      setCms(DEFAULT_CMS_CONTENT);
      setShowResetModal(false);
      onNotify('Restored all app pages & text to factory defaults');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reset CMS defaults.');
    } finally {
      setSaving(false);
    }
  };

  const pageMeta = cms.pages.cms;

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PCH Super Admin Exclusive CMS</span>
            {cms.updatedByEmail && (
              <span className="text-slate-400 font-normal">
                · Last published by {cms.updatedByEmail}
              </span>
            )}
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {pageMeta.title}
          </h1>
          <p className="text-xs text-slate-500">{pageMeta.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {dirtyCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 whitespace-nowrap">
              {dirtyCount} unsaved edit{dirtyCount === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => setShowResetModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Defaults</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handlePublish}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Publishing...' : pageMeta.ctaLabel || 'Publish CMS Changes'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Category Tabs & Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              { id: 'pages', label: `All App Pages (${PAGE_ORDER.length})`, icon: FileEdit },
              { id: 'dashboard', label: 'Dashboard & Quick Actions', icon: LayoutDashboard },
              { id: 'login', label: 'Login & Portal Pages', icon: Lock },
              { id: 'brand', label: 'Global Brand & Notices', icon: Globe },
            ] as Array<{ id: CmsTabId; label: string; icon: React.ComponentType<{ className?: string }> }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'pages' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter pages by name, title, or copy..."
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600 w-full md:w-72"
            />
          </div>
        )}
      </div>

      {/* TAB 1: ALL APP PAGES */}
      {activeTab === 'pages' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredPages.map((secId) => {
            const page = draft.pages[secId];
            const def = DEFAULT_CMS_CONTENT.pages[secId];
            const isModified =
              page.navLabel !== cms.pages[secId].navLabel ||
              page.title !== cms.pages[secId].title ||
              page.subtitle !== cms.pages[secId].subtitle ||
              page.ctaLabel !== cms.pages[secId].ctaLabel;

            return (
              <div
                key={secId}
                className={`bg-white border rounded-xl p-5 space-y-3.5 ${
                  isModified ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular text-[11px] font-bold text-emerald-700 uppercase">
                        {secId}
                      </span>
                      {isModified && (
                        <span className="text-[11px] font-semibold text-amber-700">
                          · Modified
                        </span>
                      )}
                    </div>
                    <p className="font-display text-sm font-bold text-slate-900 mt-0.5">
                      {page.navLabel || def.navLabel}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => resetSinglePage(secId)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium cursor-pointer"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(secId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">
                      Sidebar &amp; Breadcrumb Label
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={page.navLabel}
                      onChange={(e) => updatePageField(secId, 'navLabel', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">
                      Primary Action Button Label
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={page.ctaLabel}
                      onChange={(e) => updatePageField(secId, 'ctaLabel', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-600 mb-1">
                      Page Main Heading (H1)
                    </label>
                    <input
                      type="text"
                      maxLength={240}
                      value={page.title}
                      onChange={(e) => updatePageField(secId, 'title', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-semibold focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-600 mb-1">
                      Page Subtitle / Description
                    </label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={page.subtitle}
                      onChange={(e) => updatePageField(secId, 'subtitle', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: DASHBOARD & QUICK ACTIONS */}
      {activeTab === 'dashboard' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Dashboard Headings, Room Sections &amp; Quick Buttons
              </h2>
              <p className="text-slate-500 mt-0.5">
                Controls the labels shown directly on the main Property Operations Dashboard
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({ ...prev, dashboard: { ...DEFAULT_CMS_CONTENT.dashboard } }))
              }
              className="px-3 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset Dashboard Copy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Dashboard Reservations Section Heading
              </label>
              <input
                type="text"
                maxLength={160}
                value={draft.dashboard.reservationsLedgerTitle}
                onChange={(e) => updateDashboardField('reservationsLedgerTitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Dashboard Reservations Section Subtitle
              </label>
              <input
                type="text"
                maxLength={320}
                value={draft.dashboard.reservationsLedgerSubtitle}
                onChange={(e) => updateDashboardField('reservationsLedgerSubtitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Room Overview Title</label>
              <input
                type="text"
                maxLength={160}
                value={draft.dashboard.roomOverviewTitle}
                onChange={(e) => updateDashboardField('roomOverviewTitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Today&apos;s Schedule Title</label>
              <input
                type="text"
                maxLength={160}
                value={draft.dashboard.scheduleTitle}
                onChange={(e) => updateDashboardField('scheduleTitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Serviced Apartment Section Title
              </label>
              <input
                type="text"
                maxLength={160}
                value={draft.dashboard.servicedSectionTitle}
                onChange={(e) => updateDashboardField('servicedSectionTitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Serviced Apartment Subtitle
              </label>
              <input
                type="text"
                maxLength={320}
                value={draft.dashboard.servicedSectionSubtitle}
                onChange={(e) => updateDashboardField('servicedSectionSubtitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Hotel Rooms Section Title
              </label>
              <input
                type="text"
                maxLength={160}
                value={draft.dashboard.hotelSectionTitle}
                onChange={(e) => updateDashboardField('hotelSectionTitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Hotel Rooms Subtitle
              </label>
              <input
                type="text"
                maxLength={320}
                value={draft.dashboard.hotelSectionSubtitle}
                onChange={(e) => updateDashboardField('hotelSectionSubtitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Quick Action Buttons
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  { key: 'quickWalkInLabel', label: 'Walk-in Check-in Button' },
                  { key: 'quickReservationsLabel', label: 'Reservations Button' },
                  { key: 'quickArrivalsLabel', label: 'Arrivals Button' },
                  { key: 'quickInHouseLabel', label: 'In-House Button' },
                  { key: 'quickFrontDeskLabel', label: 'Front Desk Button' },
                  { key: 'quickCalendarLabel', label: 'Calendar Button' },
                  { key: 'quickChannelManagerLabel', label: 'Channel Manager Button' },
                ] as Array<{ key: keyof CmsContent['dashboard']; label: string }>
              ).map((item) => (
                <div key={item.key}>
                  <label className="block font-medium text-slate-600 mb-1">{item.label}</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={draft.dashboard[item.key]}
                    onChange={(e) => updateDashboardField(item.key, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LOGIN & PORTAL PAGES */}
      {activeTab === 'login' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Sign-In Pages (Richgates Admin, Richgates Staff, PCH Super Admin)
              </h2>
              <p className="text-slate-500 mt-0.5">
                Customize hero titles, descriptions, and sign-in card headings on the portal gateway
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({ ...prev, login: { ...DEFAULT_CMS_CONTENT.login } }))
              }
              className="px-3 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset Login Copy
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Richgates Admin Login */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
              <h3 className="font-display text-sm font-bold text-slate-900">
                1. Richgates Admin Login
              </h3>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Kicker</label>
                <input
                  type="text"
                  maxLength={120}
                  value={draft.login.richgatesHeroKicker}
                  onChange={(e) => updateLoginField('richgatesHeroKicker', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Title</label>
                <input
                  type="text"
                  maxLength={200}
                  value={draft.login.richgatesHeroTitle}
                  onChange={(e) => updateLoginField('richgatesHeroTitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Description</label>
                <textarea
                  rows={3}
                  maxLength={400}
                  value={draft.login.richgatesHeroDesc}
                  onChange={(e) => updateLoginField('richgatesHeroDesc', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sign-In Heading</label>
                <input
                  type="text"
                  maxLength={160}
                  value={draft.login.richgatesSignInTitle}
                  onChange={(e) => updateLoginField('richgatesSignInTitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sign-In Subtitle</label>
                <input
                  type="text"
                  maxLength={240}
                  value={draft.login.richgatesSignInSubtitle}
                  onChange={(e) => updateLoginField('richgatesSignInSubtitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
            </div>

            {/* Richgates Staff Login */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2. Richgates Staff Login
              </h3>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Kicker</label>
                <input
                  type="text"
                  maxLength={120}
                  value={draft.login.staffHeroKicker}
                  onChange={(e) => updateLoginField('staffHeroKicker', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Title</label>
                <input
                  type="text"
                  maxLength={200}
                  value={draft.login.staffHeroTitle}
                  onChange={(e) => updateLoginField('staffHeroTitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Description</label>
                <textarea
                  rows={3}
                  maxLength={400}
                  value={draft.login.staffHeroDesc}
                  onChange={(e) => updateLoginField('staffHeroDesc', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sign-In Heading</label>
                <input
                  type="text"
                  maxLength={160}
                  value={draft.login.staffSignInTitle}
                  onChange={(e) => updateLoginField('staffSignInTitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sign-In Subtitle</label>
                <input
                  type="text"
                  maxLength={240}
                  value={draft.login.staffSignInSubtitle}
                  onChange={(e) => updateLoginField('staffSignInSubtitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
            </div>

            {/* PCH Super Admin Login */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
              <h3 className="font-display text-sm font-bold text-slate-900">
                3. PCH Super Admin Login
              </h3>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Kicker</label>
                <input
                  type="text"
                  maxLength={120}
                  value={draft.login.pchHeroKicker}
                  onChange={(e) => updateLoginField('pchHeroKicker', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Title</label>
                <input
                  type="text"
                  maxLength={200}
                  value={draft.login.pchHeroTitle}
                  onChange={(e) => updateLoginField('pchHeroTitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Hero Description</label>
                <textarea
                  rows={3}
                  maxLength={400}
                  value={draft.login.pchHeroDesc}
                  onChange={(e) => updateLoginField('pchHeroDesc', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sign-In Heading</label>
                <input
                  type="text"
                  maxLength={160}
                  value={draft.login.pchSignInTitle}
                  onChange={(e) => updateLoginField('pchSignInTitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sign-In Subtitle</label>
                <input
                  type="text"
                  maxLength={240}
                  value={draft.login.pchSignInSubtitle}
                  onChange={(e) => updateLoginField('pchSignInSubtitle', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
            </div>
          </div>

          <div className="max-w-sm">
            <label className="block font-semibold text-slate-700 mb-1">
              Sign-In Links Card Heading
            </label>
            <input
              type="text"
              maxLength={120}
              value={draft.login.signInLinksHeading}
              onChange={(e) => updateLoginField('signInLinksHeading', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>
        </div>
      )}

      {/* TAB 4: GLOBAL BRAND & NOTICES */}
      {activeTab === 'brand' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Global Portal Branding, Announcement Banner &amp; Operational Policies
              </h2>
              <p className="text-slate-500 mt-0.5">
                Applied across Sidebar navigation, Top Bar, Check-In checklists, and Guest Folios
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({ ...prev, brand: { ...DEFAULT_CMS_CONTENT.brand } }))
              }
              className="px-3 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset Brand Copy
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                PCH Portal Brand Name
              </label>
              <input
                type="text"
                maxLength={120}
                value={draft.brand.pchPortalName}
                onChange={(e) => updateBrandField('pchPortalName', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Richgates Portal Brand Name
              </label>
              <input
                type="text"
                maxLength={120}
                value={draft.brand.richgatesPortalName}
                onChange={(e) => updateBrandField('richgatesPortalName', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Top Bar Portal Links Button
              </label>
              <input
                type="text"
                maxLength={80}
                value={draft.brand.portalLinksButton}
                onChange={(e) => updateBrandField('portalLinksButton', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                PCH Role Subtitle
              </label>
              <input
                type="text"
                maxLength={120}
                value={draft.brand.pchRoleSubtitle}
                onChange={(e) => updateBrandField('pchRoleSubtitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Richgates Admin Role Subtitle
              </label>
              <input
                type="text"
                maxLength={120}
                value={draft.brand.richgatesAdminSubtitle}
                onChange={(e) => updateBrandField('richgatesAdminSubtitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Richgates Staff Role Subtitle
              </label>
              <input
                type="text"
                maxLength={120}
                value={draft.brand.richgatesStaffSubtitle}
                onChange={(e) => updateBrandField('richgatesStaffSubtitle', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Global Announcement Banner (Optional — leave blank to hide)
              </label>
              <input
                type="text"
                maxLength={320}
                value={draft.brand.announcementBanner}
                onChange={(e) => updateBrandField('announcementBanner', e.target.value)}
                placeholder="e.g. Scheduled generator maintenance Sunday 14:00–15:00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Front Desk Check-In Policy Notice
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={draft.brand.checkInPolicyNote}
                onChange={(e) => updateBrandField('checkInPolicyNote', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Guest Folio &amp; Receipt Footer Note
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={draft.brand.folioFooterNote}
                onChange={(e) => updateBrandField('folioFooterNote', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Reset All */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Reset All CMS Copy to Defaults?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Restores all 26 page labels, dashboard headings, login portals, and policy notices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmResetAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{saving ? 'Resetting...' : 'Yes, Restore All Defaults'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
