import React, { useEffect, useState } from 'react';
import { Download, FileText, Package, Plus, Printer, ShoppingCart } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  adjustInventoryQty,
  createInventoryItem,
  createLedgerEntry,
  createPurchaseOrder,
  receivePurchaseOrderWorkflow,
} from '../services/pmsService';
import {
  formatNgn,
  InventoryItemRecord,
  LedgerEntryRecord,
  NavSectionId,
  PropertyRecord,
  PurchaseOrderRecord,
  RICHGATES_PROPERTY_INFO,
} from '../types/pms';
import { useCms } from '../context/CmsContext';

function formatPdfNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-US')}`;
}

interface FinanceInventoryViewProps {
  section: Extract<NavSectionId, 'accounting' | 'reports' | 'inventory' | 'procurement'>;
  property: PropertyRecord;
  ledgerEntries: LedgerEntryRecord[];
  inventoryItems: InventoryItemRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  actorRole: string;
  onNotify: (msg: string) => void;
}

export const FinanceInventoryView: React.FC<FinanceInventoryViewProps> = ({
  section,
  property,
  ledgerEntries,
  inventoryItems,
  purchaseOrders,
  actorRole,
  onNotify,
}) => {
  const { cms } = useCms();
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [entryType, setEntryType] = useState<'revenue' | 'expense'>('expense');
  const [category, setCategory] =
    useState<LedgerEntryRecord['category']>('Utilities & Diesel');
  const [description, setDescription] = useState('');
  const [amountNgn, setAmountNgn] = useState(50000);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');

  const [showInvForm, setShowInvForm] = useState(false);
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  const [invCategory, setInvCategory] =
    useState<InventoryItemRecord['category']>('Kitchen & Pantry');
  const [unit, setUnit] = useState('Units');
  const [qtyOnHand, setQtyOnHand] = useState(10);
  const [reorderLevel, setReorderLevel] = useState(4);
  const [unitCostNgn, setUnitCostNgn] = useState(15000);
  const [supplierName, setSupplierName] = useState('');

  const [showPoForm, setShowPoForm] = useState(false);
  const [poItemId, setPoItemId] = useState(inventoryItems[0]?.id || '');
  const [poSupplier, setPoSupplier] = useState('');
  const [poQty, setPoQty] = useState(5);
  const [poUnitCost, setPoUnitCost] = useState(25000);
  const [poExpectedDate, setPoExpectedDate] = useState('2026-11-18');

  useEffect(() => {
    if (!poItemId && inventoryItems[0]) {
      setPoItemId(inventoryItems[0].id);
      setPoSupplier(inventoryItems[0].supplierName);
      setPoUnitCost(inventoryItems[0].unitCostNgn);
    }
  }, [inventoryItems, poItemId]);

  const totalRevenue = ledgerEntries
    .filter((e) => e.entryType === 'revenue')
    .reduce((s, e) => s + e.amountNgn, 0);
  const totalExpenses = ledgerEntries
    .filter((e) => e.entryType === 'expense')
    .reduce((s, e) => s + e.amountNgn, 0);
  const totalVat = ledgerEntries.reduce((s, e) => s + e.vatNgn, 0);
  const netProfit = totalRevenue - totalExpenses;

  const roomRevenue = ledgerEntries
    .filter((e) => e.entryType === 'revenue' && e.category === 'Room Accommodation')
    .reduce((s, e) => s + e.amountNgn, 0);
  const fnbRevenue = ledgerEntries
    .filter((e) => e.entryType === 'revenue' && e.category === 'Restaurant & Bar')
    .reduce((s, e) => s + e.amountNgn, 0);

  const handleExportCsv = () => {
    const header = 'Date,Type,Category,Reference,Description,Amount_NGN,VAT_NGN,Method\n';
    const rows = ledgerEntries
      .map(
        (e) =>
          `"${e.entryDate}","${e.entryType}","${e.category}","${e.reference || ''}","${e.description.replace(/"/g, '""')}",${e.amountNgn},${e.vatNgn},"${e.paymentMethod}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${property.code}-financial-ledger.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Exported NGN financial statement CSV');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const todayIso = new Date().toISOString().slice(0, 10);
    const propAddress = property.address || RICHGATES_PROPERTY_INFO.address;
    const propPhone = property.phone || RICHGATES_PROPERTY_INFO.phone;
    const propEmail = property.email || RICHGATES_PROPERTY_INFO.email;

    let textStartX = 14;
    if (property.logoUrl && property.logoUrl.startsWith('data:image/')) {
      try {
        const imgFormat = property.logoUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(property.logoUrl, imgFormat, 14, 12, 16, 16);
        textStartX = 34;
      } catch {
        // Skip logo embedding if image format is incompatible
      }
    }

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(property.name, textStartX, 17);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(propAddress, textStartX, 22);
    doc.text(`${propPhone} | ${propEmail}`, textStartX, 26.5);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text('Financial Report & VAT Statement', 14, 36);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} (${todayIso}) | Prepared by: ${actorRole}`, 14, 41);

    autoTable(doc, {
      startY: 46,
      head: [['Gross Revenue', 'Operating Expenses', 'Net Operating Surplus', 'VAT Collected (7.5%)']],
      body: [[
        formatPdfNgn(totalRevenue),
        formatPdfNgn(totalExpenses),
        formatPdfNgn(netProfit),
        formatPdfNgn(totalVat),
      ]],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontStyle: 'bold', fontSize: 9.5, textColor: [15, 23, 42] },
    });

    const summaryFinalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 68;

    autoTable(doc, {
      startY: summaryFinalY + 6,
      head: [['Date', 'Reference', 'Category', 'Description', 'Method', 'VAT', 'Amount']],
      body: ledgerEntries.map((e) => [
        e.entryDate,
        e.reference || '-',
        e.category,
        e.description,
        e.paymentMethod,
        formatPdfNgn(e.vatNgn),
        `${e.entryType === 'revenue' ? '+' : '-'}${formatPdfNgn(e.amountNgn)}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [4, 120, 87], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' },
      },
    });

    doc.save(`${property.code.toLowerCase()}-financial-report-${todayIso}.pdf`);
    onNotify('Downloaded Financial Report PDF');
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleAddLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    await createLedgerEntry({
      property,
      entry: {
        entryDate: new Date().toISOString().slice(0, 10),
        entryType,
        category,
        reference: `MAN-${Math.floor(100 + Math.random() * 899)}`,
        description: description.trim(),
        amountNgn: Math.max(0, amountNgn),
        vatNgn: entryType === 'revenue' ? Math.round(amountNgn * 0.075) : 0,
        paymentMethod,
      },
      actorRole,
    });
    onNotify(`Posted ${entryType} entry (${formatNgn(amountNgn)})`);
    setShowLedgerForm(false);
    setDescription('');
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !itemName.trim()) return;
    await createInventoryItem({
      property,
      item: {
        sku: sku.trim().toUpperCase(),
        name: itemName.trim(),
        category: invCategory,
        unit: unit.trim(),
        quantityOnHand: Math.max(0, qtyOnHand),
        reorderLevel: Math.max(0, reorderLevel),
        unitCostNgn: Math.max(0, unitCostNgn),
        supplierName: supplierName.trim() || 'Local Enugu Vendor',
      },
      actorRole,
    });
    onNotify(`Added inventory SKU ${sku.toUpperCase()}`);
    setShowInvForm(false);
    setSku('');
    setItemName('');
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    const linked = inventoryItems.find((i) => i.id === poItemId);
    const name = linked ? linked.name : 'General Supplies';
    const sup = poSupplier.trim() || linked?.supplierName || 'Ogbete Wholesale Ltd';
    await createPurchaseOrder({
      property,
      supplierName: sup,
      item: linked,
      itemName: name,
      quantity: Math.max(1, poQty),
      unitCostNgn: Math.max(0, poUnitCost || linked?.unitCostNgn || 10000),
      expectedDate: poExpectedDate,
      actorRole,
    });
    onNotify(`Issued Purchase Order for ${name}`);
    setShowPoForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Print-Only Formal Letterhead */}
      {(section === 'accounting' || section === 'reports') && (
        <div className="hidden print-only border-b-2 border-slate-900 pb-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {property.logoUrl && (
                <img
                  src={property.logoUrl}
                  alt={property.name}
                  className="w-12 h-12 object-contain"
                />
              )}
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">{property.name}</h2>
                <p className="text-xs text-slate-600">
                  {property.address || RICHGATES_PROPERTY_INFO.address}
                </p>
                <p className="text-xs text-slate-600">
                  {property.phone || RICHGATES_PROPERTY_INFO.phone} ·{' '}
                  {property.email || RICHGATES_PROPERTY_INFO.email}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p className="font-bold text-slate-900">Financial Report &amp; VAT Statement</p>
              <p>Printed: {new Date().toLocaleDateString('en-GB')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {cms.pages[section].title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages[section].subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(section === 'accounting' || section === 'reports') && (
            <>
              <button
                type="button"
                onClick={handlePrintReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{section === 'reports' ? cms.pages.reports.ctaLabel || 'Export PDF' : 'Export PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={() => setShowLedgerForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{cms.pages.accounting.ctaLabel || 'Post Journal Entry'}</span>
              </button>
            </>
          )}
          {section === 'inventory' && (
            <button
              type="button"
              onClick={() => setShowInvForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{cms.pages.inventory.ctaLabel || 'Add Inventory Item'}</span>
            </button>
          )}
          {section === 'procurement' && (
            <button
              type="button"
              onClick={() => setShowPoForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{cms.pages.procurement.ctaLabel || 'New Purchase Order'}</span>
            </button>
          )}
        </div>
      </div>

      {/* P&L Summary Strip for Accounting & Reports */}
      {(section === 'accounting' || section === 'reports') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Gross Operating Revenue</p>
            <p className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
              {formatNgn(totalRevenue)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Rooms {formatNgn(roomRevenue)} · F&amp;B {formatNgn(fnbRevenue)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Operating Expenses</p>
            <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
              {formatNgn(totalExpenses)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Diesel, Procurement &amp; Payroll</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">Net Operating Surplus</p>
            <p
              className={`font-mono-tabular text-2xl font-bold mt-1 ${
                netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatNgn(netProfit)}
            </p>
            <p className="text-xs text-slate-500 mt-1">EBITDA proxy (current period)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-500">VAT Collected (7.5%)</p>
            <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
              {formatNgn(totalVat)}
            </p>
            <p className="text-xs text-slate-500 mt-1">FIRS remittance accrual</p>
          </div>
        </div>
      )}

      {/* Post Ledger Entry Form */}
      {showLedgerForm && (section === 'accounting' || section === 'reports') && (
        <form
          onSubmit={handleAddLedger}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-sm font-bold text-slate-900">
            Post Manual Accounting Entry
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as 'revenue' | 'expense')}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="expense">Expense</option>
              <option value="revenue">Revenue</option>
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as LedgerEntryRecord['category'])}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="Utilities & Diesel">Utilities &amp; Diesel</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Procurement">Procurement</option>
              <option value="OTA Commission">OTA Commission</option>
              <option value="Room Accommodation">Room Accommodation</option>
              <option value="Restaurant & Bar">Restaurant &amp; Bar</option>
              <option value="Other">Other</option>
            </select>
            <input
              required
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="lg:col-span-2 border border-slate-200 rounded-lg px-3 py-2"
            />
            <input
              required
              type="number"
              min={100}
              value={amountNgn}
              onChange={(e) => setAmountNgn(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
            />
          </div>
          <div className="flex items-center justify-between">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash NGN">Cash NGN</option>
              <option value="Card POS">Card POS</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
            >
              Save Journal Entry
            </button>
          </div>
        </form>
      )}

      {/* Accounting Ledger Table */}
      {(section === 'accounting' || section === 'reports') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4 text-right">VAT (₦)</th>
                  <th className="py-3 px-4 text-right">Amount (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-tabular text-slate-600">
                      {entry.entryDate}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-800">
                      {entry.reference || '—'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{entry.category}</td>
                    <td className="py-3 px-4 text-slate-700">{entry.description}</td>
                    <td className="py-3 px-4 text-slate-600">{entry.paymentMethod}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-500">
                      {formatNgn(entry.vatNgn)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-tabular font-semibold ${
                        entry.entryType === 'revenue' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {entry.entryType === 'revenue' ? '+' : '-'}
                      {formatNgn(entry.amountNgn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INVENTORY VIEW */}
      {section === 'inventory' && (
        <>
          {showInvForm && (
            <form
              onSubmit={handleAddInventory}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <h2 className="font-display text-sm font-bold text-slate-900">
                Add Store Inventory SKU
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  required
                  type="text"
                  placeholder="SKU (e.g. KIT-OIL-25)"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  required
                  type="text"
                  placeholder="Item Name"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <select
                  value={invCategory}
                  onChange={(e) =>
                    setInvCategory(e.target.value as InventoryItemRecord['category'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Kitchen & Pantry">Kitchen &amp; Pantry</option>
                  <option value="Bar & Beverage">Bar &amp; Beverage</option>
                  <option value="Housekeeping Linen & Amenities">
                    Housekeeping Linen &amp; Amenities
                  </option>
                  <option value="Engineering & Diesel">Engineering &amp; Diesel</option>
                </select>
                <input
                  type="text"
                  placeholder="Unit (Bags, Bottles, Litres)"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Initial Qty"
                  value={qtyOnHand}
                  onChange={(e) => setQtyOnHand(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Reorder Level"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Unit Cost (₦)"
                  value={unitCostNgn}
                  onChange={(e) => setUnitCostNgn(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  type="text"
                  placeholder="Preferred Supplier"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Save SKU
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Stock Levels &amp; Valuation
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Item &amp; Category</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">On Hand</th>
                    <th className="py-3 px-4 text-right">Stock Value</th>
                    <th className="py-3 px-4">Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {inventoryItems.map((item) => {
                    const isLow = item.quantityOnHand <= item.reorderLevel;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                          {item.sku}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-[11px] text-slate-500">{item.category}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{item.supplierName}</td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          {formatNgn(item.unitCostNgn)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          <span className={isLow ? 'font-bold text-red-700' : 'text-slate-900'}>
                            {item.quantityOnHand} {item.unit}
                          </span>
                          {isLow && (
                            <span className="block text-[10px] text-red-600 font-semibold">
                              Low (Min {item.reorderLevel})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                          {formatNgn(item.quantityOnHand * item.unitCostNgn)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                adjustInventoryQty({
                                  property,
                                  item,
                                  newQty: item.quantityOnHand - 1,
                                })
                              }
                              className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-100 font-mono-tabular"
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                adjustInventoryQty({
                                  property,
                                  item,
                                  newQty: item.quantityOnHand + 1,
                                })
                              }
                              className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-100 font-mono-tabular"
                            >
                              +1
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PROCUREMENT VIEW */}
      {section === 'procurement' && (
        <>
          {showPoForm && (
            <form
              onSubmit={handleCreatePo}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs"
            >
              <h2 className="font-display text-sm font-bold text-slate-900">
                Issue New Purchase Order
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <select
                  value={poItemId}
                  onChange={(e) => {
                    const inv = inventoryItems.find((i) => i.id === e.target.value);
                    setPoItemId(e.target.value);
                    if (inv) {
                      setPoSupplier(inv.supplierName);
                      setPoUnitCost(inv.unitCostNgn);
                    }
                  }}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  {inventoryItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Supplier Name"
                  value={poSupplier}
                  onChange={(e) => setPoSupplier(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={poQty}
                  onChange={(e) => setPoQty(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Unit Cost (₦)"
                  value={poUnitCost}
                  onChange={(e) => setPoUnitCost(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
                <input
                  type="date"
                  value={poExpectedDate}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Approve &amp; Issue PO
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Supplier Purchase Orders
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Item &amp; Qty</th>
                    <th className="py-3 px-4">Expected</th>
                    <th className="py-3 px-4 text-right">Total Cost</th>
                    <th className="py-3 px-4">Status &amp; Receiving</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {purchaseOrders.map((po) => {
                    const linkedInv = inventoryItems.find((i) => i.id === po.itemId);
                    return (
                      <tr key={po.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                          {po.poNumber}
                        </td>
                        <td className="py-3 px-4 text-slate-800">{po.supplierName}</td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-900">{po.itemName}</span>
                          <span className="text-slate-500"> × {po.quantity}</span>
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600">
                          {po.expectedDate}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                          {formatNgn(po.totalCostNgn)}
                        </td>
                        <td className="py-3 px-4">
                          {po.status !== 'received' && po.status !== 'cancelled' ? (
                            <button
                              type="button"
                              onClick={() => {
                                receivePurchaseOrderWorkflow({
                                  property,
                                  po,
                                  linkedItem: linkedInv,
                                  actorRole,
                                });
                                onNotify(`Received ${po.poNumber} into Store & Posted Expense`);
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium whitespace-nowrap"
                            >
                              Receive Stock &amp; Post Ledger
                            </button>
                          ) : (
                            <span className="font-medium text-emerald-700 capitalize">
                              {po.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
