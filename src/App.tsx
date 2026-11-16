import React, { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, Check, Copy, ExternalLink, Menu, RefreshCw, X } from 'lucide-react';
import { AdminLicensingView } from './components/AdminLicensingView';
import { DashboardView } from './components/DashboardView';
import { FinanceInventoryView } from './components/FinanceInventoryView';
import { HousekeepingMaintenanceView } from './components/HousekeepingMaintenanceView';
import { PortalGateway } from './components/PortalGateway';
import { PosKitchenView } from './components/PosKitchenView';
import { ReservationsCalendarView } from './components/ReservationsCalendarView';
import { RoomsReservationsView } from './components/RoomsReservationsView';
import { Sidebar } from './components/Sidebar';
import { StaffHrPayrollView } from './components/StaffHrPayrollView';
import { RICHGATES_PROPERTY_ID } from './data/seedData';
import {
  auth,
  db,
  googleProvider,
  isBootstrappedAdminEmail,
  testConnection,
} from './firebase';
import {
  seedRichgatesIfNeeded,
  syncRichgatesOfficialCatalogIfNeeded,
} from './services/pmsService';
import {
  AttendanceRecord,
  AuditLogRecord,
  BlockedDateRecord,
  getPortalUrl,
  GuestRecord,
  HousekeepingTaskRecord,
  InventoryItemRecord,
  LedgerEntryRecord,
  LicenseRecord,
  MaintenanceTicketRecord,
  NavSectionId,
  OtaIntegrationRecord,
  PayrollRunRecord,
  PortalMode,
  PosOrderRecord,
  PropertyRecord,
  PurchaseOrderRecord,
  ReservationRecord,
  ROLE_ALLOWED_SECTIONS,
  ROLE_LABELS,
  RoomRecord,
  ShiftScheduleRecord,
  StaffMemberRecord,
  StaffRole,
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
  'front_desk',
  'guests',
  'housekeeping',
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
  'deployment',
];

function detectInitialPortal(): PortalMode {
  if (typeof window === 'undefined') return 'pch-admin';
  const params = new URLSearchParams(window.location.search);
  const p = params.get('portal');
  if (p === 'pch-admin' || p === 'richgates-admin' || p === 'staff') return p;
  if (p === 'admin') return 'richgates-admin';
  const path = window.location.pathname.toLowerCase();
  if (path.includes('richgates-admin') || path.includes('admin')) return 'richgates-admin';
  if (path.includes('staff')) return 'staff';
  return 'pch-admin';
}

function detectInitialSection(): NavSectionId {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') as NavSectionId | null;
  if (page && VALID_SECTIONS.includes(page)) return page;
  return 'dashboard';
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [portalMode, setPortalMode] = useState<PortalMode>(detectInitialPortal);
  const [staffRole, setStaffRole] = useState<StaffRole>('front_desk');
  const [authError, setAuthError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [propsLoaded, setPropsLoaded] = useState(false);
  const autoSeedAttemptedRef = useRef<string | null>(null);
  const catalogSyncedPropsRef = useRef<Set<string>>(new Set());

  const [activeSection, setActiveSection] = useState<NavSectionId>(detectInitialSection);
  const [activePropertyId, setActivePropertyId] = useState<string>(RICHGATES_PROPERTY_ID);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [copiedPortalId, setCopiedPortalId] = useState<string | null>(null);

  // Firestore Live State
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateRecord[]>([]);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTaskRecord[]>([]);
  const [posOrders, setPosOrders] = useState<PosOrderRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMemberRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftScheduleRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRunRecord[]>([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState<MaintenanceTicketRecord[]>([]);
  const [otaChannels, setOtaChannels] = useState<OtaIntegrationRecord[]>([]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const syncUrlParams = (nextPortal: PortalMode, nextSection: NavSectionId) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('portal', nextPortal);
    params.set('page', nextSection);
    const nextUrl = `/?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  };

  const handleSelectSection = (section: NavSectionId) => {
    setActiveSection(section);
    syncUrlParams(portalMode, section);
  };

  const runBootstrapSeed = async (customPropertyId?: string) => {
    setDbError(null);
    setSeeding(true);
    try {
      const createdPropId = await seedRichgatesIfNeeded(customPropertyId);
      if (createdPropId) {
        setActivePropertyId(createdPropId);
        notify('Provisioned Richgates Apartments, Enugu (8 Suites) & PureCrest Lifetime License');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDbError(msg);
      console.error('Seed error:', msg);
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      setDbError(null);
      setPropsLoaded(false);
      if (!u) {
        autoSeedAttemptedRef.current = null;
        return;
      }
      if (isBootstrappedAdminEmail(u.email) && autoSeedAttemptedRef.current !== u.uid) {
        autoSeedAttemptedRef.current = u.uid;
        await runBootstrapSeed(RICHGATES_PROPERTY_ID);
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
      : portalMode === 'richgates-admin'
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Firestore snapshot error [${path}]:`, msg);
      setDbError(`Firestore (${path}): ${msg}`);
    };

    const unsubProps = onSnapshot(
      propsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PropertyRecord);
        setProperties(list);
        setPropsLoaded(true);
        setActivePropertyId((curr) =>
          list.length > 0 && !list.some((p) => p.id === curr) ? list[0].id : curr
        );
        if (list.length === 0 && autoSeedAttemptedRef.current !== user.uid) {
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

    return () => {
      unsubProps();
      unsubLic();
      unsubAud();
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
      sub<LedgerEntryRecord>('ledger_entries', setLedgerEntries),
      sub<InventoryItemRecord>('inventory_items', setInventoryItems),
      sub<PurchaseOrderRecord>('purchase_orders', setPurchaseOrders),
      sub<StaffMemberRecord>('staff_members', setStaffMembers),
      sub<ShiftScheduleRecord>('shifts', setShifts),
      sub<AttendanceRecord>('attendance', setAttendance),
      sub<PayrollRunRecord>('payroll_runs', setPayrollRuns),
      sub<MaintenanceTicketRecord>('maintenance_tickets', setMaintenanceTickets),
      sub<OtaIntegrationRecord>('ota_channels', setOtaChannels),
    ];

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

  const handlePortalSelection = (portal: PortalMode) => {
    setPortalMode(portal);
    const nextSection: NavSectionId = 'dashboard';
    setActiveSection(nextSection);
    syncUrlParams(portal, nextSection);
    if (portal === 'richgates-admin') {
      const richgatesProp = properties.find(
        (p) => p.id === RICHGATES_PROPERTY_ID || p.code === 'RG-ENU-01'
      );
      if (richgatesProp) {
        setActivePropertyId(richgatesProp.id);
      }
    }
  };

  const handleGoogleSignIn = async (portal: PortalMode, chosenStaffRole?: StaffRole) => {
    setAuthError(null);
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
      setAuthError(
        err instanceof Error ? err.message : 'Unable to complete Google sign-in.'
      );
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

  if (!user) {
    return (
      <PortalGateway
        selectedPortal={portalMode}
        onSelectPortal={handlePortalSelection}
        selectedStaffRole={staffRole}
        onSelectStaffRole={setStaffRole}
        onGoogleSignIn={handleGoogleSignIn}
        authError={authError}
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
        userName={user.displayName || 'PureCrest Operator'}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenPortalLinksModal={() => setShowPortalModal(true)}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on Left, Portal Context & Action on Right */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-900 whitespace-nowrap">PCH PMS</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{activeProperty?.name || 'Richgates Apartments, Enugu'}</span>
            <span aria-hidden="true">/</span>
            <span className="text-emerald-700 font-medium capitalize whitespace-nowrap">
              {activeSection.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              {ROLE_LABELS[activeRole]} · NGN (₦)
            </span>
            <button
              type="button"
              onClick={() => setShowPortalModal(true)}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Portal Links
            </button>
          </div>
        </header>

        {dbError && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono-tabular break-all">{dbError}</span>
            <button
              type="button"
              onClick={() =>
                runBootstrapSeed(
                  isBootstrappedAdmin ? RICHGATES_PROPERTY_ID : `rg-${user.uid.slice(0, 10)}`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded font-semibold shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {toast && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center justify-between">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
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
                    Syncing suites RM-1 to RM-8, Nigerian Naira ledger, POS menu, staff payroll, and PureCrest Lifetime License.
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
              {activeSection === 'dashboard' && (
                <DashboardView
                  key={`dashboard-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  posOrders={posOrders}
                  maintenanceTickets={maintenanceTickets}
                  activeLicense={activeLicense}
                  canManageRooms={activeRole === 'pch_admin' || activeRole === 'property_admin'}
                  onNavigate={handleSelectSection}
                />
              )}

              {activeSection === 'calendar' && (
                <ReservationsCalendarView
                  key={`calendar-${activeProperty.id}`}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'rooms' ||
                activeSection === 'reservations' ||
                activeSection === 'front_desk' ||
                activeSection === 'guests') && (
                <RoomsReservationsView
                  key={`${activeSection}-${activeProperty.id}`}
                  section={activeSection}
                  property={activeProperty}
                  rooms={rooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  guests={guests}
                  activeRole={activeRole}
                  actorRole={ROLE_LABELS[activeRole]}
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
                  reservations={reservations}
                  actorRole={ROLE_LABELS[activeRole]}
                  onNotify={notify}
                />
              )}

              {(activeSection === 'accounting' ||
                activeSection === 'reports' ||
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
                  otaChannels={otaChannels}
                  licenses={licenses}
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
                    id: 'pch-admin',
                    title: 'PCH Super Admin Portal',
                    desc: 'Multi-property control, Centralized PureCrest Licensing & Audit Logs',
                  },
                  {
                    id: 'richgates-admin',
                    title: 'Richgates Apartments Property Admin',
                    desc: 'Scoped to Richgates Apartments, Enugu (8 Rooms, P&L, Payroll)',
                  },
                  {
                    id: 'staff',
                    title: 'Staff Operations Portal',
                    desc: 'Front Desk, Housekeeping, Restaurant POS & KDS, Maintenance',
                  },
                ] as Array<{ id: PortalMode; title: string; desc: string }>
              ).map((item) => {
                const url = getPortalUrl(item.id);
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
    </div>
  );
}
