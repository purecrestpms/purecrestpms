import React, { useEffect, useRef, useState } from 'react';
import {
  BedDouble,
  CheckCircle2,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserPlus,
  X,
} from 'lucide-react';
import {
  createGuestRecord,
  createReservationWorkflow,
  syncRichgatesOfficialCatalogIfNeeded,
  transitionReservationStatus,
  updateRoomStatus,
} from '../services/pmsService';
import {
  BlockedDateRecord,
  formatNgn,
  getRoomSection,
  GuestRecord,
  NavSectionId,
  PropertyRecord,
  ReservationRecord,
  RICHGATES_GALLERY_ASSETS,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
  StaffRole,
} from '../types/pms';

interface RoomsReservationsViewProps {
  section: Extract<NavSectionId, 'rooms' | 'reservations' | 'front_desk' | 'guests'>;
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  guests: GuestRecord[];
  housekeepingTasksCount?: number;
  activeRole: StaffRole;
  actorRole: string;
  onNotify: (msg: string) => void;
}

const DEFAULT_SUITE_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.onload = () => {
        const maxWidth = 880;
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
        while (result.length > 320000 && quality > 0.35) {
          quality -= 0.12;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        if (result.length > 340000) {
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

export const RoomsReservationsView: React.FC<RoomsReservationsViewProps> = ({
  section,
  property,
  rooms,
  reservations,
  blockedDates,
  guests,
  activeRole,
  actorRole,
  onNotify,
}) => {
  const canManageRooms = activeRole === 'pch_admin' || activeRole === 'property_admin';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Quick inline rate edit
  const [editingRateRoomId, setEditingRateRoomId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState<number>(65500);

  // Full Room Editor Modal (Admin & Super Admin)
  const [editingRoom, setEditingRoom] = useState<RoomRecord | null>(null);
  const [draftRoomNumber, setDraftRoomNumber] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftRoomType, setDraftRoomType] = useState('');
  const [draftSection, setDraftSection] = useState<RoomSection>('Serviced Apartment');
  const [draftRateNgn, setDraftRateNgn] = useState<number>(65500);
  const [draftMaxGuests, setDraftMaxGuests] = useState<number>(2);
  const [draftOccupancy, setDraftOccupancy] =
    useState<RoomRecord['occupancyStatus']>('vacant');
  const [draftHousekeeping, setDraftHousekeeping] =
    useState<RoomRecord['housekeepingStatus']>('clean');
  const [draftImageUrl, setDraftImageUrl] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New Booking Form state
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || '');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+234 803 ');
  const [guestEmail, setGuestEmail] = useState('');
  const [checkInDate, setCheckInDate] = useState('2026-11-16');
  const [checkOutDate, setCheckOutDate] = useState('2026-11-18');
  const [nights, setNights] = useState(2);
  const [adults, setAdults] = useState(1);
  const [channel, setChannel] = useState<ReservationRecord['channel']>('Direct Walk-In');
  const [paymentMethod, setPaymentMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [depositNgn, setDepositNgn] = useState(65500);
  const [immediateCheckIn, setImmediateCheckIn] = useState(true);

  // Guest registration form
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('+234 ');
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [newGuestIdType, setNewGuestIdType] = useState<GuestRecord['idType']>('NIN');
  const [newGuestIdNumber, setNewGuestIdNumber] = useState('');
  const [newGuestVip, setNewGuestVip] = useState<GuestRecord['vipTier']>('Standard');

  // Checkout settlement modal state
  const [checkoutTarget, setCheckoutTarget] = useState<ReservationRecord | null>(null);
  const [settlementMethod, setSettlementMethod] =
    useState<ReservationRecord['paymentMethod']>('Card POS');

  const sortedRooms = sortRoomsByNumber(rooms);
  const bookableRooms = sortedRooms.filter((r) => r.occupancyStatus === 'vacant');

  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) {
      const sorted = sortRoomsByNumber(rooms);
      const first = sorted.find((r) => r.occupancyStatus === 'vacant') || sorted[0];
      if (first) {
        setSelectedRoomId(first.id);
        setDepositNgn(first.nightlyRateNgn);
      }
    }
  }, [rooms, selectedRoomId]);

  const openRoomEditor = (room: RoomRecord) => {
    setEditingRoom(room);
    setDraftRoomNumber(room.roomNumber);
    setDraftName(room.name);
    setDraftRoomType(room.roomType);
    setDraftSection(getRoomSection(room));
    setDraftRateNgn(room.nightlyRateNgn);
    setDraftMaxGuests(room.maxGuests);
    setDraftOccupancy(room.occupancyStatus);
    setDraftHousekeeping(room.housekeepingStatus);
    setDraftImageUrl(room.imageUrl || DEFAULT_SUITE_IMAGE);
    setUploadError(null);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const compressed = await compressImageToDataUrl(file);
      setDraftImageUrl(compressed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to process image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveRoomEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || !canManageRooms) return;
    setBusyId(editingRoom.id);
    try {
      await updateRoomStatus({
        property,
        room: editingRoom,
        updates: {
          roomNumber: draftRoomNumber.trim() || editingRoom.roomNumber,
          name: draftName.trim() || editingRoom.name,
          roomType: draftRoomType.trim() || editingRoom.roomType,
          section: draftSection,
          nightlyRateNgn: Math.max(5000, draftRateNgn),
          maxGuests: Math.max(1, draftMaxGuests),
          occupancyStatus: draftOccupancy,
          housekeepingStatus: draftHousekeeping,
          imageUrl: draftImageUrl.trim() || DEFAULT_SUITE_IMAGE,
        },
        actorRole,
      });
      onNotify(`Saved changes for ${draftRoomNumber.trim() || editingRoom.roomNumber}`);
      setEditingRoom(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError(null);
    const targetRoom =
      rooms.find((r) => r.id === selectedRoomId) || bookableRooms[0] || sortedRooms[0];
    if (!targetRoom || !guestName.trim()) return;

    if (checkOutDate <= checkInDate) {
      setBookingError('Check-out date must be after check-in date.');
      return;
    }

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
      (b) => b.roomId === targetRoom.id && datesOverlap(checkInDate, checkOutDate, b.startDate, b.endDate)
    );
    if (blockOverlap) {
      setBookingError(
        `${targetRoom.roomNumber} is blocked (${blockOverlap.category}: ${blockOverlap.reason}) from ${blockOverlap.startDate} to ${blockOverlap.endDate}.`
      );
      return;
    }

    setBusyId('booking');
    try {
      await createReservationWorkflow({
        property,
        room: targetRoom,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim(),
        checkInDate,
        checkOutDate,
        nights: Math.max(1, nights),
        adults: Math.max(1, adults),
        channel,
        paymentMethod,
        depositNgn: Math.max(0, depositNgn),
        immediateCheckIn,
        actorRole,
      });
      onNotify(
        immediateCheckIn
          ? `Checked in ${guestName} to ${targetRoom.roomNumber}`
          : `Confirmed reservation for ${guestName} in ${targetRoom.roomNumber}`
      );
      setShowBookingForm(false);
      setGuestName('');
      setGuestEmail('');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveRate = async (room: RoomRecord) => {
    if (!canManageRooms) return;
    setBusyId(room.id);
    try {
      await updateRoomStatus({
        property,
        room,
        updates: { nightlyRateNgn: Math.max(5000, rateDraft) },
        actorRole,
      });
      onNotify(`Updated ${room.roomNumber} rate to ${formatNgn(rateDraft)}`);
      setEditingRateRoomId(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckIn = async (res: ReservationRecord) => {
    setBusyId(res.id);
    try {
      await transitionReservationStatus({
        property,
        reservation: res,
        nextStatus: 'checked_in',
        actorRole,
      });
      onNotify(`Checked in ${res.guestName} to ${res.roomNumber}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCheckout = async () => {
    if (!checkoutTarget) return;
    const totalFolio = checkoutTarget.roomChargesNgn + checkoutTarget.posChargesNgn;
    const balanceDue = Math.max(0, totalFolio - checkoutTarget.paidNgn);
    setBusyId(checkoutTarget.id);
    try {
      await transitionReservationStatus({
        property,
        reservation: checkoutTarget,
        nextStatus: 'checked_out',
        settlementAmountNgn: balanceDue,
        paymentMethod: settlementMethod,
        actorRole,
      });
      onNotify(
        `Checked out ${checkoutTarget.roomNumber} · Settled ${formatNgn(balanceDue)} & dispatched Housekeeping`
      );
      setCheckoutTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim()) return;
    setBusyId('guest');
    try {
      await createGuestRecord({
        property,
        guest: {
          fullName: newGuestName.trim(),
          phone: newGuestPhone.trim(),
          email: newGuestEmail.trim(),
          nationality: 'Nigerian',
          idType: newGuestIdType,
          idNumber: newGuestIdNumber.trim(),
          vipTier: newGuestVip,
          totalStays: 0,
          lifetimeSpendNgn: 0,
          notes: '',
        },
        actorRole,
      });
      onNotify(`Guest ${newGuestName} added to directory`);
      setShowGuestForm(false);
      setNewGuestName('');
      setNewGuestIdNumber('');
    } finally {
      setBusyId(null);
    }
  };

  const filteredReservations = reservations.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      r.guestName.toLowerCase().includes(q) ||
      r.bookingRef.toLowerCase().includes(q) ||
      r.roomNumber.toLowerCase().includes(q);
    if (section === 'front_desk') {
      return matchesSearch && (r.status === 'confirmed' || r.status === 'checked_in');
    }
    return matchesSearch;
  });

  const filteredGuests = guests.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      g.fullName.toLowerCase().includes(q) ||
      g.phone.includes(q) ||
      (g.email || '').toLowerCase().includes(q)
    );
  });

  const roomSections: Array<{ key: RoomSection; title: string; desc: string }> = [
    {
      key: 'Serviced Apartment',
      title: 'Serviced Apartment Section',
      desc: 'RM-1 to RM-3 — Studio & One Bedroom Apartments with Kitchenette',
    },
    {
      key: 'Hotel Rooms',
      title: 'Hotel Rooms',
      desc: 'RM-4 to RM-8 — Deluxe Studios, Standard Studios & One Bedroom Suite',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {section === 'rooms'
              ? `${property.name} — Rooms, Rates & Suite Photos`
              : section === 'front_desk'
                ? 'Front Desk Operations & Guest Folios'
                : section === 'guests'
                  ? 'Guest Management & KYC Directory'
                  : 'Reservations & Channel Bookings'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {section === 'rooms'
              ? canManageRooms
                ? 'Property & Super Admin control: update nightly Naira rates, room types, sections, and upload suite photos'
                : 'Suite availability, nightly Naira rates, and housekeeping readiness'
              : 'Live arrivals, walk-in check-ins, room folio settlements, and guest profiles'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {section !== 'rooms' && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guest, ref, RM-1..."
                className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          )}

          {section === 'rooms' && canManageRooms && property.code === 'RG-ENU-01' && (
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync Official Rates</span>
            </button>
          )}

          {section === 'guests' ? (
            <button
              type="button"
              onClick={() => setShowGuestForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Guest</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!selectedRoomId && bookableRooms[0]) setSelectedRoomId(bookableRooms[0].id);
                setBookingError(null);
                setShowBookingForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Booking / Walk-In</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline New Booking / Walk-in Form */}
      {showBookingForm && (
        <form
          onSubmit={handleCreateBooking}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Create Reservation or Immediate Walk-In Check-In
            </h2>
            <button
              type="button"
              onClick={() => setShowBookingForm(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>

          {bookingError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {bookingError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Suite / Room</label>
              <select
                value={selectedRoomId}
                onChange={(e) => {
                  const rm = rooms.find((r) => r.id === e.target.value);
                  setSelectedRoomId(e.target.value);
                  setBookingError(null);
                  if (rm) setDepositNgn(rm.nightlyRateNgn);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                {sortedRooms.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.occupancyStatus === 'out_of_order'}>
                    {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)}) [{r.occupancyStatus}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Guest Full Name</label>
              <input
                required
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Chief Okey Nwankwo"
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                required
                type="text"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Booking Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ReservationRecord['channel'])}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="Direct Walk-In">Direct Walk-In</option>
                <option value="Direct Web">Direct Web</option>
                <option value="Booking.com">Booking.com</option>
                <option value="Airbnb">Airbnb</option>
                <option value="Hotels.ng">Hotels.ng</option>
                <option value="Expedia">Expedia</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Check-In Date</label>
              <input
                type="date"
                value={checkInDate}
                onChange={(e) => {
                  setCheckInDate(e.target.value);
                  setBookingError(null);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Check-Out Date</label>
              <input
                type="date"
                value={checkOutDate}
                onChange={(e) => {
                  setCheckOutDate(e.target.value);
                  setBookingError(null);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Nights / Adults</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  value={nights}
                  onChange={(e) => setNights(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  type="number"
                  min={1}
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Deposit Received (₦) &amp; Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={depositNgn}
                  onChange={(e) => setDepositNgn(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                />
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-2 py-2 bg-white"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card POS">Card POS</option>
                  <option value="Cash NGN">Cash NGN</option>
                  <option value="Corporate Invoice">Corporate Invoice</option>
                  <option value="Online Gateway">Online Gateway</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={immediateCheckIn}
                onChange={(e) => setImmediateCheckIn(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>Immediate Front Desk Check-In (mark suite Occupied now)</span>
            </label>

            <button
              type="submit"
              disabled={busyId === 'booking'}
              className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
            >
              {busyId === 'booking'
                ? 'Saving...'
                : immediateCheckIn
                  ? 'Confirm & Check In Guest'
                  : 'Create Confirmed Booking'}
            </button>
          </div>
        </form>
      )}

      {/* Register Guest Form */}
      {showGuestForm && section === 'guests' && (
        <form
          onSubmit={handleCreateGuest}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-display text-sm font-bold text-slate-900">
            Register New Guest Profile (KYC)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <input
              required
              type="text"
              placeholder="Full Name"
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            />
            <input
              required
              type="text"
              placeholder="Phone (+234...)"
              value={newGuestPhone}
              onChange={(e) => setNewGuestPhone(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            />
            <input
              type="email"
              placeholder="Email Address"
              value={newGuestEmail}
              onChange={(e) => setNewGuestEmail(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            />
            <select
              value={newGuestIdType}
              onChange={(e) => setNewGuestIdType(e.target.value as GuestRecord['idType'])}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="NIN">NIN</option>
              <option value="International Passport">International Passport</option>
              <option value="Driver License">Driver License</option>
              <option value="Voter Card">Voter Card</option>
            </select>
            <input
              type="text"
              placeholder="ID Document Number"
              value={newGuestIdNumber}
              onChange={(e) => setNewGuestIdNumber(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2"
            />
            <select
              value={newGuestVip}
              onChange={(e) => setNewGuestVip(e.target.value as GuestRecord['vipTier'])}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="Standard">Standard Tier</option>
              <option value="Silver">Silver VIP</option>
              <option value="Gold">Gold VIP</option>
              <option value="Diplomatic">Diplomatic</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowGuestForm(false)}
              className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyId === 'guest'}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg"
            >
              Save Guest KYC
            </button>
          </div>
        </form>
      )}

      {/* SECTION: ROOMS (Grouped by Serviced Apartment Section & Hotel Rooms) */}
      {section === 'rooms' && (
        <div className="space-y-6">
          {roomSections.map((sec) => {
            const secRooms = sortedRooms.filter((r) => getRoomSection(r) === sec.key);
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {secRooms.map((room) => (
                    <div
                      key={room.id}
                      className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                    >
                      <div className="h-40 bg-slate-100 relative overflow-hidden">
                        <img
                          src={room.imageUrl || DEFAULT_SUITE_IMAGE}
                          alt={room.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = DEFAULT_SUITE_IMAGE;
                          }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent" />
                        {canManageRooms && (
                          <button
                            type="button"
                            onClick={() => openRoomEditor(room)}
                            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/75 hover:bg-slate-950 text-white text-[11px] font-medium backdrop-blur-sm cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Edit Suite</span>
                          </button>
                        )}
                        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between text-white">
                          <div className="min-w-0 pr-2">
                            <p className="font-mono-tabular text-xs font-bold">{room.roomNumber}</p>
                            <p className="font-display text-sm font-semibold truncate">
                              {room.roomType}
                            </p>
                          </div>
                          <span className="text-[11px] font-medium text-emerald-300 capitalize shrink-0">
                            {room.occupancyStatus.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span className="truncate pr-2">{room.name}</span>
                            <span className="font-mono-tabular shrink-0">
                              Max {room.maxGuests}
                            </span>
                          </div>

                          {canManageRooms && editingRateRoomId === room.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step={500}
                                value={rateDraft}
                                onChange={(e) => setRateDraft(Number(e.target.value))}
                                className="w-28 border border-slate-300 rounded px-2 py-1 text-xs font-mono-tabular"
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
                                className="text-xs text-slate-500 hover:text-slate-800"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="font-mono-tabular text-base font-bold text-slate-900">
                                {formatNgn(room.nightlyRateNgn)}
                                <span className="text-xs font-normal text-slate-500">
                                  {' '}
                                  / night
                                </span>
                              </span>
                              {canManageRooms && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRateRoomId(room.id);
                                    setRateDraft(room.nightlyRateNgn);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Rate</span>
                                </button>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-slate-600 truncate">
                            {room.currentGuestName
                              ? `Guest: ${room.currentGuestName}`
                              : 'Ready for check-in'}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {(room.amenities || []).slice(0, 3).join(' · ')}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-600 capitalize">
                            HK:{' '}
                            <strong className="text-slate-900">{room.housekeepingStatus}</strong>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {canManageRooms && (
                              <button
                                type="button"
                                onClick={() => openRoomEditor(room)}
                                className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 font-medium text-slate-700 cursor-pointer"
                              >
                                Manage
                              </button>
                            )}
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
                              className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 font-medium text-slate-700 cursor-pointer"
                            >
                              {room.housekeepingStatus === 'dirty' ? 'Mark Clean' : 'Mark Dirty'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION: RESERVATIONS & FRONT DESK */}
      {(section === 'reservations' || section === 'front_desk') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Booking Ref</th>
                  <th className="py-3 px-4">Suite</th>
                  <th className="py-3 px-4">Guest &amp; Channel</th>
                  <th className="py-3 px-4">Stay Dates</th>
                  <th className="py-3 px-4 text-right">Room Total</th>
                  <th className="py-3 px-4 text-right">POS Folio</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4">Status &amp; Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredReservations.map((res) => {
                  const total = res.roomChargesNgn + res.posChargesNgn;
                  const balance = Math.max(0, total - res.paidNgn);
                  return (
                    <tr key={res.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                        {res.bookingRef}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-800">
                        {res.roomNumber}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{res.guestName}</p>
                        <p className="text-[11px] text-slate-500">
                          {res.channel} · {res.guestPhone}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-600">
                        {res.checkInDate} → {res.checkOutDate} ({res.nights}n)
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-900">
                        {formatNgn(res.roomChargesNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                        {formatNgn(res.posChargesNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-emerald-700">
                        {formatNgn(res.paidNgn)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-bold text-slate-900">
                        {formatNgn(balance)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {res.status === 'confirmed' && (
                            <button
                              type="button"
                              disabled={busyId === res.id}
                              onClick={() => handleCheckIn(res)}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap cursor-pointer"
                            >
                              Check In
                            </button>
                          )}
                          {res.status === 'checked_in' && (
                            <button
                              type="button"
                              disabled={busyId === res.id}
                              onClick={() => setCheckoutTarget(res)}
                              className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium whitespace-nowrap cursor-pointer"
                            >
                              Settle &amp; Check Out
                            </button>
                          )}
                          {(res.status === 'checked_out' || res.status === 'cancelled') && (
                            <span className="text-slate-500 capitalize">
                              {res.status.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReservations.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-xs text-slate-500">
                      No matching reservations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION: GUEST MANAGEMENT */}
      {section === 'guests' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Guest Name</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">KYC Document</th>
                  <th className="py-3 px-4">VIP Tier</th>
                  <th className="py-3 px-4 text-right">Stays</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredGuests.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{g.fullName}</p>
                      {g.notes && <p className="text-[11px] text-slate-500">{g.notes}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono-tabular text-slate-800">{g.phone}</p>
                      <p className="text-[11px] text-slate-500">{g.email || '—'}</p>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700">
                      {g.idType} {g.idNumber ? `· ${g.idNumber}` : ''}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-700">{g.vipTier}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{g.totalStays}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(g.lifetimeSpendNgn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Room Management Modal (Property Admin & Super Admin) */}
      {editingRoom && canManageRooms && (
        <div className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveRoomEditor}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Manage Suite &amp; Rates — {editingRoom.roomNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Update pricing in Naira (₦), room classification, status, and suite photography
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
                  placeholder="e.g. Deluxe Studio with Kitchenette"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Suite Display Title</label>
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
                  type="number"
                  min={5000}
                  step={500}
                  required
                  value={draftRateNgn}
                  onChange={(e) => setDraftRateNgn(Number(e.target.value))}
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

            {/* Room Photo Upload & Richgates Gallery Selector */}
            <div className="border-t border-slate-200 pt-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">Suite Photography</span>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Upload Photo from Device</span>
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700">
                  {uploadError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-5 h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={draftImageUrl || DEFAULT_SUITE_IMAGE}
                    alt="Suite Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = DEFAULT_SUITE_IMAGE;
                    }}
                  />
                </div>
                <div className="sm:col-span-7 space-y-2">
                  <p className="text-[11px] font-medium text-slate-600">
                    Or pick from Richgates Property Gallery:
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {RICHGATES_GALLERY_ASSETS.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => setDraftImageUrl(asset.url)}
                        title={asset.label}
                        className={`h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                          draftImageUrl === asset.url
                            ? 'border-emerald-600 ring-2 ring-emerald-200'
                            : 'border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <img
                          src={asset.url}
                          alt={asset.label}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={draftImageUrl.startsWith('data:') ? '[Uploaded Device Photo]' : draftImageUrl}
                    onChange={(e) => setDraftImageUrl(e.target.value)}
                    placeholder="Or paste custom image URL (/assets/... or https://...)"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-mono-tabular"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === editingRoom.id}
                className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyId === editingRoom.id ? 'Saving Suite...' : 'Save Suite Changes'}
              </button>
            </div>
          </form>
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
              <div className="flex justify-between">
                <span className="text-slate-600">Previously Paid</span>
                <span className="font-mono-tabular text-emerald-700">
                  -{formatNgn(checkoutTarget.paidNgn)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold text-slate-900">
                <span>Balance Due Now</span>
                <span className="font-mono-tabular">
                  {formatNgn(
                    Math.max(
                      0,
                      checkoutTarget.roomChargesNgn +
                        checkoutTarget.posChargesNgn -
                        checkoutTarget.paidNgn
                    )
                  )}
                </span>
              </div>
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete Check-Out &amp; Post Ledger</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
