import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BedDouble,
  Calendar as CalendarIcon,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  createBlockedDate,
  createReservationWorkflow,
  deleteBlockedDate,
  syncOtaChannelWorkflow,
  transitionReservationStatus,
} from '../services/pmsService';
import {
  BlockedDateRecord,
  formatBookingSourceLabel,
  formatNgn,
  getCheckInDateRestriction,
  getOtaCancellationRestriction,
  getRoomSection,
  GuestRecord,
  isOtaBookingChannel,
  isOtaReservation,
  OtaIntegrationRecord,
  PaymentStatusLabel,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  ReservationRecord,
  RoomRecord,
  RoomSection,
  sortRoomsByNumber,
} from '../types/pms';
import {
  checkRoomDateRangeAvailability,
  formatRoomAvailabilityTag,
  getLocalIsoDate,
  isActiveBlockingReservation,
  matchesRoomRecord,
  normalizeIsoDate,
} from '../utils/availability';
import { AvailabilityDateRangePicker } from './AvailabilityDateRangePicker';
import { CheckInProcessModal, CheckedInConfirmationInfo } from './CheckInProcessModal';
import { CountrySelect } from './CountrySelect';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { useCms } from '../context/CmsContext';

interface ReservationsCalendarViewProps {
  property: PropertyRecord;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  otaChannels?: OtaIntegrationRecord[];
  guests?: GuestRecord[];
  canCompleteCheckIn?: boolean;
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

export const ReservationsCalendarView: React.FC<ReservationsCalendarViewProps> = ({
  property,
  rooms,
  reservations,
  blockedDates,
  otaChannels = [],
  guests = [],
  canCompleteCheckIn = true,
  actorRole,
  onNotify,
  onGuestCheckedIn,
  onOpenReservationFolio,
}) => {
  const { cms } = useCms();
  const todayIso = getLocalIsoDate();
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [calendarStart, setCalendarStart] = useState<string>(todayIso);
  const [gridDaysCount, setGridDaysCount] = useState<14 | 30 | 60>(30);
  const [syncingOta, setSyncingOta] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<{
    reservation: ReservationRecord;
    amountPaid: number;
  } | null>(null);
  const [cellClickMode, setCellClickMode] = useState<'book' | 'block'>('book');
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<'ALL' | RoomSection>('ALL');
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('ALL');

  // Date-range availability search (auto-pick today and next day)
  const [availCheckIn, setAvailCheckIn] = useState(todayIso);
  const [availCheckOut, setAvailCheckOut] = useState(tomorrowIso);
  const [onlyShowAvailable, setOnlyShowAvailable] = useState(false);

  // Action modals
  const [modalMode, setModalMode] = useState<'none' | 'block' | 'book'>('none');
  const [targetRoomId, setTargetRoomId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);

  // Block Dates form (supports single room OR multi-room / property-wide hold)
  const [blockScope, setBlockScope] = useState<'single' | 'multi'>('single');
  const [selectedBulkRoomIds, setSelectedBulkRoomIds] = useState<string[]>([]);
  const [blockStartDate, setBlockStartDate] = useState(todayIso);
  const [blockEndDate, setBlockEndDate] = useState(tomorrowIso);
  const [blockCategory, setBlockCategory] =
    useState<BlockedDateRecord['category']>('Owner Hold');
  const [blockReason, setBlockReason] = useState('');

  // Quick Reservation form
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+234 803 ');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [guestCity, setGuestCity] = useState('');
  const [guestState, setGuestState] = useState('');
  const [guestCountry, setGuestCountry] = useState('Nigeria');
  const [bookCheckIn, setBookCheckIn] = useState(todayIso);
  const [bookCheckOut, setBookCheckOut] = useState(tomorrowIso);
  const [adults, setAdults] = useState(1);
  const [childrenCount, setChildrenCount] = useState(0);
  const [channel, setChannel] = useState<ReservationRecord['channel']>('Website');
  const [paymentMethod, setPaymentMethod] =
    useState<ReservationRecord['paymentMethod']>('Bank Transfer');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusLabel>('Paid');
  const [depositNgn, setDepositNgn] = useState(0);
  const [cautionEnabled, setCautionEnabled] = useState(false);
  const [cautionFeeNgn, setCautionFeeNgn] = useState(20000);
  const [cautionCollectedNgn, setCautionCollectedNgn] = useState(0);
  const [cautionRefunded, setCautionRefunded] = useState(false);
  const [immediateCheckIn, setImmediateCheckIn] = useState(false);
  const [quickIdType, setQuickIdType] = useState<GuestRecord['idType']>('NIN');
  const [quickIdNumber, setQuickIdNumber] = useState('');
  const [quickPayConfirmed, setQuickPayConfirmed] = useState(false);
  const [quickIdVerified, setQuickIdVerified] = useState(false);
  const [quickRoomReady, setQuickRoomReady] = useState(false);
  const [quickKeyIssued, setQuickKeyIssued] = useState<'yes' | 'no' | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);

  const sortedRooms = useMemo(() => sortRoomsByNumber(rooms), [rooms]);

  const uniqueRoomTypes = useMemo(() => {
    return Array.from(new Set(sortedRooms.map((r) => r.roomType).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [sortedRooms]);

  const calendarDays = useMemo(() => {
    return Array.from({ length: gridDaysCount }, (_, idx) => addDaysIso(calendarStart, idx));
  }, [calendarStart, gridDaysCount]);

  const activeReservations = useMemo(
    () => reservations.filter((r) => isActiveBlockingReservation(r)),
    [reservations]
  );

  const isRoomAvailableInRange = (roomId: string, startIso: string, endIso: string): boolean => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return false;
    return checkRoomDateRangeAvailability({
      room,
      checkInDate: startIso,
      checkOutDate: endIso,
      reservations,
      blockedDates,
    }).available;
  };

  const describeRoomConflict = (roomId: string, startIso: string, endIso: string): string | null => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return 'Selected room could not be found.';
    const check = checkRoomDateRangeAvailability({
      room,
      checkInDate: startIso,
      checkOutDate: endIso,
      reservations,
      blockedDates,
    });
    return check.available ? null : check.message;
  };

  // Live availability summary across the selected [availCheckIn, availCheckOut) window
  const availabilitySummary = useMemo(() => {
    let openCount = 0;
    let checkedInCount = 0;
    let bookedCount = 0;
    let otaCount = 0;
    let blockedCount = 0;
    let oooCount = 0;

    sortedRooms.forEach((room) => {
      if (room.occupancyStatus === 'out_of_order') {
        oooCount += 1;
        return;
      }
      const check = checkRoomDateRangeAvailability({
        room,
        checkInDate: availCheckIn,
        checkOutDate: availCheckOut,
        reservations,
        blockedDates,
      });
      if (check.available) {
        openCount += 1;
      } else if (check.status === 'blocked') {
        blockedCount += 1;
      } else if (check.conflictReservation) {
        if (check.conflictReservation.status === 'checked_in') {
          checkedInCount += 1;
        } else {
          bookedCount += 1;
        }
        if (isOtaReservation(check.conflictReservation)) {
          otaCount += 1;
        }
      }
    });

    // Live totals across ALL active & upcoming reservations on the calendar (not limited to 1-night search window)
    let activeConfirmedTotal = 0;
    let activeOtaTotal = 0;
    reservations.forEach((res) => {
      if (!isActiveBlockingReservation(res)) return;
      const normIn = normalizeIsoDate(res.checkInDate);
      const normOut = normalizeIsoDate(res.checkOutDate);
      const effOut = normOut || normIn;
      const isCurrentOrFuture = res.status === 'checked_in' || !effOut || effOut >= todayIso;
      if (!isCurrentOrFuture) return;
      if (res.status === 'confirmed' || res.status === 'pending') {
        activeConfirmedTotal += 1;
      }
      if (isOtaReservation(res)) {
        activeOtaTotal += 1;
      }
    });

    const total = sortedRooms.length;
    const availNights = diffNights(availCheckIn, availCheckOut);
    return {
      total,
      openCount,
      checkedInCount,
      bookedCount,
      otaCount,
      activeConfirmedTotal,
      activeOtaTotal,
      blockedCount,
      oooCount,
      availNights,
      availabilityPct: total > 0 ? Math.round((openCount / total) * 100) : 0,
    };
  }, [sortedRooms, availCheckIn, availCheckOut, reservations, blockedDates, todayIso]);

  const q = searchQuery.trim().toLowerCase();

  const filteredRooms = useMemo(() => {
    return sortedRooms.filter((room) => {
      const sec = getRoomSection(room);
      if (sectionFilter !== 'ALL' && sec !== sectionFilter) return false;
      if (roomTypeFilter !== 'ALL' && room.roomType !== roomTypeFilter) return false;
      if (onlyShowAvailable && !isRoomAvailableInRange(room.id, availCheckIn, availCheckOut)) {
        return false;
      }
      if (!q) return true;
      const roomResMatch = activeReservations.some(
        (r) =>
          matchesRoomRecord(room, r.roomId, r.roomNumber) &&
          (r.guestName.toLowerCase().includes(q) ||
            r.bookingRef.toLowerCase().includes(q) ||
            r.channel.toLowerCase().includes(q))
      );
      const roomBlockMatch = blockedDates.some(
        (b) =>
          matchesRoomRecord(room, b.roomId, b.roomNumber) &&
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
    roomTypeFilter,
    onlyShowAvailable,
    availCheckIn,
    availCheckOut,
    q,
    activeReservations,
    blockedDates,
  ]);

  const unassignedActiveReservations = useMemo(() => {
    return activeReservations
      .filter((r) => {
        const outIso = normalizeIsoDate(r.checkOutDate);
        const inIso = normalizeIsoDate(r.checkInDate);
        const effOut = outIso > inIso ? outIso : addDaysIso(inIso, 1);
        const isCurrentOrFuture = r.status === 'checked_in' || effOut >= todayIso;
        if (!isCurrentOrFuture) return false;
        return !sortedRooms.some((room) => matchesRoomRecord(room, r.roomId, r.roomNumber));
      })
      .sort((a, b) =>
        normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
      );
  }, [activeReservations, sortedRooms, todayIso]);

  const calendarConflicts = useMemo(() => {
    const conflicts: Array<{
      id: string;
      roomNumber: string;
      startDate: string;
      summary: string;
      reservationId?: string;
    }> = [];

    sortedRooms.forEach((room) => {
      const roomRes = activeReservations
        .filter((r) => {
          if (!matchesRoomRecord(room, r.roomId, r.roomNumber)) return false;
          const outIso = normalizeIsoDate(r.checkOutDate);
          const inIso = normalizeIsoDate(r.checkInDate);
          const effOut = outIso > inIso ? outIso : addDaysIso(inIso, 1);
          return r.status === 'checked_in' || effOut >= todayIso;
        })
        .sort((a, b) =>
          normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
        );

      // Pairwise double-booking check
      for (let i = 0; i < roomRes.length; i += 1) {
        const a = roomRes[i];
        for (let j = i + 1; j < roomRes.length; j += 1) {
          const b = roomRes[j];
          const aIn = normalizeIsoDate(a.checkInDate);
          const aOut = normalizeIsoDate(a.checkOutDate) > aIn ? normalizeIsoDate(a.checkOutDate) : addDaysIso(aIn, 1);
          const bIn = normalizeIsoDate(b.checkInDate);
          const bOut = normalizeIsoDate(b.checkOutDate) > bIn ? normalizeIsoDate(b.checkOutDate) : addDaysIso(bIn, 1);
          if (aIn < bOut && bIn < aOut) {
            conflicts.push({
              id: `dup-${a.id}-${b.id}`,
              roomNumber: room.roomNumber,
              startDate: aIn > bIn ? aIn : bIn,
              summary: `Double-booking overlap on ${room.roomNumber}: ${a.bookingRef} (${a.guestName}, ${aIn} → ${aOut}) overlaps ${b.bookingRef} (${b.guestName}, ${bIn} → ${bOut})`,
              reservationId: a.id,
            });
          }
        }

        // Reservation vs blocked date overlap check
        const aIn = normalizeIsoDate(a.checkInDate);
        const aOut = normalizeIsoDate(a.checkOutDate) > aIn ? normalizeIsoDate(a.checkOutDate) : addDaysIso(aIn, 1);
        blockedDates.forEach((blk) => {
          if (!matchesRoomRecord(room, blk.roomId, blk.roomNumber)) return;
          const bStart = normalizeIsoDate(blk.startDate);
          const bEnd = normalizeIsoDate(blk.endDate) > bStart ? normalizeIsoDate(blk.endDate) : addDaysIso(bStart, 1);
          if (aIn < bEnd && bStart < aOut) {
            conflicts.push({
              id: `blk-${a.id}-${blk.id}`,
              roomNumber: room.roomNumber,
              startDate: aIn > bStart ? aIn : bStart,
              summary: `Reservation/Block conflict on ${room.roomNumber}: ${a.bookingRef} (${a.guestName}, ${aIn} → ${aOut}) overlaps ${blk.category} block (${bStart} → ${bEnd})`,
              reservationId: a.id,
            });
          }
        });
      }
    });

    return conflicts;
  }, [sortedRooms, activeReservations, blockedDates, todayIso]);

  const filteredReservations = useMemo(() => {
    return activeReservations
      .filter((r) => {
        const inIso = normalizeIsoDate(r.checkInDate);
        const outIso = normalizeIsoDate(r.checkOutDate);
        const effOut = outIso > inIso ? outIso : addDaysIso(inIso, 1);
        // Keep all currently checked-in stays and all current/future reservations (including same-day departures)
        if (r.status !== 'checked_in' && effOut < todayIso) return false;
        if (!q) return true;
        return (
          r.guestName.toLowerCase().includes(q) ||
          r.bookingRef.toLowerCase().includes(q) ||
          r.roomNumber.toLowerCase().includes(q) ||
          r.channel.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
      );
  }, [activeReservations, q, todayIso]);

  const syncedOtaReservations = useMemo(() => {
    return activeReservations
      .filter((r) => {
        if (!isOtaBookingChannel(r.channel)) return false;
        const inIso = normalizeIsoDate(r.checkInDate);
        const outIso = normalizeIsoDate(r.checkOutDate);
        const effOut = outIso > inIso ? outIso : addDaysIso(inIso, 1);
        return r.status === 'checked_in' || effOut >= todayIso;
      })
      .sort((a, b) =>
        normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
      );
  }, [activeReservations, todayIso]);

  const filteredBlocks = useMemo(() => {
    return blockedDates
      .filter((b) => {
        const bStart = normalizeIsoDate(b.startDate);
        const bEnd = normalizeIsoDate(b.endDate);
        const effEnd = bEnd > bStart ? bEnd : addDaysIso(bStart, 1);
        // Keep all active & upcoming blocked dates (including those ending today)
        if (effEnd < todayIso) return false;
        if (!q) return true;
        return (
          b.roomNumber.toLowerCase().includes(q) ||
          b.reason.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        normalizeIsoDate(a.startDate).localeCompare(normalizeIsoDate(b.startDate))
      );
  }, [blockedDates, q, todayIso]);

  const openQuickAction = (mode: 'block' | 'book', room?: RoomRecord, dayIso?: string) => {
    const chosenRoom =
      room ||
      sortedRooms.find((r) => r.occupancyStatus !== 'out_of_order') ||
      sortedRooms[0];
    if (!chosenRoom) return;
    setConflictError(null);
    setCalendarNotice(null);
    setTargetRoomId(chosenRoom.id);
    if (mode === 'block') {
      const sDate = dayIso || availCheckIn;
      const eDate = dayIso
        ? addDaysIso(dayIso, 1)
        : availCheckOut > sDate
          ? availCheckOut
          : addDaysIso(sDate, 1);
      setBlockScope('single');
      setSelectedBulkRoomIds([chosenRoom.id]);
      setBlockStartDate(sDate);
      setBlockEndDate(eDate);
      setBlockReason('');
      setModalMode('block');
    } else {
      const sDate = dayIso || availCheckIn;
      const eDate = dayIso
        ? addDaysIso(dayIso, 1)
        : availCheckOut > sDate
          ? availCheckOut
          : addDaysIso(sDate, 1);
      setBookCheckIn(sDate);
      setBookCheckOut(eDate);
      setAdults(1);
      setChildrenCount(0);
      setDepositNgn(chosenRoom.nightlyRateNgn * diffNights(sDate, eDate));
      setPaymentStatus('Paid');
      setCautionEnabled(false);
      setCautionFeeNgn(20000);
      setCautionCollectedNgn(0);
      setCautionRefunded(false);
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
    if (!blockStartDate || !blockEndDate || blockEndDate <= blockStartDate) {
      setConflictError('Block release date must be after the start date.');
      return;
    }

    if (blockScope === 'multi') {
      const targetRooms = sortedRooms.filter(
        (r) =>
          selectedBulkRoomIds.includes(r.id) &&
          isRoomAvailableInRange(r.id, blockStartDate, blockEndDate)
      );
      if (targetRooms.length === 0) {
        setConflictError(
          `No available rooms are selected for ${blockStartDate} → ${blockEndDate}. Select at least one open room or adjust the dates.`
        );
        return;
      }
      setBusyId('block');
      try {
        await Promise.all(
          targetRooms.map((rm) =>
            createBlockedDate({
              property,
              room: rm,
              startDate: blockStartDate,
              endDate: blockEndDate,
              reason: blockReason.trim() || `${blockCategory} hold`,
              category: blockCategory,
              actorRole,
            })
          )
        );
        onNotify(
          `Blocked ${targetRooms.length} room${targetRooms.length === 1 ? '' : 's'} (${blockStartDate} → ${blockEndDate})`
        );
        setModalMode('none');
        setBlockReason('');
      } catch (err) {
        setConflictError(
          err instanceof Error ? err.message : 'Unable to save blocked dates right now.'
        );
      } finally {
        setBusyId(null);
      }
      return;
    }

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
    } catch (err) {
      setConflictError(
        err instanceof Error ? err.message : 'Unable to save blocked dates right now.'
      );
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
    const nightsCount = diffNights(bookCheckIn, bookCheckOut);
    setBusyId('book');
    try {
      const createdRes = await createReservationWorkflow({
        property,
        room,
        guestName: trimmedGuest,
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim(),
        guestAddress: guestAddress.trim(),
        guestCity: guestCity.trim(),
        guestState: guestState.trim(),
        guestCountry: guestCountry.trim() || 'Nigeria',
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
        paymentStatus,
        depositNgn: Math.max(0, depositNgn),
        hotelPaidNgn: Math.max(0, depositNgn),
        cautionDepositEnabled: cautionEnabled,
        cautionDepositNgn: cautionEnabled ? Math.max(0, cautionFeeNgn) : 0,
        cautionDepositCollectedNgn: cautionEnabled ? Math.max(0, cautionCollectedNgn) : 0,
        cautionDepositRefunded: cautionEnabled ? cautionRefunded : false,
        immediateCheckIn: false,
        paymentConfirmed: false,
        idVerified: false,
        keyIssued: false,
        actorRole,
      });
      onNotify(
        `Reservation Created Successfully — ${room.roomNumber} for ${trimmedGuest} (${bookCheckIn} → ${bookCheckOut})`
      );
      if (Math.max(0, depositNgn) > 0 || paymentStatus === 'Paid' || paymentStatus === 'Partial') {
        setReceiptTarget({
          reservation: createdRes.reservation,
          amountPaid: Math.max(0, depositNgn),
        });
      }
      setModalMode('none');
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      setGuestAddress('');
      setGuestCity('');
      setGuestState('');
      setGuestCountry('Nigeria');
      setCautionEnabled(false);
      setCautionCollectedNgn(0);
      setCautionRefunded(false);
      setQuickIdNumber('');
      setQuickKeyIssued(null);
    } catch (err) {
      setConflictError(
        err instanceof Error ? err.message : 'Unable to save reservation right now.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleUnblock = async (block: BlockedDateRecord) => {
    setBusyId(block.id);
    try {
      await deleteBlockedDate({ property, block, actorRole });
      onNotify(`Removed date block on ${block.roomNumber}`);
    } catch (err) {
      setCalendarNotice(
        err instanceof Error ? err.message : 'Unable to remove date block right now.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const connectedIcalChannels = useMemo(
    () => otaChannels.filter((ch) => ch.connected && Boolean(ch.icalImportUrl?.trim())),
    [otaChannels]
  );

  const handleSyncAllOtaNow = async () => {
    if (syncingOta) return;
    if (connectedIcalChannels.length === 0) {
      onNotify('No connected OTA iCal links found. Connect Airbnb or Booking.com in Channel Manager.');
      return;
    }
    setSyncingOta(true);
    setCalendarNotice(null);
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalEvents = 0;
    const failedNames: string[] = [];
    try {
      for (const ch of connectedIcalChannels) {
        try {
          const res = await syncOtaChannelWorkflow({
            property,
            channel: ch,
            rooms,
            actorRole,
          });
          totalCreated += res.created;
          totalUpdated += res.updated;
          totalEvents += res.totalEvents;
        } catch {
          failedNames.push(ch.channelName);
        }
      }
      if (failedNames.length > 0) {
        onNotify(
          `Refreshed ${connectedIcalChannels.length - failedNames.length}/${connectedIcalChannels.length} channel feeds (${totalEvents} events; ${totalCreated} new, ${totalUpdated} updated). Failed: ${failedNames.join(', ')}.`
        );
      } else {
        onNotify(
          `Refreshed ${connectedIcalChannels.length} OTA channel${connectedIcalChannels.length === 1 ? '' : 's'} (${totalEvents} events checked · ${totalCreated} new, ${totalUpdated} updated)`
        );
      }
    } finally {
      setSyncingOta(false);
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
          {connectedIcalChannels.length > 0 && (
            <button
              type="button"
              disabled={syncingOta}
              onClick={() => void handleSyncAllOtaNow()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-900 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingOta ? 'animate-spin' : ''}`} />
              <span>{syncingOta ? 'Refreshing Channels...' : `Refresh Channels (${connectedIcalChannels.length})`}</span>
            </button>
          )}
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

      {/* Live Window Availability KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setOnlyShowAvailable((v) => !v)}
          className={`text-left bg-white border rounded-xl p-4 transition-colors cursor-pointer ${
            onlyShowAvailable
              ? 'border-emerald-600 bg-emerald-50/40'
              : 'border-slate-200 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Available Rooms</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900">
              {availabilitySummary.openCount}
            </span>
            <span className="font-mono-tabular text-xs text-slate-500">
              / {availabilitySummary.total} ({availabilitySummary.availabilityPct}%)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {onlyShowAvailable ? 'Filtering to available only · Click to show all' : `Open for ${availabilitySummary.availNights} night${availabilitySummary.availNights === 1 ? '' : 's'} · Click to filter`}
          </p>
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">In-House / Checked In</span>
            <BedDouble className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900">
              {availabilitySummary.checkedInCount}
            </span>
            <span className="text-xs text-slate-500">occupied rooms</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Active stays during {availCheckIn} → {availCheckOut}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Confirmed &amp; OTA Booked</span>
            <CalendarCheck2 className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900">
              {availabilitySummary.activeConfirmedTotal}
            </span>
            <span className="font-mono-tabular text-xs text-orange-700 font-medium">
              {availabilitySummary.activeOtaTotal} Airbnb / OTA
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {availabilitySummary.bookedCount > 0
              ? `${availabilitySummary.bookedCount} in selected range · Live PMS & channel stays`
              : 'Live PMS & channel reservations'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Blocked Holds &amp; OOO</span>
            <Ban className="w-4 h-4 text-rose-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900">
              {availabilitySummary.blockedCount + availabilitySummary.oooCount}
            </span>
            <span className="font-mono-tabular text-xs text-slate-500">
              {availabilitySummary.blockedCount} holds · {availabilitySummary.oooCount} OOO
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {blockedDates.length} total active block{blockedDates.length === 1 ? '' : 's'} on calendar
          </p>
        </div>
      </div>

      {/* Search & Date-Range Availability Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 text-xs items-end">
          <div className="lg:col-span-3">
            <label className="block font-medium text-slate-600 mb-1">
              Search Calendar
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Guest, Ref, Room, Airbnb, Hold..."
                className="w-full h-9 pl-8 pr-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">Property Section</label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value as 'ALL' | RoomSection)}
              className="w-full h-9 border border-slate-200 rounded-lg px-2.5 bg-white"
            >
              <option value="ALL">All Sections</option>
              <option value="Serviced Apartment">Serviced Apartments</option>
              <option value="Hotel Rooms">Hotel Rooms</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">Room Type</label>
            <select
              value={roomTypeFilter}
              onChange={(e) => setRoomTypeFilter(e.target.value)}
              className="w-full h-9 border border-slate-200 rounded-lg px-2.5 bg-white"
            >
              <option value="ALL">All Room Types</option>
              {uniqueRoomTypes.map((rt) => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">Check-In</label>
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
              className="w-full h-9 border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">
              Check-Out ({availabilitySummary.availNights}n)
            </label>
            <input
              type="date"
              min={addDaysIso(availCheckIn, 1)}
              value={availCheckOut}
              onChange={(e) => {
                const nextOut = e.target.value;
                if (!nextOut) return;
                setAvailCheckOut(nextOut <= availCheckIn ? addDaysIso(availCheckIn, 1) : nextOut);
              }}
              className="w-full h-9 border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
            />
          </div>

          <div className="lg:col-span-1">
            <button
              type="button"
              onClick={() => setCalendarStart(availCheckIn)}
              title="Jump timeline grid to Check-In date"
              className="w-full h-9 px-2.5 border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 text-slate-700 font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              View
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyShowAvailable}
                onChange={(e) => setOnlyShowAvailable(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>
                Only open rooms ({availCheckIn} → {availCheckOut})
              </span>
            </label>
            {(searchQuery || sectionFilter !== 'ALL' || roomTypeFilter !== 'ALL' || onlyShowAvailable) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSectionFilter('ALL');
                  setRoomTypeFilter('ALL');
                  setOnlyShowAvailable(false);
                }}
                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3.5 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
              Checked In
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              Confirmed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />
              Airbnb / OTA
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-600 inline-block" />
              Pending
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-700 inline-block" />
              Blocked Hold
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />
              Out of Order
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-slate-300 bg-white inline-block" />
              Open Date
            </span>
          </div>
        </div>
      </div>

      {calendarNotice && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{calendarNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setCalendarNotice(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {calendarConflicts.length > 0 && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-300 rounded-xl px-4 py-3.5 text-xs text-rose-950 space-y-2 shadow-xs"
        >
          <div className="flex items-center gap-2 font-bold text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {calendarConflicts.length} Calendar Overlap Conflict
              {calendarConflicts.length === 1 ? '' : 's'} Detected — Resolve to Prevent Double Bookings
            </span>
          </div>
          <div className="space-y-1.5">
            {calendarConflicts.slice(0, 5).map((conflict) => (
              <div
                key={conflict.id}
                className="flex flex-wrap items-center justify-between gap-2 bg-white/80 border border-rose-200 rounded-lg px-3 py-1.5"
              >
                <span className="text-[11px] font-medium text-rose-900">{conflict.summary}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCalendarStart(conflict.startDate)}
                    className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-semibold cursor-pointer"
                  >
                    Jump to {conflict.startDate}
                  </button>
                  {conflict.reservationId && onOpenReservationFolio && (
                    <button
                      type="button"
                      onClick={() => onOpenReservationFolio(conflict.reservationId!, 'front_desk')}
                      className="px-2 py-1 rounded border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 text-[10px] font-semibold cursor-pointer"
                    >
                      Open Folio
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Synced OTA / Airbnb Bookings Quick-Jump Strip */}
      {syncedOtaReservations.length > 0 && (
        <div className="bg-orange-50/75 border border-orange-200 rounded-xl px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-orange-950">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>
                {syncedOtaReservations.length} Active OTA / Airbnb Reservation
                {syncedOtaReservations.length === 1 ? '' : 's'} on Calendar
              </span>
            </div>
            <span className="text-[11px] text-orange-800">
              Click any booking below to jump the calendar matrix directly to its dates
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {syncedOtaReservations.map((res) => {
              const inIso = normalizeIsoDate(res.checkInDate) || res.checkInDate;
              const outIso = normalizeIsoDate(res.checkOutDate) || res.checkOutDate;
              const sourceLabel = formatBookingSourceLabel(res.channel);
              const inVisibleGrid =
                calendarDays.length > 0 &&
                inIso <= calendarDays[calendarDays.length - 1] &&
                outIso > calendarDays[0];
              return (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => {
                    setCalendarStart(inIso);
                    setOnlyShowAvailable(false);
                    setSectionFilter('ALL');
                    setRoomTypeFilter('ALL');
                    setSearchQuery('');
                  }}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-[11px] transition-colors cursor-pointer ${
                    inVisibleGrid
                      ? 'bg-white border-orange-300 text-orange-950 hover:bg-orange-100/70'
                      : 'bg-orange-100/80 border-orange-300 text-orange-950 hover:bg-orange-200/80'
                  }`}
                  title={`Jump calendar to ${res.guestName} (${sourceLabel}) · ${inIso} → ${outIso}`}
                >
                  <span className="font-bold text-orange-700">{sourceLabel}</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {res.roomNumber || 'Unassigned'}
                  </span>
                  <span className="font-mono-tabular text-slate-600">
                    {inIso} → {outIso}
                  </span>
                  <span className="text-slate-700 truncate max-w-[130px]">{res.guestName}</span>
                  {!inVisibleGrid && (
                    <span className="text-[10px] font-bold text-orange-700 underline">
                      Jump
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced 14-Day / 30-Day / 60-Day Horizontal Availability Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-600" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                {gridDaysCount}-Day Room Availability Matrix
              </h2>
            </div>

            {/* Horizon Switcher */}
            <div className="inline-flex items-center p-0.5 bg-slate-200/70 rounded-lg text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setGridDaysCount(14)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  gridDaysCount === 14
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                14 Days
              </button>
              <button
                type="button"
                onClick={() => setGridDaysCount(30)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  gridDaysCount === 30
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setGridDaysCount(60)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  gridDaysCount === 60
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                60 Days
              </button>
            </div>

            {/* Open Cell Quick-Click Action Mode */}
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span>Click open date to:</span>
              <div className="inline-flex items-center p-0.5 bg-slate-200/70 rounded-lg font-semibold">
                <button
                  type="button"
                  onClick={() => setCellClickMode('book')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    cellClickMode === 'book'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Book
                </button>
                <button
                  type="button"
                  onClick={() => setCellClickMode('block')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    cellClickMode === 'block'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Block
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCalendarStart(addDaysIso(calendarStart, -7))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              onClick={() => setCalendarStart(todayIso)}
              className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700 cursor-pointer whitespace-nowrap"
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCalendarStart(addDaysIso(calendarStart, 30))}
              className="px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-700 cursor-pointer whitespace-nowrap"
            >
              +30d
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className={`w-full text-left border-collapse ${
              gridDaysCount === 60
                ? 'min-w-[3480px]'
                : gridDaysCount === 30
                  ? 'min-w-[1860px]'
                  : 'min-w-[1040px]'
            }`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 w-64 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                  Room / Rate &amp; Quick Action
                </th>
                {calendarDays.map((day) => {
                  const hdr = formatDayHeader(day);
                  const isToday = day === todayIso;
                  const isInSearchRange = day >= availCheckIn && day < availCheckOut;
                  return (
                    <th
                      key={day}
                      className={`py-2 px-1.5 text-center border-r border-slate-100 last:border-r-0 ${
                        isToday
                          ? 'bg-emerald-100/80 text-emerald-900'
                          : isInSearchRange
                            ? 'bg-emerald-50/70 text-emerald-800'
                            : ''
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
              {unassignedActiveReservations.length > 0 && (
                <tr className="bg-violet-50/60">
                  <td className="py-2.5 px-4 sticky left-0 bg-violet-50 z-10 border-r border-violet-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-violet-950 text-xs">
                        Unassigned Bookings
                      </span>
                      <span className="font-mono-tabular text-[10px] font-bold text-violet-700">
                        {unassignedActiveReservations.length} pending
                      </span>
                    </div>
                    <p className="text-[10px] text-violet-700 mt-0.5">
                      Click any booking to assign a room
                    </p>
                  </td>
                  {calendarDays.map((day) => {
                    const dayUnassigned = unassignedActiveReservations.filter((r) => {
                      const rIn = normalizeIsoDate(r.checkInDate);
                      const rOutRaw = normalizeIsoDate(r.checkOutDate);
                      if (!rIn) return false;
                      const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
                      return rIn <= day && day < rOut;
                    });
                    if (dayUnassigned.length === 0) {
                      return (
                        <td
                          key={day}
                          className="p-1 border-r border-violet-100 last:border-r-0 align-middle text-center text-[10px] text-violet-300"
                        >
                          —
                        </td>
                      );
                    }
                    const lead = dayUnassigned[0];
                    return (
                      <td
                        key={day}
                        title={dayUnassigned
                          .map(
                            (r) =>
                              `${r.bookingRef} · ${r.guestName} (${r.requestedRoomType || 'Unassigned'}) · ${normalizeIsoDate(r.checkInDate)} → ${normalizeIsoDate(r.checkOutDate)}`
                          )
                          .join(' | ')}
                        className="p-1 border-r border-violet-100 last:border-r-0 align-middle"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenReservationFolio?.(lead.id, 'front_desk')}
                          className="w-full text-left px-1.5 py-2 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold truncate cursor-pointer"
                        >
                          {lead.guestName.split(' ')[0]}
                          {dayUnassigned.length > 1 ? ` +${dayUnassigned.length - 1}` : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )}

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
                          : 'Hotel Rooms'}{' '}
                        · {sectionRooms.length}
                      </td>
                    </tr>
                    {sectionRooms.map((room) => {
                      const rangeCheck = checkRoomDateRangeAvailability({
                        room,
                        checkInDate: availCheckIn,
                        checkOutDate: availCheckOut,
                        reservations,
                        blockedDates,
                      });
                      const rangeStatusText =
                        room.occupancyStatus === 'out_of_order'
                          ? 'OOO'
                          : rangeCheck.available
                            ? 'Open'
                            : rangeCheck.status === 'blocked'
                              ? 'Blocked'
                              : 'Booked';
                      const rangeStatusColor =
                        room.occupancyStatus === 'out_of_order'
                          ? 'text-slate-500'
                          : rangeCheck.available
                            ? 'text-emerald-700'
                            : rangeCheck.status === 'blocked'
                              ? 'text-rose-700'
                              : 'text-amber-700';

                      return (
                      <tr key={room.id} className="hover:bg-slate-50/40">
                        <td className="py-2.5 px-4 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono-tabular font-bold text-slate-900">
                                {room.roomNumber}
                              </span>
                              <span className={`text-[10px] font-semibold ${rangeStatusColor}`}>
                                · {rangeStatusText}
                              </span>
                            </div>
                            <span className="font-mono-tabular text-[11px] font-semibold text-emerald-700 shrink-0">
                              {formatNgn(room.nightlyRateNgn)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500 truncate max-w-[140px]">
                              {room.roomType}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openQuickAction('book', room)}
                                title={`Book ${room.roomNumber} for ${availCheckIn} → ${availCheckOut}`}
                                className="px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded transition-colors cursor-pointer"
                              >
                                Book
                              </button>
                              <button
                                type="button"
                                onClick={() => openQuickAction('block', room)}
                                title={`Block dates for ${room.roomNumber}`}
                                className="px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded transition-colors cursor-pointer"
                              >
                                Block
                              </button>
                            </div>
                          </div>
                        </td>

                        {calendarDays.map((day) => {
                          const matchingRes = activeReservations.filter((r) => {
                            if (!matchesRoomRecord(room, r.roomId, r.roomNumber)) return false;
                            const rIn = normalizeIsoDate(r.checkInDate);
                            const rOutRaw = normalizeIsoDate(r.checkOutDate);
                            if (!rIn) return false;
                            const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
                            return rIn <= day && day < rOut;
                          });
                          const res = matchingRes[0];
                          const blk = blockedDates.find((b) => {
                            if (!matchesRoomRecord(room, b.roomId, b.roomNumber)) return false;
                            const bStart = normalizeIsoDate(b.startDate);
                            const bEndRaw = normalizeIsoDate(b.endDate);
                            if (!bStart) return false;
                            const bEnd = bEndRaw > bStart ? bEndRaw : addDaysIso(bStart, 1);
                            return bStart <= day && day < bEnd;
                          });

                          if (res) {
                            const hasConflict = matchingRes.length > 1 || Boolean(blk);
                            return (
                              <td
                                key={day}
                                className="p-1 border-r border-slate-100 last:border-r-0 align-middle"
                              >
                                <div className="space-y-1">
                                  {matchingRes.map((item) => {
                                    const isCheckedIn = item.status === 'checked_in';
                                    const isPending = item.status === 'pending';
                                    const isOta = isOtaBookingChannel(item.channel);
                                    const cellColor = hasConflict
                                      ? 'bg-rose-600 ring-1 ring-rose-900/50'
                                      : isCheckedIn
                                        ? 'bg-emerald-600'
                                        : isPending
                                          ? 'bg-violet-600'
                                          : isOta
                                            ? 'bg-orange-500'
                                            : 'bg-amber-500';
                                    const sourceTag = isOta
                                      ? ` · ${formatBookingSourceLabel(item.channel)}`
                                      : '';
                                    const conflictSuffix =
                                      matchingRes.length > 1
                                        ? ` [OVERLAP: ${matchingRes.map((m) => m.bookingRef).join(' & ')}]`
                                        : blk
                                          ? ` [OVERLAPS BLOCK: ${blk.category}]`
                                          : '';
                                    return (
                                      <button
                                        key={item.id}
                                        type="button"
                                        title={`${item.bookingRef} · ${item.guestName} (${item.status}${sourceTag}) · ${normalizeIsoDate(item.checkInDate)} → ${normalizeIsoDate(item.checkOutDate)}${conflictSuffix} — Click to open Folio`}
                                        onClick={() => onOpenReservationFolio?.(item.id, 'front_desk')}
                                        className={`w-full text-left px-1.5 ${
                                          matchingRes.length > 1 ? 'py-1' : 'py-2'
                                        } rounded text-[10px] font-semibold truncate text-white cursor-pointer transition-opacity hover:opacity-90 ${cellColor}`}
                                      >
                                        {item.guestName.split(' ')[0]}
                                        {isOta ? ` (${formatBookingSourceLabel(item.channel).slice(0, 3)})` : ''}
                                        {blk ? ' (!)' : ''}
                                      </button>
                                    );
                                  })}
                                </div>
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

                          if (room.occupancyStatus === 'out_of_order') {
                            return (
                              <td
                                key={day}
                                title={`${room.roomNumber} is currently Out of Order — unavailable`}
                                className="p-1 border-r border-slate-100 last:border-r-0 align-middle bg-slate-100/80"
                              >
                                <button
                                  type="button"
                                  disabled
                                  aria-disabled="true"
                                  className="w-full py-2 rounded bg-slate-200/80 text-slate-400 text-[10px] font-semibold truncate cursor-not-allowed"
                                >
                                  OOO
                                </button>
                              </td>
                            );
                          }

                          const isPastDay = day < todayIso;
                          if (isPastDay) {
                            return (
                              <td
                                key={day}
                                title={`${day} is in the past — unavailable for selection`}
                                className="p-1 border-r border-slate-100 last:border-r-0 align-middle bg-slate-100/70"
                              >
                                <button
                                  type="button"
                                  disabled
                                  aria-disabled="true"
                                  className="w-full py-2 rounded border border-slate-200 bg-slate-100 text-slate-300 text-[10px] font-medium cursor-not-allowed"
                                >
                                  —
                                </button>
                              </td>
                            );
                          }

                          const isInSearchRange = day >= availCheckIn && day < availCheckOut;
                          return (
                            <td
                              key={day}
                              className={`p-1 border-r border-slate-100 last:border-r-0 align-middle ${
                                isInSearchRange ? 'bg-emerald-50/40' : ''
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => openQuickAction(cellClickMode, room, day)}
                                title={
                                  cellClickMode === 'block'
                                    ? `Block ${room.roomNumber} starting ${day}`
                                    : `Open ${room.roomNumber} on ${day} — Click to reserve`
                                }
                                className={`w-full py-2 rounded border border-dashed text-[10px] font-medium transition-colors cursor-pointer ${
                                  cellClickMode === 'block'
                                    ? 'border-rose-200/80 hover:border-rose-600 hover:bg-rose-50 text-slate-400 hover:text-rose-700'
                                    : 'border-slate-200 hover:border-emerald-600 hover:bg-emerald-50 text-slate-400 hover:text-emerald-700'
                                }`}
                              >
                                {cellClickMode === 'block' ? '×' : '+'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCalendarStart(normalizeIsoDate(blk.startDate) || todayIso)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    View
                  </button>
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
              </div>
            ))}
            {filteredBlocks.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                No active or upcoming blocked dates match your filter.
              </p>
            )}
          </div>
        </div>

        {/* Active & Upcoming Calendar Reservations */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Current &amp; Future Reservations ({filteredReservations.length})
              </h3>
              <p className="text-xs text-slate-500">
                Chronological view of all in-house, confirmed, pending &amp; OTA stays
              </p>
            </div>
            <button
              type="button"
              onClick={() => openQuickAction('book')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Book Room</span>
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredReservations.map((res) => {
              const normIn = normalizeIsoDate(res.checkInDate);
              const isFutureStay = normIn > todayIso;
              const otaCheckInBlock = getCheckInDateRestriction(res, todayIso);
              const otaCancelBlock = getOtaCancellationRestriction(res);
              return (
              <div
                key={res.id}
                onClick={() => onOpenReservationFolio?.(res.id, 'front_desk')}
                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-emerald-50/40 cursor-pointer transition-colors"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {res.bookingRef}
                    </span>
                    <span className="font-mono-tabular text-slate-600">{res.roomNumber}</span>
                    <span
                      className={`font-semibold ${
                        res.status === 'checked_in'
                          ? 'text-emerald-700'
                          : res.status === 'pending'
                            ? 'text-violet-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {res.status === 'checked_in'
                        ? 'In-House'
                        : res.status === 'pending'
                          ? 'Pending Hold'
                          : isFutureStay
                            ? 'Future Confirmed'
                            : 'Confirmed'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 truncate">{res.guestName}</p>
                  <p className="font-mono-tabular text-[11px] text-slate-500">
                    {normIn} → {normalizeIsoDate(res.checkOutDate)} ({res.nights}n) ·{' '}
                    {formatBookingSourceLabel(res.channel)}
                  </p>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setCalendarStart(normIn || todayIso)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Jump
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenReservationFolio?.(res.id, 'front_desk')}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Open Folio
                  </button>
                  {(res.status === 'confirmed' || res.status === 'pending') &&
                    !otaCheckInBlock.restricted && (
                      <button
                        type="button"
                        disabled={busyId === res.id}
                        onClick={() => setCheckInTarget(res)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                      >
                        Check In
                      </button>
                    )}
                  {(res.status === 'confirmed' || res.status === 'pending') &&
                    otaCheckInBlock.restricted && (
                      <span
                        title={otaCheckInBlock.message}
                        className="px-2.5 py-1.5 text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-800 rounded-lg"
                      >
                        Check-in {otaCheckInBlock.checkInIso}
                      </span>
                    )}
                  {(res.status === 'confirmed' || res.status === 'pending') &&
                    !otaCancelBlock.restricted && (
                      <button
                        type="button"
                        disabled={busyId === res.id}
                        onClick={async () => {
                          setBusyId(res.id);
                          try {
                            const targetRoom = rooms.find((rm) => rm.id === res.roomId);
                            await transitionReservationStatus({
                              property,
                              reservation: res,
                              room: targetRoom,
                              nextStatus: 'cancelled',
                              actorRole,
                            });
                            onNotify(`Cancelled reservation ${res.bookingRef}`);
                          } catch (err) {
                            setCalendarNotice(
                              err instanceof Error
                                ? err.message
                                : `Unable to cancel ${res.bookingRef}.`
                            );
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  {(res.status === 'confirmed' || res.status === 'pending') &&
                    otaCancelBlock.restricted && (
                      <button
                        type="button"
                        title={otaCancelBlock.message}
                        onClick={() => setCalendarNotice(otaCancelBlock.message)}
                        className="px-2.5 py-1.5 text-[11px] font-medium text-amber-800 border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 rounded-lg cursor-pointer"
                      >
                        Cancel via {otaCancelBlock.platformLabel}
                      </button>
                    )}
                </div>
              </div>
              );
            })}
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
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
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
                {/* Block Scope Switcher: Single Room vs Multi-Room / Property-Wide Hold */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>Block Scope</span>
                  </div>
                  <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setBlockScope('single');
                        setConflictError(null);
                      }}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        blockScope === 'single'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Single Room
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBlockScope('multi');
                        setConflictError(null);
                        const openIds = sortedRooms
                          .filter((r) => isRoomAvailableInRange(r.id, blockStartDate, blockEndDate))
                          .map((r) => r.id);
                        setSelectedBulkRoomIds((prev) => (prev.length > 0 ? prev : openIds));
                      }}
                      className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        blockScope === 'multi'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Multiple / All Rooms
                    </button>
                  </div>
                </div>

                {blockScope === 'single' ? (
                  <>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Room</label>
                      <select
                        value={targetRoomId}
                        onChange={(e) => {
                          setTargetRoomId(e.target.value);
                          setConflictError(null);
                        }}
                        className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                      >
                        {sortedRooms.map((r) => {
                          const avail = checkRoomDateRangeAvailability({
                            room: r,
                            checkInDate: blockStartDate,
                            checkOutDate: blockEndDate,
                            reservations,
                            blockedDates,
                          });
                          const tag = avail.available
                            ? 'Available'
                            : avail.status === 'out_of_order'
                              ? 'Out of Order'
                              : avail.status === 'blocked'
                                ? 'Blocked'
                                : 'Reserved';
                          return (
                            <option key={r.id} value={r.id}>
                              {r.roomNumber} · {r.roomType} ({tag})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <AvailabilityDateRangePicker
                      checkInDate={blockStartDate}
                      checkOutDate={blockEndDate}
                      onChangeDates={(nextStart, nextEnd) => {
                        setBlockStartDate(nextStart);
                        setBlockEndDate(nextEnd);
                        setConflictError(null);
                      }}
                      room={rooms.find((r) => r.id === targetRoomId)}
                      rooms={sortedRooms}
                      reservations={reservations}
                      blockedDates={blockedDates}
                      onSelectAlternativeRoom={(alt) => {
                        setTargetRoomId(alt.id);
                        setConflictError(null);
                      }}
                      checkInLabel="Block Start Date *"
                      checkOutLabel="Block End Date (Release) *"
                      mode="block"
                      compact
                    />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Block Start Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={blockStartDate}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            if (!nextStart) return;
                            setBlockStartDate(nextStart);
                            if (blockEndDate <= nextStart) {
                              setBlockEndDate(addDaysIso(nextStart, 1));
                            }
                            setConflictError(null);
                          }}
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Block End Date (Release) *
                        </label>
                        <input
                          type="date"
                          required
                          min={addDaysIso(blockStartDate, 1)}
                          value={blockEndDate}
                          onChange={(e) => {
                            const nextEnd = e.target.value;
                            if (!nextEnd) return;
                            setBlockEndDate(
                              nextEnd <= blockStartDate ? addDaysIso(blockStartDate, 1) : nextEnd
                            );
                            setConflictError(null);
                          }}
                          className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular"
                        />
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="font-semibold text-slate-700">
                          Select Rooms ({selectedBulkRoomIds.length} selected)
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const openIds = sortedRooms
                                .filter((r) =>
                                  isRoomAvailableInRange(r.id, blockStartDate, blockEndDate)
                                )
                                .map((r) => r.id);
                              setSelectedBulkRoomIds(openIds);
                              setConflictError(null);
                            }}
                            className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Select All Available
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBulkRoomIds([]);
                              setConflictError(null);
                            }}
                            className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                        {sortedRooms.map((r) => {
                          const avail = checkRoomDateRangeAvailability({
                            room: r,
                            checkInDate: blockStartDate,
                            checkOutDate: blockEndDate,
                            reservations,
                            blockedDates,
                          });
                          const checked = selectedBulkRoomIds.includes(r.id);
                          return (
                            <label
                              key={r.id}
                              className={`px-3 py-2 flex items-center justify-between gap-2 ${
                                avail.available
                                  ? 'hover:bg-slate-50 cursor-pointer'
                                  : 'bg-slate-50/70 opacity-65 cursor-not-allowed'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  disabled={!avail.available}
                                  checked={checked && avail.available}
                                  onChange={() => {
                                    if (!avail.available) return;
                                    setSelectedBulkRoomIds((prev) =>
                                      prev.includes(r.id)
                                        ? prev.filter((id) => id !== r.id)
                                        : [...prev, r.id]
                                    );
                                    setConflictError(null);
                                  }}
                                  className="rounded border-slate-300 text-rose-700"
                                />
                                <span className="font-mono-tabular font-bold text-slate-900">
                                  {r.roomNumber}
                                </span>
                                <span className="text-slate-600 truncate">{r.roomType}</span>
                              </div>
                              <span
                                className={`text-[11px] font-semibold shrink-0 ${
                                  avail.available
                                    ? 'text-emerald-700'
                                    : avail.status === 'blocked'
                                      ? 'text-rose-700'
                                      : 'text-amber-700'
                                }`}
                              >
                                {avail.available
                                  ? 'Available'
                                  : avail.status === 'out_of_order'
                                    ? 'Out of Order'
                                    : avail.status === 'blocked'
                                      ? 'Already Blocked'
                                      : avail.conflictReservation &&
                                          isOtaBookingChannel(avail.conflictReservation.channel)
                                        ? `${formatBookingSourceLabel(avail.conflictReservation.channel)} Booked`
                                        : 'Reserved'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Block Category</label>
                  <select
                    value={blockCategory}
                    onChange={(e) =>
                      setBlockCategory(e.target.value as BlockedDateRecord['category'])
                    }
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
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
                    className="w-full h-10 border border-slate-200 rounded-lg px-3"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode('none')}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      busyId === 'block' ||
                      (blockScope === 'single'
                        ? Boolean(describeRoomConflict(targetRoomId, blockStartDate, blockEndDate))
                        : selectedBulkRoomIds.filter((id) =>
                            isRoomAvailableInRange(id, blockStartDate, blockEndDate)
                          ).length === 0)
                    }
                    className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === 'block'
                      ? 'Blocking...'
                      : blockScope === 'multi'
                        ? `Block ${
                            selectedBulkRoomIds.filter((id) =>
                              isRoomAvailableInRange(id, blockStartDate, blockEndDate)
                            ).length
                          } Room(s)`
                        : 'Confirm Date Block'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateQuickBooking} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Room</label>
                  <select
                    value={targetRoomId}
                    onChange={(e) => {
                      const rm = rooms.find((r) => r.id === e.target.value);
                      setTargetRoomId(e.target.value);
                      setConflictError(null);
                      if (rm) setDepositNgn(rm.nightlyRateNgn);
                    }}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white"
                  >
                    {sortedRooms.map((r) => {
                      const avail = checkRoomDateRangeAvailability({
                        room: r,
                        checkInDate: bookCheckIn,
                        checkOutDate: bookCheckOut,
                        reservations,
                        blockedDates,
                      });
                      const tag = formatRoomAvailabilityTag(avail);
                      return (
                        <option key={r.id} value={r.id} disabled={!avail.available}>
                          {r.roomNumber} · {r.roomType} ({formatNgn(r.nightlyRateNgn)}/nt) — {tag}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <AvailabilityDateRangePicker
                  checkInDate={bookCheckIn}
                  checkOutDate={bookCheckOut}
                  onChangeDates={(nextIn, nextOut) => {
                    setBookCheckIn(nextIn);
                    setBookCheckOut(nextOut);
                    setConflictError(null);
                    const currentRm = rooms.find((r) => r.id === targetRoomId);
                    if (
                      currentRm &&
                      !checkRoomDateRangeAvailability({
                        room: currentRm,
                        checkInDate: nextIn,
                        checkOutDate: nextOut,
                        reservations,
                        blockedDates,
                      }).available
                    ) {
                      const fallbackOpen = sortedRooms.find(
                        (cand) =>
                          cand.roomType === currentRm.roomType &&
                          checkRoomDateRangeAvailability({
                            room: cand,
                            checkInDate: nextIn,
                            checkOutDate: nextOut,
                            reservations,
                            blockedDates,
                          }).available
                      );
                      if (fallbackOpen) {
                        setTargetRoomId(fallbackOpen.id);
                        setDepositNgn(fallbackOpen.nightlyRateNgn);
                      }
                    }
                  }}
                  room={rooms.find((r) => r.id === targetRoomId)}
                  rooms={sortedRooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  onSelectAlternativeRoom={(alt) => {
                    setTargetRoomId(alt.id);
                    setDepositNgn(alt.nightlyRateNgn);
                    setConflictError(null);
                  }}
                  checkInLabel="Check-In Date *"
                  checkOutLabel="Check-Out Date *"
                  compact
                />

                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-3">
                  <p className="font-display text-[11px] font-bold uppercase tracking-wider text-[#061539]">
                    Guest Details &amp; Address
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Guest First Name *</label>
                      <input
                        type="text"
                        required
                        value={guestFirstName}
                        onChange={(e) => setGuestFirstName(e.target.value)}
                        placeholder="First name"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Guest Last Name *</label>
                      <input
                        type="text"
                        required
                        value={guestLastName}
                        onChange={(e) => setGuestLastName(e.target.value)}
                        placeholder="Last name"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone *</label>
                      <input
                        type="text"
                        required
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="+234 800 000 0000"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 font-mono-tabular"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Guest Email</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="guest@example.com"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={guestAddress}
                        onChange={(e) => setGuestAddress(e.target.value)}
                        placeholder="House / Street / Estate"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={guestCity}
                        onChange={(e) => setGuestCity(e.target.value)}
                        placeholder="e.g. Enugu"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">State</label>
                      <input
                        type="text"
                        value={guestState}
                        onChange={(e) => setGuestState(e.target.value)}
                        placeholder="State"
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Country</label>
                      <CountrySelect
                        value={guestCountry}
                        onChange={setGuestCountry}
                        placeholder="Search country..."
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Booking Source</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as ReservationRecord['channel'])}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5 bg-white"
                    >
                      {PRIMARY_BOOKING_SOURCES.map((src) => (
                        <option key={src.value} value={src.value}>
                          {src.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payment Amount (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={depositNgn}
                      onChange={(e) => setDepositNgn(Number(e.target.value))}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Adults</label>
                    <input
                      type="number"
                      min={1}
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Children</label>
                    <input
                      type="number"
                      min={0}
                      value={childrenCount}
                      onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value)))}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5 font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(e.target.value as ReservationRecord['paymentMethod'])
                      }
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5 bg-white"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card POS">Card POS</option>
                      <option value="Cash NGN">Cash NGN</option>
                      <option value="Online Gateway">Online Gateway</option>
                      <option value="Corporate Invoice">Corporate Invoice</option>
                      {isOtaBookingChannel(channel) && (
                        <option value="OTA Platform Payout">OTA Platform Payout</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payment Status</label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => {
                        const next = e.target.value as PaymentStatusLabel;
                        setPaymentStatus(next);
                        if (next === 'Unpaid') setDepositNgn(0);
                      }}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2.5 bg-white font-semibold"
                    >
                      <option value="Paid">Paid</option>
                      <option value="Partial">Partial</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  </div>
                  <div className="h-10 inline-flex items-center gap-2 px-3 rounded-lg border border-emerald-200 bg-emerald-50/70 text-[11px] font-medium text-emerald-900">
                    <span>
                      Check-in opens on arrival date ({normalizeIsoDate(bookCheckIn)})
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2.5">
                  <label className="inline-flex items-center gap-2 font-semibold text-amber-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cautionEnabled}
                      onChange={(e) => setCautionEnabled(e.target.checked)}
                      className="rounded border-amber-400 text-emerald-600"
                    />
                    <span>Optional Refundable Caution / Deposit Fee</span>
                  </label>
                  {cautionEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Caution Fee (₦)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={cautionFeeNgn}
                          onChange={(e) => setCautionFeeNgn(Math.max(0, Number(e.target.value)))}
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 font-mono-tabular"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Amount Collected (₦)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={cautionCollectedNgn}
                          onChange={(e) =>
                            setCautionCollectedNgn(Math.max(0, Number(e.target.value)))
                          }
                          className="w-full h-10 border border-slate-200 bg-white rounded-lg px-2.5 font-mono-tabular"
                        />
                      </div>
                      <label className="h-10 inline-flex items-center gap-2 px-3 rounded-lg bg-white border border-amber-300 font-medium text-amber-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cautionRefunded}
                          onChange={(e) => setCautionRefunded(e.target.checked)}
                          className="rounded border-amber-400 text-emerald-600"
                        />
                        <span>Refunded</span>
                      </label>
                    </div>
                  )}
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
                    disabled={
                      busyId === 'book' ||
                      Boolean(describeRoomConflict(targetRoomId, bookCheckIn, bookCheckOut))
                    }
                    className="px-4 py-2 bg-[#0b6b3a] hover:bg-[#09552e] text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === 'book'
                      ? 'Saving...'
                      : `Confirm Reservation (${diffNights(bookCheckIn, bookCheckOut)} nights)`}
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
          reservations={reservations}
          blockedDates={blockedDates}
          guest={
            guests.find((g) => g.id === checkInTarget.guestId) ||
            guests.find((g) => g.fullName.toLowerCase() === checkInTarget.guestName.toLowerCase())
          }
          canCompleteCheckIn={canCompleteCheckIn ?? true}
          actorRole={actorRole}
          onClose={() => setCheckInTarget(null)}
          onCompleted={(info) => {
            onNotify(`Verified & checked in ${info.guestName} into ${info.roomNumber}`);
            onGuestCheckedIn?.(info);
          }}
        />
      )}

      {receiptTarget && (
        <PaymentReceiptModal
          property={property}
          reservation={receiptTarget.reservation}
          mode="reservation_payment"
          amountJustPaidNgn={receiptTarget.amountPaid}
          onClose={() => setReceiptTarget(null)}
          onOpenFolio={(resId) => onOpenReservationFolio?.(resId, 'front_desk')}
        />
      )}
    </div>
  );
};
