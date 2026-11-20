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

  // Section 2: Identification & KYC Verification
  doc.setTextColor(6, 21, 57);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('2. IDENTIFICATION & KYC DETAILS', margin, cursorY);

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
        'KYC Verification',
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

/**
 * Prints a formatted Guest Registration Form using a hidden iframe
 * (works cleanly inside embedded iframes without calling window.open).
 */
export function printGuestRegistrationForm(params: GuestRegistrationExportParams): void {
  const { property, guest, latestReservation, rooms = [] } = params;
  const regNo = buildRegistrationNumber(property, guest);
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const propAddress = [property.address, property.city, property.state]
    .filter(Boolean)
    .join(', ');
  const propContact = [propAddress, property.phone, property.email]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(' &nbsp;|&nbsp; ');
  const cityState = [guest.city, guest.state].filter(Boolean).join(', ') || '—';
  const roomInfo = latestReservation ? getReservationRoomDisplay(latestReservation, rooms) : null;

  const staySectionHtml = latestReservation
    ? `
      <tr>
        <th>Booking Reference</th>
        <td>${escapeHtml(safeVal(latestReservation.bookingRef))}</td>
        <th>Reservation Status</th>
        <td>${escapeHtml(RESERVATION_STATUS_LABELS[latestReservation.status] || latestReservation.status)}</td>
      </tr>
      <tr>
        <th>Assigned Room</th>
        <td>${escapeHtml(
          roomInfo
            ? roomInfo.isAssigned
              ? `${roomInfo.roomNumberLabel} (${roomInfo.roomTypeLabel})`
              : roomInfo.roomTypeLabel
            : safeVal(latestReservation.roomNumber)
        )}</td>
        <th>Booking Source</th>
        <td>${escapeHtml(formatBookingSourceLabel(latestReservation.channel))}</td>
      </tr>
      <tr>
        <th>Check-In Date</th>
        <td>${escapeHtml(safeVal(latestReservation.checkInDate))}</td>
        <th>Check-Out Date</th>
        <td>${escapeHtml(safeVal(latestReservation.checkOutDate))}</td>
      </tr>
      <tr>
        <th>Nights / Occupancy</th>
        <td>${latestReservation.nights} Night${latestReservation.nights === 1 ? '' : 's'} · ${latestReservation.adults} Adult${latestReservation.adults === 1 ? '' : 's'}${latestReservation.children ? `, ${latestReservation.children} Child` : ''}</td>
        <th>Rate / Total</th>
        <td>${escapeHtml(`${formatNgn(latestReservation.nightlyRateNgn)}/nt (${formatNgn(latestReservation.roomChargesNgn)})`)}</td>
      </tr>
    `
    : `
      <tr>
        <th>Booking Reference</th>
        <td>Walk-In / Guest Registration</td>
        <th>Assigned Room</th>
        <td>_______________________</td>
      </tr>
      <tr>
        <th>Check-In Date</th>
        <td>____ / ____ / ______</td>
        <th>Check-Out Date</th>
        <td>____ / ____ / ______</td>
      </tr>
      <tr>
        <th>Adults / Children</th>
        <td>______ / ______</td>
        <th>Payment Method</th>
        <td>_______________________</td>
      </tr>
    `;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Guest Registration Form - ${escapeHtml(safeVal(guest.fullName, 'Guest'))}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      background: #061539;
      color: #ffffff;
      padding: 18px 20px;
      border-bottom: 4px solid #f5b800;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .header .contact {
      margin-top: 5px;
      font-size: 11px;
      color: #cbd5e1;
    }
    .header .meta {
      text-align: right;
      white-space: nowrap;
    }
    .header .meta .doc-title {
      font-size: 12px;
      font-weight: 700;
      color: #f5b800;
      letter-spacing: 0.08em;
    }
    .header .meta .sub {
      font-size: 10.5px;
      color: #e2e8f0;
      margin-top: 4px;
    }
    .content { padding: 18px 0 8px; }
    .section-title {
      margin: 16px 0 6px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #061539;
    }
    .section-title:first-child { margin-top: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 9px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      color: #334155;
      width: 19%;
    }
    td { width: 31%; color: #0f172a; }
    .notes-box {
      border: 1px solid #cbd5e1;
      padding: 10px 12px;
      font-size: 11.5px;
      min-height: 44px;
      color: #1e293b;
      white-space: pre-wrap;
    }
    .declaration {
      margin-top: 16px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 10.5px;
      line-height: 1.5;
      color: #475569;
    }
    .declaration strong {
      display: block;
      color: #061539;
      margin-bottom: 4px;
      font-size: 10.5px;
      letter-spacing: 0.04em;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 36px;
      margin-top: 38px;
    }
    .sig-block {
      border-top: 1px solid #64748b;
      padding-top: 6px;
      font-size: 11px;
    }
    .sig-block strong { display: block; color: #0f172a; }
    .sig-block span { color: #64748b; font-size: 10px; }
    .footer {
      margin-top: 26px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(property.name || 'Property Management System')}</h1>
      ${propContact ? `<div class="contact">${propContact}</div>` : ''}
    </div>
    <div class="meta">
      <div class="doc-title">GUEST REGISTRATION CARD</div>
      <div class="sub">Form No: ${escapeHtml(regNo)}</div>
      <div class="sub">Date: ${escapeHtml(generatedDate)}</div>
    </div>
  </div>

  <div class="content">
    <div class="section-title">1. Personal &amp; Contact Details</div>
    <table>
      <tbody>
        <tr>
          <th>Full Name</th>
          <td>${escapeHtml(safeVal(guest.fullName))}</td>
          <th>Phone Number</th>
          <td>${escapeHtml(safeVal(guest.phone))}</td>
        </tr>
        <tr>
          <th>Email Address</th>
          <td>${escapeHtml(safeVal(guest.email))}</td>
          <th>Guest Tier</th>
          <td>${escapeHtml(safeVal(guest.vipTier, 'Standard'))}</td>
        </tr>
        <tr>
          <th>Street Address</th>
          <td>${escapeHtml(safeVal(guest.address))}</td>
          <th>City / State</th>
          <td>${escapeHtml(cityState)}</td>
        </tr>
        <tr>
          <th>Country</th>
          <td>${escapeHtml(safeVal(guest.country || guest.nationality, 'Nigeria'))}</td>
          <th>Nationality</th>
          <td>${escapeHtml(safeVal(guest.nationality || guest.country, 'Nigeria'))}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">2. Identification &amp; KYC Details</div>
    <table>
      <tbody>
        <tr>
          <th>ID Document Type</th>
          <td>${escapeHtml(safeVal(guest.idType, 'NIN'))}</td>
          <th>ID / Passport No.</th>
          <td>${escapeHtml(safeVal(guest.idNumber))}</td>
        </tr>
        <tr>
          <th>KYC Verification</th>
          <td>${guest.idVerified ? 'Verified by Front Desk' : 'Pending Verification'}</td>
          <th>Registration Date</th>
          <td>${escapeHtml(generatedDate)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">3. Stay &amp; Reservation Information</div>
    <table>
      <tbody>
        ${staySectionHtml}
      </tbody>
    </table>

    <div class="section-title">4. Guest Preferences &amp; Front Desk Notes</div>
    <div class="notes-box">${escapeHtml(safeVal(guest.notes, 'No special requests or notes recorded.'))}</div>

    <div class="declaration">
      <strong>GUEST DECLARATION &amp; HOUSE POLICY</strong>
      I confirm that the registration information provided above is accurate and agree to abide by the house rules, check-out times, and payment terms of ${escapeHtml(property.name)}. Standard check-in is 2:00 PM and check-out is 12:00 PM unless an approved extension is arranged with Front Desk.
    </div>

    <div class="signatures">
      <div class="sig-block">
        <strong>Guest Signature &amp; Date</strong>
        <span>${escapeHtml(safeVal(guest.fullName, 'Guest Name'))}</span>
      </div>
      <div class="sig-block">
        <strong>Front Desk Officer Signature &amp; Date</strong>
        <span>${escapeHtml(property.name || 'Front Desk')}</span>
      </div>
    </div>

    <div class="footer">
      <span>${escapeHtml(property.name)} · Official Guest Registration Form</span>
      <span>Form ${escapeHtml(regNo)}</span>
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
