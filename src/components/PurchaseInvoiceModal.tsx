import React from 'react';
import { CheckCircle2, Download, Printer, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNgn, PropertyRecord } from '../types/pms';
import { useCms } from '../context/CmsContext';

export interface PurchaseInvoiceLineItem {
  description: string;
  quantity: number;
  unitCostNgn: number;
  totalNgn: number;
}

export interface PurchaseInvoiceData {
  invoiceNumber: string;
  date: string;
  title: string;
  subtitle?: string;
  partyLabel: string;
  partyName: string;
  category: string;
  paymentMethod: string;
  status: string;
  items: PurchaseInvoiceLineItem[];
  subtotalNgn: number;
  vatNgn?: number;
  totalNgn: number;
  notes?: string;
}

interface PurchaseInvoiceModalProps {
  property: PropertyRecord;
  invoice: PurchaseInvoiceData;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

function formatPdfNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-US')}`;
}

export const PurchaseInvoiceModal: React.FC<PurchaseInvoiceModalProps> = ({
  property,
  invoice,
  onClose,
  onNotify,
}) => {
  const { cms } = useCms();

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 16;

    if (property.logoUrl && property.logoUrl.startsWith('data:image/')) {
      try {
        const format = property.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(property.logoUrl, format, 14, y - 2, 16, 16);
      } catch {
        // Ignore non-embedded logo formats
      }
    }

    const headerX = property.logoUrl && property.logoUrl.startsWith('data:image/') ? 34 : 14;
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 21, 57);
    doc.text(property.name, headerX, y + 3);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    if (property.address) {
      doc.text(property.address, headerX, y + 8, { maxWidth: 110 });
    }
    const contact = [property.phone, property.email].filter(Boolean).join('  |  ');
    if (contact) {
      doc.text(contact, headerX, y + 13);
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 93, 52);
    doc.text(invoice.title.toUpperCase(), 196, y + 3, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Ref: ${invoice.invoiceNumber}`, 196, y + 9, { align: 'right' });
    doc.text(`Date: ${invoice.date}`, 196, y + 14, { align: 'right' });

    y += 22;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y, 196, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${invoice.partyLabel}:`, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.partyName || '—', 48, y);

    doc.setFont('helvetica', 'bold');
    doc.text('Status:', 130, y);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.status, 154, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.text('Category:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.category, 48, y);

    doc.setFont('helvetica', 'bold');
    doc.text('Method:', 130, y);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.paymentMethod, 154, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Qty', 'Unit Price', 'Line Total']],
      body: invoice.items.map((item) => [
        item.description,
        String(item.quantity),
        formatPdfNgn(item.unitCostNgn),
        formatPdfNgn(item.totalNgn),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [11, 93, 52], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
      columnStyles: {
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 38 },
        3: { halign: 'right', cellWidth: 40, fontStyle: 'bold' },
      },
    });

    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y + 32;
    let totalsY = finalY + 10;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Subtotal:', 136, totalsY);
    doc.text(formatPdfNgn(invoice.subtotalNgn), 196, totalsY, { align: 'right' });
    totalsY += 6;

    if ((invoice.vatNgn || 0) > 0) {
      doc.text('VAT (7.5%):', 136, totalsY);
      doc.text(formatPdfNgn(invoice.vatNgn || 0), 196, totalsY, { align: 'right' });
      totalsY += 6;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(136, totalsY - 1, 196, totalsY - 1);
    totalsY += 5;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 93, 52);
    doc.text('TOTAL:', 136, totalsY);
    doc.text(formatPdfNgn(invoice.totalNgn), 196, totalsY, { align: 'right' });

    if (invoice.notes) {
      totalsY += 12;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`Notes: ${invoice.notes}`, 14, totalsY, { maxWidth: 180 });
    }

    const footerNote =
      cms.brand.folioFooterNote || `Generated by ${property.name} · Official Transaction Invoice`;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(footerNote, 105, 282, { align: 'center' });

    const safeFile = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    doc.save(`${safeFile}-invoice.pdf`);
    onNotify?.(`Downloaded ${invoice.invoiceNumber} PDF invoice`);
  };

  return (
    <>
      <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 bg-emerald-50/70 border-b border-emerald-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                  {invoice.title}
                </h3>
                <p className="text-[11px] text-emerald-800 font-medium truncate">
                  {invoice.subtitle || 'Transaction completed — ready to print or save as PDF'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 cursor-pointer"
              aria-label="Close invoice modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Invoice Preview Sheet */}
          <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  {property.logoUrl && (
                    <img
                      src={property.logoUrl}
                      alt={property.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 object-contain rounded"
                    />
                  )}
                  <p className="font-display text-base font-bold text-slate-900">{property.name}</p>
                </div>
                {property.address && (
                  <p className="text-[11px] text-slate-500">{property.address}</p>
                )}
                {(property.phone || property.email) && (
                  <p className="text-[11px] font-mono-tabular text-slate-500">
                    {[property.phone, property.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <div className="sm:text-right space-y-0.5 shrink-0">
                <p className="font-mono-tabular text-sm font-bold text-[#0b5d34]">
                  {invoice.invoiceNumber}
                </p>
                <p className="font-mono-tabular text-[11px] text-slate-600">Date: {invoice.date}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  {invoice.status}
                </span>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {invoice.partyLabel}
                </p>
                <p className="font-semibold text-slate-900 mt-0.5">{invoice.partyName || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Category
                </p>
                <p className="font-semibold text-slate-900 mt-0.5">{invoice.category}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Payment Method
                </p>
                <p className="font-semibold text-slate-900 mt-0.5">{invoice.paymentMethod}</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3.5">Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item, idx) => (
                    <tr key={`${item.description}-${idx}`}>
                      <td className="py-2.5 px-3.5 font-medium text-slate-900">
                        {item.description}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono-tabular text-slate-700">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-700">
                        {formatNgn(item.unitCostNgn)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono-tabular font-semibold text-slate-900">
                        {formatNgn(item.totalNgn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end space-y-1.5 pt-1">
              <div className="w-full sm:w-64 flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono-tabular">{formatNgn(invoice.subtotalNgn)}</span>
              </div>
              {(invoice.vatNgn || 0) > 0 && (
                <div className="w-full sm:w-64 flex justify-between text-slate-600">
                  <span>VAT (7.5%)</span>
                  <span className="font-mono-tabular">{formatNgn(invoice.vatNgn || 0)}</span>
                </div>
              )}
              <div className="w-full sm:w-64 flex justify-between items-center pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                <span>Total Amount</span>
                <span className="font-mono-tabular text-[#0b5d34]">
                  {formatNgn(invoice.totalNgn)}
                </span>
              </div>
            </div>

            {invoice.notes && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-600">
                <strong className="text-slate-800">Notes:</strong> {invoice.notes}
              </div>
            )}
          </div>

          {/* Actions Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer whitespace-nowrap"
            >
              Done
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-800 font-semibold cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0b5d34] hover:bg-[#094a29] text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Invoice</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Print-Only Invoice Sheet */}
      <div className="hidden print-only max-w-[190mm] mx-auto p-6 text-xs text-slate-900 font-sans">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-4">
          <div className="space-y-1">
            {property.logoUrl && (
              <img
                src={property.logoUrl}
                alt={property.name}
                className="w-12 h-12 object-contain mb-1"
              />
            )}
            <p className="text-lg font-bold">{property.name}</p>
            {property.address && <p className="text-[11px]">{property.address}</p>}
            {(property.phone || property.email) && (
              <p className="text-[11px] font-mono">
                {[property.phone, property.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="text-right space-y-1">
            <p className="text-base font-bold uppercase tracking-wide">{invoice.title}</p>
            <p className="font-mono font-bold">{invoice.invoiceNumber}</p>
            <p className="font-mono text-[11px]">Date: {invoice.date}</p>
            <p className="text-[11px] font-semibold uppercase">Status: {invoice.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border border-slate-300 rounded p-3 mb-4 text-[11px]">
          <div>
            <p className="font-bold uppercase text-[10px] text-slate-600">{invoice.partyLabel}</p>
            <p className="font-semibold mt-0.5">{invoice.partyName || '—'}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[10px] text-slate-600">Category</p>
            <p className="font-semibold mt-0.5">{invoice.category}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[10px] text-slate-600">Payment Method</p>
            <p className="font-semibold mt-0.5">{invoice.paymentMethod}</p>
          </div>
        </div>

        <table className="w-full border-collapse border border-slate-300 mb-4 text-[11px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="py-2 px-3 text-left font-bold">Description</th>
              <th className="py-2 px-3 text-center font-bold">Qty</th>
              <th className="py-2 px-3 text-right font-bold">Unit Cost</th>
              <th className="py-2 px-3 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={`print-${item.description}-${idx}`} className="border-b border-slate-200">
                <td className="py-2 px-3">{item.description}</td>
                <td className="py-2 px-3 text-center font-mono">{item.quantity}</td>
                <td className="py-2 px-3 text-right font-mono">{formatNgn(item.unitCostNgn)}</td>
                <td className="py-2 px-3 text-right font-mono font-semibold">
                  {formatNgn(item.totalNgn)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end space-y-1 text-[11px] mb-6">
          <div className="w-60 flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono">{formatNgn(invoice.subtotalNgn)}</span>
          </div>
          {(invoice.vatNgn || 0) > 0 && (
            <div className="w-60 flex justify-between">
              <span>VAT (7.5%):</span>
              <span className="font-mono">{formatNgn(invoice.vatNgn || 0)}</span>
            </div>
          )}
          <div className="w-60 flex justify-between font-bold text-sm border-t border-slate-800 pt-1.5 mt-1">
            <span>TOTAL:</span>
            <span className="font-mono">{formatNgn(invoice.totalNgn)}</span>
          </div>
        </div>

        {invoice.notes && (
          <p className="text-[11px] border-t border-slate-200 pt-2 mb-4">
            <strong>Notes:</strong> {invoice.notes}
          </p>
        )}

        <p className="text-center text-[10px] text-slate-600 border-t border-slate-200 pt-3">
          {cms.brand.folioFooterNote || `Thank you for your business — ${property.name}.`}
        </p>
      </div>
    </>
  );
};
