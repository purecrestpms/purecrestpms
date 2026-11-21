import React, { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import {
  applyActionCode,
  confirmPasswordReset,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  User,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { collection, doc, enableNetwork, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  DoorOpen,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Printer,
  RefreshCw,
  ShieldCheck,
  UserCircle2,
  X,
} from 'lucide-react';
import { AdminLicensingView } from './components/AdminLicensingView';
import { AdminReportsAnalyticsView, ReportTab } from './components/AdminReportsAnalyticsView';
import { AppHomepageView } from './components/AppHomepageView';
import { AuthActionView } from './components/AuthActionView';
import { CmsAdminView } from './components/CmsAdminView';
import { DashboardView } from './components/DashboardView';
import {
  DepartmentMessagingView,
  isMessageUnreadForUser,
} from './components/DepartmentMessagingView';
import { FinanceInventoryView } from './components/FinanceInventoryView';
import { GuestsDirectoryView } from './components/GuestsDirectoryView';
import { HelpDocsTrainingView } from './components/HelpDocsTrainingView';
import { HousekeepingMaintenanceView } from './components/HousekeepingMaintenanceView';
import { InvoicesView } from './components/InvoicesView';
import { PaymentReceiptModal } from './components/PaymentReceiptModal';
import { PchAdminDashboardView } from './components/PchAdminDashboardView';
import { PortalGateway } from './components/PortalGateway';
import { PosKitchenView } from './components/PosKitchenView';
import { ProfileView } from './components/ProfileView';
import { ReservationsCalendarView } from './components/ReservationsCalendarView';
import { RoomsReservationsView } from './components/RoomsReservationsView';
import { Sidebar } from './components/Sidebar';
import { StaffHrPayrollView } from './components/StaffHrPayrollView';
import { StaffSessionsView } from './components/StaffSessionsView';
import { StaffShiftReportView } from './components/StaffShiftReportView';
import { mergeCmsWithDefaults, useCms } from './context/CmsContext';
import { RICHGATES_PROPERTY_ID } from './data/seedData';
import { getUserFriendlyErrorMessage } from './utils/errorMessages';
import {
  auth,
  CENTRAL_AUTH_ORIGIN,
  db,
  extractSafeAuthReturnUrl,
  getPchActionCodeSettings,
  isBootstrappedAdminEmail,
  isFirestoreOfflineError,
  sanitizeAuthErrorText,
  testConnection,
} from './firebase';
import {
  backfillMissingSystemPropertyIdsWorkflow,
  buildPropertyIcalFeed,
  fixGideonIdenyiRoomAssignmentIfNeeded,
  heartbeatStaffSessionWorkflow,
  markMessageReadWorkflow,
  migrateLegacyMediaUrlsInFirestore,
  recordStaffSessionLogoutWorkflow,
  seedRichgatesIfNeeded,
  sendBrandedPasswordResetWorkflow,
  syncDefaultMessagesIfNeeded,
  syncOtaChannelWorkflow,
  syncRichgatesLicenseCapIfNeeded,
  syncRichgatesOfficialCatalogIfNeeded,
  syncRichgatesPropertyInfoIfNeeded,
  upsertStaffSessionLoginWorkflow,
} from './services/pmsService';
import {
  DEFAULT_ROOM_COVER_IMAGE_URL,
  isLegacyOrAiStudioImageUrl,
  resolveAppImageUrl,
  resolveGalleryImageUrls,
} from './utils/mediaAssets';
import {
  ADMIN_ONLY_SECTIONS,
  AttendanceRecord,
  AuditLogRecord,
  BlockedDateRecord,
  extractApexDomain,
  extractPropertySubdomainSlug,
  getHostPortalContext,
  getPortalUrl,
  getPropertySubdomainSlug,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  OtaIntegrationRecord,
  PayrollRunRecord,
  PlanInquiryRecord,
  PortalMode,
  PosMenuItemRecord,
  PosOrderRecord,
  PropertyMessageRecord,
  PropertyRecord,
  PropertyUserAccountRecord,
  PurchaseOrderRecord,
  ReservationRecord,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  RoomRecord,
  ShiftScheduleRecord,
  StaffMemberRecord,
  StaffRole,
  StaffSessionRecord,
  UserRoleProfile,
} from './types/pms';

class PageErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: string | null }
> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      error: getUserFriendlyErrorMessage(
        error,
        'An unexpected error occurred while loading this section. Please try again.',
        'PageErrorBoundary'
      ),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard Page Error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white border border-rose-200 rounded-xl p-6 space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5 text-rose-700">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <h2 className="font-display text-base font-bold">Unable to load this section</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{this.state.error}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
            className="px-4 py-2 text-xs font-semibold bg-[#0B245B] hover:bg-[#081a44] text-white rounded-lg cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const VALID_SECTIONS: NavSectionId[] = [
  'dashboard',
  'rooms',
  'calendar',
  'reservations',
  'arrivals',
  'in_house',
  'walk_in',
  'front_desk',
  'invoices',
  'guests',
  'housekeeping',
  'messages',
  'pos_kitchen',
  'accounting',
  'reports',
  'inventory',
  'procurement',
  'staff',
  'user_management',
  'staff_sessions',
  'shifts_attendance',
  'shift_daily_report',
  'payroll',
  'maintenance',
  'ota_channels',
  'properties_admin',
  'licensing',
  'rbac_audit',
  'cms',
  'deployment',
  'profile',
  'training_help',
];

const SUPER_ADMIN_ONLY_SECTIONS: NavSectionId[] = [
  'properties_admin',
  'licensing',
  'rbac_audit',
  'cms',
  'deployment',
];

function detectInitialPortal(): PortalMode {
  if (typeof window === 'undefined') return 'richgates-admin';
  const hostContext = getHostPortalContext(window.location.hostname);
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const p = params.get('portal')?.toLowerCase();

  // Production domain separation with explicit portal path support
  if (hostContext.kind === 'public_marketing') {
    if (
      p === 'pch-admin' ||
      path === '/pch-admin' ||
      path.startsWith('/pch-admin/') ||
      path === '/superadmin' ||
      path.startsWith('/superadmin/')
    ) {
      return 'pch-admin';
    }
    if (
      p === 'staff' ||
      p === 'employee' ||
      p === 'login' ||
      path === '/login' ||
      path.startsWith('/login/') ||
      path === '/staff' ||
      path.startsWith('/staff/') ||
      path === '/employee' ||
      path.startsWith('/employee/')
    ) {
      return 'staff';
    }
    if (
      p === 'richgates-admin' ||
      p === 'admin' ||
      path === '/admin' ||
      path.startsWith('/admin/')
    ) {
      return 'richgates-admin';
    }
    return 'home';
  }
  if (hostContext.kind === 'super_admin') {
    return 'pch-admin';
  }
  if (hostContext.kind === 'tenant_subdomain') {
    if (
      path === '/login' ||
      path.startsWith('/login/') ||
      path === '/staff' ||
      path.startsWith('/staff/') ||
      path === '/employee' ||
      path.startsWith('/employee/')
    ) {
      return 'staff';
    }
    return 'richgates-admin';
  }

  // Preview / localhost hosts allow explicit ?portal= or path selection
  if (p === 'home' || p === 'marketing' || p === 'app') return 'home';
  if (p === 'pch-admin') return 'pch-admin';
  if (p === 'richgates-admin' || p === 'admin' || p === 'richgates' || p === 'richgates-login') {
    return 'richgates-admin';
  }
  if (p === 'staff' || p === 'richgates-staff' || p === 'employee' || p === 'login') {
    return 'staff';
  }

  if (path === '/home' || path.startsWith('/home/')) {
    return 'home';
  }
  if (
    path === '/login' ||
    path.startsWith('/login/') ||
    path === '/staff' ||
    path.startsWith('/staff/') ||
    path === '/employee' ||
    path.startsWith('/employee/')
  ) {
    return 'staff';
  }
  if (
    path === '/pch-admin' ||
    path.startsWith('/pch-admin/') ||
    path === '/superadmin' ||
    path.startsWith('/superadmin/')
  ) {
    return 'pch-admin';
  }
  if (path === '/admin' || path.startsWith('/admin/')) {
    return 'richgates-admin';
  }
  return 'richgates-admin';
}

const SECTION_ROUTE_ALIASES: Record<string, NavSectionId> = {
  dashboard: 'dashboard',
  rooms: 'rooms',
  calendar: 'calendar',
  reservations: 'reservations',
  arrivals: 'arrivals',
  'check-in': 'arrivals',
  checkin: 'arrivals',
  'in-house': 'in_house',
  inhouse: 'in_house',
  checkout: 'in_house',
  'check-out': 'in_house',
  'walk-in': 'walk_in',
  walkin: 'walk_in',
  'front-desk': 'front_desk',
  frontdesk: 'front_desk',
  pos: 'pos_kitchen',
  'point-of-sale': 'pos_kitchen',
  kitchen: 'pos_kitchen',
  payments: 'accounting',
  accounting: 'accounting',
  invoices: 'invoices',
  guests: 'guests',
  housekeeping: 'housekeeping',
  maintenance: 'maintenance',
  channels: 'ota_channels',
  'channel-manager': 'ota_channels',
  ota: 'ota_channels',
  reports: 'reports',
  settings: 'profile',
  profile: 'profile',
  inventory: 'inventory',
  procurement: 'procurement',
  staff: 'staff',
  users: 'user_management',
  notifications: 'messages',
  messages: 'messages',
};

function detectInitialSection(): NavSectionId {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const rawPage = (params.get('page') || '').trim().toLowerCase();
  if (rawPage) {
    if (VALID_SECTIONS.includes(rawPage as NavSectionId)) return rawPage as NavSectionId;
    if (SECTION_ROUTE_ALIASES[rawPage]) return SECTION_ROUTE_ALIASES[rawPage];
  }
  const pathSegments = window.location.pathname
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || '';
  if (lastSegment) {
    if (VALID_SECTIONS.includes(lastSegment as NavSectionId)) {
      return lastSegment as NavSectionId;
    }
    if (SECTION_ROUTE_ALIASES[lastSegment]) {
      return SECTION_ROUTE_ALIASES[lastSegment];
    }
  }
  return 'dashboard';
}

function formatAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err);
  if (
    code === 'auth/unauthorized-domain' ||
    code === 'auth/unauthorized-continue-uri' ||
    code === 'auth/invalid-continue-uri' ||
    raw.includes('auth/unauthorized-domain') ||
    raw.includes('auth/unauthorized-continue-uri')
  ) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'pchpms.com';
    return `Domain "${host}" must be added under Authorized Domains in your PCH PMS security settings.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email and password sign-in is not currently enabled. Please contact your administrator.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Invalid email or password. Use "Forgot password?" to reset your password.';
  }
  if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Use at least 6 characters with letters and numbers.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a minute before trying again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while connecting to PCH PMS. Check your internet connection and try again.';
  }
  if (code === 'auth/user-disabled') {
    return 'This account has been disabled. Contact your administrator for assistance.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists.';
  }
  if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
    return 'This verification or password reset link has expired or has already been used. Request a fresh link below.';
  }
  return getUserFriendlyErrorMessage(
    err,
    'Unable to complete authentication right now. Please try again.',
    'Auth'
  );
}

export default function App() {
  const { cms, setCms } = useCms();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [portalMode, setPortalMode] = useState<PortalMode>(detectInitialPortal);
  const staffRole: StaffRole = 'front_desk';
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [propsLoaded, setPropsLoaded] = useState(false);
  const autoSeedAttemptedRef = useRef<string | null>(null);
  const catalogSyncedPropsRef = useRef<Set<string>>(new Set());
  const gideonRoomFixedPropsRef = useRef<Set<string>>(new Set());
  const propInfoSyncedRef = useRef<Set<string>>(new Set());
  const msgSyncedRef = useRef<Set<string>>(new Set());
  const licenseCapSyncedRef = useRef<Set<string>>(new Set());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const messagesInitLoadedRef = useRef(false);
  const propIdsBackfilledRef = useRef(false);
  const mediaMigratedPropsRef = useRef<Set<string>>(new Set());
  const rawPropertiesRef = useRef<PropertyRecord[]>([]);
  const rawRoomsRef = useRef<RoomRecord[]>([]);

  const [activeSection, setActiveSection] = useState<NavSectionId>(detectInitialSection);
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('bookings');
  const [prefillLoginPropertyId, setPrefillLoginPropertyId] = useState<string | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [reservationIntent, setReservationIntent] = useState<'view' | 'edit'>('view');
  const [selectedRoomIdToInspect, setSelectedRoomIdToInspect] = useState<string | null>(null);
  const [prefillBookingRoomId, setPrefillBookingRoomId] = useState<string | null>(null);
  const [prefillBookingGuest, setPrefillBookingGuest] = useState<GuestRecord | null>(null);
  const [activePropertyId, setActivePropertyId] = useState<string>('');
  const [toast, setToast] = useState<{
    message: string;
    variant: 'success' | 'error' | 'info';
  } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [copiedPortalId, setCopiedPortalId] = useState<string | null>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showUserMenu]);
  const [checkedInPopup, setCheckedInPopup] = useState<{
    guestName: string;
    roomNumber: string;
    bookingRef?: string;
    reservationId?: string;
  } | null>(null);
  const [checkInReceiptTarget, setCheckInReceiptTarget] = useState<ReservationRecord | null>(null);
  const [icalViewRoom, setIcalViewRoom] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('ical')) return null;
    return params.get('room') || 'ALL';
  });

  const hostContext = getHostPortalContext();

  // Branded in-app email verification & password reset action state (/auth-action)
  const [authActionParams] = useState<{
    mode: string;
    oobCode: string;
    continueUrl: string;
    nextUrl: string;
    hasExplicitNext: boolean;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const mode = (params.get('mode') || '').trim();
    const oobCode = (params.get('oobCode') || '').trim();
    const continueUrl = (params.get('continueUrl') || '').trim();
    const pathLower = window.location.pathname.toLowerCase();
    const isAuthActionRoute =
      pathLower === '/auth-action' ||
      pathLower.startsWith('/auth-action/') ||
      pathLower === '/__/auth/action' ||
      pathLower.startsWith('/__/auth/action/');

    if (!isAuthActionRoute && !(mode && oobCode)) {
      return null;
    }

    const nextUrl = extractSafeAuthReturnUrl(params, window.location.origin);
    const hasExplicitNext = Boolean(
      (params.get('next') || params.get('continueUrl')) &&
        nextUrl &&
        nextUrl !== window.location.origin
    );

    return {
      mode,
      oobCode,
      continueUrl,
      nextUrl,
      hasExplicitNext,
    };
  });
  const [authActionState, setAuthActionState] = useState<
    'loading' | 'ready_reset' | 'success' | 'error' | 'redirecting'
  >('loading');
  const [authActionMessage, setAuthActionMessage] = useState<string>('Processing security action...');
  const [authActionFormError, setAuthActionFormError] = useState<string | null>(null);
  const [authActionEmail, setAuthActionEmail] = useState<string>('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [authActionSubmitting, setAuthActionSubmitting] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    if (!authActionParams) return;
    // Strip apiKey, oobCode, and continueUrl from the browser address bar immediately
    if (typeof window !== 'undefined' && window.location.search) {
      try {
        window.history.replaceState({}, '', '/auth-action');
      } catch {
        // ignore history API errors
      }
    }

    // Handle post-action redirects like /auth-action?next=https://richgates.pchpms.com (no oobCode)
    if (!authActionParams.mode || !authActionParams.oobCode) {
      if (authActionParams.hasExplicitNext && authActionParams.nextUrl) {
        setAuthActionState('redirecting');
        setAuthActionMessage('Redirecting you to your PCH PMS portal...');
        const timer = window.setTimeout(() => {
          window.location.replace(authActionParams.nextUrl);
        }, 250);
        return () => window.clearTimeout(timer);
      }
      setAuthActionState('error');
      setAuthActionMessage(
        'This security link is incomplete or has already been completed. You can sign in directly or request a new password reset link below.'
      );
      return;
    }

    let active = true;
    const runAction = async () => {
      try {
        if (
          authActionParams.mode === 'verifyEmail' ||
          authActionParams.mode === 'recoverEmail' ||
          authActionParams.mode === 'verifyAndChangeEmail'
        ) {
          await applyActionCode(auth, authActionParams.oobCode);
          await auth.currentUser?.reload().catch(() => undefined);
          if (!active) return;
          setAuthActionState('success');
          setAuthActionMessage(
            authActionParams.mode === 'verifyEmail'
              ? 'Your PCH PMS email address is now verified. You may sign in to your property workspace.'
              : authActionParams.mode === 'verifyAndChangeEmail'
                ? 'Your PCH PMS email address update has been confirmed.'
                : 'Your email recovery has been completed.'
          );
        } else if (authActionParams.mode === 'resetPassword') {
          const emailForReset = await verifyPasswordResetCode(auth, authActionParams.oobCode);
          if (!active) return;
          setAuthActionEmail(emailForReset);
          setRecoveryEmail(emailForReset);
          setAuthActionState('ready_reset');
          setAuthActionMessage('Choose a strong new password for your PCH PMS account.');
        } else {
          if (!active) return;
          setAuthActionState('error');
          setAuthActionMessage('This authentication link is not valid. Please request a fresh link below.');
        }
      } catch (err) {
        if (!active) return;
        setAuthActionState('error');
        setAuthActionMessage(formatAuthErrorMessage(err));
      }
    };
    void runAction();
    return () => {
      active = false;
    };
  }, [authActionParams]);

  // Firestore Live State
  const [userProfile, setUserProfile] = useState<UserRoleProfile | null>(null);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateRecord[]>([]);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTaskRecord[]>([]);
  const [posOrders, setPosOrders] = useState<PosOrderRecord[]>([]);
  const [posMenuItems, setPosMenuItems] = useState<PosMenuItemRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMemberRecord[]>([]);
  const [userAccounts, setUserAccounts] = useState<PropertyUserAccountRecord[]>([]);
  const [userAccountsLoaded, setUserAccountsLoaded] = useState(false);
  const [staffSessions, setStaffSessions] = useState<StaffSessionRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftScheduleRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRunRecord[]>([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState<MaintenanceTicketRecord[]>([]);
  const [otaChannels, setOtaChannels] = useState<OtaIntegrationRecord[]>([]);
  const [messages, setMessages] = useState<PropertyMessageRecord[]>([]);
  const [planInquiries, setPlanInquiries] = useState<PlanInquiryRecord[]>([]);

  const notify = (msg: string, variant?: 'success' | 'error' | 'info') => {
    const cleanMessage = getUserFriendlyErrorMessage(
      msg,
      'Unable to complete this request. Please try again.',
      'Toast'
    );
    const inferredVariant: 'success' | 'error' | 'info' =
      variant ??
      (/^(unable to|could not|failed|error|you don't have permission|cannot|please sign in|your session)/i.test(
        cleanMessage
      ) || /\bfailed\b/i.test(cleanMessage)
        ? 'error'
        : 'success');
    setToast({ message: cleanMessage, variant: inferredVariant });
    setTimeout(() => {
      setToast((prev) => (prev && prev.message === cleanMessage ? null : prev));
    }, inferredVariant === 'error' ? 6000 : 4000);
  };

  const syncUrlParams = (nextPortal: PortalMode, nextSection: NavSectionId) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname.toLowerCase();
    const apex = extractApexDomain(host);
    const isPropSubdomain = Boolean(extractPropertySubdomainSlug(host));
    const isAppDomain =
      host === 'app.pchpms.com' ||
      host === 'www.pchpms.com' ||
      host === 'pchpms.com' ||
      host === 'app.pchmps.com' ||
      host === 'www.pchmps.com' ||
      host === 'pchmps.com' ||
      Boolean(apex && (host === apex || host === `app.${apex}` || host === `www.${apex}`));
    const isAdminSubdomain =
      host.startsWith('admin.') || host.startsWith('pch.') || host.startsWith('superadmin.');

    params.delete('portal');
    if (nextSection === 'dashboard') {
      params.delete('page');
    } else {
      params.set('page', nextSection);
    }

    if (nextPortal === 'home') {
      params.delete('page');
      const qs = params.toString();
      const basePath = isAppDomain ? '/' : '/home';
      window.history.replaceState({}, '', qs ? `${basePath}?${qs}` : basePath);
      return;
    }

    const qs = params.toString();
    let targetPath = '/';
    if (nextPortal === 'staff') {
      targetPath = isPropSubdomain ? '/staff' : '/login';
    } else if (nextPortal === 'richgates-admin') {
      targetPath = isPropSubdomain ? '/' : '/admin';
    } else if (nextPortal === 'pch-admin') {
      targetPath = isAdminSubdomain ? '/' : '/pch-admin';
    }

    window.history.replaceState({}, '', qs ? `${targetPath}?${qs}` : targetPath);
  };

  const handleSelectSection = (section: NavSectionId) => {
    setSelectedReservationId(null);
    setReservationIntent('view');
    setSelectedRoomIdToInspect(null);
    setPrefillBookingRoomId(null);
    setActiveSection(section);
    syncUrlParams(portalMode, section);
  };

  const handleOpenReservationFolio = (
    reservationId: string,
    targetSection: 'reservations' | 'front_desk' = 'front_desk',
    intent: 'view' | 'edit' = 'view'
  ) => {
    setSelectedRoomIdToInspect(null);
    setPrefillBookingRoomId(null);
    setActiveSection(targetSection);
    syncUrlParams(portalMode, targetSection);
    setSelectedReservationId(reservationId);
    setReservationIntent(intent);
  };

  const handleInspectRoom = (roomId: string) => {
    setSelectedReservationId(null);
    setPrefillBookingRoomId(null);
    setSelectedRoomIdToInspect(roomId);
    setActiveSection('rooms');
    syncUrlParams(portalMode, 'rooms');
  };

  const handleStartNewReservationForRoom = (roomId: string) => {
    setSelectedReservationId(null);
    setSelectedRoomIdToInspect(null);
    setPrefillBookingGuest(null);
    setPrefillBookingRoomId(roomId);
    setActiveSection('reservations');
    syncUrlParams(portalMode, 'reservations');
  };

  const handleStartNewReservationForGuest = (guest: GuestRecord) => {
    setSelectedReservationId(null);
    setSelectedRoomIdToInspect(null);
    setPrefillBookingRoomId(null);
    setPrefillBookingGuest(guest);
    setActiveSection('reservations');
    syncUrlParams(portalMode, 'reservations');
  };

  const runBootstrapSeed = async (customPropertyId?: string) => {
    setDbError(null);
    setSeeding(true);
    try {
      await enableNetwork(db).catch(() => undefined);
      const createdPropId = await seedRichgatesIfNeeded(customPropertyId);
      if (createdPropId) {
        setActivePropertyId(createdPropId);
        notify('Provisioned Richgates Apartments, Enugu (8 Rooms) & Property License');
      }
    } catch (err) {
      if (isFirestoreOfflineError(err)) {
        setDbError(
          'Unable to connect right now. Please check your internet connection and click Retry Connection.'
        );
      } else {
        setDbError(
          getUserFriendlyErrorMessage(
            err,
            'Unable to initialize property workspace. Please try again.',
            'BootstrapSeed'
          )
        );
      }
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, (u) => {
      const finalizeAuth = async () => {
        if (u) {
          await u.getIdToken().catch(() => undefined);
        }
        if (!active) return;
        setUser(u);
        setAuthReady(true);
        setDbError(null);
        setPropsLoaded(false);
        setUserAccountsLoaded(false);
        if (!u) {
          autoSeedAttemptedRef.current = null;
          setProperties([]);
          setLicenses([]);
          setAuditLogs([]);
          setUserProfile(null);
          setUserAccounts([]);
          setStaffSessions([]);
        }
      };
      void finalizeAuth();
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || portalMode === 'home') return;
    const connTimer = window.setTimeout(() => {
      void testConnection();
    }, 1500);
    return () => window.clearTimeout(connTimer);
  }, [authReady, user, portalMode]);

  useEffect(() => {
    const onPopState = () => {
      setPortalMode(detectInitialPortal());
      setActiveSection(detectInitialSection());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const activeRole: StaffRole =
    portalMode === 'pch-admin'
      ? 'pch_admin'
      : portalMode === 'richgates-admin' || portalMode === 'home'
        ? 'property_admin'
        : staffRole;

  const isSignedInBootstrapped = Boolean(user && isBootstrappedAdminEmail(user.email));
  const signedInEmailLower = (user?.email || '').trim().toLowerCase();
  const tenantMatchedProperty = hostContext.tenantSlug
    ? properties.find(
        (p) =>
          getPropertySubdomainSlug(p) === hostContext.tenantSlug ||
          p.code.toLowerCase().replace(/[^a-z0-9]/g, '') === hostContext.tenantSlug
      ) || null
    : null;

  const activePropertyForRole =
    hostContext.kind === 'tenant_subdomain'
      ? tenantMatchedProperty
      : properties.find((p) => p.id === activePropertyId) || properties[0] || null;
  const isExplicitPropertyOwnerOrAdmin =
    isSignedInBootstrapped ||
    Boolean(
      activePropertyForRole &&
        (activePropertyForRole.ownerUid === user?.uid ||
          activePropertyForRole.adminEmail.trim().toLowerCase() === signedInEmailLower)
    );

  const matchedUserAccount =
    !isSignedInBootstrapped && portalMode !== 'pch-admin' && signedInEmailLower
      ? userAccounts.find((a) => a.email.trim().toLowerCase() === signedInEmailLower)
      : undefined;

  const isPchSuperAdminUser = Boolean(
    user &&
      user.emailVerified &&
      (isSignedInBootstrapped || (userProfile?.role === 'pch_admin' && userProfile?.active))
  );

  const effectiveRole: StaffRole =
    portalMode === 'pch-admin'
      ? isPchSuperAdminUser
        ? 'pch_admin'
        : staffRole
      : matchedUserAccount && matchedUserAccount.role !== 'unassigned'
        ? matchedUserAccount.role
        : isExplicitPropertyOwnerOrAdmin
          ? portalMode === 'staff'
            ? staffRole
            : 'property_admin'
          : staffRole;

  const baseAllowedSections: NavSectionId[] =
    portalMode === 'pch-admin' && isPchSuperAdminUser
      ? ROLE_ALLOWED_SECTIONS.pch_admin
      : matchedUserAccount && matchedUserAccount.privileges.length > 0
        ? matchedUserAccount.privileges
        : ROLE_ALLOWED_SECTIONS[effectiveRole];

  const isPrivilegedAdmin =
    effectiveRole === 'pch_admin' || effectiveRole === 'property_admin';
  const isStaffViewMode = portalMode === 'staff' || !isPrivilegedAdmin;

  const rawAllowedSections: NavSectionId[] = !isStaffViewMode
    ? Array.from(
        new Set([...baseAllowedSections, 'user_management', 'staff_sessions', 'shift_daily_report'])
      )
    : Array.from(
        new Set([
          'dashboard',
          ...baseAllowedSections.filter(
            (s) =>
              !ADMIN_ONLY_SECTIONS.includes(s) &&
              s !== 'ota_channels' &&
              s !== 'reports' &&
              s !== 'shift_daily_report'
          ),
        ])
      );

  // Isolate Super Admin SaaS controls strictly to PCH Super Admin console (`pch-admin` / `admin.pchpms.com`)
  const effectiveAllowedSections: NavSectionId[] =
    portalMode === 'pch-admin'
      ? rawAllowedSections
      : rawAllowedSections.filter((s) => !SUPER_ADMIN_ONLY_SECTIONS.includes(s));

  useEffect(() => {
    if (!effectiveAllowedSections.includes(activeSection)) {
      const fallback = effectiveAllowedSections[0] || 'dashboard';
      setActiveSection(fallback);
      syncUrlParams(portalMode, fallback);
    }
  }, [effectiveAllowedSections, activeSection, portalMode]);

  // Root Firestore subscriptions (gated strictly on verified email & internal non-marketing portals)
  useEffect(() => {
    if (!authReady || !user || !user.email || !user.emailVerified || portalMode === 'home') return;
    const tokenEmail = user.email;
    const userEmailLower = tokenEmail.toLowerCase();
    const isAdmin = isBootstrappedAdminEmail(userEmailLower);

    const propsQuery = isAdmin
      ? collection(db, 'properties')
      : query(
          collection(db, 'properties'),
          where('authorizedEmails', 'array-contains', tokenEmail)
        );
    const licQuery = isAdmin
      ? collection(db, 'licenses')
      : query(
          collection(db, 'licenses'),
          where('authorizedEmails', 'array-contains', tokenEmail)
        );
    const audQuery = isAdmin
      ? query(collection(db, 'audit_logs'), orderBy('timestampIso', 'desc'))
      : query(
          collection(db, 'audit_logs'),
          where('authorizedEmails', 'array-contains', tokenEmail)
        );

    const onSnapshotErr = (path: string) => (err: unknown) => {
      if (isFirestoreOfflineError(err)) {
        setDbError(
          'Reconnecting to the service... Please check your internet connection or click Retry Connection.'
        );
        return;
      }
      setDbError(
        getUserFriendlyErrorMessage(
          err,
          'Unable to sync property data right now. Please check your connection and try again.',
          `Sync:${path}`
        )
      );
    };

    const unsubProps = onSnapshot(
      propsQuery,
      (snap) => {
        const rawList = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PropertyRecord);
        if (!snap.metadata.fromCache) {
          rawPropertiesRef.current = rawList;
        }
        const list = rawList.map((prop) =>
          prop.logoUrl
            ? { ...prop, logoUrl: resolveAppImageUrl(prop.logoUrl, '') }
            : prop
        );
        setProperties(list);
        if (!snap.metadata.fromCache) {
          setDbError(null);
        }
        if (!snap.metadata.fromCache || list.length > 0) {
          setPropsLoaded(true);
        }
        setActivePropertyId((curr) => {
          if (list.length === 0) return '';
          const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
          const propSlug = extractPropertySubdomainSlug(host);
          if (propSlug) {
            const matched = list.find(
              (p) =>
                getPropertySubdomainSlug(p) === propSlug ||
                p.code.toLowerCase().replace(/[^a-z0-9]/g, '') === propSlug
            );
            return matched ? matched.id : '';
          }
          return !list.some((p) => p.id === curr) ? list[0].id : curr;
        });
        const needsBootstrapSeed =
          isAdmin &&
          portalMode !== 'pch-admin' &&
          list.length === 0;
        if (!snap.metadata.fromCache && needsBootstrapSeed && autoSeedAttemptedRef.current !== user.uid) {
          autoSeedAttemptedRef.current = user.uid;
          void runBootstrapSeed(RICHGATES_PROPERTY_ID);
        }
        if (
          !snap.metadata.fromCache &&
          isAdmin &&
          !propIdsBackfilledRef.current &&
          list.some((p) => !p.systemPropertyId)
        ) {
          propIdsBackfilledRef.current = true;
          void backfillMissingSystemPropertyIdsWorkflow(list);
        }
      },
      onSnapshotErr('properties')
    );

    const unsubLic = onSnapshot(
      licQuery,
      (snap) => setLicenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LicenseRecord)),
      onSnapshotErr('licenses')
    );

    const unsubAud =
      isAdmin || portalMode === 'pch-admin'
        ? onSnapshot(
            audQuery,
            (snap) => {
              const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLogRecord);
              list.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
              setAuditLogs(list);
            },
            () => {
              setAuditLogs([]);
            }
          )
        : () => {
            setAuditLogs([]);
          };

    const unsubUserProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setUserProfile({ id: snap.id, ...snap.data() } as UserRoleProfile);
        } else {
          setUserProfile(null);
        }
      },
      () => {
        setUserProfile(null);
      }
    );

    const unsubCms = onSnapshot(
      doc(db, 'app_cms', 'global'),
      (snap) => {
        if (snap.exists()) {
          setCms(mergeCmsWithDefaults(snap.data()));
        }
      },
      () => {
        // Ignore if global CMS document has not been published yet
      }
    );

    const unsubPlanInquiries = isAdmin
      ? onSnapshot(
          query(collection(db, 'plan_inquiries'), orderBy('createdAtIso', 'desc')),
          (snap) =>
            setPlanInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanInquiryRecord)),
          () => {
            setPlanInquiries([]);
          }
        )
      : () => undefined;

    return () => {
      unsubProps();
      unsubLic();
      unsubAud();
      unsubUserProfile();
      unsubCms();
      unsubPlanInquiries();
    };
  }, [authReady, user, portalMode]);

  // Property-scoped subcollection subscriptions
  useEffect(() => {
    if (!authReady || !user || !user.email || !user.emailVerified || portalMode === 'home' || !activePropertyId) return;
    const tokenEmail = user.email;
    const isAdmin = isBootstrappedAdminEmail(tokenEmail.toLowerCase());
    setUserAccountsLoaded(false);

    const sub = <T,>(
      subName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      onLoaded?: () => void
    ) => {
      const colRef = collection(db, 'properties', activePropertyId, subName);
      const q = isAdmin
        ? colRef
        : query(colRef, where('authorizedEmails', 'array-contains', tokenEmail));
      return onSnapshot(
        q,
        (snap) => {
          setter(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
          onLoaded?.();
        },
        (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Collection sync error [${subName}]:`, msg);
          onLoaded?.();
        }
      );
    };

    const roomsColRef = collection(db, 'properties', activePropertyId, 'rooms');
    const roomsQuery = isAdmin
      ? roomsColRef
      : query(roomsColRef, where('authorizedEmails', 'array-contains', tokenEmail));
    const unsubRooms = onSnapshot(
      roomsQuery,
      (snap) => {
        const rawRooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoomRecord);
        if (!snap.metadata.fromCache) {
          rawRoomsRef.current = rawRooms;
        }
        setRooms(
          rawRooms.map((room) => {
            const cleanCover = resolveAppImageUrl(room.imageUrl, DEFAULT_ROOM_COVER_IMAGE_URL);
            return {
              ...room,
              imageUrl: cleanCover,
              ...(Array.isArray(room.galleryImages)
                ? { galleryImages: resolveGalleryImageUrls(room.galleryImages, cleanCover) }
                : {}),
            };
          })
        );
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Collection sync error [rooms]:', msg);
      }
    );

    const unsubs = [
      unsubRooms,
      sub<BlockedDateRecord>('blocked_dates', setBlockedDates),
      sub<GuestRecord>('guests', setGuests),
      sub<ReservationRecord>('reservations', setReservations),
      sub<HousekeepingTaskRecord>('housekeeping_tasks', setHousekeepingTasks),
      sub<PosOrderRecord>('pos_orders', setPosOrders),
      sub<PosMenuItemRecord>('pos_menu_items', setPosMenuItems),
      sub<LedgerEntryRecord>('ledger_entries', setLedgerEntries),
      sub<InventoryItemRecord>('inventory_items', setInventoryItems),
      sub<PurchaseOrderRecord>('purchase_orders', setPurchaseOrders),
      sub<StaffMemberRecord>('staff_members', setStaffMembers),
      sub<PropertyUserAccountRecord>('user_accounts', setUserAccounts, () =>
        setUserAccountsLoaded(true)
      ),
      sub<StaffSessionRecord>('staff_sessions', setStaffSessions),
      sub<ShiftScheduleRecord>('shifts', setShifts),
      sub<AttendanceRecord>('attendance', setAttendance),
      sub<PayrollRunRecord>('payroll_runs', setPayrollRuns),
      sub<MaintenanceTicketRecord>('maintenance_tickets', setMaintenanceTickets),
      sub<OtaIntegrationRecord>('ota_channels', setOtaChannels),
      sub<PropertyMessageRecord>('messages', setMessages),
    ];

    messagesInitLoadedRef.current = false;
    seenMessageIdsRef.current = new Set();

    return () => unsubs.forEach((u) => u());
  }, [authReady, user, activePropertyId]);

  // Automatically upgrade previously seeded Richgates DB rows from 101..204 to RM-1..RM-8 & official rates
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || activeProp.code !== 'RG-ENU-01' || rooms.length === 0) return;
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin') return;
    if (catalogSyncedPropsRef.current.has(activeProp.id)) return;

    const needsSync = rooms.some((r) => !r.roomNumber.startsWith('RM-') || !r.section || !r.imageUrl);
    if (!needsSync) {
      catalogSyncedPropsRef.current.add(activeProp.id);
      return;
    }

    catalogSyncedPropsRef.current.add(activeProp.id);
    void syncRichgatesOfficialCatalogIfNeeded({
      property: activeProp,
      rooms,
      reservations,
      housekeepingTasks,
      actorRole: ROLE_LABELS[activeRole],
    }).then((didUpdate) => {
      if (didUpdate) {
        notify('Updated Richgates Apartments to official RM-1..RM-8 types & rates');
      }
    });
  }, [properties, activePropertyId, rooms, reservations, housekeepingTasks, activeRole]);

  // One-time idempotent correction: move Gideon Idenyi (12-07 → 12-11) Airbnb reservation from RM-4 to RM-1
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || rooms.length === 0 || reservations.length === 0) return;
    if (gideonRoomFixedPropsRef.current.has(activeProp.id)) return;

    const rm1 = rooms.find((r) => r.roomNumber.trim().toUpperCase() === 'RM-1');
    if (!rm1) return;

    const needsReassign = reservations.some((res) => {
      if (res.status === 'cancelled' || res.status === 'checked_out' || res.status === 'no_show') {
        return false;
      }
      const nameLower = String(res.guestName || '').trim().toLowerCase();
      return (
        nameLower.includes('gideon') &&
        nameLower.includes('idenyi') &&
        String(res.checkInDate || '').trim().slice(0, 10).endsWith('-12-07') &&
        String(res.checkOutDate || '').trim().slice(0, 10).endsWith('-12-11') &&
        (res.roomId !== rm1.id || res.roomNumber.trim().toUpperCase() !== 'RM-1')
      );
    });

    gideonRoomFixedPropsRef.current.add(activeProp.id);
    if (!needsReassign) return;

    void fixGideonIdenyiRoomAssignmentIfNeeded({
      property: activeProp,
      rooms,
      reservations,
      actorRole: ROLE_LABELS[activeRole],
    }).then((didUpdate) => {
      if (didUpdate) {
        notify('Updated Gideon Idenyi (12-07 → 12-11) Airbnb reservation to RM-1');
      }
    });
  }, [properties, activePropertyId, rooms, reservations, activeRole]);

  // Automatically migrate any legacy /assets/aistudio/ or AI Studio image paths in Firestore to /assets/media/
  useEffect(() => {
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin') return;
    const activeProp = properties.find((p) => p.id === activePropertyId) || null;
    const rawProps = rawPropertiesRef.current;
    const rawRooms = rawRoomsRef.current;

    const hasLegacyPropLogo = rawProps.some(
      (p) => p.logoUrl && isLegacyOrAiStudioImageUrl(p.logoUrl)
    );
    const hasLegacyRoomImage =
      Boolean(activeProp) &&
      rawRooms.some(
        (r) =>
          (r.imageUrl && isLegacyOrAiStudioImageUrl(r.imageUrl)) ||
          (Array.isArray(r.galleryImages) &&
            r.galleryImages.some((u) => isLegacyOrAiStudioImageUrl(u)))
      );

    if (!hasLegacyPropLogo && !hasLegacyRoomImage) return;

    const migrationKey = activeProp ? activeProp.id : '__global__';
    if (mediaMigratedPropsRef.current.has(migrationKey)) return;
    mediaMigratedPropsRef.current.add(migrationKey);

    void migrateLegacyMediaUrlsInFirestore({
      properties: rawProps,
      activeProperty: activeProp,
      rooms: rawRooms,
    });
  }, [properties, activePropertyId, rooms, activeRole]);

  // Automatically sync Richgates Apartments official address, phone, WhatsApp, and support email
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || activeProp.code !== 'RG-ENU-01') return;
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin') return;
    if (propInfoSyncedRef.current.has(activeProp.id)) return;
    propInfoSyncedRef.current.add(activeProp.id);
    void syncRichgatesPropertyInfoIfNeeded(activeProp);
  }, [properties, activePropertyId, activeRole]);

  // Enforce Richgates 20-room license cap on legacy Firestore license docs
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || activeProp.code !== 'RG-ENU-01' || licenses.length === 0) return;
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin') return;
    if (licenseCapSyncedRef.current.has(activeProp.id)) return;
    licenseCapSyncedRef.current.add(activeProp.id);
    void syncRichgatesLicenseCapIfNeeded(activeProp, licenses);
  }, [properties, activePropertyId, licenses, activeRole]);

  // Seed default inter-departmental messages for existing properties if empty
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || messages.length > 0) return;
    if (msgSyncedRef.current.has(activeProp.id)) return;
    msgSyncedRef.current.add(activeProp.id);
    void syncDefaultMessagesIfNeeded(activeProp);
  }, [properties, activePropertyId, messages.length]);

  const otaAutoSyncStateRef = useRef({
    properties,
    activePropertyId,
    otaChannels,
    rooms,
    reservations,
    activeRole,
  });
  otaAutoSyncStateRef.current = {
    properties,
    activePropertyId,
    otaChannels,
    rooms,
    reservations,
    activeRole,
  };
  const otaAutoSyncBusyRef = useRef(false);

  // Automatic background OTA iCal reservation sync every 10 minutes for connected autoSync channels
  useEffect(() => {
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin' && activeRole !== 'front_desk') {
      return;
    }

    const syncDueChannels = async () => {
      if (otaAutoSyncBusyRef.current) return;
      const {
        properties: curProps,
        activePropertyId: curPropId,
        otaChannels: curChannels,
        rooms: curRooms,
        reservations: curReservations,
        activeRole: curRole,
      } = otaAutoSyncStateRef.current;

      const activeProp = curProps.find((p) => p.id === curPropId);
      if (!activeProp || curRooms.length === 0) return;

      const nowMs = Date.now();
      const TEN_MIN_MS = 10 * 60 * 1000;
      const due = curChannels.filter((ch) => {
        if (!ch.connected || !ch.autoSync || !ch.icalImportUrl?.trim()) return false;
        const lastMs = Date.parse(ch.lastSyncedIso || '');
        return !Number.isFinite(lastMs) || nowMs - lastMs >= TEN_MIN_MS;
      });
      if (due.length === 0) return;

      otaAutoSyncBusyRef.current = true;
      try {
        let totalNew = 0;
        for (const ch of due) {
          try {
            const res = await syncOtaChannelWorkflow({
              property: activeProp,
              channel: ch,
              rooms: curRooms,
              actorRole: `${ROLE_LABELS[curRole]} (Auto-Sync)`,
            });
            totalNew += res.created;
          } catch {
            // Quiet background retry on next cycle
          }
        }
        if (totalNew > 0) {
          notify(`OTA Auto-Sync imported ${totalNew} new booking(s)`);
        }
      } finally {
        otaAutoSyncBusyRef.current = false;
      }
    };

    const initialTimer = window.setTimeout(() => {
      void syncDueChannels();
    }, 8000);
    const timer = window.setInterval(() => {
      void syncDueChannels();
    }, 10 * 60 * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [activePropertyId, activeRole]);

  // Real-time alert toast when a new incoming message arrives after initial snapshot load
  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();
    if (!messagesInitLoadedRef.current) {
      if (messages.length > 0) {
        messages.forEach((m) => seenMessageIdsRef.current.add(m.id));
        messagesInitLoadedRef.current = true;
      }
      return;
    }

    const newlyArrived = messages.filter(
      (m) =>
        !seenMessageIdsRef.current.has(m.id) &&
        m.senderEmail.toLowerCase() !== email &&
        isMessageUnreadForUser(m, activeRole, email)
    );
    messages.forEach((m) => seenMessageIdsRef.current.add(m.id));

    if (newlyArrived.length > 0) {
      const latest = newlyArrived[0];
      notify(
        `New ${latest.priority === 'Urgent' ? 'URGENT ' : ''}message from ${latest.senderName} (${latest.senderDepartment}): ${latest.subject}`
      );
    }
  }, [messages, activeRole, user?.email]);

  // Record active employee/admin login & keep session heartbeat fresh for the Session Monitor
  useEffect(() => {
    if (!authReady || !user || !user.email || portalMode === 'home') return;
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp) return;

    const fullName =
      matchedUserAccount?.fullName ||
      userProfile?.displayName ||
      user.displayName ||
      user.email.split('@')[0] ||
      'Property Operator';
    const department = matchedUserAccount?.department || 'Management';

    void upsertStaffSessionLoginWorkflow({
      property: activeProp,
      uid: user.uid,
      email: user.email,
      fullName,
      assignedRole: effectiveRole,
      department,
      portal: portalMode,
    }).catch(() => undefined);

    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void heartbeatStaffSessionWorkflow({
        propertyId: activeProp.id,
        uid: user.uid,
      }).catch(() => undefined);
    }, 3 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [
    authReady,
    user?.uid,
    user?.email,
    user?.displayName,
    portalMode,
    properties,
    activePropertyId,
    matchedUserAccount?.fullName,
    matchedUserAccount?.department,
    userProfile?.displayName,
    effectiveRole,
  ]);

  const handlePortalSelection = (portal: PortalMode) => {
    setPortalMode(portal);
    const nextSection: NavSectionId = 'dashboard';
    setActiveSection(nextSection);
    syncUrlParams(portal, nextSection);
    if (portal === 'richgates-admin' || portal === 'staff') {
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      const propSlug = extractPropertySubdomainSlug(host);
      const targetProp = propSlug
        ? properties.find((p) => getPropertySubdomainSlug(p) === propSlug)
        : properties.find((p) => p.id === RICHGATES_PROPERTY_ID || p.code === 'RG-ENU-01');
      if (targetProp && portal === 'richgates-admin') {
        setActivePropertyId(targetProp.id);
      } else if (propSlug && targetProp) {
        setActivePropertyId(targetProp.id);
      }
    }
  };

  const handleEmailPasswordSignIn = async (
    portal: PortalMode,
    email: string,
    password: string
  ) => {
    setAuthError(null);
    setAuthNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setAuthError('Enter both your email and password to sign in.');
      return;
    }
    setIsSigningIn(true);
    try {
      handlePortalSelection(portal);
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      await cred.user.reload().catch(() => undefined);
      await cred.user.getIdToken(true).catch(() => undefined);
      if (!cred.user.emailVerified) {
        const actionSettings = getPchActionCodeSettings();
        await sendEmailVerification(cred.user, actionSettings).catch(() =>
          sendEmailVerification(cred.user, {
            url: CENTRAL_AUTH_ORIGIN,
            handleCodeInApp: false,
          }).catch(() => undefined)
        );
        await signOut(auth);
        setAuthNotice(
          `Please verify your email address (${cred.user.email}). We sent a PCH PMS verification link to your inbox (and spam folder) — click it and sign in again.`
        );
      }
    } catch (err) {
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handlePasswordReset = async (email: string) => {
    setAuthError(null);
    setAuthNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('Enter your account email above, then click Forgot password.');
      return;
    }
    setIsSigningIn(true);
    try {
      await sendBrandedPasswordResetWorkflow(trimmedEmail);
      setAuthNotice(
        `Password reset email sent to ${trimmedEmail}. Check your inbox or spam folder to set a new password.`
      );
    } catch (err) {
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (user && activePropertyId) {
      await recordStaffSessionLogoutWorkflow({
        propertyId: activePropertyId,
        uid: user.uid,
      }).catch(() => undefined);
    }
    await signOut(auth);
  };

  // Dynamic <title> and search-engine robots exclusion (`noindex` on all internal dashboards/logins)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (portalMode === 'home' && !authActionParams) {
      document.title = 'PCH PMS — Property Management Software';
    } else if (portalMode === 'pch-admin') {
      document.title = 'PCH Super Admin — PCH PMS';
    } else if (activePropertyForRole?.name) {
      document.title = `${activePropertyForRole.name} — PCH PMS`;
    } else {
      document.title = 'PCH PMS — Private Property Workspace';
    }

    let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
    }
    const isPublicIndexable =
      portalMode === 'home' &&
      !authActionParams &&
      (hostContext.kind === 'public_marketing' || hostContext.kind === 'preview');
    robotsMeta.content = isPublicIndexable
      ? 'index, follow'
      : 'noindex, nofollow, noarchive, nosnippet';
  }, [portalMode, activePropertyForRole?.name, authActionParams, hostContext.kind]);

  // Branded PCH PMS /auth-action view for email verification & password resets
  if (authActionParams) {
    const returnHref = authActionParams.nextUrl || CENTRAL_AUTH_ORIGIN;

    const handleCompletePasswordReset = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthActionFormError(null);
      if (newResetPassword.length < 6) {
        setAuthActionFormError('Password must be at least 6 characters.');
        return;
      }
      if (newResetPassword !== confirmResetPassword) {
        setAuthActionFormError('Passwords do not match. Please re-enter both fields.');
        return;
      }
      setAuthActionSubmitting(true);
      try {
        await confirmPasswordReset(auth, authActionParams.oobCode, newResetPassword);
        setAuthActionState('success');
        setAuthActionMessage(
          'Your new password has been saved. You can now sign in to your PCH PMS portal.'
        );
      } catch (err) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/weak-password') {
          setAuthActionFormError(formatAuthErrorMessage(err));
        } else {
          setAuthActionState('error');
          setAuthActionMessage(formatAuthErrorMessage(err));
        }
      } finally {
        setAuthActionSubmitting(false);
      }
    };

    const handleRequestFreshResetLink = async (e: React.FormEvent) => {
      e.preventDefault();
      setRecoveryError(null);
      setRecoveryStatus(null);
      const cleanEmail = recoveryEmail.trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setRecoveryError('Please enter a valid work email address.');
        return;
      }
      setRecoverySubmitting(true);
      try {
        await sendBrandedPasswordResetWorkflow(cleanEmail, returnHref);
        setRecoveryStatus(
          `A fresh PCH PMS password reset link has been sent to ${cleanEmail}. Check your inbox or spam folder.`
        );
      } catch (err) {
        setRecoveryError(formatAuthErrorMessage(err));
      } finally {
        setRecoverySubmitting(false);
      }
    };

    return (
      <AuthActionView
        mode={authActionParams.mode}
        returnHref={returnHref}
        properties={properties}
        authActionState={authActionState}
        authActionMessage={authActionMessage}
        authActionFormError={authActionFormError}
        authActionEmail={authActionEmail}
        newResetPassword={newResetPassword}
        confirmResetPassword={confirmResetPassword}
        authActionSubmitting={authActionSubmitting}
        recoveryEmail={recoveryEmail}
        recoverySubmitting={recoverySubmitting}
        recoveryStatus={recoveryStatus}
        recoveryError={recoveryError}
        onChangeNewPassword={(val) => {
          setNewResetPassword(val);
          if (authActionFormError) setAuthActionFormError(null);
        }}
        onChangeConfirmPassword={(val) => {
          setConfirmResetPassword(val);
          if (authActionFormError) setAuthActionFormError(null);
        }}
        onSubmitPasswordReset={handleCompletePasswordReset}
        onChangeRecoveryEmail={setRecoveryEmail}
        onSubmitFreshResetLink={handleRequestFreshResetLink}
      />
    );
  }

  // Strictly isolated public marketing website (`app.pchpms.com` / `app.pchmps.com` / `pchpms.com`)
  // Render immediately without waiting for internal Firebase Auth state or property data.
  if (hostContext.kind === 'public_marketing' || portalMode === 'home') {
    return <AppHomepageView />;
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs font-semibold text-[#061539]">
        Loading...
      </div>
    );
  }

  const loginTenantSlug =
    hostContext.tenantSlug ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('tenant')
      : null);

  if (!user) {
    return (
      <PortalGateway
        selectedPortal={portalMode}
        tenantSlug={loginTenantSlug}
        tenantPropertyName={activePropertyForRole?.name}
        tenantLogoUrl={activePropertyForRole?.logoUrl}
        onEmailPasswordSignIn={handleEmailPasswordSignIn}
        onPasswordReset={handlePasswordReset}
        authError={authError}
        authNotice={authNotice}
        isSigningIn={isSigningIn}
      />
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-[#0B245B] flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-bold text-[#0B245B]">
              Verify Your Email Address
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your account (<span className="font-mono-tabular font-semibold">{user.email}</span>) must be
              verified before accessing any PCH PMS workspace. Check your inbox for the verification link.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={async () => {
                await sendEmailVerification(user, getPchActionCodeSettings()).catch(() =>
                  sendEmailVerification(user, {
                    url: CENTRAL_AUTH_ORIGIN,
                    handleCodeInApp: false,
                  }).catch(() => undefined)
                );
                notify(`Verification email resent to ${user.email}`);
              }}
              className="w-full py-2.5 bg-[#0B245B] hover:bg-[#082c70] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isBootstrappedAdmin = isBootstrappedAdminEmail(user.email);
  const activeProperty =
    hostContext.kind === 'tenant_subdomain'
      ? tenantMatchedProperty
      : properties.find((p) => p.id === activePropertyId) || properties[0] || null;
  const activeLicense = licenses.find(
    (l) => l.propertyId === activeProperty?.id && l.status === 'active'
  );
  const isAccountAccessRevoked = Boolean(
    matchedUserAccount &&
      (matchedUserAccount.role === 'unassigned' ||
        !matchedUserAccount.active ||
        matchedUserAccount.privileges.length === 0)
  );
  const isUnauthorizedSuperAdmin =
    portalMode === 'pch-admin' && !isPchSuperAdminUser;
  const isWrongTenantSubdomain = Boolean(
    hostContext.kind === 'tenant_subdomain' && propsLoaded && !tenantMatchedProperty
  );
  const isUnassignedExternalUser =
    !seeding && propsLoaded && properties.length === 0 && !isPchSuperAdminUser;

  if (
    isUnauthorizedSuperAdmin ||
    isWrongTenantSubdomain ||
    isAccountAccessRevoked ||
    isUnassignedExternalUser
  ) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            {isUnauthorizedSuperAdmin ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-bold text-[#0B245B]">
              {isUnauthorizedSuperAdmin
                ? 'PCH Super Admin Access Only'
                : isWrongTenantSubdomain
                  ? 'Client Portal Access Restricted'
                  : isAccountAccessRevoked
                    ? 'Role Unassigned / Access Paused'
                    : 'Property Access Pending Assignment'}
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isUnauthorizedSuperAdmin ? (
                <>
                  Account <span className="font-mono-tabular font-semibold">{user.email}</span> does
                  not hold Super Admin clearance for <span className="font-semibold">admin.pchpms.com</span>.
                  Please sign in on your dedicated property subdomain.
                </>
              ) : isWrongTenantSubdomain ? (
                <>
                  Account <span className="font-mono-tabular font-semibold">{user.email}</span> is
                  not authorized for <span className="font-mono-tabular font-semibold">{hostContext.tenantSlug}.pchpms.com</span>.
                </>
              ) : (
                <>
                  Your account (<span className="font-mono-tabular font-semibold">{user.email}</span>) does
                  not currently have an active role or module privileges assigned for{' '}
                  <span className="font-semibold text-slate-900">
                    {activeProperty?.name || 'your assigned property'}
                  </span>
                  . Ask your Property Administrator to invite or authorize this email under User Management.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B245B] hover:bg-[#082c70] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  const unreadMessages = messages
    .filter((m) => isMessageUnreadForUser(m, effectiveRole, user.email || ''))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

  const headerFormattedDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const fallbackPlatformProperty: PropertyRecord = activeProperty || {
    id: '__platform__',
    systemPropertyId: 'PCH-000',
    name: cms.brand.pchPortalName || 'PCH PMS Platform',
    code: 'PCH',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    address: '',
    currency: 'NGN',
    roomCount: 0,
    status: 'active',
    adminEmail: user.email || '',
    authorizedEmails: user.email ? [user.email.toLowerCase()] : [],
    ownerUid: user.uid,
  };

  return (
    <div className="min-h-screen bg-[#f6f8fa] text-slate-900 flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        activeReportTab={activeReportTab}
        onSelectReportTab={setActiveReportTab}
        properties={properties}
        activePropertyId={activePropertyId}
        onSelectProperty={setActivePropertyId}
        portalMode={portalMode}
        activeRole={effectiveRole}
        allowedSections={effectiveAllowedSections}
        userEmail={user.email || ''}
        userName={
          matchedUserAccount?.fullName ||
          userProfile?.displayName ||
          user.displayName ||
          'Property Operator'
        }
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenPortalLinksModal={() => setShowPortalModal(true)}
        onSwitchPropertyPortal={(nextPortal) => {
          handlePortalSelection(nextPortal);
          notify(
            nextPortal === 'staff'
              ? 'Switched to Staff workspace'
              : 'Switched to Property Admin workspace'
          );
        }}
        onSignOut={handleSignOut}
        unreadMessageCount={unreadMessages.length}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div
        className={`flex-1 min-w-0 flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
        }`}
      >
        {/* Top Bar Contract: Breadcrumb on Left, Today's Date + Notification Bell + Admin Profile on Right */}
        <header className="no-print h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-lg text-[#0B245B] hover:bg-blue-50"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            {portalMode === 'pch-admin' && (
              <>
                <span className="font-extrabold text-[#061539] whitespace-nowrap">
                  {cms.brand.pchPortalName}
                </span>
                <span aria-hidden="true">/</span>
              </>
            )}
            <span className="font-extrabold text-[#061539] whitespace-nowrap">
              {cms.pages[activeSection]?.navLabel || activeSection.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-[#0a367a]" />
              <span className="whitespace-nowrap">{headerFormattedDate}</span>
            </div>

            {/* Real-Time Message Alert Bell & Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(false);
                  setShowNotifications((v) => !v);
                }}
                aria-label="Message Alerts"
                className="relative p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadMessages.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono-tabular font-bold flex items-center justify-center">
                    {unreadMessages.length > 9 ? '9+' : unreadMessages.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#1c46be]" />
                      <span className="text-xs font-bold text-slate-900">
                        Department Message Alerts ({unreadMessages.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        handleSelectSection('messages');
                      }}
                      className="text-[11px] font-semibold text-[#1c46be] hover:underline cursor-pointer"
                    >
                      Open Inbox
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {unreadMessages.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-slate-500">
                        All caught up — no unread messages.
                      </div>
                    ) : (
                      unreadMessages.slice(0, 8).map((msg) => (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => {
                            setShowNotifications(false);
                            handleSelectSection('messages');
                            if (activeProperty && user.email) {
                              void markMessageReadWorkflow({
                                property: activeProperty,
                                message: msg,
                                readerEmail: user.email,
                              });
                            }
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors space-y-1 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-slate-900 truncate">
                              {msg.senderName} · {msg.senderDepartment}
                            </span>
                            {msg.priority === 'Urgent' && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[10px]">
                                Urgent
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {msg.subject}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-2">{msg.body}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Top-Right User Account Menu Dropdown with Logout */}
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotifications(false);
                  setShowUserMenu((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={showUserMenu}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50/60 hover:border-[#0a367a]/40 transition-colors text-left cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-[#0a367a] text-white font-mono-tabular text-[11px] font-bold flex items-center justify-center shrink-0">
                  {(matchedUserAccount?.fullName || userProfile?.displayName || user.displayName || 'PA')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() || '')
                    .join('')}
                </span>
                <span className="hidden sm:block leading-tight">
                  <span className="block text-xs font-semibold text-[#061f4d] max-w-[130px] truncate">
                    {matchedUserAccount?.fullName ||
                      userProfile?.displayName ||
                      user.displayName ||
                      'Property Admin'}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {ROLE_LABELS[effectiveRole]}
                  </span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                    showUserMenu ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showUserMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden"
                >
                  <div className="bg-[#0a367a] text-white px-4 py-3">
                    <p className="text-xs font-bold truncate">
                      {matchedUserAccount?.fullName ||
                        userProfile?.displayName ||
                        user.displayName ||
                        'Property Admin'}
                    </p>
                    {user.email && (
                      <p className="text-[11px] text-blue-100 truncate mt-0.5">{user.email}</p>
                    )}
                    <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider mt-1">
                      {ROLE_LABELS[effectiveRole]}
                      {activeProperty ? ` · ${activeProperty.name}` : ''}
                    </p>
                  </div>

                  <div className="p-1.5 space-y-0.5 text-xs">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowUserMenu(false);
                        handleSelectSection('profile');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-blue-50 hover:text-[#0a367a] font-semibold transition-colors cursor-pointer"
                    >
                      <UserCircle2 className="w-4 h-4 text-[#0a367a]" />
                      <span>My Profile &amp; Property Settings</span>
                    </button>

                    {portalMode === 'pch-admin' && isSignedInBootstrapped && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowPortalModal(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-blue-50 hover:text-[#0a367a] font-semibold transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4 text-[#0a367a]" />
                        <span>{cms.brand.portalLinksButton || 'Portal Links'}</span>
                      </button>
                    )}

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowUserMenu(false);
                        void handleSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-700 hover:bg-rose-50 font-bold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-600" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            {portalMode === 'pch-admin' && isSignedInBootstrapped && (
              <button
                type="button"
                onClick={() => setShowPortalModal(true)}
                className="hidden md:inline-flex px-3.5 py-1.5 text-xs font-semibold bg-[#0B245B] hover:bg-[#082c70] text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {cms.brand.portalLinksButton || 'Portal Links'}
              </button>
            )}
          </div>
        </header>

        {cms.brand.announcementBanner.trim() && (
          <div className="no-print mx-4 sm:mx-6 mt-4 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-medium text-[#0B245B] flex items-center gap-2.5 shadow-xs">
            <Megaphone className="w-4 h-4 text-[#1c46be] shrink-0" />
            <span>{cms.brand.announcementBanner}</span>
          </div>
        )}

        {dbError && (
          <div
            role="alert"
            className="mx-4 sm:mx-6 mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex flex-wrap items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="break-words">{dbError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                autoSeedAttemptedRef.current = null;
                if (isBootstrappedAdmin) {
                  void runBootstrapSeed(RICHGATES_PROPERTY_ID);
                } else {
                  void enableNetwork(db).then(() => setDbError(null));
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-semibold shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {toast && (
          <div
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`no-print mx-4 sm:mx-6 mt-4 px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 shadow-xs ${
              toast.variant === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : toast.variant === 'info'
                  ? 'bg-blue-50 border-blue-200 text-[#061f4d]'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.variant === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : toast.variant === 'info' ? (
                <Info className="w-4 h-4 text-[#0a367a] shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span className="leading-relaxed break-words">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                toast.variant === 'error'
                  ? 'text-rose-700 hover:text-rose-950 hover:bg-rose-100'
                  : toast.variant === 'info'
                    ? 'text-[#0a367a] hover:text-[#061f4d] hover:bg-blue-100'
                    : 'text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto print:p-0 print:max-w-none">
          {seeding || (!activeProperty && portalMode !== 'pch-admin') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="bg-white border border-slate-200 rounded-xl p-5 h-32 animate-pulse"
                  />
                ))}
              </div>
              {!seeding && propsLoaded && properties.length === 0 && isBootstrappedAdmin && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
                  <p className="text-xs font-bold text-slate-900">
                    No properties registered yet. Add your first property to begin.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSelectSection('properties_admin')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                  >
                    <span>Add First Property</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <PageErrorBoundary onReset={() => handleSelectSection('dashboard')}>
              {icalViewRoom !== null && activeProperty && (
                <div className="mb-6 bg-white border border-emerald-300 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        iCal Calendar Feed ({icalViewRoom === 'ALL' ? 'All Rooms' : icalViewRoom})
                      </h2>
                      <p className="text-xs text-slate-500">
                        RFC 5545 .ics calendar feed ready for Booking.com, Airbnb, or VRBO import
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const ics = buildPropertyIcalFeed({
                            propertyName: activeProperty.name,
                            reservations,
                            blockedDates,
                            roomNumberFilter: icalViewRoom,
                          });
                          const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${activeProperty.code.toLowerCase()}-${icalViewRoom.toLowerCase()}.ics`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white font-semibold rounded-lg cursor-pointer"
                      >
                        Download .ics File
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIcalViewRoom(null);
                          syncUrlParams(portalMode, activeSection);
                        }}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[11px] font-mono-tabular max-h-48 overflow-auto">
                    {buildPropertyIcalFeed({
                      propertyName: activeProperty.name,
                      reservations,
                      blockedDates,
                      roomNumberFilter: icalViewRoom,
                    })}
                  </pre>
                </div>
              )}

              {activeSection === 'dashboard' && portalMode === 'pch-admin' && (
                <PchAdminDashboardView
                  properties={properties}
                  activePropertyId={activePropertyId}
                  licenses={licenses}
                  planInquiries={planInquiries}
                  userName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    'Admin'
                  }
                  onSelectProperty={setActivePropertyId}
                  onNavigate={handleSelectSection}
                  onCreateLoginForProperty={(propId) => {
                    setPrefillLoginPropertyId(propId);
                    if (propId) setActivePropertyId(propId);
                    handleSelectSection('user_management');
                  }}
                  onOpenPortalLinksModal={() => setShowPortalModal(true)}
                />
              )}

              {activeSection === 'dashboard' && portalMode !== 'pch-admin' && activeProperty && (
                <DashboardView
                  key={`dashboard-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  otaChannels={otaChannels}
                  guests={guests}
                  ledgerEntries={ledgerEntries}
                  posOrders={posOrders}
                  maintenanceTickets={maintenanceTickets}
                  userAccounts={userAccounts}
                  activeLicense={activeLicense}
                  canManageRooms={effectiveRole === 'pch_admin' || effectiveRole === 'property_admin'}
                  portalMode={portalMode}
                  activeRole={effectiveRole}
                  userUid={user.uid}
                  userEmail={user.email || ''}
                  userName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    'Property Operator'
                  }
                  staffMembers={staffMembers}
                  staffSessions={staffSessions}
                  shifts={shifts}
                  attendance={attendance}
                  allowedSections={effectiveAllowedSections}
                  housekeepingTasks={housekeepingTasks}
                  actorRole={ROLE_LABELS[effectiveRole]}
                  onNotify={notify}
                  onGuestCheckedIn={(info) => setCheckedInPopup(info)}
                  onNavigate={handleSelectSection}
                  onOpenReservationFolio={handleOpenReservationFolio}
                  onInspectRoom={handleInspectRoom}
                  onSignOut={handleSignOut}
                />
              )}

              {activeSection === 'calendar' && activeProperty && (
                <ReservationsCalendarView
                  key={`calendar-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  otaChannels={otaChannels}
                  guests={guests}
                  canCompleteCheckIn={
                    effectiveRole === 'pch_admin' ||
                    effectiveRole === 'property_admin' ||
                    effectiveRole === 'front_desk'
                  }
                  actorRole={ROLE_LABELS[effectiveRole]}
                  onNotify={notify}
                  onGuestCheckedIn={(info) => setCheckedInPopup(info)}
                  onOpenReservationFolio={handleOpenReservationFolio}
                />
              )}

              {activeSection === 'guests' && activeProperty && (
                <GuestsDirectoryView
                  key={`guests-${activeProperty.id}`}
                  property={activeProperty}
                  guests={guests}
                  reservations={reservations}
                  rooms={rooms}
                  activeRole={effectiveRole}
                  actorRole={ROLE_LABELS[effectiveRole]}
                  onNotify={notify}
                  onOpenReservationFolio={handleOpenReservationFolio}
                  onStartNewReservationForGuest={handleStartNewReservationForGuest}
                />
              )}

              {(activeSection === 'rooms' ||
                activeSection === 'reservations' ||
                activeSection === 'arrivals' ||
                activeSection === 'in_house' ||
                activeSection === 'walk_in' ||
                activeSection === 'front_desk') &&
                activeProperty && (
                  <RoomsReservationsView
                    key={`${activeSection}-${activeProperty.id}`}
                    section={activeSection}
                    property={activeProperty}
                    activeLicense={activeLicense}
                    rooms={rooms}
                    reservations={reservations}
                    blockedDates={blockedDates}
                    guests={guests}
                    selectedReservationId={selectedReservationId}
                    initialReservationIntent={reservationIntent}
                    initialRoomDetailId={selectedRoomIdToInspect}
                    onConsumeRoomDetailId={() => setSelectedRoomIdToInspect(null)}
                    prefillBookingRoomId={prefillBookingRoomId}
                    onConsumePrefillBookingRoomId={() => setPrefillBookingRoomId(null)}
                    prefillBookingGuest={prefillBookingGuest}
                    onConsumePrefillBookingGuest={() => setPrefillBookingGuest(null)}
                    onStartNewReservationForRoom={handleStartNewReservationForRoom}
                    onConsumeIntent={() => setReservationIntent('view')}
                    onSelectReservation={setSelectedReservationId}
                    onNavigateSection={handleSelectSection}
                    activeRole={effectiveRole}
                    actorRole={ROLE_LABELS[effectiveRole]}
                    onNotify={notify}
                    onGuestCheckedIn={(info) => setCheckedInPopup(info)}
                  />
                )}

              {activeSection === 'invoices' && activeProperty && (
                <InvoicesView
                  key={`invoices-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  guests={guests}
                  posOrders={posOrders}
                  activeRole={effectiveRole}
                  onNotify={notify}
                />
              )}

              {activeSection === 'profile' && (
                <ProfileView
                  key={`profile-${fallbackPlatformProperty.id}`}
                  property={fallbackPlatformProperty}
                  activeLicense={activeLicense}
                  activeRole={effectiveRole}
                  userEmail={user.email || ''}
                  userUid={user.uid}
                  defaultDisplayName={
                    matchedUserAccount?.fullName || user.displayName || 'Property Admin'
                  }
                  userProfile={userProfile}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'housekeeping' || activeSection === 'maintenance') &&
                activeProperty && (
                  <HousekeepingMaintenanceView
                    key={`${activeSection}-${activeProperty.id}`}
                    section={activeSection}
                    property={activeProperty}
                    rooms={rooms}
                    housekeepingTasks={housekeepingTasks}
                    maintenanceTickets={maintenanceTickets}
                    canManageRecords={
                      effectiveRole === 'pch_admin' || effectiveRole === 'property_admin'
                    }
                    actorRole={ROLE_LABELS[effectiveRole]}
                    onNotify={notify}
                  />
                )}

              {activeSection === 'pos_kitchen' && activeProperty && (
                <PosKitchenView
                  key={`pos-${activeProperty.id}`}
                  property={activeProperty}
                  posOrders={posOrders}
                  posMenuItems={posMenuItems}
                  inventoryItems={inventoryItems}
                  ledgerEntries={ledgerEntries}
                  reservations={reservations}
                  canManageMenu={
                    effectiveRole === 'pch_admin' || effectiveRole === 'property_admin'
                  }
                  actorRole={ROLE_LABELS[effectiveRole]}
                  onNotify={notify}
                />
              )}

              {activeSection === 'reports' && activeProperty && (
                <AdminReportsAnalyticsView
                  key={`reports-${activeProperty.id}`}
                  property={activeProperty}
                  activeRole={effectiveRole}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  guests={guests}
                  ledgerEntries={ledgerEntries}
                  posOrders={posOrders}
                  inventoryItems={inventoryItems}
                  purchaseOrders={purchaseOrders}
                  staffMembers={staffMembers}
                  shifts={shifts}
                  attendance={attendance}
                  payrollRuns={payrollRuns}
                  housekeepingTasks={housekeepingTasks}
                  maintenanceTickets={maintenanceTickets}
                  otaChannels={otaChannels}
                  initialTab={activeReportTab}
                  onNavigate={handleSelectSection}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'accounting' ||
                activeSection === 'inventory' ||
                activeSection === 'procurement') &&
                activeProperty && (
                  <FinanceInventoryView
                    key={`${activeSection}-${activeProperty.id}`}
                    section={activeSection}
                    property={activeProperty}
                    activeRole={effectiveRole}
                    ledgerEntries={ledgerEntries}
                    reservations={reservations}
                    rooms={rooms}
                    inventoryItems={inventoryItems}
                    purchaseOrders={purchaseOrders}
                    canManageRecords={
                      effectiveRole === 'pch_admin' || effectiveRole === 'property_admin'
                    }
                    actorRole={ROLE_LABELS[effectiveRole]}
                    onNavigate={handleSelectSection}
                    onOpenReservationFolio={handleOpenReservationFolio}
                    onNotify={notify}
                  />
                )}

              {activeSection === 'shift_daily_report' && activeProperty && (
                <StaffShiftReportView
                  key={`shift-daily-${activeProperty.id}`}
                  property={activeProperty}
                  activeRole={effectiveRole}
                  userName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    user.email ||
                    'Property Operator'
                  }
                  userEmail={user.email || ''}
                  rooms={rooms}
                  reservations={reservations}
                  housekeepingTasks={housekeepingTasks}
                  maintenanceTickets={maintenanceTickets}
                  posOrders={posOrders}
                  shifts={shifts}
                  attendance={attendance}
                  staffMembers={staffMembers}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'staff' ||
                activeSection === 'user_management' ||
                activeSection === 'shifts_attendance' ||
                activeSection === 'payroll') && (
                <StaffHrPayrollView
                  key={`${activeSection}-${fallbackPlatformProperty.id}`}
                  section={activeSection === 'user_management' ? 'staff' : activeSection}
                  initialTab={activeSection === 'user_management' ? 'users' : undefined}
                  portalMode={portalMode}
                  property={fallbackPlatformProperty}
                  properties={properties}
                  onSelectProperty={setActivePropertyId}
                  prefillLoginPropertyId={prefillLoginPropertyId}
                  onConsumePrefillLoginPropertyId={() => setPrefillLoginPropertyId(null)}
                  activeRole={effectiveRole}
                  staffMembers={staffMembers}
                  userAccounts={userAccounts}
                  staffSessions={staffSessions}
                  shifts={shifts}
                  attendance={attendance}
                  payrollRuns={payrollRuns}
                  housekeepingTasks={housekeepingTasks}
                  maintenanceTickets={maintenanceTickets}
                  posOrders={posOrders}
                  actorRole={ROLE_LABELS[effectiveRole]}
                  currentUserEmail={user.email || ''}
                  currentUserName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    'Property Admin'
                  }
                  onOpenSessionMonitor={() => handleSelectSection('staff_sessions')}
                  onOpenShiftDailyReport={() => handleSelectSection('shift_daily_report')}
                  onSendPasswordSetupEmail={async (targetEmail) => {
                    const targetPortal = getPortalUrl('richgates-admin', activeProperty);
                    await sendBrandedPasswordResetWorkflow(targetEmail, targetPortal);
                    notify(`Password setup link sent to ${targetEmail}`);
                  }}
                  onNotify={notify}
                />
              )}

              {activeSection === 'staff_sessions' && activeProperty && (
                <StaffSessionsView
                  key={`staff-sessions-${activeProperty.id}`}
                  property={activeProperty}
                  activeRole={effectiveRole}
                  userAccounts={userAccounts}
                  staffSessions={staffSessions}
                  staffMembers={staffMembers}
                  currentUserEmail={user.email || ''}
                  currentUserName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    'Property Admin'
                  }
                  actorRole={ROLE_LABELS[effectiveRole]}
                  onNotify={notify}
                  onNavigateSection={handleSelectSection}
                  onSendPasswordSetupEmail={async (targetEmail) => {
                    const targetPortal = getPortalUrl('staff', activeProperty);
                    await sendBrandedPasswordResetWorkflow(targetEmail, targetPortal);
                    notify(`Password setup link sent to ${targetEmail}`);
                  }}
                />
              )}

              {(activeSection === 'ota_channels' ||
                activeSection === 'properties_admin' ||
                activeSection === 'licensing' ||
                activeSection === 'rbac_audit' ||
                activeSection === 'deployment') && (
                <AdminLicensingView
                  key={`${activeSection}-${fallbackPlatformProperty.id}`}
                  section={activeSection}
                  property={fallbackPlatformProperty}
                  properties={properties}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  otaChannels={otaChannels}
                  posMenuItems={posMenuItems}
                  licenses={licenses}
                  planInquiries={planInquiries}
                  auditLogs={auditLogs}
                  activeRole={effectiveRole}
                  onSelectProperty={setActivePropertyId}
                  onSwitchPortal={(nextPortal) => {
                    handlePortalSelection(nextPortal);
                    notify(`Switched portal to ${nextPortal}`);
                  }}
                  onNavigate={handleSelectSection}
                  onNotify={notify}
                />
              )}
              {activeSection === 'cms' && (
                <CmsAdminView
                  key={`cms-${fallbackPlatformProperty.id}`}
                  property={fallbackPlatformProperty}
                  activeRole={effectiveRole}
                  actorRole={ROLE_LABELS[effectiveRole]}
                  onNavigate={handleSelectSection}
                  onNotify={notify}
                />
              )}

              {activeSection === 'messages' && activeProperty && (
                <DepartmentMessagingView
                  key={`messages-${activeProperty.id}`}
                  property={activeProperty}
                  messages={messages}
                  staffMembers={staffMembers}
                  activeRole={effectiveRole}
                  userEmail={user.email || ''}
                  userName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    'Property Operator'
                  }
                  onNotify={notify}
                />
              )}

              {activeSection === 'training_help' && (
                <HelpDocsTrainingView
                  key={`training-${fallbackPlatformProperty.id}`}
                  property={fallbackPlatformProperty}
                  activeRole={effectiveRole}
                  userEmail={user.email || ''}
                  userName={
                    matchedUserAccount?.fullName ||
                    userProfile?.displayName ||
                    user.displayName ||
                    'Property Operator'
                  }
                  onNotify={notify}
                />
              )}
            </PageErrorBoundary>
          )}
        </main>

        <footer className="no-print border-t border-slate-200/80 bg-white/80 mt-auto">
          <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 flex items-center justify-center sm:justify-start text-xs text-slate-500">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1">
              <span className="font-semibold text-[#061539]">
                {activeProperty?.name || cms.brand.pchPortalName || 'PCH PMS'}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span>
                © {new Date().getFullYear()} {cms.brand.pchPortalName || 'PCH PMS'}
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Direct Portal Login Links & Switcher Modal (PCH Super Admin Only) */}
      {showPortalModal && portalMode === 'pch-admin' && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Direct Portal Login Links &amp; Workspace Switcher
                </h2>
                <p className="text-xs text-slate-500">
                  Launch the main platform website or PCH Super Admin portal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPortalModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {(
                [
                  {
                    id: 'home',
                    title: 'Software Homepage & Pricing (app.pchpms.com)',
                    desc: 'Public hotel management showcase, pricing plans, purchase orders & contact desk',
                  },
                  {
                    id: 'pch-admin',
                    title: 'PCH Super Admin Portal',
                    desc: 'Multi-property control, Centralized Licensing & Audit Logs',
                  },
                ] as Array<{ id: PortalMode; title: string; desc: string }>
              ).map((item) => {
                const url = getPortalUrl(item.id, activeProperty);
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border space-y-2 ${
                      portalMode === item.id
                        ? 'border-emerald-600 bg-emerald-50/30'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.title}</p>
                        <p className="text-[11px] text-slate-600">{item.desc}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(url);
                            setCopiedPortalId(item.id);
                            setTimeout(() => setCopiedPortalId(null), 2000);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium"
                        >
                          {copiedPortalId === item.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handlePortalSelection(item.id);
                            setShowPortalModal(false);
                            notify(`Switched workspace to ${item.title}`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Launch</span>
                        </button>
                      </div>
                    </div>
                    <p className="font-mono-tabular text-[11px] text-slate-500 truncate">{url}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Check-In Confirmation Pop-up Modal */}
      {checkedInPopup && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-emerald-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                Front Desk Check-In Complete
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900">
                {checkedInPopup.guestName} has been checked in
              </h3>
              <p className="text-xs text-slate-600">
                Room assigned, payment verified, and room key issued.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-2 text-xs text-left">
              <div>
                <p className="text-slate-500 text-[11px]">Room</p>
                <p className="font-mono-tabular font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                  <DoorOpen className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{checkedInPopup.roomNumber}</span>
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Booking Ref</p>
                <p className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                  {checkedInPopup.bookingRef || 'In-House'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Key Issued</p>
                <p className="font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Yes</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              {activeProperty && (
                <button
                  type="button"
                  onClick={() => {
                    const matchedRes =
                      (checkedInPopup.reservationId
                        ? reservations.find((r) => r.id === checkedInPopup.reservationId)
                        : undefined) ||
                      (checkedInPopup.bookingRef
                        ? reservations.find((r) => r.bookingRef === checkedInPopup.bookingRef)
                        : undefined) ||
                      reservations.find(
                        (r) =>
                          r.status === 'checked_in' &&
                          r.guestName.toLowerCase() === checkedInPopup.guestName.toLowerCase() &&
                          r.roomNumber === checkedInPopup.roomNumber
                      );
                    const today = new Date().toISOString().slice(0, 10);
                    const receiptRecord: ReservationRecord = matchedRes || {
                      id: checkedInPopup.reservationId || `chk-${Date.now()}`,
                      propertyId: activeProperty.id,
                      bookingRef: checkedInPopup.bookingRef || 'CHECK-IN',
                      guestId: '',
                      guestName: checkedInPopup.guestName,
                      guestPhone: '',
                      guestEmail: '',
                      roomId: '',
                      roomNumber: checkedInPopup.roomNumber,
                      requestedRoomType: 'Suite',
                      checkInDate: today,
                      checkOutDate: today,
                      nights: 1,
                      adults: 1,
                      children: 0,
                      channel: 'Direct Walk-In',
                      status: 'checked_in',
                      nightlyRateNgn: 0,
                      roomChargesNgn: 0,
                      posChargesNgn: 0,
                      paidNgn: 0,
                      hotelPaidNgn: 0,
                      paymentMethod: 'Cash NGN',
                      paymentConfirmed: true,
                      idVerified: true,
                      keyIssued: true,
                      authorizedEmails: [],
                      ownerUid: '',
                    };
                    setCheckedInPopup(null);
                    setCheckInReceiptTarget(receiptRecord);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
              )}
              {checkedInPopup.reservationId && (
                <button
                  type="button"
                  onClick={() => {
                    const resId = checkedInPopup.reservationId!;
                    setCheckedInPopup(null);
                    handleOpenReservationFolio(resId, 'front_desk');
                  }}
                  className="px-4 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  Open Guest Folio
                </button>
              )}
              <button
                type="button"
                onClick={() => setCheckedInPopup(null)}
                className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Check-In Printable Receipt Modal */}
      {checkInReceiptTarget && activeProperty && (
        <PaymentReceiptModal
          property={activeProperty}
          reservation={checkInReceiptTarget}
          mode="check_in"
          onClose={() => setCheckInReceiptTarget(null)}
          onNotify={notify}
        />
      )}
    </div>
  );
}
