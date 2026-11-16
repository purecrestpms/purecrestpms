import { BookingSourceOption, ChannelCurrency } from '../types/pms';

export interface ParsedIcalEvent {
  uid: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  nights: number;
  guestName: string;
  guestPhone?: string;
  summary: string;
  description: string;
  location: string;
  roomHint?: string;
  parsedCurrency?: ChannelCurrency;
  parsedNightlyRate?: number;
  parsedTotalAmount?: number;
  cancelled: boolean;
}

function unfoldIcalLines(raw: string): string[] {
  // RFC 5545 line unfolding: CRLF or LF followed by single space or tab
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const unfolded = normalized.replace(/\n[ \t]/g, '');
  return unfolded.split('\n');
}

function unescapeIcalText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcalDateToIso(rawVal: string): string | null {
  const val = rawVal.trim();
  // Match YYYYMMDD or YYYYMMDDTHHMMSS(Z)
  const match = val.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${month}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const dt = new Date(`${iso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffNights(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00Z`).getTime();
  const b = new Date(`${endIso}T12:00:00Z`).getTime();
  const diff = Math.round((b - a) / 86400000);
  return Math.max(0, diff);
}

function extractPhoneHint(text: string): string | undefined {
  const fullMatch = text.match(/(\+?\d[\d\s-]{6,16}\d)/);
  if (fullMatch) return fullMatch[1].trim().slice(0, 32);
  const last4 = text.match(/Last 4 Digits\):\s*(\d{4})/i);
  if (last4) return `***-${last4[1]}`;
  return undefined;
}

function extractRoomHint(summary: string, description: string, location: string): string | undefined {
  const combined = `${location}\n${summary}\n${description}`;
  const rmCode = combined.match(/\b(RM-\d{1,2})\b/i);
  if (rmCode) return rmCode[1].toUpperCase();

  const unitMatch = combined.match(/(?:Room|Suite|Unit|Listing|Apartment)\s*[:#-]\s*([^\n|;,()]{2,56})/i);
  if (unitMatch && unitMatch[1].trim()) {
    return unitMatch[1].trim();
  }

  const parenMatch = summary.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1].trim().length >= 2) {
    return parenMatch[1].trim();
  }

  if (location.trim().length >= 2) {
    return location.trim().slice(0, 64);
  }
  return undefined;
}

function normalizeCurrencyToken(token: string): ChannelCurrency | null {
  const t = token.trim().toUpperCase();
  if (t === 'USD' || t === 'US$' || t === '$') return 'USD';
  if (t === 'EUR' || t === '€') return 'EUR';
  if (t === 'GBP' || t === '£') return 'GBP';
  if (t === 'NGN' || t === '₦' || t === 'N') return 'NGN';
  return null;
}

function extractPriceAndCurrency(
  summary: string,
  description: string,
  explicitRateHeader: string,
  explicitCurrencyHeader: string,
  nights: number
): {
  parsedCurrency?: ChannelCurrency;
  parsedNightlyRate?: number;
  parsedTotalAmount?: number;
} {
  const safeNights = Math.max(1, nights);
  if (explicitRateHeader) {
    const num = Number(explicitRateHeader.replace(/[^0-9.]/g, ''));
    const cur = normalizeCurrencyToken(explicitCurrencyHeader) || 'USD';
    if (Number.isFinite(num) && num > 0) {
      return {
        parsedCurrency: cur,
        parsedNightlyRate: Number(num.toFixed(2)),
        parsedTotalAmount: Number((num * safeNights).toFixed(2)),
      };
    }
  }

  const combined = `${summary}\n${description}`;
  const curOrAmt =
    '(?:(USD|EUR|GBP|NGN|US\\$|\\$|€|£|₦)\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)|([0-9][0-9,]*(?:\\.\\d{1,2})?)\\s*(USD|EUR|GBP|NGN))';

  // 1. Explicit Total / Payout / Guest Paid labels take highest accuracy for total stay amount
  const explicitTotalRegex = new RegExp(
    `(?:Booking\\s*Total|Grand\\s*Total|Total\\s*Price|Total\\s*Amount|Total|Payout|Guest\\s*Paid|Amount\\s*Paid)\\s*[:=-]?\\s*${curOrAmt}`,
    'i'
  );
  const totalMatch = combined.match(explicitTotalRegex);
  if (totalMatch) {
    const cur = normalizeCurrencyToken(totalMatch[1] || totalMatch[4] || '');
    const amt = Number((totalMatch[2] || totalMatch[3] || '').replace(/,/g, ''));
    if (cur && Number.isFinite(amt) && amt > 0) {
      return {
        parsedCurrency: cur,
        parsedNightlyRate: Number((amt / safeNights).toFixed(2)),
        parsedTotalAmount: Number(amt.toFixed(2)),
      };
    }
  }

  // 2. Explicit Nightly Rate prefix ("Nightly Rate: USD 95") or suffix ("$95/night", "USD 95 per night")
  const nightlyPrefixRegex = new RegExp(
    `(?:Nightly\\s*Rate|Per\\s*Night|Rate\\s*(?:per|\\/)\\s*night|Price\\s*(?:per|\\/)\\s*night)\\s*[:=-]?\\s*${curOrAmt}`,
    'i'
  );
  const nightlySuffixRegex = new RegExp(
    `${curOrAmt}\\s*(?:per\\s*night|\\/\\s*night|\\/\\s*nt|nightly)`,
    'i'
  );
  const nightlyMatch =
    combined.match(nightlyPrefixRegex) || combined.match(nightlySuffixRegex);
  if (nightlyMatch) {
    const cur = normalizeCurrencyToken(nightlyMatch[1] || nightlyMatch[4] || '');
    const amt = Number((nightlyMatch[2] || nightlyMatch[3] || '').replace(/,/g, ''));
    if (cur && Number.isFinite(amt) && amt > 0) {
      return {
        parsedCurrency: cur,
        parsedNightlyRate: Number(amt.toFixed(2)),
        parsedTotalAmount: Number((amt * safeNights).toFixed(2)),
      };
    }
  }

  // 3. Generic labeled Price / Amount / Rate lines in OTA descriptions
  const labeledTotalRegex = new RegExp(
    `(?:Price|Amount|Paid|Rate)\\s*[:=-]?\\s*${curOrAmt}`,
    'i'
  );
  const labeledMatch = combined.match(labeledTotalRegex);
  if (labeledMatch) {
    const cur = normalizeCurrencyToken(labeledMatch[1] || labeledMatch[4] || '');
    const amt = Number((labeledMatch[2] || labeledMatch[3] || '').replace(/,/g, ''));
    if (cur && Number.isFinite(amt) && amt > 0) {
      const perNight = Number((amt / safeNights).toFixed(2));
      return {
        parsedCurrency: cur,
        parsedNightlyRate: perNight,
        parsedTotalAmount: Number(amt.toFixed(2)),
      };
    }
  }

  // 4. Fallback: any clear standalone currency+amount token like "$240.00" or "EUR 190"
  const anyCurrencyRegex = new RegExp(curOrAmt, 'i');
  const anyMatch = combined.match(anyCurrencyRegex);
  if (anyMatch) {
    const cur = normalizeCurrencyToken(anyMatch[1] || anyMatch[4] || '');
    const amt = Number((anyMatch[2] || anyMatch[3] || '').replace(/,/g, ''));
    if (cur && Number.isFinite(amt) && amt > 0) {
      return {
        parsedCurrency: cur,
        parsedNightlyRate: Number((amt / safeNights).toFixed(2)),
        parsedTotalAmount: Number(amt.toFixed(2)),
      };
    }
  }

  return {};
}

function extractGuestLabel(
  summaryRaw: string,
  descriptionRaw: string,
  channelName: BookingSourceOption
): string {
  const summary = summaryRaw.trim();
  const desc = descriptionRaw.trim();

  // Strip optional suite prefix like "Reserved (RM-1) - Chidi Okafor"
  const parenDashSplit = summary.match(/^(?:Reserved|Reservation|Booked)\s*(?:\([^)]+\))?\s*[-–:]\s*(.+)$/i);
  if (parenDashSplit && parenDashSplit[1].trim().length >= 2) {
    const candidate = parenDashSplit[1].trim();
    if (!/^not available$/i.test(candidate)) {
      return candidate.slice(0, 110);
    }
  }

  // Check if description contains an explicit "Guest: Name" or confirmation code
  const guestLine = desc.match(/(?:Guest(?:\s*Name)?|Booker|Customer)\s*:\s*([^\n]+)/i);
  if (guestLine && guestLine[1].trim().length >= 2) {
    return guestLine[1].trim().slice(0, 110);
  }

  const codeMatch =
    desc.match(/reservations\/details\/([A-Z0-9]+)/i) ||
    desc.match(/Ref(?:erence)?[:#\s]+([A-Z0-9-]{4,20})/i);
  if (codeMatch) {
    return `${channelName} Guest (${codeMatch[1]})`.slice(0, 110);
  }

  if (/not available|closed|blocked/i.test(summary)) {
    return `${channelName} Reservation`;
  }

  if (summary && !/^reserved$/i.test(summary) && summary.length >= 2) {
    return `${channelName}: ${summary}`.slice(0, 110);
  }

  return `${channelName} Guest`;
}

export function parseIcalEvents(
  rawIcs: string,
  channelName: BookingSourceOption
): ParsedIcalEvent[] {
  const lines = unfoldIcalLines(rawIcs);
  const events: ParsedIcalEvent[] = [];

  let inEvent = false;
  let uid = '';
  let dtStart = '';
  let dtEnd = '';
  let summary = '';
  let description = '';
  let location = '';
  let status = '';
  let xRate = '';
  let xCurrency = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      dtStart = '';
      dtEnd = '';
      summary = '';
      description = '';
      location = '';
      status = '';
      xRate = '';
      xCurrency = '';
      continue;
    }

    if (line.toUpperCase() === 'END:VEVENT') {
      if (inEvent && dtStart) {
        const checkIn = parseIcalDateToIso(dtStart);
        let checkOut = dtEnd ? parseIcalDateToIso(dtEnd) : null;
        if (checkIn) {
          if (!checkOut || checkOut <= checkIn) {
            checkOut = addDaysIso(checkIn, 1);
          }
          const nights = Math.max(1, diffNights(checkIn, checkOut));
          const cleanSummary = unescapeIcalText(summary);
          const cleanDesc = unescapeIcalText(description);
          const cleanLocation = unescapeIcalText(location);
          const stableUid =
            uid.trim() || `${channelName}-${checkIn}-${checkOut}-${cleanSummary.slice(0, 24)}`;
          const priceInfo = extractPriceAndCurrency(
            cleanSummary,
            cleanDesc,
            xRate,
            xCurrency,
            nights
          );

          events.push({
            uid: stableUid.slice(0, 155),
            checkInDate: checkIn,
            checkOutDate: checkOut,
            nights,
            guestName: extractGuestLabel(cleanSummary, cleanDesc, channelName),
            guestPhone: extractPhoneHint(cleanDesc),
            summary: cleanSummary,
            description: cleanDesc,
            location: cleanLocation,
            roomHint: extractRoomHint(cleanSummary, cleanDesc, cleanLocation),
            ...priceInfo,
            cancelled: status.toUpperCase() === 'CANCELLED',
          });
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const propPart = line.slice(0, colonIdx).toUpperCase();
    const valuePart = line.slice(colonIdx + 1);
    const propName = propPart.split(';')[0];

    if (propName === 'UID') uid = valuePart;
    else if (propName === 'DTSTART') dtStart = valuePart;
    else if (propName === 'DTEND') dtEnd = valuePart;
    else if (propName === 'SUMMARY') summary = valuePart;
    else if (propName === 'DESCRIPTION') description = valuePart;
    else if (propName === 'LOCATION') location = valuePart;
    else if (propName === 'STATUS') status = valuePart;
    else if (propName === 'X-RATE' || propName === 'X-PRICE' || propName === 'X-AMOUNT') xRate = valuePart;
    else if (propName === 'X-CURRENCY') xCurrency = valuePart;
  }

  return events;
}

export function deterministicOtaReservationId(channelId: string, externalUid: string): string {
  const input = `${channelId}::${externalUid}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const partA = (h1 >>> 0).toString(36);
  const partB = (h2 >>> 0).toString(36);
  return `ota-${partA}-${partB}`;
}
