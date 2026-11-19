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
import { BlockedDateRecord, ReservationRecord, RoomRecord } from '../types/pms';
import {
  addDaysIso,
  checkDayStatusForRoom,
  checkRoomDateRangeAvailability,
  diffNightsIso,
  findAvailableRoomsForRange,
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
}) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [openField, setOpenField] = useState<'none' | 'check_in' | 'check_out'>('none');
  const [clickNotice, setClickNotice] = useState<string | null>(null);

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

  // Compute day-by-day availability for all 42 visible cells
  const cellStatuses = useMemo(() => {
    const pool = room
      ? [room]
      : roomType
        ? rooms.filter((r) => r.roomType === roomType)
        : rooms;

    return monthCells.map((cell) => {
      if (room) {
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
      const openCount = pool.filter(
        (candidate) =>
          checkDayStatusForRoom({
            room: candidate,
            dayIso: cell.iso,
            reservations,
            blockedDates,
            excludeReservationId,
          }).available
      ).length;
      if (openCount > 0) {
        return {
          ...cell,
          info: {
            status: 'available' as const,
            available: true,
            label: `${openCount}/${pool.length} open`,
            detail: `${openCount} of ${pool.length} ${roomType || 'rooms'} open on ${formatPrettyDate(cell.iso)}`,
          },
        };
      }
      return {
        ...cell,
        info: {
          status: 'reserved' as const,
          available: false,
          label: 'Full',
          detail: `All ${pool.length} ${roomType || 'rooms'} are reserved or blocked on ${formatPrettyDate(cell.iso)}.`,
        },
      };
    });
  }, [monthCells, room, roomType, rooms, reservations, blockedDates, excludeReservationId]);

  const nights = checkInDate && checkOutDate && checkOutDate > checkInDate
    ? diffNightsIso(checkInDate, checkOutDate)
    : 1;

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth());
  };

  const handleDayClick = (cell: (typeof cellStatuses)[number]) => {
    setClickNotice(null);

    if (openField === 'check_in' && !lockCheckIn) {
      if (!cell.info.available) {
        setClickNotice(
          `${formatPrettyDate(cell.iso)} is unavailable — ${cell.info.detail}`
        );
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
        if (!cell.info.available) {
          setClickNotice(`${formatPrettyDate(cell.iso)} is unavailable — ${cell.info.detail}`);
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
        setClickNotice(
          `Cannot check out on ${formatPrettyDate(cell.iso)}: ${rangeTest.message}`
        );
        return;
      }

      onChangeDates(checkInDate, cell.iso);
      setOpenField('none');
    }
  };

  const accentBorder = !rangeCheck.available
    ? 'border-rose-400 ring-1 ring-rose-200 bg-rose-50/30'
    : openField !== 'none'
      ? 'border-emerald-600 ring-2 ring-emerald-600/15 bg-white'
      : 'border-slate-200 bg-white hover:border-emerald-500';

  return (
    <div ref={containerRef} className="relative space-y-2.5">
      {/* Dual Date Triggers */}
      <div className={`grid ${lockCheckIn ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-3`}>
        {!lockCheckIn && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              {checkInLabel}
            </label>
            <button
              type="button"
              onClick={() => openCalendarFor('check_in')}
              className={`w-full h-10 px-3 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                openField === 'check_in'
                  ? 'border-emerald-600 ring-2 ring-emerald-600/15 bg-white'
                  : accentBorder
              }`}
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <CalendarIcon
                  className={`w-4 h-4 shrink-0 ${
                    !rangeCheck.available ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                />
                <span className="font-mono-tabular text-xs font-semibold text-slate-900 truncate">
                  {formatPrettyDate(checkInDate)}
                </span>
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  !rangeCheck.available
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {!rangeCheck.available ? 'Conflict' : 'Open'}
              </span>
            </button>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            {checkOutLabel}
          </label>
          <button
            type="button"
            onClick={() => openCalendarFor('check_out')}
            className={`w-full h-10 px-3 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
              openField === 'check_out'
                ? 'border-emerald-600 ring-2 ring-emerald-600/15 bg-white'
                : accentBorder
            }`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <CalendarIcon
                className={`w-4 h-4 shrink-0 ${
                  !rangeCheck.available ? 'text-rose-600' : 'text-emerald-700'
                }`}
              />
              <span className="font-mono-tabular text-xs font-semibold text-slate-900 truncate">
                {formatPrettyDate(checkOutDate)}
              </span>
            </span>
            <span className="font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
              {nights}n
            </span>
          </button>
        </div>
      </div>

      {/* Live Availability Status Strip */}
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] flex flex-col gap-2 ${
          rangeCheck.available
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {rangeCheck.available ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : rangeCheck.status === 'blocked' || rangeCheck.status === 'out_of_order' ? (
              <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span className="font-medium leading-snug">{rangeCheck.message}</span>
          </div>
          <button
            type="button"
            onClick={() => openCalendarFor(lockCheckIn ? 'check_out' : 'check_in')}
            className={`text-[11px] font-bold underline shrink-0 cursor-pointer ${
              rangeCheck.available ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {openField === 'none' ? 'Check Calendar' : 'Hide Calendar'}
          </button>
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
                className="px-2 py-0.5 rounded-md bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold text-[11px] transition-colors cursor-pointer"
              >
                Switch to {alt.roomNumber} ({alt.roomType})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recreated Interactive Visual Availability Calendar Popover */}
      {openField !== 'none' && (
        <div
          className={`z-40 mt-1 w-full ${
            compact ? 'sm:w-[340px]' : 'sm:w-[370px]'
          } bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden absolute left-0`}
        >
          {/* Crisp Emerald Header */}
          <div
            className={`${
              mode === 'block'
                ? 'bg-gradient-to-r from-rose-800 to-rose-700'
                : 'bg-gradient-to-r from-[#0c562c] to-[#136f3b]'
            } px-3.5 py-2.5 text-white flex items-center justify-between gap-2`}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                {openField === 'check_in' ? 'Step 1 · Select Check-In' : 'Step 2 · Select Check-Out'}
              </p>
              <p className="text-xs font-semibold truncate">
                {room
                  ? `${room.roomNumber} · ${room.roomType}`
                  : roomType
                    ? `${roomType} Availability`
                    : 'Property Availability'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenField('none')}
              className="p-1 rounded-lg hover:bg-white/15 text-white cursor-pointer"
              aria-label="Close calendar"
            >
              <X className="w-4 h-4" />
            </button>
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

                const isReservedLike =
                  cell.info.status === 'reserved' ||
                  cell.info.status === 'checked_in' ||
                  cell.info.status === 'pending';
                const isBlocked = cell.info.status === 'blocked';
                const isOoo = cell.info.status === 'out_of_order';
                const isUnavailable = !cell.info.available;

                // Turnover rule: when picking check-out, a reserved/blocked day can still be a valid check-out
                // if all nights strictly before it are free
                const canBeTurnoverCheckout =
                  openField === 'check_out' &&
                  cell.iso > checkInDate &&
                  isUnavailable &&
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

                let tileClass =
                  'bg-white text-slate-800 hover:bg-emerald-50 hover:border-emerald-500 border-transparent';

                if (isCheckIn || isCheckOut) {
                  tileClass =
                    mode === 'block'
                      ? 'bg-rose-700 text-white font-extrabold border-rose-700 shadow-2xs'
                      : 'bg-[#0c562c] text-white font-extrabold border-[#0c562c] shadow-2xs';
                } else if (isInRange) {
                  tileClass = isUnavailable
                    ? 'bg-rose-200 text-rose-900 border-rose-400 font-bold'
                    : mode === 'block'
                      ? 'bg-rose-100 text-rose-900 border-rose-200 font-semibold'
                      : 'bg-emerald-100 text-emerald-950 border-emerald-200 font-semibold';
                } else if (isBlocked || isOoo) {
                  tileClass = canBeTurnoverCheckout
                    ? 'bg-rose-50 text-rose-800 border-rose-300 border-dashed hover:bg-emerald-50'
                    : 'bg-rose-100/90 text-rose-700 border-rose-200 line-through decoration-rose-500/70';
                } else if (isReservedLike) {
                  tileClass = canBeTurnoverCheckout
                    ? 'bg-amber-50 text-amber-900 border-amber-300 border-dashed hover:bg-emerald-50'
                    : 'bg-amber-100/90 text-amber-900 border-amber-300/80';
                }

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => handleDayClick(cell)}
                    title={
                      canBeTurnoverCheckout
                        ? `Check-out allowed (morning turnover) · Next booking starts ${formatPrettyDate(cell.iso)}`
                        : cell.info.detail
                    }
                    className={`relative h-9 rounded-lg border text-xs font-mono-tabular flex flex-col items-center justify-center transition-all cursor-pointer ${tileClass} ${
                      !cell.inMonth ? 'opacity-40' : ''
                    } ${isToday && !isCheckIn && !isCheckOut ? 'ring-1 ring-[#1c46be]' : ''}`}
                  >
                    <span className="leading-none">{cell.dayNum}</span>
                    {!isCheckIn && !isCheckOut && isReservedLike && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                          cell.info.status === 'checked_in'
                            ? 'bg-emerald-600'
                            : cell.info.status === 'pending'
                              ? 'bg-violet-600'
                              : 'bg-amber-600'
                        }`}
                      />
                    )}
                    {!isCheckIn && !isCheckOut && (isBlocked || isOoo) && (
                      <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-rose-600" />
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
                <span className="w-2.5 h-2.5 rounded bg-[#0c562c]" />
                Selected
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-200 border border-amber-400" />
                Reserved
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-200 border border-rose-400" />
                Blocked / Unavail.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
