import { BookingSourceOption, ChannelCurrency } from '../types/pms';

export interface ParsedIcalEvent {
  uid: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  nights: number;
  guestFirstName?: string;
  guestLastName?: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  adults?: number;
  children?: number;
  otaBookingRef?: string;
  listingIdHint?: string;
  paidAmount?: number;
  paidCurrency?: ChannelCurrency;
  sourceNightlyRate?: number;
  sourceTotalAmount?: number;
  summary: string;
  description: string;
  location: string;
  calendarName?: string;
  roomHint?: string;
  cancelled: boolean;
}

function unfoldIcalLines(raw: string): string[] {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
  const match = val.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${month}-${day}`;
}

function parseIcalDurationDays(rawDuration: string): number {
  const val = rawDuration.trim().toUpperCase();
  const match = val.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?)?$/);
  if (!match) return 0;
  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  return weeks * 7 + days + (hours >= 12 ? 1 : 0);
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

function extractPhoneHint(text: string, xPhone: string): string | undefined {
  if (xPhone.trim().length >= 6) return xPhone.trim().slice(0, 32);
  const phoneLabel = text.match(
    /(?:Phone|Mobile|Tel|WhatsApp|Contact\s*(?:Number|No)?)\s*[:=-]\s*(\+?[\d\s()-]{6,22})/i
  );
  if (phoneLabel && /\d{4}/.test(phoneLabel[1])) {
    return phoneLabel[1].trim().slice(0, 32);
  }
  const fullMatch = text.match(/(\+?\d[\d\s-]{6,16}\d)/);
  if (fullMatch) return fullMatch[1].trim().slice(0, 32);
  const last4 = text.match(/Last 4 Digits\):\s*(\d{4})/i);
  if (last4) return `***-${last4[1]}`;
  return undefined;
}

function extractEmailHint(text: string, attendeeEmail: string, xEmail: string): string | undefined {
  if (xEmail.trim().includes('@')) return xEmail.trim().toLowerCase().slice(0, 120);
  if (attendeeEmail.trim().includes('@')) return attendeeEmail.trim().toLowerCase().slice(0, 120);
  const match = text.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return match ? match[1].toLowerCase().slice(0, 120) : undefined;
}

function extractAdultsAndChildren(
  text: string,
  xAdults: string,
  xChildren: string
): { adults?: number; children?: number } {
  let adults: number | undefined;
  let children: number | undefined;

  if (xAdults) {
    const n = Number(xAdults.replace(/[^0-9]/g, ''));
    if (Number.isFinite(n) && n >= 1 && n <= 20) adults = n;
  }
  if (xChildren) {
    const n = Number(xChildren.replace(/[^0-9]/g, ''));
    if (Number.isFinite(n) && n >= 0 && n <= 20) children = n;
  }

  if (adults === undefined) {
    const adultsMatch = text.match(/(?:Adults?|Guests?)\s*[:=-]\s*(\d{1,2})/i);
    if (adultsMatch) {
      const n = Number(adultsMatch[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 20) adults = n;
    }
  }
  if (children === undefined) {
    const childMatch = text.match(/(?:Children|Child|Kids?)\s*[:=-]\s*(\d{1,2})/i);
    if (childMatch) {
      const n = Number(childMatch[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 20) children = n;
    }
  }
  return { adults, children };
}

function extractOtaBookingRef(text: string, summary: string, xRef: string): string | undefined {
  if (xRef.trim().length >= 4) {
    return xRef.trim().replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 32);
  }
  const combined = `${summary}\n${text}`;
  const detailCode = combined.match(/reservations\/details\/([A-Z0-9-]{5,24})/i);
  if (detailCode) return detailCode[1].toUpperCase().slice(0, 32);

  const labelCode = combined.match(
    /(?:Confirmation\s*(?:Code|Number|No|#)?|Booking\s*(?:Ref|Reference|ID|Code)|Reservation\s*(?:Code|ID)|Ref(?:erence)?)\s*[:=#-]\s*([A-Z0-9-]{4,28})/i
  );
  if (labelCode) return labelCode[1].toUpperCase().slice(0, 32);

  const hmMatch = combined.match(/\b(HM[A-Z0-9]{6,14})\b/i);
  if (hmMatch) return hmMatch[1].toUpperCase().slice(0, 32);

  return undefined;
}

function extractListingIdHint(text: string, xListingId: string): string | undefined {
  if (xListingId.trim().length >= 2) return xListingId.trim().slice(0, 120);
  const m = text.match(/(?:Listing\s*ID|Property\s*Listing\s*ID|Property\s*ID|Hotel\s*ID)\s*[:=-]\s*([A-Za-z0-9_-]{3,80})/i);
  return m ? m[1].trim().slice(0, 120) : undefined;
}

function normalizeCurrencyToken(raw?: string): ChannelCurrency | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === 'USD' || cleaned === 'US$' || cleaned === '$') return 'USD';
  if (cleaned === 'GBP' || cleaned === '£') return 'GBP';
  if (cleaned === 'EUR' || cleaned === '€') return 'EUR';
  if (cleaned === 'NGN' || cleaned === '₦') return 'NGN';
  return undefined;
}

function parseMoneyAndCurrencyFromSnippet(
  rawSnippet: string,
  fallbackCurrency?: ChannelCurrency
): { amount?: number; currency?: ChannelCurrency } {
  const snippet = rawSnippet.trim();
  if (!snippet) return {};

  // Patterns like "200 USD", "200.00 USD", "$200 USD", "₦190,000", "GBP 180.50", "EUR150"
  const afterCode = snippet.match(/([$£€₦]|US\$)?\s*([\d,]+(?:\.\d{1,2})?)\s*(USD|GBP|EUR|NGN)\b/i);
  if (afterCode) {
    const amount = Number(afterCode[2].replace(/,/g, ''));
    const cur = normalizeCurrencyToken(afterCode[3]) || normalizeCurrencyToken(afterCode[1]) || fallbackCurrency;
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: cur };
  }

  const beforeCode = snippet.match(/\b(USD|GBP|EUR|NGN)\s*[:=-]?\s*([$£€₦])?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (beforeCode) {
    const amount = Number(beforeCode[3].replace(/,/g, ''));
    const cur = normalizeCurrencyToken(beforeCode[1]) || normalizeCurrencyToken(beforeCode[2]) || fallbackCurrency;
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: cur };
  }

  const symbolFirst = snippet.match(/(US\$|[$£€₦])\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (symbolFirst) {
    const amount = Number(symbolFirst[2].replace(/,/g, ''));
    const cur = normalizeCurrencyToken(symbolFirst[1]) || fallbackCurrency;
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: cur };
  }

  const bareNumber = snippet.match(/\b([\d,]+(?:\.\d{1,2})?)\b/);
  if (bareNumber) {
    const amount = Number(bareNumber[1].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: fallbackCurrency };
  }

  return {};
}

function extractPaymentHints(params: {
  summary: string;
  description: string;
  xCurrency: string;
  xOtaPaid: string;
  xTotalPrice: string;
  xNightlyRate: string;
  nights: number;
}): {
  paidAmount?: number;
  paidCurrency?: ChannelCurrency;
  sourceNightlyRate?: number;
  sourceTotalAmount?: number;
} {
  const combined = `${params.summary}\n${params.description}`;
  let detectedCurrency = normalizeCurrencyToken(params.xCurrency);

  if (!detectedCurrency) {
    const explicitCurMatch = combined.match(/\b(?:Currency|Booking\s*Currency)\s*[:=-]\s*(USD|GBP|EUR|NGN)\b/i);
    if (explicitCurMatch) {
      detectedCurrency = normalizeCurrencyToken(explicitCurMatch[1]);
    }
  }

  // 1. Check explicit X-headers first
  const xPaidParsed = parseMoneyAndCurrencyFromSnippet(params.xOtaPaid, detectedCurrency);
  const xTotalParsed = parseMoneyAndCurrencyFromSnippet(params.xTotalPrice, detectedCurrency || xPaidParsed.currency);
  const xRateParsed = parseMoneyAndCurrencyFromSnippet(
    params.xNightlyRate,
    detectedCurrency || xPaidParsed.currency || xTotalParsed.currency
  );

  let paidAmount = xPaidParsed.amount;
  let sourceTotalAmount = xTotalParsed.amount;
  let sourceNightlyRate = xRateParsed.amount;
  let paidCurrency =
    xPaidParsed.currency ||
    xTotalParsed.currency ||
    xRateParsed.currency ||
    detectedCurrency;

  // 2. Parse labeled paid lines from description/summary (e.g., "Paid to OTA: 200 USD", "Guest Paid: $200")
  if (paidAmount === undefined) {
    const paidLabelMatch = combined.match(
      /(?:Guest\s*Paid(?:\s*to\s*OTA)?|Paid\s*to\s*OTA|OTA\s*Paid|OTA\s*Payment(?:\s*Received)?|Amount\s*(?:Paid|Charged)|Prepaid|Payment\s*Received|Paid)\s*[:=-]\s*([^\n|;]+)/i
    );
    if (paidLabelMatch) {
      const parsed = parseMoneyAndCurrencyFromSnippet(paidLabelMatch[1], paidCurrency);
      if (parsed.amount !== undefined) {
        paidAmount = parsed.amount;
        paidCurrency = parsed.currency || paidCurrency;
      }
    }
  }

  // 3. Parse labeled total/amount lines (e.g., "Total: 200 USD", "Total Price: $200")
  if (sourceTotalAmount === undefined) {
    const totalLabelMatch = combined.match(
      /(?:Grand\s*Total|Total\s*Price|Total\s*Amount|Total\s*Cost|Total\s*Payout|Booking\s*Total|Reservation\s*Total|Guest\s*Total|Payout\s*Amount|Total|Price|Amount|Payout)\s*[:=-]\s*([^\n|;]+)/i
    );
    if (totalLabelMatch) {
      const parsed = parseMoneyAndCurrencyFromSnippet(totalLabelMatch[1], paidCurrency);
      if (parsed.amount !== undefined) {
        sourceTotalAmount = parsed.amount;
        paidCurrency = parsed.currency || paidCurrency;
      }
    }
  }

  // 4. Parse nightly rate lines (e.g., "Nightly Rate: $100", "Rate: 100 USD")
  if (sourceNightlyRate === undefined) {
    const rateLabelMatch = combined.match(
      /(?:Nightly\s*Rate|Rate\s*per\s*Night|ADR|Rate)\s*[:=-]\s*([^\n|;]+)/i
    );
    if (rateLabelMatch) {
      const parsed = parseMoneyAndCurrencyFromSnippet(rateLabelMatch[1], paidCurrency);
      if (parsed.amount !== undefined) {
        sourceNightlyRate = parsed.amount;
        paidCurrency = parsed.currency || paidCurrency;
      }
    }
  }

  // 5. Inline currency+amount pattern in text if still missing currency or amounts (e.g. "Paid $200" or "200 USD")
  if (paidAmount === undefined && sourceTotalAmount === undefined) {
    const inlineMoney = combined.match(
      /(?:([$£€₦]|US\$)\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(USD|GBP|EUR|NGN))?|\b([\d,]+(?:\.\d{1,2})?)\s*(USD|GBP|EUR|NGN)\b|\b(USD|GBP|EUR|NGN)\s*([\d,]+(?:\.\d{1,2})?)\b)/i
    );
    if (inlineMoney) {
      const snippet = inlineMoney[0];
      const parsed = parseMoneyAndCurrencyFromSnippet(snippet, paidCurrency);
      if (parsed.amount !== undefined && parsed.currency) {
        sourceTotalAmount = parsed.amount;
        paidCurrency = parsed.currency;
      }
    }
  }

  if (sourceTotalAmount === undefined && sourceNightlyRate !== undefined && params.nights > 0) {
    sourceTotalAmount = Number((sourceNightlyRate * params.nights).toFixed(2));
  }
  if (sourceNightlyRate === undefined && (sourceTotalAmount || paidAmount) && params.nights > 0) {
    const base = sourceTotalAmount || paidAmount || 0;
    if (base > 0) sourceNightlyRate = Number((base / params.nights).toFixed(2));
  }
  if (paidAmount === undefined && sourceTotalAmount !== undefined && /\bpaid\b/i.test(combined)) {
    paidAmount = sourceTotalAmount;
  }

  return {
    paidAmount,
    paidCurrency,
    sourceNightlyRate,
    sourceTotalAmount,
  };
}

function isGenericRoomNoise(val: string): boolean {
  const v = val.trim();
  if (v.length < 2) return true;
  if (/^(?:not available|unavailable|closed|blocked|reserved|confirmed|airbnb|booking\.com|vrbo|expedia|hotels\.ng)$/i.test(v)) {
    return true;
  }
  // Ignore pure reservation codes like HMA1234567 or numeric IDs
  if (/^(?:HM[A-Z0-9]{6,}|\d{5,})$/i.test(v)) return true;
  return false;
}

function extractRoomHint(
  summary: string,
  description: string,
  location: string,
  calendarName: string,
  xRoomType: string
): string | undefined {
  if (xRoomType.trim().length >= 2 && !isGenericRoomNoise(xRoomType)) {
    return xRoomType.trim().slice(0, 64);
  }
  const combined = `${location}\n${summary}\n${description}\n${calendarName}`;
  const rmCode = combined.match(/\b(RM-\d{1,2})\b/i);
  if (rmCode) return rmCode[1].toUpperCase();

  const unitMatch = combined.match(
    /(?:Room\s*Type|Suite\s*Type|Accommodation|Unit\s*Type|Room\s*Number|Room|Suite|Unit|Listing|Apartment|Category)\s*[:#-]\s*([^\n|;,()]{2,64})/i
  );
  if (unitMatch && !isGenericRoomNoise(unitMatch[1])) {
    return unitMatch[1].trim();
  }

  const parenMatches = summary.matchAll(/\(([^)]+)\)/g);
  for (const m of parenMatches) {
    const inside = m[1].trim();
    if (!isGenericRoomNoise(inside)) {
      return inside;
    }
  }

  if (location.trim().length >= 2 && !isGenericRoomNoise(location)) {
    return location.trim().slice(0, 64);
  }

  if (calendarName.trim().length >= 2 && !isGenericRoomNoise(calendarName)) {
    return calendarName.trim().slice(0, 64);
  }

  return undefined;
}

function isNonPersonSummaryLabel(candidate: string): boolean {
  const clean = candidate.trim();
  if (clean.length < 2) return true;
  return /^(?:not available|unavailable|closed|blocked|reserved|pending|confirmed|cancelled|maintenance|owner hold|airbnb|booking\.com|vrbo|expedia|hotels\.ng)$/i.test(
    clean
  );
}

function extractAttendeeCn(propHeader: string): string {
  const cnMatch = propHeader.match(/;CN=("?)([^";:]+)\1/i);
  if (!cnMatch) return '';
  const candidate = cnMatch[2].trim();
  if (isNonPersonSummaryLabel(candidate) || candidate.includes('@')) return '';
  return candidate;
}

function extractAttendeeEmail(valuePart: string): string {
  const clean = valuePart.replace(/^mailto:/i, '').trim();
  return clean.includes('@') ? clean : '';
}

function splitFirstAndLastName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function extractGuestNames(
  summaryRaw: string,
  descriptionRaw: string,
  attendeeCnRaw: string,
  channelName: BookingSourceOption
): { guestFirstName?: string; guestLastName?: string; guestName: string } {
  const summary = summaryRaw.trim();
  const desc = descriptionRaw.trim();

  // 1. Check separate First Name + Last Name lines inside description
  const firstMatch = desc.match(/(?:Guest\s*)?First\s*Name\s*[:=-]\s*([^\n|;,]+)/i);
  const lastMatch = desc.match(/(?:Guest\s*)?Last\s*Name\s*[:=-]\s*([^\n|;,]+)/i);
  if (firstMatch || lastMatch) {
    const fName = firstMatch?.[1]?.trim() || '';
    const lName = lastMatch?.[1]?.trim() || '';
    const combinedName = `${fName} ${lName}`.trim();
    if (!isNonPersonSummaryLabel(combinedName)) {
      return {
        guestFirstName: fName || undefined,
        guestLastName: lName || undefined,
        guestName: combinedName.slice(0, 110),
      };
    }
  }

  // 2. Check explicit Guest / Booker / Customer / Traveler lines in description
  const guestLine = desc.match(
    /(?:Primary\s*Guest|Guest\s*Full\s*Name|Guest\s*Name|Guest|Booker\s*Name|Booker|Customer\s*Name|Customer|Traveler\s*Name|Traveler|Booked\s*By|Reservation\s*For|Full\s*Name|Name)\s*[:=-]\s*([^\n|;]+)/i
  );
  if (guestLine && !isNonPersonSummaryLabel(guestLine[1])) {
    const clean = guestLine[1].replace(/\s*\([^)]*\)\s*$/, '').trim().slice(0, 110);
    const split = splitFirstAndLastName(clean);
    return { guestFirstName: split.firstName, guestLastName: split.lastName, guestName: clean };
  }

  // 3. Check SUMMARY splits like "Reserved (RM-1) - John Doe", "CLOSED - Jane Smith", "Airbnb - Ada Bello"
  const prefixDashSplit = summary.match(
    /^(?:Reserved|Reservation|Booked|Booking|CLOSED|Blocked|Not\s*available|Airbnb|Booking\.com|VRBO|Expedia|Hotels\.ng)\s*(?:\([^)]+\))?\s*[-–:]\s*(.+)$/i
  );
  if (prefixDashSplit && !isNonPersonSummaryLabel(prefixDashSplit[1])) {
    const clean = prefixDashSplit[1].replace(/\s*\([^)]*\)\s*$/, '').trim().slice(0, 110);
    const split = splitFirstAndLastName(clean);
    return { guestFirstName: split.firstName, guestLastName: split.lastName, guestName: clean };
  }

  // 4. Check "Booking for Jane Smith" / "Reservation for John Doe" in summary or description
  const forMatch = `${summary}\n${desc}`.match(
    /(?:Booking|Reservation|Stay)\s+for\s+([A-Za-z][A-Za-z'’.-]+(?:\s+[A-Za-z][A-Za-z'’.-]+){0,3})/i
  );
  if (forMatch && !isNonPersonSummaryLabel(forMatch[1])) {
    const clean = forMatch[1].trim().slice(0, 110);
    const split = splitFirstAndLastName(clean);
    return { guestFirstName: split.firstName, guestLastName: split.lastName, guestName: clean };
  }

  // 5. Check ATTENDEE / ORGANIZER CN header
  if (attendeeCnRaw && !isNonPersonSummaryLabel(attendeeCnRaw)) {
    const clean = attendeeCnRaw.slice(0, 110);
    const split = splitFirstAndLastName(clean);
    return { guestFirstName: split.firstName, guestLastName: split.lastName, guestName: clean };
  }

  // 6. Check if summary itself is a guest name (e.g. "Jane Smith (RM-2)" or "Jane Smith")
  const strippedSummary = summary.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (strippedSummary && !isNonPersonSummaryLabel(strippedSummary)) {
    const clean = strippedSummary.slice(0, 110);
    const split = splitFirstAndLastName(clean);
    return { guestFirstName: split.firstName, guestLastName: split.lastName, guestName: clean };
  }

  // 7. Confirmation code fallback
  const codeMatch =
    desc.match(/reservations\/details\/([A-Z0-9]+)/i) ||
    desc.match(/Ref(?:erence)?[:#\s]+([A-Z0-9-]{4,20})/i);
  if (codeMatch) {
    return { guestName: `${channelName} Guest (${codeMatch[1]})`.slice(0, 110) };
  }

  if (/not available|closed|blocked/i.test(summary)) {
    return { guestName: `${channelName} Reservation` };
  }

  return { guestName: `${channelName} Guest` };
}

export function parseIcalEvents(
  rawIcs: string,
  channelName: BookingSourceOption
): ParsedIcalEvent[] {
  const lines = unfoldIcalLines(rawIcs);
  const events: ParsedIcalEvent[] = [];

  let calendarName = '';
  let calendarMethod = '';
  let inEvent = false;
  let uid = '';
  let dtStart = '';
  let dtEnd = '';
  let duration = '';
  let summary = '';
  let description = '';
  let location = '';
  let status = '';
  let attendeeCn = '';
  let attendeeEmail = '';
  let xRoomType = '';
  let xAdults = '';
  let xChildren = '';
  let xPhone = '';
  let xEmail = '';
  let xBookingRef = '';
  let xListingId = '';
  let xCurrency = '';
  let xOtaPaid = '';
  let xTotalPrice = '';
  let xNightlyRate = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      dtStart = '';
      dtEnd = '';
      duration = '';
      summary = '';
      description = '';
      location = '';
      status = '';
      attendeeCn = '';
      attendeeEmail = '';
      xRoomType = '';
      xAdults = '';
      xChildren = '';
      xPhone = '';
      xEmail = '';
      xBookingRef = '';
      xListingId = '';
      xCurrency = '';
      xOtaPaid = '';
      xTotalPrice = '';
      xNightlyRate = '';
      continue;
    }

    if (line.toUpperCase() === 'END:VEVENT') {
      if (inEvent && dtStart) {
        const checkIn = parseIcalDateToIso(dtStart);
        let checkOut = dtEnd ? parseIcalDateToIso(dtEnd) : null;
        if (checkIn) {
          if ((!checkOut || checkOut <= checkIn) && duration) {
            const durDays = parseIcalDurationDays(duration);
            if (durDays > 0) checkOut = addDaysIso(checkIn, durDays);
          }
          if (!checkOut || checkOut <= checkIn) {
            checkOut = addDaysIso(checkIn, 1);
          }
          const nights = Math.max(1, diffNights(checkIn, checkOut));
          const cleanSummary = unescapeIcalText(summary);
          const cleanDesc = unescapeIcalText(description);
          const cleanLocation = unescapeIcalText(location);
          const cleanCalName = unescapeIcalText(calendarName);
          const stableUid =
            uid.trim() || `${channelName}-${checkIn}-${checkOut}-${cleanSummary.slice(0, 24)}`;
          const guestNames = extractGuestNames(cleanSummary, cleanDesc, attendeeCn, channelName);
          const combinedText = `${cleanSummary}\n${cleanDesc}`;
          const occupancy = extractAdultsAndChildren(combinedText, xAdults, xChildren);
          const paymentHints = extractPaymentHints({
            summary: cleanSummary,
            description: cleanDesc,
            xCurrency,
            xOtaPaid,
            xTotalPrice,
            xNightlyRate,
            nights,
          });
          const isCancelled =
            status.trim().toUpperCase() === 'CANCELLED' ||
            calendarMethod.trim().toUpperCase() === 'CANCEL' ||
            /^cancelled\b/i.test(cleanSummary);

          events.push({
            uid: stableUid.slice(0, 155),
            checkInDate: checkIn,
            checkOutDate: checkOut,
            nights,
            guestFirstName: guestNames.guestFirstName,
            guestLastName: guestNames.guestLastName,
            guestName: guestNames.guestName,
            guestPhone: extractPhoneHint(cleanDesc, xPhone),
            guestEmail: extractEmailHint(cleanDesc, attendeeEmail, xEmail),
            adults: occupancy.adults,
            children: occupancy.children,
            otaBookingRef: extractOtaBookingRef(cleanDesc, cleanSummary, xBookingRef),
            listingIdHint: extractListingIdHint(combinedText, xListingId),
            paidAmount: paymentHints.paidAmount,
            paidCurrency: paymentHints.paidCurrency,
            sourceNightlyRate: paymentHints.sourceNightlyRate,
            sourceTotalAmount: paymentHints.sourceTotalAmount,
            summary: cleanSummary,
            description: cleanDesc,
            location: cleanLocation,
            calendarName: cleanCalName || undefined,
            roomHint: extractRoomHint(cleanSummary, cleanDesc, cleanLocation, cleanCalName, xRoomType),
            cancelled: isCancelled,
          });
        }
      }
      inEvent = false;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const propPart = line.slice(0, colonIdx);
    const propUpper = propPart.toUpperCase();
    const valuePart = line.slice(colonIdx + 1);
    const propName = propUpper.split(';')[0];

    if (!inEvent) {
      if (propName === 'X-WR-CALNAME') {
        calendarName = valuePart;
      } else if (propName === 'METHOD') {
        calendarMethod = valuePart;
      }
      continue;
    }

    if (propName === 'UID') uid = valuePart;
    else if (propName === 'DTSTART') dtStart = valuePart;
    else if (propName === 'DTEND') dtEnd = valuePart;
    else if (propName === 'DURATION') duration = valuePart;
    else if (propName === 'SUMMARY') summary = valuePart;
    else if (propName === 'DESCRIPTION') description = valuePart;
    else if (propName === 'LOCATION') location = valuePart;
    else if (propName === 'STATUS') status = valuePart;
    else if (propName === 'ATTENDEE' || propName === 'ORGANIZER') {
      if (!attendeeCn) attendeeCn = extractAttendeeCn(propPart);
      if (!attendeeEmail) attendeeEmail = extractAttendeeEmail(valuePart);
    } else if (propName === 'X-ROOM-TYPE' || propName === 'X-ROOM') {
      xRoomType = valuePart;
    } else if (propName === 'X-ADULTS') {
      xAdults = valuePart;
    } else if (propName === 'X-CHILDREN') {
      xChildren = valuePart;
    } else if (propName === 'X-GUEST-PHONE') {
      xPhone = valuePart;
    } else if (propName === 'X-GUEST-EMAIL') {
      xEmail = valuePart;
    } else if (propName === 'X-BOOKING-REF') {
      xBookingRef = valuePart;
    } else if (propName === 'X-LISTING-ID') {
      xListingId = valuePart;
    } else if (propName === 'X-CURRENCY') {
      xCurrency = valuePart;
    } else if (
      propName === 'X-OTA-PAID' ||
      propName === 'X-TOTAL-PAID' ||
      propName === 'X-PAID-AMOUNT' ||
      propName === 'X-GUEST-PAID'
    ) {
      xOtaPaid = valuePart;
    } else if (
      propName === 'X-TOTAL-PRICE' ||
      propName === 'X-AMOUNT' ||
      propName === 'X-PRICE' ||
      propName === 'X-TOTAL-AMOUNT'
    ) {
      xTotalPrice = valuePart;
    } else if (propName === 'X-NIGHTLY-RATE' || propName === 'X-RATE') {
      xNightlyRate = valuePart;
    }
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
