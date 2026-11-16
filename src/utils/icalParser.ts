import { BookingSourceOption } from '../types/pms';

export interface ParsedIcalEvent {
  uid: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  nights: number;
  guestName: string;
  guestPhone?: string;
  summary: string;
  description: string;
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

function extractGuestLabel(
  summaryRaw: string,
  descriptionRaw: string,
  channelName: BookingSourceOption
): string {
  const summary = summaryRaw.trim();
  const desc = descriptionRaw.trim();

  // Check if summary contains an explicit guest name (e.g., "Reserved - Chidi Okafor" or "Reservation - John Doe")
  const dashSplit = summary.match(/^(?:Reserved|Reservation|Booked)\s*[-–:]\s*(.+)$/i);
  if (dashSplit && dashSplit[1].trim().length >= 2) {
    const candidate = dashSplit[1].trim();
    if (!/^not available$/i.test(candidate)) {
      return candidate.slice(0, 110);
    }
  }

  // Airbnb sometimes includes "Guest: Name" or confirmation code in DESCRIPTION
  const guestLine = desc.match(/(?:Guest|Name)\s*:\s*([^\n]+)/i);
  if (guestLine && guestLine[1].trim().length >= 2) {
    return guestLine[1].trim().slice(0, 110);
  }

  // Extract confirmation code if Airbnb/Booking provides one
  const codeMatch = desc.match(/reservations\/details\/([A-Z0-9]+)/i) || desc.match(/Ref(?:erence)?[:#\s]+([A-Z0-9-]{4,20})/i);
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
  let status = '';

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
      status = '';
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
          const stableUid =
            uid.trim() || `${channelName}-${checkIn}-${checkOut}-${cleanSummary.slice(0, 24)}`;

          events.push({
            uid: stableUid.slice(0, 155),
            checkInDate: checkIn,
            checkOutDate: checkOut,
            nights,
            guestName: extractGuestLabel(cleanSummary, cleanDesc, channelName),
            guestPhone: extractPhoneHint(cleanDesc),
            summary: cleanSummary,
            description: cleanDesc,
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
    else if (propName === 'STATUS') status = valuePart;
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
