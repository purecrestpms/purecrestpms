import React, { useMemo, useState } from 'react';
import {
  Ban,
  Calendar as CalendarIcon,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  createBlockedDate,
  createReservationWorkflow,
  deleteBlockedDate,
  transitionReservationStatus,
} from '../services/pmsService';
import {
  BlockedDateRecord,
  formatBookingSourceLabel,
  formatNgn,
  getRoomSection,
  GuestRecord,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  ReservationRecord,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
} from '../types/pms';
import { CheckInProcessModal, CheckedInConfirmationInfo } from './CheckInProcessModal';
import { useCms } from '../context/CmsContext';

interface ReservationsCalendarViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  guests?: GuestRecord[];
  actorRole: string;
  onNotify: (msg: string) => void;
  onGuestCheckedIn?: (info: CheckedInConfirmationInfo) => void;
  onOpenReservationFolio?: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk'
  ) => void;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

function diffNights(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

function formatDayHeader(isoDate: string): { weekday: string; label: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return {
    weekday: dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    label: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
  };
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const effAEnd = aEnd > aStart ? aEnd : addDaysIso(aStart, 1);
  const effBEnd = bEnd > bStart ? bEnd : addDaysIso(bStart, 1);
  return aStart < effBEnd && bStart < effAEnd;
}

export const ReservationsCalendarView: React.FC<ReservationsCalendarViewProps> = ({
  property,
  rooms,
  reservations,
  blockedDates,
  guests = [],
  actorRole,
  onNotify,
  onGuestCheckedIn,
  onOpenReservationFolio,
}) => {
  const { cms } = useCms();
  const todayIso = new Date().toISOString().slice(0, 10);
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [calendarStart, setCalendarStart] = useState<string>(todayIso);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<'ALL' | RoomSection>('ALL');

  // Date-range availability search (auto-pick today and next day)
  const [availCheckIn, setAvailCheckIn] = useState(todayIso);
  const [availCheckOut, setAvailCheckOut] = useState(tomorrowIso);
  const [onlyShowAvailable, setOnlyShowAvailable] = useState(false);

  // Action modals
  const [modalMode, setModalMode] = useState<'none' | 'block' | 'book'>('none');
  const [targetRoomId, setTargetRoomId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Block Dates form
  const [blockStartDate, setBlockStartDate] = useState(todayIso);
  const [blockEndDate, setBlockEndDate] = useState(tomorrowIso);
  const [blockCategory, setBlockCategory] =
    useState<BlockedDateRecord['category']>('Owner Hold');
  const [blockReason, setBlockReason] = useState('');

  // Quick Reservation form
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+234 803 ');
  const [bookCheckIn, setBookCheckIn] = useState(todayIso);
  const [bookCheckOut, setBookCheckOut] = useState(tomorrowIso);
  const [adults, setAdults] = useState(1);
  const [childrenCount, setChildrenCount] = useState(0);
  const [channel, setChannel] = useState<ReservationRecord['channel']>('Website');
  const [paymentMethod, setPaymentMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [depositNgn, setDepositNgn] = useState(0);
  const [immediateCheckIn, setImmediateCheckIn] = useState(false);
  const [quickIdType, setQuickIdType] = useState<GuestRecord['idType']>('NIN');
  const [quickIdNumber, setQuickIdNumber] = useState('');
  const [quickPayConfirmed, setQuickPayConfirmed] = useState(false);
  const [quickIdVerified, setQuickIdVerified] = useState(false);
  const [quickRoomReady, setQuickRoomReady] = useState(false);
  const [quickKeyIssued, setQuickKeyIssued] = useState<'yes' | 'no' | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);

  const sortedRooms = useMemo(() => sortRoomsByNumber(rooms), [rooms]);

  const calendarDays = useMemo(() => {
    return Array.from({ length: 14 }, (_, idx) => addDaysIso(calendarStart, idx));
  }, [calendarStart]);

  const activeReservations = useMemo(
    () => reservations.filter((r) => r.status === 'confirmed' || r.status === 'checked_in'),
    [reservations]
  );

  const isRoomAvailableInRange = (roomId: string, startIso: string, endIso: string): boolean => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room || room.occupancyStatus === 'out_of_order') return false;
    const hasResOverlap = activeReservations.some(
      (r) => r.roomId === roomId && rangesOverlap(startIso, endIso, r.checkInDate, r.checkOutDate)
    );
    if (hasResOverlap) return false;
    const hasBlockOverlap = blockedDates.some(
      (b) => b.roomId === roomId && rangesOverlap(startIso, endIso, b.startDate, b.endDate)
    );
    return !hasBlockOverlap;
  };

  const describeRoomConflict = (roomId: string, startIso: string, endIso: string): string | null => {
    if (endIso <= startIso) {
      return 'End / check-out date must be after the start date.';
    }
    const resMatch = activeReservations.find(
      (r) => r.roomId === roomId && rangesOverlap(startIso, endIso, r.checkInDate, r.checkOutDate)
    );
    if (resMatch) {
      return `Conflicts with ${resMatch.bookingRef} (${resMatch.guestName}: ${resMatch.checkInDate} → ${resMatch.checkOutDate}).`;
    }
    const blkMatch = blockedDates.find(
      (b) => b.roomId === roomId && rangesOverlap(startIso, endIso, b.startDate, b.endDate)
    );
    if (blkMatch) {
      return `Conflicts with blocked hold (${blkMatch.category}: ${blkMatch.startDate} → ${blkMatch.endDate}).`;
    }
    return null;
  };

  const q = searchQuery.trim().toLowerCase();

  const filteredRooms = useMemo(() => {
    return sortedRooms.filter((room) => {
      const sec = getRoomSection(room);
      if (sectionFilter !== 'ALL' && sec !== sectionFilter) return false;
      if (onlyShowAvailable && !isRoomAvailableInRange(room.id, availCheckIn, availCheckOut)) {
        return false;
      }
      if (!q) return true;
      const roomResMatch = activeReservations.some(
        (r) =>
          r.roomId === room.id &&
          (r.guestName.toLowerCase().includes(q) || r.bookingRef.toLowerCase().includes(q))
      );
      const roomBlockMatch = blockedDates.some(
        (b) =>
          b.roomId === room.id &&
          (b.reason.toLowerCase().includes(q) || b.category.toLowerCase().includes(q))
      );
      return (
        room.roomNumber.toLowerCase().includes(q) ||
        room.name.toLowerCase().includes(q) ||
        room.roomType.toLowerCase().includes(q) ||
        sec.toLowerCase().includes(q) ||
        roomResMatch ||
        roomBlockMatch
      );
    });
  }, [
    sortedRooms,
    sectionFilter,
    onlyShowAvailable,
    availCheckIn,
    availCheckOut,
    q,
    activeReservations,
    blockedDates,
  ]);

  const filteredReservations = useMemo(() => {
    return activeReservations.filter((r) => {
      if (!q) return true;
      return (
        r.guestName.toLowerCase().includes(q) ||
        r.bookingRef.toLowerCase().includes(q) ||
        r.roomNumber.toLowerCase().includes(q) ||
        r.channel.toLowerCase().includes(q)
      );
    });
  }, [activeReservations, q]);

  const filteredBlocks = useMemo(() => {
    return blockedDates.filter((b) => {
      if (!q) return true;
      return (
        b.roomNumber.toLowerCase().includes(q) ||
        b.reason.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      );
    });
  }, [blockedDates, q]);

  const openQuickAction = (mode: 'block' | 'book', room?: RoomRecord, dayIso?: string) => {
    const chosenRoom = room || sortedRooms[0];
    if (!chosenRoom) return;
    setConflictError(null);
    setTargetRoomId(chosenRoom.id);
    if (mode === 'block') {
      const sDate = dayIso || availCheckIn;
      setBlockStartDate(sDate);
      setBlockEndDate(addDaysIso(sDate, 1));
      setBlockReason('');
      setModalMode('block');
    } else {
      const sDate = dayIso || availCheckIn;
      const eDate = dayIso ? addDaysIso(dayIso, 1) : availCheckOut > sDate ? availCheckOut : addDaysIso(sDate, 1);
      setBookCheckIn(sDate);
      setBookCheckOut(eDate);
      setAdults(1);
      setChildrenCount(0);
      setDepositNgn(chosenRoom.nightlyRateNgn);
      setImmediateCheckIn(sDate <= todayIso);
      setQuickIdNumber('');
      setQuickPayConfirmed(false);
      setQuickIdVerified(false);
      setQuickRoomReady(false);
      setQuickKeyIssued(null);
      setModalMode('book');
    }
  };

  const handleSaveBlockDates = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = rooms.find((r) => r.id === targetRoomId);
    if (!room) return;
    const conflict = describeRoomConflict(room.id, blockStartDate, blockEndDate);
    if (conflict) {
      setConflictError(conflict);
      return;
    }
    setBusyId('block');
    try {
      await createBlockedDate({
        property,
        room,
        startDate: blockStartDate,
        endDate: blockEndDate,
        reason: blockReason.trim() || `${blockCategory} hold`,
        category: blockCategory,
        actorRole,
      });
      onNotify(`Blocked ${room.roomNumber} (${blockStartDate} → ${blockEndDate})`);
      setModalMode('none');
      setBlockReason('');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateQuickBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = rooms.find((r) => r.id === targetRoomId);
    const trimmedGuest = `${guestFirstName.trim()} ${guestLastName.trim()}`.trim();
    if (!room || !guestFirstName.trim() || !guestLastName.trim()) {
      setConflictError('Guest first name and last name are required.');
      return;
    }
    const conflict = describeRoomConflict(room.id, bookCheckIn, bookCheckOut);
    if (conflict) {
      setConflictError(conflict);
      return;
    }
    if (immediateCheckIn) {
      if (
        !quickPayConfirmed ||
        !quickIdVerified ||
        quickIdNumber.trim().length < 3 ||
        quickKeyIssued !== 'yes' ||
        !quickRoomReady
      ) {
        setConflictError(
          'Immediate check-in requires confirming payment, verifying Guest ID, setting Key Issued = Yes, and confirming suite readiness.'
        );
        return;
      }
    }
    const nightsCount = diffNights(bookCheckIn, bookCheckOut);
    setBusyId('book');
    try {
      await createReservationWorkflow({
        property,
        room,
        guestName: trimmedGuest,
        guestPhone: guestPhone.trim(),
        guestIdType: quickIdType,
        guestIdNumber: quickIdNumber.trim(),
        checkInDate: bookCheckIn,
        checkOutDate: bookCheckOut,
        bookedDate: todayIso,
        nights: nightsCount,
        adults: Math.max(1, adults),
        children: Math.max(0, childrenCount),
        channel,
        paymentMethod,
        depositNgn: Math.max(0, depositNgn),
        immediateCheckIn,
        paymentConfirmed: immediateCheckIn ? quickPayConfirmed : false,
        idVerified: immediateCheckIn ? quickIdVerified : false,
        keyIssued: immediateCheckIn ? quickKeyIssued === 'yes' : false,
        actorRole,
      });
      onNotify(
        immediateCheckIn
          ? `Checked in ${trimmedGuest} to ${room.roomNumber}`
          : `Booked ${room.roomNumber} for ${trimmedGuest} (${bookCheckIn} → ${bookCheckOut})`
      );
      if (immediateCheckIn) {
        onGuestCheckedIn?.({
          guestName: trimmedGuest,
          roomNumber: room.roomNumber,
        });
      }
      setModalMode('none');
      setGuestFirstName('');
      setGuestLastName('');
      setQuickIdNumber('');
      setQuickKeyIssued(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleUnblock = async (block: BlockedDateRecord) => {
    setBusyId(block.id);
    try {
      await deleteBlockedDate({ property, block, actorRole });
      onNotify(`Removed date block on ${block.roomNumber}`);
    } finally {
      setBusyId(null);
    }
  };

  const sectionsToRender: RoomSection[] = ['Serviced Apartment', 'Hotel Rooms'];

  return (
    <div className="space-y-6">
      {/* Header & Action Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {cms.pages.calendar.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages.calendar.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => openQuickAction('block')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{cms.pages.calendar.ctaLabel || 'Block Room Dates'}</span>
          </button>
          <button
            type="button"
            onClick={() => openQuickAction('book')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>{cms.pages.reservations.ctaLabel || 'New Reservation'}</span>
          </button>
        </div>
      </div>

      {/* Search & Date-Range Availability Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs items-end">
          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">
              Search Calendar (Guest, Ref, Room, Type, or Block Reason)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search RM-1, Deluxe Studio, Chinedu, Deep Clean..."
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-600 mb-1">Property Section</label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value as 'ALL' | RoomSection)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="ALL">All Sections</option>
              <option value="Serviced Apartment">Serviced Apartment Section</option>
              <option value="Hotel Rooms">Hotel Rooms</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-600 mb-1">Availability Check-In</label>
            <input
              type="date"
              value={availCheckIn}
              onChange={(e) => {
                const nextIn = e.target.value;
                if (!nextIn) return;
                setAvailCheckIn(nextIn);
                if (availCheckOut <= nextIn) {
                  setAvailCheckOut(addDaysIso(nextIn, 1));
                }
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-600 mb-1">Availability Check-Out</label>
            <input
              type="date"
              min={addDaysIso(availCheckIn, 1)}
              value={availCheckOut}
              onChange={(e) => {
                const nextOut = e.target.value;
                if (!nextOut) return;
                setAvailCheckOut(nextOut <= availCheckIn ? addDaysIso(availCheckIn, 1) : nextOut);
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyShowAvailable}
              onChange={(e) => setOnlyShowAvailable(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>
              Show only suites available from{' '}
              <strong className="font-mono-tabular">{availCheckIn}</strong> to{' '}
              <strong className="font-mono-tabular">{availCheckOut}</strong>
            </span>
          </label>

          <div className="flex items-center gap-4 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
              Checked In
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              Confirmed Reservation
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-700 inline-block" />
              Blocked Hold
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-slate-300 bg-white inline-block" />
              Open Date
            </span>
          </div>
        </div>
      </div>

      {/* 14-Day Horizontal Availability Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-slate-600" />
            <h2 className="font-display text-sm font-bold text-slate-900">
              14-Day Suite Availability Grid
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCalendarStart(addDaysIso(calendarStart, -7))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev Week</span>
            </button>
            <button
              type="button"
              onClick={() => setCalendarStart(todayIso)}
              className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700"
            >
              Today
            </button>
            <input
              type="date"
              value={calendarStart}
              onChange={(e) => e.target.value && setCalendarStart(e.target.value)}
              className="border border-slate-200 bg-white rounded-lg px-2.5 py-1 font-mono-tabular text-xs"
            />
            <button
              type="button"
              onClick={() => setCalendarStart(addDaysIso(calendarStart, 7))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700"
            >
              <span>Next Week</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 w-56 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                  Suite / Rate
                </th>
                {calendarDays.map((day) => {
                  const hdr = formatDayHeader(day);
                  const isToday = day === todayIso;
                  return (
                    <th
                      key={day}
                      className={`py-2 px-1.5 text-center border-r border-slate-100 last:border-r-0 ${
                        isToday ? 'bg-emerald-50 text-emerald-800' : ''
                      }`}
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wide">
                        {hdr.weekday}
                      </div>
                      <div className="font-mono-tabular text-[11px]">{hdr.label}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {sectionsToRender.map((sectionName) => {
                const sectionRooms = filteredRooms.filter((r) => getRoomSection(r) === sectionName);
                if (sectionRooms.length === 0) return null;
                return (
                  <React.Fragment key={sectionName}>
                    <tr className="bg-slate-100/80">
                      <td
                        colSpan={calendarDays.length + 1}
                        className="py-1.5 px-4 text-[11px] font-bold tracking-wide text-slate-700 uppercase"
                      >
                        {sectionName === 'Serviced Apartment'
                          ? 'Serviced Apartment Section'
                          : 'Hotel Rooms'}
                      </td>
                    </tr>
                    {sectionRooms.map((room) => (
                      <tr key={room.id} className="hover:bg-slate-50/40">
                        <td className="py-2.5 px-4 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono-tabular font-bold text-slate-900">
                              {room.roomNumber}
                            </span>
                            <span className="font-mono-tabular text-[11px] font-semibold text-emerald-700">
                              {formatNgn(room.nightlyRateNgn)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate max-w-[190px]">
                            {room.roomType}
                          </p>
                        </td>

                        {calendarDays.map((day) => {
                          const res = activeReservations.find(
                            (r) => r.roomId === room.id && r.checkInDate <= day && day < r.checkOutDate
                          );
                          const blk = blockedDates.find(
                            (b) =>
                              b.roomId === room.id &&
                              b.startDate <= day &&
                              day < (b.endDate > b.startDate ? b.endDate : addDaysIso(b.startDate, 1))
                          );

                          if (res) {
                            const isCheckedIn = res.status === 'checked_in';
                            return (
                              <td
                                key={day}
                                title={`${res.bookingRef} · ${res.guestName} (${res.checkInDate} → ${res.checkOutDate}) — Click to open Folio`}
                                className="p-1 border-r border-slate-100 last:border-r-0 align-middle"
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenReservationFolio?.(res.id, 'front_desk')}
                                  className={`w-full text-left px-1.5 py-2 rounded text-[10px] font-semibold truncate text-white cursor-pointer transition-opacity hover:opacity-90 ${
                                    isCheckedIn ? 'bg-emerald-600' : 'bg-amber-500'
                                  }`}
                                >
                                  {res.guestName.split(' ')[0]}
                                </button>
                              </td>
                            );
                          }

                          if (blk) {
                            return (
                              <td
                                key={day}
                                title={`${blk.category}: ${blk.reason} (${blk.startDate} → ${blk.endDate}) — Click to unblock`}
                                className="p-1 border-r border-slate-100 last:border-r-0 align-middle"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleUnblock(blk)}
                                  disabled={busyId === blk.id}
                                  className="w-full px-1.5 py-2 rounded bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-semibold truncate cursor-pointer"
                                >
                                  {blk.category}
                                </button>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={day}
                              className="p-1 border-r border-slate-100 last:border-r-0 align-middle"
                            >
                              <button
                                type="button"
                                onClick={() => openQuickAction('book', room, day)}
                                title={`Open ${room.roomNumber} on ${day} — Click to reserve or block`}
                                className="w-full py-2 rounded border border-dashed border-slate-200 hover:border-emerald-600 hover:bg-emerald-50 text-[10px] text-slate-400 hover:text-emerald-700 font-medium transition-colors cursor-pointer"
                              >
                                +
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}

              {filteredRooms.length === 0 && (
                <tr>
                  <td colSpan={calendarDays.length + 1} className="py-10 text-center text-xs text-slate-500">
                    No rooms match your current search or availability filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Split: Blocked Date Holds & Active Reservations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Blocked Dates Ledger */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Blocked Dates &amp; Holds
              </h3>
              <p className="text-xs text-slate-500">
                Owner holds, maintenance windows, and deep cleaning schedules
              </p>
            </div>
            <button
              type="button"
              onClick={() => openQuickAction('block')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Block</span>
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredBlocks.map((blk) => (
              <div
                key={blk.id}
                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {blk.roomNumber}
                    </span>
                    <span className="text-rose-700 font-semibold">{blk.category}</span>
                  </div>
                  <p className="text-xs text-slate-700 truncate">{blk.reason}</p>
                  <p className="font-mono-tabular text-[11px] text-slate-500">
                    {blk.startDate} → {blk.endDate}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === blk.id}
                  onClick={() => handleUnblock(blk)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Unblock</span>
                </button>
              </div>
            ))}
            {filteredBlocks.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                No blocked dates match your filter.
              </p>
            )}
          </div>
        </div>

        {/* Active & Upcoming Calendar Reservations */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Active &amp; Upcoming Reservations
              </h3>
              <p className="text-xs text-slate-500">
                Filtered live against your calendar search
              </p>
            </div>
            <button
              type="button"
              onClick={() => openQuickAction('book')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Book Suite</span>
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredReservations.map((res) => (
              <div
                key={res.id}
                onClick={() => onOpenReservationFolio?.(res.id, 'front_desk')}
                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-emerald-50/40 cursor-pointer transition-colors"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {res.bookingRef}
                    </span>
                    <span className="font-mono-tabular text-slate-600">{res.roomNumber}</span>
                    <span
                      className={`font-semibold ${
                        res.status === 'checked_in' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {res.status === 'checked_in' ? 'Checked In' : 'Confirmed'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 truncate">{res.guestName}</p>
                  <p className="font-mono-tabular text-[11px] text-slate-500">
                    {res.checkInDate} → {res.checkOutDate} ({res.nights}n) ·{' '}
                    {formatBookingSourceLabel(res.channel)}
                  </p>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onOpenReservationFolio?.(res.id, 'front_desk')}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Open Folio
                  </button>
                  {res.status === 'confirmed' && (
                    <button
                      type="button"
                      disabled={busyId === res.id}
                      onClick={() => setCheckInTarget(res)}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                    >
                      Check In
                    </button>
                  )}
                  {res.status === 'confirmed' && (
                    <button
                      type="button"
                      disabled={busyId === res.id}
                      onClick={async () => {
                        setBusyId(res.id);
                        try {
                          await transitionReservationStatus({
                            property,
                            reservation: res,
                            nextStatus: 'cancelled',
                            actorRole,
                          });
                          onNotify(`Cancelled reservation ${res.bookingRef}`);
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredReservations.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                No active reservations match your search.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Block / Book Modal */}
      {modalMode !== 'none' && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConflictError(null);
                    setModalMode('book');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                    modalMode === 'book'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  New Reservation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConflictError(null);
                    setModalMode('block');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                    modalMode === 'block'
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Block Dates
                </button>
              </div>
              <button
                type="button"
                onClick={() => setModalMode('none')}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {conflictError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {conflictError}
              </div>
            )}

            {modalMode === 'block' ? (
              <form onSubmit={handleSaveBlockDates} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Suite / Room</label>
                  <select
                    value={targetRoomId}
                    onChange={(e) => {
                      setTargetRoomId(e.target.value);
                      setConflictError(null);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {sortedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roomNumber} · {r.roomType} ({getRoomSection(r)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Block Start Date</label>
                    <input
                      type="date"
                      required
                      value={blockStartDate}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setBlockStartDate(nextStart);
                        if (nextStart && blockEndDate <= nextStart) {
                          setBlockEndDate(addDaysIso(nextStart, 1));
                        }
                        setConflictError(null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Block End Date (Release)
                    </label>
                    <input
                      type="date"
                      required
                      min={addDaysIso(blockStartDate, 1)}
                      value={blockEndDate}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setBlockEndDate(
                          nextEnd && nextEnd <= blockStartDate
                            ? addDaysIso(blockStartDate, 1)
                            : nextEnd
                        );
                        setConflictError(null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Block Category</label>
                  <select
                    value={blockCategory}
                    onChange={(e) =>
                      setBlockCategory(e.target.value as BlockedDateRecord['category'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="Owner Hold">Owner Hold</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="VIP Hold">VIP Hold</option>
                    <option value="Deep Clean">Deep Clean</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Reason / Notes</label>
                  <input
                    type="text"
                    required
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="e.g. Owner family arrival, Split AC servicing..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode('none')}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busyId === 'block'}
                    className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {busyId === 'block' ? 'Blocking...' : 'Confirm Date Block'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateQuickBooking} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Suite / Room</label>
                  <select
                    value={targetRoomId}
                    onChange={(e) => {
                      const rm = rooms.find((r) => r.id === e.target.value);
                      setTargetRoomId(e.target.value);
                      setConflictError(null);
                      if (rm) setDepositNgn(rm.nightlyRateNgn);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {sortedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)}/nt)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Guest First Name *</label>
                    <input
                      type="text"
                      required
                      value={guestFirstName}
                      onChange={(e) => setGuestFirstName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Guest Last Name *</label>
                    <input
                      type="text"
                      required
                      value={guestLastName}
                      onChange={(e) => setGuestLastName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Phone *</label>
                    <input
                      type="text"
                      required
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Check-In Date</label>
                    <input
                      type="date"
                      required
                      value={bookCheckIn}
                      onChange={(e) => {
                        const nextIn = e.target.value;
                        setBookCheckIn(nextIn);
                        if (nextIn && bookCheckOut <= nextIn) {
                          setBookCheckOut(addDaysIso(nextIn, 1));
                        }
                        setConflictError(null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Check-Out Date</label>
                    <input
                      type="date"
                      required
                      min={addDaysIso(bookCheckIn, 1)}
                      value={bookCheckOut}
                      onChange={(e) => {
                        const nextOut = e.target.value;
                        setBookCheckOut(
                          nextOut && nextOut <= bookCheckIn
                            ? addDaysIso(bookCheckIn, 1)
                            : nextOut
                        );
                        setConflictError(null);
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Booking Source</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as ReservationRecord['channel'])}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                    >
                      {PRIMARY_BOOKING_SOURCES.map((src) => (
                        <option key={src.value} value={src.value}>
                          {src.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Deposit (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={depositNgn}
                      onChange={(e) => setDepositNgn(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Adults</label>
                    <input
                      type="number"
                      min={1}
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Children</label>
                    <input
                      type="number"
                      min={0}
                      value={childrenCount}
                      onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value)))}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                      }
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card POS">Card POS</option>
                      <option value="Cash NGN">Cash NGN</option>
                      <option value="Corporate Invoice">Corporate Invoice</option>
                      <option value="Online Gateway">Online Gateway</option>
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 text-slate-700 pt-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={immediateCheckIn}
                      onChange={(e) => setImmediateCheckIn(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>Check in guest immediately</span>
                  </label>
                </div>

                {immediateCheckIn && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2.5">
                    <p className="font-bold text-slate-900">
                      Mandatory Check-In Verification
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Guest ID Type</label>
                        <select
                          value={quickIdType}
                          onChange={(e) => setQuickIdType(e.target.value as GuestRecord['idType'])}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                        >
                          <option value="NIN">NIN</option>
                          <option value="International Passport">International Passport</option>
                          <option value="Driver License">Driver License</option>
                          <option value="Voter Card">Voter Card</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">ID Number *</label>
                        <input
                          type="text"
                          required
                          value={quickIdNumber}
                          onChange={(e) => setQuickIdNumber(e.target.value)}
                          placeholder="ID / Passport No."
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-mono-tabular"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickPayConfirmed}
                        onChange={(e) => setQuickPayConfirmed(e.target.checked)}
                      />
                      <span>1. Payment confirmed (deposit/transfer verified)</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickIdVerified}
                        onChange={(e) => setQuickIdVerified(e.target.checked)}
                      />
                      <span>2. Guest government ID inspected &amp; verified</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickRoomReady}
                        onChange={(e) => setQuickRoomReady(e.target.checked)}
                      />
                      <span>3. Suite inspected ready for guest</span>
                    </label>
                    <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-2.5">
                      <span className="font-semibold text-slate-800">4. Key Issued? *</span>
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQuickKeyIssued('yes')}
                          className={`px-3 py-1 rounded font-semibold border cursor-pointer ${
                            quickKeyIssued === 'yes'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickKeyIssued('no')}
                          className={`px-3 py-1 rounded font-semibold border cursor-pointer ${
                            quickKeyIssued === 'no'
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

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode('none')}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      busyId === 'book' ||
                      (immediateCheckIn &&
                        (!quickPayConfirmed ||
                          !quickIdVerified ||
                          quickIdNumber.trim().length < 3 ||
                          quickKeyIssued !== 'yes' ||
                          !quickRoomReady))
                    }
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {busyId === 'book'
                      ? 'Saving...'
                      : `Confirm (${diffNights(bookCheckIn, bookCheckOut)} nights)`}
                  </button>
                </div>
              </form>
            )}
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
