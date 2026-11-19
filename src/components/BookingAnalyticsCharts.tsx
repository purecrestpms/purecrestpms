import React, { useMemo, useState } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import {
  formatBookingSourceLabel,
  formatNgn,
  formatUsd,
  getReservationPaymentSummary,
  isOtaBookingChannel,
  ReservationRecord,
} from '../types/pms';

export interface MonthlyTrendPoint {
  key: string; // YYYY-MM
  label: string; // Jan, Feb, ...
  fullLabel: string; // Jan 2026
  bookings: number;
  revenueNgn: number;
}

export interface BookingSourceSlice {
  label: string;
  count: number;
  pct: number;
  ngnTotal: number;
  usdTotal: number;
  color: string;
}

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const SOURCE_COLOR_MAP: Record<string, string> = {
  Direct: '#16a34a',
  'Booking.com': '#2563eb',
  Airbnb: '#f59e0b',
  Expedia: '#7c3aed',
  VRBO: '#0d9488',
  Corporate: '#0284c7',
  Other: '#64748b',
};

/**
 * Normalizes a reservation channel into a clean executive reporting bucket
 * (Direct, Booking.com, Airbnb, Expedia, VRBO, Corporate, Other).
 */
export function normalizeSourceGroup(channel?: string): string {
  const label = formatBookingSourceLabel(channel || '');
  const lower = label.toLowerCase();
  if (lower.includes('booking.com') || lower.includes('booking')) return 'Booking.com';
  if (lower.includes('airbnb')) return 'Airbnb';
  if (lower.includes('expedia')) return 'Expedia';
  if (lower.includes('vrbo')) return 'VRBO';
  if (lower.includes('corporate')) return 'Corporate';
  if (
    lower.includes('direct') ||
    lower.includes('walk') ||
    lower.includes('phone') ||
    lower.includes('whatsapp') ||
    lower.includes('web')
  ) {
    return 'Direct';
  }
  return 'Other';
}

/**
 * Formats NGN values compactly for Y-axis & bar top labels (e.g., ₦1.2M, ₦450K, ₦0).
 */
export function formatCompactNgn(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    return `${sign}₦${val >= 10 ? val.toFixed(1) : val.toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    return `${sign}₦${val >= 100 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `${sign}₦${Math.round(abs)}`;
}

/**
 * Computes a clean 6-month (or N-month) time series of non-cancelled bookings & revenue.
 */
export function buildMonthlyBookingTrend(
  reservations: ReservationRecord[],
  usdExchangeRateNgn?: number,
  monthsCount = 6,
  anchorIso?: string
): MonthlyTrendPoint[] {
  const today = anchorIso ? new Date(`${anchorIso.slice(0, 10)}T00:00:00Z`) : new Date();
  const anchorYear = today.getUTCFullYear();
  const anchorMonth = today.getUTCMonth();

  const buckets: MonthlyTrendPoint[] = [];
  const bucketMap = new Map<string, MonthlyTrendPoint>();

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(anchorYear, anchorMonth - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const point: MonthlyTrendPoint = {
      key,
      label: MONTH_SHORT_NAMES[m],
      fullLabel: `${MONTH_SHORT_NAMES[m]} ${y}`,
      bookings: 0,
      revenueNgn: 0,
    };
    buckets.push(point);
    bucketMap.set(key, point);
  }

  for (const r of reservations) {
    if (r.status === 'cancelled' || r.status === 'no_show') continue;
    const fallbackDate =
      typeof r.createdAt === 'string'
        ? r.createdAt
        : r.createdAt?.toDate?.()?.toISOString() || '';
    const rawDate = (r.checkInDate || fallbackDate).slice(0, 7);
    const point = bucketMap.get(rawDate);
    if (!point) continue;
    const pay = getReservationPaymentSummary(r, usdExchangeRateNgn);
    const rev = isOtaBookingChannel(r.channel) ? pay.expectedPayoutNgn : pay.totalAmount;
    point.bookings += 1;
    point.revenueNgn += rev;
  }

  return buckets;
}

/**
 * Computes grouped Bookings by Source slices with exact percentages, counts, and NGN/USD totals.
 */
export function buildBookingsBySource(
  reservations: ReservationRecord[],
  usdExchangeRateNgn?: number
): BookingSourceSlice[] {
  const nonCancelled = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'no_show'
  );
  const map = new Map<string, { label: string; count: number; ngnTotal: number; usdTotal: number }>();

  for (const r of nonCancelled) {
    const label = normalizeSourceGroup(r.channel);
    const pay = getReservationPaymentSummary(r, usdExchangeRateNgn);
    const cur = map.get(label) || { label, count: 0, ngnTotal: 0, usdTotal: 0 };
    cur.count += 1;
    cur.ngnTotal += isOtaBookingChannel(r.channel) ? pay.expectedPayoutNgn : pay.totalAmount;
    if (pay.sourceCurrency === 'USD') {
      cur.usdTotal += pay.otaPaidSourceAmount > 0 ? pay.otaPaidSourceAmount : pay.sourceTotalAmount;
    }
    map.set(label, cur);
  }

  const total = nonCancelled.length;
  const fallbackPalette = ['#16a34a', '#2563eb', '#f59e0b', '#7c3aed', '#0d9488', '#64748b'];

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || b.ngnTotal - a.ngnTotal)
    .map((item, idx) => ({
      ...item,
      pct: total > 0 ? Math.round((item.count / total) * 100) : 0,
      color: SOURCE_COLOR_MAP[item.label] || fallbackPalette[idx % fallbackPalette.length],
    }));
}

interface MonthlyTrendBarChartProps {
  title?: string;
  data: MonthlyTrendPoint[];
  defaultMetric?: 'bookings' | 'revenue';
  allowMetricToggle?: boolean;
  headerTone?: 'emerald' | 'navy';
  actionLink?: { label: string; onClick: () => void };
}

export const MonthlyTrendBarChart: React.FC<MonthlyTrendBarChartProps> = ({
  title,
  data,
  defaultMetric = 'bookings',
  allowMetricToggle = false,
  headerTone = 'emerald',
  actionLink,
}) => {
  const [metric, setMetric] = useState<'bookings' | 'revenue'>(defaultMetric);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const values = data.map((d) => (metric === 'bookings' ? d.bookings : d.revenueNgn));
  const rawMax = Math.max(...values, 0);

  // Compute crisp rounded Y-axis ceiling & ticks
  const { yMax, yTicks } = useMemo(() => {
    if (rawMax <= 0) {
      if (metric === 'bookings') return { yMax: 10, yTicks: [0, 5, 10] };
      return { yMax: 500_000, yTicks: [0, 250_000, 500_000] };
    }
    if (metric === 'bookings') {
      const step =
        rawMax <= 5 ? 1 : rawMax <= 15 ? 5 : rawMax <= 30 ? 10 : rawMax <= 60 ? 20 : Math.ceil(rawMax / 3 / 10) * 10;
      const ceil = Math.max(step * 3, Math.ceil(rawMax / step) * step);
      const ticks: number[] = [];
      const count = ceil / step <= 5 ? Math.round(ceil / step) : 4;
      const effStep = ceil / count;
      for (let i = 0; i <= count; i += 1) ticks.push(Math.round(i * effStep));
      return { yMax: ceil, yTicks: ticks };
    }
    // Revenue scale
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const normalized = rawMax / magnitude;
    const niceMult = normalized <= 1.2 ? 1.2 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    const ceil = Math.ceil((niceMult * magnitude) / 1000) * 1000;
    return {
      yMax: ceil,
      yTicks: [0, Math.round(ceil * 0.25), Math.round(ceil * 0.5), Math.round(ceil * 0.75), ceil],
    };
  }, [rawMax, metric]);

  const resolvedTitle =
    title || (metric === 'bookings' ? 'Booking Trends' : 'Monthly Revenue');

  const headerBg =
    headerTone === 'navy'
      ? 'bg-gradient-to-r from-[#061539] to-[#0f2c6e]'
      : 'bg-gradient-to-r from-[#0c562c] to-[#136f3b]';

  const hoveredItem = hoveredIdx !== null ? data[hoveredIdx] : null;
  const totalBookings = data.reduce((s, d) => s + d.bookings, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenueNgn, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
      {/* Crisp Solid Header Bar */}
      <div className={`${headerBg} px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-white`}>
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-emerald-300 shrink-0" />
          <h3 className="font-display text-sm font-bold tracking-tight truncate">
            {resolvedTitle}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {allowMetricToggle && (
            <div className="inline-flex items-center rounded-lg bg-white/15 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setMetric('bookings')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  metric === 'bookings'
                    ? 'bg-white text-[#061539] shadow-2xs'
                    : 'text-white/90 hover:text-white'
                }`}
              >
                Bookings
              </button>
              <button
                type="button"
                onClick={() => setMetric('revenue')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  metric === 'revenue'
                    ? 'bg-white text-[#061539] shadow-2xs'
                    : 'text-white/90 hover:text-white'
                }`}
              >
                Revenue
              </button>
            </div>
          )}
          {actionLink && (
            <button
              type="button"
              onClick={actionLink.onClick}
              className="text-[11px] font-semibold text-white/90 hover:text-white hover:underline cursor-pointer"
            >
              {actionLink.label}
            </button>
          )}
        </div>
      </div>

      {/* Chart Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
        {/* Top Meta / Legend Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-slate-600 min-h-[18px]">
            {hoveredItem ? (
              <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                <span className="font-bold text-[#061539]">{hoveredItem.fullLabel}:</span>
                <span className="font-mono-tabular font-bold text-emerald-700">
                  {hoveredItem.bookings} {hoveredItem.bookings === 1 ? 'booking' : 'bookings'}
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-mono-tabular font-semibold text-slate-700">
                  {formatNgn(hoveredItem.revenueNgn)}
                </span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">
                6-month total:{' '}
                <strong className="font-mono-tabular text-slate-800">{totalBookings}</strong> bookings ·{' '}
                <strong className="font-mono-tabular text-slate-800">{formatNgn(totalRevenue)}</strong>
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            {metric === 'bookings' ? 'Bookings' : 'Revenue (₦)'}
          </span>
        </div>

        {/* Plot Area */}
        <div className="relative pt-5 pb-1">
          <div className="flex items-stretch gap-3">
            {/* Y-Axis Labels */}
            <div className="w-11 sm:w-12 flex flex-col justify-between text-right pr-1 text-[11px] font-mono-tabular text-slate-500 h-[184px] shrink-0">
              {[...yTicks].reverse().map((tick) => (
                <span key={tick} className="leading-none -translate-y-1/2 first:translate-y-0 last:translate-y-0">
                  {metric === 'bookings' ? tick : formatCompactNgn(tick)}
                </span>
              ))}
            </div>

            {/* Bars + Horizontal Gridlines */}
            <div className="relative flex-1 h-[184px] border-l border-b border-slate-200">
              {/* Gridlines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[...yTicks].reverse().map((tick, idx) => (
                  <div
                    key={tick}
                    className={`w-full border-t ${
                      idx === yTicks.length - 1 ? 'border-transparent' : 'border-slate-100'
                    }`}
                  />
                ))}
              </div>

              {/* Bars */}
              <div className="relative z-10 h-full flex items-end justify-around gap-2 sm:gap-3 px-2 sm:px-4">
                {data.map((point, idx) => {
                  const val = metric === 'bookings' ? point.bookings : point.revenueNgn;
                  const pct = yMax > 0 ? Math.min(100, (val / yMax) * 100) : 0;
                  const isHovered = hoveredIdx === idx;
                  const barLabel =
                    metric === 'bookings'
                      ? String(point.bookings)
                      : point.revenueNgn > 0
                        ? formatCompactNgn(point.revenueNgn)
                        : '₦0';

                  return (
                    <div
                      key={point.key}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      className="flex-1 max-w-[68px] h-full flex flex-col items-center justify-end group cursor-pointer"
                    >
                      <span
                        className={`font-mono-tabular text-[11px] sm:text-xs font-bold mb-1.5 transition-colors whitespace-nowrap ${
                          isHovered ? 'text-emerald-800 scale-105' : 'text-slate-800'
                        }`}
                      >
                        {barLabel}
                      </span>
                      <div
                        className={`w-full rounded-t-md transition-all duration-300 ${
                          val === 0
                            ? 'bg-slate-200/80'
                            : isHovered
                              ? 'bg-gradient-to-t from-[#0a6b34] to-[#16a34a] shadow-sm'
                              : 'bg-gradient-to-t from-[#0d7a3c] to-[#19a853]'
                        }`}
                        style={{
                          height: val > 0 ? `${Math.max(6, pct)}%` : '3px',
                        }}
                        title={`${point.fullLabel}: ${point.bookings} bookings · ${formatNgn(point.revenueNgn)}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* X-Axis Month Labels */}
          <div className="flex items-center gap-3 mt-2">
            <div className="w-11 sm:w-12 shrink-0" />
            <div className="flex-1 flex items-center justify-around gap-2 sm:gap-3 px-2 sm:px-4">
              {data.map((point, idx) => (
                <span
                  key={point.key}
                  className={`flex-1 max-w-[68px] text-center text-xs font-semibold transition-colors ${
                    hoveredIdx === idx ? 'text-[#061539]' : 'text-slate-600'
                  }`}
                >
                  {point.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface BookingsBySourcePieChartProps {
  title?: string;
  slices: BookingSourceSlice[];
  variant?: 'pie' | 'donut';
  headerTone?: 'emerald' | 'navy';
  actionLink?: { label: string; onClick: () => void };
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function buildPieSlicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export const BookingsBySourcePieChart: React.FC<BookingsBySourcePieChartProps> = ({
  title = 'Bookings by Source',
  slices,
  variant = 'pie',
  headerTone = 'emerald',
  actionLink,
}) => {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const totalCount = slices.reduce((sum, s) => sum + s.count, 0);
  const hoveredSlice = hoveredLabel ? slices.find((s) => s.label === hoveredLabel) || null : null;

  const headerBg =
    headerTone === 'navy'
      ? 'bg-gradient-to-r from-[#061539] to-[#0f2c6e]'
      : 'bg-gradient-to-r from-[#0c562c] to-[#136f3b]';

  // Build SVG arc segments
  const segments = useMemo(() => {
    if (totalCount === 0) return [];
    let currentAngle = 0;
    return slices.map((slice) => {
      const sweep = (slice.count / totalCount) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const midAngle = startAngle + sweep / 2;
      currentAngle = endAngle;
      return {
        ...slice,
        startAngle,
        endAngle,
        midAngle,
        sweep,
      };
    });
  }, [slices, totalCount]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
      {/* Crisp Solid Header Bar */}
      <div className={`${headerBg} px-4 py-3 flex items-center justify-between gap-2 text-white`}>
        <div className="flex items-center gap-2 min-w-0">
          <PieChart className="w-4 h-4 text-emerald-300 shrink-0" />
          <h3 className="font-display text-sm font-bold tracking-tight truncate">{title}</h3>
        </div>
        {actionLink && (
          <button
            type="button"
            onClick={actionLink.onClick}
            className="text-[11px] font-semibold text-white/90 hover:text-white hover:underline shrink-0 cursor-pointer"
          >
            {actionLink.label}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
        {totalCount === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center gap-2">
            <div className="w-24 h-24 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-400">
              No Data
            </div>
            <p className="text-xs text-slate-500 max-w-[240px]">
              Channel breakdown appears automatically as bookings arrive from Direct, Booking.com, Airbnb, or Expedia.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 flex-1 py-1">
            {/* SVG Pie / Donut */}
            <div className="relative w-[178px] h-[178px] shrink-0">
              <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                {segments.length === 1 ? (
                  <g
                    onMouseEnter={() => setHoveredLabel(segments[0].label)}
                    onMouseLeave={() => setHoveredLabel(null)}
                    className="cursor-pointer"
                  >
                    <circle cx="100" cy="100" r="88" fill={segments[0].color} />
                    {variant === 'pie' && (
                      <text
                        x="100"
                        y="104"
                        textAnchor="middle"
                        className="fill-white text-[16px] font-extrabold pointer-events-none"
                      >
                        100%
                      </text>
                    )}
                  </g>
                ) : (
                  segments.map((seg) => {
                    const isHovered = hoveredLabel === seg.label;
                    const labelPos = polarToCartesian(100, 100, 56, seg.midAngle);
                    const path = buildPieSlicePath(
                      100,
                      100,
                      isHovered ? 92 : 88,
                      seg.startAngle,
                      seg.endAngle
                    );
                    return (
                      <g
                        key={seg.label}
                        onMouseEnter={() => setHoveredLabel(seg.label)}
                        onMouseLeave={() => setHoveredLabel(null)}
                        className="cursor-pointer transition-opacity"
                        style={{
                          opacity: hoveredLabel && !isHovered ? 0.72 : 1,
                        }}
                      >
                        <path
                          d={path}
                          fill={seg.color}
                          stroke="#ffffff"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                        />
                        {variant === 'pie' && seg.pct >= 8 && (
                          <text
                            x={labelPos.x}
                            y={labelPos.y + 4}
                            textAnchor="middle"
                            className="fill-white text-[13px] font-bold pointer-events-none"
                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.28)' }}
                          >
                            {seg.pct}%
                          </text>
                        )}
                      </g>
                    );
                  })
                )}

                {/* Center Cutout for Donut Variant */}
                {variant === 'donut' && (
                  <g className="pointer-events-none">
                    <circle cx="100" cy="100" r="52" fill="#ffffff" />
                    <text
                      x="100"
                      y="96"
                      textAnchor="middle"
                      className="fill-[#061539] text-[24px] font-extrabold"
                    >
                      {hoveredSlice ? hoveredSlice.count : totalCount}
                    </text>
                    <text
                      x="100"
                      y="115"
                      textAnchor="middle"
                      className="fill-slate-500 text-[12px] font-semibold"
                    >
                      {hoveredSlice ? hoveredSlice.label : 'Bookings'}
                    </text>
                  </g>
                )}
              </svg>
            </div>

            {/* Clean Right-Aligned Legend */}
            <div className="w-full sm:flex-1 space-y-2.5 min-w-[140px]">
              {segments.map((seg) => {
                const isHovered = hoveredLabel === seg.label;
                return (
                  <button
                    key={seg.label}
                    type="button"
                    onMouseEnter={() => setHoveredLabel(seg.label)}
                    onMouseLeave={() => setHoveredLabel(null)}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      isHovered ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                        {seg.label}
                      </span>
                    </span>
                    <span className="font-mono-tabular text-xs sm:text-sm font-bold text-[#061539] shrink-0">
                      {variant === 'donut' ? `${seg.pct}%` : seg.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Subtle Context Strip */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500 min-h-[24px]">
          {hoveredSlice ? (
            <>
              <span className="font-semibold text-slate-700 truncate">
                {hoveredSlice.label}: {hoveredSlice.count}{' '}
                {hoveredSlice.count === 1 ? 'booking' : 'bookings'} ({hoveredSlice.pct}%)
              </span>
              <span className="font-mono-tabular font-bold text-slate-800 shrink-0">
                {hoveredSlice.usdTotal > 0
                  ? `${formatUsd(hoveredSlice.usdTotal)} · ${formatNgn(hoveredSlice.ngnTotal)}`
                  : formatNgn(hoveredSlice.ngnTotal)}
              </span>
            </>
          ) : (
            <>
              <span>Active &amp; completed stays across {slices.length} {slices.length === 1 ? 'source' : 'sources'}</span>
              <span className="font-mono-tabular font-semibold text-slate-700 shrink-0">
                {totalCount} total
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
