import { BlockedDateRecord, ReservationRecord, RoomRecord } from '../types/pms';

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

export function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return dt.toISOString().slice(0, 10);
}

export function diffNightsIso(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${endIso}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export function datesOverlapIso(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const effAEnd = aEnd > aStart ? aEnd : addDaysIso(aStart, 1);
  const effBEnd = bEnd > bStart ? bEnd : addDaysIso(bStart, 1);
  return aStart < effBEnd && bStart < effAEnd;
}

export function isActiveBlockingReservation(res: ReservationRecord): boolean {
  return (
    res.status === 'confirmed' ||
    res.status === 'checked_in' ||
    res.status === 'pending'
  );
}

export function matchesRoomRecord(
  room: RoomRecord,
  candidateRoomId?: string,
  candidateRoomNumber?: string
): boolean {
  if (candidateRoomId && candidateRoomId === room.id) return true;
  if (
    !candidateRoomId &&
    candidateRoomNumber &&
    candidateRoomNumber.trim().toLowerCase() === room.roomNumber.trim().toLowerCase()
  ) {
    return true;
  }
  if (
    candidateRoomNumber &&
    candidateRoomNumber.trim().toLowerCase() === room.roomNumber.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
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
  const { room, dayIso, reservations, blockedDates, excludeReservationId } = params;
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

  const resMatch = reservations.find(
    (r) =>
      r.id !== excludeReservationId &&
      isActiveBlockingReservation(r) &&
      matchesRoomRecord(room, r.roomId, r.roomNumber) &&
      r.checkInDate <= dayIso &&
      dayIso < (r.checkOutDate > r.checkInDate ? r.checkOutDate : addDaysIso(r.checkInDate, 1))
  );
  if (resMatch) {
    const statusLabel =
      resMatch.status === 'checked_in'
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
      detail: `${room.roomNumber} is ${statusLabel.toLowerCase()} by ${resMatch.guestName} (${resMatch.bookingRef}: ${resMatch.checkInDate} → ${resMatch.checkOutDate}).`,
      reservation: resMatch,
    };
  }

  const blkMatch = blockedDates.find(
    (b) =>
      matchesRoomRecord(room, b.roomId, b.roomNumber) &&
      b.startDate <= dayIso &&
      dayIso < (b.endDate > b.startDate ? b.endDate : addDaysIso(b.startDate, 1))
  );
  if (blkMatch) {
    return {
      status: 'blocked',
      available: false,
      label: blkMatch.category || 'Blocked',
      detail: `${room.roomNumber} is blocked (${blkMatch.category}: ${blkMatch.reason} · ${blkMatch.startDate} → ${blkMatch.endDate}).`,
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
    checkInDate,
    checkOutDate,
    reservations,
    blockedDates,
    excludeReservationId,
  } = params;

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
      const tag =
        resMatch.status === 'checked_in'
          ? 'occupied (checked-in)'
          : resMatch.status === 'pending'
            ? 'on pending hold'
            : 'already reserved';
      return {
        available: false,
        status: 'reserved',
        message: `${room.roomNumber} is ${tag} by ${resMatch.guestName} (${resMatch.bookingRef}: ${resMatch.checkInDate} → ${resMatch.checkOutDate}).`,
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
        message: `${room.roomNumber} is blocked (${blkMatch.category}: ${blkMatch.reason} · ${blkMatch.startDate} → ${blkMatch.endDate}).`,
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
      !r.roomId &&
      (!roomType || r.requestedRoomType === roomType) &&
      datesOverlapIso(checkInDate, checkOutDate, r.checkInDate, r.checkOutDate)
  ).length;

  const netAvailable = Math.max(0, openRooms.length - unassignedOverlaps);
  if (netAvailable <= 0) {
    return {
      available: false,
      status: 'type_full',
      message: roomType
        ? `All ${pool.length} ${roomType} rooms are reserved, blocked, or unavailable from ${checkInDate} to ${checkOutDate}.`
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
