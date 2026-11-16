import React, { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import { collection, doc, enableNetwork, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  DoorOpen,
  ExternalLink,
  KeyRound,
  Mail,
  Megaphone,
  Menu,
  RefreshCw,
  X,
} from 'lucide-react';
import { AdminLicensingView } from './components/AdminLicensingView';
import { AdminReportsAnalyticsView } from './components/AdminReportsAnalyticsView';
import { AppHomepageView } from './components/AppHomepageView';
import { CmsAdminView } from './components/CmsAdminView';
import { DashboardView } from './components/DashboardView';
import {
  DepartmentMessagingView,
  isMessageUnreadForUser,
} from './components/DepartmentMessagingView';
import { FinanceInventoryView } from './components/FinanceInventoryView';
import { HelpDocsTrainingView } from './components/HelpDocsTrainingView';
import { HousekeepingMaintenanceView } from './components/HousekeepingMaintenanceView';
import { PortalGateway } from './components/PortalGateway';
import { PosKitchenView } from './components/PosKitchenView';
import { ProfileView } from './components/ProfileView';
import { ReservationsCalendarView } from './components/ReservationsCalendarView';
import { RoomsReservationsView } from './components/RoomsReservationsView';
import { Sidebar } from './components/Sidebar';
import { StaffHrPayrollView } from './components/StaffHrPayrollView';
import { mergeCmsWithDefaults, useCms } from './context/CmsContext';
import { RICHGATES_PROPERTY_ID } from './data/seedData';
import {
  auth,
  db,
  googleProvider,
  isBootstrappedAdminEmail,
  isFirestoreOfflineError,
  testConnection,
} from './firebase';
import {
  buildPropertyIcalFeed,
  markMessageReadWorkflow,
  seedRichgatesIfNeeded,
  syncDefaultMessagesIfNeeded,
  syncDefaultPosMenuIfNeeded,
  syncOtaChannelWorkflow,
  syncRichgatesLicenseCapIfNeeded,
  syncRichgatesOfficialCatalogIfNeeded,
  syncRichgatesPropertyInfoIfNeeded,
} from './services/pmsService';
import {
  AttendanceRecord,
  AuditLogRecord,
  BlockedDateRecord,
  extractPropertySubdomainSlug,
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
  PurchaseOrderRecord,
  ReservationRecord,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  RoomRecord,
  ShiftScheduleRecord,
  StaffMemberRecord,
  StaffRole,
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
    return { error: error.message || 'Unexpected rendering error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard Page Error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white border border-red-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-display text-base font-bold">Unable to render this section</h2>
          </div>
          <p className="text-xs text-slate-600 font-mono-tabular">{this.state.error}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg"
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
  'guests',
  'housekeeping',
  'messages',
  'pos_kitchen',
  'accounting',
  'reports',
  'inventory',
  'procurement',
  'staff',
  'shifts_attendance',
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

function detectInitialPortal(): PortalMode {
  if (typeof window === 'undefined') return 'richgates-admin';
  const params = new URLSearchParams(window.location.search);
  const p = params.get('portal');
  if (p === 'home' || p === 'marketing' || p === 'app') return 'home';
  if (p === 'pch-admin' || p === 'richgates-admin' || p === 'staff') return p;
  if (p === 'admin' || p === 'richgates' || p === 'richgates-login') return 'richgates-admin';
  if (p === 'richgates-staff') return 'staff';
  const path = window.location.pathname.toLowerCase();
  if (path === '/home' || path.startsWith('/home/')) {
    return 'home';
  }
  if (path === '/staff' || path.startsWith('/staff/') || path.includes('/login/staff')) {
    return 'staff';
  }
  if (path.includes('pch-admin')) return 'pch-admin';
  const host = window.location.hostname.toLowerCase();
  if (host === 'app.pchpms.com' || host === 'www.pchpms.com' || host === 'pchpms.com') {
    return 'home';
  }
  if (host.startsWith('admin.') || host.startsWith('pch.') || host.startsWith('superadmin.')) {
    return 'pch-admin';
  }
  if (extractPropertySubdomainSlug(host)) {
    return 'richgates-admin';
  }
  return 'richgates-admin';
}

function detectInitialSection(): NavSectionId {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') as NavSectionId | null;
  if (page && VALID_SECTIONS.includes(page)) return page;
  return 'dashboard';
}

function formatAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const raw = err instanceof Error ? err.message : String(err);
  if (code === 'auth/unauthorized-domain' || raw.includes('auth/unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Domain "${host}" is not authorized in Firebase Authentication. Add "${host}" under Firebase Console -> Authentication -> Settings -> Authorized domains.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not yet enabled in Firebase Console -> Authentication -> Sign-in method. Enable Email/Password there or use Continue with Google.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Invalid email or password. Use "Forgot password?" to reset, or sign in with Google.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many login attempts. Wait a moment or reset your password.';
  }
  return raw;
}

export default function App() {
  const { cms, setCms } = useCms();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [portalMode, setPortalMode] = useState<PortalMode>(detectInitialPortal);
  const [staffRole, setStaffRole] = useState<StaffRole>('front_desk');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [propsLoaded, setPropsLoaded] = useState(false);
  const autoSeedAttemptedRef = useRef<string | null>(null);
  const catalogSyncedPropsRef = useRef<Set<string>>(new Set());
  const propInfoSyncedRef = useRef<Set<string>>(new Set());
  const posMenuSyncedRef = useRef<Set<string>>(new Set());
  const msgSyncedRef = useRef<Set<string>>(new Set());
  const licenseCapSyncedRef = useRef<Set<string>>(new Set());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const messagesInitLoadedRef = useRef(false);

  const [activeSection, setActiveSection] = useState<NavSectionId>(detectInitialSection);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [reservationIntent, setReservationIntent] = useState<'view' | 'edit'>('view');
  const [activePropertyId, setActivePropertyId] = useState<string>(RICHGATES_PROPERTY_ID);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [copiedPortalId, setCopiedPortalId] = useState<string | null>(null);
  const [checkedInPopup, setCheckedInPopup] = useState<{
    guestName: string;
    roomNumber: string;
    bookingRef?: string;
    reservationId?: string;
  } | null>(null);
  const [icalViewRoom, setIcalViewRoom] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('ical')) return null;
    return params.get('room') || 'ALL';
  });

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
  const [shifts, setShifts] = useState<ShiftScheduleRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRunRecord[]>([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState<MaintenanceTicketRecord[]>([]);
  const [otaChannels, setOtaChannels] = useState<OtaIntegrationRecord[]>([]);
  const [messages, setMessages] = useState<PropertyMessageRecord[]>([]);
  const [planInquiries, setPlanInquiries] = useState<PlanInquiryRecord[]>([]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const syncUrlParams = (nextPortal: PortalMode, nextSection: NavSectionId) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname.toLowerCase();
    const isPropSubdomain = Boolean(extractPropertySubdomainSlug(host));
    const isAppDomain =
      host === 'app.pchpms.com' || host === 'www.pchpms.com' || host === 'pchpms.com';
    const isAdminSubdomain =
      host.startsWith('admin.') || host.startsWith('pch.') || host.startsWith('superadmin.');

    if (nextPortal === 'home') {
      params.delete('portal');
      params.delete('page');
      const qs = params.toString();
      const basePath = isAppDomain ? '/' : '/home';
      window.history.replaceState({}, '', qs ? `${basePath}?${qs}` : basePath);
      return;
    }

    if (nextPortal === 'staff') {
      params.delete('portal');
      if (nextSection === 'dashboard') {
        params.delete('page');
      } else {
        params.set('page', nextSection);
      }
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/staff?${qs}` : '/staff');
      return;
    }

    if (
      (nextPortal === 'richgates-admin' && isPropSubdomain) ||
      (nextPortal === 'pch-admin' && isAdminSubdomain)
    ) {
      params.delete('portal');
      if (nextSection === 'dashboard') {
        params.delete('page');
      } else {
        params.set('page', nextSection);
      }
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/?${qs}` : '/');
      return;
    }

    params.set('portal', nextPortal);
    params.set('page', nextSection);
    const nextUrl = `/?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  };

  const handleSelectSection = (section: NavSectionId) => {
    setActiveSection(section);
    syncUrlParams(portalMode, section);
  };

  const handleOpenReservationFolio = (
    reservationId: string,
    targetSection: 'reservations' | 'front_desk' = 'front_desk',
    intent: 'view' | 'edit' = 'view'
  ) => {
    setSelectedReservationId(reservationId);
    setReservationIntent(intent);
    handleSelectSection(targetSection);
  };

  const runBootstrapSeed = async (customPropertyId?: string) => {
    setDbError(null);
    setSeeding(true);
    try {
      await enableNetwork(db).catch(() => undefined);
      const createdPropId = await seedRichgatesIfNeeded(customPropertyId);
      if (createdPropId) {
        setActivePropertyId(createdPropId);
        notify('Provisioned Richgates Apartments, Enugu (8 Suites) & Property License');
      }
    } catch (err) {
      if (isFirestoreOfflineError(err)) {
        setDbError(
          'Unable to reach Cloud Firestore right now. Check your internet connection and click Retry Connection.'
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setDbError(msg);
        console.error('Seed error:', msg);
      }
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    void testConnection();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      setDbError(null);
      setPropsLoaded(false);
      if (!u) {
        autoSeedAttemptedRef.current = null;
      }
    });
    return () => unsub();
  }, []);

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

  useEffect(() => {
    const allowed = ROLE_ALLOWED_SECTIONS[activeRole];
    if (!allowed.includes(activeSection)) {
      const fallback = allowed[0] || 'dashboard';
      setActiveSection(fallback);
      syncUrlParams(portalMode, fallback);
    }
  }, [activeRole, activeSection, portalMode]);

  // Root Firestore subscriptions
  useEffect(() => {
    if (!authReady || !user || !user.email) return;
    const userEmail = user.email.toLowerCase();
    const isAdmin = isBootstrappedAdminEmail(userEmail);

    const propsQuery = isAdmin
      ? collection(db, 'properties')
      : query(
          collection(db, 'properties'),
          where('authorizedEmails', 'array-contains', userEmail)
        );
    const licQuery = isAdmin
      ? collection(db, 'licenses')
      : query(
          collection(db, 'licenses'),
          where('authorizedEmails', 'array-contains', userEmail)
        );
    const audQuery = isAdmin
      ? query(collection(db, 'audit_logs'), orderBy('timestampIso', 'desc'))
      : query(
          collection(db, 'audit_logs'),
          where('authorizedEmails', 'array-contains', userEmail)
        );

    const onSnapshotErr = (path: string) => (err: unknown) => {
      if (isFirestoreOfflineError(err)) {
        setDbError(
          'Reconnecting to Cloud Firestore... Check your internet connection or click Retry Connection.'
        );
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Firestore snapshot error [${path}]:`, msg);
      setDbError(`Firestore (${path}): ${msg}`);
    };

    const unsubProps = onSnapshot(
      propsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PropertyRecord);
        setProperties(list);
        if (!snap.metadata.fromCache) {
          setDbError(null);
        }
        if (!snap.metadata.fromCache || list.length > 0) {
          setPropsLoaded(true);
        }
        setActivePropertyId((curr) => {
          if (list.length === 0) return curr;
          const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
          const propSlug = extractPropertySubdomainSlug(host);
          if (propSlug) {
            const matched = list.find(
              (p) =>
                getPropertySubdomainSlug(p) === propSlug ||
                p.code.toLowerCase().replace(/[^a-z0-9]/g, '') === propSlug
            );
            if (matched) return matched.id;
          }
          return !list.some((p) => p.id === curr) ? list[0].id : curr;
        });
        const needsBootstrapSeed = isAdmin
          ? !list.some((p) => p.id === RICHGATES_PROPERTY_ID)
          : list.length === 0;
        if (!snap.metadata.fromCache && needsBootstrapSeed && autoSeedAttemptedRef.current !== user.uid) {
          autoSeedAttemptedRef.current = user.uid;
          void runBootstrapSeed(isAdmin ? RICHGATES_PROPERTY_ID : `rg-${user.uid.slice(0, 10)}`);
        }
      },
      onSnapshotErr('properties')
    );

    const unsubLic = onSnapshot(
      licQuery,
      (snap) => setLicenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LicenseRecord)),
      onSnapshotErr('licenses')
    );

    const unsubAud = onSnapshot(
      audQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLogRecord);
        list.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
        setAuditLogs(list);
      },
      onSnapshotErr('audit_logs')
    );

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
  }, [authReady, user]);

  // Property-scoped subcollection subscriptions
  useEffect(() => {
    if (!authReady || !user || !user.email || !activePropertyId) return;
    const userEmail = user.email.toLowerCase();
    const isAdmin = isBootstrappedAdminEmail(userEmail);

    const sub = <T,>(subName: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
      const colRef = collection(db, 'properties', activePropertyId, subName);
      const q = isAdmin
        ? colRef
        : query(colRef, where('authorizedEmails', 'array-contains', userEmail));
      return onSnapshot(
        q,
        (snap) => setter(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
        (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Firestore subcollection error [${subName}]:`, msg);
        }
      );
    };

    const unsubs = [
      sub<RoomRecord>('rooms', setRooms),
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

  // Automatically sync Richgates Apartments official address, phone, WhatsApp, and support email
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || activeProp.code !== 'RG-ENU-01') return;
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin') return;
    if (propInfoSyncedRef.current.has(activeProp.id)) return;
    propInfoSyncedRef.current.add(activeProp.id);
    void syncRichgatesPropertyInfoIfNeeded(activeProp);
  }, [properties, activePropertyId, activeRole]);

  // Ensure existing properties have editable POS menu items seeded in Firestore
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || posMenuItems.length > 0) return;
    if (posMenuSyncedRef.current.has(activeProp.id)) return;
    posMenuSyncedRef.current.add(activeProp.id);
    void syncDefaultPosMenuIfNeeded(activeProp);
  }, [properties, activePropertyId, posMenuItems.length]);

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

  // Automatic background OTA iCal reservation sync every 10 minutes for connected autoSync channels
  useEffect(() => {
    const activeProp = properties.find((p) => p.id === activePropertyId);
    if (!activeProp || rooms.length === 0) return;
    if (activeRole !== 'pch_admin' && activeRole !== 'property_admin' && activeRole !== 'front_desk') {
      return;
    }

    const syncDueChannels = async () => {
      const nowMs = Date.now();
      const TEN_MIN_MS = 10 * 60 * 1000;
      const due = otaChannels.filter((ch) => {
        if (!ch.connected || !ch.autoSync || !ch.icalImportUrl?.trim()) return false;
        const lastMs = Date.parse(ch.lastSyncedIso || '');
        return !Number.isFinite(lastMs) || nowMs - lastMs >= TEN_MIN_MS;
      });
      if (due.length === 0) return;

      let totalNew = 0;
      for (const ch of due) {
        try {
          const res = await syncOtaChannelWorkflow({
            property: activeProp,
            channel: ch,
            rooms,
            reservations,
            actorRole: `${ROLE_LABELS[activeRole]} (Auto-Sync)`,
          });
          totalNew += res.created;
        } catch {
          // Quiet background retry on next cycle
        }
      }
      if (totalNew > 0) {
        notify(`OTA Auto-Sync imported ${totalNew} new booking(s)`);
      }
    };

    void syncDueChannels();
    const timer = window.setInterval(() => {
      void syncDueChannels();
    }, 10 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [properties, activePropertyId, otaChannels, rooms, reservations, activeRole]);

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

  const handleGoogleSignIn = async (portal: PortalMode, chosenStaffRole?: StaffRole) => {
    setAuthError(null);
    setAuthNotice(null);
    setIsSigningIn(true);
    try {
      handlePortalSelection(portal);
      if (chosenStaffRole) setStaffRole(chosenStaffRole);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailPasswordSignIn = async (
    portal: PortalMode,
    email: string,
    password: string,
    chosenStaffRole?: StaffRole
  ) => {
    setAuthError(null);
    setAuthNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setAuthError('Enter both your email and password, or click Continue with Google.');
      return;
    }
    setIsSigningIn(true);
    try {
      handlePortalSelection(portal);
      if (chosenStaffRole) setStaffRole(chosenStaffRole);
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setAuthNotice(
          `Verification email sent to ${cred.user.email}. Click the link in your inbox to verify your account, then sign in again.`
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
      await sendPasswordResetEmail(auth, trimmedEmail);
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
    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500">
        Initializing PCH PMS workspace...
      </div>
    );
  }

  if (portalMode === 'home') {
    return (
      <AppHomepageView
        isSignedIn={Boolean(user)}
        onSelectPortal={(nextPortal) => {
          setAuthError(null);
          setAuthNotice(null);
          handlePortalSelection(nextPortal);
        }}
        onReturnToWorkspace={() => handlePortalSelection('richgates-admin')}
      />
    );
  }

  if (!user) {
    return (
      <PortalGateway
        selectedPortal={portalMode}
        onSelectPortal={(nextPortal) => {
          setAuthError(null);
          setAuthNotice(null);
          handlePortalSelection(nextPortal);
        }}
        selectedStaffRole={staffRole}
        onSelectStaffRole={setStaffRole}
        onGoogleSignIn={handleGoogleSignIn}
        onEmailPasswordSignIn={handleEmailPasswordSignIn}
        onPasswordReset={handlePasswordReset}
        authError={authError}
        authNotice={authNotice}
        isSigningIn={isSigningIn}
      />
    );
  }

  const isBootstrappedAdmin = isBootstrappedAdminEmail(user.email);
  const activeProperty =
    properties.find((p) => p.id === activePropertyId) || properties[0] || null;
  const activeLicense = licenses.find(
    (l) => l.propertyId === activeProperty?.id && l.status === 'active'
  );
  const unreadMessages = messages
    .filter((m) => isMessageUnreadForUser(m, activeRole, user.email || ''))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        properties={properties}
        activePropertyId={activePropertyId}
        onSelectProperty={setActivePropertyId}
        portalMode={portalMode}
        activeRole={activeRole}
        userEmail={user.email || ''}
        userName={userProfile?.displayName || user.displayName || 'Property Operator'}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenPortalLinksModal={() => setShowPortalModal(true)}
        onSignOut={handleSignOut}
        unreadMessageCount={unreadMessages.length}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on Left, Notification Bell + Admin Profile & Portal Action on Right */}
        <header className="no-print h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            {portalMode === 'pch-admin' && (
              <>
                <span className="font-semibold text-slate-900 whitespace-nowrap">
                  {cms.brand.pchPortalName}
                </span>
                <span aria-hidden="true">/</span>
              </>
            )}
            <span className="font-semibold text-slate-900 whitespace-nowrap">
              {cms.pages[activeSection]?.navLabel || activeSection.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Real-Time Message Alert Bell & Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((v) => !v)}
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
                      <Mail className="w-4 h-4 text-emerald-700" />
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
                      className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
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

            <button
              type="button"
              onClick={() => handleSelectSection('profile')}
              className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-mono-tabular text-[11px] font-bold flex items-center justify-center">
                {(userProfile?.displayName || user.displayName || 'PA')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('')}
              </span>
              <span className="leading-tight">
                <span className="block text-xs font-semibold text-slate-900">
                  {userProfile?.displayName || user.displayName || 'Property Admin'}
                </span>
                <span className="block text-[10px] text-slate-500">
                  {ROLE_LABELS[activeRole]}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowPortalModal(true)}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {cms.brand.portalLinksButton || 'Portal Links'}
            </button>
          </div>
        </header>

        {cms.brand.announcementBanner.trim() && (
          <div className="no-print mx-4 sm:mx-6 mt-4 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-900 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#1c46be] shrink-0" />
            <span>{cms.brand.announcementBanner}</span>
          </div>
        )}

        {dbError && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono-tabular break-all">{dbError}</span>
            <button
              type="button"
              onClick={() => {
                autoSeedAttemptedRef.current = null;
                void runBootstrapSeed(
                  isBootstrappedAdmin ? RICHGATES_PROPERTY_ID : `rg-${user.uid.slice(0, 10)}`
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded font-semibold shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {toast && (
          <div className="no-print mx-6 mt-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center justify-between">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto print:p-0 print:max-w-none">
          {seeding || !activeProperty ? (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-display text-base font-bold text-slate-900">
                    {seeding
                      ? 'Provisioning Richgates Apartments, Enugu...'
                      : 'Loading Richgates Apartments, Enugu workspace...'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Syncing suites RM-1 to RM-8, Nigerian Naira ledger, POS menu, staff payroll, and booking channels.
                  </p>
                </div>
                {!seeding && propsLoaded && properties.length === 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      runBootstrapSeed(
                        isBootstrappedAdmin ? RICHGATES_PROPERTY_ID : `rg-${user.uid.slice(0, 10)}`
                      )
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Load Richgates Workspace</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="bg-white border border-slate-200 rounded-xl p-5 h-28 animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : (
            <PageErrorBoundary onReset={() => handleSelectSection('dashboard')}>
              {icalViewRoom !== null && (
                <div className="mb-6 bg-white border border-emerald-300 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        iCal Calendar Feed ({icalViewRoom === 'ALL' ? 'All Suites' : icalViewRoom})
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

              {activeSection === 'dashboard' && (
                <DashboardView
                  key={`dashboard-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  guests={guests}
                  ledgerEntries={ledgerEntries}
                  posOrders={posOrders}
                  maintenanceTickets={maintenanceTickets}
                  activeLicense={activeLicense}
                  canManageRooms={activeRole === 'pch_admin' || activeRole === 'property_admin'}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                  onGuestCheckedIn={(info) => setCheckedInPopup(info)}
                  onNavigate={handleSelectSection}
                  onOpenReservationFolio={handleOpenReservationFolio}
                />
              )}

              {activeSection === 'calendar' && (
                <ReservationsCalendarView
                  key={`calendar-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  guests={guests}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                  onGuestCheckedIn={(info) => setCheckedInPopup(info)}
                  onOpenReservationFolio={handleOpenReservationFolio}
                />
              )}

              {(activeSection === 'rooms' ||
                activeSection === 'reservations' ||
                activeSection === 'arrivals' ||
                activeSection === 'in_house' ||
                activeSection === 'walk_in' ||
                activeSection === 'front_desk' ||
                activeSection === 'guests') && (
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
                  onConsumeIntent={() => setReservationIntent('view')}
                  onSelectReservation={setSelectedReservationId}
                  onNavigateSection={handleSelectSection}
                  activeRole={activeRole}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                  onGuestCheckedIn={(info) => setCheckedInPopup(info)}
                />
              )}

              {activeSection === 'profile' && (
                <ProfileView
                  key={`profile-${activeProperty.id}`}
                  property={activeProperty}
                  activeLicense={activeLicense}
                  activeRole={activeRole}
                  userEmail={user.email || ''}
                  userUid={user.uid}
                  defaultDisplayName={user.displayName || 'Property Admin'}
                  userProfile={userProfile}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'housekeeping' || activeSection === 'maintenance') && (
                <HousekeepingMaintenanceView
                  key={`${activeSection}-${activeProperty.id}`}
                  section={activeSection}
                  property={activeProperty}
                  rooms={rooms}
                  housekeepingTasks={housekeepingTasks}
                  maintenanceTickets={maintenanceTickets}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                />
              )}

              {activeSection === 'pos_kitchen' && (
                <PosKitchenView
                  key={`pos-${activeProperty.id}`}
                  property={activeProperty}
                  posOrders={posOrders}
                  posMenuItems={posMenuItems}
                  inventoryItems={inventoryItems}
                  ledgerEntries={ledgerEntries}
                  reservations={reservations}
                  canManageMenu={activeRole === 'pch_admin' || activeRole === 'property_admin'}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                />
              )}

              {activeSection === 'reports' && (
                <AdminReportsAnalyticsView
                  key={`reports-${activeProperty.id}`}
                  property={activeProperty}
                  activeRole={activeRole}
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
                  onNotify={notify}
                />
              )}

              {(activeSection === 'accounting' ||
                activeSection === 'inventory' ||
                activeSection === 'procurement') && (
                <FinanceInventoryView
                  key={`${activeSection}-${activeProperty.id}`}
                  section={activeSection}
                  property={activeProperty}
                  ledgerEntries={ledgerEntries}
                  inventoryItems={inventoryItems}
                  purchaseOrders={purchaseOrders}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'staff' ||
                activeSection === 'shifts_attendance' ||
                activeSection === 'payroll') && (
                <StaffHrPayrollView
                  key={`${activeSection}-${activeProperty.id}`}
                  section={activeSection}
                  property={activeProperty}
                  staffMembers={staffMembers}
                  shifts={shifts}
                  attendance={attendance}
                  payrollRuns={payrollRuns}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'ota_channels' ||
                activeSection === 'properties_admin' ||
                activeSection === 'licensing' ||
                activeSection === 'rbac_audit' ||
                activeSection === 'deployment') && (
                <AdminLicensingView
                  key={`${activeSection}-${activeProperty.id}`}
                  section={activeSection}
                  property={activeProperty}
                  properties={properties}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  otaChannels={otaChannels}
                  posMenuItems={posMenuItems}
                  licenses={licenses}
                  planInquiries={planInquiries}
                  auditLogs={auditLogs}
                  activeRole={activeRole}
                  onSelectProperty={setActivePropertyId}
                  onSwitchPortal={(nextPortal) => {
                    handlePortalSelection(nextPortal);
                    notify(`Switched portal to ${nextPortal}`);
                  }}
                  onNotify={notify}
                />
              )}
              {activeSection === 'cms' && (
                <CmsAdminView
                  key={`cms-${activeProperty.id}`}
                  property={activeProperty}
                  activeRole={activeRole}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNavigate={handleSelectSection}
                  onNotify={notify}
                />
              )}

              {activeSection === 'messages' && (
                <DepartmentMessagingView
                  key={`messages-${activeProperty.id}`}
                  property={activeProperty}
                  messages={messages}
                  staffMembers={staffMembers}
                  activeRole={activeRole}
                  userEmail={user.email || ''}
                  userName={userProfile?.displayName || user.displayName || 'Property Operator'}
                  onNotify={notify}
                />
              )}

              {activeSection === 'training_help' && (
                <HelpDocsTrainingView
                  key={`training-${activeProperty.id}`}
                  property={activeProperty}
                  activeRole={activeRole}
                  userEmail={user.email || ''}
                  userName={userProfile?.displayName || user.displayName || 'Property Operator'}
                  onNotify={notify}
                />
              )}
            </PageErrorBoundary>
          )}
        </main>
      </div>

      {/* Direct Portal Login Links & Switcher Modal */}
      {showPortalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Direct Portal Login Links &amp; Workspace Switcher
                </h2>
                <p className="text-xs text-slate-500">
                  Share or launch dedicated portals for PCH Admin, Richgates Admin, and Staff
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
                    id: 'richgates-admin',
                    title: 'Richgates Property Admin Login',
                    desc: 'Scoped to Richgates Apartments, Enugu (8 Suites, Folios, Channel Manager & P&L)',
                  },
                  {
                    id: 'staff',
                    title: 'Richgates Staff Login',
                    desc: 'Front Desk, Housekeeping, Restaurant POS & Kitchen, Maintenance',
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

              {portalMode === 'staff' && (
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Active Staff Department Role
                  </label>
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                  >
                    <option value="front_desk">Front Desk &amp; Reservations</option>
                    <option value="housekeeping">Housekeeping Lead</option>
                    <option value="fnb_kitchen">Restaurant POS &amp; Kitchen</option>
                    <option value="accountant">Finance &amp; Payroll Officer</option>
                    <option value="maintenance">Engineering &amp; Maintenance</option>
                  </select>
                </div>
              )}
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
                Suite assigned, payment verified, and room key issued.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-2 text-xs text-left">
              <div>
                <p className="text-slate-500 text-[11px]">Suite</p>
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

            <div className="flex items-center justify-center gap-2.5 pt-1">
              {checkedInPopup.reservationId && (
                <button
                  type="button"
                  onClick={() => {
                    const resId = checkedInPopup.reservationId!;
                    setCheckedInPopup(null);
                    handleOpenReservationFolio(resId, 'front_desk');
                  }}
                  className="px-4 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
                >
                  Open Guest Folio
                </button>
              )}
              <button
                type="button"
                onClick={() => setCheckedInPopup(null)}
                className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
