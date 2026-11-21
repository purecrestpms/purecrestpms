import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  adjustInventoryQty,
  createInventoryItem,
  createLedgerEntry,
  createPurchaseOrder,
  deleteInventoryItemWorkflow,
  deleteLedgerEntryWorkflow,
  receivePurchaseOrderWorkflow,
  updateInventoryItemWorkflow,
  updateLedgerEntryWorkflow,
} from '../services/pmsService';
import {
  formatBookingSourceLabel,
  formatChannelCurrency,
  formatNgn,
  formatPaymentCollectionLabel,
  getReservationBookedDate,
  getReservationPaymentSummary,
  getReservationRoomDisplay,
  InventoryItemRecord,
  isOtaBookingChannel,
  LedgerEntryRecord,
  NavSectionId,
  PropertyRecord,
  PurchaseOrderRecord,
  ReservationRecord,
  RICHGATES_PROPERTY_INFO,
  RoomRecord,
  StaffRole,
} from '../types/pms';
import { useCms } from '../context/CmsContext';
import { ReservationPaymentModal } from './ReservationPaymentModal';
import { PurchaseInvoiceData, PurchaseInvoiceModal } from './PurchaseInvoiceModal';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { FeedbackBanner } from './FeedbackBanner';

function formatPdfNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-US')}`;
}

interface FinanceInventoryViewProps {
  section: Extract<NavSectionId, 'accounting' | 'reports' | 'inventory' | 'procurement'>;
  property: PropertyRecord;
  activeRole?: StaffRole;
  ledgerEntries: LedgerEntryRecord[];
  reservations?: ReservationRecord[];
  rooms?: RoomRecord[];
  inventoryItems: InventoryItemRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  canManageRecords?: boolean;
  actorRole: string;
  onNavigate?: (section: NavSectionId) => void;
  onOpenReservationFolio?: (
    reservationId: string,
    targetSection?: 'reservations' | 'front_desk',
    intent?: 'view' | 'edit'
  ) => void;
  onNotify: (msg: string) => void;
}

export const FinanceInventoryView: React.FC<FinanceInventoryViewProps> = ({
  section,
  property,
  activeRole,
  ledgerEntries,
  reservations = [],
  rooms = [],
  inventoryItems,
  purchaseOrders,
  canManageRecords = false,
  actorRole,
  onNavigate,
  onOpenReservationFolio,
  onNotify,
}) => {
  const { cms } = useCms();
  const isAdmin =
    activeRole === 'pch_admin' ||
    activeRole === 'property_admin' ||
    (!activeRole && canManageRecords);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);
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

  // Edit & Delete Ledger State
  const [editingLedger, setEditingLedger] = useState<LedgerEntryRecord | null>(null);
  const [editLEntryDate, setEditLEntryDate] = useState('');
  const [editLType, setEditLType] = useState<'revenue' | 'expense'>('expense');
  const [editLCat, setEditLCat] = useState<LedgerEntryRecord['category']>('Other');
  const [editLDesc, setEditLDesc] = useState('');
  const [editLAmount, setEditLAmount] = useState(0);
  const [editLVat, setEditLVat] = useState(0);
  const [editLMethod, setEditLMethod] = useState('Bank Transfer');
  const [confirmDeleteLedgerId, setConfirmDeleteLedgerId] = useState<string | null>(null);

  // Edit & Delete Inventory State
  const [editingInv, setEditingInv] = useState<InventoryItemRecord | null>(null);
  const [editISku, setEditISku] = useState('');
  const [editIName, setEditIName] = useState('');
  const [editICat, setEditICat] = useState<InventoryItemRecord['category']>('Kitchen & Pantry');
  const [editIUnit, setEditIUnit] = useState('Units');
  const [editIQty, setEditIQty] = useState(0);
  const [editIReorder, setEditIReorder] = useState(0);
  const [editICost, setEditICost] = useState(0);
  const [editISupplier, setEditISupplier] = useState('');
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<string | null>(null);

  // Payments Transactions Tab & Filter State
  const [paymentsTab, setPaymentsTab] = useState<'transactions' | 'ledger'>('transactions');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<
    'all' | 'ota_prepaid' | 'received' | 'outstanding'
  >('all');
  const [paymentModalResId, setPaymentModalResId] = useState<string | null>(null);

  useEffect(() => {
    if (!poItemId && inventoryItems[0]) {
      setPoItemId(inventoryItems[0].id);
      setPoSupplier(inventoryItems[0].supplierName);
      setPoUnitCost(inventoryItems[0].unitCostNgn);
    }
  }, [inventoryItems, poItemId]);

  const paymentRecords = useMemo(() => {
    return reservations
      .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
      .map((res) => {
        const pay = getReservationPaymentSummary(res, property.usdExchangeRateNgn);
        const roomDisp = getReservationRoomDisplay(res, rooms);
        const isOta = isOtaBookingChannel(res.channel);
        const isCollectedByOta = pay.paymentCollectionMode === 'ota_prepaid';
        const channelLabel = formatBookingSourceLabel(res.channel);
        const collectionModeLabel = formatPaymentCollectionLabel(pay.paymentCollectionMode);
        const paymentDate = getReservationBookedDate(res) || res.checkInDate;
        const paymentMethodLabel =
          res.paymentMethod ||
          (isCollectedByOta ? 'OTA Platform Payout' : 'Collect at Property');

        let otaPayoutStatusLabel:
          | 'OTA Payout Received'
          | 'Pending OTA Payout'
          | 'Collect at Property'
          | 'Direct Settled'
          | 'Balance Due';
        if (isCollectedByOta) {
          otaPayoutStatusLabel =
            pay.otaPayoutStatus === 'received' ? 'OTA Payout Received' : 'Pending OTA Payout';
        } else {
          otaPayoutStatusLabel =
            pay.amountDueAtPropertyNgn <= 0
              ? 'Direct Settled'
              : isOta
                ? 'Collect at Property'
                : 'Balance Due';
        }

        return {
          res,
          pay,
          roomLabel: roomDisp.isAssigned ? roomDisp.roomNumberLabel : 'Unassigned',
          isOta,
          isCollectedByOta,
          channelLabel,
          collectionModeLabel,
          paymentDate,
          paymentMethodLabel,
          otaPayoutStatus: otaPayoutStatusLabel,
        };
      })
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [reservations, rooms, property.usdExchangeRateNgn]);

  const filteredPaymentRecords = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    return paymentRecords.filter((item) => {
      if (paymentFilter === 'ota_prepaid' && !item.isCollectedByOta) {
        return false;
      }
      if (paymentFilter === 'received' && item.pay.totalReceivedByHotelNgn <= 0) {
        return false;
      }
      if (paymentFilter === 'outstanding' && item.pay.amountDueAtPropertyNgn <= 0) {
        return false;
      }
      if (!q) return true;
      return (
        item.res.guestName.toLowerCase().includes(q) ||
        item.res.bookingRef.toLowerCase().includes(q) ||
        item.roomLabel.toLowerCase().includes(q) ||
        item.channelLabel.toLowerCase().includes(q) ||
        item.collectionModeLabel.toLowerCase().includes(q) ||
        item.paymentMethodLabel.toLowerCase().includes(q) ||
        item.otaPayoutStatus.toLowerCase().includes(q) ||
        item.pay.paymentStatus.toLowerCase().includes(q)
      );
    });
  }, [paymentRecords, paymentFilter, paymentSearch]);

  const paymentSummaryTotals = useMemo(() => {
    return paymentRecords.reduce(
      (acc, item) => {
        if (item.isCollectedByOta) {
          acc.otaPrepaid +=
            item.pay.otaPaidAmount > 0 ? item.pay.otaPaidAmount : item.pay.expectedPayoutNgn;
          acc.otaExpectedPayout += item.pay.expectedPayoutNgn;
        }
        acc.received += item.pay.totalReceivedByHotelNgn;
        acc.outstanding += item.pay.amountDueAtPropertyNgn;
        return acc;
      },
      { otaPrepaid: 0, otaExpectedPayout: 0, received: 0, outstanding: 0 }
    );
  }, [paymentRecords]);

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

  const [invoiceModal, setInvoiceModal] = useState<PurchaseInvoiceData | null>(null);

  const handleAddLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 2) {
      setActionError('Description must be at least 2 characters.');
      return;
    }
    setActionError(null);
    const entryDate = new Date().toISOString().slice(0, 10);
    const reference = `MAN-${Math.floor(100 + Math.random() * 899)}`;
    const cleanAmt = Math.max(0, amountNgn);
    const vatAmt = entryType === 'revenue' ? Math.round(cleanAmt * 0.075) : 0;
    const cleanDesc = description.trim();
    try {
      await createLedgerEntry({
        property,
        entry: {
          entryDate,
          entryType,
          category,
          reference,
          description: cleanDesc,
          amountNgn: cleanAmt,
          vatNgn: vatAmt,
          paymentMethod,
        },
        actorRole,
      });
      onNotify(`Posted ${entryType} entry (${formatNgn(cleanAmt)})`);
      setShowLedgerForm(false);
      setDescription('');
      setInvoiceModal({
        invoiceNumber: reference,
        date: entryDate,
        title: entryType === 'expense' ? 'Purchase / Expense Invoice' : 'Transaction Receipt',
        subtitle: 'Transaction saved — view, print, or download PDF invoice',
        partyLabel: entryType === 'expense' ? 'Payee / Expense' : 'Payer / Revenue Source',
        partyName: cleanDesc,
        category,
        paymentMethod,
        status: 'Posted',
        items: [
          {
            description: cleanDesc,
            quantity: 1,
            unitCostNgn: cleanAmt,
            totalNgn: cleanAmt,
          },
        ],
        subtotalNgn: cleanAmt,
        vatNgn: vatAmt,
        totalNgn: cleanAmt,
      });
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to post ledger entry. Please try again.', 'Finance:CreateLedger')
      );
    }
  };

  const openEditLedgerModal = (entry: LedgerEntryRecord) => {
    setActionError(null);
    setEditingLedger(entry);
    setEditLEntryDate(entry.entryDate);
    setEditLType(entry.entryType);
    setEditLCat(entry.category);
    setEditLDesc(entry.description);
    setEditLAmount(entry.amountNgn);
    setEditLVat(entry.vatNgn);
    setEditLMethod(entry.paymentMethod);
  };

  const handleSaveLedgerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLedger) return;
    if (editLDesc.trim().length < 2) {
      setActionError('Ledger description must be at least 2 characters.');
      return;
    }
    setActionError(null);
    setBusyRecordId(editingLedger.id);
    try {
      await updateLedgerEntryWorkflow({
        property,
        entry: editingLedger,
        updates: {
          entryDate: editLEntryDate,
          entryType: editLType,
          category: editLCat,
          description: editLDesc.trim(),
          amountNgn: Math.max(0, editLAmount),
          vatNgn: Math.max(0, editLVat),
          paymentMethod: editLMethod,
        },
        actorRole,
      });
      onNotify(`Updated ledger entry ${editingLedger.reference || editingLedger.description}`);
      setEditingLedger(null);
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to update ledger entry. Please try again.', 'Finance:UpdateLedger')
      );
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleDeleteLedger = async (entry: LedgerEntryRecord) => {
    setActionError(null);
    setBusyRecordId(entry.id);
    try {
      await deleteLedgerEntryWorkflow({ property, entry, actorRole });
      onNotify(`Deleted ledger entry ${entry.reference || entry.description}`);
      setConfirmDeleteLedgerId(null);
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to delete ledger entry. Please try again.', 'Finance:DeleteLedger')
      );
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !itemName.trim()) return;
    setActionError(null);
    try {
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
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to add inventory item. Please try again.', 'Inventory:CreateItem')
      );
    }
  };

  const openEditInvModal = (item: InventoryItemRecord) => {
    setActionError(null);
    setEditingInv(item);
    setEditISku(item.sku);
    setEditIName(item.name);
    setEditICat(item.category);
    setEditIUnit(item.unit);
    setEditIQty(item.quantityOnHand);
    setEditIReorder(item.reorderLevel);
    setEditICost(item.unitCostNgn);
    setEditISupplier(item.supplierName);
  };

  const handleSaveInvEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInv) return;
    if (editISku.trim().length < 2 || editIName.trim().length < 2) {
      setActionError('SKU and item name must be at least 2 characters.');
      return;
    }
    setActionError(null);
    setBusyRecordId(editingInv.id);
    try {
      await updateInventoryItemWorkflow({
        property,
        item: editingInv,
        updates: {
          sku: editISku.trim().toUpperCase(),
          name: editIName.trim(),
          category: editICat,
          unit: editIUnit.trim() || 'Units',
          quantityOnHand: Math.max(0, editIQty),
          reorderLevel: Math.max(0, editIReorder),
          unitCostNgn: Math.max(0, editICost),
          supplierName: editISupplier.trim() || 'Local Vendor',
        },
        actorRole,
      });
      onNotify(`Updated inventory SKU ${editISku.trim().toUpperCase()}`);
      setEditingInv(null);
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to update inventory item. Please try again.', 'Inventory:UpdateItem')
      );
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleDeleteInv = async (item: InventoryItemRecord) => {
    setActionError(null);
    setBusyRecordId(item.id);
    try {
      await deleteInventoryItemWorkflow({ property, item, actorRole });
      onNotify(`Deleted inventory SKU ${item.sku} (${item.name})`);
      setConfirmDeleteInvId(null);
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to delete inventory item. Please try again.', 'Inventory:DeleteItem')
      );
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const linked = inventoryItems.find((i) => i.id === poItemId);
    const name = linked ? linked.name : 'General Supplies';
    const sup = poSupplier.trim() || linked?.supplierName || 'Ogbete Wholesale Ltd';
    const qty = Math.max(1, poQty);
    const unitCost = Math.max(0, poUnitCost || linked?.unitCostNgn || 10000);
    try {
      const createdPo = await createPurchaseOrder({
        property,
        supplierName: sup,
        item: linked,
        itemName: name,
        quantity: qty,
        unitCostNgn: unitCost,
        expectedDate: poExpectedDate,
        actorRole,
      });
      onNotify(`Issued Purchase Order for ${name}`);
      setShowPoForm(false);
      if (createdPo) {
        setInvoiceModal({
          invoiceNumber: createdPo.poNumber,
          date: new Date().toISOString().slice(0, 10),
          title: 'Purchase Order Invoice',
          subtitle: 'Purchase order issued — print or save PDF immediately',
          partyLabel: 'Supplier',
          partyName: createdPo.supplierName,
          category: 'Procurement',
          paymentMethod: 'Supplier Account / Bank Transfer',
          status: 'Approved',
          items: [
            {
              description: createdPo.itemName,
              quantity: createdPo.quantity,
              unitCostNgn: createdPo.unitCostNgn,
              totalNgn: createdPo.totalCostNgn,
            },
          ],
          subtotalNgn: createdPo.totalCostNgn,
          vatNgn: 0,
          totalNgn: createdPo.totalCostNgn,
          notes: `Expected delivery date: ${createdPo.expectedDate}`,
        });
      }
    } catch (err) {
      setActionError(
        getUserFriendlyErrorMessage(err, 'Unable to issue purchase order. Please try again.', 'Procurement:CreatePO')
      );
    }
  };

  if (!isAdmin && (section === 'accounting' || section === 'reports')) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-slate-900">
          Administrator Authorization Required
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Financial Accounting Ledgers, P&amp;L statements, and Revenue Reports are restricted to Property Administrators only. Employees can view and print their operational Shift Daily Report.
        </p>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('shift_daily_report')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#061539] hover:bg-[#0c2b70] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Open My Shift Daily Report</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FeedbackBanner
        message={actionError}
        onDismiss={() => setActionError(null)}
        className="no-print"
      />
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

      {/* Payments Segmented View Switcher (Accounting / Payments page) */}
      {section === 'accounting' && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => setPaymentsTab('transactions')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                paymentsTab === 'transactions'
                  ? 'bg-white text-[#061539] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Payment Transactions
              <span className="ml-1.5 font-mono-tabular text-[11px] text-slate-400">
                {paymentRecords.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentsTab('ledger')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                paymentsTab === 'ledger'
                  ? 'bg-white text-[#061539] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              General Ledger &amp; P&amp;L
              <span className="ml-1.5 font-mono-tabular text-[11px] text-slate-400">
                {ledgerEntries.length}
              </span>
            </button>
          </div>
          {paymentsTab === 'transactions' && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tabular">
              <span className="text-slate-500 font-sans">
                OTA Prepayments:{' '}
                <strong className="font-mono-tabular text-blue-700">
                  {formatNgn(paymentSummaryTotals.otaPrepaid)}
                </strong>
              </span>
              <span className="text-slate-500 font-sans">
                Received:{' '}
                <strong className="font-mono-tabular text-emerald-700">
                  {formatNgn(paymentSummaryTotals.received)}
                </strong>
              </span>
              <span className="text-slate-500 font-sans">
                Outstanding:{' '}
                <strong
                  className={`font-mono-tabular ${
                    paymentSummaryTotals.outstanding > 0 ? 'text-rose-700' : 'text-slate-700'
                  }`}
                >
                  {formatNgn(paymentSummaryTotals.outstanding)}
                </strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* DETAILED PAYMENT TRANSACTIONS TABLE */}
      {section === 'accounting' && paymentsTab === 'transactions' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search guest, booking ref, room, channel, or method..."
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#061539]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: 'All Transactions' },
                  { id: 'ota_prepaid', label: 'OTA Prepayments' },
                  { id: 'received', label: 'Payments Received' },
                  { id: 'outstanding', label: 'Outstanding' },
                ] as const
              ).map((flt) => {
                const active = paymentFilter === flt.id;
                return (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => setPaymentFilter(flt.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#061539] text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {flt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredPaymentRecords.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No payment transaction records match your current search or filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[920px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th className="py-3 px-4">Guest &amp; Reservation Ref</th>
                    <th className="py-3 px-4">Channel &amp; Collection Type</th>
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4 text-right">Hotel Received</th>
                    <th className="py-3 px-4">Guest Status &amp; OTA Payout</th>
                    <th className="py-3 px-4 text-right">Due at Property</th>
                    {(isAdmin || onOpenReservationFolio) && (
                      <th className="no-print py-3 px-4 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPaymentRecords.map((item) => {
                    const { res, pay } = item;
                    const showSourceCur =
                      pay.sourceCurrency !== 'NGN' && pay.otaPaidSourceAmount > 0;
                    const payoutTextClass =
                      item.otaPayoutStatus === 'OTA Payout Received' ||
                      item.otaPayoutStatus === 'Direct Settled'
                        ? 'text-emerald-700'
                        : item.otaPayoutStatus === 'Pending OTA Payout'
                          ? 'text-amber-700'
                          : item.otaPayoutStatus === 'Collect at Property'
                            ? 'text-slate-700'
                            : 'text-rose-700';

                    return (
                      <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{res.guestName}</div>
                          <div className="font-mono-tabular text-[11px] text-slate-500">
                            {res.bookingRef} · {item.roomLabel}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{item.channelLabel}</div>
                          <div className="text-[11px] font-medium text-blue-700">
                            {item.collectionModeLabel}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {item.paymentMethodLabel}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                          <div>{item.paymentDate}</div>
                          <div className="text-[10px] text-slate-400">
                            Stay {res.checkInDate} → {res.checkOutDate}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {formatNgn(pay.totalReceivedByHotelNgn)}
                          </div>
                          {item.isCollectedByOta ? (
                            <div className="text-[10px] text-blue-700">
                              Paid to OTA:{' '}
                              {showSourceCur
                                ? `${formatChannelCurrency(pay.otaPaidSourceAmount, pay.sourceCurrency)} ${pay.sourceCurrency}`
                                : formatNgn(pay.otaPaidAmount || pay.expectedPayoutNgn)}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500">
                              Total folio {formatNgn(pay.totalAmount)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {pay.paymentStatus}
                          </div>
                          <div className={`text-[11px] font-semibold mt-0.5 ${payoutTextClass}`}>
                            {item.otaPayoutStatus}
                          </div>
                          {item.isCollectedByOta && (
                            <div className="text-[10px] font-mono-tabular text-slate-500 mt-0.5">
                              Exp. {formatNgn(pay.expectedPayoutNgn)}
                              {pay.otaPayoutStatus === 'received'
                                ? ` · Recv. ${formatNgn(pay.actualPayoutReceivedNgn)}`
                                : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          {pay.amountDueAtPropertyNgn > 0 ? (
                            <span className="font-bold text-rose-700">
                              {formatNgn(pay.amountDueAtPropertyNgn)}
                            </span>
                          ) : (
                            <span className="font-semibold text-emerald-700">
                              ₦0 · {pay.paymentStatus === 'Paid to OTA' ? 'Paid to OTA' : 'Settled'}
                            </span>
                          )}
                        </td>
                        {(isAdmin || onOpenReservationFolio) && (
                          <td className="no-print py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentModalResId(res.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <CreditCard className="w-3 h-3" />
                                  <span>Manage Payment</span>
                                </button>
                              )}
                              {onOpenReservationFolio && (
                                <button
                                  type="button"
                                  onClick={() => onOpenReservationFolio(res.id, 'reservations')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <span>Folio</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* P&L Summary Strip for Ledger & Reports */}
      {(section === 'reports' || (section === 'accounting' && paymentsTab === 'ledger')) && (
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
      {(section === 'reports' || (section === 'accounting' && paymentsTab === 'ledger')) && (
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
                  {canManageRecords && (
                    <th className="no-print py-3 px-4 text-right">Actions</th>
                  )}
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
                    {canManageRecords && (
                      <td className="no-print py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setInvoiceModal({
                                invoiceNumber: entry.reference || entry.id,
                                date: entry.entryDate,
                                title:
                                  entry.entryType === 'expense'
                                    ? 'Purchase / Expense Invoice'
                                    : 'Transaction Receipt',
                                subtitle: 'Financial ledger transaction invoice',
                                partyLabel: entry.entryType === 'expense' ? 'Payee / Expense' : 'Source',
                                partyName: entry.description,
                                category: entry.category,
                                paymentMethod: entry.paymentMethod,
                                status: 'Recorded',
                                items: [
                                  {
                                    description: entry.description,
                                    quantity: 1,
                                    unitCostNgn: entry.amountNgn,
                                    totalNgn: entry.amountNgn,
                                  },
                                ],
                                subtotalNgn: entry.amountNgn,
                                vatNgn: entry.vatNgn || 0,
                                totalNgn: entry.amountNgn,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Invoice</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditLedgerModal(entry)}
                            className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          {confirmDeleteLedgerId !== entry.id ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLedgerId(entry.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteLedgerId(null)}
                                className="text-[10px] text-slate-600 px-1 cursor-pointer"
                              >
                                No
                              </button>
                              <button
                                type="button"
                                disabled={busyRecordId === entry.id}
                                onClick={() => void handleDeleteLedger(entry)}
                                className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                              >
                                {busyRecordId === entry.id ? '...' : 'Del'}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
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
                    {canManageRecords && (
                      <th className="py-3 px-4 text-right">Actions</th>
                    )}
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
                              onClick={async () => {
                                setActionError(null);
                                try {
                                  await adjustInventoryQty({
                                    property,
                                    item,
                                    newQty: item.quantityOnHand - 1,
                                  });
                                } catch (err) {
                                  setActionError(
                                    getUserFriendlyErrorMessage(
                                      err,
                                      'Unable to adjust stock quantity. Please try again.',
                                      'Inventory:AdjustQty'
                                    )
                                  );
                                }
                              }}
                              className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-100 font-mono-tabular cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError(null);
                                try {
                                  await adjustInventoryQty({
                                    property,
                                    item,
                                    newQty: item.quantityOnHand + 1,
                                  });
                                } catch (err) {
                                  setActionError(
                                    getUserFriendlyErrorMessage(
                                      err,
                                      'Unable to adjust stock quantity. Please try again.',
                                      'Inventory:AdjustQty'
                                    )
                                  );
                                }
                              }}
                              className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-100 font-mono-tabular cursor-pointer"
                            >
                              +1
                            </button>
                          </div>
                        </td>
                        {canManageRecords && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditInvModal(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              {confirmDeleteInvId !== item.id ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteInvId(item.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              ) : (
                                <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteInvId(null)}
                                    className="text-[10px] text-slate-600 px-1 cursor-pointer"
                                  >
                                    No
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyRecordId === item.id}
                                    onClick={() => void handleDeleteInv(item)}
                                    className="text-[10px] font-semibold bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                                  >
                                    {busyRecordId === item.id ? '...' : 'Del'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
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
                          <div className="flex flex-wrap items-center gap-2">
                            {po.status !== 'received' && po.status !== 'cancelled' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setActionError(null);
                                  try {
                                    await receivePurchaseOrderWorkflow({
                                      property,
                                      po,
                                      linkedItem: linkedInv,
                                      actorRole,
                                    });
                                    onNotify(`Received ${po.poNumber} into Store & Posted Expense`);
                                    setInvoiceModal({
                                      invoiceNumber: po.poNumber,
                                      date: new Date().toISOString().slice(0, 10),
                                      title: 'Purchase Receipt Invoice',
                                      subtitle: 'Stock received & expense posted to ledger',
                                      partyLabel: 'Supplier',
                                      partyName: po.supplierName,
                                      category: 'Procurement',
                                      paymentMethod: 'Bank Transfer / Supplier Account',
                                      status: 'Received & Paid',
                                      items: [
                                        {
                                          description: po.itemName,
                                          quantity: po.quantity,
                                          unitCostNgn: po.unitCostNgn,
                                          totalNgn: po.totalCostNgn,
                                        },
                                      ],
                                      subtotalNgn: po.totalCostNgn,
                                      vatNgn: 0,
                                      totalNgn: po.totalCostNgn,
                                    });
                                  } catch (err) {
                                    setActionError(
                                      getUserFriendlyErrorMessage(
                                        err,
                                        'Unable to receive purchase order. Please try again.',
                                        'Procurement:ReceivePO'
                                      )
                                    );
                                  }
                                }}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium whitespace-nowrap cursor-pointer"
                              >
                                Receive Stock &amp; Post Ledger
                              </button>
                            ) : (
                              <span className="font-medium text-emerald-700 capitalize">
                                {po.status}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setInvoiceModal({
                                  invoiceNumber: po.poNumber,
                                  date: po.expectedDate || new Date().toISOString().slice(0, 10),
                                  title:
                                    po.status === 'received'
                                      ? 'Purchase Receipt Invoice'
                                      : 'Purchase Order Invoice',
                                  subtitle: `Supplier purchase invoice (${po.status})`,
                                  partyLabel: 'Supplier',
                                  partyName: po.supplierName,
                                  category: 'Procurement',
                                  paymentMethod: 'Supplier Account / Bank Transfer',
                                  status: po.status === 'received' ? 'Received & Paid' : po.status,
                                  items: [
                                    {
                                      description: po.itemName,
                                      quantity: po.quantity,
                                      unitCostNgn: po.unitCostNgn,
                                      totalNgn: po.totalCostNgn,
                                    },
                                  ],
                                  subtotalNgn: po.totalCostNgn,
                                  vatNgn: 0,
                                  totalNgn: po.totalCostNgn,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded font-medium whitespace-nowrap cursor-pointer"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print Invoice</span>
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

      {/* Edit Ledger Entry Modal */}
      {editingLedger && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveLedgerEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Edit Accounting Entry
                </h3>
                <p className="font-mono-tabular text-[11px] text-slate-500">
                  Ref: {editingLedger.reference || editingLedger.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLedger(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Entry Date *</label>
                <input
                  required
                  type="date"
                  value={editLEntryDate}
                  onChange={(e) => setEditLEntryDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Entry Type</label>
                <select
                  value={editLType}
                  onChange={(e) => setEditLType(e.target.value as 'revenue' | 'expense')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={editLCat}
                  onChange={(e) =>
                    setEditLCat(e.target.value as LedgerEntryRecord['category'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Room Accommodation">Room Accommodation</option>
                  <option value="Restaurant & Bar">Restaurant &amp; Bar</option>
                  <option value="Procurement">Procurement</option>
                  <option value="Payroll">Payroll</option>
                  <option value="Utilities & Diesel">Utilities &amp; Diesel</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="OTA Commission">OTA Commission</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={editLMethod}
                  onChange={(e) => setEditLMethod(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card POS">Card POS</option>
                  <option value="Cash NGN">Cash NGN</option>
                  <option value="Corporate Invoice">Corporate Invoice</option>
                  <option value="Online Gateway">Online Gateway</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Description *</label>
                <input
                  required
                  type="text"
                  minLength={2}
                  value={editLDesc}
                  onChange={(e) => setEditLDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Amount (₦)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editLAmount}
                  onChange={(e) => setEditLAmount(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">VAT (₦)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editLVat}
                  onChange={(e) => setEditLVat(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingLedger(null)}
                className="px-3.5 py-2 text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyRecordId === editingLedger.id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyRecordId === editingLedger.id ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Inventory SKU Modal */}
      {editingInv && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveInvEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Edit Inventory SKU — {editingInv.sku}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingInv(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">SKU Code *</label>
                <input
                  required
                  type="text"
                  minLength={2}
                  value={editISku}
                  onChange={(e) => setEditISku(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Item Name *</label>
                <input
                  required
                  type="text"
                  minLength={2}
                  value={editIName}
                  onChange={(e) => setEditIName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={editICat}
                  onChange={(e) =>
                    setEditICat(e.target.value as InventoryItemRecord['category'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Kitchen & Pantry">Kitchen &amp; Pantry</option>
                  <option value="Bar & Beverage">Bar &amp; Beverage</option>
                  <option value="Housekeeping Linen & Amenities">
                    Housekeeping Linen &amp; Amenities
                  </option>
                  <option value="Engineering & Diesel">Engineering &amp; Diesel</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Unit</label>
                <input
                  type="text"
                  value={editIUnit}
                  onChange={(e) => setEditIUnit(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Quantity On Hand</label>
                <input
                  type="number"
                  min={0}
                  value={editIQty}
                  onChange={(e) => setEditIQty(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reorder Level</label>
                <input
                  type="number"
                  min={0}
                  value={editIReorder}
                  onChange={(e) => setEditIReorder(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Unit Cost (₦)</label>
                <input
                  type="number"
                  min={0}
                  value={editICost}
                  onChange={(e) => setEditICost(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Supplier</label>
                <input
                  type="text"
                  value={editISupplier}
                  onChange={(e) => setEditISupplier(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingInv(null)}
                className="px-3.5 py-2 text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyRecordId === editingInv.id}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {busyRecordId === editingInv.id ? 'Saving...' : 'Save SKU Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {paymentModalResId &&
        (() => {
          const targetRes = reservations.find((r) => r.id === paymentModalResId);
          if (!targetRes) return null;
          return (
            <ReservationPaymentModal
              property={property}
              reservation={targetRes}
              actorRole={actorRole}
              onClose={() => setPaymentModalResId(null)}
              onNotify={onNotify}
            />
          );
        })()}

      {invoiceModal && (
        <PurchaseInvoiceModal
          property={property}
          invoice={invoiceModal}
          onClose={() => setInvoiceModal(null)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
