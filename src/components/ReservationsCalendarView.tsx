import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BedDouble,
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers,
  LogOut,
  Plus,
  Printer,
  RefreshCw,
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
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import {
  BlockedDateRecord,
  formatBookingSourceLabel,
  formatNgn,
  getCheckInDateRestriction,
  getOtaCancellationRestriction,
  GuestRecord,
  isOtaBookingChannel,
  OtaIntegrationRecord,
  PaymentStatusLabel,
  PRIMARY_BOOKING_SOURCES,
  PropertyRecord,
  ReservationRecord,
  RoomRecord,
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
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

function formatShortMonthDay(isoDate: string): string {
  const norm = normalizeIsoDate(isoDate);
  if (!norm) return isoDate;
  const [y, m, d] = norm.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatRangeHeading(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const sDate = new Date(Date.UTC(sy, (sm || 1) - 1, sd || 1));
  const eDate = new Date(Date.UTC(ey, (em || 1) - 1, ed || 1));
  const sPart = sDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ePart = eDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${sPart} – ${ePart}`;
}

type TimelineSegment =
  | {
      kind: 'reservation';
      key: string;
      span: number;
      reservation: ReservationRecord;
      hasConflict: boolean;
      extraConflictCount: number;
    }
  | {
      kind: 'block';
      key: string;
      span: number;
      block: BlockedDateRecord;
    }
  | {
      kind: 'ooo';
      key: string;
      span: number;
    }
  | {
      kind: 'past';
      key: string;
      day: string;
      span: 1;
    }
  | {
      kind: 'open';
      key: string;
      day: string;
      span: 1;
    };

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
  const todayIso = getLocalIsoDate();
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [calendarStart, setCalendarStart] = useState<string>(todayIso);
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('ALL');
  const [onlyShowAvailable, setOnlyShowAvailable] = useState(false);
  const [syncingOta, setSyncingOta] = useState(false);

  const [receiptTarget, setReceiptTarget] = useState<{
    reservation: ReservationRecord;
    amountPaid: number;
  } | null>(null);

  // Action modals
  const [modalMode, setModalMode] = useState<'none' | 'block' | 'book'>('none');
  const [targetRoomId, setTargetRoomId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);

  // Block Dates form
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
  const [guestPhone, setGuestPhone] = useState('+234 ');
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
  const [quickIdType, setQuickIdType] = useState<GuestRecord['idType']>('NIN');
  const [quickIdNumber, setQuickIdNumber] = useState('');
  const [checkInTarget, setCheckInTarget] = useState<ReservationRecord | null>(null);

  const sortedRooms = useMemo(() => sortRoomsByNumber(rooms), [rooms]);
  const gridDaysCount = viewMode === 'week' ? 7 : 30;

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

  // KPI metrics matching the 5-card clean summary bar
  const kpiStats = useMemo(() => {
    const totalRooms = sortedRooms.length;
    let occupiedRooms = 0;
    let availableRooms = 0;

    sortedRooms.forEach((room) => {
      if (room.occupancyStatus === 'out_of_order') return;
      const checkToday = checkRoomDateRangeAvailability({
        room,
        checkInDate: todayIso,
        checkOutDate: tomorrowIso,
        reservations,
        blockedDates,
      });
      if (checkToday.available) {
        availableRooms += 1;
      } else if (checkToday.conflictReservation) {
        occupiedRooms += 1;
      }
    });

    const checkInsToday = activeReservations.filter(
      (r) => normalizeIsoDate(r.checkInDate) === todayIso
    ).length;

    const checkOutsToday = activeReservations.filter(
      (r) => normalizeIsoDate(r.checkOutDate) === todayIso
    ).length;

    const occupiedPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const availablePct = totalRooms > 0 ? Math.round((availableRooms / totalRooms) * 100) : 0;

    return {
      totalRooms,
      occupiedRooms,
      occupiedPct,
      availableRooms,
      availablePct,
      checkInsToday,
      checkOutsToday,
    };
  }, [sortedRooms, todayIso, tomorrowIso, reservations, blockedDates, activeReservations]);

  const filteredRooms = useMemo(() => {
    return sortedRooms.filter((room) => {
      if (roomTypeFilter !== 'ALL' && room.roomType !== roomTypeFilter) return false;
      if (onlyShowAvailable && !isRoomAvailableInRange(room.id, todayIso, tomorrowIso)) {
        return false;
      }
      return true;
    });
  }, [sortedRooms, roomTypeFilter, onlyShowAvailable, todayIso, tomorrowIso, reservations, blockedDates]);

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

      for (let i = 0; i < roomRes.length; i += 1) {
        const a = roomRes[i];
        for (let j = i + 1; j < roomRes.length; j += 1) {
          const b = roomRes[j];
          const aIn = normalizeIsoDate(a.checkInDate);
          const aOut =
            normalizeIsoDate(a.checkOutDate) > aIn
              ? normalizeIsoDate(a.checkOutDate)
              : addDaysIso(aIn, 1);
          const bIn = normalizeIsoDate(b.checkInDate);
          const bOut =
            normalizeIsoDate(b.checkOutDate) > bIn
              ? normalizeIsoDate(b.checkOutDate)
              : addDaysIso(bIn, 1);
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
      }
    });

    return conflicts;
  }, [sortedRooms, activeReservations, todayIso]);

  const upcomingReservations = useMemo(() => {
    return activeReservations
      .filter((r) => {
        const inIso = normalizeIsoDate(r.checkInDate);
        const outIso = normalizeIsoDate(r.checkOutDate);
        const effOut = outIso > inIso ? outIso : addDaysIso(inIso, 1);
        return r.status === 'checked_in' || effOut >= todayIso;
      })
      .sort((a, b) =>
        normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
      );
  }, [activeReservations, todayIso]);

  const activeBlocks = useMemo(() => {
    return blockedDates
      .filter((b) => {
        const bStart = normalizeIsoDate(b.startDate);
        const bEnd = normalizeIsoDate(b.endDate);
        const effEnd = bEnd > bStart ? bEnd : addDaysIso(bStart, 1);
        return effEnd >= todayIso;
      })
      .sort((a, b) =>
        normalizeIsoDate(a.startDate).localeCompare(normalizeIsoDate(b.startDate))
      );
  }, [blockedDates, todayIso]);

  const buildRowSegments = (room: RoomRecord): TimelineSegment[] => {
    const segments: TimelineSegment[] = [];
    const totalCols = calendarDays.length;

    const getDayState = (day: string) => {
      const matchingRes = activeReservations.filter((r) => {
        if (!matchesRoomRecord(room, r.roomId, r.roomNumber)) return false;
        const rIn = normalizeIsoDate(r.checkInDate);
        const rOutRaw = normalizeIsoDate(r.checkOutDate);
        if (!rIn) return false;
        const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
        return rIn <= day && day < rOut;
      });
      const blk = blockedDates.find((b) => {
        if (!matchesRoomRecord(room, b.roomId, b.roomNumber)) return false;
        const bStart = normalizeIsoDate(b.startDate);
        const bEndRaw = normalizeIsoDate(b.endDate);
        if (!bStart) return false;
        const bEnd = bEndRaw > bStart ? bEndRaw : addDaysIso(bStart, 1);
        return bStart <= day && day < bEnd;
      });
      return { matchingRes, blk };
    };

    let idx = 0;
    while (idx < totalCols) {
      const day = calendarDays[idx];
      const { matchingRes, blk } = getDayState(day);

      if (matchingRes.length > 0) {
        const lead = matchingRes[0];
        let span = 1;
        let hasConflict = matchingRes.length > 1 || Boolean(blk);
        let extraConflictCount = Math.max(0, matchingRes.length - 1);

        while (idx + span < totalCols) {
          const nextState = getDayState(calendarDays[idx + span]);
          if (nextState.matchingRes.length > 0 && nextState.matchingRes[0].id === lead.id) {
            if (nextState.matchingRes.length > 1 || Boolean(nextState.blk)) {
              hasConflict = true;
              extraConflictCount = Math.max(extraConflictCount, nextState.matchingRes.length - 1);
            }
            span += 1;
          } else {
            break;
          }
        }

        segments.push({
          kind: 'reservation',
          key: `res-${lead.id}-${day}`,
          span,
          reservation: lead,
          hasConflict,
          extraConflictCount,
        });
        idx += span;
        continue;
      }

      if (blk) {
        let span = 1;
        while (idx + span < totalCols) {
          const nextState = getDayState(calendarDays[idx + span]);
          if (nextState.matchingRes.length === 0 && nextState.blk?.id === blk.id) {
            span += 1;
          } else {
            break;
          }
        }
        segments.push({
          kind: 'block',
          key: `blk-${blk.id}-${day}`,
          span,
          block: blk,
        });
        idx += span;
        continue;
      }

      if (room.occupancyStatus === 'out_of_order') {
        let span = 1;
        while (idx + span < totalCols) {
          const nextState = getDayState(calendarDays[idx + span]);
          if (nextState.matchingRes.length === 0 && !nextState.blk) {
            span += 1;
          } else {
            break;
          }
        }
        segments.push({
          kind: 'ooo',
          key: `ooo-${room.id}-${day}`,
          span,
        });
        idx += span;
        continue;
      }

      if (day < todayIso) {
        segments.push({ kind: 'past', key: `past-${room.id}-${day}`, day, span: 1 });
      } else {
        segments.push({ kind: 'open', key: `open-${room.id}-${day}`, day, span: 1 });
      }
      idx += 1;
    }

    return segments;
  };

  const getReservationBarStyle = (res: ReservationRecord, hasConflict: boolean): string => {
    if (hasConflict) {
      return 'bg-rose-600 hover:bg-rose-700 text-white ring-1 ring-rose-900/40';
    }
    if (res.status === 'checked_in') {
      return 'bg-[#1677f2] hover:bg-[#1164d1] text-white';
    }
    if (isOtaBookingChannel(res.channel)) {
      return 'bg-[#f8b36b] hover:bg-[#f5a452] text-slate-900';
    }
    if (res.status === 'pending' || res.channel === 'Walk-in' || res.channel === 'Direct Walk-In') {
      return 'bg-[#c4a7f5] hover:bg-[#b490f2] text-slate-900';
    }
    return 'bg-[#25b462] hover:bg-[#1f9e55] text-white';
  };

  const openQuickAction = (mode: 'block' | 'book', room?: RoomRecord, dayIso?: string) => {
    const chosenRoom =
      room ||
      sortedRooms.find((r) => r.occupancyStatus !== 'out_of_order') ||
      sortedRooms[0];
    if (!chosenRoom) return;
    setConflictError(null);
    setCalendarNotice(null);
    setTargetRoomId(chosenRoom.id);
    const sDate = dayIso && dayIso >= todayIso ? dayIso : todayIso;
    const eDate = addDaysIso(sDate, 1);

    if (mode === 'block') {
      setBlockScope('single');
      setSelectedBulkRoomIds([chosenRoom.id]);
      setBlockStartDate(sDate);
      setBlockEndDate(eDate);
      setBlockReason('');
      setModalMode('block');
    } else {
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
      setQuickIdNumber('');
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
          getUserFriendlyErrorMessage(
            err,
            'Unable to save blocked dates right now. Please try again.',
            'Calendar:BlockMultiple'
          )
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
        getUserFriendlyErrorMessage(
          err,
          'Unable to save blocked dates right now. Please try again.',
          'Calendar:BlockRoom'
        )
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
    } catch (err) {
      setConflictError(
        getUserFriendlyErrorMessage(
          err,
          'Unable to save reservation. Please try again.',
          'Calendar:QuickBooking'
        )
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
        getUserFriendlyErrorMessage(
          err,
          'Unable to remove date block right now. Please try again.',
          'Calendar:Unblock'
        )
      );
    } finally {
      setBusyId(null);
    }
  };

  const connectedIcalChannels = useMemo(
    () => otaChannels.filter((ch) => ch.connected && Boolean(ch.icalImportUrl?.trim())),
    [otaChannels]
  );

  const handleRefreshCalendar = async () => {
    if (syncingOta) return;
    if (connectedIcalChannels.length === 0) {
      onNotify('Reservation calendar is up to date.');
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
          `Refreshed ${connectedIcalChannels.length - failedNames.length}/${connectedIcalChannels.length} channels (${totalCreated} new, ${totalUpdated} updated).`
        );
      } else {
        onNotify(
          `Calendar refreshed (${totalEvents} channel events checked · ${totalCreated} new, ${totalUpdated} updated).`
        );
      }
    } finally {
      setSyncingOta(false);
    }
  };

  const rangeStepDays = viewMode === 'week' ? 7 : 30;
  const rangeEndIso = calendarDays[calendarDays.length - 1] || calendarStart;
  const propertySubtitle = [property.name, property.city].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#061f4d]">
          Reservation Calendar
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{propertySubtitle}</p>
      </div>

      {/* Clean Single-Row Calendar Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Week / Month / Today */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`h-10 inline-flex items-center gap-2 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'week'
                ? 'bg-[#0a367a] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Week</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`h-10 inline-flex items-center gap-2 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'month'
                ? 'bg-[#0a367a] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Month</span>
          </button>
          <button
            type="button"
            onClick={() => setCalendarStart(todayIso)}
            className="h-10 inline-flex items-center gap-2 px-4 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-[#0a367a]" />
            <span>Today</span>
          </button>
        </div>

        {/* Center: Date Range Switcher */}
        <div className="inline-flex items-center h-10 bg-white border border-slate-200 rounded-full px-2 gap-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setCalendarStart(addDaysIso(calendarStart, -rangeStepDays))}
            aria-label="Previous date range"
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-[#0a367a] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-display text-sm font-bold text-[#061f4d] px-2 whitespace-nowrap">
            {formatRangeHeading(calendarStart, rangeEndIso)}
          </span>
          <button
            type="button"
            onClick={() => setCalendarStart(addDaysIso(calendarStart, rangeStepDays))}
            aria-label="Next date range"
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-[#0a367a] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Room Type Filter + Block Dates + New Reservation */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value)}
            aria-label="Filter by room type"
            className="h-10 bg-white border border-slate-200 rounded-lg px-3.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#0a367a]"
          >
            <option value="ALL">All Room Types</option>
            {uniqueRoomTypes.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => openQuickAction('block')}
            className="h-10 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Ban className="w-3.5 h-3.5 text-slate-600" />
            <span>Block Dates</span>
          </button>

          <button
            type="button"
            onClick={() => openQuickAction('book')}
            className="h-10 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Reservation</span>
          </button>
        </div>
      </div>

      {/* 5-Column KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#1677f2] flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Total Rooms</p>
            <p className="font-mono-tabular text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {kpiStats.totalRooms}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Occupied</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono-tabular text-2xl font-extrabold text-[#061f4d] leading-tight">
                {kpiStats.occupiedRooms}
              </span>
              <span className="font-mono-tabular text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                {kpiStats.occupiedPct}%
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOnlyShowAvailable((v) => !v)}
          className={`text-left bg-white border rounded-xl p-4 flex items-center gap-3.5 transition-colors cursor-pointer ${
            onlyShowAvailable
              ? 'border-[#0a367a] bg-blue-50/40'
              : 'border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#0a367a] flex items-center justify-center shrink-0">
            <BedDouble className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Available</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono-tabular text-2xl font-extrabold text-[#061f4d] leading-tight">
                {kpiStats.availableRooms}
              </span>
              <span className="font-mono-tabular text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#0a367a]">
                {kpiStats.availablePct}%
              </span>
            </div>
          </div>
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Check-Ins Today</p>
            <p className="font-mono-tabular text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {kpiStats.checkInsToday}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 col-span-2 md:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Check-Outs Today</p>
            <p className="font-mono-tabular text-2xl font-extrabold text-[#061f4d] leading-tight mt-0.5">
              {kpiStats.checkOutsToday}
            </p>
          </div>
        </div>
      </div>

      {calendarNotice && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 flex items-center justify-between gap-3"
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
          className="bg-rose-50 border border-rose-300 rounded-xl px-4 py-3 text-xs text-rose-950 space-y-2"
        >
          <div className="flex items-center gap-2 font-bold text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {calendarConflicts.length} Calendar Overlap Conflict
              {calendarConflicts.length === 1 ? '' : 's'} Detected
            </span>
          </div>
          <div className="space-y-1.5">
            {calendarConflicts.slice(0, 4).map((conflict) => (
              <div
                key={conflict.id}
                className="flex flex-wrap items-center justify-between gap-2 bg-white border border-rose-200 rounded-lg px-3 py-1.5"
              >
                <span className="text-[11px] font-medium text-rose-900">{conflict.summary}</span>
                <button
                  type="button"
                  onClick={() => setCalendarStart(conflict.startDate)}
                  className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-semibold cursor-pointer"
                >
                  Jump to {conflict.startDate}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Clean Room Timeline Grid Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table
            className={`w-full text-left border-collapse ${
              viewMode === 'month' ? 'min-w-[2280px]' : 'min-w-[860px]'
            }`}
          >
            <thead>
              <tr className="bg-[#0d2247] text-white text-xs font-bold">
                <th className="py-3.5 px-4 w-28 sticky left-0 bg-[#0d2247] z-20 border-r border-white/15">
                  Room
                </th>
                <th className="py-3.5 px-4 w-40 sticky left-28 bg-[#0d2247] z-20 border-r border-white/15">
                  Room Type
                </th>
                {calendarDays.map((day) => {
                  const hdr = formatDayHeader(day);
                  const isToday = day === todayIso;
                  return (
                    <th
                      key={day}
                      className={`py-2.5 px-2 text-center border-r border-white/10 last:border-r-0 ${
                        isToday ? 'bg-[#154596]' : ''
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-blue-100">{hdr.weekday}</div>
                      <div className="text-xs font-bold text-white mt-0.5 whitespace-nowrap">
                        {hdr.label}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-xs">
              {/* Optional Unassigned Reservations Row */}
              {unassignedActiveReservations.length > 0 && (
                <tr className="bg-violet-50/50">
                  <td
                    colSpan={2}
                    className="py-3 px-4 sticky left-0 bg-violet-50 z-10 border-r border-slate-200"
                  >
                    <p className="font-bold text-violet-950">Unassigned</p>
                    <p className="text-[11px] text-violet-700">
                      {unassignedActiveReservations.length} awaiting room
                    </p>
                  </td>
                  {calendarDays.map((day) => {
                    const dayItems = unassignedActiveReservations.filter((r) => {
                      const rIn = normalizeIsoDate(r.checkInDate);
                      const rOutRaw = normalizeIsoDate(r.checkOutDate);
                      if (!rIn) return false;
                      const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
                      return rIn <= day && day < rOut;
                    });
                    if (dayItems.length === 0) {
                      return (
                        <td
                          key={day}
                          className="p-1.5 border-r border-slate-100 last:border-r-0"
                        />
                      );
                    }
                    const lead = dayItems[0];
                    return (
                      <td
                        key={day}
                        className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenReservationFolio?.(lead.id, 'front_desk')}
                          className="w-full text-left px-2.5 py-2 rounded-lg bg-[#c4a7f5] hover:bg-[#b490f2] text-slate-900 font-semibold truncate cursor-pointer"
                        >
                          {lead.guestName}
                          {dayItems.length > 1 ? ` +${dayItems.length - 1}` : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )}

              {filteredRooms.map((room) => {
                const isOoo = room.occupancyStatus === 'out_of_order';
                const segments = buildRowSegments(room);

                return (
                  <tr key={room.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Room Column */}
                    <td className="py-3.5 px-4 sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isOoo ? 'bg-slate-400' : 'bg-emerald-500'
                          }`}
                        />
                        <span className="font-mono-tabular text-sm font-bold text-[#061f4d]">
                          {room.roomNumber}
                        </span>
                      </div>
                    </td>

                    {/* Room Type Column */}
                    <td className="py-3.5 px-4 sticky left-28 bg-white z-10 border-r border-slate-200 text-slate-600 font-medium">
                      <span className="block truncate max-w-[140px]" title={room.roomType}>
                        {room.roomType}
                      </span>
                    </td>

                    {/* Spanning Timeline Segments */}
                    {segments.map((seg) => {
                      if (seg.kind === 'reservation') {
                        const res = seg.reservation;
                        const inShort = formatShortMonthDay(res.checkInDate);
                        const outShort = formatShortMonthDay(res.checkOutDate);
                        const barStyle = getReservationBarStyle(res, seg.hasConflict);
                        const sourceLabel = isOtaBookingChannel(res.channel)
                          ? ` · ${formatBookingSourceLabel(res.channel)}`
                          : '';

                        return (
                          <td
                            key={seg.key}
                            colSpan={seg.span}
                            className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenReservationFolio?.(res.id, 'front_desk')}
                              title={`${res.bookingRef} · ${res.guestName}${sourceLabel} · Check-in: ${inShort} · Check-out: ${outShort}`}
                              className={`w-full text-left px-3 py-2 rounded-lg transition-colors shadow-2xs cursor-pointer ${barStyle}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs truncate">
                                  {res.guestName}
                                  {seg.extraConflictCount > 0
                                    ? ` (+${seg.extraConflictCount} overlap)`
                                    : ''}
                                </span>
                                {isOtaBookingChannel(res.channel) && (
                                  <span className="text-[10px] font-bold opacity-85 shrink-0">
                                    {formatBookingSourceLabel(res.channel)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] opacity-90 truncate mt-0.5">
                                Check-in: {inShort} · Check-out: {outShort}
                              </div>
                            </button>
                          </td>
                        );
                      }

                      if (seg.kind === 'block') {
                        const blk = seg.block;
                        return (
                          <td
                            key={seg.key}
                            colSpan={seg.span}
                            className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                          >
                            <button
                              type="button"
                              disabled={busyId === blk.id}
                              onClick={() => handleUnblock(blk)}
                              title={`${blk.category}: ${blk.reason} (${blk.startDate} → ${blk.endDate}) — Click to remove block`}
                              className="w-full py-3 px-3 rounded-lg bg-[repeating-linear-gradient(-45deg,#f1f5f9,#f1f5f9_8px,#e2e8f0_8px,#e2e8f0_16px)] border border-slate-200 text-slate-700 hover:border-slate-400 text-xs font-semibold text-center truncate cursor-pointer"
                            >
                              {blk.category}
                            </button>
                          </td>
                        );
                      }

                      if (seg.kind === 'ooo') {
                        return (
                          <td
                            key={seg.key}
                            colSpan={seg.span}
                            className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                          >
                            <div
                              aria-disabled="true"
                              className="w-full py-3 px-3 rounded-lg bg-[repeating-linear-gradient(-45deg,#f1f5f9,#f1f5f9_8px,#e2e8f0_8px,#e2e8f0_16px)] border border-slate-200 text-slate-600 text-xs font-semibold text-center cursor-not-allowed select-none"
                            >
                              Out of Order
                            </div>
                          </td>
                        );
                      }

                      if (seg.kind === 'past') {
                        return (
                          <td
                            key={seg.key}
                            title={`${seg.day} is unavailable for selection`}
                            className="p-1.5 border-r border-slate-100 last:border-r-0 bg-slate-100/75 cursor-not-allowed"
                          >
                            <div className="h-11 rounded-lg bg-slate-100/90" />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={seg.key}
                          className="p-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          <button
                            type="button"
                            onClick={() => openQuickAction('book', room, seg.day)}
                            title={`Reserve ${room.roomNumber} starting ${seg.day}`}
                            className="w-full h-11 rounded-lg hover:bg-blue-50/70 hover:border hover:border-dashed hover:border-[#0a367a]/40 text-transparent hover:text-[#0a367a] text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
                          >
                            +
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {filteredRooms.length === 0 && (
                <tr>
                  <td
                    colSpan={calendarDays.length + 2}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    No rooms match your selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Footer Legend + Print & Refresh Controls */}
        <div className="px-5 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-700">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#25b462] inline-block" />
              Confirmed
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#1677f2] inline-block" />
              Checked In
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#f59e0b] inline-block" />
              OTA Booking
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />
              Out of Order
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-slate-300 bg-white inline-block" />
              Available
            </span>
          </div>

          <div className="flex items-center gap-2.5 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 inline-flex items-center gap-2 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#061f4d] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-[#0a367a]" />
              <span>Print Calendar</span>
            </button>
            <button
              type="button"
              disabled={syncingOta}
              onClick={() => void handleRefreshCalendar()}
              className="h-10 inline-flex items-center gap-2 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${syncingOta ? 'animate-spin' : ''}`} />
              <span>{syncingOta ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Compact Upcoming Stays & Blocked Holds Strip (Preserves Quick Check-In, OTA Guards & Unblock) */}
      {(upcomingReservations.length > 0 || activeBlocks.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 no-print">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#061f4d]">
                Active &amp; Upcoming Reservations ({upcomingReservations.length})
              </h2>
              <button
                type="button"
                onClick={() => openQuickAction('book')}
                className="text-xs font-semibold text-[#0a367a] hover:underline cursor-pointer"
              >
                + New Reservation
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {upcomingReservations.slice(0, 12).map((res) => {
                const normIn = normalizeIsoDate(res.checkInDate);
                const otaCheckInBlock = getCheckInDateRestriction(res, todayIso);
                const otaCancelBlock = getOtaCancellationRestriction(res);
                return (
                  <div
                    key={res.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-[#061f4d] truncate">{res.guestName}</span>
                        <span className="font-mono-tabular text-[11px] font-semibold text-slate-500">
                          {res.roomNumber}
                        </span>
                        {isOtaBookingChannel(res.channel) && (
                          <span className="text-[10px] font-bold text-amber-700">
                            · {formatBookingSourceLabel(res.channel)}
                          </span>
                        )}
                      </div>
                      <p className="font-mono-tabular text-[11px] text-slate-500 mt-0.5">
                        {formatShortMonthDay(res.checkInDate)} → {formatShortMonthDay(res.checkOutDate)} ({res.nights}n)
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCalendarStart(normIn || todayIso)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        Jump
                      </button>
                      {(res.status === 'confirmed' || res.status === 'pending') &&
                        !otaCheckInBlock.restricted && (
                          <button
                            type="button"
                            disabled={busyId === res.id}
                            onClick={() => setCheckInTarget(res)}
                            className="px-2.5 py-1.5 text-[11px] font-semibold bg-[#0a367a] hover:bg-[#07275a] text-white rounded-lg cursor-pointer"
                          >
                            Check In
                          </button>
                        )}
                      {(res.status === 'confirmed' || res.status === 'pending') &&
                        otaCheckInBlock.restricted && (
                          <span
                            title={otaCheckInBlock.message}
                            className="px-2 py-1 text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-800 rounded-lg"
                          >
                            Arrival {otaCheckInBlock.checkInIso}
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
                                  getUserFriendlyErrorMessage(
                                    err,
                                    `Unable to cancel reservation ${res.bookingRef}. Please try again.`,
                                    'Calendar:CancelReservation'
                                  )
                                );
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="px-2 py-1.5 text-[11px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
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
                            className="px-2 py-1.5 text-[10px] font-medium text-amber-800 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg cursor-pointer"
                          >
                            Cancel via {otaCancelBlock.platformLabel}
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
              {upcomingReservations.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">
                  No active or upcoming reservations.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#061f4d]">
                Blocked Dates &amp; Holds ({activeBlocks.length})
              </h2>
              <button
                type="button"
                onClick={() => openQuickAction('block')}
                className="text-xs font-semibold text-[#0a367a] hover:underline cursor-pointer"
              >
                + Add Block
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {activeBlocks.map((blk) => (
                <div
                  key={blk.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono-tabular font-bold text-[#061f4d]">
                        {blk.roomNumber}
                      </span>
                      <span className="text-rose-700 font-semibold">{blk.category}</span>
                    </div>
                    <p className="text-xs text-slate-600 truncate">{blk.reason}</p>
                    <p className="font-mono-tabular text-[11px] text-slate-500">
                      {blk.startDate} → {blk.endDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCalendarStart(normalizeIsoDate(blk.startDate) || todayIso)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      disabled={busyId === blk.id}
                      onClick={() => handleUnblock(blk)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Unblock</span>
                    </button>
                  </div>
                </div>
              ))}
              {activeBlocks.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">
                  No active or upcoming blocked dates.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Block / Book Modal (All Reservation Form Placeholders Removed) */}
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                    modalMode === 'book'
                      ? 'bg-[#0a367a] text-white'
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
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
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
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
                            className="text-[11px] font-semibold text-[#0a367a] hover:underline cursor-pointer"
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
                      if (rm) setDepositNgn(rm.nightlyRateNgn * diffNights(bookCheckIn, bookCheckOut));
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
                    if (currentRm) {
                      setDepositNgn(currentRm.nightlyRateNgn * diffNights(nextIn, nextOut));
                    }
                  }}
                  room={rooms.find((r) => r.id === targetRoomId)}
                  rooms={sortedRooms}
                  reservations={reservations}
                  blockedDates={blockedDates}
                  onSelectAlternativeRoom={(alt) => {
                    setTargetRoomId(alt.id);
                    setDepositNgn(alt.nightlyRateNgn * diffNights(bookCheckIn, bookCheckOut));
                    setConflictError(null);
                  }}
                  checkInLabel="Check-In Date *"
                  checkOutLabel="Check-Out Date *"
                  compact
                />

                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-3">
                  <p className="font-display text-[11px] font-bold uppercase tracking-wider text-[#061f4d]">
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
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Residential Address</label>
                      <input
                        type="text"
                        value={guestAddress}
                        onChange={(e) => setGuestAddress(e.target.value)}
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
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">State</label>
                      <input
                        type="text"
                        value={guestState}
                        onChange={(e) => setGuestState(e.target.value)}
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Country</label>
                      <CountrySelect
                        value={guestCountry}
                        onChange={setGuestCountry}
                        placeholder=""
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">ID Type</label>
                      <select
                        value={quickIdType}
                        onChange={(e) => setQuickIdType(e.target.value as GuestRecord['idType'])}
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3"
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
                        value={quickIdNumber}
                        onChange={(e) => setQuickIdNumber(e.target.value)}
                        className="w-full h-10 border border-slate-200 bg-white rounded-lg px-3 font-mono-tabular"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
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
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2.5">
                  <label className="inline-flex items-center gap-2 font-semibold text-amber-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cautionEnabled}
                      onChange={(e) => setCautionEnabled(e.target.checked)}
                      className="rounded border-amber-400 text-[#0a367a]"
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
                          className="rounded border-amber-400 text-[#0a367a]"
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
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      busyId === 'book' ||
                      Boolean(describeRoomConflict(targetRoomId, bookCheckIn, bookCheckOut))
                    }
                    className="px-4 py-2 bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
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
