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
  summary: string;
  description: string;
  location: string;
  calendarName?: string;
  roomHint?: string;
  parsedCurrency?: ChannelCurrency;
  parsedNightlyRate?: number;
  parsedTotalAmount?: number;
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
  explicitTotalHeader: string,
  explicitCurrencyHeader: string,
  nights: number
): {
  parsedCurrency?: ChannelCurrency;
  parsedNightlyRate?: number;
  parsedTotalAmount?: number;
} {
  const safeNights = Math.max(1, nights);

  if (explicitTotalHeader) {
    const num = Number(explicitTotalHeader.replace(/[^0-9.]/g, ''));
    const cur = normalizeCurrencyToken(explicitCurrencyHeader) || 'USD';
    if (Number.isFinite(num) && num > 0) {
      return {
        parsedCurrency: cur,
        parsedNightlyRate: Number((num / safeNights).toFixed(2)),
        parsedTotalAmount: Number(num.toFixed(2)),
      };
    }
  }

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

  // 1. Explicit Total / Payout / Guest Paid / Accommodation lines
  const explicitTotalRegex = new RegExp(
    `(?:Booking\\s*Total|Grand\\s*Total|Total\\s*Price|Total\\s*Amount|Total\\s*Paid|Total|Payout|Guest\\s*Paid|Amount\\s*Paid|Booking\\s*Value|Accommodation)\\s*[:=-]?\\s*${curOrAmt}(?!\\s*(?:per\\s*night|\\/\\s*night|\\/\\s*nt|nightly))`,
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

  // 2. Explicit Nightly Rate prefix ("Nightly Rate: USD 95") or suffix ("$95/night")
  const nightlyPrefixRegex = new RegExp(
    `(?:Nightly\\s*Rate|Room\\s*Rate|Per\\s*Night|Rate\\s*(?:per|\\/)\\s*night|Price\\s*(?:per|\\/)\\s*night)\\s*[:=-]?\\s*${curOrAmt}`,
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
      return {
        parsedCurrency: cur,
        parsedNightlyRate: Number((amt / safeNights).toFixed(2)),
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
  let xRate = '';
  let xTotal = '';
  let xCurrency = '';
  let xRoomType = '';
  let xAdults = '';
  let xChildren = '';
  let xPhone = '';
  let xEmail = '';
  let xBookingRef = '';
  let xListingId = '';

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
      xRate = '';
      xTotal = '';
      xCurrency = '';
      xRoomType = '';
      xAdults = '';
      xChildren = '';
      xPhone = '';
      xEmail = '';
      xBookingRef = '';
      xListingId = '';
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
          const priceInfo = extractPriceAndCurrency(
            cleanSummary,
            cleanDesc,
            xRate,
            xTotal,
            xCurrency,
            nights
          );
          const guestNames = extractGuestNames(cleanSummary, cleanDesc, attendeeCn, channelName);
          const combinedText = `${cleanSummary}\n${cleanDesc}`;
          const occupancy = extractAdultsAndChildren(combinedText, xAdults, xChildren);
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
            summary: cleanSummary,
            description: cleanDesc,
            location: cleanLocation,
            calendarName: cleanCalName || undefined,
            roomHint: extractRoomHint(cleanSummary, cleanDesc, cleanLocation, cleanCalName, xRoomType),
            ...priceInfo,
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
    } else if (propName === 'X-TOTAL' || propName === 'X-TOTAL-AMOUNT') {
      xTotal = valuePart;
    } else if (
      propName === 'X-NIGHTLY-RATE' ||
      propName === 'X-RATE' ||
      propName === 'X-PRICE' ||
      propName === 'X-AMOUNT'
    ) {
      xRate = valuePart;
    } else if (propName === 'X-CURRENCY') {
      xCurrency = valuePart;
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
