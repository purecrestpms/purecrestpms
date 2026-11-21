import { formatNgn, PosOrderRecord, PropertyRecord } from '../types/pms';

export interface PrintablePosLineItem {
  name: string;
  qty: number;
  unitPriceNgn: number;
  lineTotalNgn: number;
}

export interface PrintablePosOrderPayload {
  orderNumber: string;
  orderDate: string;
  serviceType: PosOrderRecord['serviceType'];
  tableOrRoom: string;
  guestName: string;
  itemsSummary: string;
  itemCount: number;
  lineItems: PrintablePosLineItem[];
  subtotalNgn: number;
  discountNgn: number;
  serviceChargeNgn: number;
  serviceChargeRatePct: number;
  vatNgn: number;
  taxRatePct: number;
  totalNgn: number;
  paymentMethod: PosOrderRecord['paymentMethod'];
  paymentStatus: PosOrderRecord['paymentStatus'];
  notes?: string;
  isPreview?: boolean;
}

export interface PrintablePurchaseInvoicePayload {
  invoiceNumber: string;
  date: string;
  title: string;
  partyLabel: string;
  partyName: string;
  category: string;
  paymentMethod: string;
  status: string;
  items: Array<{
    description: string;
    quantity: number;
    unitCostNgn: number;
    totalNgn: number;
  }>;
  subtotalNgn: number;
  vatNgn?: number;
  totalNgn: number;
  notes?: string;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'Card POS':
      return 'Card';
    case 'Cash NGN':
      return 'Cash';
    case 'Bank Transfer':
      return 'Bank Transfer';
    case 'Room Folio':
      return 'Room Charge';
    default:
      return method || 'Cash';
  }
}

export function printStandaloneHtml(html: string): boolean {
  if (typeof document === 'undefined') return false;

  const existing = document.getElementById('purecrest-pos-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'purecrest-pos-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!frameDoc || !iframe.contentWindow) {
    iframe.remove();
    return false;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  let printed = false;
  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1500);
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      win.addEventListener('afterprint', cleanup, { once: true });
      win.focus();
      win.print();
      // Safety cleanup after 60s in case browser does not fire afterprint
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 60_000);
    } catch {
      cleanup();
    }
  };

  iframe.onload = () => {
    window.setTimeout(triggerPrint, 80);
  };
  // Fallback if onload already fired synchronously on document.close()
  window.setTimeout(triggerPrint, 180);
  return true;
}

export function printPosOrderDocument(params: {
  property: PropertyRecord;
  doc: PrintablePosOrderPayload;
  mode: 'receipt' | 'invoice';
  receiptHeaderNote?: string;
  receiptFooterNote: string;
}): boolean {
  const { property, doc, mode, receiptHeaderNote, receiptFooterNote } = params;
  const contactLine = [property.phone, property.email].filter(Boolean).join(' · ');
  const statusLabel =
    doc.paymentStatus === 'room_folio'
      ? 'CHARGED TO ROOM FOLIO'
      : String(doc.paymentStatus || 'paid').toUpperCase();

  if (mode === 'receipt') {
    const rowsHtml = doc.lineItems
      .map(
        (line) => `
          <tr>
            <td class="item-col">${escapeHtml(line.name)}</td>
            <td class="qty-col">${line.qty}</td>
            <td class="amt-col">${escapeHtml(formatNgn(line.lineTotalNgn))}</td>
          </tr>
        `
      )
      .join('');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt #${escapeHtml(doc.orderNumber)}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 4mm;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        line-height: 1.45;
        color: #0f172a;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .receipt {
        width: 72mm;
        max-width: 100%;
        margin: 0 auto;
      }
      .center { text-align: center; }
      .brand { font-size: 14px; font-weight: 800; color: #0a367a; margin: 0 0 3px; }
      .muted { color: #475569; font-size: 10px; margin: 1px 0; }
      .divider { border: 0; border-top: 1px dashed #94a3b8; margin: 8px 0; }
      .meta-row, .tot-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin: 2px 0;
      }
      .bold { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0; }
      th {
        font-size: 10px;
        text-transform: uppercase;
        color: #475569;
        border-bottom: 1px solid #cbd5e1;
        padding: 3px 0;
        text-align: left;
      }
      td { padding: 3px 0; vertical-align: top; }
      .item-col { width: 54%; word-break: break-word; padding-right: 4px; }
      .qty-col { width: 14%; text-align: right; }
      .amt-col { width: 32%; text-align: right; font-weight: 600; white-space: nowrap; }
      th.qty-col, th.amt-col { text-align: right; }
      .grand-total {
        font-size: 13px;
        font-weight: 800;
        color: #0a367a;
        border-top: 1px solid #0f172a;
        padding-top: 5px;
        margin-top: 5px;
      }
      .note-box {
        margin-top: 6px;
        font-size: 10px;
        color: #334155;
      }
      .footer {
        text-align: center;
        font-size: 10px;
        color: #475569;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="center">
        <p class="brand">${escapeHtml(property.name)}</p>
        ${property.address ? `<p class="muted">${escapeHtml(property.address)}</p>` : ''}
        ${contactLine ? `<p class="muted">${escapeHtml(contactLine)}</p>` : ''}
        ${receiptHeaderNote ? `<p class="muted bold">${escapeHtml(receiptHeaderNote)}</p>` : ''}
      </div>
      <hr class="divider" />
      <div class="meta-row bold">
        <span>${doc.isPreview ? 'PROFORMA RECEIPT' : 'POS RECEIPT'}</span>
        <span>#${escapeHtml(doc.orderNumber)}</span>
      </div>
      <div class="meta-row"><span class="muted">Date:</span><span>${escapeHtml(doc.orderDate)}</span></div>
      <div class="meta-row"><span class="muted">Account:</span><span>${escapeHtml(doc.tableOrRoom)}</span></div>
      <div class="meta-row"><span class="muted">Guest:</span><span>${escapeHtml(doc.guestName)}</span></div>
      <hr class="divider" />
      <table>
        <thead>
          <tr>
            <th class="item-col">Item</th>
            <th class="qty-col">Qty</th>
            <th class="amt-col">Total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <hr class="divider" />
      <div class="tot-row"><span>Subtotal</span><span>${escapeHtml(formatNgn(doc.subtotalNgn))}</span></div>
      ${
        doc.discountNgn > 0
          ? `<div class="tot-row"><span>Discount</span><span>-${escapeHtml(formatNgn(doc.discountNgn))}</span></div>`
          : ''
      }
      ${
        doc.serviceChargeNgn > 0
          ? `<div class="tot-row"><span>Service Charge${doc.serviceChargeRatePct ? ` (${doc.serviceChargeRatePct}%)` : ''}</span><span>${escapeHtml(formatNgn(doc.serviceChargeNgn))}</span></div>`
          : ''
      }
      ${
        doc.vatNgn > 0
          ? `<div class="tot-row"><span>Tax / VAT${doc.taxRatePct ? ` (${doc.taxRatePct}%)` : ''}</span><span>${escapeHtml(formatNgn(doc.vatNgn))}</span></div>`
          : ''
      }
      <div class="tot-row grand-total">
        <span>TOTAL</span>
        <span>${escapeHtml(formatNgn(doc.totalNgn))}</span>
      </div>
      <hr class="divider" />
      <div class="meta-row"><span class="muted">Payment:</span><span class="bold">${escapeHtml(formatPaymentMethodLabel(doc.paymentMethod))}</span></div>
      <div class="meta-row"><span class="muted">Status:</span><span class="bold">${escapeHtml(statusLabel)}</span></div>
      ${doc.notes ? `<p class="note-box"><strong>Note:</strong> ${escapeHtml(doc.notes)}</p>` : ''}
      <p class="footer">${escapeHtml(receiptFooterNote)}</p>
    </div>
  </body>
</html>`;

    return printStandaloneHtml(html);
  }

  // Formal A4 Invoice HTML
  const rowsHtml = doc.lineItems
    .map(
      (line) => `
        <tr>
          <td>${escapeHtml(line.name)}</td>
          <td class="num">${line.qty}</td>
          <td class="num">${escapeHtml(formatNgn(line.unitPriceNgn))}</td>
          <td class="num bold">${escapeHtml(formatNgn(line.lineTotalNgn))}</td>
        </tr>
      `
    )
    .join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${escapeHtml(doc.orderNumber)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.5;
        color: #0f172a;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .banner {
        background: #0a367a;
        color: #ffffff;
        padding: 18px 22px;
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 18px;
      }
      .banner h1 { margin: 0 0 4px; font-size: 19px; font-weight: 800; }
      .banner p { margin: 2px 0; font-size: 11px; color: #dbeafe; }
      .banner-right { text-align: right; }
      .banner-right .doc-type { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff; }
      .meta-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding-bottom: 14px;
        margin-bottom: 16px;
        border-bottom: 1px solid #e2e8f0;
      }
      .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
      .meta-val { font-size: 13px; font-weight: 700; color: #0f172a; margin: 0; }
      .meta-sub { font-size: 11px; color: #475569; margin: 2px 0; }
      .right { text-align: right; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
      th {
        background: #f1f5f9;
        color: #334155;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 9px 10px;
        text-align: left;
        border-top: 1px solid #cbd5e1;
        border-bottom: 1px solid #cbd5e1;
      }
      td {
        padding: 9px 10px;
        border-bottom: 1px solid #e2e8f0;
      }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .bold { font-weight: 700; }
      .totals-wrap { display: flex; justify-content: flex-end; }
      .totals-box { width: 270px; }
      .tot-row { display: flex; justify-content: space-between; padding: 4px 0; color: #334155; }
      .grand {
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #0a367a;
        font-size: 14px;
        font-weight: 800;
      }
      .notes {
        margin-top: 16px;
        padding: 10px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 11px;
        color: #334155;
      }
      .footer {
        margin-top: 26px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        text-align: center;
        font-size: 11px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="banner">
      <div>
        <h1>${escapeHtml(property.name)}</h1>
        ${property.address ? `<p>${escapeHtml(property.address)}</p>` : ''}
        ${contactLine ? `<p>${escapeHtml(contactLine)}</p>` : ''}
        ${receiptHeaderNote ? `<p>${escapeHtml(receiptHeaderNote)}</p>` : ''}
      </div>
      <div class="banner-right">
        <p class="doc-type">${doc.isPreview ? 'Proforma Invoice' : 'POS Tax Invoice'}</p>
        <p>#${escapeHtml(doc.orderNumber)}</p>
        <p>Date: ${escapeHtml(doc.orderDate)}</p>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-label">Billed To</div>
        <p class="meta-val">${escapeHtml(doc.guestName)}</p>
        <p class="meta-sub">${escapeHtml(doc.tableOrRoom)}</p>
        <p class="meta-sub">Service: ${escapeHtml(doc.serviceType)}</p>
      </div>
      <div class="right">
        <div class="meta-label">Payment Details</div>
        <p class="meta-val">${escapeHtml(formatPaymentMethodLabel(doc.paymentMethod))}</p>
        <p class="meta-sub bold" style="color:#0a367a;">${escapeHtml(statusLabel)}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit Price</th>
          <th class="num">Line Total</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals-box">
        <div class="tot-row"><span>Subtotal</span><span class="num bold">${escapeHtml(formatNgn(doc.subtotalNgn))}</span></div>
        ${
          doc.discountNgn > 0
            ? `<div class="tot-row" style="color:#be123c;"><span>Discount</span><span class="num bold">-${escapeHtml(formatNgn(doc.discountNgn))}</span></div>`
            : ''
        }
        ${
          doc.serviceChargeNgn > 0
            ? `<div class="tot-row"><span>Service Charge${doc.serviceChargeRatePct ? ` (${doc.serviceChargeRatePct}%)` : ''}</span><span class="num bold">${escapeHtml(formatNgn(doc.serviceChargeNgn))}</span></div>`
            : ''
        }
        ${
          doc.vatNgn > 0
            ? `<div class="tot-row"><span>Tax / VAT${doc.taxRatePct ? ` (${doc.taxRatePct}%)` : ''}</span><span class="num bold">${escapeHtml(formatNgn(doc.vatNgn))}</span></div>`
            : ''
        }
        <div class="tot-row grand">
          <span>TOTAL</span>
          <span class="num">${escapeHtml(formatNgn(doc.totalNgn))}</span>
        </div>
      </div>
    </div>

    ${doc.notes ? `<div class="notes"><strong>Order Notes:</strong> ${escapeHtml(doc.notes)}</div>` : ''}
    <div class="footer">${escapeHtml(receiptFooterNote)}</div>
  </body>
</html>`;

  return printStandaloneHtml(html);
}

export function printPurchaseInvoiceDocument(params: {
  property: PropertyRecord;
  invoice: PrintablePurchaseInvoicePayload;
  footerNote: string;
}): boolean {
  const { property, invoice, footerNote } = params;
  const contactLine = [property.phone, property.email].filter(Boolean).join(' · ');

  const rowsHtml = invoice.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${escapeHtml(formatNgn(item.unitCostNgn))}</td>
          <td class="num bold">${escapeHtml(formatNgn(item.totalNgn))}</td>
        </tr>
      `
    )
    .join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(invoice.title)} #${escapeHtml(invoice.invoiceNumber)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.5;
        color: #0f172a;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .banner {
        background: #0a367a;
        color: #ffffff;
        padding: 18px 22px;
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 18px;
      }
      .banner h1 { margin: 0 0 4px; font-size: 19px; font-weight: 800; }
      .banner p { margin: 2px 0; font-size: 11px; color: #dbeafe; }
      .banner-right { text-align: right; }
      .banner-right .doc-type { font-size: 15px; font-weight: 800; text-transform: uppercase; color: #ffffff; }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        padding: 12px 14px;
        margin-bottom: 16px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
      }
      .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
      .meta-val { font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
      th {
        background: #f1f5f9;
        color: #334155;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 9px 10px;
        text-align: left;
        border-top: 1px solid #cbd5e1;
        border-bottom: 1px solid #cbd5e1;
      }
      td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .bold { font-weight: 700; }
      .totals-wrap { display: flex; justify-content: flex-end; }
      .totals-box { width: 260px; }
      .tot-row { display: flex; justify-content: space-between; padding: 4px 0; color: #334155; }
      .grand {
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #0a367a;
        font-size: 14px;
        font-weight: 800;
      }
      .notes {
        margin-top: 16px;
        padding: 10px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 11px;
        color: #334155;
      }
      .footer {
        margin-top: 26px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        text-align: center;
        font-size: 11px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="banner">
      <div>
        <h1>${escapeHtml(property.name)}</h1>
        ${property.address ? `<p>${escapeHtml(property.address)}</p>` : ''}
        ${contactLine ? `<p>${escapeHtml(contactLine)}</p>` : ''}
      </div>
      <div class="banner-right">
        <p class="doc-type">${escapeHtml(invoice.title)}</p>
        <p>${escapeHtml(invoice.invoiceNumber)}</p>
        <p>Date: ${escapeHtml(invoice.date)} · ${escapeHtml(invoice.status.toUpperCase())}</p>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-label">${escapeHtml(invoice.partyLabel)}</div>
        <div class="meta-val">${escapeHtml(invoice.partyName || '—')}</div>
      </div>
      <div>
        <div class="meta-label">Category</div>
        <div class="meta-val">${escapeHtml(invoice.category)}</div>
      </div>
      <div>
        <div class="meta-label">Payment Method</div>
        <div class="meta-val">${escapeHtml(invoice.paymentMethod)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit Cost</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals-box">
        <div class="tot-row"><span>Subtotal</span><span class="num bold">${escapeHtml(formatNgn(invoice.subtotalNgn))}</span></div>
        ${
          (invoice.vatNgn || 0) > 0
            ? `<div class="tot-row"><span>VAT (7.5%)</span><span class="num bold">${escapeHtml(formatNgn(invoice.vatNgn || 0))}</span></div>`
            : ''
        }
        <div class="tot-row grand">
          <span>TOTAL</span>
          <span class="num">${escapeHtml(formatNgn(invoice.totalNgn))}</span>
        </div>
      </div>
    </div>

    ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}
    <div class="footer">${escapeHtml(footerNote)}</div>
  </body>
</html>`;

  return printStandaloneHtml(html);
}
