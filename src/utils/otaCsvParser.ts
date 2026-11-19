import { ChannelCurrency, ReservationRecord } from '../types/pms';

export interface ParsedOtaCsvRow {
  rowNumber: number;
  externalRef: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestCountry?: string;
  roomLabel?: string;
  roomHint?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;
  currency: ChannelCurrency;
  sourceNightlyRate?: number;
  sourceTotalAmount?: number;
  otaPaidSourceAmount?: number;
  expectedPayoutSourceAmount?: number;
  expectedPayoutNgn?: number;
  hotelPaidNgn?: number;
  directPaidNgn?: number;
  status: 'confirmed' | 'pending' | 'cancelled';
  channelOverride?: ReservationRecord['channel'];
}

export interface OtaCsvParseResult {
  rows: ParsedOtaCsvRow[];
  skipped: Array<{ rowNumber: number; reason: string }>;
  skippedRows: number;
  warnings: string[];
  detectedHeaders: string[];
}

function parseCsvMatrix(csvText: string): string[][] {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseFlexibleIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slash) {
    let a = Number(slash[1]);
    let b = Number(slash[2]);
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    // If first part > 12, it is DD/MM/YYYY; otherwise default MM/DD/YYYY (Airbnb standard)
    let m = a;
    let d = b;
    if (a > 12 && b <= 12) {
      d = a;
      m = b;
    }
    if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // "12 Nov 2026" or "Nov 12, 2026"
  const namedA = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (namedA) {
    const d = Number(namedA[1]);
    const m = MONTH_MAP[namedA[2].toLowerCase()];
    const y = Number(namedA[3]);
    if (m && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const namedB = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedB) {
    const m = MONTH_MAP[namedB[1].toLowerCase()];
    const d = Number(namedB[2]);
    const y = Number(namedB[3]);
    if (m && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days)).toISOString().slice(0, 10);
}

function diffNights(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${endIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

function detectCurrencyFromCell(raw: string): ChannelCurrency | undefined {
  const s = raw.trim().toUpperCase();
  if (!s) return undefined;
  if (s.includes('USD') || s.includes('US$') || s.includes('$')) return 'USD';
  if (s.includes('GBP') || s.includes('£')) return 'GBP';
  if (s.includes('EUR') || s.includes('€')) return 'EUR';
  if (s.includes('NGN') || s.includes('₦') || /\bNAIRA\b/.test(s)) return 'NGN';
  return undefined;
}

function parseMoneyCell(raw: string): { amount?: number; currency?: ChannelCurrency } {
  const s = raw.trim();
  if (!s) return {};
  const currency = detectCurrencyFromCell(s);
  const numMatch = s.match(/-?\d[\d,]*(?:\.\d{1,2})?/);
  if (!numMatch) return { currency };
  const val = Number(numMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(val) || val < 0) return { currency };
  return { amount: Number(val.toFixed(2)), currency };
}

function detectChannelOverride(raw: string): ReservationRecord['channel'] | undefined {
  const lower = raw.trim().toLowerCase();
  if (!lower) return undefined;
  if (lower.includes('airbnb')) return 'Airbnb';
  if (lower.includes('booking')) return 'Booking.com';
  if (lower.includes('expedia')) return 'Expedia';
  if (lower.includes('vrbo')) return 'VRBO';
  if (lower.includes('hotels.ng') || lower.includes('hotelsng')) return 'Booking.com';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('phone')) return 'Phone';
  if (lower.includes('website') || lower.includes('web')) return 'Website';
  if (lower.includes('walk')) return 'Walk-in';
  return undefined;
}

export function parseOtaCsvText(
  csvText: string,
  defaultCurrency: ChannelCurrency = 'USD'
): OtaCsvParseResult {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    const msg = 'CSV file must contain a header row and at least one reservation row.';
    return {
      rows: [],
      skipped: [{ rowNumber: 1, reason: msg }],
      skippedRows: 1,
      warnings: [msg],
      detectedHeaders: matrix[0] || [],
    };
  }

  const rawHeaders = matrix[0];
  const headers = rawHeaders.map(normalizeHeader);

  const findCol = (candidates: string[]): number => {
    for (const cand of candidates) {
      const exact = headers.indexOf(cand);
      if (exact !== -1) return exact;
    }
    for (const cand of candidates) {
      const partial = headers.findIndex((h) => h.includes(cand));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  const colRef = findCol([
    'confirmation code',
    'book number',
    'booking number',
    'booking ref',
    'reservation id',
    'reservation code',
    'reference',
    'confirmation',
    'id',
  ]);
  const colGuest = findCol(['guest name', 'guest', 'booker name', 'booked by', 'full name', 'name']);
  const colFirst = findCol(['first name', 'guest first name']);
  const colLast = findCol(['last name', 'guest last name', 'surname']);
  const colPhone = findCol(['contact', 'phone', 'guest phone', 'phone number', 'telephone', 'mobile']);
  const colEmail = findCol(['email', 'guest email', 'email address']);
  const colCountry = findCol(['country', 'guest country', 'nationality', 'booker country']);
  const colRoom = findCol(['room', 'room number', 'unit', 'listing', 'listing name', 'apartment', 'suite', 'room type']);
  const colCheckIn = findCol(['start date', 'check in', 'checkin', 'check in date', 'arrival', 'arrival date']);
  const colCheckOut = findCol(['end date', 'check out', 'checkout', 'check out date', 'departure', 'departure date']);
  const colNights = findCol(['nights', 'of nights', 'no of nights', 'room nights']);
  const colAdults = findCol(['adults', 'of adults', 'guests', 'persons']);
  const colChildren = findCol(['children', 'of children', 'kids']);
  const colCurrency = findCol(['currency', 'booking currency', 'price currency']);
  const colNightlyRate = findCol(['nightly rate', 'rate per night', 'daily rate', 'rate']);
  const colGuestPaid = findCol([
    'guest paid',
    'paid to ota',
    'ota paid',
    'amount paid',
    'total paid',
    'gross earnings',
    'gross',
    'price',
    'total price',
    'total amount',
    'amount',
  ]);
  const colPayout = findCol([
    'expected payout ngn',
    'payout ngn',
    'earnings',
    'paid out',
    'host payout',
    'net payout',
    'payout',
  ]);
  const colDirectPaid = findCol(['direct payment ngn', 'direct paid', 'hotel paid', 'direct payment']);
  const colStatus = findCol(['status', 'reservation status', 'booking status']);
  const colChannel = findCol(['channel', 'source', 'booking source', 'platform', 'ota']);

  const rows: ParsedOtaCsvRow[] = [];
  const skipped: Array<{ rowNumber: number; reason: string }> = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const cols = matrix[i];
    const rowNumber = i + 1;
    const cell = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');

    const checkInDate = parseFlexibleIsoDate(cell(colCheckIn));
    let checkOutDate = parseFlexibleIsoDate(cell(colCheckOut));
    const parsedNightsCol = Number(cell(colNights));

    if (!checkInDate) {
      skipped.push({ rowNumber, reason: 'Missing or invalid check-in / start date' });
      continue;
    }

    if (!checkOutDate) {
      const n = Number.isFinite(parsedNightsCol) && parsedNightsCol >= 1 ? Math.round(parsedNightsCol) : 1;
      checkOutDate = addDaysIso(checkInDate, n);
    }
    if (checkOutDate <= checkInDate) {
      checkOutDate = addDaysIso(checkInDate, 1);
    }

    const nights = diffNights(checkInDate, checkOutDate);
    let guestName = cell(colGuest);
    if (!guestName && (colFirst >= 0 || colLast >= 0)) {
      guestName = `${cell(colFirst)} ${cell(colLast)}`.trim();
    }
    if (!guestName) {
      guestName = `OTA Guest (${checkInDate})`;
    }

    const statusRaw = cell(colStatus).toLowerCase();
    const status: ParsedOtaCsvRow['status'] = statusRaw.includes('cancel')
      ? 'cancelled'
      : statusRaw.includes('pend') || statusRaw.includes('await') || statusRaw.includes('inquiry')
        ? 'pending'
        : 'confirmed';

    const curCell = detectCurrencyFromCell(cell(colCurrency));
    const paidParsed = parseMoneyCell(cell(colGuestPaid));
    const payoutParsed = parseMoneyCell(cell(colPayout));
    const nightlyParsed = parseMoneyCell(cell(colNightlyRate));
    const directPaidParsed = parseMoneyCell(cell(colDirectPaid));

    const currency: ChannelCurrency =
      curCell ||
      paidParsed.currency ||
      nightlyParsed.currency ||
      payoutParsed.currency ||
      defaultCurrency;

    const otaPaidSourceAmount = paidParsed.amount ?? payoutParsed.amount;
    const sourceTotalAmount =
      paidParsed.amount ??
      (nightlyParsed.amount ? Number((nightlyParsed.amount * nights).toFixed(2)) : undefined) ??
      payoutParsed.amount;
    const sourceNightlyRate =
      nightlyParsed.amount ??
      (sourceTotalAmount && nights > 0 ? Number((sourceTotalAmount / nights).toFixed(2)) : undefined);

    const payoutHeader = colPayout >= 0 ? headers[colPayout] : '';
    const payoutIsExplicitNgn =
      payoutHeader.includes('ngn') || payoutParsed.currency === 'NGN';

    const externalRef =
      cell(colRef) ||
      `CSV-${checkInDate.replace(/-/g, '')}-${guestName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || rowNumber}`;

    const adultsNum = Math.max(1, Math.min(12, Number(cell(colAdults)) || 1));
    const childrenNum = Math.max(0, Math.min(12, Number(cell(colChildren)) || 0));

    const roomText = cell(colRoom) || undefined;
    rows.push({
      rowNumber,
      externalRef,
      guestName,
      guestPhone: cell(colPhone) || undefined,
      guestEmail: cell(colEmail) || undefined,
      guestCountry: cell(colCountry) || undefined,
      roomLabel: roomText,
      roomHint: roomText,
      checkInDate,
      checkOutDate,
      nights,
      adults: adultsNum,
      children: childrenNum,
      currency,
      sourceNightlyRate,
      sourceTotalAmount,
      otaPaidSourceAmount,
      expectedPayoutSourceAmount: !payoutIsExplicitNgn ? payoutParsed.amount : undefined,
      expectedPayoutNgn: payoutIsExplicitNgn ? payoutParsed.amount : undefined,
      hotelPaidNgn: directPaidParsed.amount,
      directPaidNgn: directPaidParsed.amount,
      status,
      channelOverride: detectChannelOverride(cell(colChannel)),
    });
  }

  return {
    rows,
    skipped,
    skippedRows: skipped.length,
    warnings: skipped.map((s) => `Row ${s.rowNumber}: ${s.reason}`),
    detectedHeaders: rawHeaders,
  };
}

export function buildSampleOtaCsvTemplate(channelName?: string): string {
  const isDirectNgn = (channelName || '').toLowerCase().includes('direct');
  const currency = isDirectNgn ? 'NGN' : 'USD';
  const rate1 = isDirectNgn ? '120000' : '100.00';
  const paid1 = isDirectNgn ? '240000' : '200.00';
  const earn1 = isDirectNgn ? '240000' : '194.00';
  const rate2 = isDirectNgn ? '150000' : '95.00';
  const paid2 = isDirectNgn ? '450000' : '285.00';
  const earn2 = isDirectNgn ? '450000' : '242.25';
  return [
    'Confirmation code,Guest name,Contact,Email,Country,Listing,Start date,End date,Adults,Children,Currency,Nightly rate,Guest paid,Earnings,Status',
    `HM92XK48Q1,Adaeze Okafor,+1 404 555 0192,adaeze@example.com,United States,RM-1,2026-12-01,2026-12-03,2,0,${currency},${rate1},${paid1},${earn1},Confirmed`,
    `BK-77410922,David Mensah,+44 7700 900123,david.mensah@example.com,United Kingdom,RM-2,2026-12-05,2026-12-08,2,1,${currency},${rate2},${paid2},${earn2},Confirmed`,
  ].join('\n');
}
