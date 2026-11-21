import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';
import {
  BlockedDateRecord,
  formatBookingSourceLabel,
  isOtaBookingChannel,
  ReservationRecord,
  RoomRecord,
} from '../types/pms';
import {
  addDaysIso,
  checkDayStatusForRoom,
  checkRoomDateRangeAvailability,
  diffNightsIso,
  findAvailableRoomsForRange,
  getLocalIsoDate,
  isActiveBlockingReservation,
  matchesRoomRecord,
  normalizeIsoDate,
} from '../utils/availability';

interface AvailabilityDateRangePickerProps {
  checkInDate: string;
  checkOutDate: string;
  onChangeDates: (nextCheckIn: string, nextCheckOut: string) => void;
  room?: RoomRecord;
  roomType?: string;
  rooms: RoomRecord[];
  reservations: ReservationRecord[];
  blockedDates: BlockedDateRecord[];
  excludeReservationId?: string;
  onSelectAlternativeRoom?: (room: RoomRecord) => void;
  checkInLabel?: string;
  checkOutLabel?: string;
  lockCheckIn?: boolean;
  mode?: 'reservation' | 'block';
  compact?: boolean;
  hideCheckCalendar?: boolean;
}

const WEEKDAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatPrettyDate(iso: string): string {
  if (!iso) return 'Select date';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getMonthGridDays(year: number, monthIndex: number): Array<{ iso: string; inMonth: boolean; dayNum: number }> {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startDow = firstOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - startDow));
  const cells: Array<{ iso: string; inMonth: boolean; dayNum: number }> = [];
  for (let i = 0; i < 42; i += 1) {
    const dt = new Date(
      Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i)
    );
    cells.push({
      iso: dt.toISOString().slice(0, 10),
      inMonth: dt.getUTCMonth() === monthIndex,
      dayNum: dt.getUTCDate(),
    });
  }
  return cells;
}

export const AvailabilityDateRangePicker: React.FC<AvailabilityDateRangePickerProps> = ({
  checkInDate,
  checkOutDate,
  onChangeDates,
  room,
  roomType,
  rooms,
  reservations,
  blockedDates,
  excludeReservationId,
  onSelectAlternativeRoom,
  checkInLabel = 'Check-In Date *',
  checkOutLabel = 'Check-Out Date *',
  lockCheckIn = false,
  mode = 'reservation',
  compact = false,
  hideCheckCalendar = false,
}) => {
  const todayIso = getLocalIsoDate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [openField, setOpenField] = useState<'none' | 'check_in' | 'check_out'>('none');
  const [clickNotice, setClickNotice] = useState<string | null>(null);
  const [calendarScope, setCalendarScope] = useState<'focused' | 'all_rooms'>('focused');

  const initialAnchor = checkInDate || todayIso;
  const [viewYear, setViewYear] = useState<number>(() => Number(initialAnchor.slice(0, 4)) || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => (Number(initialAnchor.slice(5, 7)) || 1) - 1);

  // Close popover on outside click
  useEffect(() => {
    if (openField === 'none') return;
    const handleOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpenField('none');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openField]);

  // Sync displayed calendar month when opening popover
  const openCalendarFor = (field: 'check_in' | 'check_out') => {
    if (lockCheckIn && field === 'check_in') return;
    const anchor = (field === 'check_out' ? checkOutDate : checkInDate) || todayIso;
    const y = Number(anchor.slice(0, 4));
    const m = Number(anchor.slice(5, 7)) - 1;
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m <= 11) {
      setViewYear(y);
      setViewMonth(m);
    }
    setClickNotice(null);
    setOpenField((prev) => (prev === field ? 'none' : field));
  };

  const rangeCheck = useMemo(
    () =>
      checkRoomDateRangeAvailability({
        room,
        roomType,
        rooms,
        checkInDate,
        checkOutDate,
        reservations,
        blockedDates,
        excludeReservationId,
      }),
    [room, roomType, rooms, checkInDate, checkOutDate, reservations, blockedDates, excludeReservationId]
  );

  const alternativeRooms = useMemo(() => {
    if (rangeCheck.available || !checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
      return [];
    }
    return findAvailableRoomsForRange({
      rooms,
      checkInDate,
      checkOutDate,
      reservations,
      blockedDates,
      excludeReservationId,
      preferredRoomType: room?.roomType || roomType,
    }).filter((candidate) => candidate.id !== room?.id);
  }, [
    rangeCheck.available,
    rooms,
    checkInDate,
    checkOutDate,
    reservations,
    blockedDates,
    excludeReservationId,
    room,
    roomType,
  ]);

  const monthCells = useMemo(() => getMonthGridDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const effectiveShowAllRooms = calendarScope === 'all_rooms' || (!room && !roomType);

  // Compute day-by-day availability for all 42 visible cells
  const cellStatuses = useMemo(() => {
    const pool = effectiveShowAllRooms
      ? rooms
      : room
        ? [room]
        : roomType
          ? rooms.filter((r) => r.roomType === roomType)
          : rooms;

    return monthCells.map((cell) => {
      if (!effectiveShowAllRooms && room) {
        return {
          ...cell,
          info: checkDayStatusForRoom({
            room,
            dayIso: cell.iso,
            reservations,
            blockedDates,
            excludeReservationId,
          }),
        };
      }
      if (pool.length === 0) {
        return {
          ...cell,
          info: {
            status: 'available' as const,
            available: true,
            label: 'Available',
            detail: `Open on ${cell.iso}`,
          },
        };
      }
      const perRoomInfo = pool.map((candidate) =>
        checkDayStatusForRoom({
          room: candidate,
          dayIso: cell.iso,
          reservations,
          blockedDates,
          excludeReservationId,
        })
      );
      const openCount = perRoomInfo.filter((inf) => inf.available).length;
      const otaRoomMatches = perRoomInfo.filter((inf) => !inf.available && inf.isOta);

      const unassignedMatches = reservations.filter((r) => {
        if (r.id === excludeReservationId) return false;
        if (!isActiveBlockingReservation(r)) return false;
        const matchedAnyInPool = pool.some((candidate) =>
          matchesRoomRecord(candidate, r.roomId, r.roomNumber)
        );
        if (matchedAnyInPool) return false;
        const isUnassigned = !r.roomId || String(r.roomNumber || '').trim().toLowerCase() === 'unassigned';
        if (!isUnassigned) return false;
        if (!effectiveShowAllRooms && roomType && (r.requestedRoomType || '').trim().toLowerCase() !== roomType.trim().toLowerCase()) {
          return false;
        }
        const rIn = normalizeIsoDate(r.checkInDate);
        const rOutRaw = normalizeIsoDate(r.checkOutDate);
        if (!rIn) return false;
        const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
        return rIn <= cell.iso && cell.iso < rOut;
      });

      const unassignedOtaCount = unassignedMatches.filter((r) => isOtaBookingChannel(r.channel)).length;
      const otaBookingsCount = otaRoomMatches.length + unassignedOtaCount;
      const primaryOtaChannel =
        otaRoomMatches[0]?.otaChannel ||
        (unassignedOtaCount > 0
          ? formatBookingSourceLabel(
              unassignedMatches.find((r) => isOtaBookingChannel(r.channel))?.channel || 'Airbnb'
            )
          : undefined);

      const netOpen = Math.max(0, openCount - unassignedMatches.length);
      const bookedCount = Math.max(0, pool.length - netOpen);
      const scopeLabel = effectiveShowAllRooms ? 'property rooms' : roomType || 'rooms';
      if (netOpen > 0) {
        return {
          ...cell,
          info: {
            status: 'available' as const,
            available: true,
            label: `${netOpen}/${pool.length} open`,
            detail:
              otaBookingsCount > 0
                ? `${netOpen} of ${pool.length} ${scopeLabel} open on ${formatPrettyDate(cell.iso)} (${otaBookingsCount} ${primaryOtaChannel || 'OTA'} booking${otaBookingsCount > 1 ? 's' : ''} active)`
                : `${netOpen} of ${pool.length} ${scopeLabel} open on ${formatPrettyDate(cell.iso)}`,
            isOta: otaBookingsCount > 0,
            otaChannel: primaryOtaChannel,
            otaBookingsCount,
            bookedCount,
            totalPoolCount: pool.length,
          },
        };
      }
      const otaSuffix =
        otaBookingsCount > 0
          ? ` including ${otaBookingsCount} ${primaryOtaChannel || 'OTA'} booking${otaBookingsCount > 1 ? 's' : ''}`
          : '';
      return {
        ...cell,
        info: {
          status: 'reserved' as const,
          available: false,
          label: otaBookingsCount > 0 ? `Booked (${primaryOtaChannel || 'OTA'})` : 'Unavailable',
          detail: `All ${pool.length} ${scopeLabel} are unavailable on ${formatPrettyDate(cell.iso)}${otaSuffix}.`,
          isOta: otaBookingsCount > 0,
          otaChannel: primaryOtaChannel,
          otaBookingsCount,
          bookedCount: pool.length,
          totalPoolCount: pool.length,
        },
      };
    });
  }, [monthCells, effectiveShowAllRooms, room, roomType, rooms, reservations, blockedDates, excludeReservationId]);

  // All active current & future OTA / Airbnb bookings across the entire property
  const allPropertyOtaBookings = useMemo(() => {
    return reservations
      .filter((r) => {
        if (r.id === excludeReservationId) return false;
        if (!isActiveBlockingReservation(r)) return false;
        if (!isOtaBookingChannel(r.channel)) return false;
        const rIn = normalizeIsoDate(r.checkInDate);
        const rOutRaw = normalizeIsoDate(r.checkOutDate);
        if (!rIn) return false;
        const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
        return r.status === 'checked_in' || rOut >= todayIso;
      })
      .sort((a, b) =>
        normalizeIsoDate(a.checkInDate).localeCompare(normalizeIsoDate(b.checkInDate))
      );
  }, [reservations, excludeReservationId, todayIso]);

  // Count distinct active OTA / Airbnb bookings overlapping the currently displayed calendar month
  const monthOtaSummary = useMemo(() => {
    const firstIso = monthCells[0]?.iso || '';
    const lastIso = monthCells[monthCells.length - 1]?.iso || '';
    if (!firstIso || !lastIso) return { total: 0, airbnb: 0, propertyTotal: 0, propertyAirbnb: 0 };
    const pool = effectiveShowAllRooms
      ? rooms
      : room
        ? [room]
        : roomType
          ? rooms.filter((r) => r.roomType === roomType)
          : rooms;

    const inMonthAll = allPropertyOtaBookings.filter((r) => {
      const rIn = normalizeIsoDate(r.checkInDate);
      const rOutRaw = normalizeIsoDate(r.checkOutDate);
      const rOut = rOutRaw > rIn ? rOutRaw : addDaysIso(rIn, 1);
      return rIn <= lastIso && rOut > firstIso;
    });

    const matched = inMonthAll.filter((r) => {
      if (effectiveShowAllRooms) return true;
      if (room) {
        return matchesRoomRecord(room, r.roomId, r.roomNumber);
      }
      if (pool.length === 0) return true;
      if (pool.some((candidate) => matchesRoomRecord(candidate, r.roomId, r.roomNumber))) {
        return true;
      }
      const isUnassigned = !r.roomId || String(r.roomNumber || '').trim().toLowerCase() === 'unassigned';
      return (
        isUnassigned &&
        (!roomType || (r.requestedRoomType || '').trim().toLowerCase() === roomType.trim().toLowerCase())
      );
    });

    const airbnb = matched.filter((r) => formatBookingSourceLabel(r.channel) === 'Airbnb').length;
    const propertyAirbnb = allPropertyOtaBookings.filter(
      (r) => formatBookingSourceLabel(r.channel) === 'Airbnb'
    ).length;
    return {
      total: matched.length,
      airbnb,
      propertyTotal: allPropertyOtaBookings.length,
      propertyAirbnb,
    };
  }, [monthCells, effectiveShowAllRooms, room, roomType, rooms, allPropertyOtaBookings]);

  const nights = checkInDate && checkOutDate && checkOutDate > checkInDate
    ? diffNightsIso(checkInDate, checkOutDate)
    : 1;

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth());
  };

  const checkTargetDayAvailability = (dayIso: string) => {
    if (room) {
      return checkDayStatusForRoom({
        room,
        dayIso,
        reservations,
        blockedDates,
        excludeReservationId,
      });
    }
    const singleNight = checkRoomDateRangeAvailability({
      room,
      roomType,
      rooms,
      checkInDate: dayIso,
      checkOutDate: addDaysIso(dayIso, 1),
      reservations,
      blockedDates,
      excludeReservationId,
    });
    return {
      available: singleNight.available,
      detail: singleNight.message,
    };
  };

  const handleDayClick = (cell: (typeof cellStatuses)[number]) => {
    setClickNotice(null);

    if (cell.iso < todayIso) {
      return;
    }

    if (openField === 'check_in' && !lockCheckIn) {
      const targetDay = checkTargetDayAvailability(cell.iso);
      if (!targetDay.available) {
        return;
      }
      const nextOut =
        checkOutDate && checkOutDate > cell.iso ? checkOutDate : addDaysIso(cell.iso, 1);

      // Verify whether the full resulting range crosses an unavailable night
      const rangeAfterIn = checkRoomDateRangeAvailability({
        room,
        roomType,
        rooms,
        checkInDate: cell.iso,
        checkOutDate: nextOut,
        reservations,
        blockedDates,
        excludeReservationId,
      });

      if (!rangeAfterIn.available) {
        // Snap check-out to 1 night after check-in so user can cleanly choose check-out next
        const oneNightOut = addDaysIso(cell.iso, 1);
        onChangeDates(cell.iso, oneNightOut);
        setClickNotice(
          `Selected check-in ${formatPrettyDate(cell.iso)}. Note: dates after ${formatPrettyDate(oneNightOut)} have a booking or hold — pick your check-out date.`
        );
        setOpenField('check_out');
        return;
      }

      onChangeDates(cell.iso, nextOut);
      setOpenField('check_out');
      return;
    }

    // Selecting Check-Out date
    if (openField === 'check_out') {
      if (cell.iso <= checkInDate) {
        if (lockCheckIn) {
          setClickNotice(`Check-out must be after ${formatPrettyDate(checkInDate)}.`);
          return;
        }
        // Treat clicking an earlier open date as starting a fresh check-in
        const targetDay = checkTargetDayAvailability(cell.iso);
        if (!targetDay.available) {
          setClickNotice(`${formatPrettyDate(cell.iso)} is unavailable — ${targetDay.detail}`);
          return;
        }
        onChangeDates(cell.iso, addDaysIso(cell.iso, 1));
        return;
      }

      // Note: Standard hotel turnover allows check-out on another guest's check-in morning,
      // so we validate the nights strictly in [checkInDate, cell.iso).
      const rangeTest = checkRoomDateRangeAvailability({
        room,
        roomType,
        rooms,
        checkInDate,
        checkOutDate: cell.iso,
        reservations,
        blockedDates,
        excludeReservationId,
      });

      if (!rangeTest.available) {
        return;
      }

      onChangeDates(checkInDate, cell.iso);
      setOpenField('none');
    }
  };

  const accentBorder = !rangeCheck.available
    ? 'border-rose-400 ring-1 ring-rose-200 bg-rose-50/30'
    : openField !== 'none'
      ? 'border-[#0a367a] ring-2 ring-[#0a367a]/15 bg-white'
      : 'border-slate-200 bg-white hover:border-[#0a367a]';

  return (
    <div ref={containerRef} className="relative space-y-2">
      {/* Dual Date Triggers */}
      <div className={`grid ${lockCheckIn ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-3`}>
        {!lockCheckIn && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {checkInLabel}
            </label>
            <button
              type="button"
              onClick={() => openCalendarFor('check_in')}
              className={`w-full h-11 px-3 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                openField === 'check_in'
                  ? 'border-[#0a367a] ring-2 ring-[#0a367a]/15 bg-white'
                  : accentBorder
              }`}
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <CalendarIcon
                  className={`w-4 h-4 shrink-0 ${
                    !rangeCheck.available ? 'text-rose-600' : 'text-[#0a367a]'
                  }`}
                />
                <span className="font-mono-tabular text-sm font-semibold text-slate-900 truncate">
                  {formatPrettyDate(checkInDate)}
                </span>
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  !rangeCheck.available
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-blue-50 text-[#0a367a]'
                }`}
              >
                {!rangeCheck.available ? 'Conflict' : 'Open'}
              </span>
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {checkOutLabel}
          </label>
          <button
            type="button"
            onClick={() => openCalendarFor('check_out')}
            className={`w-full h-11 px-3 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
              openField === 'check_out'
                ? 'border-[#0a367a] ring-2 ring-[#0a367a]/15 bg-white'
                : accentBorder
            }`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <CalendarIcon
                className={`w-4 h-4 shrink-0 ${
                  !rangeCheck.available ? 'text-rose-600' : 'text-[#0a367a]'
                }`}
              />
              <span className="font-mono-tabular text-sm font-semibold text-slate-900 truncate">
                {formatPrettyDate(checkOutDate)}
              </span>
            </span>
            <span className="font-mono-tabular text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
              {nights}n
            </span>
          </button>
        </div>
      </div>

      {/* Live Availability Status Strip (hidden on reservation form when dates are open; always shown on conflicts) */}
      {(!hideCheckCalendar || !rangeCheck.available) && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs flex flex-col gap-2 ${
            rangeCheck.available
              ? 'bg-blue-50/70 border-blue-200 text-[#061f4d]'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              {rangeCheck.available ? (
                <CheckCircle2 className="w-4 h-4 text-[#0a367a] shrink-0 mt-0.5" />
              ) : rangeCheck.status === 'blocked' || rangeCheck.status === 'out_of_order' ? (
                <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="font-medium leading-snug">{rangeCheck.message}</span>
            </div>
            {!hideCheckCalendar && (
              <button
                type="button"
                onClick={() => openCalendarFor(lockCheckIn ? 'check_out' : 'check_in')}
                className={`text-xs font-bold underline shrink-0 cursor-pointer ${
                  rangeCheck.available ? 'text-[#0a367a]' : 'text-rose-800'
                }`}
              >
                {openField === 'none' ? 'Check Calendar' : 'Hide Calendar'}
              </button>
            )}
          </div>

          {/* 1-Click Switch to Available Room Suggestions */}
          {!rangeCheck.available && onSelectAlternativeRoom && alternativeRooms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-rose-200/70">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-800">
                <Sparkles className="w-3 h-3" />
                Available Instead:
              </span>
              {alternativeRooms.slice(0, 4).map((alt) => (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => {
                    onSelectAlternativeRoom(alt);
                    setClickNotice(null);
                  }}
                  className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-50 border border-blue-300 text-[#0a367a] font-semibold text-[11px] transition-colors cursor-pointer"
                >
                  Switch to {alt.roomNumber} ({alt.roomType})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interactive Visual Availability Calendar Popover — strictly anchored BELOW the date fields */}
      {openField !== 'none' && (
        <div
          className={`z-50 top-full mt-1.5 w-full ${
            compact ? 'sm:w-[340px]' : 'sm:w-[370px]'
          } bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden absolute left-0`}
        >
          {/* Dark Blue Header */}
          <div
            className={`${
              mode === 'block'
                ? 'bg-gradient-to-r from-rose-800 to-rose-700'
                : 'bg-gradient-to-r from-[#0a367a] to-[#1557b0]'
            } px-3.5 py-2.5 text-white flex items-center justify-between gap-2`}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                {openField === 'check_in' ? 'Step 1 · Select Check-In' : 'Step 2 · Select Check-Out'}
              </p>
              <p className="text-xs font-semibold truncate">
                {effectiveShowAllRooms
                  ? 'All Property Rooms (Overview)'
                  : room
                    ? `${room.roomNumber} · ${room.roomType}`
                    : roomType
                      ? `${roomType} Availability`
                      : 'Property Availability'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(room || roomType) && rooms.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setCalendarScope((prev) => (prev === 'focused' ? 'all_rooms' : 'focused'))
                  }
                  className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-[10px] font-bold text-white cursor-pointer whitespace-nowrap"
                  title="Toggle between this room and all property rooms"
                >
                  {calendarScope === 'all_rooms'
                    ? room
                      ? room.roomNumber
                      : 'This Type'
                    : 'All Rooms'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenField('none')}
                className="p-1 rounded-lg hover:bg-white/15 text-white cursor-pointer"
                aria-label="Close calendar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3.5 space-y-3">
            {/* Step Toggle + Month Navigation */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-extrabold text-[#061539]">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setViewYear(now.getFullYear());
                    setViewMonth(now.getMonth());
                  }}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Today
                </button>
              </div>

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Active Airbnb / OTA Bookings Strip (Property-wide + 1-click month jump) */}
            {allPropertyOtaBookings.length > 0 && (
              <div className="rounded-lg bg-orange-50/85 border border-orange-200 px-2.5 py-2 text-[11px] font-medium text-orange-950 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {monthOtaSummary.propertyAirbnb > 0
                      ? `${monthOtaSummary.propertyAirbnb} Airbnb booking${monthOtaSummary.propertyAirbnb > 1 ? 's' : ''}`
                      : `${monthOtaSummary.propertyTotal} OTA booking${monthOtaSummary.propertyTotal > 1 ? 's' : ''}`}
                    {monthOtaSummary.propertyTotal > monthOtaSummary.propertyAirbnb &&
                    monthOtaSummary.propertyAirbnb > 0
                      ? ` (+${monthOtaSummary.propertyTotal - monthOtaSummary.propertyAirbnb} other OTA)`
                      : ''}
                    {monthOtaSummary.total > 0
                      ? ` · ${monthOtaSummary.total} in ${MONTH_NAMES[viewMonth]}`
                      : ''}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    Active
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {allPropertyOtaBookings.slice(0, 6).map((otaRes) => {
                    const inIso = normalizeIsoDate(otaRes.checkInDate);
                    const outIso = normalizeIsoDate(otaRes.checkOutDate);
                    const isOtherRoom =
                      Boolean(room) && !matchesRoomRecord(room!, otaRes.roomId, otaRes.roomNumber);
                    return (
                      <button
                        key={otaRes.id}
                        type="button"
                        onClick={() => {
                          if (inIso) {
                            const y = Number(inIso.slice(0, 4));
                            const m = Number(inIso.slice(5, 7)) - 1;
                            if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m <= 11) {
                              setViewYear(y);
                              setViewMonth(m);
                            }
                          }
                          if (isOtherRoom) {
                            setCalendarScope('all_rooms');
                          }
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white hover:bg-orange-100 border border-orange-200 text-[10px] font-mono-tabular text-orange-950 cursor-pointer"
                        title={`View ${formatBookingSourceLabel(otaRes.channel)} booking on ${otaRes.roomNumber || 'Unassigned'} (${inIso} → ${outIso})`}
                      >
                        <span className="font-bold text-orange-700">
                          {otaRes.roomNumber || 'OTA'}
                        </span>
                        <span>
                          {formatPrettyDate(inIso).replace(/,\s*\d{4}$/, '')}–
                          {formatPrettyDate(outIso).replace(/,\s*\d{4}$/, '')}
                        </span>
                      </button>
                    );
                  })}
                  {allPropertyOtaBookings.length > 6 && (
                    <span className="text-[10px] text-orange-700 font-semibold self-center">
                      +{allPropertyOtaBookings.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Inline Conflict / Unavailable Click Notification */}
            {clickNotice && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-medium text-rose-800 flex items-start gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{clickNotice}</span>
              </div>
            )}

            {/* Weekday Header Row */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_HEADERS.map((wd) => (
                <div
                  key={wd}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1"
                >
                  {wd}
                </div>
              ))}

              {/* 42 Day Tiles */}
              {cellStatuses.map((cell) => {
                const isCheckIn = cell.iso === checkInDate;
                const isCheckOut = cell.iso === checkOutDate;
                const isInRange =
                  Boolean(checkInDate && checkOutDate) &&
                  cell.iso > checkInDate &&
                  cell.iso < checkOutDate;
                const isToday = cell.iso === todayIso;
                const isPastDate = cell.iso < todayIso;

                const isReservedLike =
                  cell.info.status === 'reserved' ||
                  cell.info.status === 'checked_in' ||
                  cell.info.status === 'pending';
                const isOtaBooked = Boolean(cell.info.isOta);
                const isBlocked = cell.info.status === 'blocked';
                const isOoo = cell.info.status === 'out_of_order';
                const isUnavailable = !cell.info.available || isPastDate;

                // Turnover rule: when picking check-out, a reserved/blocked day can still be a valid check-out
                // if all nights strictly before it are free
                const canBeTurnoverCheckout =
                  !isPastDate &&
                  openField === 'check_out' &&
                  cell.iso > checkInDate &&
                  !cell.info.available &&
                  checkRoomDateRangeAvailability({
                    room,
                    roomType,
                    rooms,
                    checkInDate,
                    checkOutDate: cell.iso,
                    reservations,
                    blockedDates,
                    excludeReservationId,
                  }).available;

                const crossesUnavailableOnCheckout =
                  !isPastDate &&
                  openField === 'check_out' &&
                  cell.iso > checkInDate &&
                  !canBeTurnoverCheckout &&
                  !checkRoomDateRangeAvailability({
                    room,
                    roomType,
                    rooms,
                    checkInDate,
                    checkOutDate: cell.iso,
                    reservations,
                    blockedDates,
                    excludeReservationId,
                  }).available;

                const isUnselectable =
                  isPastDate ||
                  (openField === 'check_in' && !lockCheckIn && !cell.info.available) ||
                  (openField === 'check_out' &&
                    ((cell.iso <= checkInDate && (lockCheckIn || !cell.info.available)) ||
                      (cell.iso > checkInDate && !canBeTurnoverCheckout && (!cell.info.available || crossesUnavailableOnCheckout))));

                let tileClass =
                  'bg-white text-slate-800 hover:bg-blue-50 hover:border-[#0a367a] border-transparent cursor-pointer';

                if (isCheckIn || isCheckOut) {
                  tileClass =
                    mode === 'block'
                      ? 'bg-rose-700 text-white font-extrabold border-rose-700 shadow-2xs cursor-pointer'
                      : 'bg-[#0a367a] text-white font-extrabold border-[#0a367a] shadow-2xs cursor-pointer';
                } else if (isUnselectable) {
                  tileClass =
                    'bg-slate-100 text-slate-400 border-slate-200/80 line-through decoration-slate-400/80 cursor-not-allowed';
                } else if (canBeTurnoverCheckout) {
                  tileClass =
                    'bg-slate-50 text-slate-700 border-[#0a367a] border-dashed hover:bg-blue-50 cursor-pointer';
                } else if (isInRange) {
                  tileClass = isUnavailable
                    ? 'bg-slate-200 text-slate-500 border-slate-300 font-semibold cursor-not-allowed'
                    : mode === 'block'
                      ? 'bg-rose-100 text-rose-900 border-rose-200 font-semibold cursor-pointer'
                      : 'bg-blue-100 text-[#061f4d] border-blue-200 font-semibold cursor-pointer';
                } else if (isOtaBooked) {
                  // Room-type mode: some rooms booked on Airbnb/OTA, others still open
                  tileClass =
                    'bg-orange-50/60 text-slate-800 border-orange-200 hover:bg-blue-50 hover:border-[#0a367a] cursor-pointer';
                }

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isUnselectable}
                    aria-disabled={isUnselectable}
                    onClick={() => {
                      if (!isUnselectable) handleDayClick(cell);
                    }}
                    title={
                      isPastDate
                        ? 'Past date — unavailable'
                        : canBeTurnoverCheckout
                          ? `Check-out allowed (morning turnover) · Next booking starts ${formatPrettyDate(cell.iso)}`
                          : isUnselectable
                            ? `Unavailable — ${cell.info.detail}`
                            : cell.info.detail
                    }
                    className={`relative h-9 rounded-lg border text-xs font-mono-tabular flex flex-col items-center justify-center transition-all ${tileClass} ${
                      !cell.inMonth ? 'opacity-40' : ''
                    } ${isToday && !isCheckIn && !isCheckOut ? 'ring-1 ring-[#0a367a]' : ''}`}
                  >
                    <span className="leading-none">{cell.dayNum}</span>
                    {!isCheckIn && !isCheckOut && !isPastDate && isOtaBooked && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                          isUnselectable ? 'bg-slate-400' : 'bg-orange-600'
                        }`}
                      />
                    )}
                    {!isCheckIn && !isCheckOut && !isPastDate && !isOtaBooked && isReservedLike && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                          isUnselectable ? 'bg-slate-400' : 'bg-amber-600'
                        }`}
                      />
                    )}
                    {!isCheckIn && !isCheckOut && !isPastDate && (isBlocked || isOoo) && (
                      <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-slate-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Clean Color Legend */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-white border border-slate-300" />
                Available
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-[#0a367a]" />
                Selected
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300" />
                Unavailable (Greyed)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-orange-200 border border-orange-400" />
                Airbnb / OTA
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
