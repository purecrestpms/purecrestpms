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
  formatPriceInputWithCommas,
  formatUsd,
  getDefaultOtaChannelCurrency,
  getFxRateToNgn,
  getPropertySystemId,
  getReservationBookedDate,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  getRoomGalleryImages,
  getRoomSection,
  GuestRecord,
  isOtaBookingChannel,
  LicenseRecord,
  matchesBookingSourceFilter,
  NavSectionId,
  parseFormattedPriceInput,
  PaymentStatusLabel,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
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
import { CheckInProcessModal, CheckedInConfirmationInfo } from './CheckInProcessModal';
import { CountrySelect } from './CountrySelect';
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
  onStartNewReservationForRoom?: (roomId: string) => void;
  onConsumeIntent?: () => void;
  onSelectReservation?: (id: string | null) => void;
  onNavigateSection?: (section: NavSectionId) => void;
  activeRole: StaffRole;
  actorRole: string;
  onNotify: (msg: string) => void;
  onGuestCheckedIn?: (info: CheckedInConfirmationInfo) => void;
}

const DEFAULT_SUITE_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

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

async function compressImageToDataUrl(
  file: File,
  options?: { maxWidth?: number; maxBytes?: number }
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 880;
  const maxBytes = options?.maxBytes ?? 320000;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let quality = 0.78;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length > maxBytes && quality > 0.32) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        if (result.length > maxBytes + 25000) {
          reject(new Error('Image too large after compression. Please pick a smaller image.'));
          return;
        }
        resolve(result);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
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
  const todayIso = new Date().toISOString().slice(0, 10);
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
  const [draftName, setDraftName] = useState('');
  const [draftRoomType, setDraftRoomType] = useState('');
  const [draftSection, setDraftSection] = useState<RoomSection>('Serviced Apartment');
  const [draftRateInput, setDraftRateInput] = useState<string>('65,500');
  const [draftMaxGuests, setDraftMaxGuests] = useState<number>(2);
  const [draftOccupancy, setDraftOccupancy] =
    useState<RoomRecord['occupancyStatus']>('vacant');
  const [draftHousekeeping, setDraftHousekeeping] =
    useState<RoomRecord['housekeepingStatus']>('clean');
  const [draftAmenitiesText, setDraftAmenitiesText] = useState('');
  const [draftImageUrl, setDraftImageUrl] = useState('');
  const [draftGalleryImages, setDraftGalleryImages] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editRoomError, setEditRoomError] = useState<string | null>(null);

  // Rooms search & amenity browser state
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomSectionFilter, setRoomSectionFilter] = useState<'ALL' | RoomSection>('ALL');
  const [roomStatusFilter, setRoomStatusFilter] = useState<'ALL' | RoomRecord['occupancyStatus']>('ALL');
  const [roomAmenityFilter, setRoomAmenityFilter] = useState<string>('ALL');
  const [expandedAmenityRoomIds, setExpandedAmenityRoomIds] = useState<Record<string, boolean>>({});

  // Add New Room Page state
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
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
  const [walkInCountry, setWalkInCountry] = useState('Nigeria');
  const [walkInRoomTypeFilter, setWalkInRoomTypeFilter] = useState('ALL');
  const [walkInRoomId, setWalkInRoomId] = useState('');
  const [walkInCheckOut, setWalkInCheckOut] = useState(tomorrowIso);
  const [walkInRateNgn, setWalkInRateNgn] = useState(65500);
  const [walkInPaymentMethod, setWalkInPaymentMethod] =
    useState<ReservationRecord['paymentMethod']>('Cash NGN');
  const [walkInDepositNgn, setWalkInDepositNgn] = useState(65500);
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
  const [settlementMethod, setSettlementMethod] =
    useState<ReservationRecord['paymentMethod']>('Card POS');
  const [lateCheckoutTime, setLateCheckoutTime] = useState('14:00');
  const [lateCheckoutFeeDraft, setLateCheckoutFeeDraft] = useState<number>(0);

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
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatusLabel>('Unpaid');
  const [editCautionEnabled, setEditCautionEnabled] = useState(false);
  const [editCautionAmountInput, setEditCautionAmountInput] = useState<string>('0');
  const [editCautionCollectedInput, setEditCautionCollectedInput] = useState<string>('0');
  const [editCautionRefunded, setEditCautionRefunded] = useState(false);
  const [editStayError, setEditStayError] = useState<string | null>(null);

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
        setSelectedRoomId(target.id);
        setNewRequestedRoomType(target.roomType);
        const formatted = formatPriceInputWithCommas(target.nightlyRateNgn);
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
    }
  }, [checkoutTarget?.id]);

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
      const first = sorted.find((r) => r.occupancyStatus === 'vacant') || sorted[0];
      if (first) {
        setSelectedRoomId(first.id);
        setNewRequestedRoomType(first.roomType);
        const formatted = formatPriceInputWithCommas(first.nightlyRateNgn);
        setBookingNightlyRateInput(formatted);
        setBookingExpectedPayoutInput(formatted);
        setBookingHotelPaidInput(formatted);
      }
    }
  }, [rooms]);

  useEffect(() => {
    if (walkInEligibleRooms.length > 0) {
      const currentValid = walkInEligibleRooms.find((r) => r.id === walkInRoomId);
      if (!currentValid) {
        const preferred =
          walkInEligibleRooms.find((r) => r.occupancyStatus === 'vacant') ||
          walkInEligibleRooms[0];
        setWalkInRoomId(preferred.id);
        setWalkInRateNgn(preferred.nightlyRateNgn);
        setWalkInDepositNgn(preferred.nightlyRateNgn * diffNights(todayIso, walkInCheckOut));
      }
    }
  }, [walkInRoomTypeFilter, rooms.length]);

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
    setDraftName(room.name);
    setDraftRoomType(room.roomType);
    setDraftSection(getRoomSection(room));
    setDraftRateInput(formatPriceInputWithCommas(room.nightlyRateNgn));
    setDraftMaxGuests(room.maxGuests);
    setDraftOccupancy(room.occupancyStatus);
    setDraftHousekeeping(room.housekeepingStatus);
    setDraftAmenitiesText((room.amenities || []).join(', '));
    const cover = room.imageUrl || DEFAULT_SUITE_IMAGE;
    setDraftImageUrl(cover);
    const initialSlides = getRoomGalleryImages(room).map((s) => s.url);
    setDraftGalleryImages(initialSlides.length > 0 ? initialSlides : [cover]);
    setUploadError(null);
    setEditRoomError(null);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const compressed = await compressImageToDataUrl(file, { maxWidth: 720, maxBytes: 120000 });
      setDraftImageUrl(compressed);
      setDraftGalleryImages((prev) => Array.from(new Set([compressed, ...prev])).slice(0, 6));
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
      const compressed = await compressImageToDataUrl(file, { maxWidth: 680, maxBytes: 110000 });
      setDraftGalleryImages((prev) => Array.from(new Set([...prev, compressed])).slice(0, 6));
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
      const coverUrl = draftImageUrl.trim() || draftGalleryImages[0] || DEFAULT_SUITE_IMAGE;
      const cleanGallery = Array.from(
        new Set([coverUrl, ...draftGalleryImages.map((u) => u.trim()).filter(Boolean)])
      ).slice(0, 6);
      await updateRoomStatus({
        property,
        room: editingRoom,
        updates: {
          roomNumber: draftRoomNumber.trim() || editingRoom.roomNumber,
          name: draftName.trim() || editingRoom.name,
          roomType: draftRoomType.trim() || editingRoom.roomType,
          section: draftSection,
          nightlyRateNgn: cleanRate,
          maxGuests: Math.max(1, draftMaxGuests),
          occupancyStatus: draftOccupancy,
          housekeepingStatus: draftHousekeeping,
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
    setNewRoomName(`Room ${nextNum}`);
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
      const compressed = await compressImageToDataUrl(file, { maxWidth: 720, maxBytes: 120000 });
      setNewRoomImageUrl(compressed);
      setNewRoomGalleryImages((prev) => Array.from(new Set([compressed, ...prev])).slice(0, 6));
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
      const compressed = await compressImageToDataUrl(file, { maxWidth: 680, maxBytes: 110000 });
      setNewRoomGalleryImages((prev) => Array.from(new Set([...prev, compressed])).slice(0, 6));
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
    if (!trimmedCode || !newRoomName.trim() || !newRoomType.trim()) {
      setAddRoomError('Room code, room title, and room type are required.');
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
      const coverUrl = newRoomImageUrl || newRoomGalleryImages[0] || DEFAULT_SUITE_IMAGE;
      const cleanGallery = Array.from(
        new Set([coverUrl, ...newRoomGalleryImages.map((u) => u.trim()).filter(Boolean)])
      ).slice(0, 6);
      await createRoomWorkflow({
        property,
        currentRoomCount: rooms.length,
        maxRooms: effectiveMaxRooms,
        roomNumber: trimmedCode,
        name: newRoomName.trim(),
        roomType: newRoomType.trim(),
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
      onNotify(`Added new room ${trimmedCode} (${newRoomType.trim()}) to ${property.name}`);
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

    if (checkOutDate <= checkInDate) {
      setBookingError('Check-out date must be after check-in date.');
      return;
    }

    if (targetRoom) {
      const resOverlap = reservations.find(
        (r) =>
          r.roomId === targetRoom.id &&
          (r.status === 'confirmed' || r.status === 'checked_in') &&
          datesOverlap(checkInDate, checkOutDate, r.checkInDate, r.checkOutDate)
      );
      if (resOverlap) {
        setBookingError(
          `${targetRoom.roomNumber} already has ${resOverlap.bookingRef} (${resOverlap.guestName}) from ${resOverlap.checkInDate} to ${resOverlap.checkOutDate}.`
        );
        return;
      }

      const blockOverlap = blockedDates.find(
        (b) =>
          b.roomId === targetRoom.id && datesOverlap(checkInDate, checkOutDate, b.startDate, b.endDate)
      );
      if (blockOverlap) {
        setBookingError(
          `${targetRoom.roomNumber} is blocked (${blockOverlap.category}: ${blockOverlap.reason}) from ${blockOverlap.startDate} to ${blockOverlap.endDate}.`
        );
        return;
      }
    }

    if (immediateCheckIn) {
      if (!targetRoom) {
        setBookingError('Please assign a specific room before performing immediate check-in.');
        return;
      }
      if (
        !inlinePayConfirmed ||
        !inlineIdVerified ||
        inlineIdNumber.trim().length < 3 ||
        inlineKeyIssued !== 'yes' ||
        !inlineRoomReady
      ) {
        setBookingError(
          'Immediate check-in requires confirming payment, verifying Guest ID, setting Key Issued = Yes, and confirming room readiness.'
        );
        return;
      }
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
    const otaCreditNgn = isOtaSource ? Math.min(estChargesNgn, otaPaidNgnVal) : 0;
    const estBalanceNgn = Math.max(0, estChargesNgn - otaCreditNgn - hotelPaidNgnVal);
    const computedPayStatus: PaymentStatusLabel = bookingPaymentStatusManual
      ? bookingPaymentStatus
      : estBalanceNgn <= 0 && (estChargesNgn > 0 || otaPaidNgnVal > 0 || hotelPaidNgnVal > 0)
        ? 'Paid'
        : otaPaidNgnVal > 0 || hotelPaidNgnVal > 0
          ? 'Partial'
          : 'Unpaid';

    setBusyId('booking');
    try {
      await createReservationWorkflow({
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
        checkInDate,
        checkOutDate,
        bookedDate: todayIso,
        nights: safeNightsVal,
        adults: Math.max(1, adults),
        children: Math.max(0, childrenCount),
        channel,
        paymentMethod,
        paymentStatus: computedPayStatus,
        depositNgn: hotelPaidNgnVal,
        sourceCurrency: activeCurrency,
        sourceNightlyRate: resolvedSourceNightlyRate,
        sourceTotalAmount: resolvedSourceTotal,
        fxRateToNgn,
        paymentCollectionMode: parsedOtaPaidSource > 0 ? 'ota_prepaid' : 'hotel_collect',
        otaPaidSourceAmount: parsedOtaPaidSource,
        otaPaidNgn: otaPaidNgnVal,
        expectedPayoutNgn: expectedPayoutNgnVal,
        hotelPaidNgn: hotelPaidNgnVal,
        cautionDepositEnabled,
        cautionDepositNgn: cautionFeeNgnVal,
        cautionDepositCollectedNgn: cautionCollectedNgnVal,
        cautionDepositRefunded: cautionDepositEnabled && cautionDepositRefunded,
        immediateCheckIn,
        initialStatus: initialBookingStatus,
        paymentConfirmed: immediateCheckIn ? inlinePayConfirmed : false,
        idVerified: immediateCheckIn ? inlineIdVerified : false,
        keyIssued: immediateCheckIn ? inlineKeyIssued === 'yes' : false,
        actorRole,
      });
      onNotify(
        immediateCheckIn && targetRoom
          ? `Verified & checked in ${trimmedGuest} to ${targetRoom.roomNumber}`
          : `${RESERVATION_STATUS_LABELS[initialBookingStatus]} reservation for ${trimmedGuest} (${assignedLabel})`
      );
      if (immediateCheckIn && targetRoom) {
        onGuestCheckedIn?.({
          guestName: trimmedGuest,
          roomNumber: targetRoom.roomNumber,
        });
      }
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
      setBookingHotelPaidInput(formatPriceInputWithCommas(baseRoomRateNgn));
      setBookingPaymentStatus('Paid');
      setBookingPaymentStatusManual(false);
      setCautionDepositEnabled(false);
      setCautionDepositAmountInput('20,000');
      setCautionDepositCollectedInput('0');
      setCautionDepositRefunded(false);
      setInlineIdNumber('');
      setInlinePayConfirmed(false);
      setInlineIdVerified(false);
      setInlineRoomReady(false);
      setInlineKeyIssued(null);
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
    if (walkInCheckOut <= todayIso) {
      setWalkInError('Check-out date must be after today.');
      return;
    }

    const resOverlap = reservations.find(
      (r) =>
        r.roomId === targetRoom.id &&
        (r.status === 'confirmed' || r.status === 'checked_in') &&
        datesOverlap(todayIso, walkInCheckOut, r.checkInDate, r.checkOutDate)
    );
    if (resOverlap) {
      setWalkInError(
        `${targetRoom.roomNumber} is already booked (${resOverlap.bookingRef} · ${resOverlap.guestName}) until ${resOverlap.checkOutDate}.`
      );
      return;
    }

    const blockOverlap = blockedDates.find(
      (b) =>
        b.roomId === targetRoom.id && datesOverlap(todayIso, walkInCheckOut, b.startDate, b.endDate)
    );
    if (blockOverlap) {
      setWalkInError(
        `${targetRoom.roomNumber} is blocked (${blockOverlap.category}: ${blockOverlap.reason}) during those dates.`
      );
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
    setBusyId('walk_in');
    try {
      await createReservationWorkflow({
        property,
        room: { ...targetRoom, nightlyRateNgn: Math.max(5000, walkInRateNgn) },
        guestName: fullGuestName,
        guestPhone: walkInPhone.trim(),
        guestEmail: walkInEmail.trim(),
        guestAddress: walkInAddress.trim(),
        guestCity: walkInCity.trim(),
        guestNationality: walkInCountry.trim() || 'Nigeria',
        guestIdType: walkInIdType,
        guestIdNumber: walkInIdNumber.trim(),
        checkInDate: todayIso,
        checkOutDate: walkInCheckOut,
        nights: stayNights,
        adults: 1,
        channel: 'Direct Walk-In',
        paymentMethod: walkInPaymentMethod,
        depositNgn: Math.max(0, walkInDepositNgn),
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
      });
      setWalkInFirstName('');
      setWalkInLastName('');
      setWalkInEmail('');
      setWalkInIdNumber('');
      setWalkInAddress('');
      setWalkInPayConfirmed(false);
      setWalkInIdVerified(false);
      setWalkInRoomReady(false);
      setWalkInKeyIssued(null);
      onNavigateSection?.('in_house');
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

    const willOccupyRoom =
      editStatus === 'confirmed' || editStatus === 'pending' || editStatus === 'checked_in';
    if (willOccupyRoom && targetRoom) {
      const resOverlap = reservations.find(
        (r) =>
          r.id !== res.id &&
          r.roomId === targetRoom.id &&
          (r.status === 'confirmed' || r.status === 'pending' || r.status === 'checked_in') &&
          datesOverlap(editCheckInDate, editCheckOutDate, r.checkInDate, r.checkOutDate)
      );
      if (resOverlap) {
        setEditStayError(
          `Dates conflict with ${resOverlap.bookingRef} (${resOverlap.guestName}: ${resOverlap.checkInDate} → ${resOverlap.checkOutDate}).`
        );
        return;
      }
      const blockOverlap = blockedDates.find(
        (b) =>
          b.roomId === targetRoom.id &&
          datesOverlap(editCheckInDate, editCheckOutDate, b.startDate, b.endDate)
      );
      if (blockOverlap) {
        setEditStayError(
          `Dates conflict with blocked hold (${blockOverlap.category}: ${blockOverlap.startDate} → ${blockOverlap.endDate}).`
        );
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
        checkInDate: editCheckInDate,
        checkOutDate: editCheckOutDate,
        nights: updatedNights,
        adults: editAdults,
        children: editChildren,
        channel: editChannel,
        status: editStatus,
        paymentMethod: editPaymentMethodRes,
        paymentStatus: editPaymentStatus,
        sourceCurrency: activeEditCurrency,
        sourceNightlyRate: resolvedEditSourceNightly,
        sourceTotalAmount: resolvedEditSourceTotal,
        fxRateToNgn: parsedEditFx,
        otaPaidSourceAmount: parsedEditOtaSourcePaid,
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
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCheckout = async () => {
    if (!checkoutTarget) return;
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
        actorRole,
      });
      onNotify(
        `Checked out ${checkoutTarget.roomNumber} · Settled ${formatNgn(balanceDue)} & dispatched Housekeeping`
      );
      setCheckoutTarget(null);
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
                  if (!selectedRoomId && bookableRooms[0]) setSelectedRoomId(bookableRooms[0].id);
                  setBookingError(null);
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

      {/* SECTION: DEDICATED WALK-IN CHECK-IN (matches IMG_2075) */}
      {section === 'walk_in' && (
        <form
          onSubmit={handleWalkInSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          {walkInError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {walkInError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">First Name *</label>
              <input
                required
                type="text"
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
                value={walkInLastName}
                onChange={(e) => setWalkInLastName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Phone *</label>
              <input
                required
                type="text"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={walkInEmail}
                onChange={(e) => setWalkInEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">ID Type</label>
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
              <label className="block font-semibold text-slate-700 mb-1.5">ID Number</label>
              <input
                type="text"
                value={walkInIdNumber}
                onChange={(e) => setWalkInIdNumber(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Address</label>
              <input
                type="text"
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
              <label className="block font-semibold text-slate-700 mb-1.5">Country</label>
              <CountrySelect
                value={walkInCountry}
                onChange={setWalkInCountry}
                placeholder="Select country..."
              />
            </div>

            <div>
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
                    matching.find((r) => r.occupancyStatus === 'vacant') || matching[0];
                  if (pick) {
                    setWalkInRoomId(pick.id);
                    setWalkInRateNgn(pick.nightlyRateNgn);
                    setWalkInDepositNgn(pick.nightlyRateNgn * diffNights(todayIso, walkInCheckOut));
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

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Room *</label>
              <select
                value={walkInRoomId}
                onChange={(e) => {
                  const rm = rooms.find((r) => r.id === e.target.value);
                  setWalkInRoomId(e.target.value);
                  if (rm) {
                    setWalkInRateNgn(rm.nightlyRateNgn);
                    setWalkInDepositNgn(rm.nightlyRateNgn * diffNights(todayIso, walkInCheckOut));
                  }
                }}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
              >
                {walkInEligibleRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber} · {r.name} ({r.occupancyStatus === 'vacant' ? 'Available' : r.occupancyStatus})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Check-out *</label>
              <input
                required
                type="date"
                min={addDaysIso(todayIso, 1)}
                value={walkInCheckOut}
                onChange={(e) => {
                  const raw = e.target.value;
                  const nextOut = !raw || raw <= todayIso ? addDaysIso(todayIso, 1) : raw;
                  setWalkInCheckOut(nextOut);
                  setWalkInDepositNgn(walkInRateNgn * diffNights(todayIso, nextOut));
                }}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Rate/Night (₦)</label>
              <input
                type="number"
                min={5000}
                step={500}
                value={walkInRateNgn}
                onChange={(e) => {
                  const nextRate = Number(e.target.value);
                  setWalkInRateNgn(nextRate);
                  setWalkInDepositNgn(nextRate * diffNights(todayIso, walkInCheckOut));
                }}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Payment</label>
              <select
                value={walkInPaymentMethod}
                onChange={(e) =>
                  setWalkInPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                }
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 bg-white focus:outline-none focus:border-emerald-600"
              >
                <option value="Cash NGN">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card POS">Card POS</option>
                <option value="Corporate Invoice">Corporate Invoice</option>
                <option value="Online Gateway">Online Gateway</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Deposit Paid Today (₦ · {diffNights(todayIso, walkInCheckOut)} night
                {diffNights(todayIso, walkInCheckOut) > 1 ? 's' : ''})
              </label>
              <input
                type="number"
                min={0}
                step={500}
                value={walkInDepositNgn}
                onChange={(e) => setWalkInDepositNgn(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 font-mono-tabular focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Mandatory Check-In Verification Checklist + Explicit Key Issue */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Mandatory Check-In Process</span>
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
                      ? 'bg-emerald-600 border-emerald-600 text-white'
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

          <button
            type="submit"
            disabled={
              busyId === 'walk_in' ||
              !walkInPayConfirmed ||
              !walkInIdVerified ||
              walkInIdNumber.trim().length < 3 ||
              walkInKeyIssued !== 'yes' ||
              !walkInRoomReady
            }
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
          </button>
        </form>
      )}

      {/* SECTION: ROOMS */}
      {section === 'rooms' && (() => {
        const allAmenitiesList = Array.from(
          new Set(
            sortedRooms.flatMap((r) => (r.amenities || []).map((a) => a.trim()).filter(Boolean))
          )
        ).sort((a, b) => a.localeCompare(b));

        const normalizedRoomQuery = roomSearchQuery.trim().toLowerCase();
        const filteredRoomsList = sortedRooms.filter((r) => {
          if (roomSectionFilter !== 'ALL' && getRoomSection(r) !== roomSectionFilter) return false;
          if (roomStatusFilter !== 'ALL' && r.occupancyStatus !== roomStatusFilter) return false;
          if (
            roomAmenityFilter !== 'ALL' &&
            !(r.amenities || []).some((a) => a.toLowerCase() === roomAmenityFilter.toLowerCase())
          ) {
            return false;
          }
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
          roomStatusFilter !== 'ALL' ||
          roomAmenityFilter !== 'ALL';

        return (
          <div className="space-y-6">
            <CurrencyConverterWidget
              property={property}
              rooms={rooms}
              canEditRate={canManageRooms}
              actorRole={actorRole}
              onNotify={onNotify}
            />

            {/* Rooms & Amenities Easy Search / Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs items-end">
                <div className="md:col-span-5">
                  <label className="block font-medium text-slate-600 mb-1">
                    Search Rooms or Amenities
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={roomSearchQuery}
                      onChange={(e) => setRoomSearchQuery(e.target.value)}
                      placeholder="Search RM-1, Kitchenette, Balcony, King Bed..."
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
                        setRoomAmenityFilter('ALL');
                      }}
                      className="text-xs font-semibold text-[#28488a] hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {allAmenitiesList.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-semibold text-slate-500 mr-1">Filter by Amenity:</span>
                  <button
                    type="button"
                    onClick={() => setRoomAmenityFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md border font-medium transition-colors cursor-pointer ${
                      roomAmenityFilter === 'ALL'
                        ? 'bg-[#061539] text-white border-[#061539]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Amenities
                  </button>
                  {allAmenitiesList.slice(0, 10).map((amenity) => {
                    const AmenityIcon = getAmenityIcon(amenity);
                    const isSelected = roomAmenityFilter.toLowerCase() === amenity.toLowerCase();
                    return (
                      <button
                        key={amenity}
                        type="button"
                        onClick={() => setRoomAmenityFilter(isSelected ? 'ALL' : amenity)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#061539] text-white border-[#061539]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-200'
                        }`}
                      >
                        <AmenityIcon className="w-3 h-3 shrink-0" />
                        <span>{amenity}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {filteredRoomsList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                <p className="font-display text-sm font-bold text-slate-900">
                  No rooms match your active filters
                </p>
                <p className="text-xs text-slate-500">
                  Clear your search or amenity filter to view all rooms and photo galleries.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRoomSearchQuery('');
                    setRoomSectionFilter('ALL');
                    setRoomStatusFilter('ALL');
                    setRoomAmenityFilter('ALL');
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
                                          : 'text-emerald-700'
                                      }
                                    >
                                      {room.housekeepingStatus}
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
                                  <button
                                    type="button"
                                    disabled={busyId === room.id}
                                    onClick={async () => {
                                      const nextHk =
                                        room.housekeepingStatus === 'dirty' ? 'clean' : 'dirty';
                                      await updateRoomStatus({
                                        property,
                                        room,
                                        updates: {
                                          housekeepingStatus: nextHk,
                                        },
                                        actorRole,
                                      });
                                      onNotify(`${room.roomNumber} marked ${nextHk}`);
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-slate-700 cursor-pointer"
                                  >
                                    {room.housekeepingStatus === 'dirty'
                                      ? 'Mark Clean'
                                      : 'Mark Dirty'}
                                  </button>
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

              const canCheckIn = res.status === 'confirmed' || res.status === 'pending';
              const canCancel = res.status !== 'cancelled' && res.status !== 'checked_out' && res.status !== 'no_show';

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
                      {canCancel && (
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
          {/* Colorful Operational Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-gradient-to-br from-white via-white to-blue-50/70 border border-slate-200 border-t-4 border-t-[#1c46be] rounded-xl px-4 py-3.5 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#061539]/75">
                Total Reservations
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-[#061539] mt-1 leading-none">
                {reservationMetrics.total}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Across all booking channels
              </p>
            </div>
            <div className="bg-gradient-to-br from-white via-white to-amber-50/70 border border-slate-200 border-t-4 border-t-amber-500 rounded-xl px-4 py-3.5 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">
                Confirmed &amp; Pending
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-amber-950 mt-1 leading-none">
                {reservationMetrics.confirmed + reservationMetrics.pending}
              </p>
              <p className="text-[11px] text-amber-800/80 mt-1.5 font-mono-tabular">
                {reservationMetrics.confirmed} confirmed · {reservationMetrics.pending} pending
              </p>
            </div>
            <div className="bg-gradient-to-br from-white via-white to-emerald-50/70 border border-slate-200 border-t-4 border-t-emerald-600 rounded-xl px-4 py-3.5 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/80">
                Checked-in Guests
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-emerald-700 mt-1 leading-none">
                {reservationMetrics.checked_in}
              </p>
              <p className="text-[11px] text-emerald-700/85 mt-1.5">
                Active in-house folios
              </p>
            </div>
            <div className="bg-gradient-to-br from-white via-white to-indigo-50/70 border border-slate-200 border-t-4 border-t-indigo-600 rounded-xl px-4 py-3.5 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-900/80">
                Payments &amp; OTA Prepaid
              </p>
              <p className="font-mono-tabular text-2xl font-extrabold text-[#061539] mt-1 leading-none">
                {formatNgn(reservationMetrics.totalPaid)}
              </p>
              <p className="text-[11px] text-indigo-700 mt-1.5 font-mono-tabular font-semibold">
                {reservationMetrics.totalOtaUsd > 0
                  ? `Includes ${formatUsd(reservationMetrics.totalOtaUsd)} USD via OTA`
                  : `Direct: ${formatNgn(reservationMetrics.totalHotelPaid)}`}
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
                      amountPaid,
                      balance,
                      balanceUsd,
                      paymentStatus,
                      sourceCurrency,
                      sourceTotalAmount,
                      otaPaidSourceAmount,
                      cautionDepositEnabled: rowCautionEnabled,
                      cautionDepositCollectedNgn: rowCautionCollected,
                      cautionDepositRefunded: rowCautionRefunded,
                    } = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
                    const isOtaRow = isOtaBookingChannel(res.channel);
                    const bookedDate = getReservationBookedDate(res);
                    const adultsCount = res.adults || 1;
                    const kidsCount = res.children || 0;
                    const roomDisplay = getReservationRoomDisplay(res, rooms);
                    const isArrivingToday =
                      (res.status === 'confirmed' || res.status === 'pending') &&
                      res.checkInDate <= todayIso;
                    const isDueOutToday =
                      res.status === 'checked_in' && res.checkOutDate <= todayIso;
                    const canCheckIn = res.status === 'confirmed' || res.status === 'pending';
                    const canCancel =
                      res.status !== 'cancelled' &&
                      res.status !== 'checked_out' &&
                      res.status !== 'no_show';

                    const paymentStatusColor =
                      paymentStatus === 'Paid'
                        ? 'text-emerald-700'
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
                          {formatBookingSourceLabel(res.channel)}
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

                        <td className="py-3 px-3.5 text-right font-mono-tabular text-emerald-700 whitespace-nowrap">
                          {isOtaRow ? (
                            <>
                              <span className="block font-semibold text-blue-700">
                                OTA: {formatChannelCurrency(otaPaidSourceAmount, sourceCurrency)}{' '}
                                {sourceCurrency}
                              </span>
                              <span className="block text-[10px] text-slate-600">
                                ≈ {formatNgn(otaPaidAmount)} · Direct: {formatNgn(hotelPaidAmount)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="block font-semibold">{formatNgn(amountPaid)}</span>
                              <span className="block text-[10px] text-slate-500">
                                Direct: {formatNgn(hotelPaidAmount)}
                              </span>
                            </>
                          )}
                        </td>

                        <td
                          className={`py-3 px-3.5 text-right font-mono-tabular font-bold whitespace-nowrap ${
                            balance > 0 ? 'text-rose-700' : 'text-slate-600'
                          }`}
                        >
                          <span className="block">{formatNgn(balance)}</span>
                          <span className="block text-[10px] font-normal text-slate-500">
                            {balance > 0 ? `≈ ${formatUsd(balanceUsd)} USD` : '₦0 bal due'}
                          </span>
                        </td>

                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className={`font-semibold ${paymentStatusColor}`}>
                            {paymentStatus}
                          </span>
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
                            {canCancel && (
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
                  <label className="block font-medium text-slate-700 mb-1">Room Display Title</label>
                  <input
                    type="text"
                    required
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
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

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Housekeeping Readiness
                  </label>
                  <select
                    value={draftHousekeeping}
                    onChange={(e) =>
                      setDraftHousekeeping(e.target.value as RoomRecord['housekeepingStatus'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="clean">Clean</option>
                    <option value="inspected">Inspected</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="dirty">Dirty</option>
                  </select>
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
                      type="text"
                      value={draftImageUrl.startsWith('data:') ? '[Uploaded Device Photo]' : draftImageUrl}
                      onChange={(e) => {
                        const nextUrl = e.target.value;
                        setDraftImageUrl(nextUrl);
                        if (nextUrl.trim() && !nextUrl.startsWith('[Uploaded')) {
                          setDraftGalleryImages((prev) =>
                            Array.from(new Set([nextUrl.trim(), ...prev])).slice(0, 6)
                          );
                        }
                      }}
                      placeholder="Or paste custom cover image URL (/assets/... or https://...)"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-mono-tabular"
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
                  <label className="block font-medium text-slate-700 mb-1">Room Display Title</label>
                  <input
                    type="text"
                    required
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Garden View Studio 9"
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
                      type="text"
                      value={
                        newRoomImageUrl.startsWith('data:')
                          ? '[Uploaded Device Photo]'
                          : newRoomImageUrl
                      }
                      onChange={(e) => setNewRoomImageUrl(e.target.value)}
                      placeholder="Or paste custom cover photo URL..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-mono-tabular"
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
                        {folioIsOta
                          ? `Platform Payment (${activeFolioReservation.channel} · ${folioPaySummary.sourceCurrency})`
                          : 'Platform Payment (OTA)'}
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-blue-800 mt-1">
                        {folioIsOta
                          ? `${formatChannelCurrency(
                              folioPaySummary.otaPaidSourceAmount,
                              folioPaySummary.sourceCurrency
                            )} ${folioPaySummary.sourceCurrency}`
                          : '₦0'}
                      </p>
                      <p className="text-[11px] text-blue-700 mt-0.5 font-mono-tabular">
                        {folioIsOta
                          ? `≈ ${formatNgn(folioPaySummary.otaPaidAmount)} (@ ₦${folioPaySummary.fxRateToNgn.toLocaleString()})`
                          : 'Direct booking (no OTA payout)'}
                      </p>
                    </div>

                    <div className="border border-slate-200 bg-slate-50 rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-slate-700">
                        {folioIsOta ? 'Expected Property Payout (₦)' : 'Room Charges Total (₦)'}
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-slate-900 mt-1">
                        {formatNgn(
                          folioIsOta
                            ? folioPaySummary.expectedPayoutNgn
                            : activeFolioReservation.roomChargesNgn
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono-tabular">
                        ≈ {formatUsd(folioIsOta ? folioPaySummary.expectedPayoutUsd : folioPaySummary.totalAmountUsd)} USD · {activeFolioReservation.nights} night(s)
                      </p>
                    </div>

                    <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-emerald-900">
                        Direct Payment to {property.name.split(' ')[0]} (₦)
                      </p>
                      <p className="font-mono-tabular text-base font-bold text-emerald-800 mt-1">
                        {formatNgn(folioPaySummary.hotelPaidAmount)}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5 font-mono-tabular">
                        ≈ {formatUsd(folioPaySummary.hotelPaidUsd)} USD · {activeFolioReservation.paymentMethod}
                      </p>
                    </div>

                    <div className="border border-slate-200 bg-white rounded-xl p-3.5">
                      <p className="text-[11px] font-semibold text-slate-700">
                        Outstanding Hotel Balance
                      </p>
                      <p
                        className={`font-mono-tabular text-base font-bold mt-1 ${
                          folioPaySummary.balance > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatNgn(folioPaySummary.balance)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono-tabular">
                        ≈ {formatUsd(folioPaySummary.balanceUsd)} USD · <strong>{folioPaySummary.paymentStatus}</strong>
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
                      <div className="flex items-center gap-3">
                        {activeFolioReservation.status !== 'checked_out' &&
                          activeFolioReservation.status !== 'cancelled' &&
                          activeFolioReservation.status !== 'no_show' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStayDetails((v) => !v);
                                setEditStayError(null);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-md text-[11px] font-semibold text-slate-700 cursor-pointer"
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Check-In Date
                                </label>
                                <input
                                  type="date"
                                  value={editCheckInDate}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditCheckInDate(val);
                                    if (val && editCheckOutDate <= val) {
                                      setEditCheckOutDate(addDaysIso(val, 1));
                                    }
                                    setEditStayError(null);
                                  }}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Check-Out Date
                                </label>
                                <input
                                  type="date"
                                  min={editCheckInDate ? addDaysIso(editCheckInDate, 1) : undefined}
                                  value={editCheckOutDate}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const safeOut =
                                      editCheckInDate && raw && raw <= editCheckInDate
                                        ? addDaysIso(editCheckInDate, 1)
                                        : raw;
                                    setEditCheckOutDate(safeOut);
                                    setEditStayError(null);
                                  }}
                                  className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Room Type
                                </label>
                                <select
                                  value={editRequestedRoomType}
                                  onChange={(e) => {
                                    const rt = e.target.value;
                                    setEditRequestedRoomType(rt);
                                    const matchedRoom = sortedRooms.find((r) => r.roomType === rt);
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
                                  {sortedRooms.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)})
                                    </option>
                                  ))}
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
                                  <option value="checked_in">Checked-in</option>
                                  <option value="checked_out">Checked-out</option>
                                  <option value="cancelled">Cancelled</option>
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
                                  Country
                                </label>
                                <CountrySelect
                                  value={editGuestCountryRes}
                                  onChange={setEditGuestCountryRes}
                                  placeholder="Search country..."
                                />
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Payments & Settlement */}
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-display text-xs font-bold text-emerald-950 uppercase tracking-wider">
                                3. Payments &amp; Settlement
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
                                  <option value="OTA Platform Payout">OTA Platform Payout</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Payment Status
                                </label>
                                <select
                                  value={editPaymentStatus}
                                  onChange={(e) =>
                                    setEditPaymentStatus(e.target.value as PaymentStatusLabel)
                                  }
                                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-semibold"
                                >
                                  <option value="Paid">Paid</option>
                                  <option value="Partial">Partial</option>
                                  <option value="Unpaid">Unpaid</option>
                                </select>
                              </div>

                              {editIsOta && (
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
                                      Platform Payment ({activeEditCur})
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
                                      Expected Property Payout (₦)
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
                                  onNotify(
                                    `Posted ${formatNgn(folioPayAmount)} direct payment to ${activeFolioReservation.bookingRef}`
                                  );
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
                                setBusyId(activeFolioReservation.id);
                                try {
                                  await extendReservationStay({
                                    property,
                                    reservation: activeFolioReservation,
                                    extraNights: 1,
                                    actorRole,
                                  });
                                  onNotify(
                                    `Extended ${activeFolioReservation.bookingRef} by +1 night`
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
                        activeFolioReservation.status === 'pending') && (
                        <>
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
                        </>
                      )}

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
              const otaCreditTowardCharges = isOta
                ? Math.min(estTotalCharges, otaPaidNgnEst)
                : 0;
              const estBalanceDue = Math.max(
                0,
                estTotalCharges - otaCreditTowardCharges - directPaidEst
              );
              const estBalanceUsd = convertNgnToUsd(estBalanceDue, internalUsdRate);
              const autoPayStatus: PaymentStatusLabel =
                estBalanceDue <= 0 &&
                (estTotalCharges > 0 || otaPaidNgnEst > 0 || directPaidEst > 0)
                  ? 'Paid'
                  : otaPaidNgnEst > 0 || directPaidEst > 0
                    ? 'Partial'
                    : 'Unpaid';
              const estPayStatus: PaymentStatusLabel = bookingPaymentStatusManual
                ? bookingPaymentStatus
                : autoPayStatus;
              const roomsMatchingType = sortedRooms.filter(
                (r) => !newRequestedRoomType || r.roomType === newRequestedRoomType
              );
              const propertyShortName = property.name.split(' ')[0] || 'Property';

              return (
                <form
                  onSubmit={handleCreateBooking}
                  className="bg-white border border-slate-200 border-t-4 border-t-[#1c46be] rounded-xl p-6 space-y-6 shadow-xs"
                >
                  {/* Clean Header — No subtitle beneath title */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowBookingForm(false)}
                        className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                      <h2 className="font-display text-lg font-bold text-[#061539]">
                        New Reservation
                      </h2>
                    </div>
                    <span className="text-xs font-mono-tabular text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                      Booked: {todayIso}
                    </span>
                  </div>

                  {bookingError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {bookingError}
                    </div>
                  )}

                  {/* SECTION 1: STAYS (Check-in, Check-out & Room Type at Top) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                        1. Stay Details
                      </h3>
                      <span className="font-mono-tabular text-[11px] font-semibold text-slate-600">
                        {safeNights} Night{safeNights !== 1 ? 's' : ''} · {adults} Adult{adults !== 1 ? 's' : ''}
                        {childrenCount > 0 ? `, ${childrenCount} Child${childrenCount !== 1 ? 'ren' : ''}` : ''}
                      </span>
                    </div>

                    {/* Row 1: Check-In, Check-Out, Room Type, Room Assignment */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Check-In Date *
                        </label>
                        <input
                          required
                          type="date"
                          value={checkInDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            setCheckInDate(val);
                            let nextNights = nights;
                            if (checkOutDate <= val) {
                              const nextOut = addDaysIso(val, 1);
                              setCheckOutDate(nextOut);
                              nextNights = 1;
                              setNights(1);
                            } else {
                              nextNights = diffNights(val, checkOutDate);
                              setNights(nextNights);
                            }
                            const nextStayNgn =
                              activeCur === 'NGN'
                                ? Math.round(activeSourceNightlyRate * nextNights)
                                : Math.round(activeSourceNightlyRate * nextNights * fxRate);
                            if (!bookingExpectedPayoutManual) {
                              setBookingExpectedPayoutInput(formatPriceInputWithCommas(nextStayNgn));
                            }
                            if (!isOta && estPayStatus === 'Paid') {
                              setBookingHotelPaidInput(formatPriceInputWithCommas(nextStayNgn));
                            }
                            setBookingError(null);
                          }}
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Check-Out Date *
                        </label>
                        <input
                          required
                          type="date"
                          min={addDaysIso(checkInDate, 1)}
                          value={checkOutDate}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (!raw) return;
                            const safeOut = raw <= checkInDate ? addDaysIso(checkInDate, 1) : raw;
                            setCheckOutDate(safeOut);
                            const nextNights = diffNights(checkInDate, safeOut);
                            setNights(nextNights);
                            const nextStayNgn =
                              activeCur === 'NGN'
                                ? Math.round(activeSourceNightlyRate * nextNights)
                                : Math.round(activeSourceNightlyRate * nextNights * fxRate);
                            if (!bookingExpectedPayoutManual) {
                              setBookingExpectedPayoutInput(formatPriceInputWithCommas(nextStayNgn));
                            }
                            if (!isOta && estPayStatus === 'Paid') {
                              setBookingHotelPaidInput(formatPriceInputWithCommas(nextStayNgn));
                            }
                            setBookingError(null);
                          }}
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Room Type *
                        </label>
                        <select
                          value={newRequestedRoomType}
                          onChange={(e) => {
                            const rt = e.target.value;
                            setNewRequestedRoomType(rt);
                            const matching = sortedRooms.filter(
                              (r) => r.roomType === rt && r.occupancyStatus !== 'out_of_order'
                            );
                            const preferred =
                              matching.find((r) => r.occupancyStatus === 'vacant') || matching[0];
                            if (preferred) {
                              setSelectedRoomId(preferred.id);
                              const nextTotal = preferred.nightlyRateNgn * Math.max(1, nights);
                              setBookingNightlyRateInput(
                                activeCur === 'NGN'
                                  ? formatPriceInputWithCommas(preferred.nightlyRateNgn)
                                  : String(
                                      Number((preferred.nightlyRateNgn / Math.max(1, fxRate)).toFixed(2))
                                    )
                              );
                              if (!bookingExpectedPayoutManual) {
                                setBookingExpectedPayoutInput(formatPriceInputWithCommas(nextTotal));
                              }
                              if (!isOta && estPayStatus === 'Paid') {
                                setBookingHotelPaidInput(formatPriceInputWithCommas(nextTotal));
                              }
                            } else {
                              setSelectedRoomId('');
                            }
                            setBookingError(null);
                          }}
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-medium"
                        >
                          {uniqueRoomTypes.map((rt) => {
                            const sample = sortedRooms.find((r) => r.roomType === rt);
                            return (
                              <option key={rt} value={rt}>
                                {rt} {sample ? `· ${formatNgn(sample.nightlyRateNgn)}/nt` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
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
                                setBookingExpectedPayoutInput(formatPriceInputWithCommas(nextTotal));
                              }
                              if (!isOta && estPayStatus === 'Paid') {
                                setBookingHotelPaidInput(formatPriceInputWithCommas(nextTotal));
                              }
                            } else {
                              setImmediateCheckIn(false);
                            }
                          }}
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                        >
                          <option value="">Unassigned — Assign later</option>
                          {(roomsMatchingType.length > 0 ? roomsMatchingType : sortedRooms).map((r) => (
                            <option
                              key={r.id}
                              value={r.id}
                              disabled={r.occupancyStatus === 'out_of_order'}
                            >
                              {r.roomNumber} · {r.name} ({r.occupancyStatus})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Booking Source, Nights, Adults/Children, Reservation Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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
                              setBookingCurrency('NGN');
                              setBookingFxRateInput('1');
                              setBookingNightlyRateInput(formatPriceInputWithCommas(baseRateNgn));
                              setBookingOtaPaidSourceInput('');
                              setBookingExpectedPayoutManual(false);
                              setBookingExpectedPayoutInput(
                                formatPriceInputWithCommas(defaultRoomTotal)
                              );
                              setBookingHotelPaidInput(formatPriceInputWithCommas(defaultRoomTotal));
                              setPaymentMethod('Bank Transfer');
                            } else {
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
                          Nights
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={nights}
                          onChange={(e) => {
                            const nextN = Math.max(1, Number(e.target.value));
                            setNights(nextN);
                            setCheckOutDate(addDaysIso(checkInDate, nextN));
                            const nextStayNgn =
                              activeCur === 'NGN'
                                ? Math.round(activeSourceNightlyRate * nextN)
                                : Math.round(activeSourceNightlyRate * nextN * fxRate);
                            if (!bookingExpectedPayoutManual) {
                              setBookingExpectedPayoutInput(formatPriceInputWithCommas(nextStayNgn));
                            }
                            if (!isOta && estPayStatus === 'Paid') {
                              setBookingHotelPaidInput(formatPriceInputWithCommas(nextStayNgn));
                            }
                          }}
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular"
                        />
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

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Reservation Status
                        </label>
                        <select
                          value={immediateCheckIn ? 'checked_in' : initialBookingStatus}
                          disabled={immediateCheckIn}
                          onChange={(e) =>
                            setInitialBookingStatus(e.target.value as 'confirmed' | 'pending')
                          }
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs disabled:bg-slate-100"
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="pending">Pending</option>
                          {immediateCheckIn && <option value="checked_in">Checked-in</option>}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: GUEST INFORMATION (Essential Fields + Searchable Country Dropdown) */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 text-xs">
                    <h3 className="font-display text-xs font-bold text-[#061539] uppercase tracking-wider">
                      2. Guest Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          First Name *
                        </label>
                        <input
                          required
                          type="text"
                          value={guestFirstName}
                          onChange={(e) => setGuestFirstName(e.target.value)}
                          placeholder="First name"
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Last Name *
                        </label>
                        <input
                          required
                          type="text"
                          value={guestLastName}
                          onChange={(e) => setGuestLastName(e.target.value)}
                          placeholder="Last name"
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Phone Number *
                        </label>
                        <input
                          required
                          type="text"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
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
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
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
                          value={guestAddress}
                          onChange={(e) => setGuestAddress(e.target.value)}
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
                          value={guestCity}
                          onChange={(e) => setGuestCity(e.target.value)}
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
                          value={guestState}
                          onChange={(e) => setGuestState(e.target.value)}
                          placeholder="State"
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Country
                        </label>
                        <CountrySelect
                          value={guestCountry}
                          onChange={setGuestCountry}
                          placeholder="Search country..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 3: PAYMENTS (Separated Platform vs Direct vs Outstanding Hotel Balance) */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-xs font-bold text-emerald-950 uppercase tracking-wider">
                        3. Payments &amp; Settlement
                      </h3>
                      <span className="text-[11px] font-mono-tabular font-semibold text-emerald-800">
                        Internal FX: 1 USD = ₦{internalUsdRate.toLocaleString()}
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
                            handleCommaPriceChange(
                              e,
                              bookingNightlyRateInput,
                              (nextVal) => {
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
                              }
                            );
                          }}
                          placeholder={activeCur === 'NGN' ? '65,500' : '120.00'}
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Stay Total ({safeNights}n · USD &amp; ₦)
                        </label>
                        <div className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 flex items-center justify-between text-xs font-mono-tabular font-bold text-slate-900">
                          <span>
                            {formatChannelCurrency(activeSourceStayTotal, activeCur)}
                          </span>
                          <span className="text-[10px] font-semibold text-blue-700">
                            {activeCur === 'USD'
                              ? `≈ ${formatNgn(activeStayNgnEquivalent)}`
                              : `≈ ${formatUsd(activeStayUsdEquivalent)} USD`}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Payment Method
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) =>
                            setPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                          }
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                        >
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Card POS">Card POS</option>
                          <option value="Cash NGN">Cash NGN</option>
                          <option value="Online Gateway">Online Gateway</option>
                          <option value="Corporate Invoice">Corporate Invoice</option>
                          <option value="OTA Platform Payout">OTA Platform Payout</option>
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
                            if (nextStatus === 'Unpaid') {
                              setBookingHotelPaidInput('0');
                              if (isOta) setBookingOtaPaidSourceInput('0');
                            } else if (nextStatus === 'Paid' && !isOta) {
                              setBookingHotelPaidInput(formatPriceInputWithCommas(estTotalCharges));
                            }
                          }}
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-semibold"
                        >
                          <option value="Paid">Paid</option>
                          <option value="Partial">Partial</option>
                          <option value="Unpaid">Unpaid</option>
                        </select>
                      </div>

                      {isOta && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Platform Currency &amp; FX (₦)
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
                                          Number((baseRateNgn / Math.max(1, nextFx)).toFixed(2))
                                        )
                                  );
                                  if (!bookingExpectedPayoutManual) {
                                    const srcAmt =
                                      parseFormattedPriceInput(bookingOtaPaidSourceInput) ?? 0;
                                    if (srcAmt > 0) {
                                      setBookingExpectedPayoutInput(
                                        formatPriceInputWithCommas(Math.round(srcAmt * nextFx))
                                      );
                                    }
                                  }
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
                              Platform Payment — {channel} ({activeCur})
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
                                          formatPriceInputWithCommas(Math.round(parsedSrc * fxRate))
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
                              Expected Property Payout (₦)
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

                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                          Direct Payment Received by {propertyShortName} (₦)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={bookingHotelPaidInput}
                          onChange={(e) => {
                            setBookingPaymentStatusManual(false);
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
                    </div>

                    {/* Separated Live Payment Summary Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2.5 border-t border-emerald-200/70">
                      <div className="bg-white border border-blue-200 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-800">
                          Platform Payment ({isOta ? channel : 'OTA'})
                        </p>
                        <p className="font-mono-tabular text-sm font-bold text-blue-800 mt-0.5">
                          {isOta
                            ? `${formatChannelCurrency(otaPaidSrc, activeCur)} ${activeCur}`
                            : '₦0'}
                        </p>
                        <p className="font-mono-tabular text-[10px] text-slate-500">
                          {isOta ? `≈ ${formatNgn(otaPaidNgnEst)}` : 'Direct booking'}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {isOta ? 'Expected Property Payout' : 'Stay Room Total'}
                        </p>
                        <p className="font-mono-tabular text-sm font-bold text-slate-900 mt-0.5">
                          {formatNgn(expectedPayoutEst)}
                        </p>
                        <p className="font-mono-tabular text-[10px] text-slate-500">
                          ≈ {formatUsd(convertNgnToUsd(expectedPayoutEst, internalUsdRate))} USD
                        </p>
                      </div>
                      <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                          Direct to {propertyShortName}
                        </p>
                        <p className="font-mono-tabular text-sm font-bold text-emerald-700 mt-0.5">
                          {formatNgn(directPaidEst)}
                        </p>
                        <p className="font-mono-tabular text-[10px] text-slate-500">
                          {paymentMethod}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Outstanding Hotel Balance
                        </p>
                        <p
                          className={`font-mono-tabular text-sm font-bold mt-0.5 ${
                            estBalanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatNgn(estBalanceDue)}{' '}
                          <span className="text-[11px] font-semibold">({estPayStatus})</span>
                        </p>
                        <p className="font-mono-tabular text-[10px] text-slate-500">
                          ≈ {formatUsd(estBalanceUsd)} USD
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 4: OPTIONAL REFUNDABLE CAUTION / DEPOSIT FEE */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3 text-xs">
                    <label className="inline-flex items-center gap-2 font-bold text-amber-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cautionDepositEnabled}
                        onChange={(e) => setCautionDepositEnabled(e.target.checked)}
                        className="rounded border-amber-400 text-emerald-600"
                      />
                      <span>4. Optional Refundable Caution / Deposit Fee</span>
                    </label>

                    {cautionDepositEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Caution / Deposit Fee Amount (₦)
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
                            value={cautionDepositCollectedInput}
                            onChange={(e) =>
                              handleCommaPriceChange(
                                e,
                                cautionDepositCollectedInput,
                                setCautionDepositCollectedInput
                              )
                            }
                            placeholder="0"
                            className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 text-xs font-mono-tabular font-semibold"
                          />
                        </div>
                        <label className="h-10 inline-flex items-center gap-2 px-3 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-950 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cautionDepositRefunded}
                            onChange={(e) => setCautionDepositRefunded(e.target.checked)}
                            className="rounded border-amber-400 text-emerald-600"
                          />
                          <span>Confirm Refunded to Guest</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={immediateCheckIn}
                        onChange={(e) => setImmediateCheckIn(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      <span>Immediate Front Desk Check-In (requires verification steps)</span>
                    </label>

                    <button
                      type="submit"
                      disabled={
                        busyId === 'booking' ||
                        (immediateCheckIn &&
                          (!inlinePayConfirmed ||
                            !inlineIdVerified ||
                            inlineIdNumber.trim().length < 3 ||
                            inlineKeyIssued !== 'yes' ||
                            !inlineRoomReady))
                      }
                      className="h-10 px-5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      {busyId === 'booking'
                        ? 'Saving...'
                        : immediateCheckIn
                          ? 'Verify & Check In Guest'
                          : 'Save Reservation'}
                    </button>
                  </div>

                  {immediateCheckIn && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 text-xs">
                      <p className="font-bold text-slate-900">
                        Mandatory Check-In Process (Required for Immediate Check-In)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Guest ID Type
                          </label>
                          <select
                            value={inlineIdType}
                            onChange={(e) => setInlineIdType(e.target.value as GuestRecord['idType'])}
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                          >
                            <option value="NIN">NIN</option>
                            <option value="International Passport">International Passport</option>
                            <option value="Driver License">Driver License</option>
                            <option value="Voter Card">Voter Card</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Guest ID Number *
                          </label>
                          <input
                            type="text"
                            required
                            value={inlineIdNumber}
                            onChange={(e) => setInlineIdNumber(e.target.value)}
                            placeholder="Enter NIN / Passport / License No."
                            className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs font-mono-tabular"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <label className="flex items-center gap-2 text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={inlinePayConfirmed}
                            onChange={(e) => setInlinePayConfirmed(e.target.checked)}
                          />
                          <span>1. Payment Confirmed</span>
                        </label>
                        <label className="flex items-center gap-2 text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={inlineIdVerified}
                            onChange={(e) => setInlineIdVerified(e.target.checked)}
                          />
                          <span>2. Guest ID Verified</span>
                        </label>
                        <label className="flex items-center gap-2 text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={inlineRoomReady}
                            onChange={(e) => setInlineRoomReady(e.target.checked)}
                          />
                          <span>3. Room Inspected Ready</span>
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-2.5">
                        <span className="font-semibold text-slate-800">4. Key Issued? *</span>
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setInlineKeyIssued('yes')}
                            className={`h-8 px-3 rounded font-semibold border cursor-pointer ${
                              inlineKeyIssued === 'yes'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setInlineKeyIssued('no')}
                            className={`h-8 px-3 rounded font-semibold border cursor-pointer ${
                              inlineKeyIssued === 'no'
                                ? 'bg-rose-600 border-rose-600 text-white'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
                            HK: {selectedRoomDetail.housekeepingStatus} · Max{' '}
                            {selectedRoomDetail.maxGuests} guests
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 space-y-5 text-xs">
                      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <p className="font-semibold text-slate-900">Quick Housekeeping Actions</p>
                        <div className="flex flex-wrap gap-2">
                          {(['clean', 'inspected', 'dirty', 'cleaning'] as const).map((hk) => (
                            <button
                              key={hk}
                              type="button"
                              disabled={busyId === selectedRoomDetail.id}
                              onClick={async () => {
                                setBusyId(selectedRoomDetail.id);
                                try {
                                  await updateRoomStatus({
                                    property,
                                    room: selectedRoomDetail,
                                    updates: { housekeepingStatus: hk },
                                    actorRole,
                                  });
                                  onNotify(
                                    `Marked ${selectedRoomDetail.roomNumber} as ${hk}`
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg border font-semibold capitalize cursor-pointer ${
                                selectedRoomDetail.housekeepingStatus === hk
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {hk}
                            </button>
                          ))}
                        </div>
                      </div>

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

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCheckoutTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === checkoutTarget.id}
                onClick={handleConfirmCheckout}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete Check-Out &amp; Post Ledger</span>
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
                        {r.housekeepingStatus}
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

      {checkInTarget && (
        <CheckInProcessModal
          property={property}
          reservation={checkInTarget}
          room={rooms.find((r) => r.id === checkInTarget.roomId)}
          rooms={rooms}
          guest={
            guests.find((g) => g.id === checkInTarget.guestId) ||
            guests.find((g) => g.fullName.toLowerCase() === checkInTarget.guestName.toLowerCase())
          }
          actorRole={actorRole}
          onClose={() => setCheckInTarget(null)}
          onCompleted={(info) => {
            onNotify(`Verified & checked in ${info.guestName} into ${info.roomNumber}`);
            onGuestCheckedIn?.(info);
          }}
        />
      )}
    </div>
  );
};
