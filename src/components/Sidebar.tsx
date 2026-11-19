import React, { useEffect, useState } from 'react';
import {
  Activity,
  BedDouble,
  BookOpenCheck,
  Building2,
  Calendar,
  CalendarCheck2,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  CloudUpload,
  CreditCard,
  DoorOpen,
  FileEdit,
  FileSpreadsheet,
  FileText,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  Mail,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PlaneLanding,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserCheck,
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
  onSelectProperty?: (id: string) => void;
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface SidebarNavItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Primary navigation ordered cleanly to match core PMS workflow
const PRIMARY_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'reservations', label: 'Reservations', icon: CalendarCheck2 },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'rooms', label: 'Rooms', icon: BedDouble },
  { id: 'accounting', label: 'Payments', icon: CreditCard },
  { id: 'ota_channels', label: 'Channel Manager', icon: Globe },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'profile', label: 'Settings', icon: Settings },
];

// Secondary operational groups (collapsible to keep the sidebar clean without removing any module)
const SECONDARY_NAV_GROUPS: Array<{
  group: string;
  items: SidebarNavItem[];
}> = [
  {
    group: 'Front Desk & Guests',
    items: [
      { id: 'arrivals', label: 'Arrivals', icon: PlaneLanding },
      { id: 'in_house', label: 'In-House', icon: DoorOpen },
      { id: 'walk_in', label: 'Walk-in Check-in', icon: UserCheck },
      { id: 'front_desk', label: 'Front Desk & Folios', icon: BookOpenCheck },
      { id: 'invoices', label: 'Invoices & Receipts', icon: FileText },
      { id: 'guests', label: 'Guest Profiles', icon: Users },
      { id: 'shift_daily_report', label: 'Shift Daily Report', icon: ClipboardList },
      { id: 'messages', label: 'Messages & Alerts', icon: Mail },
    ],
  },
  {
    group: 'Housekeeping & POS',
    items: [
      { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
      { id: 'pos_kitchen', label: 'Restaurant POS & KDS', icon: ChefHat },
      { id: 'inventory', label: 'Store Inventory', icon: Package },
      { id: 'procurement', label: 'Procurement & POs', icon: ShoppingCart },
    ],
  },
  {
    group: 'Team & HR',
    items: [
      { id: 'user_management', label: 'User Management', icon: ShieldCheck },
      { id: 'staff', label: 'Staff & Performance', icon: Users },
      { id: 'staff_sessions', label: 'Staff Sessions & Links', icon: Activity },
      { id: 'shifts_attendance', label: 'Shifts & Attendance', icon: Clock },
      { id: 'payroll', label: 'Monthly Payroll', icon: Wallet },
    ],
  },
  {
    group: 'Platform & Help',
    items: [
      { id: 'properties_admin', label: 'Multi-Property Admin', icon: Building2 },
      { id: 'licensing', label: 'Software Licensing', icon: KeyRound },
      { id: 'rbac_audit', label: 'RBAC & Audit Logs', icon: Shield },
      { id: 'cms', label: 'App CMS & Text Editor', icon: FileEdit },
      { id: 'deployment', label: 'Cloudflare Deploy', icon: CloudUpload },
      { id: 'training_help', label: 'Docs, Training & Help', icon: LifeBuoy },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  properties,
  activePropertyId,
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
  collapsed: controlledCollapsed,
  onToggleCollapse,
}) => {
  const { cms } = useCms();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((v) => !v);
    }
  };

  // Start secondary groups collapsed for a clean primary menu, auto-expanding whichever group contains activeSection
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const activeGroup = SECONDARY_NAV_GROUPS.find((g) =>
      g.items.some((item) => item.id === activeSection)
    );
    if (activeGroup) {
      setExpandedGroups((prev) =>
        prev[activeGroup.group] ? prev : { ...prev, [activeGroup.group]: true }
      );
    }
  }, [activeSection]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const allowed =
    allowedSections && allowedSections.length > 0
      ? allowedSections
      : ROLE_ALLOWED_SECTIONS[activeRole];
  const activeProp = properties.find((p) => p.id === activePropertyId) || properties[0];
  const propertyName = activeProp?.name || 'Property Workspace';

  const handleNavClick = (sectionId: NavSectionId) => {
    onSelectSection(sectionId);
    onCloseMobile();
  };

  const renderNavButton = (item: SidebarNavItem, isCollapsed: boolean, prominent = false) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    const navLabel =
      prominent
        ? item.label
        : cms.pages[item.id]?.navLabel || item.label;
    const showUnread = item.id === 'messages' && unreadMessageCount > 0;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleNavClick(item.id)}
        title={isCollapsed ? navLabel : undefined}
        aria-label={navLabel}
        className={`relative w-full flex items-center ${
          isCollapsed
            ? 'justify-center px-2 py-2.5'
            : prominent
              ? 'justify-between gap-2.5 px-3 py-2.5'
              : 'justify-between gap-2 px-2.5 py-2'
        } rounded-lg ${prominent ? 'text-[13px]' : 'text-xs'} transition-colors whitespace-nowrap cursor-pointer ${
          isActive
            ? 'bg-[#061539] text-white font-semibold shadow-xs'
            : 'text-[#28488a] hover:bg-blue-50/75 hover:text-[#061539] font-medium'
        }`}
      >
        <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
          <Icon
            className={`w-4 h-4 shrink-0 ${
              isActive ? 'text-white' : 'text-[#3a5ea8]'
            }`}
          />
          {!isCollapsed && <span className="truncate">{navLabel}</span>}
        </span>

        {showUnread && !isCollapsed && (
          <span
            className={`font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
              isActive ? 'bg-white text-[#061539]' : 'bg-[#061539] text-white'
            }`}
          >
            {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
          </span>
        )}

        {showUnread && isCollapsed && (
          <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-rose-600" />
        )}
      </button>
    );
  };

  const renderSidebarBody = (isCollapsed: boolean) => {
    const visiblePrimary = PRIMARY_NAV_ITEMS.filter((item) => allowed.includes(item.id));

    return (
      <div
        className={`${
          isCollapsed ? 'w-[76px]' : 'w-64'
        } bg-white text-[#061539] flex flex-col shrink-0 border-r border-slate-200 h-full transition-all duration-200`}
      >
        {/* Top Header: PCH PMS + Property Name + Collapse Toggle */}
        <div
          className={`px-4 py-4 border-b border-slate-200 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between gap-2'
          }`}
        >
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#061539] text-white flex items-center justify-center shrink-0 overflow-hidden">
                {portalMode === 'pch-admin' ? (
                  <ShieldCheck className="w-4 h-4 text-amber-300" />
                ) : activeProp?.logoUrl ? (
                  <img
                    src={activeProp.logoUrl}
                    alt={propertyName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-4 h-4 text-amber-300" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-display text-base font-extrabold tracking-tight text-[#061539] block truncate leading-tight">
                  {cms.brand.pchPortalName || 'PCH PMS'}
                </span>
                <p className="text-[11px] font-semibold text-[#28488a] truncate mt-0.5">
                  {portalMode === 'pch-admin' ? cms.brand.pchRoleSubtitle : propertyName}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {!isCollapsed && portalMode === 'pch-admin' && (
              <button
                type="button"
                onClick={onOpenPortalLinksModal}
                title="Portal Login Links & Switcher"
                className="p-1.5 rounded-lg text-[#061539] hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
              </button>
            )}

            {/* Desktop Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={handleToggleCollapse}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex p-1.5 rounded-lg text-[#061539] hover:bg-blue-50 hover:text-[#1c46be] transition-colors cursor-pointer"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-[#061539] hover:bg-blue-50"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4">
          {/* Primary Clean Menu (Dashboard → Reservations → Calendar → Rooms → Payments → Reports → Settings) */}
          <div className="space-y-1">
            {visiblePrimary.map((item) => renderNavButton(item, isCollapsed, true))}
          </div>

          {/* Secondary Operational Modules (neatly organized & collapsible) */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            {!isCollapsed && (
              <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                More Modules
              </p>
            )}
            {SECONDARY_NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) => allowed.includes(item.id));
              if (visibleItems.length === 0) return null;
              const isExpanded = Boolean(expandedGroups[group.group]);
              const hasActiveChild = visibleItems.some((item) => item.id === activeSection);
              const groupUnread =
                group.group === 'Front Desk & Guests' && unreadMessageCount > 0;

              return (
                <div key={group.group} className="space-y-1">
                  {!isCollapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.group)}
                      aria-expanded={isExpanded}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                        hasActiveChild
                          ? 'text-[#061539] bg-blue-50/70'
                          : 'text-[#061539]/85 hover:bg-slate-100/80'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{group.group}</span>
                        {groupUnread && !isExpanded && (
                          <span className="font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#061539] text-white">
                            {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                          </span>
                        )}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#061539]/70 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#061539]/70 shrink-0" />
                      )}
                    </button>
                  ) : (
                    <div className="mx-2 border-t border-slate-200 my-1.5" />
                  )}

                  {(isCollapsed || isExpanded) && (
                    <div className="space-y-0.5 pl-0.5">
                      {visibleItems.map((item) => renderNavButton(item, isCollapsed, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Bottom Workspace Switcher & User Profile */}
        <div className="p-3 border-t border-slate-200 space-y-2.5 bg-slate-50/70">
          {portalMode === 'pch-admin' ? (
            <button
              type="button"
              title={isCollapsed ? 'Portal Links & Switch' : undefined}
              onClick={() => {
                onOpenPortalLinksModal();
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-center gap-2 ${
                isCollapsed ? 'p-2' : 'px-3 py-2'
              } rounded-lg border border-slate-300 bg-white hover:bg-blue-50 text-xs font-bold text-[#061539] transition-colors cursor-pointer`}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
              {!isCollapsed && <span>Portal Links &amp; Switch</span>}
            </button>
          ) : (
            <button
              type="button"
              title={
                isCollapsed
                  ? portalMode === 'staff'
                    ? 'Switch to Property Admin'
                    : 'Switch to Staff View'
                  : undefined
              }
              onClick={() => {
                onSwitchPropertyPortal(portalMode === 'staff' ? 'richgates-admin' : 'staff');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-center gap-2 ${
                isCollapsed ? 'p-2' : 'px-3 py-2'
              } rounded-lg border border-slate-300 bg-white hover:bg-blue-50 text-xs font-bold text-[#061539] transition-colors cursor-pointer`}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
              {!isCollapsed && (
                <span>
                  {portalMode === 'staff' ? 'Switch to Property Admin' : 'Switch to Staff View'}
                </span>
              )}
            </button>
          )}

          <div
            className={`flex items-center ${
              isCollapsed ? 'flex-col gap-2' : 'justify-between gap-2'
            } pt-1`}
          >
            <button
              type="button"
              onClick={() => handleNavClick('profile')}
              title={`Open Settings (${userName})`}
              className={`flex items-center gap-2.5 min-w-0 ${
                isCollapsed ? 'justify-center' : 'flex-1 text-left'
              } rounded-lg p-1 -m-1 hover:bg-blue-50 transition-colors cursor-pointer`}
            >
              <span className="w-8 h-8 rounded-lg bg-[#061539] text-white font-mono-tabular text-[11px] font-bold flex items-center justify-center shrink-0">
                {userName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('') || 'RG'}
              </span>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#061539] truncate">{userName}</p>
                  <p className="text-[11px] font-semibold text-slate-600 truncate">
                    {ROLE_LABELS[activeRole]}
                  </p>
                </div>
              )}
            </button>
          </div>

          {/* Logout Action pinned cleanly at the bottom of the sidebar */}
          <button
            type="button"
            onClick={onSignOut}
            title={isCollapsed ? `Logout (${userEmail})` : undefined}
            aria-label="Logout"
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center p-2' : 'justify-center gap-2 px-3 py-2'
            } rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-xs font-semibold text-[#28488a] hover:text-rose-700 transition-colors whitespace-nowrap cursor-pointer`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Fixed Collapsible Sidebar */}
      <aside
        className={`no-print hidden lg:block ${
          collapsed ? 'w-[76px]' : 'w-64'
        } fixed inset-y-0 left-0 z-30 h-screen transition-all duration-200`}
      >
        {renderSidebarBody(collapsed)}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{renderSidebarBody(false)}</div>
        </div>
      )}
    </>
  );
};
