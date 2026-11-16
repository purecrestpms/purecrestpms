import React, { useEffect, useState } from 'react';
import {
  BedDouble,
  BookOpenCheck,
  Building2,
  Calendar,
  CalendarCheck2,
  ChefHat,
  ClipboardList,
  Clock,
  CloudUpload,
  CreditCard,
  DoorOpen,
  FileEdit,
  FileSpreadsheet,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  Mail,
  Package,
  PlaneLanding,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserCheck,
  UserCircle2,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  NavSectionId,
  PortalMode,
  PropertyRecord,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  StaffRole,
} from '../types/pms';

interface SidebarProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  properties: PropertyRecord[];
  activePropertyId: string;
  onSelectProperty: (id: string) => void;
  portalMode: PortalMode;
  activeRole: StaffRole;
  allowedSections?: NavSectionId[];
  userEmail: string;
  userName: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenPortalLinksModal: () => void;
  onSwitchPropertyPortal: (portal: 'richgates-admin' | 'staff') => void;
  onSignOut: () => void;
  unreadMessageCount?: number;
}

const NAV_GROUPS: Array<{
  group: string;
  items: Array<{
    id: NavSectionId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}> = [
  {
    group: 'Operations',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'reservations', label: 'Reservations', icon: CalendarCheck2 },
      { id: 'calendar', label: 'Calendar & Blocks', icon: Calendar },
      { id: 'arrivals', label: 'Arrivals', icon: PlaneLanding },
      { id: 'in_house', label: 'In-House', icon: DoorOpen },
      { id: 'walk_in', label: 'Walk-in Check-in', icon: UserCheck },
      { id: 'front_desk', label: 'Front Desk & Folios', icon: BookOpenCheck },
      { id: 'rooms', label: 'Rooms & Rates', icon: BedDouble },
      { id: 'guests', label: 'Guest Profiles', icon: Users },
      { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
      { id: 'messages', label: 'Messages & Alerts', icon: Mail },
    ],
  },
  {
    group: 'Food & Supply',
    items: [
      { id: 'pos_kitchen', label: 'Restaurant POS & KDS', icon: ChefHat },
      { id: 'inventory', label: 'Store Inventory', icon: Package },
      { id: 'procurement', label: 'Procurement & POs', icon: ShoppingCart },
    ],
  },
  {
    group: 'Finance & HR',
    items: [
      { id: 'accounting', label: 'Accounting Ledger', icon: CreditCard },
      { id: 'reports', label: 'Financial Reports', icon: FileSpreadsheet },
      { id: 'staff', label: 'Staff, Users & Performance', icon: Users },
      { id: 'shifts_attendance', label: 'Shifts & Attendance', icon: Clock },
      { id: 'payroll', label: 'Monthly Payroll', icon: Wallet },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    ],
  },
  {
    group: 'Channels & Admin',
    items: [
      { id: 'user_management', label: 'User Management', icon: ShieldCheck },
      { id: 'ota_channels', label: 'Channel Manager & iCal', icon: Globe },
      { id: 'properties_admin', label: 'Multi-Property Admin', icon: Building2 },
      { id: 'licensing', label: 'Software Licensing', icon: KeyRound },
      { id: 'rbac_audit', label: 'RBAC & Audit Logs', icon: Shield },
      { id: 'cms', label: 'App CMS & Text Editor', icon: FileEdit },
      { id: 'profile', label: 'Admin & Property Profile', icon: UserCircle2 },
      { id: 'deployment', label: 'Cloudflare Deploy', icon: CloudUpload },
    ],
  },
  {
    group: 'Support & Training',
    items: [
      { id: 'training_help', label: 'Docs, Training & Help', icon: LifeBuoy },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  properties,
  activePropertyId,
  onSelectProperty,
  portalMode,
  activeRole,
  allowedSections,
  userEmail,
  userName,
  mobileOpen,
  onCloseMobile,
  onOpenPortalLinksModal,
  onSwitchPropertyPortal,
  onSignOut,
  unreadMessageCount = 0,
}) => {
  const { cms } = useCms();
  const allowed =
    allowedSections && allowedSections.length > 0
      ? allowedSections
      : ROLE_ALLOWED_SECTIONS[activeRole];
  const activeProp = properties.find((p) => p.id === activePropertyId) || properties[0];
  const [logoError, setLogoError] = useState(false);
  const [pchLogoError, setPchLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [activeProp?.logoUrl]);

  const handleNavClick = (sectionId: NavSectionId) => {
    onSelectSection(sectionId);
    onCloseMobile();
  };

  const sidebarBody = (
    <div className="w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0 border-r border-slate-800 h-full">
      {/* Brand Lockup — Property logo updates NEVER alter PCH Super Admin emblem */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {portalMode === 'pch-admin' ? (
            !pchLogoError ? (
              <div className="w-9 h-9 rounded-lg overflow-hidden bg-white shrink-0">
                <img
                  src="/assets/aistudio/4A541DC4-8B5B-4592-9C9E-752D5AE470AD_3f72a29d.png"
                  alt="PCH Emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setPchLogoError(true)}
                  className="w-full h-full object-cover scale-[1.06]"
                />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#0B245B] border border-amber-400/50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
            )
          ) : activeProp?.logoUrl && !logoError ? (
            <img
              key={activeProp.logoUrl}
              src={activeProp.logoUrl}
              alt={activeProp.name}
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-emerald-800 border border-emerald-600/50 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <span
              className={`${
                portalMode === 'pch-admin' ? 'font-site-title text-lg' : 'font-display text-lg'
              } font-bold tracking-tight text-white block truncate`}
            >
              {portalMode === 'pch-admin' ? cms.brand.pchPortalName : cms.brand.richgatesPortalName}
            </span>
            <p className="text-[11px] text-slate-400 truncate">
              {portalMode === 'pch-admin'
                ? cms.brand.pchRoleSubtitle
                : portalMode === 'richgates-admin'
                  ? cms.brand.richgatesAdminSubtitle
                  : cms.brand.richgatesStaffSubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {portalMode === 'pch-admin' && (
            <button
              type="button"
              onClick={onOpenPortalLinksModal}
              title="Portal Login Links & Switcher"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Property Selector */}
      <div className="px-4 py-3 border-b border-slate-800">
        <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
          Active Property
        </label>
        <select
          value={activePropertyId}
          onChange={(e) => onSelectProperty(e.target.value)}
          disabled={properties.length <= 1}
          className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500"
        >
          {properties.length === 0 ? (
            <option value={activePropertyId}>Richgates Apartments, Enugu</option>
          ) : (
            properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => allowed.includes(item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.group} className="space-y-1">
              <p className="px-2.5 text-[11px] font-semibold text-slate-500 tracking-wide">
                {group.group}
              </p>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                const navLabel = cms.pages[item.id]?.navLabel || item.label;
                const showUnread = item.id === 'messages' && unreadMessageCount > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{navLabel}</span>
                    </span>
                    {showUnread && (
                      <span
                        className={`font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          isActive
                            ? 'bg-white text-emerald-700'
                            : 'bg-emerald-500 text-white'
                        }`}
                      >
                        {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom Portal Switcher & Clickable User Profile Card */}
      <div className="p-3.5 border-t border-slate-800 space-y-2.5 bg-slate-950/40">
        {portalMode === 'pch-admin' ? (
          <button
            type="button"
            onClick={() => {
              onOpenPortalLinksModal();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Portal Links &amp; Switch</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onSwitchPropertyPortal(portalMode === 'staff' ? 'richgates-admin' : 'staff');
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>
              {portalMode === 'staff' ? 'Switch to Property Admin' : 'Switch to Staff View'}
            </span>
          </button>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleNavClick('profile')}
            title="Open Admin & Property Profile"
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-lg p-1 -m-1 hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <img
              src="/src/assets/images/avatar_pch_admin_1794795996224.jpg"
              alt={userName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover shrink-0 bg-slate-800"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{userName}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {ROLE_LABELS[activeRole]}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            title={`Sign out (${userEmail})`}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="no-print hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
