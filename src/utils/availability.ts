import {
  BlockedDateRecord,
  formatBookingSourceLabel,
  isOtaBookingChannel,
  ReservationRecord,
  RoomRecord,
} from '../types/pms';

export type DayAvailabilityStatus =
  | 'available'
  | 'reserved'
  | 'checked_in'
  | 'pending'
  | 'blocked'
  | 'out_of_order';

export interface DayAvailabilityInfo {
  status: DayAvailabilityStatus;
  available: boolean;
  label: string;
  detail: string;
  reservation?: ReservationRecord;
  block?: BlockedDateRecord;
  isOta?: boolean;
  otaChannel?: string;
  otaBookingsCount?: number;
  bookedCount?: number;
  totalPoolCount?: number;
}

export interface RangeAvailabilityResult {
  available: boolean;
  status: 'available' | 'reserved' | 'blocked' | 'out_of_order' | 'invalid_range' | 'type_full';
  message: string;
  conflictReservation?: ReservationRecord;
  conflictBlock?: BlockedDateRecord;
  availableCountForType?: number;
  totalCountForType?: number;
}

export function getLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalizes YYYY-MM-DD, YYYYMMDD, YYYY/MM/DD, or ISO timestamp strings to strict YYYY-MM-DD.
 */
export function normalizeIsoDate(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val) return '';
  const isoLike = val.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/);
  if (isoLike) {
    const y = Number(isoLike[1]);
    const m = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const parsed = Date.parse(val);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return val.slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const clean = normalizeIsoDate(isoDate);
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return clean;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return dt.toISOString().slice(0, 10);
}

export function diffNightsIso(startIso: string, endIso: string): number {
  const s = normalizeIsoDate(startIso);
  const e = normalizeIsoDate(endIso);
  const a = new Date(`${s}T00:00:00Z`).getTime();
  const b = new Date(`${e}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export function datesOverlapIso(
  aStartRaw: string,
  aEndRaw: string,
  bStartRaw: string,
  bEndRaw: string
): boolean {
  const aStart = normalizeIsoDate(aStartRaw);
  const aEnd = normalizeIsoDate(aEndRaw);
  const bStart = normalizeIsoDate(bStartRaw);
  const bEnd = normalizeIsoDate(bEndRaw);
  if (!aStart || !bStart) return false;
  const effAEnd = aEnd > aStart ? aEnd : addDaysIso(aStart, 1);
  const effBEnd = bEnd > bStart ? bEnd : addDaysIso(bStart, 1);
  return aStart < effBEnd && bStart < effAEnd;
}

export function isActiveBlockingReservation(res: ReservationRecord): boolean {
  const status = String(res.status || '').trim().toLowerCase();
  return (
    status === 'confirmed' ||
    status === 'checked_in' ||
    status === 'pending' ||
    status === 'booked' ||
    status === 'reserved'
  );
}

function normalizeRoomCode(val?: string): string {
  return (val || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function extractCanonicalRoomNumber(val?: string): string {
  const raw = (val || '').trim().toLowerCase();
  if (!raw) return '';
  // Match RM-1, RM 01, Room 1, Room-01, Unit 1, Suite 1, or leading digits
  const tagged = raw.match(/\b(?:rm|room|suite|unit|apt|apartment)[\s_-]*0*(\d+)\b/i);
  if (tagged) return `num:${tagged[1]}`;
  const bare = raw.match(/^0*(\d+)$/);
  if (bare) return `num:${bare[1]}`;
  return '';
}

export function matchesRoomRecord(
  room: RoomRecord,
  candidateRoomId?: string,
  candidateRoomNumber?: string
): boolean {
  if (candidateRoomId && candidateRoomId.trim() === room.id) return true;
  if (candidateRoomNumber) {
    const rawCand = candidateRoomNumber.trim();
    const lowerCand = rawCand.toLowerCase();
    // Property-wide blocks apply to every room
    if (lowerCand === 'all' || lowerCand === 'all rooms' || lowerCand === 'all suites') {
      return true;
    }
    if (lowerCand === 'unassigned') {
      return false;
    }
    // Check if candidateRoomNumber is actually a roomId
    if (rawCand === room.id) return true;

    const normCand = normalizeRoomCode(rawCand);
    const normRoom = normalizeRoomCode(room.roomNumber);
    const normName = normalizeRoomCode(room.name);
    if (normCand && normRoom && normCand === normRoom) {
      return true;
    }
    if (normCand && normName && normCand === normName) {
      return true;
    }
    // Match leading code like "RM-1 · Deluxe Studio" or "Room 1" against "RM-1"
    const leadingSegment = rawCand.split(/[·|—–-](?=\s)/)[0]?.trim() || rawCand;
    const normLeading = normalizeRoomCode(leadingSegment);
    if (normLeading && normRoom && normLeading === normRoom) {
      return true;
    }
    const candCanon = extractCanonicalRoomNumber(rawCand);
    const roomCanon = extractCanonicalRoomNumber(room.roomNumber);
    if (candCanon && roomCanon && candCanon === roomCanon) {
      return true;
    }
  }
  return false;
}

export function formatRoomAvailabilityTag(avail: RangeAvailabilityResult): string {
  if (avail.available) return 'Available';
  if (avail.status === 'out_of_order') return 'Unavailable · Out of Order';
  if (avail.status === 'blocked') {
    const cat = avail.conflictBlock?.category || 'Blocked';
    return `Unavailable · ${cat}`;
  }
  if (avail.conflictReservation) {
    const res = avail.conflictReservation;
    if (isOtaBookingChannel(res.channel)) {
      return `Unavailable · Booked on ${formatBookingSourceLabel(res.channel)}`;
    }
    if (res.status === 'checked_in') return 'Unavailable · Occupied';
    if (res.status === 'pending') return 'Unavailable · Pending Hold';
    return 'Unavailable · Reserved';
  }
  return 'Unavailable';
}

/**
 * Inspects a single calendar night (`dayIso`) for a specific room.
 * Standard hotel turnover logic: a reservation from [checkIn, checkOut) occupies
 * nights `checkIn <= dayIso < checkOut`. Check-out day itself is open for a new check-in.
 */
export function checkDayStatusForRoom(params: {
  room?: RoomRecord;
  dayIso: string;
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  excludeReservationId?: string;
}): DayAvailabilityInfo {
  const { room, reservations, blockedDates, excludeReservationId } = params;
  const dayIso = normalizeIsoDate(params.dayIso);
  if (!room) {
    return {
      status: 'available',
      available: true,
      label: 'Available',
      detail: 'Open date',
    };
  }

  if (room.occupancyStatus === 'out_of_order') {
    return {
      status: 'out_of_order',
      available: false,
      label: 'Out of Order',
      detail: `${room.roomNumber} is currently Out of Order / under maintenance.`,
    };
  }

  const resMatch = reservations.find((r) => {
    if (r.id === excludeReservationId) return false;
    if (!isActiveBlockingReservation(r)) return false;
    if (!matchesRoomRecord(room, r.roomId, r.roomNumber)) return false;
    const rIn = normalizeIsoDate(r.checkInDate);
    const rOutRaw = normalizeIsoDate(r.checkOutDate);
    if (!rIn) return false;
    const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
    return rIn <= dayIso && dayIso < rOut;
  });

  if (resMatch) {
    const isOta = isOtaBookingChannel(resMatch.channel);
    const sourceLabel = formatBookingSourceLabel(resMatch.channel);
    const normIn = normalizeIsoDate(resMatch.checkInDate);
    const normOut = normalizeIsoDate(resMatch.checkOutDate);
    const statusLabel = isOta
      ? `Booked (${sourceLabel})`
      : resMatch.status === 'checked_in'
        ? 'Checked In'
        : resMatch.status === 'pending'
          ? 'Pending Hold'
          : 'Reserved';
    return {
      status:
        resMatch.status === 'checked_in'
          ? 'checked_in'
          : resMatch.status === 'pending'
            ? 'pending'
            : 'reserved',
      available: false,
      label: statusLabel,
      detail: isOta
        ? `${room.roomNumber} is booked on ${sourceLabel} by ${resMatch.guestName} (${resMatch.bookingRef}: ${normIn} → ${normOut}).`
        : `${room.roomNumber} is ${statusLabel.toLowerCase()} by ${resMatch.guestName} (${resMatch.bookingRef}: ${normIn} → ${normOut}).`,
      reservation: resMatch,
      isOta,
      otaChannel: isOta ? sourceLabel : undefined,
      otaBookingsCount: isOta ? 1 : 0,
      bookedCount: 1,
      totalPoolCount: 1,
    };
  }

  const blkMatch = blockedDates.find((b) => {
    if (!matchesRoomRecord(room, b.roomId, b.roomNumber)) return false;
    const bStart = normalizeIsoDate(b.startDate);
    const bEndRaw = normalizeIsoDate(b.endDate);
    if (!bStart) return false;
    const bEnd = bEndRaw > bStart ? bEndRaw : addDaysIso(bStart, 1);
    return bStart <= dayIso && dayIso < bEnd;
  });

  if (blkMatch) {
    return {
      status: 'blocked',
      available: false,
      label: blkMatch.category || 'Blocked',
      detail: `${room.roomNumber} is blocked (${blkMatch.category}: ${blkMatch.reason} · ${normalizeIsoDate(blkMatch.startDate)} → ${normalizeIsoDate(blkMatch.endDate)}).`,
      block: blkMatch,
    };
  }

  return {
    status: 'available',
    available: true,
    label: 'Available',
    detail: `${room.roomNumber} is open on ${dayIso}.`,
  };
}

/**
 * Checks whether a specific room (or room type when unassigned) is available
 * for the full stay range [checkInDate, checkOutDate).
 */
export function checkRoomDateRangeAvailability(params: {
  room?: RoomRecord;
  roomType?: string;
  rooms?: RoomRecord[];
  checkInDate: string;
  checkOutDate: string;
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  excludeReservationId?: string;
}): RangeAvailabilityResult {
  const {
    room,
    roomType,
    rooms = [],
    reservations,
    blockedDates,
    excludeReservationId,
  } = params;
  const checkInDate = normalizeIsoDate(params.checkInDate);
  const checkOutDate = normalizeIsoDate(params.checkOutDate);

  if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
    return {
      available: false,
      status: 'invalid_range',
      message: 'Check-out date must be at least 1 night after check-in date.',
    };
  }

  const nights = diffNightsIso(checkInDate, checkOutDate);

  // Case 1: Specific room selected
  if (room) {
    if (room.occupancyStatus === 'out_of_order') {
      return {
        available: false,
        status: 'out_of_order',
        message: `${room.roomNumber} (${room.roomType}) is currently Out of Order and unavailable for booking.`,
      };
    }

    const resMatch = reservations.find(
      (r) =>
        r.id !== excludeReservationId &&
        isActiveBlockingReservation(r) &&
        matchesRoomRecord(room, r.roomId, r.roomNumber) &&
        datesOverlapIso(checkInDate, checkOutDate, r.checkInDate, r.checkOutDate)
    );
    if (resMatch) {
      const isOta = isOtaBookingChannel(resMatch.channel);
      const sourceLabel = formatBookingSourceLabel(resMatch.channel);
      const tag = isOta
        ? `booked on ${sourceLabel}`
        : resMatch.status === 'checked_in'
          ? 'occupied (checked-in)'
          : resMatch.status === 'pending'
            ? 'on pending hold'
            : 'already reserved';
      return {
        available: false,
        status: 'reserved',
        message: `${room.roomNumber} is unavailable — ${tag} by ${resMatch.guestName} (${resMatch.bookingRef}: ${normalizeIsoDate(resMatch.checkInDate)} → ${normalizeIsoDate(resMatch.checkOutDate)}).`,
        conflictReservation: resMatch,
      };
    }

    const blkMatch = blockedDates.find(
      (b) =>
        matchesRoomRecord(room, b.roomId, b.roomNumber) &&
        datesOverlapIso(checkInDate, checkOutDate, b.startDate, b.endDate)
    );
    if (blkMatch) {
      return {
        available: false,
        status: 'blocked',
        message: `${room.roomNumber} is unavailable — blocked (${blkMatch.category}: ${blkMatch.reason} · ${normalizeIsoDate(blkMatch.startDate)} → ${normalizeIsoDate(blkMatch.endDate)}).`,
        conflictBlock: blkMatch,
      };
    }

    return {
      available: true,
      status: 'available',
      message: `${room.roomNumber} is available for ${nights} ${nights === 1 ? 'night' : 'nights'} (${checkInDate} → ${checkOutDate}).`,
    };
  }

  // Case 2: Unassigned — check capacity across rooms of the selected roomType (or all rooms)
  const pool = roomType ? rooms.filter((r) => r.roomType === roomType) : rooms;
  if (pool.length === 0) {
    return {
      available: true,
      status: 'available',
      message: `Selected dates cover ${nights} ${nights === 1 ? 'night' : 'nights'} (${checkInDate} → ${checkOutDate}).`,
    };
  }

  const openRooms = pool.filter(
    (candidate) =>
      checkRoomDateRangeAvailability({
        room: candidate,
        checkInDate,
        checkOutDate,
        reservations,
        blockedDates,
        excludeReservationId,
      }).available
  );

  // Also account for other unassigned reservations of the same roomType overlapping this window
  const unassignedOverlaps = reservations.filter(
    (r) =>
      r.id !== excludeReservationId &&
      isActiveBlockingReservation(r) &&
      (!r.roomId || !pool.some((candidate) => matchesRoomRecord(candidate, r.roomId, r.roomNumber))) &&
      (!r.roomId || String(r.roomNumber || '').toLowerCase() === 'unassigned') &&
      (!roomType || (r.requestedRoomType || '').trim().toLowerCase() === roomType.trim().toLowerCase()) &&
      datesOverlapIso(checkInDate, checkOutDate, r.checkInDate, r.checkOutDate)
  ).length;

  const netAvailable = Math.max(0, openRooms.length - unassignedOverlaps);
  if (netAvailable <= 0) {
    return {
      available: false,
      status: 'type_full',
      message: roomType
        ? `All ${pool.length} ${roomType} rooms are reserved, booked on OTA, or blocked from ${checkInDate} to ${checkOutDate}.`
        : `No rooms are available from ${checkInDate} to ${checkOutDate}.`,
      availableCountForType: 0,
      totalCountForType: pool.length,
    };
  }

  return {
    available: true,
    status: 'available',
    message: roomType
      ? `${netAvailable} of ${pool.length} ${roomType} ${netAvailable === 1 ? 'room' : 'rooms'} available for ${nights} ${nights === 1 ? 'night' : 'nights'}.`
      : `${netAvailable} of ${pool.length} rooms available for ${nights} ${nights === 1 ? 'night' : 'nights'}.`,
    availableCountForType: netAvailable,
    totalCountForType: pool.length,
  };
}

/**
 * Returns all rooms that are open across [checkInDate, checkOutDate),
 * prioritizing rooms matching `preferredRoomType` first.
 */
export function findAvailableRoomsForRange(params: {
  rooms: RoomRecord[];
  checkInDate: string;
  checkOutDate: string;
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  excludeReservationId?: string;
  preferredRoomType?: string;
}): RoomRecord[] {
  const {
    rooms,
    checkInDate,
    checkOutDate,
    reservations,
    blockedDates,
    excludeReservationId,
    preferredRoomType,
  } = params;

  const available = rooms.filter(
    (room) =>
      checkRoomDateRangeAvailability({
        room,
        checkInDate,
        checkOutDate,
        reservations,
        blockedDates,
        excludeReservationId,
      }).available
  );

  if (!preferredRoomType) return available;
  return [
    ...available.filter((r) => r.roomType === preferredRoomType),
    ...available.filter((r) => r.roomType !== preferredRoomType),
  ];
}
