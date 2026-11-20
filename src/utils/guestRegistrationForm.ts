import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatBookingSourceLabel,
  formatNgn,
  getReservationRoomDisplay,
  GuestRecord,
  PropertyRecord,
  RESERVATION_STATUS_LABELS,
  ReservationRecord,
  RoomRecord,
} from '../types/pms';

export interface GuestRegistrationFormData {
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  nationality?: string;
  idType: string;
  idNumber?: string;
  idVerified?: boolean;
  vipTier?: string;
  notes?: string;
  guestId?: string;
}

export interface GuestRegistrationExportParams {
  property: PropertyRecord;
  guest: GuestRegistrationFormData;
  latestReservation?: ReservationRecord | null;
  rooms?: RoomRecord[];
}

function safeVal(val?: string | null, fallback = '—'): string {
  const trimmed = (val || '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRegistrationNumber(property: PropertyRecord, guest: GuestRegistrationFormData): string {
  const prefix = (property.name || 'PCH')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'PCH';
  const suffix = guest.guestId
    ? guest.guestId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()
    : new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `REG-${prefix}-${suffix}`;
}

export function buildFormDataFromGuest(guest: GuestRecord): GuestRegistrationFormData {
  return {
    guestId: guest.id,
    fullName: guest.fullName,
    phone: guest.phone,
    email: guest.email,
    address: guest.address,
    city: guest.city,
    state: guest.state,
    country: guest.country || guest.nationality || 'Nigeria',
    nationality: guest.nationality || guest.country || 'Nigeria',
    idType: guest.idType || 'NIN',
    idNumber: guest.idNumber,
    idVerified: Boolean(guest.idNumber && guest.idNumber.trim().length >= 3),
    vipTier: guest.vipTier || 'Standard',
    notes: guest.notes,
  };
}

/**
 * Generates and downloads a formatted A4 PDF Guest Registration Card
 * populated with the guest's filled registration details.
 */
export function downloadGuestRegistrationPdf(params: GuestRegistrationExportParams): void {
  const { property, guest, latestReservation, rooms = [] } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const regNo = buildRegistrationNumber(property, guest);
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Top Royal Navy Header Banner
  doc.setFillColor(6, 21, 57); // #061539
  doc.rect(0, 0, pageWidth, 34, 'F');
  // Gold accent strip
  doc.setFillColor(245, 184, 0); // #f5b800
  doc.rect(0, 34, pageWidth, 1.8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text((property.name || 'Property Management System').toUpperCase(), margin, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const propAddress = [property.address, property.city, property.state]
    .filter(Boolean)
    .join(', ');
  const propContactParts = [propAddress, property.phone, property.email].filter(Boolean);
  if (propContactParts.length > 0) {
    doc.text(propContactParts.join('  |  '), margin, 21, { maxWidth: pageWidth - margin * 2 - 50 });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(245, 184, 0);
  doc.text('GUEST REGISTRATION CARD', pageWidth - margin, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Form No: ${regNo}`, pageWidth - margin, 21, { align: 'right' });
  doc.text(`Date: ${generatedDate}`, pageWidth - margin, 26.5, { align: 'right' });

  let cursorY = 44;

  // Section 1: Personal & Contact Information
  doc.setTextColor(6, 21, 57);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('1. PERSONAL & CONTACT DETAILS', margin, cursorY);

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      1: { cellWidth: 52 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 36 },
      3: { cellWidth: 54 },
    },
    body: [
      ['Full Name', safeVal(guest.fullName), 'Phone Number', safeVal(guest.phone)],
      ['Email Address', safeVal(guest.email), 'Guest Tier', safeVal(guest.vipTier, 'Standard')],
      [
        'Street Address',
        safeVal(guest.address),
        'City / State',
        [guest.city, guest.state].filter(Boolean).join(', ') || '—',
      ],
      [
        'Country',
        safeVal(guest.country || guest.nationality, 'Nigeria'),
        'Nationality',
        safeVal(guest.nationality || guest.country, 'Nigeria'),
      ],
    ],
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 95) + 8;

  // Section 2: Identification Details
  doc.setTextColor(6, 21, 57);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('2. IDENTIFICATION DETAILS', margin, cursorY);

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      1: { cellWidth: 52 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 36 },
      3: { cellWidth: 54 },
    },
    body: [
      ['ID Document Type', safeVal(guest.idType, 'NIN'), 'ID / Passport No.', safeVal(guest.idNumber)],
      [
        'ID Verification',
        guest.idVerified ? 'Verified by Front Desk' : 'Pending Verification',
        'Registration Date',
        generatedDate,
      ],
    ],
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 130) + 8;

  // Section 3: Reservation / Stay Details
  doc.setTextColor(6, 21, 57);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('3. STAY & RESERVATION INFORMATION', margin, cursorY);

  const roomInfo = latestReservation ? getReservationRoomDisplay(latestReservation, rooms) : null;
  const stayRows = latestReservation
    ? [
        [
          'Booking Ref',
          safeVal(latestReservation.bookingRef),
          'Status',
          RESERVATION_STATUS_LABELS[latestReservation.status] || latestReservation.status,
        ],
        [
          'Assigned Room',
          roomInfo
            ? roomInfo.isAssigned
              ? `${roomInfo.roomNumberLabel} (${roomInfo.roomTypeLabel})`
              : roomInfo.roomTypeLabel
            : safeVal(latestReservation.roomNumber),
          'Booking Channel',
          formatBookingSourceLabel(latestReservation.channel),
        ],
        [
          'Check-In Date',
          safeVal(latestReservation.checkInDate),
          'Check-Out Date',
          safeVal(latestReservation.checkOutDate),
        ],
        [
          'Duration / Guests',
          `${latestReservation.nights} Night${latestReservation.nights === 1 ? '' : 's'} · ${latestReservation.adults} Adult${latestReservation.adults === 1 ? '' : 's'}${latestReservation.children ? `, ${latestReservation.children} Child` : ''}`,
          'Room Rate / Total',
          `${formatNgn(latestReservation.nightlyRateNgn)}/nt (${formatNgn(latestReservation.roomChargesNgn)})`,
        ],
      ]
    : [
        ['Booking Ref', 'Walk-In / Profile Registration', 'Assigned Room', '______________________'],
        ['Check-In Date', '____ / ____ / ______', 'Check-Out Date', '____ / ____ / ______'],
        ['Adults / Children', '______ / ______', 'Payment Method', '______________________'],
      ];

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      1: { cellWidth: 52 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 36 },
      3: { cellWidth: 54 },
    },
    body: stayRows,
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 180) + 8;

  // Section 4: Notes & Guest Preferences
  doc.setTextColor(6, 21, 57);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('4. GUEST PREFERENCES & FRONT DESK NOTES', margin, cursorY);

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3.5,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    body: [[safeVal(guest.notes, 'No special requests or notes recorded.')]],
  });

  cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 208) + 8;

  // Section 5: Terms & Declaration
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 24, 2, 2, 'FD');

  doc.setTextColor(6, 21, 57);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('GUEST DECLARATION & HOUSE POLICY', margin + 3.5, cursorY + 5.5);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const policyText =
    `I confirm that the registration information provided above is accurate and agree to abide by the house rules, check-out times, and payment terms of ${property.name}. ` +
    `Standard check-in is 2:00 PM and check-out is 12:00 PM unless an approved extension is arranged with Front Desk.`;
  doc.text(policyText, margin + 3.5, cursorY + 11, { maxWidth: pageWidth - margin * 2 - 7 });

  cursorY += 34;

  // Signature Lines
  const colWidth = (pageWidth - margin * 2 - 14) / 2;
  doc.setDrawColor(100, 116, 139);
  doc.line(margin, cursorY + 12, margin + colWidth, cursorY + 12);
  doc.line(margin + colWidth + 14, cursorY + 12, pageWidth - margin, cursorY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Guest Signature & Date', margin, cursorY + 17);
  doc.text('Front Desk Officer Signature & Date', margin + colWidth + 14, cursorY + 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(safeVal(guest.fullName, 'Guest Name'), margin, cursorY + 21.5);
  doc.text(property.name || 'Front Desk', margin + colWidth + 14, cursorY + 21.5);

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${property.name} · Official Guest Registration Form`, margin, pageHeight - 8);
  doc.text(`Form ${regNo}`, pageWidth - margin, pageHeight - 8, { align: 'right' });

  const safeSlug = (guest.fullName || 'guest')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`guest-registration-${safeSlug || 'form'}.pdf`);
}

export interface BlankGuestRegistrationPrintParams {
  property: PropertyRecord;
}

/**
 * Prints a clean, blank single-page A4 Guest Registration Form with empty fields
 * for a guest to complete by hand at check-in, using a hidden iframe
 * (works cleanly inside embedded iframes without calling window.open).
 */
export function printGuestRegistrationForm(params: BlankGuestRegistrationPrintParams): void {
  const { property } = params;
  const propertyName = property.name || 'Property Management System';
  const propAddress = [property.address, property.city, property.state]
    .filter(Boolean)
    .join(', ');
  const propContact = [propAddress, property.phone, property.email]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(' &nbsp;|&nbsp; ');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Guest Registration Form - ${escapeHtml(propertyName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 9mm 11mm;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-sheet {
      width: 100%;
      max-height: 274mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    .header {
      background: #061539;
      color: #ffffff;
      padding: 13px 16px;
      border-bottom: 3.5px solid #f5b800;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
    }
    .header h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .header .contact {
      margin-top: 4px;
      font-size: 9.5px;
      color: #cbd5e1;
      line-height: 1.35;
    }
    .header .meta {
      text-align: right;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .header .meta .doc-title {
      font-size: 11px;
      font-weight: 800;
      color: #f5b800;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .header .meta .blank-meta {
      margin-top: 5px;
      font-size: 9.5px;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .instruction {
      margin: 8px 0 2px;
      font-size: 9.5px;
      color: #475569;
      font-style: italic;
    }
    .section {
      margin-top: 9px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-title {
      margin: 0 0 4px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #061539;
      border-left: 3px solid #f5b800;
      padding-left: 7px;
      line-height: 1.25;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
    }
    th, td {
      border: 1px solid #94a3b8;
      padding: 5px 8px;
      text-align: left;
      vertical-align: middle;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      color: #334155;
      width: 19%;
      font-size: 9.5px;
    }
    td {
      width: 31%;
      height: 27px;
      background: #ffffff;
      color: #475569;
    }
    .checkbox-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
      font-size: 9.5px;
      color: #334155;
    }
    .checkbox-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }
    .box {
      display: inline-block;
      width: 11px;
      height: 11px;
      border: 1.2px solid #475569;
      border-radius: 1.5px;
      background: #ffffff;
      flex-shrink: 0;
    }
    .hint {
      color: #94a3b8;
      font-size: 9px;
      letter-spacing: 0.04em;
    }
    .notes-box {
      border: 1px solid #94a3b8;
      padding: 6px 10px 8px;
      background: #ffffff;
    }
    .write-line {
      height: 20px;
      border-bottom: 1px dashed #cbd5e1;
    }
    .write-line:last-child {
      border-bottom: none;
      height: 16px;
    }
    .declaration {
      margin-top: 10px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 7px 10px;
      font-size: 9px;
      line-height: 1.45;
      color: #334155;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .declaration strong {
      display: block;
      color: #061539;
      margin-bottom: 2px;
      font-size: 9.5px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 26px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-block {
      border-top: 1px solid #475569;
      padding-top: 5px;
      font-size: 9.5px;
    }
    .sig-block strong {
      display: block;
      color: #061539;
      font-weight: 700;
    }
    .sig-block .sig-sub {
      margin-top: 4px;
      color: #64748b;
      font-size: 9px;
    }
    .footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="page-sheet">
    <div>
      <div class="header">
        <div>
          <h1>${escapeHtml(propertyName)}</h1>
          ${propContact ? `<div class="contact">${propContact}</div>` : ''}
        </div>
        <div class="meta">
          <div class="doc-title">GUEST REGISTRATION FORM</div>
          <div class="blank-meta">
            Date: _____ / _____ / 20_____ &nbsp;&nbsp;|&nbsp;&nbsp; Room No.: __________
          </div>
        </div>
      </div>

      <div class="instruction">
        Please complete all sections clearly in BLOCK LETTERS upon check-in.
      </div>

      <div class="section">
        <div class="section-title">1. Personal &amp; Contact Details</div>
        <table>
          <tbody>
            <tr>
              <th>Surname / Last Name</th>
              <td></td>
              <th>First &amp; Other Names</th>
              <td></td>
            </tr>
            <tr>
              <th>Phone Number</th>
              <td></td>
              <th>Email Address</th>
              <td></td>
            </tr>
            <tr>
              <th>Residential Address</th>
              <td colspan="3"></td>
            </tr>
            <tr>
              <th>City / State</th>
              <td></td>
              <th>Nationality / Country</th>
              <td></td>
            </tr>
            <tr>
              <th>Date of Birth</th>
              <td><span class="hint">DD / MM / YYYY</span></td>
              <th>Gender</th>
              <td>
                <div class="checkbox-row">
                  <span class="checkbox-item"><span class="box"></span> Male</span>
                  <span class="checkbox-item"><span class="box"></span> Female</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>Emergency Contact</th>
              <td></td>
              <th>Emergency Phone</th>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">2. Identification Details</div>
        <table>
          <tbody>
            <tr>
              <th>ID Document Type</th>
              <td colspan="3">
                <div class="checkbox-row">
                  <span class="checkbox-item"><span class="box"></span> NIN</span>
                  <span class="checkbox-item"><span class="box"></span> International Passport</span>
                  <span class="checkbox-item"><span class="box"></span> Driver's License</span>
                  <span class="checkbox-item"><span class="box"></span> Voter's Card</span>
                  <span class="checkbox-item"><span class="box"></span> Other: _______________</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>ID / Passport Number</th>
              <td></td>
              <th>Issuing Country</th>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">3. Stay &amp; Booking Details</div>
        <table>
          <tbody>
            <tr>
              <th>Check-In Date</th>
              <td><span class="hint">DD / MM / 20____</span></td>
              <th>Check-Out Date</th>
              <td><span class="hint">DD / MM / 20____</span></td>
            </tr>
            <tr>
              <th>Room Category</th>
              <td></td>
              <th>Number of Nights</th>
              <td></td>
            </tr>
            <tr>
              <th>Occupancy</th>
              <td><span class="hint">Adults: ______ &nbsp;&nbsp; Children: ______</span></td>
              <th>Vehicle Plate No.</th>
              <td></td>
            </tr>
            <tr>
              <th>Booking Channel</th>
              <td colspan="3">
                <div class="checkbox-row">
                  <span class="checkbox-item"><span class="box"></span> Walk-In</span>
                  <span class="checkbox-item"><span class="box"></span> Direct</span>
                  <span class="checkbox-item"><span class="box"></span> Booking.com</span>
                  <span class="checkbox-item"><span class="box"></span> Airbnb</span>
                  <span class="checkbox-item"><span class="box"></span> Expedia</span>
                  <span class="checkbox-item"><span class="box"></span> Corporate</span>
                </div>
              </td>
            </tr>
            <tr>
              <th>Payment Method</th>
              <td colspan="3">
                <div class="checkbox-row">
                  <span class="checkbox-item"><span class="box"></span> Bank Transfer</span>
                  <span class="checkbox-item"><span class="box"></span> POS / Card</span>
                  <span class="checkbox-item"><span class="box"></span> Cash</span>
                  <span class="checkbox-item"><span class="box"></span> Online / OTA</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">4. Special Requests / Additional Notes</div>
        <div class="notes-box">
          <div class="write-line"></div>
          <div class="write-line"></div>
          <div class="write-line"></div>
        </div>
      </div>

      <div class="declaration">
        <strong>Guest Declaration &amp; House Policy</strong>
        I confirm that the information provided on this registration form is true and accurate, and I agree to abide by the house rules, security regulations, and payment terms of ${escapeHtml(propertyName)}. Standard check-in is 2:00 PM and check-out is 12:00 PM unless an approved extension is arranged with Front Desk.
      </div>
    </div>

    <div>
      <div class="signatures">
        <div class="sig-block">
          <strong>Guest Signature</strong>
          <div class="sig-sub">Date: _____ / _____ / 20_____</div>
        </div>
        <div class="sig-block">
          <strong>Front Desk Officer Signature</strong>
          <div class="sig-sub">Name / Date: _______________________________</div>
        </div>
      </div>

      <div class="footer">
        <span>${escapeHtml(propertyName)} · Official Guest Registration Form</span>
        <span>Front Desk Copy</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  };

  const docObj = iframe.contentDocument || iframe.contentWindow?.document;
  if (!docObj || !iframe.contentWindow) {
    cleanup();
    return;
  }

  docObj.open();
  docObj.write(html);
  docObj.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };

  window.setTimeout(triggerPrint, 200);
}
