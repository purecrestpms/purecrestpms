import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  buildFormDataFromGuest,
  downloadGuestRegistrationPdf,
  printGuestRegistrationForm,
} from '../utils/guestRegistrationForm';
import {
  createGuestRecord,
  deleteGuestRecordWorkflow,
  updateGuestRecord,
} from '../services/pmsService';
import {
  formatBookingSourceLabel,
  formatNgn,
  formatUsd,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  GuestRecord,
  isOtaBookingChannel,
  PropertyRecord,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  RoomRecord,
  StaffRole,
} from '../types/pms';
import { CountrySelect } from './CountrySelect';

interface GuestsDirectoryViewProps {
  property: PropertyRecord;
  guests: GuestRecord[];
  reservations: ReservationRecord[];
  rooms: RoomRecord[];
  activeRole: StaffRole;
  actorRole: string;
  onNotify: (msg: string) => void;
  onOpenReservationFolio?: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk'
  ) => void;
  onStartNewReservationForGuest?: (guest: GuestRecord) => void;
}

type GuestFilterTab = 'all' | 'in_house' | 'vip' | 'repeat' | 'ota' | 'pending_kyc';

interface EnrichedGuest {
  guest: GuestRecord;
  stays: ReservationRecord[];
  activeStay: ReservationRecord | null;
  upcomingStay: ReservationRecord | null;
  totalStays: number;
  lifetimeSpendNgn: number;
  otaSpendUsd: number;
  outstandingBalanceNgn: number;
  isOtaGuest: boolean;
  primarySource: string;
  lastStayDate: string;
  hasVerifiedKyc: boolean;
}

function splitFullName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ['', ''];
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'G';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function parseReadableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // fallback below
    }
  }
  return raw;
}

function getVipTextClass(tier: GuestRecord['vipTier']): string {
  switch (tier) {
    case 'Diplomatic':
      return 'text-[#061539] font-semibold';
    case 'Gold':
      return 'text-amber-700 font-semibold';
    case 'Silver':
      return 'text-slate-700 font-semibold';
    default:
      return 'text-slate-500 font-medium';
  }
}

function getStayStatusClass(status: ReservationRecord['status']): string {
  switch (status) {
    case 'checked_in':
      return 'text-emerald-700 font-semibold';
    case 'confirmed':
      return 'text-[#1c46be] font-semibold';
    case 'pending':
      return 'text-amber-700 font-semibold';
    case 'checked_out':
      return 'text-slate-600 font-medium';
    case 'cancelled':
    case 'no_show':
      return 'text-rose-700 font-medium';
    default:
      return 'text-slate-600';
  }
}

export const GuestsDirectoryView: React.FC<GuestsDirectoryViewProps> = ({
  property,
  guests,
  reservations,
  rooms,
  activeRole,
  actorRole,
  onNotify,
  onOpenReservationFolio,
  onStartNewReservationForGuest,
}) => {
  const canDeleteGuests = activeRole === 'pch_admin' || activeRole === 'property_admin';
  const todayIso = new Date().toISOString().slice(0, 10);

  // Navigation within Guests module: list | create | profile
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'profile'>('list');
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  // Directory filtering & search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<GuestFilterTab>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Create Guest Form state
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('+234 ');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('Enugu');
  const [newState, setNewState] = useState('Enugu');
  const [newCountry, setNewCountry] = useState('Nigeria');
  const [newIdType, setNewIdType] = useState<GuestRecord['idType']>('NIN');
  const [newIdNumber, setNewIdNumber] = useState('');
  const [newVipTier, setNewVipTier] = useState<GuestRecord['vipTier']>('Standard');
  const [newNotes, setNewNotes] = useState('');

  // Edit Guest Profile state
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editCountry, setEditCountry] = useState('Nigeria');
  const [editIdType, setEditIdType] = useState<GuestRecord['idType']>('NIN');
  const [editIdNumber, setEditIdNumber] = useState('');
  const [editVipTier, setEditVipTier] = useState<GuestRecord['vipTier']>('Standard');
  const [editNotes, setEditNotes] = useState('');

  // Reconcile every guest against live reservations in Firestore
  const enrichedGuests = useMemo<EnrichedGuest[]>(() => {
    return guests
      .map((guest) => {
        const lowerName = (guest.fullName || '').trim().toLowerCase();
        const cleanPhone = (guest.phone || '').replace(/\s+/g, '').toLowerCase();
        const lowerEmail = (guest.email || '').trim().toLowerCase();

        const stays = reservations
          .filter((r) => {
            if (r.guestId && r.guestId === guest.id) return true;
            if (lowerName && (r.guestName || '').trim().toLowerCase() === lowerName) return true;
            if (
              lowerEmail &&
              r.guestEmail &&
              r.guestEmail.trim().toLowerCase() === lowerEmail
            ) {
              return true;
            }
            if (
              cleanPhone &&
              cleanPhone !== 'notprovided' &&
              cleanPhone.length >= 7 &&
              r.guestPhone &&
              r.guestPhone.replace(/\s+/g, '').toLowerCase() === cleanPhone
            ) {
              return true;
            }
            return false;
          })
          .sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''));

        const validStays = stays.filter((s) => s.status !== 'cancelled' && s.status !== 'no_show');
        const activeStay = stays.find((s) => s.status === 'checked_in') || null;
        const upcomingStay =
          stays.find(
            (s) =>
              (s.status === 'confirmed' || s.status === 'pending') &&
              (s.checkOutDate || '') >= todayIso
          ) || null;

        let computedSpendNgn = 0;
        let otaSpendUsd = 0;
        let outstandingBalanceNgn = 0;

        for (const s of validStays) {
          const summary = getReservationPaymentSummary(s, property.usdExchangeRateNgn);
          computedSpendNgn += summary.totalAmount;
          outstandingBalanceNgn += summary.balance;
          if (isOtaBookingChannel(s.channel)) {
            if (s.sourceCurrency === 'USD' && typeof s.sourceTotalAmount === 'number') {
              otaSpendUsd += s.sourceTotalAmount;
            } else if (summary.totalAmountUsd > 0) {
              otaSpendUsd += summary.totalAmountUsd;
            }
          }
        }

        const totalStays = Math.max(guest.totalStays || 0, validStays.length);
        const lifetimeSpendNgn = Math.max(guest.lifetimeSpendNgn || 0, computedSpendNgn);
        const otaStays = stays.filter((s) => isOtaBookingChannel(s.channel));
        const isOtaGuest = otaStays.length > 0;
        const primarySource = stays[0] ? formatBookingSourceLabel(stays[0].channel) : 'Direct Profile';
        const lastStayDate = stays[0]?.checkInDate || '';
        const hasVerifiedKyc = Boolean((guest.idNumber || '').trim().length >= 3);

        return {
          guest,
          stays,
          activeStay,
          upcomingStay,
          totalStays,
          lifetimeSpendNgn,
          otaSpendUsd,
          outstandingBalanceNgn,
          isOtaGuest,
          primarySource,
          lastStayDate,
          hasVerifiedKyc,
        };
      })
      .sort((a, b) => {
        // In-house guests first, then most recent stay, then alphabetical
        if (a.activeStay && !b.activeStay) return -1;
        if (!a.activeStay && b.activeStay) return 1;
        if (a.lastStayDate !== b.lastStayDate) {
          return b.lastStayDate.localeCompare(a.lastStayDate);
        }
        return (a.guest.fullName || '').localeCompare(b.guest.fullName || '');
      });
  }, [guests, reservations, property.usdExchangeRateNgn, todayIso]);

  const kpis = useMemo(() => {
    const totalGuests = enrichedGuests.length;
    const inHouseCount = enrichedGuests.filter((g) => Boolean(g.activeStay)).length;
    const vipOrRepeatCount = enrichedGuests.filter(
      (g) => g.guest.vipTier !== 'Standard' || g.totalStays >= 2
    ).length;
    const verifiedKycCount = enrichedGuests.filter((g) => g.hasVerifiedKyc).length;
    const kycPct = totalGuests > 0 ? Math.round((verifiedKycCount / totalGuests) * 100) : 0;
    const otaCount = enrichedGuests.filter((g) => g.isOtaGuest).length;
    const pendingKycCount = totalGuests - verifiedKycCount;
    const repeatCount = enrichedGuests.filter((g) => g.totalStays >= 2).length;
    const vipCount = enrichedGuests.filter((g) => g.guest.vipTier !== 'Standard').length;
    return {
      totalGuests,
      inHouseCount,
      vipOrRepeatCount,
      verifiedKycCount,
      kycPct,
      otaCount,
      pendingKycCount,
      repeatCount,
      vipCount,
    };
  }, [enrichedGuests]);

  const filteredGuests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedGuests.filter((item) => {
      if (activeTab === 'in_house' && !item.activeStay) return false;
      if (activeTab === 'vip' && item.guest.vipTier === 'Standard') return false;
      if (activeTab === 'repeat' && item.totalStays < 2) return false;
      if (activeTab === 'ota' && !item.isOtaGuest) return false;
      if (activeTab === 'pending_kyc' && item.hasVerifiedKyc) return false;

      if (!q) return true;
      const g = item.guest;
      return (
        (g.fullName || '').toLowerCase().includes(q) ||
        (g.phone || '').toLowerCase().includes(q) ||
        (g.email || '').toLowerCase().includes(q) ||
        (g.city || '').toLowerCase().includes(q) ||
        (g.state || '').toLowerCase().includes(q) ||
        (g.country || g.nationality || '').toLowerCase().includes(q) ||
        (g.address || '').toLowerCase().includes(q) ||
        (g.idNumber || '').toLowerCase().includes(q) ||
        (g.vipTier || '').toLowerCase().includes(q) ||
        (g.notes || '').toLowerCase().includes(q) ||
        item.primarySource.toLowerCase().includes(q)
      );
    });
  }, [enrichedGuests, activeTab, searchQuery]);

  const selectedEnriched = useMemo(
    () => (selectedGuestId ? enrichedGuests.find((e) => e.guest.id === selectedGuestId) || null : null),
    [enrichedGuests, selectedGuestId]
  );

  const openProfile = (item: EnrichedGuest, startInEdit = false) => {
    const g = item.guest;
    const [first, last] = splitFullName(g.fullName || '');
    setSelectedGuestId(g.id);
    setEditFirstName(first);
    setEditLastName(last);
    setEditPhone(g.phone || '');
    setEditEmail(g.email || '');
    setEditAddress(g.address || '');
    setEditCity(g.city || '');
    setEditState(g.state || '');
    setEditCountry(g.country || g.nationality || 'Nigeria');
    setEditIdType(g.idType || 'NIN');
    setEditIdNumber(g.idNumber || '');
    setEditVipTier(g.vipTier || 'Standard');
    setEditNotes(g.notes || '');
    setEditingProfile(startInEdit);
    setFormError(null);
    setConfirmDeleteId(null);
    setViewMode('profile');
  };

  const openCreateForm = () => {
    setNewFirstName('');
    setNewLastName('');
    setNewPhone('+234 ');
    setNewEmail('');
    setNewAddress('');
    setNewCity('Enugu');
    setNewState('Enugu');
    setNewCountry('Nigeria');
    setNewIdType('NIN');
    setNewIdNumber('');
    setNewVipTier('Standard');
    setNewNotes('');
    setFormError(null);
    setViewMode('create');
  };

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const fullName = `${newFirstName.trim()} ${newLastName.trim()}`.trim();
    if (fullName.length < 2) {
      setFormError('Please enter the guest’s first and last name.');
      return;
    }
    setBusyAction('create-guest');
    try {
      const createdId = await createGuestRecord({
        property,
        guest: {
          fullName,
          phone: newPhone.trim() || 'Not Provided',
          email: newEmail.trim(),
          address: newAddress.trim(),
          city: newCity.trim(),
          state: newState.trim(),
          country: newCountry.trim() || 'Nigeria',
          nationality: newCountry.trim() || 'Nigeria',
          idType: newIdType,
          idNumber: newIdNumber.trim(),
          vipTier: newVipTier,
          totalStays: 0,
          lifetimeSpendNgn: 0,
          notes: newNotes.trim(),
        },
        actorRole,
      });
      onNotify(`Guest profile created for ${fullName}.`);
      setViewMode('list');
      if (createdId) {
        setSelectedGuestId(createdId);
      }
    } catch (err) {
      setFormError(parseReadableError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveGuestProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnriched) return;
    setFormError(null);
    const fullName = `${editFirstName.trim()} ${editLastName.trim()}`.trim();
    if (fullName.length < 2) {
      setFormError('Guest full name must be at least 2 characters.');
      return;
    }
    setBusyAction('update-guest');
    try {
      await updateGuestRecord({
        property,
        guest: selectedEnriched.guest,
        updates: {
          fullName,
          phone: editPhone.trim() || 'Not Provided',
          email: editEmail.trim(),
          address: editAddress.trim(),
          city: editCity.trim(),
          state: editState.trim(),
          country: editCountry.trim() || 'Nigeria',
          nationality: editCountry.trim() || 'Nigeria',
          idType: editIdType,
          idNumber: editIdNumber.trim(),
          vipTier: editVipTier,
          notes: editNotes.trim(),
        },
        actorRole,
      });
      setEditingProfile(false);
      onNotify(`Saved updates to ${fullName}’s profile.`);
    } catch (err) {
      setFormError(parseReadableError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteGuest = async (guest: GuestRecord) => {
    setFormError(null);
    setBusyAction(`delete-${guest.id}`);
    try {
      await deleteGuestRecordWorkflow({
        property,
        guest,
        actorRole,
      });
      setConfirmDeleteId(null);
      if (selectedGuestId === guest.id) {
        setSelectedGuestId(null);
        setViewMode('list');
      }
      onNotify(`Removed ${guest.fullName} from guest directory.`);
    } catch (err) {
      setFormError(parseReadableError(err));
    } finally {
      setBusyAction(null);
    }
  };

  // ============================================================================
  // SUB-VIEW 1: REGISTER NEW GUEST WORKSPACE
  // ============================================================================
  if (viewMode === 'create') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 border-t-4 border-t-[#1c46be] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setViewMode('list');
                }}
                className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Guests</span>
              </button>
              <h2 className="font-display text-lg font-bold text-[#061539]">
                Register Guest Profile
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const fullName = `${newFirstName.trim()} ${newLastName.trim()}`.trim();
                  printGuestRegistrationForm({
                    property,
                    guest: {
                      fullName,
                      phone: newPhone.trim(),
                      email: newEmail.trim(),
                      address: newAddress.trim(),
                      city: newCity.trim(),
                      state: newState.trim(),
                      country: newCountry.trim() || 'Nigeria',
                      nationality: newCountry.trim() || 'Nigeria',
                      idType: newIdType,
                      idNumber: newIdNumber.trim(),
                      vipTier: newVipTier,
                      notes: newNotes.trim(),
                    },
                    rooms,
                  });
                }}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#061539]" />
                <span>Print Registration Form</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const fullName = `${newFirstName.trim()} ${newLastName.trim()}`.trim();
                  downloadGuestRegistrationPdf({
                    property,
                    guest: {
                      fullName,
                      phone: newPhone.trim(),
                      email: newEmail.trim(),
                      address: newAddress.trim(),
                      city: newCity.trim(),
                      state: newState.trim(),
                      country: newCountry.trim() || 'Nigeria',
                      nationality: newCountry.trim() || 'Nigeria',
                      idType: newIdType,
                      idNumber: newIdNumber.trim(),
                      vipTier: newVipTier,
                      notes: newNotes.trim(),
                    },
                    rooms,
                  });
                  onNotify(`Downloaded guest registration PDF${fullName ? ` for ${fullName}` : ''}`);
                }}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleCreateGuest} className="space-y-6 text-xs">
            {/* Section 1: Personal & Contact */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5">
              <h3 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                1. Personal & Contact Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="e.g. Chinedu"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="e.g. Okafor"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+234 803 000 0000"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Residential Address */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5">
              <h3 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                2. Address & Nationality
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Street, estate, or residential address"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="e.g. Enugu"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    State / Province
                  </label>
                  <input
                    type="text"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    placeholder="e.g. Enugu"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Country / Nationality
                  </label>
                  <CountrySelect value={newCountry} onChange={setNewCountry} />
                </div>
              </div>
            </div>

            {/* Section 3: KYC Identification & Preferences */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5">
              <h3 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                3. KYC Identification & VIP Preferences
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ID Document Type
                  </label>
                  <select
                    value={newIdType}
                    onChange={(e) => setNewIdType(e.target.value as GuestRecord['idType'])}
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  >
                    <option value="NIN">NIN</option>
                    <option value="International Passport">International Passport</option>
                    <option value="Driver License">Driver License</option>
                    <option value="Voter Card">Voter Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ID Number
                  </label>
                  <input
                    type="text"
                    value={newIdNumber}
                    onChange={(e) => setNewIdNumber(e.target.value)}
                    placeholder="Enter document number"
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    VIP Tier
                  </label>
                  <select
                    value={newVipTier}
                    onChange={(e) => setNewVipTier(e.target.value as GuestRecord['vipTier'])}
                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                    <option value="Diplomatic">Diplomatic</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Guest Notes & Preferences
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Room preferences, airport pickup notes, corporate billing details..."
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setViewMode('list');
                }}
                className="h-10 px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction === 'create-guest'}
                className="h-10 inline-flex items-center gap-2 px-5 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{busyAction === 'create-guest' ? 'Saving...' : 'Save Guest Profile'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW 2: GUEST PROFILE & STAY HISTORY WORKSPACE
  // ============================================================================
  if (viewMode === 'profile' && selectedEnriched) {
    const g = selectedEnriched.guest;
    const locationLine = [g.city, g.state, g.country || g.nationality]
      .filter(Boolean)
      .join(', ');

    return (
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('list');
                setEditingProfile(false);
                setFormError(null);
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Guests</span>
            </button>
            <div className="w-11 h-11 rounded-full bg-[#061539] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
              {getInitials(g.fullName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-lg font-bold text-[#061539] truncate">
                  {g.fullName}
                </h2>
                <span className={`text-xs ${getVipTextClass(g.vipTier)}`}>
                  · {g.vipTier}
                </span>
                {selectedEnriched.activeStay && (
                  <span className="text-xs font-semibold text-emerald-700">
                    · Checked In (
                    {(() => {
                      const rd = getReservationRoomDisplay(selectedEnriched.activeStay, rooms);
                      return rd.isAssigned ? rd.roomNumberLabel : rd.roomTypeLabel;
                    })()}
                    )
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {g.phone}
                {g.email ? ` · ${g.email}` : ''}
                {locationLine ? ` · ${locationLine}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const primaryStay =
                  selectedEnriched.activeStay ||
                  selectedEnriched.upcomingStay ||
                  selectedEnriched.stays[0] ||
                  null;
                printGuestRegistrationForm({
                  property,
                  guest: buildFormDataFromGuest(g),
                  latestReservation: primaryStay,
                  rooms,
                });
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#061539]" />
              <span>Print Registration Form</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const primaryStay =
                  selectedEnriched.activeStay ||
                  selectedEnriched.upcomingStay ||
                  selectedEnriched.stays[0] ||
                  null;
                downloadGuestRegistrationPdf({
                  property,
                  guest: buildFormDataFromGuest(g),
                  latestReservation: primaryStay,
                  rooms,
                });
                onNotify(`Downloaded registration form PDF for ${g.fullName}`);
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            {onStartNewReservationForGuest && (
              <button
                type="button"
                onClick={() => onStartNewReservationForGuest(g)}
                className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>New Reservation</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingProfile((v) => !v);
                setFormError(null);
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {editingProfile ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              <span>{editingProfile ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>
            {canDeleteGuests && (
              confirmDeleteId === g.id ? (
                <div className="inline-flex items-center gap-1.5 pl-2">
                  <button
                    type="button"
                    disabled={busyAction === `delete-${g.id}`}
                    onClick={() => handleDeleteGuest(g)}
                    className="h-9 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {busyAction === `delete-${g.id}` ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(g.id)}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 cursor-pointer"
                  title="Delete guest profile"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        </div>

        {formError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Guest Metric Summary Strip (Clean SaaS KPI cards without icons) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Stays
            </p>
            <p className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#061539]">
              {selectedEnriched.totalStays}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {selectedEnriched.lastStayDate
                ? `Last check-in ${selectedEnriched.lastStayDate}`
                : 'No stays recorded yet'}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Lifetime Spend
            </p>
            <p className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#061539]">
              {formatNgn(selectedEnriched.lifetimeSpendNgn)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 font-mono-tabular">
              {selectedEnriched.otaSpendUsd > 0
                ? `Includes ${formatUsd(selectedEnriched.otaSpendUsd)} via OTA`
                : `Primary source: ${selectedEnriched.primarySource}`}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Open Balance
            </p>
            <p
              className={`mt-1.5 text-2xl font-display font-bold font-mono-tabular ${
                selectedEnriched.outstandingBalanceNgn > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {formatNgn(selectedEnriched.outstandingBalanceNgn)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {selectedEnriched.outstandingBalanceNgn > 0
                ? 'Outstanding folio balance'
                : 'All folios settled'}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              KYC Status
            </p>
            <p
              className={`mt-1.5 text-2xl font-display font-bold ${
                selectedEnriched.hasVerifiedKyc ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {selectedEnriched.hasVerifiedKyc ? 'Verified' : 'Pending'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 font-mono-tabular truncate">
              {selectedEnriched.hasVerifiedKyc
                ? `${g.idType} · ${g.idNumber}`
                : `${g.idType} not recorded`}
            </p>
          </div>
        </div>

        {/* 2-Column Split: Profile Details / Editor + Stay & Folio History */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Guest Profile Details or Inline Edit Form */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            {editingProfile ? (
              <form onSubmit={handleSaveGuestProfile} className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-display text-sm font-bold text-[#061539]">
                    Edit Guest Profile
                  </h3>
                  <span className="text-[11px] text-slate-400">Saved live to Firestore</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs font-mono-tabular focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="Residential or corporate address"
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Country / Nationality
                    </label>
                    <CountrySelect value={editCountry} onChange={setEditCountry} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ID Type
                    </label>
                    <select
                      value={editIdType}
                      onChange={(e) => setEditIdType(e.target.value as GuestRecord['idType'])}
                      className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    >
                      <option value="NIN">NIN</option>
                      <option value="International Passport">International Passport</option>
                      <option value="Driver License">Driver License</option>
                      <option value="Voter Card">Voter Card</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ID Number
                    </label>
                    <input
                      type="text"
                      value={editIdNumber}
                      onChange={(e) => setEditIdNumber(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs font-mono-tabular focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      VIP Tier
                    </label>
                    <select
                      value={editVipTier}
                      onChange={(e) => setEditVipTier(e.target.value as GuestRecord['vipTier'])}
                      className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#1c46be]"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Silver">Silver</option>
                      <option value="Gold">Gold</option>
                      <option value="Diplomatic">Diplomatic</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Notes & Preferences
                    </label>
                    <textarea
                      rows={3}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Guest preferences, special requests, billing notes..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1c46be]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busyAction === 'update-guest'}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{busyAction === 'update-guest' ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-display text-sm font-bold text-[#061539]">
                    Contact & Identity
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(true)}
                    className="text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer"
                  >
                    Update Details
                  </button>
                </div>

                <dl className="divide-y divide-slate-100">
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 flex items-center gap-1.5 shrink-0">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Phone</span>
                    </dt>
                    <dd className="font-mono-tabular font-medium text-slate-900 text-right">
                      {g.phone || 'Not Provided'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 flex items-center gap-1.5 shrink-0">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>Email</span>
                    </dt>
                    <dd className="font-medium text-slate-900 text-right break-all">
                      {g.email || '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 flex items-center gap-1.5 shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Address</span>
                    </dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {g.address || '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 shrink-0">Location</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {locationLine || 'Nigeria'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 flex items-center gap-1.5 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>KYC Document</span>
                    </dt>
                    <dd className="font-mono-tabular font-medium text-slate-900 text-right">
                      {g.idNumber ? `${g.idType} · ${g.idNumber}` : `${g.idType} · Pending`}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="text-slate-500 shrink-0">VIP Tier</dt>
                    <dd className={getVipTextClass(g.vipTier)}>{g.vipTier}</dd>
                  </div>
                </dl>

                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Guest Notes
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {g.notes?.trim() ? g.notes : 'No notes recorded for this guest.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Stay & Folio History */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-[#061539]">
                  Stay & Folio History
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selectedEnriched.stays.length} reservation
                  {selectedEnriched.stays.length === 1 ? '' : 's'} linked to this guest
                </p>
              </div>
              {onStartNewReservationForGuest && (
                <button
                  type="button"
                  onClick={() => onStartNewReservationForGuest(g)}
                  className="text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer"
                >
                  + Book Another Stay
                </button>
              )}
            </div>

            {selectedEnriched.stays.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">No reservations yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Create a reservation for {g.fullName} to track stays, payments, and folio activity here.
                </p>
                {onStartNewReservationForGuest && (
                  <button
                    type="button"
                    onClick={() => onStartNewReservationForGuest(g)}
                    className="mt-4 h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-xs font-semibold cursor-pointer"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>New Reservation for Guest</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Reference & Room</th>
                      <th className="py-3 px-3">Dates</th>
                      <th className="py-3 px-3">Source</th>
                      <th className="py-3 px-3 text-right">Total / Balance</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Folio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedEnriched.stays.map((stay) => {
                      const summary = getReservationPaymentSummary(
                        stay,
                        property.usdExchangeRateNgn
                      );
                      const showUsd =
                        isOtaBookingChannel(stay.channel) &&
                        stay.sourceCurrency === 'USD' &&
                        typeof stay.sourceTotalAmount === 'number' &&
                        stay.sourceTotalAmount > 0;
                      return (
                        <tr key={stay.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-mono-tabular font-semibold text-[#061539]">
                              {stay.bookingRef}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {(() => {
                                const rd = getReservationRoomDisplay(stay, rooms);
                                return rd.isAssigned
                                  ? `${rd.roomNumberLabel} · ${rd.roomTypeLabel}`
                                  : rd.roomTypeLabel;
                              })()}
                            </p>
                          </td>
                          <td className="py-3 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                            <div>{stay.checkInDate}</div>
                            <div className="text-[11px] text-slate-400">
                              to {stay.checkOutDate} ({stay.nights}n)
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                            {formatBookingSourceLabel(stay.channel)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {formatNgn(summary.totalAmount)}
                            </div>
                            {showUsd && (
                              <div className="text-[11px] text-slate-500">
                                {formatUsd(stay.sourceTotalAmount || 0)}
                              </div>
                            )}
                            <div
                              className={`text-[11px] ${
                                summary.balance > 0 ? 'text-rose-700 font-semibold' : 'text-emerald-700'
                              }`}
                            >
                              {summary.balance > 0
                                ? `Bal ${formatNgn(summary.balance)}`
                                : 'Settled'}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={getStayStatusClass(stay.status)}>
                              {RESERVATION_STATUS_LABELS[stay.status] || stay.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {onOpenReservationFolio && (
                              <button
                                type="button"
                                onClick={() => onOpenReservationFolio(stay.id, 'reservations')}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer"
                              >
                                <span>Open</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW 3: MAIN GUEST DIRECTORY
  // ============================================================================
  const filterTabs: Array<{ id: GuestFilterTab; label: string; count: number }> = [
    { id: 'all', label: 'All Guests', count: kpis.totalGuests },
    { id: 'in_house', label: 'In-House', count: kpis.inHouseCount },
    { id: 'vip', label: 'VIP Tiers', count: kpis.vipCount },
    { id: 'repeat', label: 'Repeat Stays', count: kpis.repeatCount },
    { id: 'ota', label: 'OTA Guests', count: kpis.otaCount },
    { id: 'pending_kyc', label: 'Pending KYC', count: kpis.pendingKycCount },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[#061539]">Guests</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Guest directory, KYC records, VIP tiers, and stay history for {property.name}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="h-10 inline-flex items-center gap-2 px-4 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Register Guest</span>
        </button>
      </div>

      {/* 4 Clean KPI Cards (No decorative icons, tabular numerals) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Guests
          </p>
          <p className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#061539]">
            {kpis.totalGuests}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {kpis.otaCount} via OTA channels
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Currently In-House
          </p>
          <p className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-emerald-700">
            {kpis.inHouseCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Active checked-in profiles
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            VIP & Repeat Guests
          </p>
          <p className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#061539]">
            {kpis.vipOrRepeatCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {kpis.vipCount} VIP · {kpis.repeatCount} repeat stays
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Verified KYC
          </p>
          <p className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#061539]">
            {kpis.verifiedKycCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {kpis.kycPct}% with government ID on file
          </p>
        </div>
      </div>

      {formError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Search + Segmented Filter Tabs + Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Segmented Filter Control */}
          <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {filterTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#061539] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`ml-1.5 font-mono-tabular text-[11px] ${
                      isActive ? 'text-[#1c46be]' : 'text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live Search Input */}
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, email, city, ID..."
              className="w-full h-9 pl-9 pr-8 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1c46be]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {filteredGuests.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              {guests.length === 0 ? 'No guest profiles yet' : 'No matching guests found'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {guests.length === 0
                ? 'Register a guest profile manually or create a reservation to populate this directory.'
                : 'Try adjusting your search query or switching filter tabs.'}
            </p>
            {guests.length === 0 && (
              <button
                type="button"
                onClick={openCreateForm}
                className="mt-4 h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-xs font-semibold cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register First Guest</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Guest</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">KYC / Tier</th>
                  <th className="py-3 px-3 text-right">Stays & Spend</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGuests.map((item) => {
                  const g = item.guest;
                  const locationText = [g.city, g.country || g.nationality]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <tr
                      key={g.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-[#061539] font-display font-bold text-[11px] flex items-center justify-center shrink-0">
                            {getInitials(g.fullName)}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openProfile(item)}
                              className="font-semibold text-[#061539] hover:text-[#1c46be] text-left truncate block max-w-[220px] cursor-pointer"
                            >
                              {g.fullName}
                            </button>
                            <p className="text-[11px] text-slate-500 truncate max-w-[220px] mt-0.5">
                              {item.activeStay ? (
                                <span className="text-emerald-700 font-semibold">
                                  In-House ·{' '}
                                  {(() => {
                                    const rd = getReservationRoomDisplay(item.activeStay, rooms);
                                    return rd.isAssigned ? rd.roomNumberLabel : rd.roomTypeLabel;
                                  })()}
                                </span>
                              ) : item.upcomingStay ? (
                                <span className="text-[#1c46be] font-medium">
                                  Arriving {item.upcomingStay.checkInDate} · {item.primarySource}
                                </span>
                              ) : (
                                <span>{item.primarySource}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-mono-tabular text-slate-800 font-medium">
                          {g.phone || 'Not Provided'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[190px] mt-0.5">
                          {g.email || 'No email on file'}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="text-slate-700 font-medium truncate max-w-[160px]">
                          {locationText || 'Nigeria'}
                        </div>
                        {g.address && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-0.5">
                            {g.address}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className={`text-xs ${getVipTextClass(g.vipTier)}`}>
                          {g.vipTier}
                        </div>
                        <div className="text-[11px] font-mono-tabular mt-0.5">
                          {item.hasVerifiedKyc ? (
                            <span className="text-slate-600">
                              {g.idType} · {g.idNumber}
                            </span>
                          ) : (
                            <span className="text-amber-700">Pending ID</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono-tabular whitespace-nowrap">
                        <div className="font-semibold text-[#061539]">
                          {formatNgn(item.lifetimeSpendNgn)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.totalStays} stay{item.totalStays === 1 ? '' : 's'}
                          {item.otaSpendUsd > 0 ? ` · ${formatUsd(item.otaSpendUsd)}` : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openProfile(item)}
                            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                          >
                            Profile
                          </button>
                          {onStartNewReservationForGuest && (
                            <button
                              type="button"
                              onClick={() => onStartNewReservationForGuest(g)}
                              className="h-8 px-2.5 rounded-lg bg-[#1c46be] hover:bg-[#16389c] text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Book Stay
                            </button>
                          )}
                          {canDeleteGuests && (
                            confirmDeleteId === g.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busyAction === `delete-${g.id}`}
                                  onClick={() => handleDeleteGuest(g)}
                                  className="h-8 px-2 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="h-8 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(g.id)}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-transparent hover:border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Delete guest"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
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
    </div>
  );
};
