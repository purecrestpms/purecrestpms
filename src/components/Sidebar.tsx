import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BedDouble,
  Bell,
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
  FileText,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogIn,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserCheck,
  UserPlus,
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
  StaffRole,
} from '../types/pms';

export type SidebarReportTab = 'bookings' | 'financials' | 'rooms' | 'guests';

interface SidebarProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  activeReportTab?: SidebarReportTab;
  onSelectReportTab?: (tab: SidebarReportTab) => void;
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

interface SubMenuItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const RESERVATION_SUB_ITEMS: SubMenuItem[] = [
  { id: 'reservations', label: 'All Reservations', icon: CalendarCheck2 },
  { id: 'walk_in', label: 'Walk-in Check-in', icon: UserCheck },
  { id: 'in_house', label: 'In-House Guests', icon: DoorOpen },
  { id: 'front_desk', label: 'Front Desk & Folios', icon: BookOpenCheck },
];

const ROOM_SUB_ITEMS: SubMenuItem[] = [
  { id: 'rooms', label: 'All Rooms', icon: BedDouble },
];

const GUEST_SUB_ITEMS: SubMenuItem[] = [
  { id: 'guests', label: 'Guest Directory', icon: Users },
  { id: 'invoices', label: 'Invoices & Receipts', icon: FileText },
];

const PchHouseLogo: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
    <path
      d="M6 21.5L22 8.5L38 21.5"
      stroke="#0a367a"
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11 20V34.5H33V20"
      stroke="#1557b0"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect x="17.5" y="19.5" width="3.8" height="3.8" rx="0.6" fill="#0a367a" />
    <rect x="22.7" y="19.5" width="3.8" height="3.8" rx="0.6" fill="#0a367a" />
    <rect x="17.5" y="24.7" width="3.8" height="3.8" rx="0.6" fill="#1557b0" />
    <rect x="22.7" y="24.7" width="3.8" height="3.8" rx="0.6" fill="#1557b0" />
    <path d="M8 35.5H36" stroke="#0a367a" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  activeReportTab = 'bookings',
  onSelectReportTab,
  properties,
  activePropertyId,
  portalMode,
  activeRole,
  allowedSections,
  userEmail,
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
  const [reportSelection, setReportSelection] = useState<
    'reports' | 'occupancy' | 'booking' | 'revenue' | 'guest'
  >('reports');

  const [openMenus, setOpenMenus] = useState<Record<'reservations' | 'rooms' | 'guests', boolean>>({
    reservations: false,
    rooms: false,
    guests: false,
  });

  useEffect(() => {
    if (RESERVATION_SUB_ITEMS.some((i) => i.id !== 'reservations' && i.id === activeSection)) {
      setOpenMenus((prev) => (prev.reservations ? prev : { ...prev, reservations: true }));
    } else if (ROOM_SUB_ITEMS.some((i) => i.id !== 'rooms' && i.id === activeSection)) {
      setOpenMenus((prev) => (prev.rooms ? prev : { ...prev, rooms: true }));
    } else if (GUEST_SUB_ITEMS.some((i) => i.id !== 'guests' && i.id === activeSection)) {
      setOpenMenus((prev) => (prev.guests ? prev : { ...prev, guests: true }));
    }
  }, [activeSection]);

  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((v) => !v);
    }
  };

  const allowed =
    allowedSections && allowedSections.length > 0
      ? allowedSections
      : ROLE_ALLOWED_SECTIONS[activeRole];

  const canSee = (id: NavSectionId) => allowed.includes(id);

  const activeProp = properties.find((p) => p.id === activePropertyId);
  const subtitleLabel =
    portalMode === 'pch-admin'
      ? 'Multi-Property Platform'
      : activeProp?.name || 'Property Management System';

  const handleNavClick = (sectionId: NavSectionId) => {
    onSelectSection(sectionId);
    onCloseMobile();
  };

  const handleReportClick = (
    itemKey: 'reports' | 'occupancy' | 'booking' | 'revenue' | 'guest',
    tab: SidebarReportTab
  ) => {
    setReportSelection(itemKey);
    onSelectReportTab?.(tab);
    handleNavClick('reports');
  };

  const toggleSubMenu = (key: 'reservations' | 'rooms' | 'guests') => {
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const navItemClass = (isActive: boolean, isCollapsed: boolean) =>
    `relative w-full flex items-center ${
      isCollapsed ? 'justify-center px-2 py-2.5' : 'justify-between gap-2.5 px-3 py-2.5'
    } rounded-lg text-[14px] transition-colors whitespace-nowrap cursor-pointer ${
      isActive
        ? 'bg-[#0a367a] text-white font-semibold shadow-xs'
        : 'text-slate-700 hover:bg-blue-50/80 hover:text-[#0a367a] font-medium'
    }`;

  const iconClass = (isActive: boolean) =>
    `w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-[#0a367a]'}`;

  const renderExpandablePrimary = (
    menuKey: 'reservations' | 'rooms' | 'guests',
    primaryId: NavSectionId,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    subItems: SubMenuItem[],
    isCollapsed: boolean
  ) => {
    const visibleSubs = subItems.filter((item) => canSee(item.id));
    if (!canSee(primaryId) && visibleSubs.length === 0) return null;

    const isPrimaryActive = activeSection === primaryId;
    const isExpanded = openMenus[menuKey];
    const hasSubItems = visibleSubs.length > 1;

    if (isCollapsed) {
      return (
        <button
          key={menuKey}
          type="button"
          onClick={() => handleNavClick(canSee(primaryId) ? primaryId : visibleSubs[0].id)}
          title={label}
          aria-label={label}
          className={navItemClass(
            isPrimaryActive || visibleSubs.some((i) => i.id === activeSection),
            true
          )}
        >
          <Icon className={iconClass(isPrimaryActive || visibleSubs.some((i) => i.id === activeSection))} />
        </button>
      );
    }

    return (
      <div key={menuKey} className="space-y-0.5">
        <div
          className={`flex items-center rounded-lg transition-colors ${
            isPrimaryActive
              ? 'bg-[#0a367a] text-white shadow-xs'
              : 'text-slate-700 hover:bg-blue-50/80 hover:text-[#0a367a]'
          }`}
        >
          <button
            type="button"
            onClick={() => handleNavClick(canSee(primaryId) ? primaryId : visibleSubs[0].id)}
            className="flex-1 flex items-center gap-2.5 pl-3 pr-1 py-2.5 text-[14px] font-medium text-left min-w-0 cursor-pointer"
          >
            <Icon className={iconClass(isPrimaryActive)} />
            <span className={`truncate ${isPrimaryActive ? 'font-semibold' : ''}`}>{label}</span>
          </button>
          {hasSubItems && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSubMenu(menuKey);
              }}
              aria-label={`Toggle ${label} submenu`}
              aria-expanded={isExpanded}
              className={`p-2 rounded-r-lg cursor-pointer ${
                isPrimaryActive ? 'text-white/90 hover:text-white' : 'text-slate-400 hover:text-[#0a367a]'
              }`}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {hasSubItems && isExpanded && (
          <div className="ml-4 pl-2.5 border-l border-slate-200 space-y-0.5 py-0.5">
            {visibleSubs.map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive = activeSection === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleNavClick(sub.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors cursor-pointer ${
                    isSubActive
                      ? 'bg-blue-50 text-[#0a367a] font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                  }`}
                >
                  <SubIcon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSubActive ? 'text-[#0a367a]' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{sub.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderPchAdminSidebarNav = (isCollapsed: boolean) => {
    const platformItems: Array<{
      id: NavSectionId;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }> = [
      { id: 'properties_admin', label: 'Properties', icon: Building2 },
      { id: 'user_management', label: 'Create Property Login', icon: UserPlus },
      { id: 'licensing', label: 'Licenses & Plans', icon: KeyRound },
      { id: 'rbac_audit', label: 'Activity & Audit Log', icon: Shield },
    ];

    const systemItems: Array<{
      id: NavSectionId;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }> = [
      { id: 'cms', label: 'App CMS & Branding', icon: FileEdit },
      { id: 'deployment', label: 'Cloudflare Deploy', icon: CloudUpload },
      { id: 'training_help', label: 'Docs & Help', icon: LifeBuoy },
    ];

    return (
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Top Primary Dashboard Button */}
        <div>
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            title={isCollapsed ? 'Dashboard' : undefined}
            className={navItemClass(activeSection === 'dashboard', isCollapsed)}
          >
            <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
              <LayoutDashboard className={iconClass(activeSection === 'dashboard')} />
              {!isCollapsed && <span className="truncate">Dashboard</span>}
            </span>
          </button>
        </div>

        {/* PLATFORM MANAGEMENT */}
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Platform Management
            </p>
          )}
          {platformItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={navItemClass(isActive, isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Icon className={iconClass(isActive)} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* SYSTEM & PUBLISHING */}
        <div className="pt-2 border-t border-slate-100 space-y-1">
          {!isCollapsed && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              System &amp; Publishing
            </p>
          )}
          {systemItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={navItemClass(isActive, isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Icon className={iconClass(isActive)} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onOpenPortalLinksModal();
              onCloseMobile();
            }}
            title={isCollapsed ? 'Portal Links & Switch' : undefined}
            className={navItemClass(false, isCollapsed)}
          >
            <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
              <Link2 className={iconClass(false)} />
              {!isCollapsed && <span className="truncate">Portal Links</span>}
            </span>
          </button>
        </div>
      </nav>
    );
  };

  const renderPropertySidebarNav = (isCollapsed: boolean) => {
    const showDistribution = canSee('ota_channels') || canSee('calendar');
    const showStaffManagement =
      canSee('shifts_attendance') || canSee('payroll') || canSee('shift_daily_report');
    const showRestaurantPos = canSee('pos_kitchen');
    const showReports = canSee('reports');
    const showAdminGroup =
      canSee('procurement') ||
      canSee('inventory') ||
      canSee('maintenance') ||
      canSee('user_management') ||
      canSee('staff') ||
      canSee('profile') ||
      canSee('messages') ||
      canSee('staff_sessions');

    return (
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Top Primary Dashboard Button */}
        {canSee('dashboard') && (
          <div>
            <button
              type="button"
              onClick={() => handleNavClick('dashboard')}
              title={isCollapsed ? 'Dashboard' : undefined}
              className={navItemClass(activeSection === 'dashboard', isCollapsed)}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                <LayoutDashboard className={iconClass(activeSection === 'dashboard')} />
                {!isCollapsed && <span className="truncate">Dashboard</span>}
              </span>
            </button>
          </div>
        )}

        {/* PROPERTY OPERATIONS */}
        <div className="space-y-0.5">
          {!isCollapsed && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Property Operations
            </p>
          )}
          {renderExpandablePrimary(
            'reservations',
            'reservations',
            'Reservations',
            CalendarCheck2,
            RESERVATION_SUB_ITEMS,
            isCollapsed
          )}
          {renderExpandablePrimary('rooms', 'rooms', 'Rooms', BedDouble, ROOM_SUB_ITEMS, isCollapsed)}
          {renderExpandablePrimary('guests', 'guests', 'Guests', Users, GUEST_SUB_ITEMS, isCollapsed)}
          {canSee('arrivals') && (
            <button
              type="button"
              onClick={() => handleNavClick('arrivals')}
              title={isCollapsed ? 'Arrivals / Check-In' : undefined}
              className={navItemClass(activeSection === 'arrivals', isCollapsed)}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                <LogIn className={iconClass(activeSection === 'arrivals')} />
                {!isCollapsed && <span className="truncate">Arrivals / Check-In</span>}
              </span>
            </button>
          )}
          {canSee('in_house') && (
            <button
              type="button"
              onClick={() => handleNavClick('in_house')}
              title={isCollapsed ? 'In-House / Check-Out' : undefined}
              className={navItemClass(activeSection === 'in_house', isCollapsed)}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                <DoorOpen className={iconClass(activeSection === 'in_house')} />
                {!isCollapsed && <span className="truncate">In-House / Check-Out</span>}
              </span>
            </button>
          )}
          {canSee('housekeeping') && (
            <button
              type="button"
              onClick={() => handleNavClick('housekeeping')}
              title={isCollapsed ? 'Housekeeping Management' : undefined}
              className={navItemClass(activeSection === 'housekeeping', isCollapsed)}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                <Sparkles className={iconClass(activeSection === 'housekeeping')} />
                {!isCollapsed && <span className="truncate">Housekeeping</span>}
              </span>
            </button>
          )}
          {canSee('accounting') && (
            <button
              type="button"
              onClick={() => handleNavClick('accounting')}
              title={isCollapsed ? 'Payments' : undefined}
              className={navItemClass(activeSection === 'accounting', isCollapsed)}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                <CreditCard className={iconClass(activeSection === 'accounting')} />
                {!isCollapsed && <span className="truncate">Payments</span>}
              </span>
            </button>
          )}
        </div>

        {/* RESTAURANT POS (Independent Module) */}
        {showRestaurantPos && (
          <div className="pt-2.5 border-t border-slate-100 space-y-0.5">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Restaurant POS
              </p>
            )}
            <button
              type="button"
              onClick={() => handleNavClick('pos_kitchen')}
              title={isCollapsed ? 'Restaurant POS' : undefined}
              className={navItemClass(activeSection === 'pos_kitchen', isCollapsed)}
            >
              <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                <ChefHat className={iconClass(activeSection === 'pos_kitchen')} />
                {!isCollapsed && <span className="truncate">Restaurant POS</span>}
              </span>
            </button>
          </div>
        )}

        {/* STAFF MANAGEMENT */}
        {showStaffManagement && (
          <div className="pt-2.5 border-t border-slate-100 space-y-0.5">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Staff Management
              </p>
            )}
            {canSee('shifts_attendance') && (
              <button
                type="button"
                onClick={() => handleNavClick('shifts_attendance')}
                title={isCollapsed ? 'Shifts & Attendance' : undefined}
                className={navItemClass(activeSection === 'shifts_attendance', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Clock className={iconClass(activeSection === 'shifts_attendance')} />
                  {!isCollapsed && <span className="truncate">Shifts &amp; Attendance</span>}
                </span>
              </button>
            )}
            {canSee('payroll') && (
              <button
                type="button"
                onClick={() => handleNavClick('payroll')}
                title={isCollapsed ? 'Monthly Payroll' : undefined}
                className={navItemClass(activeSection === 'payroll', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Wallet className={iconClass(activeSection === 'payroll')} />
                  {!isCollapsed && <span className="truncate">Monthly Payroll</span>}
                </span>
              </button>
            )}
            {canSee('shift_daily_report') && (
              <button
                type="button"
                onClick={() => handleNavClick('shift_daily_report')}
                title={isCollapsed ? 'Shift Daily Reports' : undefined}
                className={navItemClass(activeSection === 'shift_daily_report', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <ClipboardList className={iconClass(activeSection === 'shift_daily_report')} />
                  {!isCollapsed && <span className="truncate">Shift Daily Reports</span>}
                </span>
              </button>
            )}
          </div>
        )}

        {/* DISTRIBUTION */}
        {showDistribution && (
          <div className="pt-2.5 border-t border-slate-100 space-y-0.5">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Distribution
              </p>
            )}
            {canSee('ota_channels') && (
              <button
                type="button"
                onClick={() => handleNavClick('ota_channels')}
                title={isCollapsed ? 'Channel Manager' : undefined}
                className={navItemClass(activeSection === 'ota_channels', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Globe className={iconClass(activeSection === 'ota_channels')} />
                  {!isCollapsed && <span className="truncate">Channel Manager</span>}
                </span>
              </button>
            )}

            {canSee('calendar') && (
              <button
                type="button"
                onClick={() => handleNavClick('calendar')}
                title={isCollapsed ? 'Calendar' : undefined}
                className={navItemClass(activeSection === 'calendar', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Calendar className={iconClass(activeSection === 'calendar')} />
                  {!isCollapsed && <span className="truncate">Calendar</span>}
                </span>
              </button>
            )}
          </div>
        )}

        {/* REPORTS & ANALYTICS */}
        {showReports && (
          <div className="pt-2.5 border-t border-slate-100 space-y-0.5">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Reports &amp; Analytics
              </p>
            )}
            {(
              [
                {
                  key: 'reports',
                  label: 'Reports',
                  tab: 'bookings',
                  icon: BarChart3,
                },
                {
                  key: 'occupancy',
                  label: 'Occupancy Report',
                  tab: 'rooms',
                  icon: PieChart,
                },
                {
                  key: 'booking',
                  label: 'Booking Report',
                  tab: 'bookings',
                  icon: CalendarCheck2,
                },
                {
                  key: 'revenue',
                  label: 'Revenue Report',
                  tab: 'financials',
                  icon: Wallet,
                },
                {
                  key: 'guest',
                  label: 'Guest Report',
                  tab: 'guests',
                  icon: Users,
                },
              ] as const
            ).map((rep) => {
              const RepIcon = rep.icon;
              const isActive =
                activeSection === 'reports' &&
                ((reportSelection === rep.key && activeReportTab === rep.tab) ||
                  (rep.key === 'occupancy' && activeReportTab === 'rooms') ||
                  (rep.key === 'revenue' && activeReportTab === 'financials') ||
                  (rep.key === 'guest' && activeReportTab === 'guests'));
              return (
                <button
                  key={rep.key}
                  type="button"
                  onClick={() => handleReportClick(rep.key, rep.tab)}
                  title={isCollapsed ? rep.label : undefined}
                  className={navItemClass(isActive, isCollapsed)}
                >
                  <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                    <RepIcon className={iconClass(isActive)} />
                    {!isCollapsed && <span className="truncate">{rep.label}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ADMINISTRATION */}
        {showAdminGroup && (
          <div className="pt-2.5 border-t border-slate-100 space-y-0.5">
            {!isCollapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Administration
              </p>
            )}
            {canSee('procurement') && (
              <button
                type="button"
                onClick={() => handleNavClick('procurement')}
                title={isCollapsed ? 'Procurement' : undefined}
                className={navItemClass(activeSection === 'procurement', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <ShoppingCart className={iconClass(activeSection === 'procurement')} />
                  {!isCollapsed && <span className="truncate">Procurement</span>}
                </span>
              </button>
            )}
            {canSee('inventory') && (
              <button
                type="button"
                onClick={() => handleNavClick('inventory')}
                title={isCollapsed ? 'Store Inventory' : undefined}
                className={navItemClass(activeSection === 'inventory', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Package className={iconClass(activeSection === 'inventory')} />
                  {!isCollapsed && <span className="truncate">Store Inventory</span>}
                </span>
              </button>
            )}
            {canSee('maintenance') && (
              <button
                type="button"
                onClick={() => handleNavClick('maintenance')}
                title={isCollapsed ? 'Maintenance' : undefined}
                className={navItemClass(activeSection === 'maintenance', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Wrench className={iconClass(activeSection === 'maintenance')} />
                  {!isCollapsed && <span className="truncate">Maintenance</span>}
                </span>
              </button>
            )}
            {canSee('user_management') && (
              <button
                type="button"
                onClick={() => handleNavClick('user_management')}
                title={isCollapsed ? 'User Management' : undefined}
                className={navItemClass(activeSection === 'user_management', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Users className={iconClass(activeSection === 'user_management')} />
                  {!isCollapsed && <span className="truncate">User Management</span>}
                </span>
              </button>
            )}
            {canSee('staff') && (
              <button
                type="button"
                onClick={() => handleNavClick('staff')}
                title={isCollapsed ? 'Roles & Permissions' : undefined}
                className={navItemClass(activeSection === 'staff', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <ShieldCheck className={iconClass(activeSection === 'staff')} />
                  {!isCollapsed && <span className="truncate">Roles &amp; Permissions</span>}
                </span>
              </button>
            )}
            {canSee('profile') && (
              <button
                type="button"
                onClick={() => handleNavClick('profile')}
                title={isCollapsed ? 'Property Settings' : undefined}
                className={navItemClass(activeSection === 'profile', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Building2 className={iconClass(activeSection === 'profile')} />
                  {!isCollapsed && <span className="truncate">Property Settings</span>}
                </span>
              </button>
            )}
            {canSee('messages') && (
              <button
                type="button"
                onClick={() => handleNavClick('messages')}
                title={isCollapsed ? 'Notifications' : undefined}
                className={navItemClass(activeSection === 'messages', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Bell className={iconClass(activeSection === 'messages')} />
                  {!isCollapsed && <span className="truncate">Notifications</span>}
                </span>
                {unreadMessageCount > 0 && !isCollapsed && (
                  <span
                    className={`font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      activeSection === 'messages'
                        ? 'bg-white text-[#0a367a]'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                  </span>
                )}
                {unreadMessageCount > 0 && isCollapsed && (
                  <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-rose-600" />
                )}
              </button>
            )}
            {canSee('staff_sessions') && (
              <button
                type="button"
                onClick={() => handleNavClick('staff_sessions')}
                title={isCollapsed ? 'Activity Log' : undefined}
                className={navItemClass(activeSection === 'staff_sessions', isCollapsed)}
              >
                <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
                  <Activity className={iconClass(activeSection === 'staff_sessions')} />
                  {!isCollapsed && <span className="truncate">Activity Log</span>}
                </span>
              </button>
            )}
          </div>
        )}
      </nav>
    );
  };

  const renderSidebarBody = (isCollapsed: boolean) => (
    <div
      className={`${
        isCollapsed ? 'w-[76px]' : 'w-64'
      } bg-white text-slate-900 flex flex-col shrink-0 border-r border-slate-200 h-full transition-all duration-200`}
    >
      {/* Top Brand Header matching PCH PMS layout */}
      <div
        className={`px-4 py-3.5 border-b border-slate-100 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between gap-2'
        }`}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <PchHouseLogo className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <span className="font-display text-[17px] font-extrabold tracking-tight text-slate-900 block truncate leading-tight">
                {cms.brand.pchPortalName || 'PCH PMS'}
              </span>
              <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                {subtitleLabel}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-[#0a367a] transition-colors cursor-pointer"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      {portalMode === 'pch-admin'
        ? renderPchAdminSidebarNav(isCollapsed)
        : renderPropertySidebarNav(isCollapsed)}

      {/* Bottom Utility Footer: Settings & Logout */}
      <div className="px-3 py-3 border-t border-slate-200 space-y-1 bg-white">
        {portalMode !== 'pch-admin' && activeRole === 'property_admin' && (
          <button
            type="button"
            onClick={() => {
              onSwitchPropertyPortal(portalMode === 'staff' ? 'richgates-admin' : 'staff');
              onCloseMobile();
            }}
            title={
              isCollapsed
                ? portalMode === 'staff'
                  ? 'Property Admin View'
                  : 'Staff View'
                : undefined
            }
            className={navItemClass(false, isCollapsed)}
          >
            <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
              <ClipboardList className={iconClass(false)} />
              {!isCollapsed && (
                <span className="truncate text-xs">
                  {portalMode === 'staff' ? 'Switch to Admin View' : 'Switch to Staff View'}
                </span>
              )}
            </span>
          </button>
        )}

        {canSee('profile') && (
          <button
            type="button"
            onClick={() => handleNavClick('profile')}
            title={isCollapsed ? 'Settings' : undefined}
            className={navItemClass(activeSection === 'profile', isCollapsed)}
          >
            <span className={`flex items-center ${isCollapsed ? '' : 'gap-2.5 min-w-0'}`}>
              <Settings className={iconClass(activeSection === 'profile')} />
              {!isCollapsed && <span className="truncate">Settings</span>}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onSignOut}
          title={isCollapsed ? `Logout (${userEmail})` : undefined}
          aria-label="Logout"
          className={`w-full flex items-center ${
            isCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2'
          } rounded-lg text-[13px] font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer`}
        >
          <LogOut className="w-[17px] h-[17px] shrink-0 text-[#0a367a]" />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

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
