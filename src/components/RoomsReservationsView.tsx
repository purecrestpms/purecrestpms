import React, { useEffect, useRef, useState } from 'react';

function splitFullName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ['', ''];
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Ban,
  BedDouble,
  BookOpenCheck,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  DoorOpen,
  Eye,
  ImagePlus,
  KeyRound,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PlaneLanding,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserCircle2,
  UserPlus,
  X,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  addMiscFolioCharge,
  applyLateCheckoutWorkflow,
  changeInHouseRoomWorkflow,
  createGuestRecord,
  createReservationWorkflow,
  createRoomWorkflow,
  deleteGuestRecordWorkflow,
  deleteReservationWorkflow,
  deleteRoomWorkflow,
  extendReservationStay,
  recordReservationFolioPayment,
  syncRichgatesOfficialCatalogIfNeeded,
  transitionReservationStatus,
  updateGuestRecord,
  updateReservationCautionDepositWorkflow,
  updateReservationDetailsWorkflow,
  updateRoomStatus,
} from '../services/pmsService';
import {
  BlockedDateRecord,
  ChannelCurrency,
  convertNgnToUsd,
  formatBookingSourceLabel,
  formatChannelCurrency,
  formatNgn,
  formatPaymentCollectionLabel,
  formatPriceInputWithCommas,
  formatUsd,
  getCheckInDateRestriction,
  getDefaultOtaChannelCurrency,
  getFxRateToNgn,
  getOtaCancellationRestriction,
  getOtaCheckInRestriction,
  getPropertySystemId,
  getReservationBookedDate,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  getRoomGalleryImages,
  getRoomSection,
  GuestRecord,
  isOtaBookingChannel,
  isOtaReservation,
  LicenseRecord,
  matchesBookingSourceFilter,
  NavSectionId,
  OtaPaymentCollectionMode,
  OtaPayoutStatus,
  parseFormattedPriceInput,
  PaymentStatusLabel,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  RATE_PLAN_OPTIONS,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  ReservationStatus,
  RICHGATES_GALLERY_ASSETS,
  RICHGATES_MAX_ROOMS,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
  StaffRole,
  SUPPORTED_CHANNEL_CURRENCIES,
} from '../types/pms';
import {
  checkRoomDateRangeAvailability,
  formatRoomAvailabilityTag,
  getLocalIsoDate,
  normalizeIsoDate,
} from '../utils/availability';
import {
  DEFAULT_ROOM_COVER_IMAGE_URL,
  isLegacyOrAiStudioImageUrl,
  resolveAppImageUrl,
  resolveGalleryImageUrls,
  uploadAppMediaImage,
} from '../utils/mediaAssets';
import { AvailabilityDateRangePicker } from './AvailabilityDateRangePicker';
import { CheckInProcessModal, CheckedInConfirmationInfo } from './CheckInProcessModal';
import { CountrySelect } from './CountrySelect';
import { ReservationPaymentModal } from './ReservationPaymentModal';
import { PaymentReceiptModal, PaymentReceiptMode } from './PaymentReceiptModal';
import { CurrencyConverterWidget } from './CurrencyConverterWidget';
import { getAmenityIcon, RoomGallerySlider } from './RoomGallerySlider';

interface RoomsReservationsViewProps {
  section: Extract<
    NavSectionId,
    'rooms' | 'reservations' | 'arrivals' | 'in_house' | 'walk_in' | 'front_desk' | 'guests'
  >;
  property: PropertyRecord;
  activeLicense?: LicenseRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  guests: GuestRecord[];
  housekeepingTasksCount?: number;
  selectedReservationId?: string | null;
  initialReservationIntent?: 'view' | 'edit';
  initialRoomDetailId?: string | null;
  onConsumeRoomDetailId?: () => void;
  prefillBookingRoomId?: string | null;
  onConsumePrefillBookingRoomId?: () => void;
  prefillBookingGuest?: GuestRecord | null;
  onConsumePrefillBookingGuest?: () => void;
  onStartNewReservationForRoom?: (roomId: string) => void;
  onConsumeIntent?: () => void;
  onSelectReservation?: (id: string | null) => void;
  onNavigateSection?: (section: NavSectionId) => void;
  activeRole: StaffRole;
  actorRole: string;
  onNotify: (msg: string) => void;
  onGuestCheckedIn?: (info: CheckedInConfirmationInfo) => void;
}

const DEFAULT_SUITE_IMAGE = DEFAULT_ROOM_COVER_IMAGE_URL;

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

function isCleanExternalImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('/api/media/')
  ) {
    return false;
  }
  return !isLegacyOrAiStudioImageUrl(trimmed);
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days)).toISOString().slice(0, 10);
}

function diffNights(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

function handleCommaPriceChange(
  e: React.ChangeEvent<HTMLInputElement>,
  prevFormatted: string,
  setFormatted: (next: string) => void
) {
  const inputEl = e.target;
  const rawVal = inputEl.value;
  const cursorPos = inputEl.selectionStart ?? rawVal.length;

  // If user pressed Backspace right after a comma, delete the digit preceding that comma
  if (
    rawVal.length === prevFormatted.length - 1 &&
    rawVal.replace(/,/g, '') === prevFormatted.replace(/,/g, '') &&
    cursorPos > 0 &&
    prevFormatted.charAt(cursorPos) === ','
  ) {
    const deletedRaw = rawVal.slice(0, cursorPos - 1) + rawVal.slice(cursorPos);
    const significantBefore = deletedRaw
      .slice(0, Math.max(0, cursorPos - 1))
      .replace(/[^0-9.]/g, '').length;
    const nextFormatted = formatPriceInputWithCommas(deletedRaw);
    setFormatted(nextFormatted);
    requestAnimationFrame(() => {
      if (document.activeElement !== inputEl) return;
      let seen = 0;
      let targetIdx = 0;
      while (targetIdx < nextFormatted.length && seen < significantBefore) {
        if (/[0-9.]/.test(nextFormatted[targetIdx])) seen += 1;
        targetIdx += 1;
      }
      inputEl.setSelectionRange(targetIdx, targetIdx);
    });
    return;
  }

  const significantBefore = rawVal
    .slice(0, cursorPos)
    .replace(/[^0-9.]/g, '').length;
  const nextFormatted = formatPriceInputWithCommas(rawVal);
  setFormatted(nextFormatted);

  requestAnimationFrame(() => {
    if (document.activeElement !== inputEl) return;
    let seen = 0;
    let targetIdx = 0;
    while (targetIdx < nextFormatted.length && seen < significantBefore) {
      if (/[0-9.]/.test(nextFormatted[targetIdx])) seen += 1;
      targetIdx += 1;
    }
    inputEl.setSelectionRange(targetIdx, targetIdx);
  });
}

export const RoomsReservationsView: React.FC<RoomsReservationsViewProps> = ({
  section,
  property,
  activeLicense,
  rooms,
  reservations,
  blockedDates,
  guests,
  selectedReservationId,
  initialReservationIntent = 'view',
  initialRoomDetailId,
  onConsumeRoomDetailId,
  prefillBookingRoomId,
  onConsumePrefillBookingRoomId,
  prefillBookingGuest,
  onConsumePrefillBookingGuest,
  onStartNewReservationForRoom,
  onConsumeIntent,
  onSelectReservation,
  onNavigateSection,
  activeRole,
  actorRole,
  onNotify,
  onGuestCheckedIn,
}) => {
  const { cms } = useCms();
  const canManageRooms = activeRole === 'pch_admin' || activeRole === 'property_admin';
  const effectiveMaxRooms =
    property.code === 'RG-ENU-01'
      ? Math.min(activeLicense?.maxRooms ?? RICHGATES_MAX_ROOMS, RICHGATES_MAX_ROOMS)
      : (activeLicense?.maxRooms ?? 250);
  const atRoomCapacity = rooms.length >= effectiveMaxRooms;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addRoomFileInputRef = useRef<HTMLInputElement | null>(null);
  const gallerySlideFileInputRef = useRef<HTMLInputElement | null>(null);
  const addRoomGallerySlideFileInputRef = useRef<HTMLInputElement | null>(null);
  const roomDefaultInitRef = useRef(false);
  const todayIso = getLocalIsoDate();
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [filterRoomId, setFilterRoomId] = useState('ALL');
  const [filterChannel, setFilterChannel] = useState<'ALL' | string>('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<'all' | PaymentStatusLabel>('all');
  const [filterStayFrom, setFilterStayFrom] = useState('');
  const [filterStayTo, setFilterStayTo] = useState('');

  const [resStatusFilter, setResStatusFilter] = useState<'all' | ReservationStatus>('all');
  const [arrivalsTab, setArrivalsTab] = useState<
    'today' | 'future' | 'overdue' | 'checked_in_today'
  >('today');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState<string | null>(null);
  const [confirmDeleteResId, setConfirmDeleteResId] = useState<string | null>(null);
  const [confirmDeleteGuestId, setConfirmDeleteGuestId] = useState<string | null>(null);

  // Quick inline rate edit
  const [editingRateRoomId, setEditingRateRoomId] = useState<string | null>(null);
  const [rateDraftInput, setRateDraftInput] = useState<string>('65,500');

  // Room Details Page & Full Room Editor Page
  const [selectedRoomDetailId, setSelectedRoomDetailId] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<RoomRecord | null>(null);
  const [draftRoomNumber, setDraftRoomNumber] = useState('');
  const [draftRoomType, setDraftRoomType] = useState('');
  const [draftSection, setDraftSection] = useState<RoomSection>('Serviced Apartment');
  const [draftRateInput, setDraftRateInput] = useState<string>('65,500');
  const [draftMaxGuests, setDraftMaxGuests] = useState<number>(2);
  const [draftOccupancy, setDraftOccupancy] =
    useState<RoomRecord['occupancyStatus']>('vacant');
  const [draftAmenitiesText, setDraftAmenitiesText] = useState('');
  const [draftImageUrl, setDraftImageUrl] = useState('');
  const [draftGalleryImages, setDraftGalleryImages] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editRoomError, setEditRoomError] = useState<string | null>(null);

  // Rooms search & filter state
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomSectionFilter, setRoomSectionFilter] = useState<'ALL' | RoomSection>('ALL');
  const [roomStatusFilter, setRoomStatusFilter] = useState<'ALL' | RoomRecord['occupancyStatus']>('ALL');
  const [expandedAmenityRoomIds, setExpandedAmenityRoomIds] = useState<Record<string, boolean>>({});

  // Add New Room Page state
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomType, setNewRoomType] = useState('Studio Apartment');
  const [newRoomSection, setNewRoomSection] = useState<RoomSection>('Hotel Rooms');
  const [newRoomFloor, setNewRoomFloor] = useState<number>(2);
  const [newRoomRateInput, setNewRoomRateInput] = useState<string>('65,500');
  const [newRoomMaxGuests, setNewRoomMaxGuests] = useState<number>(2);
  const [newRoomAmenitiesText, setNewRoomAmenitiesText] = useState('King Bed, Wi-Fi, Smart TV, 24/7 Power');
  const [newRoomImageUrl, setNewRoomImageUrl] = useState(DEFAULT_SUITE_IMAGE);
  const [newRoomGalleryImages, setNewRoomGalleryImages] = useState<string[]>([]);
  const [addRoomError, setAddRoomError] = useState<string | null>(null);

  // New Reservation Page state (auto-pick today & next day)
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || '');
  const [newRequestedRoomType, setNewRequestedRoomType] = useState(
    rooms[0]?.roomType || 'Deluxe Studio with Kitchenette'
  );
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+234 803 ');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [guestCity, setGuestCity] = useState('Enugu');
  const [guestState, setGuestState] = useState('Enugu');
  const [guestCountry, setGuestCountry] = useState('Nigeria');
  const [checkInDate, setCheckInDate] = useState(todayIso);
  const [checkOutDate, setCheckOutDate] = useState(tomorrowIso);
  const [nights, setNights] = useState(1);
  const [adults, setAdults] = useState(1);
  const [childrenCount, setChildrenCount] = useState(0);
  const [channel, setChannel] = useState<ReservationRecord['channel']>('Walk-in');
  const [bookingCurrency, setBookingCurrency] = useState<ChannelCurrency>('NGN');
  const [bookingFxRateInput, setBookingFxRateInput] = useState<string>('1');
  const [bookingNightlyRateInput, setBookingNightlyRateInput] = useState<string>('65,500');
  const [bookingOtaPaidSourceInput, setBookingOtaPaidSourceInput] = useState<string>('');
  const [bookingExpectedPayoutInput, setBookingExpectedPayoutInput] = useState<string>('65,500');
  const [bookingExpectedPayoutManual, setBookingExpectedPayoutManual] = useState(false);
  const [bookingHotelPaidInput, setBookingHotelPaidInput] = useState<string>('65,500');
  const [bookingCollectionMode, setBookingCollectionMode] =
    useState<OtaPaymentCollectionMode>('hotel_collect');
  const [bookingOtaPayoutStatus, setBookingOtaPayoutStatus] =
    useState<OtaPayoutStatus>('pending');
  const [bookingActualPayoutInput, setBookingActualPayoutInput] = useState<string>('0');
  const [bookingAmountDueInput, setBookingAmountDueInput] = useState<string>('0');
  const [bookingAmountDueManual, setBookingAmountDueManual] = useState(false);
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<PaymentStatusLabel>('Paid');
  const [bookingPaymentStatusManual, setBookingPaymentStatusManual] = useState(false);
  const [cautionDepositEnabled, setCautionDepositEnabled] = useState(false);
  const [cautionDepositAmountInput, setCautionDepositAmountInput] = useState<string>('20,000');
  const [cautionDepositCollectedInput, setCautionDepositCollectedInput] = useState<string>('0');
  const [cautionDepositRefunded, setCautionDepositRefunded] = useState(false);
  const [initialBookingStatus, setInitialBookingStatus] = useState<'confirmed' | 'pending'>('confirmed');
  const [paymentMethod, setPaymentMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [immediateCheckIn, setImmediateCheckIn] = useState(false);
  const [inlineIdType, setInlineIdType] = useState<GuestRecord['idType']>('NIN');
  const [inlineIdNumber, setInlineIdNumber] = useState('');
  const [inlineIdExpiryDate, setInlineIdExpiryDate] = useState('');
  const [bookingRatePlan, setBookingRatePlan] = useState<string>('Standard Rate');
  const [bookingSpecialRequests, setBookingSpecialRequests] = useState<string>('');
  const [createdReservationSuccess, setCreatedReservationSuccess] =
    useState<ReservationRecord | null>(null);
  const [inlinePayConfirmed, setInlinePayConfirmed] = useState(false);
  const [inlineIdVerified, setInlineIdVerified] = useState(false);
  const [inlineRoomReady, setInlineRoomReady] = useState(false);
  const [inlineKeyIssued, setInlineKeyIssued] = useState<'yes' | 'no' | null>(null);

  // Dedicated Walk-in Check-in Form state (auto-pick tomorrow checkout)
  const [walkInFirstName, setWalkInFirstName] = useState('');
  const [walkInLastName, setWalkInLastName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('+234 ');
  const [walkInEmail, setWalkInEmail] = useState('');
  const [walkInIdType, setWalkInIdType] = useState<GuestRecord['idType']>('NIN');
  const [walkInIdNumber, setWalkInIdNumber] = useState('');
  const [walkInAddress, setWalkInAddress] = useState('');
  const [walkInCity, setWalkInCity] = useState('Enugu');
  const [walkInState, setWalkInState] = useState('Enugu');
  const [walkInCountry, setWalkInCountry] = useState('Nigeria');
  const [walkInAdults, setWalkInAdults] = useState(1);
  const [walkInChildren, setWalkInChildren] = useState(0);
  const [walkInRoomTypeFilter, setWalkInRoomTypeFilter] = useState('ALL');
  const [walkInRoomId, setWalkInRoomId] = useState('');
  const [walkInCheckOut, setWalkInCheckOut] = useState(tomorrowIso);
  const [walkInRateNgn, setWalkInRateNgn] = useState(65500);
  const [walkInPaymentMethod, setWalkInPaymentMethod] =
    useState<ReservationRecord['paymentMethod']>('Cash NGN');
  const [walkInDepositNgn, setWalkInDepositNgn] = useState(65500);
  const [walkInPaymentStatus, setWalkInPaymentStatus] = useState<PaymentStatusLabel>('Paid');
  const [walkInPaymentStatusManual, setWalkInPaymentStatusManual] = useState(false);
  const [walkInCautionEnabled, setWalkInCautionEnabled] = useState(false);
  const [walkInCautionAmount, setWalkInCautionAmount] = useState(20000);
  const [walkInCautionCollected, setWalkInCautionCollected] = useState(0);
  const [walkInPayConfirmed, setWalkInPayConfirmed] = useState(false);
  const [walkInIdVerified, setWalkInIdVerified] = useState(false);
  const [walkInRoomReady, setWalkInRoomReady] = useState(false);
  const [walkInKeyIssued, setWalkInKeyIssued] = useState<'yes' | 'no' | null>(null);
  const [walkInError, setWalkInError] = useState<string | null>(null);

  // Guest registration form
  const [newGuestFirstName, setNewGuestFirstName] = useState('');
  const [newGuestLastName, setNewGuestLastName] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('+234 ');
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [newGuestAddress, setNewGuestAddress] = useState('');
  const [newGuestCity, setNewGuestCity] = useState('Enugu');
  const [newGuestState, setNewGuestState] = useState('Enugu');
  const [newGuestCountry, setNewGuestCountry] = useState('Nigeria');
  const [newGuestIdType, setNewGuestIdType] = useState<GuestRecord['idType']>('NIN');
  const [newGuestIdNumber, setNewGuestIdNumber] = useState('');
  const [newGuestVip, setNewGuestVip] = useState<GuestRecord['vipTier']>('Standard');

  // Guest Profile Page state
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [editingGuestMode, setEditingGuestMode] = useState(false);
  const [editGuestFirstName, setEditGuestFirstName] = useState('');
  const [editGuestLastName, setEditGuestLastName] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [editGuestEmail, setEditGuestEmail] = useState('');
  const [editGuestAddress, setEditGuestAddress] = useState('');
  const [editGuestCity, setEditGuestCity] = useState('');
  const [editGuestState, setEditGuestState] = useState('');
  const [editGuestNationality, setEditGuestNationality] = useState('');
  const [editGuestIdType, setEditGuestIdType] = useState<GuestRecord['idType']>('NIN');
  const [editGuestIdNumber, setEditGuestIdNumber] = useState('');
  const [editGuestVip, setEditGuestVip] = useState<GuestRecord['vipTier']>('Standard');
  const [editGuestNotes, setEditGuestNotes] = useState('');

  // Quick Action Modals: Check-In, Change Room, Cancel Confirm & Checkout Settlement
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationRecord | null>(null);
  const [cancelMode, setCancelMode] = useState<'free' | 'paid'>('free');
  const [cancelFeeNgn, setCancelFeeNgn] = useState<number>(0);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPayMethod, setCancelPayMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [collectCancelFeeNow, setCollectCancelFeeNow] = useState(true);
  const [changeRoomTarget, setChangeRoomTarget] = useState<ReservationRecord | null>(null);
  const [changeRoomNewId, setChangeRoomNewId] = useState('');
  const [changeRoomAdjustRate, setChangeRoomAdjustRate] = useState(true);
  const [changeRoomReason, setChangeRoomReason] = useState('');
  const [changeRoomError, setChangeRoomError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<ReservationRecord | null>(null);
  const [confirmAllBillsSettled, setConfirmAllBillsSettled] = useState(false);
  const [refundCautionOnCheckout, setRefundCautionOnCheckout] = useState(false);
  const [settlementMethod, setSettlementMethod] =
    useState<ReservationRecord['paymentMethod']>('Card POS');
  const [lateCheckoutTime, setLateCheckoutTime] = useState('14:00');
  const [lateCheckoutFeeDraft, setLateCheckoutFeeDraft] = useState<number>(0);
  const [receiptModalState, setReceiptModalState] = useState<{
    reservation: ReservationRecord;
    mode: PaymentReceiptMode;
    amountJustPaidNgn?: number;
    settlementMethodOverride?: string;
  } | null>(null);

  // Reservation Details, Folio & Editor Page state
  const [folioPayAmount, setFolioPayAmount] = useState<number>(0);
  const [folioPayMethod, setFolioPayMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [miscChargeAmount, setMiscChargeAmount] = useState<number>(5000);
  const [miscChargeDesc, setMiscChargeDesc] = useState('Laundry / Minibar Charge');
  const [editingStayDetails, setEditingStayDetails] = useState(false);
  const [editGuestFirstNameRes, setEditGuestFirstNameRes] = useState('');
  const [editGuestLastNameRes, setEditGuestLastNameRes] = useState('');
  const [editGuestPhoneRes, setEditGuestPhoneRes] = useState('');
  const [editGuestEmailRes, setEditGuestEmailRes] = useState('');
  const [editGuestAddressRes, setEditGuestAddressRes] = useState('');
  const [editGuestCityRes, setEditGuestCityRes] = useState('');
  const [editGuestStateRes, setEditGuestStateRes] = useState('');
  const [editGuestCountryRes, setEditGuestCountryRes] = useState('');
  const [editIdTypeRes, setEditIdTypeRes] = useState<GuestRecord['idType']>('NIN');
  const [editIdNumberRes, setEditIdNumberRes] = useState('');
  const [editIdExpiryDateRes, setEditIdExpiryDateRes] = useState('');
  const [editRatePlanRes, setEditRatePlanRes] = useState('Standard Rate');
  const [editSpecialRequestsRes, setEditSpecialRequestsRes] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editRequestedRoomType, setEditRequestedRoomType] = useState('Studio');
  const [editCheckInDate, setEditCheckInDate] = useState('');
  const [editCheckOutDate, setEditCheckOutDate] = useState('');
  const [editAdults, setEditAdults] = useState(1);
  const [editChildren, setEditChildren] = useState(0);
  const [editChannel, setEditChannel] = useState<ReservationRecord['channel']>('Website');
  const [editStatus, setEditStatus] = useState<ReservationRecord['status']>('confirmed');
  const [editPaymentMethodRes, setEditPaymentMethodRes] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [editSourceCurrency, setEditSourceCurrency] = useState<ChannelCurrency>('NGN');
  const [editFxRateInput, setEditFxRateInput] = useState<string>('1');
  const [editSourceNightlyRateInput, setEditSourceNightlyRateInput] = useState<string>('0');
  const [editOtaPaidSourceInput, setEditOtaPaidSourceInput] = useState<string>('0');
  const [editExpectedPayoutInput, setEditExpectedPayoutInput] = useState<string>('0');
  const [editHotelPaidInput, setEditHotelPaidInput] = useState<string>('0');
  const [editCollectionMode, setEditCollectionMode] =
    useState<OtaPaymentCollectionMode>('hotel_collect');
  const [editOtaPayoutStatus, setEditOtaPayoutStatus] = useState<OtaPayoutStatus>('pending');
  const [editActualPayoutInput, setEditActualPayoutInput] = useState<string>('0');
  const [editAmountDueInput, setEditAmountDueInput] = useState<string>('0');
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatusLabel>('Unpaid');
  const [editCautionEnabled, setEditCautionEnabled] = useState(false);
  const [editCautionAmountInput, setEditCautionAmountInput] = useState<string>('0');
  const [editCautionCollectedInput, setEditCautionCollectedInput] = useState<string>('0');
  const [editCautionRefunded, setEditCautionRefunded] = useState(false);
  const [editStayError, setEditStayError] = useState<string | null>(null);
  const [paymentModalResId, setPaymentModalResId] = useState<string | null>(null);

  const selectedRoomDetail = selectedRoomDetailId
    ? rooms.find((r) => r.id === selectedRoomDetailId) || null
    : null;

  const activeFolioReservation = selectedReservationId
    ? reservations.find((r) => r.id === selectedReservationId) || null
    : null;

  const selectedGuest = selectedGuestId
    ? guests.find((g) => g.id === selectedGuestId) || null
    : null;

  useEffect(() => {
    setEditingRoom(null);
    setShowAddRoomModal(false);
    setSelectedRoomDetailId(null);
    setShowBookingForm(false);
    setShowGuestForm(false);
    setSelectedGuestId(null);
  }, [section]);

  useEffect(() => {
    if (section === 'rooms' && initialRoomDetailId) {
      const target = rooms.find((r) => r.id === initialRoomDetailId);
      if (target) {
        setSelectedRoomDetailId(target.id);
        onConsumeRoomDetailId?.();
      }
    }
  }, [section, initialRoomDetailId, rooms]);

  useEffect(() => {
    if (section === 'reservations' && prefillBookingRoomId && rooms.length > 0) {
      const target = rooms.find((r) => r.id === prefillBookingRoomId);
      if (target) {
        const targetAvail = checkRoomDateRangeAvailability({
          room: target,
          checkInDate,
          checkOutDate,
          reservations,
          blockedDates,
        });
        const nextRoom = targetAvail.available
          ? target
          : sortRoomsByNumber(rooms).find(
              (r) =>
                r.roomType === target.roomType &&
                checkRoomDateRangeAvailability({
                  room: r,
                  checkInDate,
                  checkOutDate,
                  reservations,
                  blockedDates,
                }).available
            );
        setSelectedRoomId(nextRoom ? nextRoom.id : '');
        setNewRequestedRoomType(target.roomType);
        const rateNgn = (nextRoom || target).nightlyRateNgn;
        const formatted = formatPriceInputWithCommas(rateNgn);
        setBookingNightlyRateInput(formatted);
        setBookingExpectedPayoutManual(false);
        setBookingExpectedPayoutInput(formatted);
        setBookingHotelPaidInput(formatted);
        setShowBookingForm(true);
        onConsumePrefillBookingRoomId?.();
      }
    }
  }, [section, prefillBookingRoomId, rooms]);

  useEffect(() => {
    if (section === 'reservations' && prefillBookingGuest) {
      const [gFirst, gLast] = splitFullName(prefillBookingGuest.fullName || '');
      setGuestFirstName(gFirst);
      setGuestLastName(gLast);
      setGuestPhone(prefillBookingGuest.phone || '+234 ');
      setGuestEmail(prefillBookingGuest.email || '');
      setGuestAddress(prefillBookingGuest.address || '');
      setGuestCity(prefillBookingGuest.city || 'Enugu');
      setGuestState(prefillBookingGuest.state || 'Enugu');
      setGuestCountry(prefillBookingGuest.country || prefillBookingGuest.nationality || 'Nigeria');
      setInlineIdType(prefillBookingGuest.idType || 'NIN');
      setInlineIdNumber(prefillBookingGuest.idNumber || '');
      // Ensure an actually available room is selected for the active stay dates
      const sorted = sortRoomsByNumber(rooms);
      const currentRoom = sorted.find((r) => r.id === selectedRoomId);
      const currentAvail = currentRoom
        ? checkRoomDateRangeAvailability({
            room: currentRoom,
            checkInDate,
            checkOutDate,
            reservations,
            blockedDates,
          })
        : null;
      if (!currentAvail?.available) {
        const firstOpen = sorted.find(
          (r) =>
            checkRoomDateRangeAvailability({
              room: r,
              checkInDate,
              checkOutDate,
              reservations,
              blockedDates,
            }).available
        );
        if (firstOpen) {
          setSelectedRoomId(firstOpen.id);
          setNewRequestedRoomType(firstOpen.roomType);
          const formatted = formatPriceInputWithCommas(firstOpen.nightlyRateNgn);
          setBookingNightlyRateInput(formatted);
          setBookingExpectedPayoutManual(false);
          setBookingExpectedPayoutInput(formatted);
          setBookingHotelPaidInput(formatted);
        } else {
          setSelectedRoomId('');
        }
      }
      setBookingError(null);
      setShowBookingForm(true);
      onConsumePrefillBookingGuest?.();
    }
  }, [section, prefillBookingGuest]);

  useEffect(() => {
    if (activeFolioReservation) {
      const summary = getReservationPaymentSummary(
        activeFolioReservation,
        property.usdExchangeRateNgn
      );
      setFolioPayAmount(summary.balance);
      setFolioPayMethod(activeFolioReservation.paymentMethod || 'Bank Transfer');
      setLateCheckoutTime(activeFolioReservation.checkOutTime || '14:00');
      setLateCheckoutFeeDraft(activeFolioReservation.lateCheckoutFeeNgn || 0);
      setEditingStayDetails(initialReservationIntent === 'edit');
      const [stayFirst, stayLast] = splitFullName(activeFolioReservation.guestName);
      const matchedGuestProfile =
        guests.find((g) => g.id === activeFolioReservation.guestId) ||
        guests.find(
          (g) => g.fullName.toLowerCase() === activeFolioReservation.guestName.toLowerCase()
        );
      setEditGuestFirstNameRes(stayFirst);
      setEditGuestLastNameRes(stayLast);
      setEditGuestPhoneRes(
        activeFolioReservation.guestPhone || matchedGuestProfile?.phone || ''
      );
      setEditGuestEmailRes(
        activeFolioReservation.guestEmail || matchedGuestProfile?.email || ''
      );
      setEditGuestAddressRes(
        activeFolioReservation.guestAddress || matchedGuestProfile?.address || ''
      );
      setEditGuestCityRes(
        activeFolioReservation.guestCity || matchedGuestProfile?.city || ''
      );
      setEditGuestStateRes(
        activeFolioReservation.guestState || matchedGuestProfile?.state || ''
      );
      setEditGuestCountryRes(
        activeFolioReservation.guestCountry || matchedGuestProfile?.country || matchedGuestProfile?.nationality || ''
      );
      setEditIdTypeRes(
        activeFolioReservation.idType || matchedGuestProfile?.idType || 'NIN'
      );
      setEditIdNumberRes(
        activeFolioReservation.idNumber || matchedGuestProfile?.idNumber || ''
      );
      setEditIdExpiryDateRes(
        activeFolioReservation.idExpiryDate || matchedGuestProfile?.idExpiryDate || ''
      );
      setEditRatePlanRes(activeFolioReservation.ratePlan || 'Standard Rate');
      setEditSpecialRequestsRes(activeFolioReservation.specialRequests || '');
      setEditRoomId(activeFolioReservation.roomId || '');
      setEditRequestedRoomType(
        getReservationRoomDisplay(activeFolioReservation, rooms).roomTypeLabel
      );
      setEditCheckInDate(activeFolioReservation.checkInDate);
      setEditCheckOutDate(activeFolioReservation.checkOutDate);
      setEditAdults(activeFolioReservation.adults || 1);
      setEditChildren(activeFolioReservation.children || 0);
      setEditChannel(activeFolioReservation.channel);
      setEditStatus(activeFolioReservation.status);
      setEditPaymentMethodRes(activeFolioReservation.paymentMethod || 'Bank Transfer');
      setEditSourceCurrency(summary.sourceCurrency);
      setEditFxRateInput(formatPriceInputWithCommas(summary.fxRateToNgn));
      setEditSourceNightlyRateInput(
        summary.sourceCurrency === 'NGN'
          ? formatPriceInputWithCommas(activeFolioReservation.nightlyRateNgn)
          : String(
              summary.sourceNightlyRate > 0
                ? summary.sourceNightlyRate
                : Number(
                    (
                      summary.sourceTotalAmount /
                      Math.max(1, activeFolioReservation.nights)
                    ).toFixed(2)
                  )
            )
      );
      setEditOtaPaidSourceInput(
        summary.otaPaidSourceAmount > 0 ? String(summary.otaPaidSourceAmount) : ''
      );
      setEditExpectedPayoutInput(formatPriceInputWithCommas(summary.expectedPayoutNgn));
      setEditHotelPaidInput(formatPriceInputWithCommas(summary.hotelPaidAmount));
      setEditCollectionMode(summary.paymentCollectionMode);
      setEditOtaPayoutStatus(
        summary.otaPayoutStatus === 'received' ? 'received' : 'pending'
      );
      setEditActualPayoutInput(
        formatPriceInputWithCommas(summary.actualPayoutReceivedNgn)
      );
      setEditAmountDueInput(
        formatPriceInputWithCommas(summary.amountDueAtPropertyNgn)
      );
      setEditPaymentStatus(summary.paymentStatus);
      setEditCautionEnabled(summary.cautionDepositEnabled);
      setEditCautionAmountInput(
        summary.cautionDepositNgn > 0
          ? formatPriceInputWithCommas(summary.cautionDepositNgn)
          : '20,000'
      );
      setEditCautionCollectedInput(
        summary.cautionDepositCollectedNgn > 0
          ? formatPriceInputWithCommas(summary.cautionDepositCollectedNgn)
          : '0'
      );
      setEditCautionRefunded(summary.cautionDepositRefunded);
      setEditStayError(null);
      if (initialReservationIntent === 'edit') {
        onConsumeIntent?.();
      }
    }
  }, [activeFolioReservation?.id, initialReservationIntent]);

  useEffect(() => {
    if (checkoutTarget) {
      setLateCheckoutTime(checkoutTarget.checkOutTime || '14:00');
      setLateCheckoutFeeDraft(checkoutTarget.lateCheckoutFeeNgn || 0);
      setConfirmAllBillsSettled(false);
      setRefundCautionOnCheckout(
        Boolean(
          checkoutTarget.cautionDepositEnabled &&
            (checkoutTarget.cautionDepositCollectedNgn || 0) > 0 &&
            !checkoutTarget.cautionDepositRefunded
        )
      );
    }
  }, [checkoutTarget?.id]);

  useEffect(() => {
    setActionError(null);
    setBookingError(null);
  }, [section]);

  const sortedRooms = sortRoomsByNumber(rooms);
  const bookableRooms = sortedRooms.filter((r) => r.occupancyStatus === 'vacant');
  const uniqueRoomTypes = Array.from(
    new Set(['Studio', 'One Bedroom Suite', ...sortedRooms.map((r) => r.roomType)])
  );

  const walkInEligibleRooms = sortedRooms.filter((r) => {
    if (r.occupancyStatus === 'out_of_order') return false;
    if (walkInRoomTypeFilter !== 'ALL' && r.roomType !== walkInRoomTypeFilter) return false;
    return true;
  });

  useEffect(() => {
    if (!roomDefaultInitRef.current && rooms.length > 0) {
      roomDefaultInitRef.current = true;
      const sorted = sortRoomsByNumber(rooms);
      const firstAvailable = sorted.find(
        (r) =>
          checkRoomDateRangeAvailability({
            room: r,
            checkInDate,
            checkOutDate,
            reservations,
            blockedDates,
          }).available
      );
      const fallbackRoom = sorted.find((r) => r.occupancyStatus === 'vacant') || sorted[0];
      if (firstAvailable) {
        setSelectedRoomId(firstAvailable.id);
        setNewRequestedRoomType(firstAvailable.roomType);
        const formatted = formatPriceInputWithCommas(firstAvailable.nightlyRateNgn);
        setBookingNightlyRateInput(formatted);
        setBookingExpectedPayoutInput(formatted);
        setBookingHotelPaidInput(formatted);
      } else if (fallbackRoom) {
        setSelectedRoomId('');
        setNewRequestedRoomType(fallbackRoom.roomType);
        const formatted = formatPriceInputWithCommas(fallbackRoom.nightlyRateNgn);
        setBookingNightlyRateInput(formatted);
        setBookingExpectedPayoutInput(formatted);
        setBookingHotelPaidInput(formatted);
      }
    }
  }, [rooms, reservations, blockedDates]);

  useEffect(() => {
    if (walkInEligibleRooms.length > 0) {
      const currentRoom = walkInEligibleRooms.find((r) => r.id === walkInRoomId);
      const currentAvailable = currentRoom
        ? checkRoomDateRangeAvailability({
            room: currentRoom,
            checkInDate: todayIso,
            checkOutDate: walkInCheckOut,
            reservations,
            blockedDates,
          }).available
        : false;
      if (!currentRoom || !currentAvailable) {
        const preferred =
          walkInEligibleRooms.find(
            (r) =>
              checkRoomDateRangeAvailability({
                room: r,
                checkInDate: todayIso,
                checkOutDate: walkInCheckOut,
                reservations,
                blockedDates,
              }).available
          ) ||
          walkInEligibleRooms.find((r) => r.occupancyStatus === 'vacant') ||
          walkInEligibleRooms[0];
        if (preferred) {
          setWalkInRoomId(preferred.id);
          setWalkInRateNgn(preferred.nightlyRateNgn);
          setWalkInDepositNgn(preferred.nightlyRateNgn * diffNights(todayIso, walkInCheckOut));
        }
      }
    }
  }, [walkInRoomTypeFilter, rooms.length, walkInCheckOut, reservations.length, blockedDates.length]);

  const openGuestProfileModal = (guest: GuestRecord) => {
    setSelectedGuestId(guest.id);
    setEditingGuestMode(false);
    const [gFirst, gLast] = splitFullName(guest.fullName);
    setEditGuestFirstName(gFirst);
    setEditGuestLastName(gLast);
    setEditGuestPhone(guest.phone);
    setEditGuestEmail(guest.email || '');
    setEditGuestAddress(guest.address || '');
    setEditGuestCity(guest.city || '');
    setEditGuestState(guest.state || '');
    setEditGuestNationality(guest.country || guest.nationality || 'Nigeria');
    setEditGuestIdType(guest.idType);
    setEditGuestIdNumber(guest.idNumber || '');
    setEditGuestVip(guest.vipTier);
    setEditGuestNotes(guest.notes || '');
  };

  const openGuestByReservation = (res: ReservationRecord) => {
    const matched =
      guests.find((g) => g.id === res.guestId) ||
      guests.find((g) => g.fullName.toLowerCase() === res.guestName.toLowerCase());
    if (matched) {
      openGuestProfileModal(matched);
    } else {
      onNotify(`No saved directory profile found for ${res.guestName}`);
    }
  };

  const openRoomEditor = (room: RoomRecord) => {
    setEditingRoom(room);
    setDraftRoomNumber(room.roomNumber);
    setDraftRoomType(room.roomType);
    setDraftSection(getRoomSection(room));
    setDraftRateInput(formatPriceInputWithCommas(room.nightlyRateNgn));
    setDraftMaxGuests(room.maxGuests);
    setDraftOccupancy(room.occupancyStatus);
    setDraftAmenitiesText((room.amenities || []).join(', '));
    const cover = resolveAppImageUrl(room.imageUrl, DEFAULT_SUITE_IMAGE);
    setDraftImageUrl(cover);
    const initialSlides = resolveGalleryImageUrls(
      getRoomGalleryImages(room).map((s) => s.url),
      cover
    );
    setDraftGalleryImages(initialSlides.length > 0 ? initialSlides : [cover]);
    setUploadError(null);
    setEditRoomError(null);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const uploadedUrl = await uploadAppMediaImage(file, {
        propertyId: property.id,
        folder: 'rooms',
        slug: `${draftRoomNumber || editingRoom?.roomNumber || 'room'}-cover`,
        maxWidth: 720,
        maxBytes: 120000,
      });
      setDraftImageUrl(uploadedUrl);
      setDraftGalleryImages((prev) => Array.from(new Set([uploadedUrl, ...prev])).slice(0, 6));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to process image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleGallerySlideFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (draftGalleryImages.length >= 6) {
      setUploadError('Maximum of 6 gallery slides per room reached. Remove a slide first.');
      e.target.value = '';
      return;
    }
    try {
      const uploadedUrl = await uploadAppMediaImage(file, {
        propertyId: property.id,
        folder: 'rooms',
        slug: `${draftRoomNumber || editingRoom?.roomNumber || 'room'}-slide`,
        maxWidth: 680,
        maxBytes: 110000,
      });
      setDraftGalleryImages((prev) => Array.from(new Set([...prev, uploadedUrl])).slice(0, 6));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to process gallery slide.');
    } finally {
      e.target.value = '';
    }
  };

  const toggleDraftGalleryAsset = (assetUrl: string) => {
    setUploadError(null);
    setDraftGalleryImages((prev) => {
      if (prev.includes(assetUrl)) {
        const next = prev.filter((u) => u !== assetUrl);
        if (draftImageUrl === assetUrl && next.length > 0) {
          setDraftImageUrl(next[0]);
        }
        return next;
      }
      if (prev.length >= 6) {
        setUploadError('Maximum of 6 gallery slides per room reached. Remove a slide first.');
        return prev;
      }
      if (!draftImageUrl) {
        setDraftImageUrl(assetUrl);
      }
      return [...prev, assetUrl];
    });
  };

  const removeDraftGallerySlide = (slideUrl: string) => {
    setDraftGalleryImages((prev) => {
      const next = prev.filter((u) => u !== slideUrl);
      if (draftImageUrl === slideUrl) {
        setDraftImageUrl(next[0] || DEFAULT_SUITE_IMAGE);
      }
      return next;
    });
  };

  const promoteDraftSlideToCover = (slideUrl: string) => {
    setDraftImageUrl(slideUrl);
    setDraftGalleryImages((prev) => [slideUrl, ...prev.filter((u) => u !== slideUrl)].slice(0, 6));
  };

  const handleSaveRoomEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || !canManageRooms) return;
    setEditRoomError(null);
    const parsedRate = parseFormattedPriceInput(draftRateInput);
    if (parsedRate === null || parsedRate < 1000) {
      setEditRoomError('Enter a valid nightly rate of at least ₦1,000.');
      return;
    }
    const cleanRate = Number(parsedRate);
    setBusyId(editingRoom.id);
    try {
      const parsedAmenities = Array.from(
        new Set(
          draftAmenitiesText
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ).slice(0, 15);
      if (isLegacyOrAiStudioImageUrl(draftImageUrl)) {
        setEditRoomError(
          'External Google / AI Studio links are not permitted. Upload a room photo or select one from the property media gallery.'
        );
        setBusyId(null);
        return;
      }
      const coverUrl = resolveAppImageUrl(
        draftImageUrl.trim() || draftGalleryImages[0],
        DEFAULT_SUITE_IMAGE
      );
      const cleanGallery = resolveGalleryImageUrls(
        [coverUrl, ...draftGalleryImages.map((u) => u.trim()).filter(Boolean)],
        coverUrl
      ).slice(0, 6);
      const cleanRoomNumber = draftRoomNumber.trim() || editingRoom.roomNumber;
      const cleanRoomType = draftRoomType.trim() || editingRoom.roomType;
      const derivedRoomName = `${cleanRoomNumber} ${cleanRoomType}`.slice(0, 80);
      await updateRoomStatus({
        property,
        room: editingRoom,
        updates: {
          roomNumber: cleanRoomNumber,
          name: derivedRoomName,
          roomType: cleanRoomType,
          section: draftSection,
          nightlyRateNgn: cleanRate,
          maxGuests: Math.max(1, draftMaxGuests),
          occupancyStatus: draftOccupancy,
          amenities: parsedAmenities,
          imageUrl: coverUrl,
          galleryImages: cleanGallery,
        },
        actorRole,
      });
      onNotify(`Saved changes for ${draftRoomNumber.trim() || editingRoom.roomNumber}`);
      setEditingRoom(null);
    } catch (err) {
      setEditRoomError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const openAddRoomModal = () => {
    const nextNum = rooms.length + 1;
    setNewRoomNumber(`RM-${nextNum}`);
    setNewRoomType('Deluxe Studio with Kitchenette');
    setNewRoomSection('Hotel Rooms');
    setNewRoomFloor(2);
    setNewRoomRateInput('65,500');
    setNewRoomMaxGuests(2);
    setNewRoomAmenitiesText('King Bed, Wi-Fi, Smart TV, 24/7 Power');
    const defaultCover =
      RICHGATES_GALLERY_ASSETS[nextNum % RICHGATES_GALLERY_ASSETS.length]?.url || DEFAULT_SUITE_IMAGE;
    const starterSlides = Array.from(
      new Set([
        defaultCover,
        ...RICHGATES_GALLERY_ASSETS.slice(0, 4).map((a) => a.url),
      ])
    ).slice(0, 4);
    setNewRoomImageUrl(defaultCover);
    setNewRoomGalleryImages(starterSlides);
    setAddRoomError(null);
    setEditingRoom(null);
    setSelectedRoomDetailId(null);
    setShowAddRoomModal(true);
  };

  const handleAddRoomImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAddRoomError(null);
    try {
      const uploadedUrl = await uploadAppMediaImage(file, {
        propertyId: property.id,
        folder: 'rooms',
        slug: `${newRoomNumber || 'new-room'}-cover`,
        maxWidth: 720,
        maxBytes: 120000,
      });
      setNewRoomImageUrl(uploadedUrl);
      setNewRoomGalleryImages((prev) => Array.from(new Set([uploadedUrl, ...prev])).slice(0, 6));
    } catch (err) {
      setAddRoomError(err instanceof Error ? err.message : 'Unable to process room photo.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddRoomGallerySlideSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAddRoomError(null);
    if (newRoomGalleryImages.length >= 6) {
      setAddRoomError('Maximum of 6 gallery slides per room reached. Remove a slide first.');
      e.target.value = '';
      return;
    }
    try {
      const uploadedUrl = await uploadAppMediaImage(file, {
        propertyId: property.id,
        folder: 'rooms',
        slug: `${newRoomNumber || 'new-room'}-slide`,
        maxWidth: 680,
        maxBytes: 110000,
      });
      setNewRoomGalleryImages((prev) => Array.from(new Set([...prev, uploadedUrl])).slice(0, 6));
    } catch (err) {
      setAddRoomError(err instanceof Error ? err.message : 'Unable to process gallery slide.');
    } finally {
      e.target.value = '';
    }
  };

  const toggleNewRoomGalleryAsset = (assetUrl: string) => {
    setAddRoomError(null);
    setNewRoomGalleryImages((prev) => {
      if (prev.includes(assetUrl)) {
        const next = prev.filter((u) => u !== assetUrl);
        if (newRoomImageUrl === assetUrl && next.length > 0) {
          setNewRoomImageUrl(next[0]);
        }
        return next;
      }
      if (prev.length >= 6) {
        setAddRoomError('Maximum of 6 gallery slides per room reached. Remove a slide first.');
        return prev;
      }
      return [...prev, assetUrl];
    });
  };

  const handleCreateNewRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRooms) return;
    setAddRoomError(null);

    const trimmedCode = newRoomNumber.trim().toUpperCase();
    const trimmedType = newRoomType.trim();
    if (!trimmedCode || !trimmedType) {
      setAddRoomError('Room code and room type are required.');
      return;
    }
    const parsedNewRate = parseFormattedPriceInput(newRoomRateInput);
    if (parsedNewRate === null || parsedNewRate < 1000) {
      setAddRoomError('Enter a valid nightly rate of at least ₦1,000.');
      return;
    }
    if (rooms.some((r) => r.roomNumber.toUpperCase() === trimmedCode)) {
      setAddRoomError(`Room ${trimmedCode} already exists in ${property.name}.`);
      return;
    }
    if (atRoomCapacity) {
      setAddRoomError(
        `License room limit reached (${rooms.length}/${effectiveMaxRooms}). ${property.name} is capped at ${effectiveMaxRooms} rooms.`
      );
      return;
    }

    setBusyId('add-room');
    try {
      if (isLegacyOrAiStudioImageUrl(newRoomImageUrl)) {
        setAddRoomError(
          'External Google / AI Studio links are not permitted. Upload a room photo or select one from the property media gallery.'
        );
        setBusyId(null);
        return;
      }
      const coverUrl = resolveAppImageUrl(
        newRoomImageUrl || newRoomGalleryImages[0],
        DEFAULT_SUITE_IMAGE
      );
      const cleanGallery = resolveGalleryImageUrls(
        [coverUrl, ...newRoomGalleryImages.map((u) => u.trim()).filter(Boolean)],
        coverUrl
      ).slice(0, 6);
      const derivedRoomName = `${trimmedCode} ${trimmedType}`.slice(0, 80);
      await createRoomWorkflow({
        property,
        currentRoomCount: rooms.length,
        maxRooms: effectiveMaxRooms,
        roomNumber: trimmedCode,
        name: derivedRoomName,
        roomType: trimmedType,
        section: newRoomSection,
        floor: newRoomFloor,
        nightlyRateNgn: Number(parsedNewRate),
        maxGuests: newRoomMaxGuests,
        imageUrl: coverUrl,
        galleryImages: cleanGallery,
        amenities: newRoomAmenitiesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        actorRole,
      });
      onNotify(`Added new room ${trimmedCode} (${trimmedType}) to ${property.name}`);
      setShowAddRoomModal(false);
    } catch (err) {
      setAddRoomError(err instanceof Error ? err.message : 'Unable to add room.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError(null);
    const targetRoom = selectedRoomId
      ? rooms.find((r) => r.id === selectedRoomId)
      : undefined;
    const combinedBookingGuest = `${guestFirstName.trim()} ${guestLastName.trim()}`.trim();
    if (!guestFirstName.trim() || !guestLastName.trim()) {
      setBookingError('Guest first name and last name are required.');
      return;
    }

    if (selectedRoomId && !targetRoom) {
      setBookingError('Selected room could not be found. Choose a room or Unassigned.');
      return;
    }

    const availabilityCheck = checkRoomDateRangeAvailability({
      room: targetRoom,
      roomType: targetRoom ? targetRoom.roomType : newRequestedRoomType,
      rooms,
      checkInDate,
      checkOutDate,
      reservations,
      blockedDates,
    });
    if (!availabilityCheck.available) {
      setBookingError(availabilityCheck.message);
      return;
    }

    const trimmedGuest = combinedBookingGuest;
    const resolvedRoomType = targetRoom ? targetRoom.roomType : newRequestedRoomType;
    const fallbackNightlyRate =
      rooms.find((r) => r.roomType === resolvedRoomType)?.nightlyRateNgn || 55000;
    const baseRoomRateNgn = targetRoom?.nightlyRateNgn ?? fallbackNightlyRate;
    const safeNightsVal = Math.max(1, nights);
    const isOtaSource = isOtaBookingChannel(channel);
    const activeCurrency: ChannelCurrency = isOtaSource ? bookingCurrency : 'NGN';
    const fxRateToNgn =
      activeCurrency === 'NGN'
        ? 1
        : Math.max(
            1,
            parseFormattedPriceInput(bookingFxRateInput) ??
              getFxRateToNgn(activeCurrency, property.usdExchangeRateNgn)
          );

    const parsedOtaPaidSource = isOtaSource
      ? Math.max(0, parseFormattedPriceInput(bookingOtaPaidSourceInput) ?? 0)
      : 0;
    const otaPaidNgnVal = isOtaSource
      ? activeCurrency === 'NGN'
        ? Math.round(parsedOtaPaidSource)
        : Math.round(parsedOtaPaidSource * fxRateToNgn)
      : 0;

    const parsedInputNightly = parseFormattedPriceInput(bookingNightlyRateInput);
    const resolvedSourceNightlyRate =
      activeCurrency === 'NGN'
        ? Math.max(0, Math.round(parsedInputNightly ?? baseRoomRateNgn))
        : Number(
            Math.max(
              0,
              parsedInputNightly ?? baseRoomRateNgn / Math.max(1, fxRateToNgn)
            ).toFixed(2)
          );
    const resolvedSourceTotal =
      resolvedSourceNightlyRate > 0
        ? Number((resolvedSourceNightlyRate * safeNightsVal).toFixed(2))
        : parsedOtaPaidSource;

    const defaultExpectedPayoutNgn =
      otaPaidNgnVal > 0
        ? otaPaidNgnVal
        : activeCurrency === 'NGN'
          ? Math.round(resolvedSourceTotal)
          : Math.round(resolvedSourceTotal * fxRateToNgn);
    const expectedPayoutNgnVal = isOtaSource
      ? Math.max(
          0,
          Math.round(parseFormattedPriceInput(bookingExpectedPayoutInput) ?? defaultExpectedPayoutNgn)
        )
      : Math.round(resolvedSourceTotal);

    const hotelPaidNgnVal = Math.max(
      0,
      Math.round(parseFormattedPriceInput(bookingHotelPaidInput) ?? 0)
    );

    const effectiveNightlyRateNgn =
      isOtaSource && expectedPayoutNgnVal > 0
        ? Math.round(expectedPayoutNgnVal / safeNightsVal)
        : activeCurrency === 'NGN'
          ? Math.round(resolvedSourceNightlyRate)
          : Math.round(resolvedSourceNightlyRate * fxRateToNgn);

    const assignedLabel = targetRoom
      ? targetRoom.roomNumber
      : `Unassigned (${resolvedRoomType})`;

    const cautionFeeNgnVal = cautionDepositEnabled
      ? Math.max(0, Math.round(parseFormattedPriceInput(cautionDepositAmountInput) ?? 0))
      : 0;
    const cautionCollectedNgnVal = cautionDepositEnabled
      ? Math.max(0, Math.round(parseFormattedPriceInput(cautionDepositCollectedInput) ?? 0))
      : 0;
    const estChargesNgn = expectedPayoutNgnVal;
    const effectiveCollectionMode: OtaPaymentCollectionMode = isOtaSource
      ? bookingCollectionMode
      : 'hotel_collect';
    const isCollectedByOtaMode = isOtaSource && effectiveCollectionMode === 'ota_prepaid';
    const estBalanceNgn = bookingAmountDueManual
      ? Math.max(0, Math.round(parseFormattedPriceInput(bookingAmountDueInput) ?? 0))
      : isCollectedByOtaMode
        ? 0
        : Math.max(0, estChargesNgn - hotelPaidNgnVal);
    const rawComputedPayStatus: PaymentStatusLabel = bookingPaymentStatusManual
      ? bookingPaymentStatus
      : isCollectedByOtaMode
        ? 'Paid to OTA'
        : estBalanceNgn <= 0 && (estChargesNgn > 0 || hotelPaidNgnVal > 0)
          ? 'Paid'
          : hotelPaidNgnVal > 0
            ? 'Partial'
            : 'Unpaid';
    const computedPayStatus: PaymentStatusLabel =
      !isOtaSource && rawComputedPayStatus === 'Paid to OTA' ? 'Paid' : rawComputedPayStatus;
    const actualPayoutReceivedVal =
      isCollectedByOtaMode && bookingOtaPayoutStatus === 'received'
        ? Math.max(
            0,
            Math.round(parseFormattedPriceInput(bookingActualPayoutInput) ?? expectedPayoutNgnVal)
          )
        : 0;

    setBusyId('booking');
    try {
      const created = await createReservationWorkflow({
        property,
        room: targetRoom,
        requestedRoomType: resolvedRoomType,
        nightlyRateNgn: effectiveNightlyRateNgn,
        guestName: trimmedGuest,
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim(),
        guestAddress: guestAddress.trim(),
        guestCity: guestCity.trim(),
        guestState: guestState.trim(),
        guestCountry: guestCountry.trim() || 'Nigeria',
        guestIdType: inlineIdType,
        guestIdNumber: inlineIdNumber.trim(),
        guestIdExpiryDate: inlineIdExpiryDate.trim(),
        ratePlan: bookingRatePlan,
        specialRequests: bookingSpecialRequests.trim(),
        checkInDate,
        checkOutDate,
        bookedDate: todayIso,
        nights: safeNightsVal,
        adults: Math.max(1, adults),
        children: Math.max(0, childrenCount),
        channel,
        paymentMethod:
          !isOtaSource && paymentMethod === 'OTA Platform Payout'
            ? 'Bank Transfer'
            : paymentMethod,
        paymentStatus: computedPayStatus,
        depositNgn: hotelPaidNgnVal,
        sourceCurrency: activeCurrency,
        sourceNightlyRate: resolvedSourceNightlyRate,
        sourceTotalAmount: resolvedSourceTotal,
        fxRateToNgn,
        paymentCollectionMode: effectiveCollectionMode,
        otaPaidSourceAmount: isCollectedByOtaMode ? parsedOtaPaidSource : 0,
        otaPaidNgn: isCollectedByOtaMode ? otaPaidNgnVal : 0,
        expectedPayoutNgn: expectedPayoutNgnVal,
        otaPayoutStatus: isCollectedByOtaMode ? bookingOtaPayoutStatus : 'pending',
        actualPayoutReceivedNgn: actualPayoutReceivedVal,
        amountDueAtPropertyNgn: estBalanceNgn,
        paymentManuallyEdited: true,
        hotelPaidNgn: hotelPaidNgnVal,
        cautionDepositEnabled,
        cautionDepositNgn: cautionFeeNgnVal,
        cautionDepositCollectedNgn: cautionCollectedNgnVal,
        cautionDepositRefunded: cautionDepositEnabled && cautionDepositRefunded,
        immediateCheckIn: false,
        initialStatus: initialBookingStatus,
        paymentConfirmed: isCollectedByOtaMode || hotelPaidNgnVal > 0,
        idVerified: false,
        keyIssued: false,
        actorRole,
      });
      onNotify(
        `Reservation Created Successfully — ${created.bookingRef} for ${trimmedGuest} (${assignedLabel})`
      );
      setCreatedReservationSuccess(created.reservation);
      setShowBookingForm(false);
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      setGuestAddress('');
      setGuestCity('Enugu');
      setGuestState('Enugu');
      setGuestCountry('Nigeria');
      setChildrenCount(0);
      setBookingCurrency('NGN');
      setBookingFxRateInput('1');
      setBookingNightlyRateInput(formatPriceInputWithCommas(baseRoomRateNgn));
      setBookingOtaPaidSourceInput('');
      setBookingExpectedPayoutInput(formatPriceInputWithCommas(baseRoomRateNgn));
      setBookingExpectedPayoutManual(false);
      setBookingCollectionMode('hotel_collect');
      setBookingOtaPayoutStatus('pending');
      setBookingActualPayoutInput('0');
      setBookingAmountDueInput('0');
      setBookingAmountDueManual(false);
      setBookingHotelPaidInput(formatPriceInputWithCommas(baseRoomRateNgn));
      setBookingPaymentStatus('Paid');
      setBookingPaymentStatusManual(false);
      setCautionDepositEnabled(false);
      setCautionDepositAmountInput('20,000');
      setCautionDepositCollectedInput('0');
      setCautionDepositRefunded(false);
      setInlineIdNumber('');
      setInlineIdExpiryDate('');
      setBookingRatePlan('Standard Rate');
      setBookingSpecialRequests('');
      setInlinePayConfirmed(false);
      setInlineIdVerified(false);
      setInlineRoomReady(false);
      setInlineKeyIssued(null);
      setImmediateCheckIn(false);
    } catch (err) {
      setBookingError(
        err instanceof Error ? err.message : 'Unable to save reservation. Please try again.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalkInError(null);
    const fullGuestName = `${walkInFirstName.trim()} ${walkInLastName.trim()}`.trim();
    const targetRoom =
      rooms.find((r) => r.id === walkInRoomId) ||
      walkInEligibleRooms.find((r) => r.occupancyStatus === 'vacant') ||
      walkInEligibleRooms[0];

    if (!fullGuestName) {
      setWalkInError('First name and last name are required.');
      return;
    }
    if (!targetRoom) {
      setWalkInError('Please select an available room.');
      return;
    }
    const walkInAvailability = checkRoomDateRangeAvailability({
      room: targetRoom,
      checkInDate: todayIso,
      checkOutDate: walkInCheckOut,
      reservations,
      blockedDates,
    });
    if (!walkInAvailability.available) {
      setWalkInError(walkInAvailability.message);
      return;
    }

    if (
      !walkInPayConfirmed ||
      !walkInIdVerified ||
      walkInIdNumber.trim().length < 3 ||
      walkInKeyIssued !== 'yes' ||
      !walkInRoomReady
    ) {
      setWalkInError(
        'Check-in requires completing all steps: Confirm Payment, Verify Guest ID, Key Issued = Yes, and Room Ready.'
      );
      return;
    }

    const stayNights = diffNights(todayIso, walkInCheckOut);
    const effectiveRate = Math.max(5000, walkInRateNgn);
    const stayTotalNgn = effectiveRate * stayNights;
    const paidTodayNgn = Math.max(0, walkInDepositNgn);
    const computedPayStatus: PaymentStatusLabel = walkInPaymentStatusManual
      ? walkInPaymentStatus
      : paidTodayNgn >= stayTotalNgn && stayTotalNgn > 0
        ? 'Paid'
        : paidTodayNgn > 0
          ? 'Partial'
          : 'Unpaid';

    setBusyId('walk_in');
    try {
      const createdWalkIn = await createReservationWorkflow({
        property,
        room: { ...targetRoom, nightlyRateNgn: effectiveRate },
        requestedRoomType: targetRoom.roomType,
        guestName: fullGuestName,
        guestPhone: walkInPhone.trim(),
        guestEmail: walkInEmail.trim(),
        guestAddress: walkInAddress.trim(),
        guestCity: walkInCity.trim(),
        guestState: walkInState.trim(),
        guestNationality: walkInCountry.trim() || 'Nigeria',
        guestIdType: walkInIdType,
        guestIdNumber: walkInIdNumber.trim(),
        checkInDate: todayIso,
        checkOutDate: walkInCheckOut,
        nights: stayNights,
        adults: Math.max(1, walkInAdults),
        children: Math.max(0, walkInChildren),
        channel: 'Direct Walk-In',
        paymentMethod: walkInPaymentMethod,
        paymentStatus: computedPayStatus,
        depositNgn: paidTodayNgn,
        hotelPaidNgn: paidTodayNgn,
        cautionDepositEnabled: walkInCautionEnabled,
        cautionDepositNgn: walkInCautionEnabled ? Math.max(0, walkInCautionAmount) : 0,
        cautionDepositCollectedNgn: walkInCautionEnabled ? Math.max(0, walkInCautionCollected) : 0,
        cautionDepositRefunded: false,
        immediateCheckIn: true,
        paymentConfirmed: true,
        idVerified: true,
        keyIssued: true,
        actorRole,
      });
      onNotify(`Verified & checked in ${fullGuestName} to ${targetRoom.roomNumber}`);
      onGuestCheckedIn?.({
        guestName: fullGuestName,
        roomNumber: targetRoom.roomNumber,
        bookingRef: createdWalkIn.bookingRef,
        reservationId: createdWalkIn.id,
      });
      setWalkInFirstName('');
      setWalkInLastName('');
      setWalkInPhone('+234 ');
      setWalkInEmail('');
      setWalkInIdNumber('');
      setWalkInAddress('');
      setWalkInAdults(1);
      setWalkInChildren(0);
      setWalkInPaymentStatus('Paid');
      setWalkInPaymentStatusManual(false);
      setWalkInCautionEnabled(false);
      setWalkInCautionCollected(0);
      setWalkInPayConfirmed(false);
      setWalkInIdVerified(false);
      setWalkInRoomReady(false);
      setWalkInKeyIssued(null);
      onNavigateSection?.('in_house');
    } catch (err) {
      setWalkInError(
        err instanceof Error ? err.message : 'Unable to complete walk-in check-in.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveRate = async (room: RoomRecord) => {
    if (!canManageRooms) return;
    const parsedRate = parseFormattedPriceInput(rateDraftInput);
    if (parsedRate === null || parsedRate < 1000) {
      setActionError('Enter a valid nightly rate of at least ₦1,000.');
      return;
    }
    const cleanRate = Number(parsedRate);
    setActionError(null);
    setBusyId(room.id);
    try {
      await updateRoomStatus({
        property,
        room,
        updates: { nightlyRateNgn: cleanRate },
        actorRole,
      });
      onNotify(`Updated ${room.roomNumber} rate to ${formatNgn(cleanRate)}`);
      setEditingRateRoomId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to update room rate right now.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveStayDetails = async (res: ReservationRecord) => {
    setEditStayError(null);
    if (!editCheckInDate || !editCheckOutDate || editCheckOutDate <= editCheckInDate) {
      setEditStayError('Check-out date must be after check-in date.');
      return;
    }
    const targetRoomId = editRoomId;
    const targetRoom = targetRoomId ? rooms.find((r) => r.id === targetRoomId) : undefined;
    const oldRoom = res.roomId ? rooms.find((r) => r.id === res.roomId) : undefined;

    if (editStatus === 'checked_in' && !targetRoom) {
      setEditStayError('Assign a room before setting status to Checked-in.');
      return;
    }

    if (editStatus === 'checked_in' && res.status !== 'checked_in') {
      const editCheckInGuard = getCheckInDateRestriction(
        {
          channel: isOtaReservation(res) ? res.channel : editChannel,
          checkInDate: editCheckInDate,
          externalUid: res.externalUid,
          paymentCollectionMode: editCollectionMode,
        },
        todayIso
      );
      if (editCheckInGuard.restricted) {
        setEditStayError(editCheckInGuard.message);
        return;
      }
    }

    if (editStatus === 'cancelled' && res.status !== 'cancelled') {
      const editOtaCancelGuard = getOtaCancellationRestriction({
        channel: isOtaReservation(res) ? res.channel : editChannel,
        externalUid: res.externalUid,
        paymentCollectionMode: editCollectionMode,
      });
      if (editOtaCancelGuard.restricted) {
        setEditStayError(editOtaCancelGuard.message);
        return;
      }
    }

    const willOccupyRoom =
      editStatus === 'confirmed' || editStatus === 'pending' || editStatus === 'checked_in';
    if (willOccupyRoom) {
      const editAvail = checkRoomDateRangeAvailability({
        room: targetRoom,
        roomType: targetRoom ? targetRoom.roomType : editRequestedRoomType,
        rooms,
        checkInDate: editCheckInDate,
        checkOutDate: editCheckOutDate,
        reservations,
        blockedDates,
        excludeReservationId: res.id,
      });
      if (!editAvail.available) {
        setEditStayError(editAvail.message);
        return;
      }
    }

    const updatedNights = diffNights(editCheckInDate, editCheckOutDate);
    const isEditOta = isOtaBookingChannel(editChannel);
    const activeEditCurrency: ChannelCurrency = isEditOta ? editSourceCurrency : 'NGN';
    const parsedEditFx =
      activeEditCurrency === 'NGN'
        ? 1
        : Math.max(
            1,
            parseFormattedPriceInput(editFxRateInput) ??
              getFxRateToNgn(activeEditCurrency, property.usdExchangeRateNgn)
          );
    const parsedEditSourceNightly = parseFormattedPriceInput(editSourceNightlyRateInput);
    const resolvedEditSourceNightly =
      activeEditCurrency === 'NGN'
        ? Math.max(0, Math.round(parsedEditSourceNightly ?? (targetRoom?.nightlyRateNgn || res.nightlyRateNgn)))
        : Number(
            Math.max(
              0,
              parsedEditSourceNightly ??
                (targetRoom?.nightlyRateNgn || res.nightlyRateNgn) / Math.max(1, parsedEditFx)
            ).toFixed(2)
          );
    const resolvedEditSourceTotal = Number((resolvedEditSourceNightly * updatedNights).toFixed(2));
    const parsedEditOtaSourcePaid = isEditOta
      ? Math.max(0, parseFormattedPriceInput(editOtaPaidSourceInput) ?? 0)
      : 0;
    const parsedEditExpectedPayout = isEditOta
      ? Math.max(
          0,
          Math.round(
            parseFormattedPriceInput(editExpectedPayoutInput) ??
              (activeEditCurrency === 'NGN'
                ? resolvedEditSourceTotal
                : resolvedEditSourceTotal * parsedEditFx)
          )
        )
      : undefined;
    const resolvedEditNightlyNgn =
      activeEditCurrency === 'NGN'
        ? Math.round(resolvedEditSourceNightly)
        : parsedEditExpectedPayout && parsedEditExpectedPayout > 0
          ? Math.round(parsedEditExpectedPayout / updatedNights)
          : Math.round(resolvedEditSourceNightly * parsedEditFx);
    const parsedEditHotelPaid = Math.max(
      0,
      Math.round(parseFormattedPriceInput(editHotelPaidInput) ?? res.hotelPaidNgn ?? 0)
    );

    const editCautionFeeVal = editCautionEnabled
      ? Math.max(0, Math.round(parseFormattedPriceInput(editCautionAmountInput) ?? 0))
      : 0;
    const editCautionCollectedVal = editCautionEnabled
      ? Math.max(0, Math.round(parseFormattedPriceInput(editCautionCollectedInput) ?? 0))
      : 0;

    const isEditOtaChannel = isOtaBookingChannel(editChannel);
    const effectiveEditCollectionMode: OtaPaymentCollectionMode = isEditOtaChannel
      ? editCollectionMode
      : 'hotel_collect';
    const safeEditPayStatus: PaymentStatusLabel =
      !isEditOtaChannel && editPaymentStatus === 'Paid to OTA' ? 'Paid' : editPaymentStatus;
    const safeEditPayMethod: ReservationRecord['paymentMethod'] =
      !isEditOtaChannel && editPaymentMethodRes === 'OTA Platform Payout'
        ? 'Bank Transfer'
        : editPaymentMethodRes;

    const parsedEditActualPayout =
      effectiveEditCollectionMode === 'ota_prepaid' && editOtaPayoutStatus === 'received'
        ? Math.max(0, Math.round(parseFormattedPriceInput(editActualPayoutInput) ?? 0))
        : 0;
    const parsedEditAmountDue = Math.max(
      0,
      Math.round(parseFormattedPriceInput(editAmountDueInput) ?? 0)
    );

    setBusyId(`stay-${res.id}`);
    try {
      await updateReservationDetailsWorkflow({
        property,
        reservation: res,
        newRoom: targetRoom && targetRoom.id !== res.roomId ? targetRoom : undefined,
        clearRoomAssignment: editRoomId === '' && Boolean(res.roomId),
        requestedRoomType: targetRoom ? targetRoom.roomType : editRequestedRoomType,
        oldRoom,
        nightlyRateNgn: resolvedEditNightlyNgn,
        guestName:
          `${editGuestFirstNameRes.trim()} ${editGuestLastNameRes.trim()}`.trim() ||
          res.guestName,
        guestPhone: editGuestPhoneRes,
        guestEmail: editGuestEmailRes,
        guestAddress: editGuestAddressRes,
        guestCity: editGuestCityRes,
        guestState: editGuestStateRes,
        guestCountry: editGuestCountryRes,
        idType: editIdTypeRes,
        idNumber: editIdNumberRes,
        idExpiryDate: editIdExpiryDateRes,
        ratePlan: editRatePlanRes,
        specialRequests: editSpecialRequestsRes,
        checkInDate: editCheckInDate,
        checkOutDate: editCheckOutDate,
        nights: updatedNights,
        adults: editAdults,
        children: editChildren,
        channel: editChannel,
        status: editStatus,
        paymentMethod: safeEditPayMethod,
        paymentStatus: safeEditPayStatus,
        paymentCollectionMode: effectiveEditCollectionMode,
        otaPayoutStatus: effectiveEditCollectionMode === 'ota_prepaid' ? editOtaPayoutStatus : 'pending',
        actualPayoutReceivedNgn: parsedEditActualPayout,
        amountDueAtPropertyNgn: parsedEditAmountDue,
        paymentManuallyEdited: true,
        sourceCurrency: activeEditCurrency,
        sourceNightlyRate: resolvedEditSourceNightly,
        sourceTotalAmount: resolvedEditSourceTotal,
        fxRateToNgn: parsedEditFx,
        otaPaidSourceAmount: effectiveEditCollectionMode === 'ota_prepaid' ? parsedEditOtaSourcePaid : 0,
        expectedPayoutNgn: parsedEditExpectedPayout,
        hotelPaidNgn: parsedEditHotelPaid,
        cautionDepositEnabled: editCautionEnabled,
        cautionDepositNgn: editCautionFeeVal,
        cautionDepositCollectedNgn: editCautionCollectedVal,
        cautionDepositRefunded: editCautionEnabled && editCautionRefunded,
        actorRole,
      });
      onNotify(
        `Updated reservation ${res.bookingRef} (${targetRoom?.roomNumber || 'Unassigned'} · ${RESERVATION_STATUS_LABELS[editStatus]})`
      );
      setEditingStayDetails(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to save reservation changes.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCheckout = async () => {
    if (!checkoutTarget) return;
    if (!confirmAllBillsSettled) {
      setActionError('Please confirm that all bills are settled before completing check-out.');
      return;
    }
    const lateFee = Math.max(0, checkoutTarget.lateCheckoutFeeNgn || 0);
    const checkoutSummary = getReservationPaymentSummary(
      checkoutTarget,
      property.usdExchangeRateNgn
    );
    const balanceDue = checkoutSummary.balance;
    setActionError(null);
    setBusyId(checkoutTarget.id);
    try {
      await transitionReservationStatus({
        property,
        reservation: checkoutTarget,
        nextStatus: 'checked_out',
        settlementAmountNgn: balanceDue,
        paymentMethod: settlementMethod,
        checkOutTime: checkoutTarget.checkOutTime,
        lateCheckoutFeeNgn: lateFee,
        cautionDepositRefunded: refundCautionOnCheckout
          ? true
          : checkoutTarget.cautionDepositRefunded,
        allBillsSettledConfirmed: true,
        actorRole,
      });
      const updatedCheckoutRes: ReservationRecord = {
        ...checkoutTarget,
        status: 'checked_out',
        paidNgn: (checkoutTarget.paidNgn || 0) + balanceDue,
        hotelPaidNgn: (checkoutTarget.hotelPaidNgn ?? checkoutTarget.paidNgn ?? 0) + balanceDue,
        amountDueAtPropertyNgn: 0,
        paymentConfirmed: true,
        paymentStatus:
          checkoutSummary.paymentCollectionMode === 'ota_prepaid' ? 'Paid to OTA' : 'Paid',
        paymentMethod: balanceDue > 0 ? settlementMethod : checkoutTarget.paymentMethod,
        cautionDepositRefunded: refundCautionOnCheckout
          ? true
          : checkoutTarget.cautionDepositRefunded,
      };
      onNotify(
        `Checked out ${checkoutTarget.roomNumber} · All bills settled (${formatNgn(balanceDue)}) & Housekeeping dispatched`
      );
      setCheckoutTarget(null);
      setReceiptModalState({
        reservation: updatedCheckoutRes,
        mode: 'check_out',
        amountJustPaidNgn: balanceDue,
        settlementMethodOverride: balanceDue > 0 ? settlementMethod : checkoutTarget.paymentMethod,
      });
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleApplyLateCheckout = async (target: ReservationRecord) => {
    setActionError(null);
    const cleanTime = lateCheckoutTime.trim() || '14:00';
    const cleanFee = Math.max(0, Math.round(lateCheckoutFeeDraft || 0));
    setBusyId(`late-${target.id}`);
    try {
      await applyLateCheckoutWorkflow({
        property,
        reservation: target,
        checkOutTime: cleanTime,
        lateCheckoutFeeNgn: cleanFee,
        actorRole,
      });
      if (checkoutTarget && checkoutTarget.id === target.id) {
        setCheckoutTarget({
          ...checkoutTarget,
          checkOutTime: cleanTime,
          lateCheckoutFeeNgn: cleanFee,
          lateCheckoutApplied: cleanFee > 0,
        });
      }
      onNotify(
        `Applied late check-out (${cleanTime}${cleanFee > 0 ? ` · +${formatNgn(cleanFee)}` : ''}) to ${target.bookingRef}`
      );
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const openCancelDialog = (res: ReservationRecord) => {
    const otaCancelBlock = getOtaCancellationRestriction(res);
    if (otaCancelBlock.restricted) {
      setActionError(otaCancelBlock.message);
      onNotify(otaCancelBlock.message);
      return;
    }
    setActionError(null);
    setCancelTarget(res);
    setCancelMode('free');
    setCancelFeeNgn(Math.max(10000, Math.round(res.nightlyRateNgn || 50000)));
    setCancelReason('');
    setCancelPayMethod(res.paymentMethod || 'Bank Transfer');
    setCollectCancelFeeNow(true);
  };

  const handleConfirmCancelOrNoShow = async (nextStatus: 'cancelled' | 'no_show') => {
    if (!cancelTarget) return;
    if (nextStatus === 'cancelled') {
      const otaCancelBlock = getOtaCancellationRestriction(cancelTarget);
      if (otaCancelBlock.restricted) {
        setActionError(otaCancelBlock.message);
        onNotify(otaCancelBlock.message);
        setCancelTarget(null);
        return;
      }
    }
    if (nextStatus === 'cancelled' && cancelMode === 'paid' && cancelFeeNgn <= 0) {
      setActionError('Enter a cancellation fee greater than ₦0 or select Free Cancellation.');
      return;
    }
    setActionError(null);
    setBusyId(cancelTarget.id);
    try {
      const targetRoom = rooms.find((rm) => rm.id === cancelTarget.roomId);
      await transitionReservationStatus({
        property,
        reservation: cancelTarget,
        room: targetRoom,
        nextStatus,
        cancellationType: nextStatus === 'cancelled' ? cancelMode : undefined,
        cancellationFeeNgn:
          nextStatus === 'cancelled' && cancelMode === 'paid' ? cancelFeeNgn : 0,
        cancellationReason: cancelReason.trim(),
        paymentMethod: cancelPayMethod,
        collectCancellationFeeNow:
          nextStatus === 'cancelled' && cancelMode === 'paid' && collectCancelFeeNow,
        actorRole,
      });
      onNotify(
        nextStatus === 'no_show'
          ? `Marked ${cancelTarget.bookingRef} (${cancelTarget.guestName}) as No-show`
          : cancelMode === 'paid'
            ? `Cancelled ${cancelTarget.bookingRef} with ${formatNgn(cancelFeeNgn)} cancellation fee`
            : `Cancelled ${cancelTarget.bookingRef} (${cancelTarget.guestName}) — Free cancellation`
      );
      setCancelTarget(null);
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteRoom = async (room: RoomRecord) => {
    setActionError(null);
    setBusyId(room.id);
    try {
      await deleteRoomWorkflow({
        property,
        room,
        currentRoomCount: rooms.length,
        actorRole,
      });
      onNotify(`Deleted room ${room.roomNumber} from inventory`);
      setConfirmDeleteRoomId(null);
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReservation = async (res: ReservationRecord) => {
    setActionError(null);
    setBusyId(res.id);
    try {
      await deleteReservationWorkflow({
        property,
        reservation: res,
        room: rooms.find((rm) => rm.id === res.roomId),
        actorRole,
      });
      onNotify(`Deleted reservation ${res.bookingRef} (${res.guestName})`);
      setConfirmDeleteResId(null);
      if (selectedReservationId === res.id) {
        onSelectReservation?.(null);
      }
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteGuest = async (guest: GuestRecord) => {
    setActionError(null);
    setBusyId(guest.id);
    try {
      await deleteGuestRecordWorkflow({
        property,
        guest,
        actorRole,
      });
      onNotify(`Deleted guest profile (${guest.fullName})`);
      setConfirmDeleteGuestId(null);
      if (selectedGuestId === guest.id) {
        setSelectedGuestId(null);
      }
    } catch (err) {
      setActionError(parseReadableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const openChangeRoomModal = (res: ReservationRecord) => {
    const vacantCandidates = sortedRooms.filter(
      (r) => r.id !== res.roomId && r.occupancyStatus === 'vacant'
    );
    setChangeRoomTarget(res);
    setChangeRoomNewId(vacantCandidates[0]?.id || '');
    setChangeRoomAdjustRate(true);
    setChangeRoomReason('');
    setChangeRoomError(null);
  };

  const handleConfirmChangeRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeRoomTarget) return;
    setChangeRoomError(null);
    const targetRoom = rooms.find((r) => r.id === changeRoomNewId);
    if (!targetRoom) {
      setChangeRoomError('Please select a vacant room to move the guest into.');
      return;
    }
    const resOverlap = reservations.find(
      (r) =>
        r.id !== changeRoomTarget.id &&
        r.roomId === targetRoom.id &&
        (r.status === 'confirmed' || r.status === 'checked_in') &&
        datesOverlap(
          changeRoomTarget.checkInDate,
          changeRoomTarget.checkOutDate,
          r.checkInDate,
          r.checkOutDate
        )
    );
    if (resOverlap) {
      setChangeRoomError(
        `${targetRoom.roomNumber} has a conflicting reservation (${resOverlap.bookingRef}: ${resOverlap.checkInDate} → ${resOverlap.checkOutDate}).`
      );
      return;
    }
    const blkOverlap = blockedDates.find(
      (b) =>
        b.roomId === targetRoom.id &&
        datesOverlap(
          changeRoomTarget.checkInDate,
          changeRoomTarget.checkOutDate,
          b.startDate,
          b.endDate
        )
    );
    if (blkOverlap) {
      setChangeRoomError(
        `${targetRoom.roomNumber} is blocked (${blkOverlap.category}) during this stay.`
      );
      return;
    }

    setBusyId(`moveroom-${changeRoomTarget.id}`);
    try {
      await changeInHouseRoomWorkflow({
        property,
        reservation: changeRoomTarget,
        newRoom: targetRoom,
        adjustRateToNewRoom: changeRoomAdjustRate,
        reason: changeRoomReason.trim(),
        actorRole,
      });
      onNotify(
        `Moved ${changeRoomTarget.guestName} from ${changeRoomTarget.roomNumber} to ${targetRoom.roomNumber}`
      );
      setChangeRoomTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedNewGuest = `${newGuestFirstName.trim()} ${newGuestLastName.trim()}`.trim();
    if (!newGuestFirstName.trim() || !newGuestLastName.trim()) return;
    setBusyId('guest');
    try {
      await createGuestRecord({
        property,
        guest: {
          fullName: combinedNewGuest,
          phone: newGuestPhone.trim(),
          email: newGuestEmail.trim(),
          address: newGuestAddress.trim(),
          city: newGuestCity.trim(),
          state: newGuestState.trim(),
          country: newGuestCountry.trim() || 'Nigeria',
          nationality: newGuestCountry.trim() || 'Nigeria',
          idType: newGuestIdType,
          idNumber: newGuestIdNumber.trim(),
          vipTier: newGuestVip,
          totalStays: 0,
          lifetimeSpendNgn: 0,
          notes: '',
        },
        actorRole,
      });
      onNotify(`Guest ${combinedNewGuest} added to directory`);
      setShowGuestForm(false);
      setNewGuestFirstName('');
      setNewGuestLastName('');
      setNewGuestEmail('');
      setNewGuestAddress('');
      setNewGuestState('Enugu');
      setNewGuestCountry('Nigeria');
      setNewGuestIdNumber('');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveGuestProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuest) return;
    const combinedEditGuest =
      `${editGuestFirstName.trim()} ${editGuestLastName.trim()}`.trim() || selectedGuest.fullName;
    setBusyId(`guest-${selectedGuest.id}`);
    try {
      await updateGuestRecord({
        property,
        guest: selectedGuest,
        updates: {
          fullName: combinedEditGuest,
          phone: editGuestPhone.trim() || selectedGuest.phone,
          email: editGuestEmail.trim(),
          address: editGuestAddress.trim(),
          city: editGuestCity.trim(),
          state: editGuestState.trim(),
          country: editGuestNationality.trim() || 'Nigeria',
          nationality: editGuestNationality.trim() || 'Nigeria',
          idType: editGuestIdType,
          idNumber: editGuestIdNumber.trim(),
          vipTier: editGuestVip,
          notes: editGuestNotes.trim(),
        },
        actorRole,
      });
      onNotify(`Updated guest profile for ${combinedEditGuest}`);
      setEditingGuestMode(false);
    } finally {
      setBusyId(null);
    }
  };

  const filteredReservations = reservations.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    const sourceLabel = formatBookingSourceLabel(r.channel).toLowerCase();
    const bookedDate = getReservationBookedDate(r);
    const roomDisplay = getReservationRoomDisplay(r, rooms);
    const matchesSearch =
      !q ||
      r.guestName.toLowerCase().includes(q) ||
      r.bookingRef.toLowerCase().includes(q) ||
      roomDisplay.roomNumberLabel.toLowerCase().includes(q) ||
      roomDisplay.roomTypeLabel.toLowerCase().includes(q) ||
      (r.guestPhone || '').toLowerCase().includes(q) ||
      r.channel.toLowerCase().includes(q) ||
      sourceLabel.includes(q) ||
      bookedDate.includes(q);
    if (!matchesSearch) return false;

    if (filterRoomId === 'UNASSIGNED') {
      if (roomDisplay.isAssigned) return false;
    } else if (filterRoomId !== 'ALL' && r.roomId !== filterRoomId) {
      return false;
    }
    if (filterChannel !== 'ALL' && !matchesBookingSourceFilter(r.channel, filterChannel)) return false;
    if (filterPaymentStatus !== 'all') {
      const { paymentStatus } = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
      if (paymentStatus !== filterPaymentStatus) return false;
    }
    if (filterStayFrom && r.checkOutDate <= filterStayFrom) return false;
    if (filterStayTo && r.checkInDate >= filterStayTo) return false;

    if (section === 'arrivals') {
      return (
        r.status === 'confirmed' ||
        r.status === 'pending' ||
        (r.status === 'checked_in' && r.checkInDate === todayIso)
      );
    }
    if (section === 'in_house') {
      return r.status === 'checked_in';
    }
    if (section === 'front_desk') {
      return r.status === 'confirmed' || r.status === 'pending' || r.status === 'checked_in';
    }
    if (section === 'reservations' && resStatusFilter !== 'all') {
      return r.status === resStatusFilter;
    }
    return true;
  });

  const arrivalsTodayList = filteredReservations
    .filter((r) => (r.status === 'confirmed' || r.status === 'pending') && r.checkInDate === todayIso)
    .sort((a, b) => a.guestName.localeCompare(b.guestName));

  const arrivalsFutureList = filteredReservations
    .filter((r) => (r.status === 'confirmed' || r.status === 'pending') && r.checkInDate > todayIso)
    .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || a.guestName.localeCompare(b.guestName));

  const arrivalsOverdueList = filteredReservations
    .filter((r) => (r.status === 'confirmed' || r.status === 'pending') && r.checkInDate < todayIso)
    .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate) || a.guestName.localeCompare(b.guestName));

  const arrivalsCheckedInTodayList = filteredReservations
    .filter((r) => r.status === 'checked_in' && r.checkInDate === todayIso)
    .sort((a, b) => a.guestName.localeCompare(b.guestName));

  const futureArrivalsByDate = arrivalsFutureList.reduce<Array<{ dateIso: string; items: ReservationRecord[] }>>(
    (groups, res) => {
      const last = groups[groups.length - 1];
      if (last && last.dateIso === res.checkInDate) {
        last.items.push(res);
      } else {
        groups.push({ dateIso: res.checkInDate, items: [res] });
      }
      return groups;
    },
    []
  );

  const activeAdvancedFilterCount =
    (filterRoomId !== 'ALL' ? 1 : 0) +
    (filterChannel !== 'ALL' ? 1 : 0) +
    (filterPaymentStatus !== 'all' ? 1 : 0) +
    (filterStayFrom ? 1 : 0) +
    (filterStayTo ? 1 : 0);

  const reservationMetrics = reservations.reduce(
    (acc, r) => {
      const {
        totalAmount,
        hotelPaidAmount,
        amountPaid,
        balance,
        sourceCurrency,
        otaPaidSourceAmount,
      } = getReservationPaymentSummary(r, property.usdExchangeRateNgn);
      acc.total += 1;
      acc[r.status] = (acc[r.status] || 0) + 1;
      if (r.status !== 'cancelled' && r.status !== 'no_show') {
        acc.totalValue += totalAmount;
        acc.totalPaid += amountPaid;
        acc.totalHotelPaid += hotelPaidAmount;
        acc.totalBalance += balance;
        if (isOtaBookingChannel(r.channel) && sourceCurrency === 'USD') {
          acc.totalOtaUsd = Number((acc.totalOtaUsd + otaPaidSourceAmount).toFixed(2));
        }
      }
      return acc;
    },
    {
      total: 0,
      confirmed: 0,
      pending: 0,
      checked_in: 0,
      checked_out: 0,
      cancelled: 0,
      no_show: 0,
      totalValue: 0,
      totalPaid: 0,
      totalHotelPaid: 0,
      totalOtaUsd: 0,
      totalBalance: 0,
    } as Record<string, number>
  );

  const filteredGuests = guests.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      g.fullName.toLowerCase().includes(q) ||
      g.phone.includes(q) ||
      (g.email || '').toLowerCase().includes(q) ||
      (g.city || '').toLowerCase().includes(q)
    );
  });

  const roomSections: Array<{ key: RoomSection; title: string; desc: string }> = [
    {
      key: 'Serviced Apartment',
      title: 'Serviced Apartment Section',
      desc: 'Studio & One Bedroom Serviced Apartments with Kitchenette',
    },
    {
      key: 'Hotel Rooms',
      title: 'Hotel Rooms',
      desc: 'Deluxe Studios, Standard Studios & Executive Rooms',
    },
  ];

  const isStayTableSection =
    section === 'reservations' ||
    section === 'in_house' ||
    section === 'front_desk';

  const isDedicatedSubpage = Boolean(
    (editingRoom && canManageRooms) ||
      (showAddRoomModal && canManageRooms) ||
      activeFolioReservation ||
      selectedGuest ||
      (showGuestForm && section === 'guests') ||
      (showBookingForm && section !== 'walk_in') ||
      selectedRoomDetail
  );

  const systemPropertyId = getPropertySystemId(property);

  return (
    <div className="space-y-6">
      {!isDedicatedSubpage && (
        <>
          {/* Header Toolbar */}
          <div className="bg-white border border-slate-200 border-t-4 border-t-[#1c46be] rounded-xl p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-xs">
            <div>
              <h1 className="font-display text-xl font-extrabold text-[#061539]">
                {cms.pages[section]?.title || (section === 'rooms' ? 'Rooms & Rates' : 'Reservations')}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {cms.pages[section]?.subtitle}
                <span className="ml-2 font-mono-tabular text-slate-400">· {systemPropertyId}</span>
              </p>
            </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {section !== 'rooms' && section !== 'walk_in' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search guest, ref, phone, RM-1..."
                  className="h-10 w-56 sm:w-64 pl-8 pr-3 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1c46be]"
                />
              </div>
              {(section === 'arrivals' || isStayTableSection) && (
                <button
                  type="button"
                  onClick={() => setShowAdvancedSearch((v) => !v)}
                  className={`h-10 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    showAdvancedSearch || activeAdvancedFilterCount > 0
                      ? 'bg-blue-50 border-blue-300 text-[#1c46be]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    Advanced Search
                    {activeAdvancedFilterCount > 0 ? ` (${activeAdvancedFilterCount})` : ''}
                  </span>
                </button>
              )}
            </div>
          )}

          {section === 'rooms' ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {canManageRooms && property.code === 'RG-ENU-01' && (
                <button
                  type="button"
                  disabled={busyId === 'sync-catalog'}
                  onClick={async () => {
                    setBusyId('sync-catalog');
                    try {
                      const updated = await syncRichgatesOfficialCatalogIfNeeded({
                        property,
                        rooms,
                        reservations,
                        housekeepingTasks: [],
                        actorRole,
                      });
                      onNotify(
                        updated
                          ? 'Synced Richgates official RM-1 to RM-8 room types & rates'
                          : 'Richgates room catalog is already up to date'
                      );
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="h-10 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{cms.pages.rooms.ctaLabel || 'Sync Official Rates'}</span>
                </button>
              )}
              {canManageRooms && (
                <button
                  type="button"
                  disabled={atRoomCapacity}
                  title={
                    atRoomCapacity
                      ? `Maximum ${effectiveMaxRooms} rooms allowed on active license`
                      : 'Add a new room to inventory'
                  }
                  onClick={openAddRoomModal}
                  className="h-10 inline-flex items-center gap-1.5 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {atRoomCapacity
                      ? `License Cap (${rooms.length}/${effectiveMaxRooms})`
                      : 'Add New Room'}
                  </span>
                </button>
              )}
            </div>
          ) : section === 'guests' ? (
            <button
              type="button"
              onClick={() => setShowGuestForm((v) => !v)}
              className="h-10 inline-flex items-center gap-1.5 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{cms.pages.guests.ctaLabel || 'Register Guest'}</span>
            </button>
          ) : section === 'walk_in' ? (
            <button
              type="button"
              onClick={() => onNavigateSection?.('in_house')}
              className="h-10 inline-flex items-center gap-1.5 px-4 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>{cms.pages.walk_in.ctaLabel || 'View In-House Guests'}</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateSection?.('walk_in')}
                className="h-10 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-[#0B245B] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#1c46be]" />
                <span>{cms.pages.walk_in.navLabel || 'Walk-in Check-in'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentRoomObj = selectedRoomId
                    ? sortedRooms.find((r) => r.id === selectedRoomId)
                    : undefined;
                  const currentRoomStillOpen =
                    currentRoomObj &&
                    checkRoomDateRangeAvailability({
                      room: currentRoomObj,
                      checkInDate,
                      checkOutDate,
                      reservations,
                      blockedDates,
                    }).available;
                  if (!currentRoomStillOpen) {
                    const firstOpen = sortedRooms.find(
                      (r) =>
                        checkRoomDateRangeAvailability({
                          room: r,
                          checkInDate,
                          checkOutDate,
                          reservations,
                          blockedDates,
                        }).available
                    );
                    setSelectedRoomId(firstOpen ? firstOpen.id : '');
                    if (firstOpen) {
                      setNewRequestedRoomType(firstOpen.roomType);
                    }
                  }
                  setBookingError(null);
                  setActionError(null);
                  setShowBookingForm((v) => !v);
                }}
                className="h-10 inline-flex items-center gap-1.5 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{cms.pages[section]?.ctaLabel || 'New Reservation'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-950 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Expandable Advanced Search Filter Panel */}
      {(section === 'arrivals' || isStayTableSection) && showAdvancedSearch && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-slate-900">
              Advanced Stay &amp; Reservation Search
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterRoomId('ALL');
                setFilterChannel('ALL');
                setFilterPaymentStatus('all');
                setFilterStayFrom('');
                setFilterStayTo('');
              }}
              className="text-emerald-700 font-semibold hover:underline cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Room</label>
              <select
                value={filterRoomId}
                onChange={(e) => setFilterRoomId(e.target.value)}
                className="h-10 w-full border border-slate-200 rounded-lg px-2.5 bg-white"
              >
                <option value="ALL">All Rooms</option>
                <option value="UNASSIGNED">Unassigned (Edit to Assign)</option>
                {sortedRooms.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.roomNumber} · {rm.roomType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Booking Source</label>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="h-10 w-full border border-slate-200 rounded-lg px-2.5 bg-white"
              >
                <option value="ALL">All Sources</option>
                {PRIMARY_BOOKING_SOURCES.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Payment Status</label>
              <select
                value={filterPaymentStatus}
                onChange={(e) =>
                  setFilterPaymentStatus(e.target.value as 'all' | PaymentStatusLabel)
                }
                className="h-10 w-full border border-slate-200 rounded-lg px-2.5 bg-white"
              >
                <option value="all">All Payments</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Stay From Date</label>
              <input
                type="date"
                value={filterStayFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterStayFrom(val);
                  if (val && filterStayTo && filterStayTo <= val) {
                    setFilterStayTo(addDaysIso(val, 1));
                  }
                }}
                className="h-10 w-full border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Stay To Date</label>
              <input
                type="date"
                min={filterStayFrom ? addDaysIso(filterStayFrom, 1) : undefined}
                value={filterStayTo}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && filterStayFrom && val <= filterStayFrom) {
                    setFilterStayTo(addDaysIso(filterStayFrom, 1));
                  } else {
                    setFilterStayTo(val);
                  }
                }}
                className="h-10 w-full border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION: DEDICATED WALK-IN CHECK-IN */}
      {section === 'walk_in' && (() => {
        const walkInNights = diffNights(todayIso, walkInCheckOut);
        const walkInTotalNgn = Math.max(0, walkInRateNgn) * walkInNights;
        const walkInBalanceNgn = Math.max(0, walkInTotalNgn - Math.max(0, walkInDepositNgn));
        const selectedWalkInRoom = rooms.find((r) => r.id === walkInRoomId);
        const walkInChecklistMissing: string[] = [];
        if (!walkInFirstName.trim() || !walkInLastName.trim()) walkInChecklistMissing.push('Guest Name');
        if (walkInIdNumber.trim().length < 3) walkInChecklistMissing.push('ID Number');
        if (!walkInPayConfirmed) walkInChecklistMissing.push('Confirm Payment');
        if (!walkInIdVerified) walkInChecklistMissing.push('Verify Guest ID');
        if (!walkInRoomReady) walkInChecklistMissing.push('Room Inspected Ready');
        if (walkInKeyIssued !== 'yes') walkInChecklistMissing.push('Key Issued = Yes');
        const walkInCanSubmit = busyId !== 'walk_in' && walkInChecklistMissing.length === 0 && Boolean(selectedWalkInRoom);

        const handleWalkInCheckOutChange = (nextOut: string) => {
          const safeOut = !nextOut || nextOut <= todayIso ? addDaysIso(todayIso, 1) : nextOut;
          setWalkInCheckOut(safeOut);
          const nextNights = diffNights(todayIso, safeOut);
          const curRoom = rooms.find((r) => r.id === walkInRoomId);
          if (curRoom) {
            const curAvail = checkRoomDateRangeAvailability({
              room: curRoom,
              checkInDate: todayIso,
              checkOutDate: safeOut,
              reservations,
              blockedDates,
            });
            if (!curAvail.available) {
              const openAlt = walkInEligibleRooms.find(
                (r) =>
                  checkRoomDateRangeAvailability({
                    room: r,
                    checkInDate: todayIso,
                    checkOutDate: safeOut,
                    reservations,
                    blockedDates,
                  }).available
              );
              if (openAlt) {
                setWalkInRoomId(openAlt.id);
                setWalkInRateNgn(openAlt.nightlyRateNgn);
                setWalkInDepositNgn(openAlt.nightlyRateNgn * nextNights);
                setWalkInError(null);
                return;
              }
            }
          }
          setWalkInDepositNgn(walkInRateNgn * nextNights);
          setWalkInError(null);
        };

        return (
          <form
            onSubmit={handleWalkInSubmit}
            className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Walk-In Guest Check-In
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign an available room, record guest KYC &amp; payment, and complete immediate check-in.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-[#0b5d34]">
                <Calendar className="w-3.5 h-3.5" />
                <span className="font-mono-tabular">
                  {todayIso} → {walkInCheckOut} · {walkInNights} night{walkInNights > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {walkInError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {walkInError}
              </div>
            )}

            {/* 1. STAY DATES & ROOM ASSIGNMENT */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  1. Stay Dates &amp; Room Assignment
                </h3>
                <span className="font-mono-tabular text-[11px] font-semibold text-[#0b5d34]">
                  {walkInNights} night{walkInNights > 1 ? 's' : ''} · {formatNgn(walkInTotalNgn)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-3">
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Check-In Date (Today)
                  </label>
                  <input
                    type="date"
                    value={todayIso}
                    readOnly
                    disabled
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-slate-100 text-slate-600 font-mono-tabular cursor-not-allowed"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Check-Out Date *
                  </label>
                  <input
                    type="date"
                    required
                    min={tomorrowIso}
                    value={walkInCheckOut}
                    onChange={(e) => handleWalkInCheckOutChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1.5">Nights *</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    required
                    value={walkInNights}
                    onChange={(e) => {
                      const nextN = Math.max(1, Math.min(90, Number(e.target.value) || 1));
                      handleWalkInCheckOutChange(addDaysIso(todayIso, nextN));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1.5">Adults *</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={walkInAdults}
                    onChange={(e) => setWalkInAdults(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1.5">Children</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={walkInChildren}
                    onChange={(e) => setWalkInChildren(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="md:col-span-12">
                  <AvailabilityDateRangePicker
                    checkInDate={todayIso}
                    checkOutDate={walkInCheckOut}
                    onChangeDates={(_, nextOut) => handleWalkInCheckOutChange(nextOut)}
                    room={selectedWalkInRoom}
                    rooms={sortedRooms}
                    reservations={reservations}
                    blockedDates={blockedDates}
                    onSelectAlternativeRoom={(alt) => {
                      setWalkInRoomId(alt.id);
                      setWalkInRateNgn(alt.nightlyRateNgn);
                      setWalkInDepositNgn(alt.nightlyRateNgn * walkInNights);
                      setWalkInError(null);
                    }}
                    checkOutLabel="Check Availability Calendar (Shows PMS & Airbnb Bookings)"
                    lockCheckIn
                  />
                </div>

                <div className="md:col-span-6">
                  <label className="block font-semibold text-slate-700 mb-1.5">Room Type *</label>
                  <select
                    value={walkInRoomTypeFilter}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setWalkInRoomTypeFilter(nextType);
                      const matching = sortedRooms.filter(
                        (r) =>
                          r.occupancyStatus !== 'out_of_order' &&
                          (nextType === 'ALL' || r.roomType === nextType)
                      );
                      const pick =
                        matching.find(
                          (r) =>
                            checkRoomDateRangeAvailability({
                              room: r,
                              checkInDate: todayIso,
                              checkOutDate: walkInCheckOut,
                              reservations,
                              blockedDates,
                            }).available
                        ) || matching[0];
                      if (pick) {
                        setWalkInRoomId(pick.id);
                        setWalkInRateNgn(pick.nightlyRateNgn);
                        setWalkInDepositNgn(pick.nightlyRateNgn * walkInNights);
                      }
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="ALL">All Room Types</option>
                    {uniqueRoomTypes.map((rt) => {
                      const sample = sortedRooms.find((r) => r.roomType === rt);
                      return (
                        <option key={rt} value={rt}>
                          {rt} {sample ? `- ${formatNgn(sample.nightlyRateNgn)}/night` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="md:col-span-6">
                  <label className="block font-semibold text-slate-700 mb-1.5">Assign Room *</label>
                  <select
                    required
                    value={walkInRoomId}
                    onChange={(e) => {
                      const rm = rooms.find((r) => r.id === e.target.value);
                      setWalkInRoomId(e.target.value);
                      if (rm) {
                        setWalkInRateNgn(rm.nightlyRateNgn);
                        setWalkInDepositNgn(rm.nightlyRateNgn * walkInNights);
                      }
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    {walkInEligibleRooms.map((r) => {
                      const avail = checkRoomDateRangeAvailability({
                        room: r,
                        checkInDate: todayIso,
                        checkOutDate: walkInCheckOut,
                        reservations,
                        blockedDates,
                      });
                      return (
                        <option key={r.id} value={r.id} disabled={!avail.available}>
                          {r.roomNumber} · {r.roomType} — {formatRoomAvailabilityTag(avail)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* 2. GUEST DETAILS & KYC */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-xs">
              <h3 className="font-display text-sm font-bold text-slate-900">
                2. Guest Details &amp; Identity (KYC)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">First Name *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Chinedu"
                    value={walkInFirstName}
                    onChange={(e) => setWalkInFirstName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Last Name *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Okafor"
                    value={walkInLastName}
                    onChange={(e) => setWalkInLastName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Phone Number *</label>
                  <input
                    required
                    type="text"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    placeholder="guest@example.com"
                    value={walkInEmail}
                    onChange={(e) => setWalkInEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">ID Type *</label>
                  <select
                    value={walkInIdType}
                    onChange={(e) => setWalkInIdType(e.target.value as GuestRecord['idType'])}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="NIN">NIN</option>
                    <option value="International Passport">International Passport</option>
                    <option value="Driver License">Driver License</option>
                    <option value="Voter Card">Voter Card</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">ID Number *</label>
                  <input
                    required
                    type="text"
                    placeholder="Enter ID / Passport No."
                    value={walkInIdNumber}
                    onChange={(e) => setWalkInIdNumber(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">Street Address</label>
                    <input
                      type="text"
                      placeholder="House / Street address"
                      value={walkInAddress}
                      onChange={(e) => setWalkInAddress(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">City</label>
                    <input
                      type="text"
                      value={walkInCity}
                      onChange={(e) => setWalkInCity(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">State / Province</label>
                    <input
                      type="text"
                      value={walkInState}
                      onChange={(e) => setWalkInState(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">Country</label>
                    <CountrySelect
                      value={walkInCountry}
                      onChange={setWalkInCountry}
                      placeholder="Select country..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. PAYMENT & OPTIONAL CAUTION DEPOSIT */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  3. Payment &amp; Refundable Caution Deposit
                </h3>
                <div className="flex flex-wrap items-center gap-3 font-mono-tabular text-[11px]">
                  <span className="text-slate-600">
                    Total Stay: <strong className="text-slate-900">{formatNgn(walkInTotalNgn)}</strong>
                  </span>
                  <span className="text-emerald-700">
                    Paid: <strong>{formatNgn(Math.max(0, walkInDepositNgn))}</strong>
                  </span>
                  <span className={walkInBalanceNgn > 0 ? 'text-rose-700' : 'text-slate-500'}>
                    Balance: <strong>{formatNgn(walkInBalanceNgn)}</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Rate / Night (₦)</label>
                  <input
                    type="number"
                    min={5000}
                    step={500}
                    value={walkInRateNgn}
                    onChange={(e) => {
                      const nextRate = Number(e.target.value);
                      setWalkInRateNgn(nextRate);
                      setWalkInDepositNgn(nextRate * walkInNights);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Payment Method</label>
                  <select
                    value={walkInPaymentMethod}
                    onChange={(e) =>
                      setWalkInPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="Cash NGN">Cash (₦)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card POS">Card POS</option>
                    <option value="Corporate Invoice">Corporate Invoice</option>
                    <option value="Online Gateway">Online Gateway</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Amount Paid Today (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={walkInDepositNgn}
                    onChange={(e) => setWalkInDepositNgn(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white font-mono-tabular focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Payment Status</label>
                  <select
                    value={
                      walkInPaymentStatusManual
                        ? walkInPaymentStatus
                        : walkInDepositNgn >= walkInTotalNgn && walkInTotalNgn > 0
                          ? 'Paid'
                          : walkInDepositNgn > 0
                            ? 'Partial'
                            : 'Unpaid'
                    }
                    onChange={(e) => {
                      setWalkInPaymentStatus(e.target.value as PaymentStatusLabel);
                      setWalkInPaymentStatusManual(true);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Partial">Partial Payment</option>
                    <option value="Unpaid">Unpaid / Balance Due</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/80 space-y-3">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={walkInCautionEnabled}
                    onChange={(e) => {
                      setWalkInCautionEnabled(e.target.checked);
                      if (e.target.checked && walkInCautionCollected === 0) {
                        setWalkInCautionCollected(walkInCautionAmount);
                      }
                    }}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Collect optional refundable caution / security deposit</span>
                </label>

                {walkInCautionEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Caution Fee Required (₦)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={walkInCautionAmount}
                        onChange={(e) => setWalkInCautionAmount(Math.max(0, Number(e.target.value)))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Caution Collected Today (₦)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={walkInCautionCollected}
                        onChange={(e) => setWalkInCautionCollected(Math.max(0, Number(e.target.value)))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono-tabular"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. MANDATORY CHECK-IN VERIFICATION CHECKLIST */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>4. Mandatory Check-In Verification</span>
                </div>
                {cms.brand.checkInPolicyNote && (
                  <span className="text-[11px] text-emerald-800 font-medium">
                    {cms.brand.checkInPolicyNote}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={walkInPayConfirmed}
                    onChange={(e) => setWalkInPayConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600"
                  />
                  <span>
                    <strong className="block text-slate-900">1. Confirm Payment</strong>
                    <span className="text-[11px] text-slate-500">
                      Deposit / full rate verified ({walkInPaymentMethod})
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={walkInIdVerified}
                    onChange={(e) => setWalkInIdVerified(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600"
                  />
                  <span>
                    <strong className="block text-slate-900">2. Verify Guest ID (KYC)</strong>
                    <span className="text-[11px] text-slate-500">
                      {walkInIdType} number entered above &amp; ID inspected
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={walkInRoomReady}
                    onChange={(e) => setWalkInRoomReady(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600"
                  />
                  <span>
                    <strong className="block text-slate-900">3. Room Inspected Ready</strong>
                    <span className="text-[11px] text-slate-500">
                      Assigned room clean &amp; ready for occupancy
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-slate-900">4. Key Issued to Guest? *</p>
                    <p className="text-[11px] text-slate-500">
                      Select Yes once physical key is handed to guest
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWalkInKeyIssued('yes')}
                    className={`px-3.5 py-1.5 rounded-lg font-semibold border cursor-pointer ${
                      walkInKeyIssued === 'yes'
                        ? 'bg-[#0b5d34] border-[#0b5d34] text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Yes — Key Issued
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkInKeyIssued('no')}
                    className={`px-3.5 py-1.5 rounded-lg font-semibold border cursor-pointer ${
                      walkInKeyIssued === 'no'
                        ? 'bg-rose-600 border-rose-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    No — Not Issued
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Bar with Prominent Check-In Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                {walkInChecklistMissing.length > 0 ? (
                  <span>
                    Complete to enable Check In:{' '}
                    <strong className="text-amber-700">{walkInChecklistMissing.join(' · ')}</strong>
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold">
                    All check-in verifications complete — ready to check in{' '}
                    {selectedWalkInRoom?.roomNumber || 'selected room'}.
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={!walkInCanSubmit}
                className="inline-flex items-center justify-center gap-2 py-3 px-7 rounded-xl bg-[#0b5d34] hover:bg-[#094b2a] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm transition-colors cursor-pointer shrink-0"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  {busyId === 'walk_in'
                    ? 'Checking In Guest...'
                    : `Check In Guest${selectedWalkInRoom ? ` · ${selectedWalkInRoom.roomNumber}` : ''}`}
                </span>
              </button>
            </div>
          </form>
        );
      })()}

      {/* SECTION: ROOMS */}
      {section === 'rooms' && (() => {
        const normalizedRoomQuery = roomSearchQuery.trim().toLowerCase();
        const filteredRoomsList = sortedRooms.filter((r) => {
          if (roomSectionFilter !== 'ALL' && getRoomSection(r) !== roomSectionFilter) return false;
          if (roomStatusFilter !== 'ALL' && r.occupancyStatus !== roomStatusFilter) return false;
          if (!normalizedRoomQuery) return true;
          return (
            r.roomNumber.toLowerCase().includes(normalizedRoomQuery) ||
            r.name.toLowerCase().includes(normalizedRoomQuery) ||
            r.roomType.toLowerCase().includes(normalizedRoomQuery) ||
            (r.amenities || []).some((a) => a.toLowerCase().includes(normalizedRoomQuery))
          );
        });

        const hasActiveRoomFilter =
          roomSearchQuery.trim() !== '' ||
          roomSectionFilter !== 'ALL' ||
          roomStatusFilter !== 'ALL';

        return (
          <div className="space-y-6">
            <CurrencyConverterWidget
              property={property}
              rooms={rooms}
              canEditRate={canManageRooms}
              actorRole={actorRole}
              onNotify={onNotify}
            />

            {/* Rooms Easy Search / Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs items-end">
                <div className="md:col-span-5">
                  <label className="block font-medium text-slate-600 mb-1">
                    Search Rooms
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={roomSearchQuery}
                      onChange={(e) => setRoomSearchQuery(e.target.value)}
                      placeholder="Search RM-1, Deluxe Studio, One Bedroom..."
                      className="w-full h-9 pl-8 pr-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#061539]"
                    />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block font-medium text-slate-600 mb-1">Property Section</label>
                  <select
                    value={roomSectionFilter}
                    onChange={(e) => setRoomSectionFilter(e.target.value as 'ALL' | RoomSection)}
                    className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white"
                  >
                    <option value="ALL">All Sections ({sortedRooms.length})</option>
                    <option value="Serviced Apartment">Serviced Apartment Section</option>
                    <option value="Hotel Rooms">Hotel Rooms</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block font-medium text-slate-600 mb-1">Availability</label>
                  <select
                    value={roomStatusFilter}
                    onChange={(e) =>
                      setRoomStatusFilter(e.target.value as 'ALL' | RoomRecord['occupancyStatus'])
                    }
                    className="w-full h-9 border border-slate-200 rounded-lg px-3 bg-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="out_of_order">Out of Order</option>
                  </select>
                </div>

                <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 h-9">
                  <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                    {filteredRoomsList.length} / {sortedRooms.length} Rooms
                  </span>
                  {hasActiveRoomFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setRoomSearchQuery('');
                        setRoomSectionFilter('ALL');
                        setRoomStatusFilter('ALL');
                      }}
                      className="text-xs font-semibold text-[#28488a] hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            {filteredRoomsList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                <p className="font-display text-sm font-bold text-slate-900">
                  No rooms match your active filters
                </p>
                <p className="text-xs text-slate-500">
                  Clear your search or filters to view all rooms and photo galleries.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRoomSearchQuery('');
                    setRoomSectionFilter('ALL');
                    setRoomStatusFilter('ALL');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#061539] text-white text-xs font-semibold cursor-pointer mt-2"
                >
                  Show All Rooms
                </button>
              </div>
            ) : (
              roomSections.map((sec) => {
                const secRooms = filteredRoomsList.filter((r) => getRoomSection(r) === sec.key);
                if (secRooms.length === 0) return null;

                return (
                  <div key={sec.key} className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                      <div>
                        <h2 className="font-display text-base font-bold text-slate-900">
                          {sec.title}
                        </h2>
                        <p className="text-xs text-slate-500">{sec.desc}</p>
                      </div>
                      <span className="text-xs font-mono-tabular text-slate-500">
                        {secRooms.length} {secRooms.length === 1 ? 'room' : 'rooms'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {secRooms.map((room) => {
                        const roomSlides = getRoomGalleryImages(room);
                        const roomAmenities = room.amenities || [];
                        const isExpanded = Boolean(expandedAmenityRoomIds[room.id]);
                        const visibleAmenities = isExpanded
                          ? roomAmenities
                          : roomAmenities.slice(0, 4);
                        const hiddenAmenityCount = Math.max(0, roomAmenities.length - 4);
                        const occBadgeColor =
                          room.occupancyStatus === 'vacant'
                            ? 'bg-emerald-500/90 text-white'
                            : room.occupancyStatus === 'occupied'
                              ? 'bg-amber-500/90 text-white'
                              : 'bg-rose-600/90 text-white';

                        return (
                          <div
                            key={room.id}
                            className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
                          >
                            {/* Interactive Multi-Slide Room Photo Gallery */}
                            <RoomGallerySlider
                              slides={roomSlides}
                              roomNumber={room.roomNumber}
                              roomName={room.name}
                              heightClass="h-48"
                              onImageClick={() => setSelectedRoomDetailId(room.id)}
                              overlayTopRight={
                                canManageRooms ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRoomEditor(room);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/75 hover:bg-slate-950 text-white text-[11px] font-medium backdrop-blur-sm cursor-pointer"
                                  >
                                    <SlidersHorizontal className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                ) : null
                              }
                              overlayBottom={
                                <div className="flex items-end justify-between gap-2 text-white">
                                  <div className="min-w-0 pr-2">
                                    <p className="font-mono-tabular text-xs font-bold tracking-wide">
                                      {room.roomNumber} · Floor {room.floor}
                                    </p>
                                    <p className="font-display text-sm font-semibold truncate">
                                      {room.roomType}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${occBadgeColor}`}
                                  >
                                    {room.occupancyStatus.replace('_', ' ')}
                                  </span>
                                </div>
                              }
                            />

                            <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRoomDetailId(room.id)}
                                    className="truncate font-display text-sm font-bold text-slate-900 hover:text-[#28488a] hover:underline text-left cursor-pointer"
                                  >
                                    {room.name}
                                  </button>
                                  <span className="font-mono-tabular text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                                    Max {room.maxGuests} {room.maxGuests === 1 ? 'Guest' : 'Guests'}
                                  </span>
                                </div>

                                {canManageRooms && editingRateRoomId === room.id ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={rateDraftInput}
                                      onChange={(e) =>
                                        handleCommaPriceChange(e, rateDraftInput, setRateDraftInput)
                                      }
                                      className="w-32 border border-slate-300 rounded px-2 py-1 text-xs font-mono-tabular font-semibold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveRate(room)}
                                      disabled={busyId === room.id}
                                      className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded font-medium cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingRateRoomId(null)}
                                      className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                                    <div>
                                      <span className="font-mono-tabular text-base font-bold text-slate-900 block">
                                        {formatNgn(room.nightlyRateNgn)}
                                        <span className="text-xs font-normal text-slate-500">
                                          {' '}
                                          / night
                                        </span>
                                      </span>
                                      <span className="font-mono-tabular text-[11px] font-medium text-emerald-700 block">
                                        ≈{' '}
                                        {formatUsd(
                                          convertNgnToUsd(
                                            room.nightlyRateNgn,
                                            property.usdExchangeRateNgn
                                          ),
                                          2
                                        )}{' '}
                                        USD / night
                                      </span>
                                    </div>
                                    {canManageRooms && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingRateRoomId(room.id);
                                          setRateDraftInput(
                                            formatPriceInputWithCommas(room.nightlyRateNgn)
                                          );
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#28488a] hover:underline cursor-pointer"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>Rate</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-slate-600 truncate">
                                    {room.currentGuestName
                                      ? `Guest: ${room.currentGuestName}`
                                      : 'Vacant · Ready for check-in'}
                                  </span>
                                  <span className="text-[11px] text-slate-600 capitalize shrink-0">
                                    HK:{' '}
                                    <strong
                                      className={
                                        room.housekeepingStatus === 'dirty'
                                          ? 'text-rose-700'
                                          : room.housekeepingStatus === 'cleaning'
                                            ? 'text-amber-700'
                                            : 'text-emerald-700'
                                      }
                                    >
                                      {room.housekeepingStatus === 'inspected'
                                        ? 'clean'
                                        : room.housekeepingStatus}
                                    </strong>
                                  </span>
                                </div>

                                {/* Easy-to-scan Room Amenities Grid */}
                                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-slate-700">
                                      Room Amenities ({roomAmenities.length})
                                    </span>
                                    {hiddenAmenityCount > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedAmenityRoomIds((prev) => ({
                                            ...prev,
                                            [room.id]: !prev[room.id],
                                          }))
                                        }
                                        className="font-semibold text-[#28488a] hover:underline cursor-pointer"
                                      >
                                        {isExpanded ? 'Show less' : `+${hiddenAmenityCount} more`}
                                      </button>
                                    )}
                                  </div>
                                  {visibleAmenities.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {visibleAmenities.map((amenity) => {
                                        const AmenityIcon = getAmenityIcon(amenity);
                                        return (
                                          <div
                                            key={amenity}
                                            className="flex items-center gap-1.5 text-[11px] text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-1 min-w-0"
                                          >
                                            <AmenityIcon className="w-3 h-3 text-[#28488a] shrink-0" />
                                            <span className="truncate">{amenity}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-400">
                                      No amenities listed yet.
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Clean Room Actions Footer */}
                              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRoomDetailId(room.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#061539] hover:bg-[#0c235c] text-white font-semibold cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>View Room</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onStartNewReservationForRoom) {
                                        onStartNewReservationForRoom(room.id);
                                      } else {
                                        setSelectedRoomId(room.id);
                                        setNewRequestedRoomType(room.roomType);
                                        setShowBookingForm(true);
                                        onNavigateSection?.('reservations');
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                                  >
                                    <CalendarPlus className="w-3 h-3" />
                                    <span>Book</span>
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {canManageRooms && confirmDeleteRoomId !== room.id && (
                                    <button
                                      type="button"
                                      disabled={busyId === room.id}
                                      onClick={() => setConfirmDeleteRoomId(room.id)}
                                      title={`Delete ${room.roomNumber}`}
                                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {canManageRooms && confirmDeleteRoomId === room.id && (
                                    <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteRoomId(null)}
                                        className="px-1.5 py-0.5 text-[10px] text-slate-600 cursor-pointer"
                                      >
                                        No
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busyId === room.id}
                                        onClick={() => void handleDeleteRoom(room)}
                                        className="px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white rounded cursor-pointer"
                                      >
                                        {busyId === room.id ? '...' : 'Delete'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })()}

      {/* SECTION: DEDICATED ARRIVALS & CHECK-IN BOARD (TODAY vs FUTURE vs OVERDUE) */}
      {section === 'arrivals' && (
        <div className="space-y-4">
          {/* Today's Date Anchor & Clear Separation Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#1c46be] flex items-center justify-center shrink-0">
                <PlaneLanding className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#1c46be]">
                  Today is{' '}
                  {new Date(`${todayIso}T00:00:00Z`).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </p>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Arrivals &amp; Check-In Schedule
                </h2>
                <p className="text-xs text-slate-500">
                  Today&apos;s expected check-ins are separated cleanly from upcoming scheduled dates and overdue arrivals.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                aria-label="Filter arrivals by source"
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium"
              >
                <option value="ALL">All Booking Sources</option>
                {PRIMARY_BOOKING_SOURCES.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onNavigateSection?.('reservations')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                All Reservations
              </button>
              <button
                type="button"
                onClick={() => onNavigateSection?.('in_house')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                In-House ({reservationMetrics.checked_in})
              </button>
            </div>
          </div>

          {/* 4 Distinct Arrival Bucket Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setArrivalsTab('today')}
              className={`text-left rounded-xl p-4 border transition-all cursor-pointer ${
                arrivalsTab === 'today'
                  ? 'bg-[#061539] border-[#061539] text-white shadow-sm'
                  : 'bg-white border-slate-200 hover:border-blue-300 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    arrivalsTab === 'today' ? 'text-amber-300' : 'text-[#1c46be]'
                  }`}
                >
                  Due Today ({todayIso})
                </span>
                <PlaneLanding className="w-4 h-4 opacity-80" />
              </div>
              <p className="font-mono-tabular text-2xl font-bold mt-1">
                {arrivalsTodayList.length}
              </p>
              <p
                className={`text-[11px] mt-1 ${
                  arrivalsTab === 'today' ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                Expected check-ins for today only
              </p>
            </button>

            <button
              type="button"
              onClick={() => setArrivalsTab('future')}
              className={`text-left rounded-xl p-4 border transition-all cursor-pointer ${
                arrivalsTab === 'future'
                  ? 'bg-[#1c46be] border-[#1c46be] text-white shadow-sm'
                  : 'bg-white border-slate-200 hover:border-blue-300 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    arrivalsTab === 'future' ? 'text-blue-100' : 'text-slate-600'
                  }`}
                >
                  Upcoming Arrivals
                </span>
                <CalendarPlus className="w-4 h-4 opacity-80" />
              </div>
              <p className="font-mono-tabular text-2xl font-bold mt-1">
                {arrivalsFutureList.length}
              </p>
              <p
                className={`text-[11px] mt-1 ${
                  arrivalsTab === 'future' ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                {arrivalsFutureList[0]
                  ? `Next: ${arrivalsFutureList[0].checkInDate === tomorrowIso ? 'Tomorrow' : arrivalsFutureList[0].checkInDate}`
                  : 'No upcoming scheduled dates'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setArrivalsTab('overdue')}
              className={`text-left rounded-xl p-4 border transition-all cursor-pointer ${
                arrivalsTab === 'overdue'
                  ? 'bg-rose-700 border-rose-700 text-white shadow-sm'
                  : arrivalsOverdueList.length > 0
                    ? 'bg-rose-50/70 border-rose-200 hover:border-rose-300 text-rose-950'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    arrivalsTab === 'overdue'
                      ? 'text-rose-100'
                      : arrivalsOverdueList.length > 0
                        ? 'text-rose-700'
                        : 'text-slate-600'
                  }`}
                >
                  Overdue / Past Expected
                </span>
                <Clock className="w-4 h-4 opacity-80" />
              </div>
              <p className="font-mono-tabular text-2xl font-bold mt-1">
                {arrivalsOverdueList.length}
              </p>
              <p
                className={`text-[11px] mt-1 ${
                  arrivalsTab === 'overdue'
                    ? 'text-rose-100'
                    : arrivalsOverdueList.length > 0
                      ? 'text-rose-700'
                      : 'text-slate-500'
                }`}
              >
                Check-in date passed &amp; still pending
              </p>
            </button>

            <button
              type="button"
              onClick={() => setArrivalsTab('checked_in_today')}
              className={`text-left rounded-xl p-4 border transition-all cursor-pointer ${
                arrivalsTab === 'checked_in_today'
                  ? 'bg-emerald-700 border-emerald-700 text-white shadow-sm'
                  : 'bg-white border-slate-200 hover:border-emerald-300 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    arrivalsTab === 'checked_in_today' ? 'text-emerald-100' : 'text-emerald-700'
                  }`}
                >
                  Checked-In Today
                </span>
                <CheckCircle2 className="w-4 h-4 opacity-80" />
              </div>
              <p className="font-mono-tabular text-2xl font-bold mt-1">
                {arrivalsCheckedInTodayList.length}
              </p>
              <p
                className={`text-[11px] mt-1 ${
                  arrivalsTab === 'checked_in_today' ? 'text-emerald-100' : 'text-slate-500'
                }`}
              >
                Arrived and checked in today
              </p>
            </button>
          </div>

          {/* Active Arrival Bucket Content */}
          {(() => {
            const renderArrivalCard = (res: ReservationRecord, mode: 'today' | 'future' | 'overdue' | 'checked_in_today') => {
              const paySummary = getReservationPaymentSummary(
                res,
                property.usdExchangeRateNgn
              );
              const {
                totalAmount,
                otaPaidAmount,
                hotelPaidAmount,
                balance,
                paymentStatus,
                sourceCurrency,
                sourceTotalAmount,
              } = paySummary;
              const roomDisplay = getReservationRoomDisplay(res, rooms);
              const hkStatus = roomDisplay.room?.housekeepingStatus;
              const isRoomReady = hkStatus === 'clean' || hkStatus === 'inspected';
              const daysDelta =
                mode === 'future'
                  ? diffNights(todayIso, res.checkInDate)
                  : mode === 'overdue'
                    ? diffNights(res.checkInDate, todayIso)
                    : 0;

              const timingBadge =
                mode === 'today'
                  ? 'ARRIVING TODAY'
                  : mode === 'checked_in_today'
                    ? 'CHECKED IN TODAY'
                    : mode === 'future'
                      ? res.checkInDate === tomorrowIso
                        ? 'TOMORROW'
                        : `IN ${daysDelta} DAYS`
                      : `OVERDUE · ${daysDelta}D PAST DUE`;

              const timingClass =
                mode === 'today'
                  ? 'bg-blue-100 text-[#061539] border-blue-200'
                  : mode === 'checked_in_today'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : mode === 'future'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200';

              const otaCheckInBlock = getCheckInDateRestriction(res, todayIso);
              const otaCancelBlock = getOtaCancellationRestriction(res);
              const isAwaitingCheckIn = res.status === 'confirmed' || res.status === 'pending';
              const canEdit =
                res.status !== 'cancelled' &&
                res.status !== 'checked_out' &&
                res.status !== 'no_show';
              const canCheckIn = isAwaitingCheckIn && !otaCheckInBlock.restricted;
              const canCancel = canEdit && !otaCancelBlock.restricted;

              return (
                <div
                  key={res.id}
                  onClick={() => onSelectReservation?.(res.id)}
                  className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 transition-colors cursor-pointer space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Guest & Timing */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold tracking-wide ${timingClass}`}>
                          {timingBadge}
                        </span>
                        <span className="font-mono-tabular text-[11px] font-bold text-slate-600">
                          {res.bookingRef}
                        </span>
                        <span className="text-[11px] font-medium text-slate-600 px-2 py-0.5 rounded bg-slate-100">
                          {formatBookingSourceLabel(res.channel)}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                            res.status === 'confirmed'
                              ? 'bg-blue-50 text-blue-700'
                              : res.status === 'pending'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {RESERVATION_STATUS_LABELS[res.status] || res.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openGuestByReservation(res)}
                          className="font-display text-base font-bold text-slate-900 hover:text-[#1c46be] hover:underline text-left cursor-pointer"
                        >
                          {res.guestName}
                        </button>
                        {res.guestPhone && (
                          <span className="inline-flex items-center gap-1 text-xs font-mono-tabular text-slate-600">
                            <Phone className="w-3 h-3" />
                            <span>{res.guestPhone}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          {res.adults || 1}A / {res.children || 0}C
                        </span>
                      </div>
                    </div>

                    {/* Room, Dates & Payment */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-5 text-xs shrink-0">
                      {/* Room & Housekeeping Readiness */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-[165px]">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">
                          Assigned Room
                        </p>
                        {roomDisplay.isAssigned ? (
                          <div className="mt-0.5">
                            <p className="font-mono-tabular font-bold text-slate-900">
                              {roomDisplay.roomNumberLabel} ·{' '}
                              <span className="font-sans font-medium text-slate-700">
                                {roomDisplay.roomTypeLabel}
                              </span>
                            </p>
                            <p
                              className={`text-[11px] font-semibold mt-0.5 ${
                                isRoomReady ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {isRoomReady
                                ? `Ready (${hkStatus})`
                                : `Housekeeping: ${hkStatus || 'check status'}`}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                            <p className="font-semibold text-amber-700">Unassigned ({roomDisplay.roomTypeLabel})</p>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectReservation?.(res.id);
                                setEditingStayDetails(true);
                              }}
                              className="text-[11px] font-bold text-[#1c46be] hover:underline cursor-pointer"
                            >
                              Assign Room Now
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Stay Dates */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-[175px]">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">
                          Check-in → Check-out
                        </p>
                        <p className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                          {res.checkInDate} → {res.checkOutDate}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {res.nights} night{res.nights !== 1 ? 's' : ''}
                        </p>
                      </div>

                      {/* Payment Status & Separated OTA / Property Breakdown */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-[235px] space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase text-slate-500">
                            Payment Breakdown
                          </p>
                          <span
                            className={`text-[10px] font-bold ${
                              paymentStatus === 'Paid'
                                ? 'text-emerald-700'
                                : paymentStatus === 'Partial'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                            }`}
                          >
                            {paymentStatus}
                          </span>
                        </div>
                        {isOtaBookingChannel(res.channel) ? (
                          <>
                            <p className="font-mono-tabular text-[11px] text-blue-800 font-semibold">
                              Paid to OTA:{' '}
                              {formatChannelCurrency(paySummary.otaPaidSourceAmount, sourceCurrency)}{' '}
                              {sourceCurrency}
                              <span className="text-[10px] font-normal text-blue-700 ml-1">
                                (≈ {formatNgn(paySummary.otaPaidAmount)})
                              </span>
                            </p>
                            <p className="font-mono-tabular text-[11px] text-slate-900 font-semibold">
                              Expected Payout: {formatNgn(paySummary.expectedPayoutNgn)}
                              <span className="text-[10px] font-normal text-slate-500 ml-1">
                                (≈ {formatUsd(paySummary.expectedPayoutUsd)} USD)
                              </span>
                            </p>
                            <p className="font-mono-tabular text-[11px] text-emerald-700">
                              Direct to {property.name.split(' ')[0]}: {formatNgn(hotelPaidAmount)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-mono-tabular font-bold text-slate-900 text-xs">
                              Total: {formatNgn(totalAmount)}{' '}
                              <span className="text-[10px] font-medium text-slate-500">
                                (≈ {formatUsd(paySummary.totalAmountUsd)} USD)
                              </span>
                            </p>
                            <p className="font-mono-tabular text-[11px] text-emerald-700 font-semibold">
                              Direct to Property: {formatNgn(hotelPaidAmount)}
                            </p>
                          </>
                        )}
                        <p
                          className={`font-mono-tabular text-[11px] font-bold ${
                            balance > 0 ? 'text-rose-700' : 'text-slate-600'
                          }`}
                        >
                          Hotel Balance Due: {formatNgn(balance)}
                          {balance > 0 && (
                            <span className="text-[10px] font-normal text-rose-600 ml-1">
                              (≈ {formatUsd(paySummary.balanceUsd)} USD)
                            </span>
                          )}
                        </p>
                        {paySummary.cautionDepositEnabled && paySummary.cautionDepositCollectedNgn > 0 && (
                          <p className="font-mono-tabular text-[10px] font-semibold text-amber-800">
                            Caution: {formatNgn(paySummary.cautionDepositCollectedNgn)}{' '}
                            {paySummary.cautionDepositRefunded ? '· Refunded' : '· Held'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct Actions Row */}
                  <div
                    className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[11px] text-slate-500">
                      Booked on <span className="font-mono-tabular">{getReservationBookedDate(res)}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectReservation?.(res.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Folio</span>
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectReservation?.(res.id);
                            setEditingStayDetails(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit / Assign Room</span>
                        </button>
                      )}
                      {canCheckIn && (
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() => setCheckInTarget(res)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white font-semibold cursor-pointer ${
                            mode === 'future'
                              ? 'bg-[#1c46be] hover:bg-blue-800'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>{mode === 'future' ? 'Early Check-in' : 'Check-in Guest'}</span>
                        </button>
                      )}
                      {isAwaitingCheckIn && otaCheckInBlock.restricted && (
                        <span
                          title={otaCheckInBlock.message}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-semibold text-[11px]"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Check-in opens {otaCheckInBlock.checkInIso}</span>
                        </span>
                      )}
                      {res.status === 'checked_in' && (
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() => setCheckoutTarget(res)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                        >
                          Check-out
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() => openCancelDialog(res)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                      {canEdit && otaCancelBlock.restricted && (
                        <button
                          type="button"
                          title={otaCancelBlock.message}
                          onClick={() => {
                            setActionError(otaCancelBlock.message);
                            onNotify(otaCancelBlock.message);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-900 font-semibold text-[11px] cursor-pointer"
                        >
                          Cancel via {otaCancelBlock.platformLabel}
                        </button>
                      )}
                      {canManageRooms && confirmDeleteResId !== res.id && (
                        <button
                          type="button"
                          disabled={busyId === res.id}
                          onClick={() => setConfirmDeleteResId(res.id)}
                          title="Delete reservation"
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canManageRooms && confirmDeleteResId === res.id && (
                        <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteResId(null)}
                            className="px-1.5 py-0.5 text-[11px] text-slate-600 cursor-pointer"
                          >
                            No
                          </button>
                          <button
                            type="button"
                            disabled={busyId === res.id}
                            onClick={() => void handleDeleteReservation(res)}
                            className="px-2 py-0.5 text-[11px] font-semibold bg-rose-600 text-white rounded cursor-pointer"
                          >
                            {busyId === res.id ? '...' : 'Confirm'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            };

            if (arrivalsTab === 'today') {
              return arrivalsTodayList.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                  <p className="font-display text-sm font-bold text-slate-900">
                    No pending arrivals scheduled for today ({todayIso})
                  </p>
                  <p className="text-xs text-slate-500">
                    {arrivalsFutureList.length > 0
                      ? `You have ${arrivalsFutureList.length} upcoming arrival(s) scheduled — switch to the Upcoming Arrivals tab to inspect them.`
                      : 'Use New Reservation or Walk-in Check-in above to register a guest for today.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {arrivalsTodayList.map((r) => renderArrivalCard(r, 'today'))}
                </div>
              );
            }

            if (arrivalsTab === 'future') {
              return futureArrivalsByDate.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                  No upcoming arrivals scheduled beyond {todayIso}.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 font-medium">
                    Upcoming Arrivals Schedule — Guests below are scheduled for check-in dates after today ({todayIso}).
                  </div>
                  {futureArrivalsByDate.map((grp) => (
                    <div key={grp.dateIso} className="space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#061539]">
                          {grp.dateIso === tomorrowIso ? `Tomorrow · ${grp.dateIso}` : grp.dateIso} ·{' '}
                          {new Date(`${grp.dateIso}T00:00:00Z`).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </h3>
                        <span className="font-mono-tabular text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {grp.items.length} arrival{grp.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {grp.items.map((r) => renderArrivalCard(r, 'future'))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            if (arrivalsTab === 'overdue') {
              return arrivalsOverdueList.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-emerald-700 font-medium">
                  No overdue expected arrivals — all prior check-in dates have been processed.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium">
                    Overdue Expected Arrivals — Check-in date has already passed without check-in or cancellation.
                  </div>
                  {arrivalsOverdueList.map((r) => renderArrivalCard(r, 'overdue'))}
                </div>
              );
            }

            return arrivalsCheckedInTodayList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                No guests with a {todayIso} arrival date have checked in yet today.
              </div>
            ) : (
              <div className="space-y-3">
                {arrivalsCheckedInTodayList.map((r) => renderArrivalCard(r, 'checked_in_today'))}
              </div>
            );
          })()}
        </div>
      )}

      {/* SECTION: RESERVATION, IN-HOUSE, FRONT DESK */}
      {isStayTableSection && (
        <div className="space-y-4">
          {/* Operational Reservation Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Total Reservations
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-[#061539] mt-1 leading-none">
                {reservationMetrics.total}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Across all booking channels
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Confirmed &amp; Pending
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-amber-800 mt-1 leading-none">
                {reservationMetrics.confirmed + reservationMetrics.pending}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5 font-mono-tabular">
                {reservationMetrics.confirmed} confirmed · {reservationMetrics.pending} pending
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Checked-in Guests
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-emerald-700 mt-1 leading-none">
                {reservationMetrics.checked_in}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Active in-house folios
              </p>
            </div>
          </div>

          {/* Interactive Stay Workflow & Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('reservations')}
                  className={`h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'reservations'
                      ? 'bg-[#1c46be] text-white shadow-xs'
                      : 'bg-blue-50/70 text-[#0B245B] hover:bg-blue-100'
                  }`}
                >
                  <span>1. {cms.pages.reservations.navLabel || 'Reservations'}</span>
                </button>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('arrivals')}
                  className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer bg-sky-50 text-sky-900 hover:bg-sky-100 border border-sky-200"
                >
                  <PlaneLanding className="w-3.5 h-3.5 text-sky-700" />
                  <span>2. Arrivals</span>
                </button>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('in_house')}
                  className={`h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'in_house'
                      ? 'bg-[#061539] text-white shadow-xs'
                      : 'bg-violet-50 text-violet-900 hover:bg-violet-100 border border-violet-200'
                  }`}
                >
                  <DoorOpen className="w-3.5 h-3.5" />
                  <span>3. In-House</span>
                </button>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('front_desk')}
                  className={`h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'front_desk'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-teal-50 text-teal-900 hover:bg-teal-100 border border-teal-200'
                  }`}
                >
                  <BookOpenCheck className="w-3.5 h-3.5" />
                  <span>4. Front Desk &amp; Folio</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const firstActive = filteredReservations[0] || reservations[0];
                    if (firstActive) {
                      onSelectReservation?.(firstActive.id);
                    } else {
                      onNotify('Select or create a reservation to open its Guest Folio.');
                    }
                  }}
                  className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Open Active Folio</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  aria-label="Filter by Booking Source"
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="h-10 border border-slate-200 rounded-lg px-3 bg-white text-slate-700 font-medium"
                >
                  <option value="ALL">All Booking Sources</option>
                  {PRIMARY_BOOKING_SOURCES.map((src) => (
                    <option key={src.value} value={src.value}>
                      {src.label}
                    </option>
                  ))}
                </select>

                <div className="h-10 inline-flex items-center gap-1 px-1 bg-slate-100 rounded-lg border border-slate-200/70">
                  {(['all', 'Paid', 'Partial', 'Unpaid'] as const).map((payKey) => (
                    <button
                      key={payKey}
                      type="button"
                      onClick={() => setFilterPaymentStatus(payKey)}
                      className={`h-8 px-2.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        filterPaymentStatus === payKey
                          ? 'bg-[#061539] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {payKey === 'all' ? 'All Payments' : payKey}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {section === 'reservations' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100 text-xs">
                {(
                  [
                    'all',
                    'confirmed',
                    'pending',
                    'checked_in',
                    'checked_out',
                    'cancelled',
                    'no_show',
                  ] as const
                ).map((statusKey) => {
                  const count =
                    statusKey === 'all'
                      ? reservationMetrics.total
                      : reservationMetrics[statusKey] || 0;
                  const activeClass =
                    statusKey === 'confirmed'
                      ? 'bg-[#1c46be] text-white'
                      : statusKey === 'pending'
                        ? 'bg-amber-600 text-white'
                        : statusKey === 'checked_in'
                          ? 'bg-emerald-600 text-white'
                          : statusKey === 'cancelled' || statusKey === 'no_show'
                            ? 'bg-rose-600 text-white'
                            : 'bg-[#061539] text-white';
                  return (
                    <button
                      key={statusKey}
                      type="button"
                      onClick={() => setResStatusFilter(statusKey)}
                      className={`h-8 px-3 rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        resStatusFilter === statusKey
                          ? activeClass
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {statusKey === 'all' ? 'All' : RESERVATION_STATUS_LABELS[statusKey]}{' '}
                      <span className="font-mono-tabular opacity-85">({count})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1580px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-gradient-to-r from-[#061539] via-[#0B245B] to-[#1c46be] text-[11px] font-bold uppercase tracking-wide text-blue-50 whitespace-nowrap">
                    <th className="py-3.5 px-3.5">Guest Name</th>
                    <th className="py-3.5 px-3.5">Room Number</th>
                    <th className="py-3.5 px-3.5">Room Type</th>
                    <th className="py-3.5 px-3.5">Check-in</th>
                    <th className="py-3.5 px-3.5">Check-out</th>
                    <th className="py-3.5 px-3.5 text-center">Nights</th>
                    <th className="py-3.5 px-3.5">Adults/Children</th>
                    <th className="py-3.5 px-3.5">Booking Source</th>
                    <th className="py-3.5 px-3.5 text-right">Total Amount</th>
                    <th className="py-3.5 px-3.5 text-right">Amount Paid</th>
                    <th className="py-3.5 px-3.5 text-right">Balance</th>
                    <th className="py-3.5 px-3.5">Payment Status</th>
                    <th className="py-3.5 px-3.5">Reservation Status</th>
                    <th className="py-3.5 px-3.5">Date Booked</th>
                    <th className="py-3.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredReservations.map((res) => {
                    const {
                      totalAmount,
                      totalAmountUsd,
                      otaPaidAmount,
                      hotelPaidAmount,
                      expectedPayoutNgn,
                      actualPayoutReceivedNgn,
                      otaPayoutStatus,
                      totalReceivedByHotelNgn,
                      amountDueAtPropertyNgn,
                      paymentCollectionMode,
                      paymentStatus,
                      sourceCurrency,
                      sourceTotalAmount,
                      otaPaidSourceAmount,
                      cautionDepositEnabled: rowCautionEnabled,
                      cautionDepositCollectedNgn: rowCautionCollected,
                      cautionDepositRefunded: rowCautionRefunded,
                    } = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
                    const isOtaRow = isOtaBookingChannel(res.channel);
                    const isOtaCollectedRow = paymentCollectionMode === 'ota_prepaid';
                    const bookedDate = getReservationBookedDate(res);
                    const adultsCount = res.adults || 1;
                    const kidsCount = res.children || 0;
                    const roomDisplay = getReservationRoomDisplay(res, rooms);
                    const isArrivingToday =
                      (res.status === 'confirmed' || res.status === 'pending') &&
                      res.checkInDate <= todayIso;
                    const isDueOutToday =
                      res.status === 'checked_in' && res.checkOutDate <= todayIso;
                    const otaCheckInBlock = getCheckInDateRestriction(res, todayIso);
                    const otaCancelBlock = getOtaCancellationRestriction(res);
                    const isAwaitingCheckIn = res.status === 'confirmed' || res.status === 'pending';
                    const canEdit =
                      res.status !== 'cancelled' &&
                      res.status !== 'checked_out' &&
                      res.status !== 'no_show';
                    const canCheckIn = isAwaitingCheckIn && !otaCheckInBlock.restricted;
                    const canCancel = canEdit && !otaCancelBlock.restricted;

                    const paymentStatusColor =
                      paymentStatus === 'Paid'
                        ? 'text-emerald-700'
                        : paymentStatus === 'Paid to OTA'
                          ? 'text-blue-700'
                          : paymentStatus === 'Partial'
                            ? 'text-amber-700'
                            : 'text-rose-700';

                    const resStatusColor =
                      res.status === 'checked_in'
                        ? 'text-emerald-700'
                        : res.status === 'confirmed'
                          ? 'text-blue-700'
                          : res.status === 'pending'
                            ? 'text-amber-700'
                            : res.status === 'cancelled' || res.status === 'no_show'
                              ? 'text-rose-700'
                              : 'text-slate-600';

                    return (
                      <tr
                        key={res.id}
                        onClick={() => onSelectReservation?.(res.id)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openGuestByReservation(res)}
                            className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline text-left cursor-pointer"
                          >
                            {res.guestName}
                          </button>
                          <p className="text-[11px] text-slate-500 font-mono-tabular">
                            {res.bookingRef}
                            {res.guestPhone ? ` · ${res.guestPhone}` : ''}
                          </p>
                        </td>

                        <td
                          className="py-3 px-3.5 whitespace-nowrap"
                          onClick={(e) => {
                            if (!roomDisplay.isAssigned) e.stopPropagation();
                          }}
                        >
                          {roomDisplay.isAssigned ? (
                            <span className="font-mono-tabular font-bold text-emerald-700">
                              {roomDisplay.roomNumberLabel}
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="block text-[11px] font-semibold text-amber-700">
                                Unassigned
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectReservation?.(res.id);
                                  setEditingStayDetails(true);
                                }}
                                className="text-[11px] font-semibold text-[#1c46be] hover:underline cursor-pointer"
                              >
                                Edit to assign
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-slate-700 whitespace-nowrap">
                          {roomDisplay.roomTypeLabel}
                        </td>

                        <td className="py-3 px-3.5 font-mono-tabular text-slate-800 whitespace-nowrap">
                          <span>{res.checkInDate}</span>
                          {isArrivingToday && (
                            <span className="block text-[10px] font-sans font-semibold text-blue-700">
                              Arriving Today
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 font-mono-tabular text-slate-800 whitespace-nowrap">
                          <span>{res.checkOutDate}</span>
                          {isDueOutToday && (
                            <span className="block text-[10px] font-sans font-semibold text-amber-700">
                              Due Out
                            </span>
                          )}
                          {(res.checkOutTime || (res.lateCheckoutFeeNgn || 0) > 0) && (
                            <span className="block text-[10px] font-semibold text-amber-700">
                              {res.checkOutTime ? `Out ${res.checkOutTime}` : 'Late Out'}
                              {(res.lateCheckoutFeeNgn || 0) > 0
                                ? ` · +${formatNgn(res.lateCheckoutFeeNgn || 0)}`
                                : ''}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-center font-mono-tabular font-semibold text-slate-800 whitespace-nowrap">
                          {res.nights}
                        </td>

                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <p className="font-mono-tabular font-medium text-slate-800">
                            {adultsCount}A / {kidsCount}C
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {adultsCount} Adult{adultsCount !== 1 ? 's' : ''} · {kidsCount} Child
                            {kidsCount !== 1 ? 'ren' : ''}
                          </p>
                        </td>

                        <td className="py-3 px-3.5 text-slate-700 font-medium whitespace-nowrap">
                          <span className="block">{formatBookingSourceLabel(res.channel)}</span>
                          <span className="block text-[10px] font-semibold text-slate-500">
                            {formatPaymentCollectionLabel(paymentCollectionMode)}
                          </span>
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                          {isOtaRow && sourceCurrency !== 'NGN' && sourceTotalAmount > 0 ? (
                            <>
                              <span className="block text-[#1c46be] font-bold">
                                {formatChannelCurrency(sourceTotalAmount, sourceCurrency)}{' '}
                                {sourceCurrency}
                              </span>
                              <span className="block text-[10px] font-medium text-slate-600">
                                ≈ {formatNgn(expectedPayoutNgn)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="block">{formatNgn(totalAmount)}</span>
                              <span className="block text-[10px] font-medium text-blue-700">
                                ≈ {formatUsd(totalAmountUsd)} USD
                              </span>
                            </>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono-tabular whitespace-nowrap">
                          {isOtaCollectedRow ? (
                            <>
                              <span className="block font-semibold text-emerald-700">
                                Hotel Recv: {formatNgn(totalReceivedByHotelNgn)}
                              </span>
                              <span className="block text-[10px] text-blue-700">
                                Paid to OTA:{' '}
                                {sourceCurrency !== 'NGN' && otaPaidSourceAmount > 0
                                  ? `${formatChannelCurrency(otaPaidSourceAmount, sourceCurrency)} ${sourceCurrency}`
                                  : formatNgn(otaPaidAmount || expectedPayoutNgn)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="block font-semibold text-emerald-700">
                                {formatNgn(totalReceivedByHotelNgn)}
                              </span>
                              <span className="block text-[10px] text-slate-500">
                                Direct Received: {formatNgn(hotelPaidAmount)}
                              </span>
                            </>
                          )}
                        </td>

                        <td
                          className={`py-3 px-3.5 text-right font-mono-tabular font-bold whitespace-nowrap ${
                            amountDueAtPropertyNgn > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          <span className="block">{formatNgn(amountDueAtPropertyNgn)}</span>
                          <span className="block text-[10px] font-normal text-slate-500">
                            {amountDueAtPropertyNgn > 0 ? 'Due at property' : '₦0 due at property'}
                          </span>
                        </td>

                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className={`font-semibold ${paymentStatusColor}`}>
                            {paymentStatus}
                          </span>
                          {isOtaCollectedRow ? (
                            <span
                              className={`block text-[10px] font-semibold mt-0.5 ${
                                otaPayoutStatus === 'received'
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {otaPayoutStatus === 'received'
                                ? `OTA Payout: Received (${formatNgn(actualPayoutReceivedNgn)})`
                                : `OTA Payout: Pending (${formatNgn(expectedPayoutNgn)})`}
                            </span>
                          ) : (
                            <span className="block text-[10px] font-medium text-slate-500 mt-0.5">
                              {amountDueAtPropertyNgn <= 0 ? 'Direct Settled' : 'Collect at Property'}
                            </span>
                          )}
                          {rowCautionEnabled && rowCautionCollected > 0 && (
                            <span className="block text-[10px] font-mono-tabular text-amber-800 mt-0.5">
                              Caution: {formatNgn(rowCautionCollected)}{' '}
                              {rowCautionRefunded ? '(Refunded)' : '(Held)'}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className={`font-semibold ${resStatusColor}`}>
                            {RESERVATION_STATUS_LABELS[res.status] || res.status}
                          </span>
                          {res.status === 'cancelled' && res.cancellationType && (
                            <span className="block text-[10px] font-medium text-rose-700 mt-0.5">
                              {res.cancellationType === 'paid'
                                ? `Fee: ${formatNgn(res.cancellationFeeNgn || 0)}`
                                : 'Free Cancellation'}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {bookedDate}
                        </td>

                        <td className="py-3 px-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectReservation?.(res.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setReceiptModalState({
                                  reservation: res,
                                  mode:
                                    res.status === 'checked_out'
                                      ? 'check_out'
                                      : res.status === 'checked_in'
                                        ? 'check_in'
                                        : 'reservation_payment',
                                })
                              }
                              title="Print or download official receipt"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Receipt</span>
                            </button>
                            {canManageRooms && (
                              <button
                                type="button"
                                onClick={() => setPaymentModalResId(res.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Payment</span>
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectReservation?.(res.id);
                                  setEditingStayDetails(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                            )}
                            {canCheckIn && (
                              <button
                                type="button"
                                disabled={busyId === res.id}
                                onClick={() => setCheckInTarget(res)}
                                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Check-in
                              </button>
                            )}
                            {isAwaitingCheckIn && otaCheckInBlock.restricted && (
                              <span
                                title={otaCheckInBlock.message}
                                className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800 font-medium text-[10px] whitespace-nowrap shrink-0"
                              >
                                Check-in {otaCheckInBlock.checkInIso}
                              </span>
                            )}
                            {res.status === 'checked_in' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === res.id}
                                  onClick={() => openChangeRoomModal(res)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                  <span>Room</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === res.id}
                                  onClick={() => setCheckoutTarget(res)}
                                  className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Check-out
                                </button>
                              </>
                            )}
                            {canCancel && (
                              <button
                                type="button"
                                disabled={busyId === res.id}
                                onClick={() => openCancelDialog(res)}
                                className="px-2.5 py-1 rounded-md border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                            {canEdit && otaCancelBlock.restricted && (
                              <button
                                type="button"
                                title={otaCancelBlock.message}
                                onClick={() => {
                                  setActionError(otaCancelBlock.message);
                                  onNotify(otaCancelBlock.message);
                                }}
                                className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-900 font-medium text-[10px] whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Cancel via {otaCancelBlock.platformLabel}
                              </button>
                            )}
                            {canManageRooms && confirmDeleteResId !== res.id && (
                              <button
                                type="button"
                                disabled={busyId === res.id}
                                onClick={() => setConfirmDeleteResId(res.id)}
                                title="Delete reservation"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            )}
                            {canManageRooms && confirmDeleteResId === res.id && (
                              <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteResId(null)}
                                  className="px-1.5 py-0.5 text-[10px] text-slate-600 cursor-pointer"
                                >
                                  No
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === res.id}
                                  onClick={() => void handleDeleteReservation(res)}
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white rounded cursor-pointer"
                                >
                                  {busyId === res.id ? '...' : 'Confirm'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredReservations.length === 0 && (
                    <tr>
                      <td colSpan={15} className="py-10 text-center text-xs text-slate-500">
                        {section === 'in_house'
                          ? 'No in-house guests checked in at the moment.'
                          : 'No matching reservations found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: GUEST PROFILES */}
      {section === 'guests' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Guest Name</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">City / Country</th>
                  <th className="py-3 px-4">KYC Document</th>
                  <th className="py-3 px-4">VIP Tier</th>
                  <th className="py-3 px-4 text-right">Stays</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredGuests.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => openGuestProfileModal(g)}
                    className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{g.fullName}</p>
                      {g.notes && <p className="text-[11px] text-slate-500">{g.notes}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono-tabular text-slate-800">{g.phone}</p>
                      <p className="text-[11px] text-slate-500">{g.email || '—'}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {[g.city, g.nationality].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700">
                      {g.idType} {g.idNumber ? `· ${g.idNumber}` : ''}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-700">{g.vipTier}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{g.totalStays}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(g.lifetimeSpendNgn)}
                    </td>
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openGuestProfileModal(g)}
                          className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
                        >
                          View Profile
                        </button>
                        {canManageRooms && confirmDeleteGuestId !== g.id && (
                          <button
                            type="button"
                            disabled={busyId === g.id}
                            onClick={() => setConfirmDeleteGuestId(g.id)}
                            title="Delete guest record"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                        {canManageRooms && confirmDeleteGuestId === g.id && (
                          <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGuestId(null)}
                              className="px-1.5 py-0.5 text-[10px] text-slate-600 cursor-pointer"
                            >
                              No
                            </button>
                            <button
                              type="button"
                              disabled={busyId === g.id}
                              onClick={() => void handleDeleteGuest(g)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white rounded cursor-pointer"
                            >
                              {busyId === g.id ? '...' : 'Confirm'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* DEDICATED FULL PAGES FOR MAJOR OPERATIONS */}
      {isDedicatedSubpage && (
        <div className="space-y-6">
          {editingRoom && canManageRooms ? (
            <form
              onSubmit={handleSaveRoomEditor}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingRoom(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Rooms</span>
                  </button>
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Edit Room &amp; Rates — {editingRoom.roomNumber}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Update pricing in Naira (₦), room classification, status, amenities, and room photography ·{' '}
                      <span className="font-mono-tabular">{systemPropertyId}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const id = editingRoom.id;
                    setEditingRoom(null);
                    setSelectedRoomDetailId(id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BedDouble className="w-3.5 h-3.5" />
                  <span>View Room Details</span>
                </button>
              </div>

              {editRoomError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                  {editRoomError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Room Code</label>
                  <input
                    type="text"
                    required
                    value={draftRoomNumber}
                    onChange={(e) => setDraftRoomNumber(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Section</label>
                  <select
                    value={draftSection}
                    onChange={(e) => setDraftSection(e.target.value as RoomSection)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Serviced Apartment">Serviced Apartment Section</option>
                    <option value="Hotel Rooms">Hotel Rooms</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Room Type</label>
                  <input
                    type="text"
                    required
                    value={draftRoomType}
                    onChange={(e) => setDraftRoomType(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Nightly Rate (₦ NGN)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="e.g. 87,000"
                    value={draftRateInput}
                    onChange={(e) => {
                      setEditRoomError(null);
                      handleCommaPriceChange(e, draftRateInput, setDraftRateInput);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Max Guests</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={draftMaxGuests}
                    onChange={(e) => setDraftMaxGuests(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Occupancy Status</label>
                  <select
                    value={draftOccupancy}
                    onChange={(e) =>
                      setDraftOccupancy(e.target.value as RoomRecord['occupancyStatus'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="vacant">Vacant / Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="occupied">Occupied</option>
                    <option value="out_of_order">Out of Order</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800">Housekeeping Status: </span>
                    <span className="capitalize font-semibold text-emerald-700">
                      {editingRoom.housekeepingStatus === 'inspected'
                        ? 'clean'
                        : editingRoom.housekeepingStatus}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      Managed exclusively on the Housekeeping page.
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-slate-800">
                    Room Amenities (comma-separated, up to 15)
                  </label>
                  <span className="font-mono-tabular text-[11px] text-slate-500">
                    {
                      draftAmenitiesText
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean).length
                    }
                    /15
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="King Bed, Wi-Fi, Smart TV, Fitted Kitchenette, 24/7 Power"
                  value={draftAmenitiesText}
                  onChange={(e) => setDraftAmenitiesText(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'King Bed',
                    'Wi-Fi',
                    'Smart TV',
                    'Fitted Kitchenette',
                    '24/7 Power',
                    'Work Desk',
                    'Split AC',
                    'En-Suite Shower',
                    'Private Balcony',
                    'Tea & Coffee Station',
                  ].map((preset) => {
                    const currentList = draftAmenitiesText
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const isActive = currentList.some(
                      (item) => item.toLowerCase() === preset.toLowerCase()
                    );
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          if (isActive) {
                            setDraftAmenitiesText(
                              currentList
                                .filter((item) => item.toLowerCase() !== preset.toLowerCase())
                                .join(', ')
                            );
                          } else if (currentList.length < 15) {
                            setDraftAmenitiesText([...currentList, preset].join(', '));
                          }
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#061539] text-white border-[#061539]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isActive ? `✓ ${preset}` : `+ ${preset}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-800 block">
                      Room Photo Gallery Slides ({draftGalleryImages.length} / 6)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Add up to 6 photos for the room gallery slider. Click any slide to set it as the cover image.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileSelect}
                      className="hidden"
                    />
                    <input
                      ref={gallerySlideFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleGallerySlideFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Upload Cover Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => gallerySlideFileInputRef.current?.click()}
                      disabled={draftGalleryImages.length >= 6}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#061539] rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Gallery Slide</span>
                    </button>
                  </div>
                </div>

                {uploadError && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700">
                    {uploadError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                  <div className="sm:col-span-5 space-y-2">
                    <div className="h-40 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
                      <img
                        src={draftImageUrl || DEFAULT_SUITE_IMAGE}
                        alt="Room Cover Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_SUITE_IMAGE;
                        }}
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-950/75 text-white text-[10px] font-semibold">
                        Cover Slide
                      </span>
                    </div>
                    {draftGalleryImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {draftGalleryImages.map((slideUrl, idx) => {
                          const isCover = slideUrl === draftImageUrl;
                          return (
                            <div
                              key={`${slideUrl.slice(0, 32)}-${idx}`}
                              className={`relative h-14 rounded-lg overflow-hidden border-2 ${
                                isCover ? 'border-emerald-600' : 'border-slate-200'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => promoteDraftSlideToCover(slideUrl)}
                                title="Set as cover slide"
                                className="w-full h-full cursor-pointer"
                              >
                                <img
                                  src={slideUrl}
                                  alt={`Slide ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeDraftGallerySlide(slideUrl)}
                                title="Remove slide"
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-7 space-y-2.5">
                    <p className="text-[11px] font-medium text-slate-600">
                      Click property photos below to toggle them in this room&apos;s gallery slider:
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {RICHGATES_GALLERY_ASSETS.map((asset) => {
                        const isInGallery = draftGalleryImages.includes(asset.url);
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => toggleDraftGalleryAsset(asset.url)}
                            title={`${isInGallery ? 'Remove from' : 'Add to'} gallery: ${asset.label}`}
                            className={`relative h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                              isInGallery
                                ? 'border-emerald-600 ring-2 ring-emerald-200'
                                : 'border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            <img
                              src={asset.url}
                              alt={asset.label}
                              className="w-full h-full object-cover"
                            />
                            {isInGallery && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-emerald-600 text-white text-[9px] font-bold">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="url"
                      value={isCleanExternalImageUrl(draftImageUrl) ? draftImageUrl : ''}
                      onChange={(e) => {
                        const nextUrl = e.target.value.trim();
                        setUploadError(null);
                        if (!nextUrl) return;
                        if (isLegacyOrAiStudioImageUrl(nextUrl)) {
                          setUploadError(
                            'Google / AI Studio image links are blocked. Please upload a photo from your device or choose from the property gallery above.'
                          );
                          return;
                        }
                        setDraftImageUrl(nextUrl);
                        setDraftGalleryImages((prev) =>
                          Array.from(new Set([nextUrl, ...prev])).slice(0, 6)
                        );
                      }}
                      placeholder="Optional: paste a clean https:// image URL or upload a photo above"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === editingRoom.id}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {busyId === editingRoom.id ? 'Saving Room...' : 'Save Room Changes'}
                </button>
              </div>
            </form>
          ) : showAddRoomModal && canManageRooms ? (
            <form
              onSubmit={handleCreateNewRoom}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddRoomModal(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Rooms</span>
                  </button>
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">Add New Room</h2>
                    <p className="text-xs text-slate-500">
                      Create a new room with room code, section, room type, and nightly Naira rate ·{' '}
                      <span className="font-mono-tabular">{systemPropertyId}</span>
                    </p>
                  </div>
                </div>
              </div>

              {addRoomError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {addRoomError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Room Code</label>
                  <input
                    type="text"
                    required
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                    placeholder="e.g. RM-9"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular uppercase"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Property Section</label>
                  <select
                    value={newRoomSection}
                    onChange={(e) => setNewRoomSection(e.target.value as RoomSection)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Serviced Apartment">Serviced Apartment Section</option>
                    <option value="Hotel Rooms">Hotel Rooms</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Room Type</label>
                  <input
                    type="text"
                    required
                    value={newRoomType}
                    onChange={(e) => setNewRoomType(e.target.value)}
                    placeholder="e.g. Deluxe Studio with Kitchenette"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Nightly Rate (₦ NGN)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="e.g. 65,500"
                    value={newRoomRateInput}
                    onChange={(e) => {
                      setAddRoomError(null);
                      handleCommaPriceChange(e, newRoomRateInput, setNewRoomRateInput);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Max Guests</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      required
                      value={newRoomMaxGuests}
                      onChange={(e) => setNewRoomMaxGuests(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Floor</label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      required
                      value={newRoomFloor}
                      onChange={(e) => setNewRoomFloor(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Amenities (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newRoomAmenitiesText}
                    onChange={(e) => setNewRoomAmenitiesText(e.target.value)}
                    placeholder="King Bed, Wi-Fi, Kitchenette, Smart TV, 24/7 Power"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-800 block">
                      Room Photo Gallery Slides ({newRoomGalleryImages.length} / 6)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Choose or upload up to 6 photos for this room&apos;s interactive slider.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={addRoomFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAddRoomImageSelect}
                      className="hidden"
                    />
                    <input
                      ref={addRoomGallerySlideFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAddRoomGallerySlideSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => addRoomFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Upload Cover</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addRoomGallerySlideFileInputRef.current?.click()}
                      disabled={newRoomGalleryImages.length >= 6}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#061539] rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Slide</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                  <div className="sm:col-span-5 space-y-2">
                    <div className="h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
                      <img
                        src={newRoomImageUrl || DEFAULT_SUITE_IMAGE}
                        alt="New Room Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_SUITE_IMAGE;
                        }}
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-950/75 text-white text-[10px] font-semibold">
                        Cover Slide
                      </span>
                    </div>
                    {newRoomGalleryImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {newRoomGalleryImages.map((slideUrl, idx) => (
                          <div
                            key={`${slideUrl.slice(0, 32)}-${idx}`}
                            className={`relative h-12 rounded-lg overflow-hidden border-2 ${
                              slideUrl === newRoomImageUrl ? 'border-emerald-600' : 'border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setNewRoomImageUrl(slideUrl)}
                              className="w-full h-full cursor-pointer"
                            >
                              <img
                                src={slideUrl}
                                alt={`New Room Slide ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setNewRoomGalleryImages((prev) =>
                                  prev.filter((u) => u !== slideUrl)
                                )
                              }
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-7 space-y-2">
                    <p className="text-[11px] font-medium text-slate-600">
                      Click property photos to toggle slides for this room:
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {RICHGATES_GALLERY_ASSETS.map((asset) => {
                        const isSelected = newRoomGalleryImages.includes(asset.url);
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => toggleNewRoomGalleryAsset(asset.url)}
                            title={asset.label}
                            className={`relative h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-emerald-600 ring-2 ring-emerald-200'
                                : 'border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            <img
                              src={asset.url}
                              alt={asset.label}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-emerald-600 text-white text-[9px] font-bold">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="url"
                      value={isCleanExternalImageUrl(newRoomImageUrl) ? newRoomImageUrl : ''}
                      onChange={(e) => {
                        const nextUrl = e.target.value.trim();
                        setAddRoomError(null);
                        if (!nextUrl) return;
                        if (isLegacyOrAiStudioImageUrl(nextUrl)) {
                          setAddRoomError(
                            'Google / AI Studio image links are blocked. Please upload a photo from your device or choose from the property gallery above.'
                          );
                          return;
                        }
                        setNewRoomImageUrl(nextUrl);
                        setNewRoomGalleryImages((prev) =>
                          Array.from(new Set([nextUrl, ...prev])).slice(0, 6)
                        );
                      }}
                      placeholder="Optional: paste a clean https:// image URL or upload a photo above"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRoomModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === 'add-room' || atRoomCapacity}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {busyId === 'add-room' ? 'Adding Room...' : 'Create Room'}
                </button>
              </div>
            </form>
          ) : activeFolioReservation ? (
            (() => {
              const folioPaySummary = getReservationPaymentSummary(
                activeFolioReservation,
                property.usdExchangeRateNgn
              );
              const folioIsOta = isOtaBookingChannel(activeFolioReservation.channel);
              const editIsOta = isOtaBookingChannel(editChannel);
              const activeEditCur: ChannelCurrency = editIsOta ? editSourceCurrency : 'NGN';
              const parsedEditFxNum =
                activeEditCur === 'NGN'
                  ? 1
                  : Math.max(
                      1,
                      parseFormattedPriceInput(editFxRateInput) ??
                        getFxRateToNgn(activeEditCur, property.usdExchangeRateNgn)
                    );
              const parsedEditOtaSrc = Math.max(
                0,
                parseFormattedPriceInput(editOtaPaidSourceInput) ?? 0
              );
              const convertedEditOtaNgn =
                activeEditCur === 'NGN'
                  ? Math.round(parsedEditOtaSrc)
                  : Math.round(parsedEditOtaSrc * parsedEditFxNum);

              return (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectReservation?.(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono-tabular font-bold text-slate-900">
                            {activeFolioReservation.bookingRef}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular font-semibold text-emerald-700">
                            {getReservationRoomDisplay(activeFolioReservation, rooms).roomNumberLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {getReservationRoomDisplay(activeFolioReservation, rooms).roomTypeLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatBookingSourceLabel(activeFolioReservation.channel)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Booked {getReservationBookedDate(activeFolioReservation)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-slate-400">{systemPropertyId}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <h2 className="font-display text-lg font-bold text-slate-900">
                            Reservation &amp; Folio — {activeFolioReservation.guestName}
                          </h2>
                          <button
                            type="button"
                            onClick={() => {
                              const target = activeFolioReservation;
                              onSelectReservation?.(null);
                              openGuestByReservation(target);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            <UserCircle2 className="w-3.5 h-3.5" />
                            <span>View Guest Profile</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stay Lifecycle Indicator */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    {[
                      { label: '1. Reservation Booked', active: true },
                      {
                        label:
                          activeFolioReservation.status === 'pending'
                            ? '2. Awaiting Confirmation'
                            : '2. Confirmed',
                        active: activeFolioReservation.status !== 'pending',
                      },
                      {
                        label: '3. Checked-in / Folio',
                        active:
                          activeFolioReservation.status === 'checked_in' ||
                          activeFolioReservation.status === 'checked_out',
                      },
                      {
                        label: '4. Checked-out & Settled',
                        active: activeFolioReservation.status === 'checked_out',
                      },
                    ].map((step) => (
                      <div
                        key={step.label}
                        className={`px-3 py-2 rounded-lg border font-semibold ${
                          step.active
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        {step.label}
                      </div>
                    ))}
                  </div>

                  {/* Separated OTA & Property Payment Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-blue-900">
                        {formatPaymentCollectionLabel(folioPaySummary.paymentCollectionMode)}
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-blue-800 mt-1">
                        {folioPaySummary.paymentCollectionMode === 'ota_prepaid'
                          ? folioPaySummary.sourceCurrency !== 'NGN' &&
                            folioPaySummary.otaPaidSourceAmount > 0
                            ? `${formatChannelCurrency(
                                folioPaySummary.otaPaidSourceAmount,
                                folioPaySummary.sourceCurrency
                              )} ${folioPaySummary.sourceCurrency}`
                            : formatNgn(
                                folioPaySummary.otaPaidAmount || folioPaySummary.expectedPayoutNgn
                              )
                          : '₦0'}
                      </p>
                      <p className="text-[11px] text-blue-700 mt-0.5 font-mono-tabular">
                        {folioPaySummary.paymentCollectionMode === 'ota_prepaid'
                          ? `Guest Paid to OTA (${activeFolioReservation.channel})`
                          : 'Guest pays directly at property'}
                      </p>
                    </div>

                    <div className="border border-slate-200 bg-slate-50 rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-slate-700">
                        {folioPaySummary.paymentCollectionMode === 'ota_prepaid'
                          ? 'OTA Payout Tracking'
                          : 'Room Charges Total (₦)'}
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-slate-900 mt-1">
                        {folioPaySummary.paymentCollectionMode === 'ota_prepaid'
                          ? folioPaySummary.otaPayoutStatus === 'received'
                            ? formatNgn(folioPaySummary.actualPayoutReceivedNgn)
                            : formatNgn(folioPaySummary.expectedPayoutNgn)
                          : formatNgn(activeFolioReservation.roomChargesNgn)}
                      </p>
                      <p className="text-[11px] mt-0.5 font-mono-tabular">
                        {folioPaySummary.paymentCollectionMode === 'ota_prepaid' ? (
                          <span
                            className={
                              folioPaySummary.otaPayoutStatus === 'received'
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {folioPaySummary.otaPayoutStatus === 'received'
                              ? `Received (Exp. ${formatNgn(folioPaySummary.expectedPayoutNgn)})`
                              : 'Pending OTA Payout'}
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            ≈ {formatUsd(folioPaySummary.totalAmountUsd)} USD ·{' '}
                            {activeFolioReservation.nights} night(s)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-emerald-900">
                        Money Received by Hotel (₦)
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-emerald-800 mt-1">
                        {formatNgn(folioPaySummary.totalReceivedByHotelNgn)}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5 font-mono-tabular">
                        Direct {formatNgn(folioPaySummary.hotelPaidAmount)}
                        {folioPaySummary.actualPayoutReceivedNgn > 0
                          ? ` + OTA ${formatNgn(folioPaySummary.actualPayoutReceivedNgn)}`
                          : ` · ${activeFolioReservation.paymentMethod}`}
                      </p>
                    </div>

                    <div className="border border-slate-200 bg-white rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-slate-700">
                        Amount Due at Property
                      </p>
                      <p
                        className={`font-mono-tabular text-base font-bold mt-1 ${
                          folioPaySummary.amountDueAtPropertyNgn > 0
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatNgn(folioPaySummary.amountDueAtPropertyNgn)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono-tabular">
                        Status: <strong>{folioPaySummary.paymentStatus}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Separate Optional Refundable Caution / Deposit Tracker */}
                  {folioPaySummary.cautionDepositEnabled && (
                    <div className="border border-amber-200 bg-amber-50/60 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-bold text-amber-950">
                          Refundable Caution / Deposit Fee (Held Separately from Room Folio)
                        </p>
                        <p className="font-mono-tabular text-amber-900">
                          Fee: <strong>{formatNgn(folioPaySummary.cautionDepositNgn)}</strong> · Collected:{' '}
                          <strong>{formatNgn(folioPaySummary.cautionDepositCollectedNgn)}</strong>
                          {folioPaySummary.cautionDepositRefunded
                            ? ' · Status: Refunded to Guest'
                            : folioPaySummary.cautionDepositCollectedNgn > 0
                              ? ' · Status: Pending Refund'
                              : ' · Status: Not Collected'}
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={busyId === `caution-${activeFolioReservation.id}`}
                          checked={folioPaySummary.cautionDepositRefunded}
                          onChange={async (e) => {
                            const nextRefunded = e.target.checked;
                            setBusyId(`caution-${activeFolioReservation.id}`);
                            try {
                              await updateReservationCautionDepositWorkflow({
                                property,
                                reservation: activeFolioReservation,
                                cautionDepositEnabled: true,
                                cautionDepositNgn: folioPaySummary.cautionDepositNgn,
                                cautionDepositCollectedNgn: folioPaySummary.cautionDepositCollectedNgn,
                                cautionDepositRefunded: nextRefunded,
                                actorRole,
                              });
                              onNotify(
                                nextRefunded
                                  ? `Confirmed caution deposit refunded for ${activeFolioReservation.bookingRef}`
                                  : `Marked caution deposit as not yet refunded for ${activeFolioReservation.bookingRef}`
                              );
                            } catch (err) {
                              setActionError(parseReadableError(err));
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="rounded border-amber-400 text-emerald-600"
                        />
                        <span>Confirm Refunded to Guest</span>
                      </label>
                    </div>
                  )}

                  {/* Stay Summary & Full Reservation Editor */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                      <div className="space-y-0.5">
                        <span className="font-mono-tabular text-slate-700 block">
                          Stay: <strong>{activeFolioReservation.checkInDate}</strong> →{' '}
                          <strong>{activeFolioReservation.checkOutDate}</strong> (
                          {activeFolioReservation.nights} nights @{' '}
                          {folioIsOta && folioPaySummary.sourceCurrency !== 'NGN'
                            ? `${formatChannelCurrency(
                                folioPaySummary.sourceNightlyRate,
                                folioPaySummary.sourceCurrency
                              )}/nt ${folioPaySummary.sourceCurrency}`
                            : `${formatNgn(activeFolioReservation.nightlyRateNgn)}/nt`}
                          )
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Guests:{' '}
                          <strong className="text-slate-700 font-mono-tabular">
                            {activeFolioReservation.adults} Adult
                            {activeFolioReservation.adults !== 1 ? 's' : ''},{' '}
                            {activeFolioReservation.children || 0} Child
                            {(activeFolioReservation.children || 0) !== 1 ? 'ren' : ''}
                          </strong>{' '}
                          · Source:{' '}
                          <strong className="text-slate-700">
                            {formatBookingSourceLabel(activeFolioReservation.channel)}
                          </strong>
                          {activeFolioReservation.paymentConfirmed && ' · Payment Verified'}
                          {activeFolioReservation.idVerified &&
                            ` · ID Verified (${activeFolioReservation.idType || 'KYC'})`}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {canManageRooms && (
                          <button
                            type="button"
                            onClick={() => setPaymentModalResId(activeFolioReservation.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-md text-[11px] font-semibold text-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>Manage Payment</span>
                          </button>
                        )}
                        {activeFolioReservation.status !== 'checked_out' &&
                          activeFolioReservation.status !== 'cancelled' &&
                          activeFolioReservation.status !== 'no_show' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStayDetails((v) => !v);
                                setEditStayError(null);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-md text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>{editingStayDetails ? 'Close Editor' : 'Edit Reservation'}</span>
                            </button>
                          )}
                        <span className="font-semibold text-emerald-700">
                          Status: {RESERVATION_STATUS_LABELS[activeFolioReservation.status]}
                        </span>
                      </div>
                    </div>

                    {editingStayDetails && (() => {
                      const editNightsCalc = diffNights(editCheckInDate, editCheckOutDate);
                      const editRoomMatch = editRoomId
                        ? rooms.find((r) => r.id === editRoomId)
                        : undefined;
                      const fallbackEditNgn =
                        editRoomMatch?.nightlyRateNgn || activeFolioReservation.nightlyRateNgn;
                      const parsedEditRateSrc =
                        parseFormattedPriceInput(editSourceNightlyRateInput) ??
                        (activeEditCur === 'NGN'
                          ? fallbackEditNgn
                          : Number((fallbackEditNgn / Math.max(1, parsedEditFxNum)).toFixed(2)));
                      const editStayTotalSrc = Number(
                        (parsedEditRateSrc * editNightsCalc).toFixed(2)
                      );
                      const editStayTotalNgn =
                        activeEditCur === 'NGN'
                          ? Math.round(editStayTotalSrc)
                          : Math.round(editStayTotalSrc * parsedEditFxNum);
                      const editStayTotalUsd =
                        activeEditCur === 'USD'
                          ? editStayTotalSrc
                          : convertNgnToUsd(editStayTotalNgn, property.usdExchangeRateNgn);

                      return (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                          {editStayError && (
                            <p className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px]">
                              {editStayError}
                            </p>
                          )}

                          {/* Section 1: Stay Details (Top) */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                            <h4 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                              1. Stay Details
                            </h4>
                            <div className="space-y-3">
                              <AvailabilityDateRangePicker
                                checkInDate={editCheckInDate}
                                checkOutDate={editCheckOutDate}
                                onChangeDates={(nextIn, nextOut) => {
                                  setEditCheckInDate(nextIn);
                                  setEditCheckOutDate(nextOut);
                                  setEditStayError(null);
                                }}
                                room={rooms.find((r) => r.id === editRoomId)}
                                roomType={editRequestedRoomType}
                                rooms={sortedRooms}
                                reservations={reservations}
                                blockedDates={blockedDates}
                                excludeReservationId={activeFolioReservation.id}
                                onSelectAlternativeRoom={(alt) => {
                                  setEditRoomId(alt.id);
                                  setEditRequestedRoomType(alt.roomType);
                                  setEditStayError(null);
                                }}
                                checkInLabel="Check-In Date *"
                                checkOutLabel="Check-Out Date *"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Room Type
                                </label>
                                <select
                                  value={editRequestedRoomType}
                                  onChange={(e) => {
                                    const rt = e.target.value;
                                    setEditRequestedRoomType(rt);
                                    const matchedRoom = sortedRooms.find(
                                      (r) =>
                                        r.roomType === rt &&
                                        checkRoomDateRangeAvailability({
                                          room: r,
                                          checkInDate: editCheckInDate,
                                          checkOutDate: editCheckOutDate,
                                          reservations,
                                          blockedDates,
                                          excludeReservationId: activeFolioReservation.id,
                                        }).available
                                    ) || sortedRooms.find((r) => r.roomType === rt);
                                    if (matchedRoom && editRoomId) {
                                      setEditRoomId(matchedRoom.id);
                                    }
                                  }}
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                                >
                                  {uniqueRoomTypes.map((rt) => (
                                    <option key={rt} value={rt}>
                                      {rt}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Room Assignment
                                </label>
                                <select
                                  value={editRoomId}
                                  onChange={(e) => {
                                    const nextId = e.target.value;
                                    const matchedRoom = rooms.find((r) => r.id === nextId);
                                    setEditRoomId(nextId);
                                    if (matchedRoom) setEditRequestedRoomType(matchedRoom.roomType);
                                    setEditStayError(null);
                                  }}
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                                >
                                  <option value="">Unassigned — Assign later</option>
                                  {sortedRooms.map((r) => {
                                    const avail = checkRoomDateRangeAvailability({
                                      room: r,
                                      checkInDate: editCheckInDate,
                                      checkOutDate: editCheckOutDate,
                                      reservations,
                                      blockedDates,
                                      excludeReservationId: activeFolioReservation.id,
                                    });
                                    return (
                                      <option
                                        key={r.id}
                                        value={r.id}
                                        disabled={!avail.available && r.id !== editRoomId}
                                      >
                                        {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)}) —{' '}
                                        {formatRoomAvailabilityTag(avail)}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Booking Source
                                </label>
                                <select
                                  value={editChannel}
                                  onChange={(e) => {
                                    const nextCh = e.target.value as ReservationRecord['channel'];
                                    setEditChannel(nextCh);
                                    if (!isOtaBookingChannel(nextCh)) {
                                      setEditSourceCurrency('NGN');
                                      setEditFxRateInput('1');
                                      setEditSourceNightlyRateInput(
                                        formatPriceInputWithCommas(fallbackEditNgn)
                                      );
                                      setEditOtaPaidSourceInput('0');
                                    } else {
                                      const nextCur = getDefaultOtaChannelCurrency(nextCh);
                                      const nextFx =
                                        nextCur === 'NGN'
                                          ? 1
                                          : getFxRateToNgn(nextCur, property.usdExchangeRateNgn);
                                      setEditSourceCurrency(nextCur);
                                      setEditFxRateInput(
                                        nextCur === 'NGN' ? '1' : formatPriceInputWithCommas(nextFx)
                                      );
                                      if (editSourceCurrency === 'NGN' && nextCur !== 'NGN') {
                                        setEditSourceNightlyRateInput(
                                          String(
                                            Number(
                                              (fallbackEditNgn / Math.max(1, nextFx)).toFixed(2)
                                            )
                                          )
                                        );
                                      }
                                    }
                                  }}
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium"
                                >
                                  {PRIMARY_BOOKING_SOURCES.map((src) => (
                                    <option key={src.value} value={src.value}>
                                      {src.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Reservation Status
                                </label>
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value as ReservationStatus)}
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium"
                                >
                                  <option value="confirmed">Confirmed</option>
                                  <option value="pending">Pending</option>
                                  <option
                                    value="checked_in"
                                    disabled={
                                      activeFolioReservation.status !== 'checked_in' &&
                                      getCheckInDateRestriction(
                                        {
                                          channel: isOtaReservation(activeFolioReservation)
                                            ? activeFolioReservation.channel
                                            : editChannel,
                                          checkInDate: editCheckInDate,
                                          externalUid: activeFolioReservation.externalUid,
                                          paymentCollectionMode: editCollectionMode,
                                        },
                                        todayIso
                                      ).restricted
                                    }
                                  >
                                    {activeFolioReservation.status !== 'checked_in' &&
                                    getCheckInDateRestriction(
                                      {
                                        channel: isOtaReservation(activeFolioReservation)
                                          ? activeFolioReservation.channel
                                          : editChannel,
                                        checkInDate: editCheckInDate,
                                        externalUid: activeFolioReservation.externalUid,
                                        paymentCollectionMode: editCollectionMode,
                                      },
                                      todayIso
                                    ).restricted
                                      ? `Checked-in (Opens ${normalizeIsoDate(editCheckInDate)})`
                                      : 'Checked-in'}
                                  </option>
                                  <option value="checked_out">Checked-out</option>
                                  <option
                                    value="cancelled"
                                    disabled={
                                      activeFolioReservation.status !== 'cancelled' &&
                                      getOtaCancellationRestriction({
                                        channel: isOtaReservation(activeFolioReservation)
                                          ? activeFolioReservation.channel
                                          : editChannel,
                                        externalUid: activeFolioReservation.externalUid,
                                        paymentCollectionMode: editCollectionMode,
                                      }).restricted
                                    }
                                  >
                                    {activeFolioReservation.status !== 'cancelled' &&
                                    getOtaCancellationRestriction({
                                      channel: isOtaReservation(activeFolioReservation)
                                        ? activeFolioReservation.channel
                                        : editChannel,
                                      externalUid: activeFolioReservation.externalUid,
                                      paymentCollectionMode: editCollectionMode,
                                    }).restricted
                                      ? 'Cancelled (Guest must cancel via OTA)'
                                      : 'Cancelled'}
                                  </option>
                                  <option value="no_show">No-show</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Adults / Children
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    title="Adults"
                                    value={editAdults}
                                    onChange={(e) =>
                                      setEditAdults(Math.max(1, Number(e.target.value)))
                                    }
                                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 text-xs font-mono-tabular"
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    title="Children"
                                    value={editChildren}
                                    onChange={(e) =>
                                      setEditChildren(Math.max(0, Number(e.target.value)))
                                    }
                                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 text-xs font-mono-tabular"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Section 2: Guest Information */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                            <h4 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                              2. Guest Information
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  First Name *
                                </label>
                                <input
                                  type="text"
                                  value={editGuestFirstNameRes}
                                  onChange={(e) => setEditGuestFirstNameRes(e.target.value)}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Last Name *
                                </label>
                                <input
                                  type="text"
                                  value={editGuestLastNameRes}
                                  onChange={(e) => setEditGuestLastNameRes(e.target.value)}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Phone Number
                                </label>
                                <input
                                  type="text"
                                  value={editGuestPhoneRes}
                                  onChange={(e) => setEditGuestPhoneRes(e.target.value)}
                                  placeholder="+234 800 000 0000"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Guest Email
                                </label>
                                <input
                                  type="email"
                                  value={editGuestEmailRes}
                                  onChange={(e) => setEditGuestEmailRes(e.target.value)}
                                  placeholder="guest@example.com"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Street Address
                                </label>
                                <input
                                  type="text"
                                  value={editGuestAddressRes}
                                  onChange={(e) => setEditGuestAddressRes(e.target.value)}
                                  placeholder="House / Street / Estate"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  City
                                </label>
                                <input
                                  type="text"
                                  value={editGuestCityRes}
                                  onChange={(e) => setEditGuestCityRes(e.target.value)}
                                  placeholder="e.g. Enugu"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  State
                                </label>
                                <input
                                  type="text"
                                  value={editGuestStateRes}
                                  onChange={(e) => setEditGuestStateRes(e.target.value)}
                                  placeholder="State"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Country / Nationality
                                </label>
                                <CountrySelect
                                  value={editGuestCountryRes}
                                  onChange={setEditGuestCountryRes}
                                  placeholder="Search country..."
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  ID Type
                                </label>
                                <select
                                  value={editIdTypeRes}
                                  onChange={(e) =>
                                    setEditIdTypeRes(e.target.value as GuestRecord['idType'])
                                  }
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
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
                                  value={editIdNumberRes}
                                  onChange={(e) => setEditIdNumberRes(e.target.value)}
                                  placeholder="NIN / Passport / License No."
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  ID Expiry Date
                                </label>
                                <input
                                  type="date"
                                  value={editIdExpiryDateRes}
                                  onChange={(e) => setEditIdExpiryDateRes(e.target.value)}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Rate Plan
                                </label>
                                <select
                                  value={editRatePlanRes}
                                  onChange={(e) => setEditRatePlanRes(e.target.value)}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                                >
                                  {RATE_PLAN_OPTIONS.map((plan) => (
                                    <option key={plan} value={plan}>
                                      {plan}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-4">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Special Requests
                                </label>
                                <textarea
                                  rows={2}
                                  value={editSpecialRequestsRes}
                                  onChange={(e) => setEditSpecialRequestsRes(e.target.value)}
                                  placeholder="Any special request..."
                                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Payments & Settlement */}
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-display text-xs font-bold text-emerald-950 uppercase tracking-wider">
                                3. Payment
                              </h4>
                              <span className="text-[11px] font-mono-tabular font-semibold text-emerald-800">
                                1 USD = ₦{(property.usdExchangeRateNgn || 1600).toLocaleString()}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Nightly Rate ({activeEditCur})
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editSourceNightlyRateInput}
                                  onChange={(e) =>
                                    handleCommaPriceChange(
                                      e,
                                      editSourceNightlyRateInput,
                                      setEditSourceNightlyRateInput
                                    )
                                  }
                                  placeholder={activeEditCur === 'NGN' ? '55,000' : '120.00'}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Stay Total ({editNightsCalc}n)
                                </label>
                                <div className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 flex items-center justify-between text-xs font-mono-tabular font-bold text-slate-900">
                                  <span>{formatChannelCurrency(editStayTotalSrc, activeEditCur)}</span>
                                  <span className="text-[10px] font-medium text-blue-700">
                                    {activeEditCur === 'USD'
                                      ? `≈ ${formatNgn(editStayTotalNgn)}`
                                      : `≈ ${formatUsd(editStayTotalUsd)} USD`}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Payment Method
                                </label>
                                <select
                                  value={editPaymentMethodRes}
                                  onChange={(e) =>
                                    setEditPaymentMethodRes(
                                      e.target.value as ReservationRecord['paymentMethod']
                                    )
                                  }
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                                >
                                  <option value="Bank Transfer">Bank Transfer</option>
                                  <option value="Card POS">Card POS</option>
                                  <option value="Cash NGN">Cash NGN</option>
                                  <option value="Online Gateway">Online Gateway</option>
                                  <option value="Corporate Invoice">Corporate Invoice</option>
                                  {isOtaBookingChannel(editChannel) && (
                                    <option value="OTA Platform Payout">OTA Platform Payout</option>
                                  )}
                                </select>
                              </div>

                              {isOtaBookingChannel(editChannel) && (
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Payment Collection Type
                                  </label>
                                  <select
                                    value={editCollectionMode}
                                    onChange={(e) => {
                                      const nextMode = e.target.value as OtaPaymentCollectionMode;
                                      setEditCollectionMode(nextMode);
                                      if (nextMode === 'ota_prepaid') {
                                        setEditPaymentStatus('Paid to OTA');
                                        setEditAmountDueInput('0');
                                      } else {
                                        const directPaid = Math.max(
                                          0,
                                          parseFormattedPriceInput(editHotelPaidInput) ?? 0
                                        );
                                        const nextDue = Math.max(0, editStayTotalNgn - directPaid);
                                        setEditAmountDueInput(formatPriceInputWithCommas(nextDue));
                                        setEditPaymentStatus(
                                          directPaid <= 0
                                            ? 'Unpaid'
                                            : nextDue <= 0
                                              ? 'Paid'
                                              : 'Partial'
                                        );
                                      }
                                    }}
                                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-semibold"
                                  >
                                    <option value="ota_prepaid">Collected by OTA</option>
                                    <option value="hotel_collect">Collect at Property</option>
                                  </select>
                                </div>
                              )}

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Payment Status
                                </label>
                                <select
                                  value={
                                    !isOtaBookingChannel(editChannel) &&
                                    editPaymentStatus === 'Paid to OTA'
                                      ? 'Paid'
                                      : editPaymentStatus
                                  }
                                  onChange={(e) => {
                                    const nextSt = e.target.value as PaymentStatusLabel;
                                    setEditPaymentStatus(nextSt);
                                    if (isOtaBookingChannel(editChannel) && nextSt === 'Paid to OTA') {
                                      setEditCollectionMode('ota_prepaid');
                                      setEditAmountDueInput('0');
                                    }
                                  }}
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-semibold"
                                >
                                  {isOtaBookingChannel(editChannel) && (
                                    <option value="Paid to OTA">Paid to OTA</option>
                                  )}
                                  <option value="Paid">Paid</option>
                                  <option value="Partial">Partial</option>
                                  <option value="Unpaid">Unpaid</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Amount Due at Property (₦)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editAmountDueInput}
                                  onChange={(e) =>
                                    handleCommaPriceChange(
                                      e,
                                      editAmountDueInput,
                                      setEditAmountDueInput
                                    )
                                  }
                                  placeholder="0"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                />
                              </div>

                              {(editIsOta || editCollectionMode === 'ota_prepaid') && (
                                <>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                      OTA Currency &amp; FX (₦)
                                    </label>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <select
                                        value={editSourceCurrency}
                                        onChange={(e) => {
                                          const cur = e.target.value as ChannelCurrency;
                                          setEditSourceCurrency(cur);
                                          const nextFx =
                                            cur === 'NGN'
                                              ? 1
                                              : getFxRateToNgn(cur, property.usdExchangeRateNgn);
                                          setEditFxRateInput(
                                            cur === 'NGN' ? '1' : formatPriceInputWithCommas(nextFx)
                                          );
                                        }}
                                        className="h-10 border border-slate-200 rounded-lg px-2 bg-white text-xs font-semibold"
                                      >
                                        {SUPPORTED_CHANNEL_CURRENCIES.map((cur) => (
                                          <option key={cur} value={cur}>
                                            {cur}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        disabled={editSourceCurrency === 'NGN'}
                                        value={editSourceCurrency === 'NGN' ? '1' : editFxRateInput}
                                        onChange={(e) =>
                                          handleCommaPriceChange(e, editFxRateInput, setEditFxRateInput)
                                        }
                                        placeholder="FX"
                                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2 text-xs font-mono-tabular disabled:bg-slate-100"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                                      Paid to OTA ({activeEditCur})
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={editOtaPaidSourceInput}
                                      onChange={(e) =>
                                        handleCommaPriceChange(
                                          e,
                                          editOtaPaidSourceInput,
                                          setEditOtaPaidSourceInput
                                        )
                                      }
                                      placeholder="0.00"
                                      className="w-full h-10 border border-blue-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold text-blue-900"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                      Expected OTA Payout (₦)
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={editExpectedPayoutInput}
                                      onChange={(e) =>
                                        handleCommaPriceChange(
                                          e,
                                          editExpectedPayoutInput,
                                          setEditExpectedPayoutInput
                                        )
                                      }
                                      placeholder="e.g. 165,000"
                                      className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                      OTA Payout Status
                                    </label>
                                    <select
                                      value={editOtaPayoutStatus}
                                      onChange={(e) => {
                                        const nextP = e.target.value as OtaPayoutStatus;
                                        setEditOtaPayoutStatus(nextP);
                                        if (nextP === 'received') {
                                          const curActual =
                                            parseFormattedPriceInput(editActualPayoutInput) ?? 0;
                                          if (curActual <= 0) {
                                            setEditActualPayoutInput(editExpectedPayoutInput);
                                          }
                                        } else {
                                          setEditActualPayoutInput('0');
                                        }
                                      }}
                                      className="w-full h-10 border border-blue-200 rounded-lg px-3 bg-white text-xs font-semibold text-blue-900"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="received">Received</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                                      Actual OTA Payout Received (₦)
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      disabled={editOtaPayoutStatus !== 'received'}
                                      value={
                                        editOtaPayoutStatus === 'received'
                                          ? editActualPayoutInput
                                          : '0'
                                      }
                                      onChange={(e) =>
                                        handleCommaPriceChange(
                                          e,
                                          editActualPayoutInput,
                                          setEditActualPayoutInput
                                        )
                                      }
                                      placeholder="0"
                                      className="w-full h-10 border border-emerald-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold text-emerald-900 disabled:bg-slate-100 disabled:text-slate-400"
                                    />
                                  </div>
                                </>
                              )}

                              <div>
                                <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                                  Direct Payment to {property.name.split(' ')[0]} (₦)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editHotelPaidInput}
                                  onChange={(e) =>
                                    handleCommaPriceChange(
                                      e,
                                      editHotelPaidInput,
                                      setEditHotelPaidInput
                                    )
                                  }
                                  placeholder="0"
                                  className="w-full h-10 border border-emerald-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold text-emerald-900"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Section 4: Optional Refundable Caution / Deposit Fee */}
                          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-950 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editCautionEnabled}
                                onChange={(e) => setEditCautionEnabled(e.target.checked)}
                                className="rounded border-amber-400 text-emerald-600"
                              />
                              <span>Optional Refundable Caution / Deposit Fee (Tracked Separately)</span>
                            </label>
                            {editCautionEnabled && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Caution / Deposit Fee (₦)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editCautionAmountInput}
                                    onChange={(e) =>
                                      handleCommaPriceChange(
                                        e,
                                        editCautionAmountInput,
                                        setEditCautionAmountInput
                                      )
                                    }
                                    placeholder="20,000"
                                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Amount Collected (₦)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editCautionCollectedInput}
                                    onChange={(e) =>
                                      handleCommaPriceChange(
                                        e,
                                        editCautionCollectedInput,
                                        setEditCautionCollectedInput
                                      )
                                    }
                                    placeholder="0"
                                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                  />
                                </div>
                                <label className="h-10 inline-flex items-center gap-2 px-3 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-950 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editCautionRefunded}
                                    onChange={(e) => setEditCautionRefunded(e.target.checked)}
                                    className="rounded border-amber-400 text-emerald-600"
                                  />
                                  <span>Refunded to Guest</span>
                                </label>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-600 font-mono-tabular">
                              Updated Stay: <strong>{editNightsCalc} night(s)</strong> · Total{' '}
                              <strong>{formatChannelCurrency(editStayTotalSrc, activeEditCur)}</strong>{' '}
                              {activeEditCur} (≈ {formatUsd(editStayTotalUsd)} USD / {formatNgn(editStayTotalNgn)})
                            </span>
                            <button
                              type="button"
                              disabled={busyId === `stay-${activeFolioReservation.id}`}
                              onClick={() => handleSaveStayDetails(activeFolioReservation)}
                              className="h-10 inline-flex items-center gap-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Save Reservation Changes</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          Room Accommodation ({activeFolioReservation.nights} nights)
                        </span>
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          {formatNgn(activeFolioReservation.roomChargesNgn)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Restaurant POS / Misc Folio Charges</span>
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          {formatNgn(activeFolioReservation.posChargesNgn)}
                        </span>
                      </div>
                      {(activeFolioReservation.lateCheckoutFeeNgn || 0) > 0 && (
                        <div className="flex justify-between text-amber-800">
                          <span>
                            Late Check-Out Fee ({activeFolioReservation.checkOutTime || '14:00'})
                          </span>
                          <span className="font-mono-tabular font-semibold">
                            {formatNgn(activeFolioReservation.lateCheckoutFeeNgn || 0)}
                          </span>
                        </div>
                      )}
                      {activeFolioReservation.status === 'cancelled' &&
                        activeFolioReservation.cancellationType === 'paid' && (
                          <div className="flex justify-between text-rose-700">
                            <span>Cancellation Fee Applied</span>
                            <span className="font-mono-tabular font-semibold">
                              {formatNgn(activeFolioReservation.cancellationFeeNgn || 0)}
                            </span>
                          </div>
                        )}
                      <div className="flex justify-between pt-1.5 border-t border-slate-200/70">
                        <span className="text-slate-700 font-semibold">Total Folio Charges (₦)</span>
                        <span className="font-mono-tabular font-bold text-slate-900">
                          {formatNgn(folioPaySummary.totalAmount)}
                        </span>
                      </div>
                      {folioIsOta && (
                        <>
                          <div className="flex justify-between text-blue-800">
                            <span>
                              Guest Paid to OTA ({activeFolioReservation.channel} · Orig.{' '}
                              {folioPaySummary.sourceCurrency})
                            </span>
                            <span className="font-mono-tabular font-semibold">
                              {formatChannelCurrency(
                                folioPaySummary.otaPaidSourceAmount,
                                folioPaySummary.sourceCurrency
                              )}{' '}
                              {folioPaySummary.sourceCurrency}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-700">
                            <span>Expected Property Payout (₦)</span>
                            <span className="font-mono-tabular font-semibold text-slate-900">
                              {formatNgn(folioPaySummary.expectedPayoutNgn)}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-emerald-800">
                        <span>Additional Direct Payment to Property (₦)</span>
                        <span className="font-mono-tabular font-semibold">
                          {formatNgn(folioPaySummary.hotelPaidAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                        <span>
                          Remaining Property Balance Due ({folioPaySummary.paymentStatus})
                        </span>
                        <span
                          className={`font-mono-tabular ${
                            folioPaySummary.balance > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatNgn(folioPaySummary.balance)}
                        </span>
                      </div>
                    </div>

                    {cms.brand.folioFooterNote && (
                      <p className="text-[11px] text-slate-500 pt-1">{cms.brand.folioFooterNote}</p>
                    )}
                  </div>

                  {activeFolioReservation.status !== 'checked_out' &&
                    activeFolioReservation.status !== 'cancelled' &&
                    activeFolioReservation.status !== 'no_show' && (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                            <p className="font-semibold text-slate-900">
                              Post Direct Payment to Property Folio (₦)
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                min={500}
                                step={500}
                                value={folioPayAmount}
                                onChange={(e) => setFolioPayAmount(Number(e.target.value))}
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono-tabular"
                              />
                              <select
                                value={folioPayMethod}
                                onChange={(e) =>
                                  setFolioPayMethod(
                                    e.target.value as ReservationRecord['paymentMethod']
                                  )
                                }
                                className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                              >
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Card POS">Card POS</option>
                                <option value="Cash NGN">Cash NGN</option>
                                <option value="Corporate Invoice">Corporate Invoice</option>
                                <option value="Online Gateway">Online Gateway</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              disabled={busyId === activeFolioReservation.id || folioPayAmount <= 0}
                              onClick={async () => {
                                setActionError(null);
                                setBusyId(activeFolioReservation.id);
                                try {
                                  await recordReservationFolioPayment({
                                    property,
                                    reservation: activeFolioReservation,
                                    amountNgn: folioPayAmount,
                                    paymentMethod: folioPayMethod,
                                    actorRole,
                                  });
                                  const nextHotelPaid =
                                    (activeFolioReservation.hotelPaidNgn ??
                                      activeFolioReservation.paidNgn ??
                                      0) + folioPayAmount;
                                  const folioSummaryNow = getReservationPaymentSummary(
                                    activeFolioReservation,
                                    property.usdExchangeRateNgn
                                  );
                                  const nextDue = Math.max(0, folioSummaryNow.balance - folioPayAmount);
                                  onNotify(
                                    `Posted ${formatNgn(folioPayAmount)} direct payment to ${activeFolioReservation.bookingRef}`
                                  );
                                  setReceiptModalState({
                                    reservation: {
                                      ...activeFolioReservation,
                                      paidNgn: nextHotelPaid,
                                      hotelPaidNgn: nextHotelPaid,
                                      amountDueAtPropertyNgn: nextDue,
                                      paymentConfirmed: nextDue <= 0,
                                      paymentStatus:
                                        nextDue <= 0
                                          ? folioSummaryNow.paymentCollectionMode === 'ota_prepaid'
                                            ? 'Paid to OTA'
                                            : 'Paid'
                                          : 'Partial',
                                      paymentMethod: folioPayMethod,
                                    },
                                    mode: 'reservation_payment',
                                    amountJustPaidNgn: folioPayAmount,
                                    settlementMethodOverride: folioPayMethod,
                                  });
                                } catch (err) {
                                  setActionError(parseReadableError(err));
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                            >
                              Post Direct Payment
                            </button>
                          </div>

                          <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                            <p className="font-semibold text-slate-900">
                              Add Folio / Extra Service Charge
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={miscChargeDesc}
                                onChange={(e) => setMiscChargeDesc(e.target.value)}
                                placeholder="Service label"
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5"
                              />
                              <input
                                type="number"
                                min={500}
                                step={500}
                                value={miscChargeAmount}
                                onChange={(e) => setMiscChargeAmount(Number(e.target.value))}
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono-tabular"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={
                                busyId === activeFolioReservation.id || miscChargeAmount <= 0
                              }
                              onClick={async () => {
                                setActionError(null);
                                setBusyId(activeFolioReservation.id);
                                try {
                                  await addMiscFolioCharge({
                                    property,
                                    reservation: activeFolioReservation,
                                    amountNgn: miscChargeAmount,
                                    description: miscChargeDesc.trim() || 'Extra Service Charge',
                                    actorRole,
                                  });
                                  onNotify(
                                    `Added ${formatNgn(miscChargeAmount)} charge to ${activeFolioReservation.bookingRef}`
                                  );
                                } catch (err) {
                                  setActionError(parseReadableError(err));
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="w-full py-1.5 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 font-semibold rounded-lg cursor-pointer"
                            >
                              Add Charge to Folio
                            </button>
                          </div>
                        </div>

                        {/* Late Check-Out Fee & Checkout Time Card */}
                        <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                          <div className="grid grid-cols-2 gap-3 flex-1">
                            <div>
                              <label className="block font-semibold text-slate-800 mb-1">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Check-Out Time</span>
                                </span>
                              </label>
                              <input
                                type="time"
                                value={lateCheckoutTime}
                                onChange={(e) => setLateCheckoutTime(e.target.value)}
                                className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 font-mono-tabular"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-800 mb-1">
                                Late Check-Out Fee (₦)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={500}
                                value={lateCheckoutFeeDraft}
                                onChange={(e) =>
                                  setLateCheckoutFeeDraft(Math.max(0, Number(e.target.value)))
                                }
                                className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 font-mono-tabular"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={busyId === `late-${activeFolioReservation.id}`}
                            onClick={() => void handleApplyLateCheckout(activeFolioReservation)}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {busyId === `late-${activeFolioReservation.id}`
                              ? 'Applying...'
                              : 'Apply Late Fee to Bill'}
                          </button>
                        </div>
                      </div>
                    )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {activeFolioReservation.status !== 'checked_out' &&
                        activeFolioReservation.status !== 'cancelled' &&
                        activeFolioReservation.status !== 'no_show' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === activeFolioReservation.id}
                              onClick={async () => {
                                const extendedOut = addDaysIso(
                                  activeFolioReservation.checkOutDate,
                                  1
                                );
                                const targetRoom = rooms.find(
                                  (rm) => rm.id === activeFolioReservation.roomId
                                );
                                const extCheck = checkRoomDateRangeAvailability({
                                  room: targetRoom,
                                  roomType:
                                    targetRoom?.roomType ||
                                    activeFolioReservation.requestedRoomType,
                                  rooms,
                                  checkInDate: activeFolioReservation.checkInDate,
                                  checkOutDate: extendedOut,
                                  reservations,
                                  blockedDates,
                                  excludeReservationId: activeFolioReservation.id,
                                });
                                if (!extCheck.available) {
                                  setActionError(
                                    `Cannot extend stay to ${extendedOut}: ${extCheck.message}`
                                  );
                                  onNotify(`Extension unavailable: ${extCheck.message}`);
                                  return;
                                }
                                setBusyId(activeFolioReservation.id);
                                try {
                                  await extendReservationStay({
                                    property,
                                    reservation: activeFolioReservation,
                                    extraNights: 1,
                                    actorRole,
                                  });
                                  onNotify(
                                    `Extended ${activeFolioReservation.bookingRef} by +1 night (Check-out: ${extendedOut})`
                                  );
                                } catch (err) {
                                  setActionError(
                                    err instanceof Error
                                      ? err.message
                                      : 'Unable to extend stay right now.'
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg cursor-pointer"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Extend +1 Night</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectReservation?.(null);
                                onNavigateSection?.('pos_kitchen');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg cursor-pointer"
                            >
                              <ChefHat className="w-3.5 h-3.5" />
                              <span>Order Restaurant POS</span>
                            </button>
                          </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(activeFolioReservation.status === 'confirmed' ||
                        activeFolioReservation.status === 'pending') &&
                        (() => {
                          const folioOtaCheckInBlock = getCheckInDateRestriction(
                            activeFolioReservation,
                            todayIso
                          );
                          const folioOtaCancelBlock = getOtaCancellationRestriction(
                            activeFolioReservation
                          );
                          return (
                            <>
                              {!folioOtaCancelBlock.restricted ? (
                                <button
                                  type="button"
                                  disabled={busyId === activeFolioReservation.id}
                                  onClick={() => {
                                    const target = activeFolioReservation;
                                    onSelectReservation?.(null);
                                    openCancelDialog(target);
                                  }}
                                  className="px-3 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold rounded-lg cursor-pointer"
                                >
                                  Cancel Booking
                                </button>
                              ) : (
                                <span
                                  title={folioOtaCancelBlock.message}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 font-medium text-[11px]"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                  <span>
                                    OTA booking: guest must cancel via{' '}
                                    {folioOtaCancelBlock.platformLabel}
                                  </span>
                                </span>
                              )}
                              {!folioOtaCheckInBlock.restricted ? (
                                <button
                                  type="button"
                                  disabled={busyId === activeFolioReservation.id}
                                  onClick={() => {
                                    const target = activeFolioReservation;
                                    onSelectReservation?.(null);
                                    setCheckInTarget(target);
                                  }}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                                >
                                  Check In Guest Now
                                </button>
                              ) : (
                                <span
                                  title={folioOtaCheckInBlock.message}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 font-semibold text-[11px]"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                  <span>Check-in opens {folioOtaCheckInBlock.checkInIso}</span>
                                </span>
                              )}
                            </>
                          );
                        })()}

                      {activeFolioReservation.status === 'checked_in' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const target = activeFolioReservation;
                              onSelectReservation?.(null);
                              openChangeRoomModal(target);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-lg cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            <span>Change Room</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const target = activeFolioReservation;
                              onSelectReservation?.(null);
                              setCheckoutTarget(target);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Settle &amp; Check Out</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : selectedGuest ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => setSelectedGuestId(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Guests</span>
                  </button>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-display font-bold text-base flex items-center justify-center shrink-0">
                    {selectedGuest.fullName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((n) => n[0]?.toUpperCase() || '')
                      .join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        {selectedGuest.fullName}
                      </h2>
                      <span className="text-xs font-semibold text-emerald-700">
                        · {selectedGuest.vipTier}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono-tabular">
                      {selectedGuest.totalStays} stay(s) · Lifetime Spend{' '}
                      {formatNgn(selectedGuest.lifetimeSpendNgn)} · {systemPropertyId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingGuestMode((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{editingGuestMode ? 'Cancel Edit' : 'Edit Profile'}</span>
                  </button>
                  {canManageRooms && confirmDeleteGuestId !== selectedGuest.id && (
                    <button
                      type="button"
                      disabled={busyId === selectedGuest.id}
                      onClick={() => setConfirmDeleteGuestId(selectedGuest.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  )}
                  {canManageRooms && confirmDeleteGuestId === selectedGuest.id && (
                    <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteGuestId(null)}
                        className="px-1.5 py-0.5 text-slate-600 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busyId === selectedGuest.id}
                        onClick={() => void handleDeleteGuest(selectedGuest)}
                        className="px-2 py-0.5 font-semibold bg-rose-600 text-white rounded cursor-pointer"
                      >
                        {busyId === selectedGuest.id ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {editingGuestMode ? (
                <form onSubmit={handleSaveGuestProfile} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                      <input
                        required
                        type="text"
                        value={editGuestFirstName}
                        onChange={(e) => setEditGuestFirstName(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                      <input
                        required
                        type="text"
                        value={editGuestLastName}
                        onChange={(e) => setEditGuestLastName(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone</label>
                      <input
                        required
                        type="text"
                        value={editGuestPhone}
                        onChange={(e) => setEditGuestPhone(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={editGuestEmail}
                        onChange={(e) => setEditGuestEmail(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-medium text-slate-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={editGuestAddress}
                        onChange={(e) => setEditGuestAddress(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={editGuestCity}
                        onChange={(e) => setEditGuestCity(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">State</label>
                      <input
                        type="text"
                        value={editGuestState}
                        onChange={(e) => setEditGuestState(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Country</label>
                      <input
                        type="text"
                        value={editGuestNationality}
                        onChange={(e) => setEditGuestNationality(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">VIP Tier</label>
                      <select
                        value={editGuestVip}
                        onChange={(e) => setEditGuestVip(e.target.value as GuestRecord['vipTier'])}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                      >
                        <option value="Standard">Standard</option>
                        <option value="Silver">Silver</option>
                        <option value="Gold">Gold</option>
                        <option value="Diplomatic">Diplomatic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">ID Type</label>
                      <select
                        value={editGuestIdType}
                        onChange={(e) => setEditGuestIdType(e.target.value as GuestRecord['idType'])}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                      >
                        <option value="NIN">NIN</option>
                        <option value="International Passport">International Passport</option>
                        <option value="Driver License">Driver License</option>
                        <option value="Voter Card">Voter Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">ID Number</label>
                      <input
                        type="text"
                        value={editGuestIdNumber}
                        onChange={(e) => setEditGuestIdNumber(e.target.value)}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="block font-medium text-slate-700 mb-1">
                        Guest Preferences / Notes
                      </label>
                      <textarea
                        rows={2}
                        value={editGuestNotes}
                        onChange={(e) => setEditGuestNotes(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={busyId === `guest-${selectedGuest.id}`}
                      className="h-10 inline-flex items-center gap-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Guest Changes</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-2 text-slate-700">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono-tabular">{selectedGuest.phone}</span>
                    </p>
                    <p className="flex items-center gap-2 text-slate-700">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{selectedGuest.email || 'No email recorded'}</span>
                    </p>
                    <p className="flex items-start gap-2 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {[
                          selectedGuest.address,
                          selectedGuest.city,
                          selectedGuest.state,
                          selectedGuest.country || selectedGuest.nationality,
                        ]
                          .filter(Boolean)
                          .join(', ') || 'No address recorded'}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-slate-700">
                      <span className="text-slate-500">KYC ID:</span>{' '}
                      <span className="font-mono-tabular font-semibold">
                        {selectedGuest.idType}{' '}
                        {selectedGuest.idNumber ? `· ${selectedGuest.idNumber}` : '(Not provided)'}
                      </span>
                    </p>
                    <p className="text-slate-700">
                      <span className="text-slate-500">Notes:</span>{' '}
                      <span>{selectedGuest.notes || 'None'}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Stay & Folio History for Guest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-xs font-bold text-slate-900">
                    Stay &amp; Folio History
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const [selFirst, selLast] = splitFullName(selectedGuest.fullName);
                      setGuestFirstName(selFirst);
                      setGuestLastName(selLast);
                      setGuestPhone(selectedGuest.phone);
                      setGuestEmail(selectedGuest.email || '');
                      setGuestAddress(selectedGuest.address || '');
                      setGuestCity(selectedGuest.city || '');
                      setGuestState(selectedGuest.state || '');
                      setGuestCountry(selectedGuest.country || selectedGuest.nationality || 'Nigeria');
                      setSelectedGuestId(null);
                      setShowBookingForm(true);
                      onNavigateSection?.('reservations');
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    + New Reservation for Guest
                  </button>
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                  {reservations
                    .filter(
                      (r) =>
                        r.guestId === selectedGuest.id ||
                        r.guestName.toLowerCase() === selectedGuest.fullName.toLowerCase()
                    )
                    .map((r) => (
                      <div
                        key={r.id}
                        onClick={() => {
                          setSelectedGuestId(null);
                          onSelectReservation?.(r.id);
                        }}
                        className="px-4 py-2.5 flex items-center justify-between hover:bg-emerald-50/40 cursor-pointer"
                      >
                        <div>
                          <p className="font-mono-tabular font-semibold text-slate-900">
                            {r.bookingRef} · {r.roomNumber}
                          </p>
                          <p className="font-mono-tabular text-[11px] text-slate-500">
                            {r.checkInDate} → {r.checkOutDate} ({r.nights}n) · {r.channel}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono-tabular font-semibold text-slate-900">
                            {formatNgn(r.roomChargesNgn + r.posChargesNgn)}
                          </p>
                          {r.sourceCurrency &&
                            r.sourceCurrency !== 'NGN' &&
                            typeof r.otaPaidSourceAmount === 'number' &&
                            r.otaPaidSourceAmount > 0 && (
                              <p className="font-mono-tabular text-[10px] font-medium text-blue-700">
                                Paid OTA: {formatChannelCurrency(r.otaPaidSourceAmount, r.sourceCurrency)}{' '}
                                ({r.sourceCurrency})
                              </p>
                            )}
                          <p className="text-[11px] text-emerald-700 capitalize">
                            {r.status.replace('_', ' ')} · Open Folio →
                          </p>
                        </div>
                      </div>
                    ))}
                  {reservations.filter(
                    (r) =>
                      r.guestId === selectedGuest.id ||
                      r.guestName.toLowerCase() === selectedGuest.fullName.toLowerCase()
                  ).length === 0 && (
                    <p className="px-4 py-5 text-center text-slate-500">
                      No reservations linked to this guest yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : showGuestForm && section === 'guests' ? (
            <form
              onSubmit={handleCreateGuest}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <button
                  type="button"
                  onClick={() => setShowGuestForm(false)}
                  className="h-10 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Guests</span>
                </button>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Register New Guest Profile (KYC)
                  </h2>
                  <p className="text-xs text-slate-500 font-mono-tabular">{systemPropertyId}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                  <input
                    required
                    type="text"
                    value={newGuestFirstName}
                    onChange={(e) => setNewGuestFirstName(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                  <input
                    required
                    type="text"
                    value={newGuestLastName}
                    onChange={(e) => setNewGuestLastName(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone *</label>
                  <input
                    required
                    type="text"
                    value={newGuestPhone}
                    onChange={(e) => setNewGuestPhone(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newGuestEmail}
                    onChange={(e) => setNewGuestEmail(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Residential / Office Address
                  </label>
                  <input
                    type="text"
                    value={newGuestAddress}
                    onChange={(e) => setNewGuestAddress(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={newGuestCity}
                    onChange={(e) => setNewGuestCity(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      value={newGuestState}
                      onChange={(e) => setNewGuestState(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Country</label>
                    <input
                      type="text"
                      value={newGuestCountry}
                      onChange={(e) => setNewGuestCountry(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">ID Type</label>
                  <select
                    value={newGuestIdType}
                    onChange={(e) => setNewGuestIdType(e.target.value as GuestRecord['idType'])}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                  >
                    <option value="NIN">NIN</option>
                    <option value="International Passport">International Passport</option>
                    <option value="Driver License">Driver License</option>
                    <option value="Voter Card">Voter Card</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ID Number</label>
                    <input
                      type="text"
                      value={newGuestIdNumber}
                      onChange={(e) => setNewGuestIdNumber(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">VIP Tier</label>
                    <select
                      value={newGuestVip}
                      onChange={(e) => setNewGuestVip(e.target.value as GuestRecord['vipTier'])}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2 bg-white"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Silver">Silver VIP</option>
                      <option value="Gold">Gold VIP</option>
                      <option value="Diplomatic">Diplomatic</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGuestForm(false)}
                  className="h-10 px-4 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === 'guest'}
                  className="h-10 px-5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                >
                  Save Guest Profile
                </button>
              </div>
            </form>
          ) : showBookingForm && section !== 'walk_in' ? (
            (() => {
              const pickedRoom = selectedRoomId
                ? rooms.find((r) => r.id === selectedRoomId)
                : undefined;
              const baseRateNgn =
                pickedRoom?.nightlyRateNgn ||
                rooms.find((r) => r.roomType === newRequestedRoomType)?.nightlyRateNgn ||
                55000;
              const safeNights = Math.max(1, nights);
              const isOta = isOtaBookingChannel(channel);
              const activeCur: ChannelCurrency = isOta ? bookingCurrency : 'NGN';
              const fxRate =
                activeCur === 'NGN'
                  ? 1
                  : Math.max(
                      1,
                      parseFormattedPriceInput(bookingFxRateInput) ??
                        getFxRateToNgn(activeCur, property.usdExchangeRateNgn)
                    );
              const internalUsdRate = Math.max(1, Number(property.usdExchangeRateNgn) || 1600);
              const parsedNightlyInput = parseFormattedPriceInput(bookingNightlyRateInput);
              const activeSourceNightlyRate =
                activeCur === 'NGN'
                  ? Math.max(0, Math.round(parsedNightlyInput ?? baseRateNgn))
                  : Number(
                      Math.max(
                        0,
                        parsedNightlyInput ?? baseRateNgn / Math.max(1, fxRate)
                      ).toFixed(2)
                    );
              const activeSourceStayTotal = Number(
                (activeSourceNightlyRate * safeNights).toFixed(2)
              );
              const activeStayNgnEquivalent =
                activeCur === 'NGN'
                  ? Math.round(activeSourceStayTotal)
                  : Math.round(activeSourceStayTotal * fxRate);
              const activeStayUsdEquivalent =
                activeCur === 'USD'
                  ? activeSourceStayTotal
                  : convertNgnToUsd(activeStayNgnEquivalent, internalUsdRate);

              const otaPaidSrc = isOta
                ? Math.max(0, parseFormattedPriceInput(bookingOtaPaidSourceInput) ?? 0)
                : 0;
              const otaPaidNgnEst = isOta
                ? activeCur === 'NGN'
                  ? Math.round(otaPaidSrc)
                  : Math.round(otaPaidSrc * fxRate)
                : 0;
              const defaultExpectedPayout =
                otaPaidNgnEst > 0 ? otaPaidNgnEst : activeStayNgnEquivalent;
              const expectedPayoutEst = isOta
                ? Math.max(
                    0,
                    Math.round(
                      parseFormattedPriceInput(bookingExpectedPayoutInput) ?? defaultExpectedPayout
                    )
                  )
                : activeStayNgnEquivalent;
              const directPaidEst = Math.max(
                0,
                Math.round(parseFormattedPriceInput(bookingHotelPaidInput) ?? 0)
              );
              const estTotalCharges = expectedPayoutEst;
              const isCollectedByOtaNew = isOta && bookingCollectionMode === 'ota_prepaid';
              const estBalanceDue = bookingAmountDueManual
                ? Math.max(0, Math.round(parseFormattedPriceInput(bookingAmountDueInput) ?? 0))
                : isCollectedByOtaNew
                  ? 0
                  : Math.max(0, estTotalCharges - directPaidEst);
              const estBalanceUsd = convertNgnToUsd(estBalanceDue, internalUsdRate);
              const autoPayStatus: PaymentStatusLabel = isCollectedByOtaNew
                ? 'Paid to OTA'
                : estBalanceDue <= 0 && (estTotalCharges > 0 || directPaidEst > 0)
                  ? 'Paid'
                  : directPaidEst > 0
                    ? 'Partial'
                    : 'Unpaid';
              const rawEstPayStatus: PaymentStatusLabel = bookingPaymentStatusManual
                ? bookingPaymentStatus
                : autoPayStatus;
              const estPayStatus: PaymentStatusLabel =
                !isOta && rawEstPayStatus === 'Paid to OTA' ? 'Paid' : rawEstPayStatus;
              const actualPayoutReceivedEst =
                isCollectedByOtaNew && bookingOtaPayoutStatus === 'received'
                  ? Math.max(
                      0,
                      Math.round(parseFormattedPriceInput(bookingActualPayoutInput) ?? expectedPayoutEst)
                    )
                  : 0;
              const hotelMoneyReceivedEst = directPaidEst + actualPayoutReceivedEst;
              const roomsMatchingType = sortedRooms.filter(
                (r) => !newRequestedRoomType || r.roomType === newRequestedRoomType
              );
              const propertyShortName = property.name.split(' ')[0] || 'Property';

              const typeRoomsForAvail = sortedRooms.filter(
                (r) => !newRequestedRoomType || r.roomType === newRequestedRoomType
              );
              const openTypeRoomsCount = typeRoomsForAvail.filter(
                (r) =>
                  checkRoomDateRangeAvailability({
                    room: r,
                    checkInDate,
                    checkOutDate,
                    reservations,
                    blockedDates,
                  }).available
              ).length;
              const currentSelectionAvailability = checkRoomDateRangeAvailability({
                room: pickedRoom,
                roomType: pickedRoom ? pickedRoom.roomType : newRequestedRoomType,
                rooms,
                checkInDate,
                checkOutDate,
                reservations,
                blockedDates,
              });
              const totalGuestsCount = Math.max(1, adults) + Math.max(0, childrenCount);

              const handleResetBookingForm = () => {
                setBookingError(null);
                setGuestFirstName('');
                setGuestLastName('');
                setGuestPhone('+234 ');
                setGuestEmail('');
                setGuestAddress('');
                setGuestCity('Enugu');
                setGuestState('Enugu');
                setGuestCountry('Nigeria');
                setInlineIdType('NIN');
                setInlineIdNumber('');
                setInlineIdExpiryDate('');
                setBookingRatePlan('Standard Rate');
                setBookingSpecialRequests('');
                setAdults(2);
                setChildrenCount(0);
                setCheckInDate(todayIso);
                const resetOut = addDaysIso(todayIso, 1);
                setCheckOutDate(resetOut);
                setNights(1);
                setSelectedRoomId('');
                setChannel('Website');
                setInitialBookingStatus('confirmed');
                setBookingCollectionMode('hotel_collect');
                setBookingCurrency('NGN');
                setBookingFxRateInput('1');
                setBookingNightlyRateInput(formatPriceInputWithCommas(baseRateNgn));
                setBookingExpectedPayoutManual(false);
                setBookingExpectedPayoutInput(formatPriceInputWithCommas(baseRateNgn));
                setBookingHotelPaidInput('0');
                setBookingAmountDueManual(false);
                setBookingAmountDueInput('');
                setBookingPaymentStatusManual(false);
                setBookingPaymentStatus('Unpaid');
                setCautionDepositEnabled(false);
                setCautionDepositCollectedInput('0');
                setCautionDepositRefunded(false);
              };

              const formatPrettyDate = (iso: string) => {
                if (!iso) return '—';
                const parts = iso.split('-').map(Number);
                if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return iso;
                const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                return d.toLocaleDateString('en-US', {
                  month: 'short',
                  day: '2-digit',
                  year: 'numeric',
                  timeZone: 'UTC',
                });
              };

              return (
                <form onSubmit={handleCreateBooking} className="space-y-5">
                  {/* Breadcrumb / Top Header Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowBookingForm(false)}
                        className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-display font-bold text-[#0b6b3a]">Front Desk</span>
                        <span className="text-slate-400">›</span>
                        <h2 className="font-display font-bold text-slate-900">New Reservation</h2>
                      </div>
                    </div>
                    <span className="text-xs font-mono-tabular text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                      {property.name} · {formatPrettyDate(todayIso)}
                    </span>
                  </div>

                  {bookingError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span className="leading-snug font-medium">{bookingError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBookingError(null)}
                        aria-label="Dismiss alert"
                        className="text-rose-700 hover:text-rose-950 shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Two-Column PureCrest New Reservation Workspace */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                    {/* LEFT COLUMN (8/12): Reservation Details Form Card */}
                    <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="bg-[#0b6b3a] text-white px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <BedDouble className="w-5 h-5 text-emerald-200 shrink-0" />
                          <h3 className="font-display text-base font-bold tracking-tight">
                            Reservation Details
                          </h3>
                        </div>
                        <span className="text-[11px] font-mono-tabular text-emerald-100">
                          Booked: {todayIso}
                        </span>
                      </div>

                      <div className="p-5 space-y-5 text-xs">
                        {/* Row 1: Check-In / Check-Out Date Picker + Nights */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                          <div className="lg:col-span-9">
                            <AvailabilityDateRangePicker
                              checkInDate={checkInDate}
                              checkOutDate={checkOutDate}
                              onChangeDates={(val, safeOut) => {
                                setBookingError(null);
                                setCheckInDate(val);
                                setCheckOutDate(safeOut);
                                const nextNights = diffNights(val, safeOut);
                                setNights(nextNights);
                                let effectiveRate = activeSourceNightlyRate;
                                if (selectedRoomId) {
                                  const curRoom = rooms.find((r) => r.id === selectedRoomId);
                                  if (
                                    curRoom &&
                                    !checkRoomDateRangeAvailability({
                                      room: curRoom,
                                      checkInDate: val,
                                      checkOutDate: safeOut,
                                      reservations,
                                      blockedDates,
                                    }).available
                                  ) {
                                    const sameTypeOpen = sortedRooms.find(
                                      (r) =>
                                        r.roomType === curRoom.roomType &&
                                        checkRoomDateRangeAvailability({
                                          room: r,
                                          checkInDate: val,
                                          checkOutDate: safeOut,
                                          reservations,
                                          blockedDates,
                                        }).available
                                    );
                                    if (sameTypeOpen) {
                                      setSelectedRoomId(sameTypeOpen.id);
                                      effectiveRate =
                                        activeCur === 'NGN'
                                          ? sameTypeOpen.nightlyRateNgn
                                          : Number(
                                              (
                                                sameTypeOpen.nightlyRateNgn / Math.max(1, fxRate)
                                              ).toFixed(2)
                                            );
                                      setBookingNightlyRateInput(
                                        activeCur === 'NGN'
                                          ? formatPriceInputWithCommas(sameTypeOpen.nightlyRateNgn)
                                          : String(effectiveRate)
                                      );
                                    } else {
                                      setSelectedRoomId('');
                                    }
                                  }
                                }
                                const nextStayNgn =
                                  activeCur === 'NGN'
                                    ? Math.round(effectiveRate * nextNights)
                                    : Math.round(effectiveRate * nextNights * fxRate);
                                if (!bookingExpectedPayoutManual) {
                                  setBookingExpectedPayoutInput(
                                    formatPriceInputWithCommas(nextStayNgn)
                                  );
                                }
                                if (!isOta && estPayStatus === 'Paid') {
                                  setBookingHotelPaidInput(formatPriceInputWithCommas(nextStayNgn));
                                }
                              }}
                              room={pickedRoom}
                              roomType={newRequestedRoomType}
                              rooms={sortedRooms}
                              reservations={reservations}
                              blockedDates={blockedDates}
                              onSelectAlternativeRoom={(alt) => {
                                setSelectedRoomId(alt.id);
                                setNewRequestedRoomType(alt.roomType);
                                const nextTotal = alt.nightlyRateNgn * Math.max(1, nights);
                                setBookingNightlyRateInput(
                                  activeCur === 'NGN'
                                    ? formatPriceInputWithCommas(alt.nightlyRateNgn)
                                    : String(
                                        Number((alt.nightlyRateNgn / Math.max(1, fxRate)).toFixed(2))
                                      )
                                );
                                if (!bookingExpectedPayoutManual) {
                                  setBookingExpectedPayoutInput(
                                    formatPriceInputWithCommas(nextTotal)
                                  );
                                }
                                if (!isOta && estPayStatus === 'Paid') {
                                  setBookingHotelPaidInput(formatPriceInputWithCommas(nextTotal));
                                }
                                setBookingError(null);
                              }}
                              checkInLabel="Check-In Date *"
                              checkOutLabel="Check-Out Date *"
                            />
                          </div>

                          <div className="lg:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Nights
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={nights}
                              onChange={(e) => {
                                const nextN = Math.max(1, Number(e.target.value));
                                const nextOut = addDaysIso(checkInDate, nextN);
                                setNights(nextN);
                                setCheckOutDate(nextOut);
                                const nextStayNgn =
                                  activeCur === 'NGN'
                                    ? Math.round(activeSourceNightlyRate * nextN)
                                    : Math.round(activeSourceNightlyRate * nextN * fxRate);
                                if (!bookingExpectedPayoutManual) {
                                  setBookingExpectedPayoutInput(
                                    formatPriceInputWithCommas(nextStayNgn)
                                  );
                                }
                                if (!isOta && estPayStatus === 'Paid') {
                                  setBookingHotelPaidInput(formatPriceInputWithCommas(nextStayNgn));
                                }
                                setBookingError(null);
                              }}
                              className="w-full h-10 border border-emerald-200 bg-emerald-50/70 rounded-lg px-3 text-sm font-mono-tabular font-bold text-[#0b6b3a]"
                            />
                          </div>
                        </div>

                        {/* Row 2: Room Type, Room Assignment, Guests */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Room Type <span className="text-rose-600">*</span>
                            </label>
                            <select
                              value={newRequestedRoomType}
                              onChange={(e) => {
                                const rt = e.target.value;
                                setNewRequestedRoomType(rt);
                                const matching = sortedRooms.filter(
                                  (r) => r.roomType === rt && r.occupancyStatus !== 'out_of_order'
                                );
                                const preferred = matching.find(
                                  (r) =>
                                    checkRoomDateRangeAvailability({
                                      room: r,
                                      checkInDate,
                                      checkOutDate,
                                      reservations,
                                      blockedDates,
                                    }).available
                                );
                                const rateSource = preferred || matching[0];
                                setSelectedRoomId(preferred ? preferred.id : '');
                                if (rateSource) {
                                  const nextTotal = rateSource.nightlyRateNgn * Math.max(1, nights);
                                  setBookingNightlyRateInput(
                                    activeCur === 'NGN'
                                      ? formatPriceInputWithCommas(rateSource.nightlyRateNgn)
                                      : String(
                                          Number(
                                            (rateSource.nightlyRateNgn / Math.max(1, fxRate)).toFixed(
                                              2
                                            )
                                          )
                                        )
                                  );
                                  if (!bookingExpectedPayoutManual) {
                                    setBookingExpectedPayoutInput(
                                      formatPriceInputWithCommas(nextTotal)
                                    );
                                  }
                                  if (!isOta && estPayStatus === 'Paid') {
                                    setBookingHotelPaidInput(formatPriceInputWithCommas(nextTotal));
                                  }
                                }
                                setBookingError(null);
                              }}
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium focus:outline-none focus:border-[#0b6b3a]"
                            >
                              {uniqueRoomTypes.map((rt) => {
                                const typeRooms = sortedRooms.filter((r) => r.roomType === rt);
                                const sample = typeRooms[0];
                                const openCount = typeRooms.filter(
                                  (r) =>
                                    checkRoomDateRangeAvailability({
                                      room: r,
                                      checkInDate,
                                      checkOutDate,
                                      reservations,
                                      blockedDates,
                                    }).available
                                ).length;
                                const availLabel =
                                  typeRooms.length > 0
                                    ? openCount > 0
                                      ? `(${openCount} open)`
                                      : '(Sold out)'
                                    : '';
                                return (
                                  <option key={rt} value={rt}>
                                    {rt} {sample ? `· ${formatNgn(sample.nightlyRateNgn)}/nt` : ''}{' '}
                                    {availLabel}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Room Assignment
                            </label>
                            <select
                              value={selectedRoomId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const rm = rooms.find((r) => r.id === nextId);
                                setSelectedRoomId(nextId);
                                setBookingError(null);
                                if (rm) {
                                  setNewRequestedRoomType(rm.roomType);
                                  const nextTotal = rm.nightlyRateNgn * Math.max(1, nights);
                                  setBookingNightlyRateInput(
                                    activeCur === 'NGN'
                                      ? formatPriceInputWithCommas(rm.nightlyRateNgn)
                                      : String(
                                          Number((rm.nightlyRateNgn / Math.max(1, fxRate)).toFixed(2))
                                        )
                                  );
                                  if (!bookingExpectedPayoutManual) {
                                    setBookingExpectedPayoutInput(
                                      formatPriceInputWithCommas(nextTotal)
                                    );
                                  }
                                  if (!isOta && estPayStatus === 'Paid') {
                                    setBookingHotelPaidInput(formatPriceInputWithCommas(nextTotal));
                                  }
                                }
                              }}
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs focus:outline-none focus:border-[#0b6b3a]"
                            >
                              <option value="">Assign at Check-In</option>
                              {(roomsMatchingType.length > 0 ? roomsMatchingType : sortedRooms).map(
                                (r) => {
                                  const avail = checkRoomDateRangeAvailability({
                                    room: r,
                                    checkInDate,
                                    checkOutDate,
                                    reservations,
                                    blockedDates,
                                  });
                                  return (
                                    <option key={r.id} value={r.id} disabled={!avail.available}>
                                      {r.roomNumber} · {r.name} — {formatRoomAvailabilityTag(avail)}
                                    </option>
                                  );
                                }
                              )}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Guests (Adults / Child) <span className="text-rose-600">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                type="number"
                                min={1}
                                title="Adults"
                                value={adults}
                                onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 text-xs font-mono-tabular"
                              />
                              <input
                                type="number"
                                min={0}
                                title="Children"
                                value={childrenCount}
                                onChange={(e) =>
                                  setChildrenCount(Math.max(0, Number(e.target.value)))
                                }
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 text-xs font-mono-tabular"
                              />
                            </div>
                          </div>
                        </div>

                        <hr className="border-slate-100" />

                        {/* Guest Information Block (with Residential Address, ID Type, ID Number, ID Expiry Date) */}
                        <div className="space-y-3.5">
                          <div className="flex items-center gap-2 text-[#0b6b3a]">
                            <UserCircle2 className="w-4 h-4 shrink-0" />
                            <h4 className="font-display text-sm font-bold">Guest Information</h4>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                First Name <span className="text-rose-600">*</span>
                              </label>
                              <input
                                required
                                type="text"
                                value={guestFirstName}
                                onChange={(e) => setGuestFirstName(e.target.value)}
                                placeholder="e.g. John"
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#0b6b3a]"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Last Name <span className="text-rose-600">*</span>
                              </label>
                              <input
                                required
                                type="text"
                                value={guestLastName}
                                onChange={(e) => setGuestLastName(e.target.value)}
                                placeholder="e.g. Doe"
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#0b6b3a]"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Phone <span className="text-rose-600">*</span>
                              </label>
                              <div className="relative">
                                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  required
                                  type="text"
                                  value={guestPhone}
                                  onChange={(e) => setGuestPhone(e.target.value)}
                                  placeholder="+234 801 234 5678"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg pl-8 pr-3 text-xs font-mono-tabular focus:outline-none focus:border-[#0b6b3a]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Email
                              </label>
                              <div className="relative">
                                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="email"
                                  value={guestEmail}
                                  onChange={(e) => setGuestEmail(e.target.value)}
                                  placeholder="john.doe@example.com"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg pl-8 pr-3 text-xs focus:outline-none focus:border-[#0b6b3a]"
                                />
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Residential Address
                              </label>
                              <div className="relative">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={guestAddress}
                                  onChange={(e) => setGuestAddress(e.target.value)}
                                  placeholder="House / Street / Estate / Residential Address"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg pl-8 pr-3 text-xs focus:outline-none focus:border-[#0b6b3a]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Nationality
                              </label>
                              <CountrySelect
                                value={guestCountry}
                                onChange={setGuestCountry}
                                placeholder="Search nationality / country..."
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  City
                                </label>
                                <input
                                  type="text"
                                  value={guestCity}
                                  onChange={(e) => setGuestCity(e.target.value)}
                                  placeholder="e.g. Enugu"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#0b6b3a]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  State
                                </label>
                                <input
                                  type="text"
                                  value={guestState}
                                  onChange={(e) => setGuestState(e.target.value)}
                                  placeholder="State"
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs focus:outline-none focus:border-[#0b6b3a]"
                                />
                              </div>
                            </div>
                          </div>

                          {/* KYC Identity Row: ID Type, ID Number, ID Expiry Date */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                ID Type
                              </label>
                              <select
                                value={inlineIdType}
                                onChange={(e) =>
                                  setInlineIdType(e.target.value as GuestRecord['idType'])
                                }
                                className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs focus:outline-none focus:border-[#0b6b3a]"
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
                                value={inlineIdNumber}
                                onChange={(e) => setInlineIdNumber(e.target.value)}
                                placeholder="Document / Passport No."
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular focus:outline-none focus:border-[#0b6b3a]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                ID Expiry Date
                              </label>
                              <input
                                type="date"
                                value={inlineIdExpiryDate}
                                onChange={(e) => setInlineIdExpiryDate(e.target.value)}
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular focus:outline-none focus:border-[#0b6b3a]"
                              />
                            </div>
                          </div>
                        </div>

                        <hr className="border-slate-100" />

                        {/* Booking Source, Rate Plan & Reservation Status */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#0b6b3a] mb-1">
                              Booking Source
                            </label>
                            <select
                              value={channel}
                              onChange={(e) => {
                                const nextCh = e.target.value as ReservationRecord['channel'];
                                setChannel(nextCh);
                                setBookingPaymentStatusManual(false);
                                const nextIsOta = isOtaBookingChannel(nextCh);
                                const defaultRoomTotal = baseRateNgn * Math.max(1, nights);
                                if (!nextIsOta) {
                                  setBookingCollectionMode('hotel_collect');
                                  setBookingOtaPayoutStatus('pending');
                                  setBookingActualPayoutInput('0');
                                  setBookingAmountDueManual(false);
                                  setBookingCurrency('NGN');
                                  setBookingFxRateInput('1');
                                  setBookingNightlyRateInput(formatPriceInputWithCommas(baseRateNgn));
                                  setBookingOtaPaidSourceInput('');
                                  setBookingExpectedPayoutManual(false);
                                  setBookingExpectedPayoutInput(
                                    formatPriceInputWithCommas(defaultRoomTotal)
                                  );
                                  setBookingHotelPaidInput('0');
                                  setPaymentMethod('Bank Transfer');
                                } else {
                                  setBookingCollectionMode('ota_prepaid');
                                  setBookingOtaPayoutStatus('pending');
                                  setBookingActualPayoutInput('0');
                                  setBookingAmountDueInput('0');
                                  setBookingAmountDueManual(false);
                                  const nextCur = getDefaultOtaChannelCurrency(nextCh);
                                  const nextFx =
                                    nextCur === 'NGN'
                                      ? 1
                                      : getFxRateToNgn(nextCur, property.usdExchangeRateNgn);
                                  setBookingCurrency(nextCur);
                                  setBookingFxRateInput(
                                    nextCur === 'NGN' ? '1' : formatPriceInputWithCommas(nextFx)
                                  );
                                  const srcNightly =
                                    nextCur === 'NGN'
                                      ? baseRateNgn
                                      : Number((baseRateNgn / Math.max(1, nextFx)).toFixed(2));
                                  setBookingNightlyRateInput(
                                    nextCur === 'NGN'
                                      ? formatPriceInputWithCommas(baseRateNgn)
                                      : String(srcNightly)
                                  );
                                  setBookingOtaPaidSourceInput(
                                    String(Number((srcNightly * Math.max(1, nights)).toFixed(2)))
                                  );
                                  setBookingHotelPaidInput('0');
                                  setPaymentMethod('OTA Platform Payout');
                                  if (!bookingExpectedPayoutManual) {
                                    setBookingExpectedPayoutInput(
                                      formatPriceInputWithCommas(defaultRoomTotal)
                                    );
                                  }
                                }
                              }}
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium focus:outline-none focus:border-[#0b6b3a]"
                            >
                              {PRIMARY_BOOKING_SOURCES.map((src) => (
                                <option key={src.value} value={src.value}>
                                  {src.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-[#0b6b3a] mb-1">
                              Rate Plan
                            </label>
                            <select
                              value={bookingRatePlan}
                              onChange={(e) => setBookingRatePlan(e.target.value)}
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium focus:outline-none focus:border-[#0b6b3a]"
                            >
                              {RATE_PLAN_OPTIONS.map((plan) => (
                                <option key={plan} value={plan}>
                                  {plan}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Reservation Status
                            </label>
                            <select
                              value={initialBookingStatus}
                              onChange={(e) =>
                                setInitialBookingStatus(e.target.value as 'confirmed' | 'pending')
                              }
                              className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium focus:outline-none focus:border-[#0b6b3a]"
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="pending">Pending</option>
                            </select>
                          </div>
                        </div>

                        {/* Payment Section */}
                        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 space-y-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-display text-xs font-bold text-[#0b6b3a] uppercase tracking-wider">
                              Payment
                            </h4>
                            <span className="text-[11px] font-mono-tabular text-emerald-800">
                              1 USD = ₦{internalUsdRate.toLocaleString()}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Nightly Rate ({activeCur})
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={bookingNightlyRateInput}
                                onChange={(e) => {
                                  handleCommaPriceChange(e, bookingNightlyRateInput, (nextVal) => {
                                    setBookingNightlyRateInput(nextVal);
                                    const parsedRate = parseFormattedPriceInput(nextVal) ?? 0;
                                    if (parsedRate >= 0) {
                                      const nextTotalSrc = parsedRate * safeNights;
                                      const nextTotalNgn =
                                        activeCur === 'NGN'
                                          ? Math.round(nextTotalSrc)
                                          : Math.round(nextTotalSrc * fxRate);
                                      if (!bookingExpectedPayoutManual) {
                                        setBookingExpectedPayoutInput(
                                          formatPriceInputWithCommas(nextTotalNgn)
                                        );
                                      }
                                      if (!isOta && estPayStatus === 'Paid') {
                                        setBookingHotelPaidInput(
                                          formatPriceInputWithCommas(nextTotalNgn)
                                        );
                                      }
                                    }
                                  });
                                }}
                                placeholder={activeCur === 'NGN' ? '120,000' : '120.00'}
                                className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Payment Method
                              </label>
                              <select
                                value={paymentMethod}
                                onChange={(e) =>
                                  setPaymentMethod(
                                    e.target.value as ReservationRecord['paymentMethod']
                                  )
                                }
                                className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                              >
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Card POS">Card POS</option>
                                <option value="Cash NGN">Cash NGN</option>
                                <option value="Online Gateway">Online Gateway</option>
                                <option value="Corporate Invoice">Corporate Invoice</option>
                                {isOta && (
                                  <option value="OTA Platform Payout">OTA Platform Payout</option>
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Payment Status
                              </label>
                              <select
                                value={estPayStatus}
                                onChange={(e) => {
                                  const nextStatus = e.target.value as PaymentStatusLabel;
                                  setBookingPaymentStatus(nextStatus);
                                  setBookingPaymentStatusManual(true);
                                  if (isOta && nextStatus === 'Paid to OTA') {
                                    setBookingCollectionMode('ota_prepaid');
                                    setBookingAmountDueInput('0');
                                    setBookingAmountDueManual(true);
                                  } else if (nextStatus === 'Unpaid') {
                                    setBookingHotelPaidInput('0');
                                    setBookingAmountDueManual(false);
                                    if (isOta) setBookingOtaPaidSourceInput('0');
                                  } else if (nextStatus === 'Paid' && !isCollectedByOtaNew) {
                                    setBookingHotelPaidInput(
                                      formatPriceInputWithCommas(estTotalCharges)
                                    );
                                    setBookingAmountDueManual(false);
                                  }
                                }}
                                className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-semibold"
                              >
                                {isOta && <option value="Paid to OTA">Paid to OTA</option>}
                                <option value="Paid">Paid</option>
                                <option value="Partial">Partial</option>
                                <option value="Unpaid">Unpaid</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                                Amount Paid to {propertyShortName} (₦)
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={bookingHotelPaidInput}
                                onChange={(e) => {
                                  setBookingPaymentStatusManual(false);
                                  setBookingAmountDueManual(false);
                                  handleCommaPriceChange(
                                    e,
                                    bookingHotelPaidInput,
                                    setBookingHotelPaidInput
                                  );
                                }}
                                placeholder="0"
                                className="w-full h-10 border border-emerald-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold text-emerald-900"
                              />
                            </div>

                            {isOta && (
                              <>
                                <div>
                                  <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                                    Payment Collection Type
                                  </label>
                                  <select
                                    value={bookingCollectionMode}
                                    onChange={(e) => {
                                      const nextMode = e.target.value as OtaPaymentCollectionMode;
                                      setBookingCollectionMode(nextMode);
                                      setBookingPaymentStatusManual(false);
                                      if (nextMode === 'ota_prepaid') {
                                        setBookingAmountDueInput('0');
                                        setBookingAmountDueManual(false);
                                        setPaymentMethod('OTA Platform Payout');
                                      } else {
                                        setBookingAmountDueManual(false);
                                        setPaymentMethod('Bank Transfer');
                                      }
                                    }}
                                    className="w-full h-10 border border-blue-200 rounded-lg px-3 bg-white text-xs font-semibold text-blue-900"
                                  >
                                    <option value="ota_prepaid">Paid to OTA</option>
                                    <option value="pay_at_property">Pay at Property</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    OTA Currency &amp; FX (₦)
                                  </label>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <select
                                      value={bookingCurrency}
                                      onChange={(e) => {
                                        const nextCur = e.target.value as ChannelCurrency;
                                        setBookingCurrency(nextCur);
                                        const nextFx =
                                          nextCur === 'NGN'
                                            ? 1
                                            : getFxRateToNgn(nextCur, property.usdExchangeRateNgn);
                                        setBookingFxRateInput(
                                          nextCur === 'NGN' ? '1' : formatPriceInputWithCommas(nextFx)
                                        );
                                        setBookingNightlyRateInput(
                                          nextCur === 'NGN'
                                            ? formatPriceInputWithCommas(baseRateNgn)
                                            : String(
                                                Number(
                                                  (baseRateNgn / Math.max(1, nextFx)).toFixed(2)
                                                )
                                              )
                                        );
                                      }}
                                      className="h-10 border border-slate-200 rounded-lg px-2 bg-white text-xs font-semibold"
                                    >
                                      {SUPPORTED_CHANNEL_CURRENCIES.map((cur) => (
                                        <option key={cur} value={cur}>
                                          {cur}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      disabled={bookingCurrency === 'NGN'}
                                      value={bookingCurrency === 'NGN' ? '1' : bookingFxRateInput}
                                      onChange={(e) =>
                                        handleCommaPriceChange(
                                          e,
                                          bookingFxRateInput,
                                          setBookingFxRateInput
                                        )
                                      }
                                      placeholder="FX Rate"
                                      className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 text-xs font-mono-tabular disabled:bg-slate-100"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                                    Paid to {channel} ({activeCur})
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={bookingOtaPaidSourceInput}
                                    onChange={(e) => {
                                      setBookingPaymentStatusManual(false);
                                      handleCommaPriceChange(
                                        e,
                                        bookingOtaPaidSourceInput,
                                        (nextVal) => {
                                          setBookingOtaPaidSourceInput(nextVal);
                                          if (!bookingExpectedPayoutManual) {
                                            const parsedSrc = parseFormattedPriceInput(nextVal) ?? 0;
                                            if (parsedSrc > 0) {
                                              setBookingExpectedPayoutInput(
                                                formatPriceInputWithCommas(
                                                  Math.round(parsedSrc * fxRate)
                                                )
                                              );
                                            }
                                          }
                                        }
                                      );
                                    }}
                                    className="w-full h-10 border border-blue-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold text-blue-900"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Expected OTA Payout (₦)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="e.g. 165,000"
                                    value={bookingExpectedPayoutInput}
                                    onChange={(e) => {
                                      setBookingExpectedPayoutManual(true);
                                      handleCommaPriceChange(
                                        e,
                                        bookingExpectedPayoutInput,
                                        setBookingExpectedPayoutInput
                                      );
                                    }}
                                    className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          {/* Optional Refundable Caution Deposit */}
                          <div className="pt-2 border-t border-emerald-200/70 space-y-2.5">
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cautionDepositEnabled}
                                onChange={(e) => setCautionDepositEnabled(e.target.checked)}
                                className="rounded border-amber-400 text-[#0b6b3a]"
                              />
                              <span>Add Optional Refundable Caution / Deposit Fee</span>
                            </label>
                            {cautionDepositEnabled && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Caution Fee Amount (₦)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={cautionDepositAmountInput}
                                    onChange={(e) =>
                                      handleCommaPriceChange(
                                        e,
                                        cautionDepositAmountInput,
                                        setCautionDepositAmountInput
                                      )
                                    }
                                    placeholder="20,000"
                                    className="w-full h-9 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Amount Collected (₦)
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={cautionDepositCollectedInput}
                                    onChange={(e) =>
                                      handleCommaPriceChange(
                                        e,
                                        cautionDepositCollectedInput,
                                        setCautionDepositCollectedInput
                                      )
                                    }
                                    placeholder="0"
                                    className="w-full h-9 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                                  />
                                </div>
                                <label className="h-9 inline-flex items-center gap-2 px-3 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-950 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={cautionDepositRefunded}
                                    onChange={(e) => setCautionDepositRefunded(e.target.checked)}
                                    className="rounded border-amber-400 text-[#0b6b3a]"
                                  />
                                  <span>Refunded</span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Special Requests */}
                        <div>
                          <label className="block text-[11px] font-semibold text-[#0b6b3a] mb-1">
                            Special Requests
                          </label>
                          <textarea
                            rows={3}
                            value={bookingSpecialRequests}
                            onChange={(e) => setBookingSpecialRequests(e.target.value)}
                            placeholder="Any special request (e.g. airport pickup, early check-in request, baby cot, dietary preference)..."
                            className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-[#0b6b3a]"
                          />
                        </div>

                        {/* Bottom Action Row: Reset & Confirm Reservation */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={handleResetBookingForm}
                            className="sm:col-span-4 h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4" />
                            <span>Reset</span>
                          </button>
                          <button
                            type="submit"
                            disabled={busyId === 'booking' || !currentSelectionAvailability.available}
                            className="sm:col-span-8 h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b6b3a] hover:bg-[#09552e] text-white text-sm font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {busyId === 'booking'
                                ? 'Creating Reservation...'
                                : 'Confirm Reservation'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN (4/12): Sticky Room Availability & Reservation Summary */}
                    <div className="xl:col-span-4 space-y-4 xl:sticky xl:top-4">
                      {/* Card 1: Room Availability */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="bg-[#0b6b3a] text-white px-5 py-3">
                          <h3 className="font-display text-sm font-bold">Room Availability</h3>
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${
                                currentSelectionAvailability.available
                                  ? 'bg-[#0b6b3a] text-white'
                                  : 'bg-rose-600 text-white'
                              }`}
                            >
                              {currentSelectionAvailability.available ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <Ban className="w-5 h-5" />
                              )}
                            </span>
                            <div>
                              <p
                                className={`font-display text-base font-bold ${
                                  currentSelectionAvailability.available
                                    ? 'text-slate-900'
                                    : 'text-rose-700'
                                }`}
                              >
                                {currentSelectionAvailability.available
                                  ? 'Room Available'
                                  : 'Dates Unavailable'}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {currentSelectionAvailability.available
                                  ? `${openTypeRoomsCount} open room${openTypeRoomsCount === 1 ? '' : 's'} for selected dates`
                                  : currentSelectionAvailability.message || 'Select different dates or room'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                            <span className="font-semibold text-slate-800 truncate">
                              {pickedRoom
                                ? `${pickedRoom.roomNumber} · ${pickedRoom.roomType}`
                                : newRequestedRoomType || 'Select Room Type'}
                            </span>
                            <span className="font-mono-tabular font-bold text-[#0b6b3a] whitespace-nowrap">
                              {formatChannelCurrency(activeSourceNightlyRate, activeCur)} / night
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: Reservation Summary */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="bg-[#0b6b3a] text-white px-5 py-3">
                          <h3 className="font-display text-sm font-bold">Reservation Summary</h3>
                        </div>
                        <div className="p-5 text-xs space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Check-In</span>
                            <span className="font-semibold text-slate-900 font-mono-tabular">
                              {formatPrettyDate(checkInDate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Check-Out</span>
                            <span className="font-semibold text-slate-900 font-mono-tabular">
                              {formatPrettyDate(checkOutDate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Nights</span>
                            <span className="font-semibold text-slate-900 font-mono-tabular">
                              {safeNights}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Room Type</span>
                            <span className="font-semibold text-slate-900 text-right">
                              {newRequestedRoomType || '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Room Assigned</span>
                            <span className="font-semibold text-slate-900 text-right">
                              {pickedRoom ? pickedRoom.roomNumber : 'Assign at Check-In'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Guests</span>
                            <span className="font-semibold text-slate-900 font-mono-tabular">
                              {totalGuestsCount} ({adults}A{childrenCount > 0 ? `, ${childrenCount}C` : ''})
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Rate Plan</span>
                            <span className="font-semibold text-slate-900 text-right">
                              {bookingRatePlan}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Payment Status</span>
                            <span className="font-semibold text-[#0b6b3a]">{estPayStatus}</span>
                          </div>

                          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-slate-600 font-medium">Rate Per Night</span>
                            <span className="font-mono-tabular font-bold text-slate-900">
                              {formatChannelCurrency(activeSourceNightlyRate, activeCur)}
                            </span>
                          </div>

                          <div className="-mx-5 px-5 py-3.5 mt-2 bg-emerald-50 border-y border-emerald-200 flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-bold text-[#0b6b3a]">
                              Total Amount
                            </span>
                            <div className="text-right">
                              <p className="font-mono-tabular text-lg font-extrabold text-[#0b6b3a]">
                                {formatNgn(activeStayNgnEquivalent)}
                              </p>
                              <p className="text-[10px] font-mono-tabular text-emerald-800">
                                ≈ {formatUsd(activeStayUsdEquivalent)} USD
                              </p>
                            </div>
                          </div>

                          {hotelMoneyReceivedEst > 0 && (
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-slate-500">Paid Now</span>
                              <span className="font-mono-tabular font-semibold text-emerald-700">
                                {formatNgn(hotelMoneyReceivedEst)}
                              </span>
                            </div>
                          )}
                          {estBalanceDue > 0 && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-slate-500">Balance Due</span>
                              <span className="font-mono-tabular font-bold text-rose-700">
                                {formatNgn(estBalanceDue)} ({formatUsd(estBalanceUsd)})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card 3: Confirmation & Check-In Policy Notice */}
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-3 text-xs text-emerald-950">
                        <span className="w-6 h-6 rounded-full bg-[#0b6b3a] text-white inline-flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          i
                        </span>
                        <div className="space-y-1 leading-relaxed">
                          <p className="font-semibold text-[#0b6b3a]">
                            Reservation will be saved without automatic check-in.
                          </p>
                          <p className="text-slate-700">
                            After confirmation, use <strong>Proceed to Check-In</strong> on the
                            scheduled arrival date ({formatPrettyDate(checkInDate)}) to verify ID,
                            assign a room if needed, and complete check-in.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              );
            })()
          ) : selectedRoomDetail ? (
            (() => {
              const roomReservations = reservations.filter(
                (r) =>
                  r.roomId === selectedRoomDetail.id ||
                  r.roomNumber === selectedRoomDetail.roomNumber
              );
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRoomDetailId(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Rooms</span>
                      </button>
                      <div>
                        <p className="text-xs font-mono-tabular text-slate-500">
                          {selectedRoomDetail.roomNumber} · {getRoomSection(selectedRoomDetail)} · Floor{' '}
                          {selectedRoomDetail.floor} · {systemPropertyId}
                        </p>
                        <h2 className="font-display text-lg font-bold text-slate-900">
                          {selectedRoomDetail.name} — {selectedRoomDetail.roomType}
                        </h2>
                      </div>
                    </div>
                    {canManageRooms && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = selectedRoomDetail;
                          setSelectedRoomDetailId(null);
                          openRoomEditor(target);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Edit Room &amp; Rate</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-5 space-y-3">
                      <RoomGallerySlider
                        slides={getRoomGalleryImages(selectedRoomDetail)}
                        roomNumber={selectedRoomDetail.roomNumber}
                        roomName={selectedRoomDetail.name}
                        heightClass="h-64"
                        showThumbnails
                      />
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="border border-slate-200 rounded-xl p-3">
                          <p className="text-slate-500">Nightly Rate (NGN)</p>
                          <p className="font-mono-tabular text-base font-bold text-slate-900 mt-0.5">
                            {formatNgn(selectedRoomDetail.nightlyRateNgn)}
                          </p>
                          <p className="font-mono-tabular text-[11px] text-emerald-700">
                            ≈{' '}
                            {formatUsd(
                              convertNgnToUsd(
                                selectedRoomDetail.nightlyRateNgn,
                                property.usdExchangeRateNgn
                              ),
                              2
                            )}{' '}
                            USD
                          </p>
                        </div>
                        <div className="border border-slate-200 rounded-xl p-3">
                          <p className="text-slate-500">Occupancy &amp; HK Status</p>
                          <p className="text-sm font-bold text-slate-900 capitalize mt-0.5">
                            {selectedRoomDetail.occupancyStatus.replace('_', ' ')}
                          </p>
                          <p className="text-[11px] text-slate-600 capitalize">
                            HK:{' '}
                            {selectedRoomDetail.housekeepingStatus === 'inspected'
                              ? 'clean'
                              : selectedRoomDetail.housekeepingStatus}{' '}
                            · Max {selectedRoomDetail.maxGuests} guests
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 space-y-5 text-xs">
                      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900">
                            Room Amenities ({(selectedRoomDetail.amenities || []).length})
                          </p>
                          {canManageRooms && (
                            <button
                              type="button"
                              onClick={() => {
                                const target = selectedRoomDetail;
                                setSelectedRoomDetailId(null);
                                openRoomEditor(target);
                              }}
                              className="text-[11px] font-semibold text-[#28488a] hover:underline cursor-pointer"
                            >
                              Edit Photos &amp; Amenities
                            </button>
                          )}
                        </div>
                        {(selectedRoomDetail.amenities || []).length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(selectedRoomDetail.amenities || []).map((amenity) => {
                              const AmenityIcon = getAmenityIcon(amenity);
                              return (
                                <div
                                  key={amenity}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-800 font-medium"
                                >
                                  <AmenityIcon className="w-3.5 h-3.5 text-[#28488a] shrink-0" />
                                  <span>{amenity}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-slate-500">No amenities listed yet.</p>
                        )}
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <h3 className="font-display text-xs font-bold text-slate-900">
                            Reservations Linked to {selectedRoomDetail.roomNumber} (
                            {roomReservations.length})
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              const targetRoomId = selectedRoomDetail.id;
                              setSelectedRoomDetailId(null);
                              if (onStartNewReservationForRoom) {
                                onStartNewReservationForRoom(targetRoomId);
                              } else {
                                setSelectedRoomId(selectedRoomDetail.id);
                                setNewRequestedRoomType(selectedRoomDetail.roomType);
                                setBookingExpectedPayoutManual(false);
                                setBookingExpectedPayoutInput(
                                  formatPriceInputWithCommas(selectedRoomDetail.nightlyRateNgn)
                                );
                                setShowBookingForm(true);
                                onNavigateSection?.('reservations');
                              }
                            }}
                            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            + New Reservation for Room
                          </button>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {roomReservations.slice(0, 8).map((r) => (
                            <div
                              key={r.id}
                              onClick={() => {
                                setSelectedRoomDetailId(null);
                                onSelectReservation?.(r.id);
                              }}
                              className="px-4 py-2.5 flex items-center justify-between hover:bg-emerald-50/40 cursor-pointer"
                            >
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {r.guestName}{' '}
                                  <span className="font-mono-tabular text-[11px] text-slate-500">
                                    · {r.bookingRef}
                                  </span>
                                </p>
                                <p className="font-mono-tabular text-[11px] text-slate-500">
                                  {r.checkInDate} → {r.checkOutDate} ({r.nights}n) · {r.channel}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] font-semibold text-emerald-700 capitalize">
                                  {r.status.replace('_', ' ')} · Open Folio →
                                </p>
                              </div>
                            </div>
                          ))}
                          {roomReservations.length === 0 && (
                            <p className="px-4 py-5 text-center text-slate-500">
                              No reservations logged for this room yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : null}
        </div>
      )}

      {/* Checkout Settlement Modal */}
      {checkoutTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <BedDouble className="w-5 h-5 text-emerald-600" />
              <h3 className="font-display text-base font-bold">
                Final Folio Settlement — {checkoutTarget.roomNumber}
              </h3>
            </div>
            {(() => {
              const checkoutSummary = getReservationPaymentSummary(
                checkoutTarget,
                property.usdExchangeRateNgn
              );
              const checkoutIsOta = isOtaBookingChannel(checkoutTarget.channel);
              return (
                <div className="text-xs space-y-2 border-y border-slate-200 py-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Guest</span>
                    <span className="font-semibold text-slate-900">{checkoutTarget.guestName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Room Charges ({checkoutTarget.nights} nights)
                    </span>
                    <span className="font-mono-tabular">{formatNgn(checkoutTarget.roomChargesNgn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Restaurant / Bar POS Charges</span>
                    <span className="font-mono-tabular">{formatNgn(checkoutTarget.posChargesNgn)}</span>
                  </div>
                  {(checkoutTarget.lateCheckoutFeeNgn || 0) > 0 && (
                    <div className="flex justify-between text-amber-800">
                      <span>
                        Late Check-Out Fee ({checkoutTarget.checkOutTime || '14:00'})
                      </span>
                      <span className="font-mono-tabular font-semibold">
                        {formatNgn(checkoutTarget.lateCheckoutFeeNgn || 0)}
                      </span>
                    </div>
                  )}
                  {checkoutIsOta && (
                    <>
                      <div className="flex justify-between pt-1 border-t border-slate-100 text-blue-800">
                        <span>
                          Guest Paid to OTA ({checkoutSummary.sourceCurrency})
                        </span>
                        <span className="font-mono-tabular font-semibold">
                          {formatChannelCurrency(
                            checkoutSummary.otaPaidSourceAmount,
                            checkoutSummary.sourceCurrency
                          )}{' '}
                          {checkoutSummary.sourceCurrency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Expected Property Payout (₦)</span>
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          {formatNgn(checkoutSummary.expectedPayoutNgn)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-600">
                      {checkoutIsOta
                        ? 'Direct Payment to Property (₦)'
                        : 'Hotel Payment Received (₦)'}
                    </span>
                    <span className="font-mono-tabular font-semibold text-emerald-700">
                      {formatNgn(checkoutSummary.hotelPaidAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold text-slate-900">
                    <span>Remaining Property Balance Due</span>
                    <span
                      className={`font-mono-tabular ${
                        checkoutSummary.balance > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatNgn(checkoutSummary.balance)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Quick Late Check-Out Fee & Check-Out Time Adjuster */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2.5 text-xs">
              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>Late Check-Out Time &amp; Fee</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Check-Out Time
                  </label>
                  <input
                    type="time"
                    value={lateCheckoutTime}
                    onChange={(e) => setLateCheckoutTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Late Fee (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={lateCheckoutFeeDraft}
                    onChange={(e) => setLateCheckoutFeeDraft(Math.max(0, Number(e.target.value)))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono-tabular"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={busyId === `late-${checkoutTarget.id}`}
                onClick={() => void handleApplyLateCheckout(checkoutTarget)}
                className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                {busyId === `late-${checkoutTarget.id}`
                  ? 'Applying...'
                  : 'Apply Late Check-Out to Bill'}
              </button>
            </div>

            <div className="text-xs">
              <label className="block font-medium text-slate-700 mb-1">
                Settlement Payment Method
              </label>
              <select
                value={settlementMethod}
                onChange={(e) =>
                  setSettlementMethod(e.target.value as ReservationRecord['paymentMethod'])
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="Card POS">Card POS</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash NGN">Cash NGN</option>
                <option value="Corporate Invoice">Corporate Invoice</option>
              </select>
            </div>

            {/* Caution Deposit Refund Checkbox (if collected and not yet refunded) */}
            {checkoutTarget.cautionDepositEnabled &&
              (checkoutTarget.cautionDepositCollectedNgn || 0) > 0 &&
              !checkoutTarget.cautionDepositRefunded && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={refundCautionOnCheckout}
                    onChange={(e) => setRefundCautionOnCheckout(e.target.checked)}
                    className="mt-0.5 rounded border-blue-300 text-blue-700"
                  />
                  <div>
                    <span className="font-semibold text-blue-950 block">
                      Mark Caution Deposit Refunded (
                      {formatNgn(checkoutTarget.cautionDepositCollectedNgn || 0)})
                    </span>
                    <span className="text-[11px] text-blue-800">
                      Room inspected — return refundable security deposit to guest at check-out.
                    </span>
                  </div>
                </label>
              )}

            {/* Mandatory Confirm All Bills Settled Checkbox */}
            <label
              className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                confirmAllBillsSettled
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={confirmAllBillsSettled}
                onChange={(e) => setConfirmAllBillsSettled(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-700"
              />
              <div>
                <span className="font-bold text-slate-900 block">
                  Confirm all bills settled
                </span>
                <span className="text-[11px] text-slate-600">
                  I verify all Room, POS / Restaurant, Late Check-Out &amp; incidental charges are
                  accounted for and settled. A printable check-out receipt will open next.
                </span>
              </div>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCheckoutTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === checkoutTarget.id || !confirmAllBillsSettled}
                onClick={handleConfirmCheckout}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {busyId === checkoutTarget.id
                    ? 'Completing Check-Out…'
                    : 'Complete Check-Out & Print Receipt'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-House Change Room Modal */}
      {changeRoomTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmChangeRoom}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Change In-House Guest Room
                </h3>
                <p className="text-slate-500 mt-0.5">
                  {changeRoomTarget.bookingRef} · {changeRoomTarget.guestName} (Currently{' '}
                  <strong className="font-mono-tabular text-slate-800">
                    {changeRoomTarget.roomNumber}
                  </strong>
                  )
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChangeRoomTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {changeRoomError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
                {changeRoomError}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Move Guest to Vacant Room *
              </label>
              <select
                required
                value={changeRoomNewId}
                onChange={(e) => {
                  setChangeRoomNewId(e.target.value);
                  setChangeRoomError(null);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                {sortedRooms.filter(
                  (r) => r.id !== changeRoomTarget.roomId && r.occupancyStatus === 'vacant'
                ).length === 0 ? (
                  <option value="">No vacant rooms available right now</option>
                ) : (
                  sortedRooms
                    .filter(
                      (r) => r.id !== changeRoomTarget.roomId && r.occupancyStatus === 'vacant'
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)}/nt) — HK:{' '}
                        {r.housekeepingStatus === 'inspected' ? 'clean' : r.housekeepingStatus}
                      </option>
                    ))
                )}
              </select>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={changeRoomAdjustRate}
                onChange={(e) => setChangeRoomAdjustRate(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600"
              />
              <span>
                <strong className="block text-slate-900">
                  Update nightly rate to new room&apos;s rate
                </strong>
                <span className="text-[11px] text-slate-500">
                  Uncheck to keep the original rate of {formatNgn(changeRoomTarget.nightlyRateNgn)}
                  /night (complimentary upgrade or same-rate move)
                </span>
              </span>
            </label>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Reason for Room Change (Optional)
              </label>
              <input
                type="text"
                value={changeRoomReason}
                onChange={(e) => setChangeRoomReason(e.target.value)}
                placeholder="e.g. Guest requested kitchenette, AC maintenance..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setChangeRoomTarget(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!changeRoomNewId || busyId === `moveroom-${changeRoomTarget.id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>
                  {busyId === `moveroom-${changeRoomTarget.id}`
                    ? 'Moving Guest...'
                    : 'Confirm Room Change'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl text-xs">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-600" />
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Cancel or Mark No-Show
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {cancelTarget.bookingRef} · {cancelTarget.guestName} (Room{' '}
                    {getReservationRoomDisplay(cancelTarget, rooms).roomNumberLabel})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Choose free cancellation or apply a cancellation fee before releasing{' '}
              <strong className="font-mono-tabular text-slate-900">
                {getReservationRoomDisplay(cancelTarget, rooms).roomNumberLabel}
              </strong>{' '}
              ({cancelTarget.checkInDate} → {cancelTarget.checkOutDate}) back to available inventory.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCancelMode('free')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  cancelMode === 'free'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold">Free Cancellation</span>
                <span className="block text-[11px] opacity-80 mt-0.5">
                  ₦0 fee · Waive room cancellation charges
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCancelMode('paid')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  cancelMode === 'paid'
                    ? 'border-rose-600 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold">Cancellation with Cost</span>
                <span className="block text-[11px] opacity-80 mt-0.5">
                  Apply cancellation fee in ₦ to reservation bill
                </span>
              </button>
            </div>

            {cancelMode === 'paid' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Cancellation Cost (₦ NGN) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={cancelFeeNgn}
                      onChange={(e) => setCancelFeeNgn(Math.max(0, Number(e.target.value)))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono-tabular font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={cancelPayMethod}
                      onChange={(e) =>
                        setCancelPayMethod(e.target.value as ReservationRecord['paymentMethod'])
                      }
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card POS">Card POS</option>
                      <option value="Cash NGN">Cash NGN</option>
                      <option value="Corporate Invoice">Corporate Invoice</option>
                      <option value="Online Gateway">Online Gateway</option>
                    </select>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={collectCancelFeeNow}
                    onChange={(e) => setCollectCancelFeeNow(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Collect cancellation fee now &amp; post to Revenue Ledger</span>
                </label>
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Cancellation Reason / Note (Optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-3.5 py-2 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
              >
                Keep Booking
              </button>
              <button
                type="button"
                disabled={busyId === cancelTarget.id}
                onClick={() => void handleConfirmCancelOrNoShow('no_show')}
                className="px-3.5 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                Mark No-show
              </button>
              <button
                type="button"
                disabled={busyId === cancelTarget.id}
                onClick={() => void handleConfirmCancelOrNoShow('cancelled')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyId === cancelTarget.id
                  ? 'Updating...'
                  : cancelMode === 'paid'
                    ? `Cancel (${formatNgn(cancelFeeNgn)})`
                    : 'Confirm Free Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {createdReservationSuccess && (() => {
        const successCheckInGuard = getCheckInDateRestriction(createdReservationSuccess, todayIso);
        const successSummary = getReservationPaymentSummary(
          createdReservationSuccess,
          property.usdExchangeRateNgn
        );
        const canStaffCheckIn =
          activeRole === 'pch_admin' ||
          activeRole === 'property_admin' ||
          activeRole === 'front_desk';
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
              <div className="bg-[#0b6b3a] text-white px-6 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-200 shrink-0" />
                  <div>
                    <h3 className="font-display text-base font-bold">
                      Reservation Created Successfully
                    </h3>
                    <p className="text-xs text-emerald-100 font-mono-tabular">
                      Booking Ref: {createdReservationSuccess.bookingRef}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatedReservationSuccess(null)}
                  className="text-emerald-100 hover:text-white cursor-pointer"
                  aria-label="Close confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Guest</span>
                    <span className="font-bold text-slate-900">
                      {createdReservationSuccess.guestName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Stay Dates</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {createdReservationSuccess.checkInDate} → {createdReservationSuccess.checkOutDate} (
                      {createdReservationSuccess.nights}n)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Room Status</span>
                    <span className="font-semibold text-[#0b6b3a]">
                      {createdReservationSuccess.roomId
                        ? `${createdReservationSuccess.roomNumber} (${createdReservationSuccess.requestedRoomType || 'Assigned'})`
                        : `Unassigned (${createdReservationSuccess.requestedRoomType || 'Assign during Check-In'})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Total Amount</span>
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {formatNgn(successSummary.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Payment Status</span>
                    <span className="font-semibold text-[#0b6b3a]">
                      {successSummary.paymentStatus} · Balance Due:{' '}
                      {formatNgn(successSummary.balance)}
                    </span>
                  </div>
                </div>

                {successCheckInGuard.restricted && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-amber-900">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p>{successCheckInGuard.message}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      const target = createdReservationSuccess;
                      setCreatedReservationSuccess(null);
                      setReceiptModalState({
                        reservation: target,
                        mode: 'reservation_payment',
                        amountJustPaidNgn: target.hotelPaidNgn || target.paidNgn || 0,
                        settlementMethodOverride: target.paymentMethod,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Receipt</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = createdReservationSuccess;
                        setCreatedReservationSuccess(null);
                        onSelectReservation?.(target.id);
                      }}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                    >
                      View Booking
                    </button>
                    <button
                      type="button"
                      disabled={successCheckInGuard.restricted || !canStaffCheckIn}
                      title={
                        successCheckInGuard.restricted
                          ? successCheckInGuard.message
                          : 'Open room assignment & check-in verification'
                      }
                      onClick={() => {
                        const target = createdReservationSuccess;
                        setCreatedReservationSuccess(null);
                        setCheckInTarget(target);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0b6b3a] hover:bg-[#09552e] disabled:opacity-50 text-white font-bold cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Proceed to Check-In</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {checkInTarget && (
        <CheckInProcessModal
          property={property}
          reservation={checkInTarget}
          room={rooms.find((r) => r.id === checkInTarget.roomId)}
          rooms={rooms}
          reservations={reservations}
          blockedDates={blockedDates}
          guest={
            guests.find((g) => g.id === checkInTarget.guestId) ||
            guests.find((g) => g.fullName.toLowerCase() === checkInTarget.guestName.toLowerCase())
          }
          actorRole={actorRole}
          canCompleteCheckIn={
            activeRole === 'pch_admin' ||
            activeRole === 'property_admin' ||
            activeRole === 'front_desk'
          }
          onClose={() => setCheckInTarget(null)}
          onCompleted={(info) => {
            onNotify(`Verified & checked in ${info.guestName} into ${info.roomNumber}`);
            onGuestCheckedIn?.(info);
          }}
        />
      )}
      {paymentModalResId &&
        (() => {
          const targetRes = reservations.find((r) => r.id === paymentModalResId);
          if (!targetRes) return null;
          return (
            <ReservationPaymentModal
              property={property}
              reservation={targetRes}
              actorRole={actorRole}
              onClose={() => setPaymentModalResId(null)}
              onNotify={onNotify}
            />
          );
        })()}
      {receiptModalState && (
        <PaymentReceiptModal
          property={property}
          reservation={receiptModalState.reservation}
          mode={receiptModalState.mode}
          amountJustPaidNgn={receiptModalState.amountJustPaidNgn}
          settlementMethodOverride={receiptModalState.settlementMethodOverride}
          onClose={() => setReceiptModalState(null)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
