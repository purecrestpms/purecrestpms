import React from 'react';
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
  FileSpreadsheet,
  Globe,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Package,
  Shield,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
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
  userEmail: string;
  userName: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenPortalLinksModal: () => void;
  onSignOut: () => void;
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
      { id: 'dashboard', label: 'Management Dashboard', icon: LayoutDashboard },
      { id: 'rooms', label: 'Rooms & Rates', icon: BedDouble },
      { id: 'calendar', label: 'Calendar & Blocks', icon: Calendar },
      { id: 'reservations', label: 'Reservations', icon: CalendarCheck2 },
      { id: 'front_desk', label: 'Front Desk & Folios', icon: BookOpenCheck },
      { id: 'guests', label: 'Guest Directory', icon: Users },
      { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
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
      { id: 'staff', label: 'Staff Directory', icon: Users },
      { id: 'shifts_attendance', label: 'Shifts & Attendance', icon: Clock },
      { id: 'payroll', label: 'Nigerian Payroll', icon: Wallet },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    ],
  },
  {
    group: 'Channels & Admin',
    items: [
      { id: 'ota_channels', label: 'Online OTA Sync', icon: Globe },
      { id: 'properties_admin', label: 'Multi-Property Admin', icon: Building2 },
      { id: 'licensing', label: 'Software Licensing', icon: KeyRound },
      { id: 'rbac_audit', label: 'RBAC & Audit Logs', icon: Shield },
      { id: 'deployment', label: 'Cloudflare Deploy', icon: CloudUpload },
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
  userEmail,
  userName,
  mobileOpen,
  onCloseMobile,
  onOpenPortalLinksModal,
  onSignOut,
}) => {
  const allowed = ROLE_ALLOWED_SECTIONS[activeRole];

  const handleNavClick = (sectionId: NavSectionId) => {
    onSelectSection(sectionId);
    onCloseMobile();
  };

  const sidebarBody = (
    <div className="w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0 border-r border-slate-800 h-full">
      {/* Brand Lockup */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            PCH PMS
          </span>
          <p className="text-[11px] text-slate-400">
            {portalMode === 'pch-admin'
              ? 'PCH Super Admin'
              : portalMode === 'richgates-admin'
                ? 'Property Admin Portal'
                : 'Staff Operations'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenPortalLinksModal}
            title="Portal Login Links & Switcher"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Link2 className="w-4 h-4" />
          </button>
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
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom Portal Switcher & User Card */}
      <div className="p-3.5 border-t border-slate-800 space-y-2.5 bg-slate-950/40">
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

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
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
          </div>
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
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
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
