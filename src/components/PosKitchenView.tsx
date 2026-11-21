import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Banknote,
  BedDouble,
  Building2,
  Check,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Download,
  FileText,
  LayoutDashboard,
  Minus,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  advanceKitchenOrder,
  createPosMenuItemWorkflow,
  deletePosMenuItemWorkflow,
  recordPosPurchaseWorkflow,
  seedStandardPosMenuWorkflow,
  submitPosOrderWorkflow,
  updatePosMenuItemWorkflow,
  updatePosOrderWorkflow,
  updatePropertyPosSettingsWorkflow,
} from '../services/pmsService';
import {
  formatNgn,
  inferPosItemSection,
  InventoryItemRecord,
  LedgerEntryRecord,
  POS_DEFAULT_CATEGORIES,
  POS_SECTIONS,
  PosMenuItemRecord,
  PosOrderRecord,
  PosSection,
  PropertyRecord,
  ReservationRecord,
} from '../types/pms';
import { useCms } from '../context/CmsContext';
import { PurchaseInvoiceData, PurchaseInvoiceModal } from './PurchaseInvoiceModal';

interface PosKitchenViewProps {
  property: PropertyRecord;
  posOrders: PosOrderRecord[];
  posMenuItems: PosMenuItemRecord[];
  inventoryItems: InventoryItemRecord[];
  ledgerEntries: LedgerEntryRecord[];
  reservations: ReservationRecord[];
  canManageMenu: boolean;
  actorRole: string;
  onNotify: (msg: string) => void;
}

interface CartLine {
  id: string;
  name: string;
  priceNgn: number;
  qty: number;
}

interface PrintableOrderItem {
  name: string;
  qty: number;
  unitPriceNgn: number;
  lineTotalNgn: number;
}

interface PrintablePosDocument {
  orderNumber: string;
  orderDate: string;
  serviceType: PosOrderRecord['serviceType'];
  tableOrRoom: string;
  guestName: string;
  itemsSummary: string;
  itemCount: number;
  lineItems: PrintableOrderItem[];
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

function formatPdfNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-US')}`;
}

function formatPaymentMethodLabel(method: PosOrderRecord['paymentMethod']): string {
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
      return method;
  }
}

function parseSummaryToLineItems(
  itemsSummary: string,
  fallbackSubtotal: number
): PrintableOrderItem[] {
  const parts = (itemsSummary || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return [
      {
        name: 'POS Order',
        qty: 1,
        unitPriceNgn: fallbackSubtotal,
        lineTotalNgn: fallbackSubtotal,
      },
    ];
  }
  const parsed = parts.map((chunk) => {
    const match = chunk.match(/^(\d+)\s*x\s*(.+)$/i);
    const qty = match ? Math.max(1, Number(match[1])) : 1;
    const name = match ? match[2].trim() : chunk;
    return { name, qty };
  });
  const totalQty = parsed.reduce((sum, item) => sum + item.qty, 0) || 1;
  const approxUnit = Math.round(fallbackSubtotal / totalQty);
  return parsed.map((item, idx) => {
    const lineTotal =
      idx === parsed.length - 1
        ? Math.max(
            0,
            fallbackSubtotal -
              parsed.slice(0, -1).reduce((s, prev) => s + prev.qty * approxUnit, 0)
          )
        : item.qty * approxUnit;
    return {
      name: item.name,
      qty: item.qty,
      unitPriceNgn: Math.round(lineTotal / Math.max(1, item.qty)),
      lineTotalNgn: lineTotal,
    };
  });
}

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const PosKitchenView: React.FC<PosKitchenViewProps> = ({
  property,
  posOrders,
  posMenuItems,
  inventoryItems,
  ledgerEntries,
  reservations,
  canManageMenu,
  actorRole,
  onNotify,
}) => {
  const { cms } = useCms();
  const todayIso = getLocalTodayIso();

  // Property POS configurable rates & settings
  const serviceChargeRatePct =
    typeof property.posServiceChargeRate === 'number' ? property.posServiceChargeRate : 10;
  const taxRatePct = typeof property.posTaxRate === 'number' ? property.posTaxRate : 0;
  const receiptHeaderNote = (property.posReceiptHeader || '').trim();
  const receiptFooterNote =
    (property.posReceiptFooter || '').trim() ||
    cms.brand.folioFooterNote ||
    `Thank you for dining with ${property.name}.`;

  // Top-level POS tabs: POS Terminal | Orders & KDS | POS Dashboard
  const [posModuleTab, setPosModuleTab] = useState<'terminal' | 'orders' | 'dashboard'>('terminal');
  const [ordersSubTab, setOrdersSubTab] = useState<'kds' | 'purchases'>('kds');

  // Primary section tab (Kitchen vs Food & Beverage) + category filter + search
  const [activeSectionTab, setActiveSectionTab] = useState<PosSection>('Kitchen');
  const [categoryFilter, setCategoryFilter] = useState<string>('All Food');
  const [searchMenu, setSearchMenu] = useState('');

  // Current Sale Cart & Controls
  const [cart, setCart] = useState<CartLine[]>([]);
  const [chargeTarget, setChargeTarget] = useState<'walkin' | string>('walkin');
  const [serviceType, setServiceType] = useState<PosOrderRecord['serviceType']>('Dine-In');
  const [tableOrRoom, setTableOrRoom] = useState('Table 01');
  const [walkinGuestName, setWalkinGuestName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<PosOrderRecord['paymentMethod']>('Card POS');
  const [submitting, setSubmitting] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  // Quick Actions inline drawers (Apply Discount, Add Note, Custom Item)
  const [showDiscountEditor, setShowDiscountEditor] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [showCustomLine, setShowCustomLine] = useState(false);
  const [customLineName, setCustomLineName] = useState('');
  const [customLinePrice, setCustomLinePrice] = useState(2500);
  const [customLineQty, setCustomLineQty] = useState(1);

  // Last created order line items cache (for rich itemized receipt right after sale)
  const [orderLineCache, setOrderLineCache] = useState<Record<string, PrintableOrderItem[]>>({});

  // Print Receipt / Print Invoice modal state
  const [printDoc, setPrintDoc] = useState<PrintablePosDocument | null>(null);
  const [printFormat, setPrintFormat] = useState<'receipt' | 'invoice'>('receipt');
  const [purchaseInvoice, setPurchaseInvoice] = useState<PurchaseInvoiceData | null>(null);

  // Property Admin: Add / Edit Product Modal
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<PosMenuItemRecord | null>(null);
  const [menuName, setMenuName] = useState('');
  const [menuSection, setMenuSection] = useState<PosSection>('Kitchen');
  const [menuCategory, setMenuCategory] = useState<string>('Lunch');
  const [menuPrice, setMenuPrice] = useState(3000);
  const [menuCost, setMenuCost] = useState(1400);
  const [menuPrep, setMenuPrep] = useState(15);
  const [menuAvailable, setMenuAvailable] = useState(true);
  const [savingMenu, setSavingMenu] = useState(false);
  const [seedingMenu, setSeedingMenu] = useState(false);

  // Property Admin: Edit Order / Transaction Modal
  const [editingOrder, setEditingOrder] = useState<PosOrderRecord | null>(null);
  const [editOrdTableOrRoom, setEditOrdTableOrRoom] = useState('');
  const [editOrdGuestName, setEditOrdGuestName] = useState('');
  const [editOrdPaymentMethod, setEditOrdPaymentMethod] =
    useState<PosOrderRecord['paymentMethod']>('Card POS');
  const [editOrdPaymentStatus, setEditOrdPaymentStatus] =
    useState<PosOrderRecord['paymentStatus']>('paid');
  const [editOrdKitchenStatus, setEditOrdKitchenStatus] =
    useState<PosOrderRecord['kitchenStatus']>('queued');
  const [editOrdDiscountNgn, setEditOrdDiscountNgn] = useState(0);
  const [editOrdServiceChargeNgn, setEditOrdServiceChargeNgn] = useState(0);
  const [editOrdVatNgn, setEditOrdVatNgn] = useState(0);
  const [editOrdNotes, setEditOrdNotes] = useState('');
  const [savingOrderEdit, setSavingOrderEdit] = useState(false);

  // Property Admin: Property POS Settings Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [setServiceRate, setSetServiceRate] = useState(serviceChargeRatePct);
  const [setTaxRate, setSetTaxRate] = useState(taxRatePct);
  const [setReceiptHeader, setSetReceiptHeader] = useState(receiptHeaderNote);
  const [setReceiptFooter, setSetReceiptFooter] = useState(property.posReceiptFooter || '');
  const [setCustomCategoriesText, setSetCustomCategoriesText] = useState(
    (property.posCategories || []).join(', ')
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Record POS Purchase Expense Modal
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purItemDesc, setPurItemDesc] = useState('');
  const [purSupplier, setPurSupplier] = useState('');
  const [purCategory, setPurCategory] = useState<'Restaurant & Bar' | 'Procurement'>(
    'Restaurant & Bar'
  );
  const [purAmount, setPurAmount] = useState(15000);
  const [purMethod, setPurMethod] = useState('Cash NGN');
  const [purDate, setPurDate] = useState(todayIso);
  const [purInvId, setPurInvId] = useState('');
  const [purRestockQty, setPurRestockQty] = useState(0);
  const [savingPurchase, setSavingPurchase] = useState(false);

  // Cleanup print class after browser print completes
  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('pos-printing');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('pos-printing');
    };
  }, []);

  // In-house guests synced live from PMS reservations
  const inHouseGuests = useMemo(
    () =>
      reservations
        .filter((r) => r.status === 'checked_in')
        .sort((a, b) =>
          (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true })
        ),
    [reservations]
  );

  const selectedInHouseGuest = useMemo(
    () => (chargeTarget !== 'walkin' ? inHouseGuests.find((r) => r.id === chargeTarget) : undefined),
    [chargeTarget, inHouseGuests]
  );

  // Menu items sorted alphabetically
  const effectiveMenu: PosMenuItemRecord[] = useMemo(() => {
    return [...posMenuItems].sort((a, b) => a.name.localeCompare(b.name));
  }, [posMenuItems]);

  // All sub-categories for chips (matching PureCrest design + custom property categories)
  const categoryChips = useMemo(() => {
    const baseChips = ['All Food', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drinks'];
    const customFromSettings = (property.posCategories || []).filter(
      (c) => !baseChips.some((b) => b.toLowerCase() === c.toLowerCase())
    );
    const dynamicFromItems = Array.from(new Set(effectiveMenu.map((m) => m.category)))
      .filter(Boolean)
      .filter(
        (c) =>
          !baseChips.some((b) => b.toLowerCase() === c.toLowerCase()) &&
          !customFromSettings.some((s) => s.toLowerCase() === c.toLowerCase())
      );
    return [...baseChips, ...customFromSettings, ...dynamicFromItems];
  }, [effectiveMenu, property.posCategories]);

  // Available categories for Add/Edit Product dropdown
  const productCategoryOptions = useMemo(() => {
    const set = new Set<string>([
      ...POS_DEFAULT_CATEGORIES,
      ...(property.posCategories || []),
      ...effectiveMenu.map((m) => m.category).filter(Boolean),
    ]);
    return Array.from(set);
  }, [effectiveMenu, property.posCategories]);

  // Visible menu items filtered by section tab (Kitchen vs Food & Beverage), sub-category chip & search
  const visibleMenu = useMemo(() => {
    const q = searchMenu.trim().toLowerCase();
    return effectiveMenu.filter((m) => {
      if (!canManageMenu && m.available === false) return false;
      const itemSection = inferPosItemSection(m);
      if (activeSectionTab === 'Kitchen') {
        // Kitchen shows Kitchen items + Drinks when "Drinks" or "All Food" is selected so staff can build full orders seamlessly
        if (categoryFilter === 'Drinks') {
          if (m.category.toLowerCase() !== 'drinks' && m.category.toLowerCase() !== 'beverage') {
            return false;
          }
        } else if (categoryFilter !== 'All Food') {
          if (m.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
        }
      } else {
        // Food & Beverage tab focuses on Food & Beverage section items (or Drinks/Snacks/Beverage)
        if (categoryFilter !== 'All Food') {
          if (m.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
        } else if (itemSection !== 'Food & Beverage') {
          return false;
        }
      }
      if (q && !m.name.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [effectiveMenu, activeSectionTab, categoryFilter, searchMenu, canManageMenu]);

  // Cart totals with configurable Service Charge & Tax/VAT
  const subtotalNgn = useMemo(
    () => cart.reduce((sum, c) => sum + c.priceNgn * c.qty, 0),
    [cart]
  );
  const discountNgn = useMemo(() => {
    if (discountValue <= 0 || subtotalNgn <= 0) return 0;
    if (discountType === 'percent') {
      return Math.min(subtotalNgn, Math.round(subtotalNgn * (Math.min(100, discountValue) / 100)));
    }
    return Math.min(subtotalNgn, Math.round(discountValue));
  }, [discountType, discountValue, subtotalNgn]);
  const discountedSubtotalNgn = Math.max(0, subtotalNgn - discountNgn);
  const serviceChargeNgn = Math.round(discountedSubtotalNgn * (serviceChargeRatePct / 100));
  const vatNgn = Math.round(discountedSubtotalNgn * (taxRatePct / 100));
  const totalNgn = discountedSubtotalNgn + serviceChargeNgn + vatNgn;
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  // Preview order number for Current Sale header (matching #POS-YYYYMMDD-XXX)
  const previewOrderNumber = useMemo(() => {
    const compact = todayIso.replace(/-/g, '');
    const todayCount = posOrders.filter((o) => o.orderDate === todayIso).length + 1;
    return `POS-${compact}-${String(todayCount).padStart(3, '0')}`;
  }, [todayIso, posOrders]);

  // Dashboard metrics
  const posDashboardMetrics = useMemo(() => {
    const todayOrders = posOrders.filter((o) => (o.orderDate || '') === todayIso);
    const todayRevenue = todayOrders.reduce((s, o) => s + (o.totalNgn || 0), 0);
    const allTimeRevenue = posOrders.reduce((s, o) => s + (o.totalNgn || 0), 0);
    const billedToRoomsTotal = posOrders
      .filter((o) => o.paymentStatus === 'room_folio' || o.paymentMethod === 'Room Folio')
      .reduce((s, o) => s + (o.totalNgn || 0), 0);
    const activeKitchenCount = posOrders.filter((o) => o.kitchenStatus !== 'served').length;
    const directPaidTotal = posOrders
      .filter((o) => o.paymentStatus !== 'room_folio' && o.paymentMethod !== 'Room Folio')
      .reduce((s, o) => s + (o.totalNgn || 0), 0);
    const cardTotal = posOrders
      .filter((o) => o.paymentMethod === 'Card POS')
      .reduce((s, o) => s + (o.totalNgn || 0), 0);
    const cashTotal = posOrders
      .filter((o) => o.paymentMethod === 'Cash NGN')
      .reduce((s, o) => s + (o.totalNgn || 0), 0);
    const transferTotal = posOrders
      .filter((o) => o.paymentMethod === 'Bank Transfer')
      .reduce((s, o) => s + (o.totalNgn || 0), 0);
    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      allTimeRevenue,
      billedToRoomsTotal,
      activeKitchenCount,
      directPaidTotal,
      cardTotal,
      cashTotal,
      transferTotal,
      avgTicketNgn: posOrders.length > 0 ? Math.round(allTimeRevenue / posOrders.length) : 0,
    };
  }, [posOrders, todayIso]);

  const posPurchasesLedger = useMemo(
    () =>
      [...ledgerEntries]
        .filter(
          (l) =>
            l.entryType === 'expense' &&
            (l.category === 'Restaurant & Bar' ||
              l.category === 'Procurement' ||
              (l.reference || '').startsWith('POS-PUR-'))
        )
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate)),
    [ledgerEntries]
  );

  // Cart helpers
  const addToCart = (item: PosMenuItemRecord) => {
    if (item.available === false) return;
    setPosError(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { id: item.id, name: item.name, priceNgn: item.priceNgn, qty: 1 }];
    });
  };

  const updateQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === lineId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const removeCartLine = (lineId: string) => {
    setCart((prev) => prev.filter((c) => c.id !== lineId));
  };

  const clearSale = () => {
    setCart([]);
    setDiscountValue(0);
    setOrderNotes('');
    setWalkinGuestName('');
    setShowDiscountEditor(false);
    setShowNoteEditor(false);
    setPosError(null);
  };

  const handleAddCustomLine = () => {
    const cleanName = customLineName.trim();
    if (!cleanName || customLinePrice <= 0 || customLineQty <= 0) return;
    setCart((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: cleanName,
        priceNgn: Math.round(customLinePrice),
        qty: Math.round(customLineQty),
      },
    ]);
    setCustomLineName('');
    setCustomLinePrice(2500);
    setCustomLineQty(1);
    setShowCustomLine(false);
  };

  const handleChargeTargetChange = (val: string) => {
    setChargeTarget(val);
    setPosError(null);
    if (val === 'walkin') {
      if (paymentMethod === 'Room Folio') setPaymentMethod('Card POS');
      setServiceType('Dine-In');
    } else {
      setServiceType('Room Service');
    }
  };

  const handleSelectPaymentMethod = (nextMethod: PosOrderRecord['paymentMethod']) => {
    setPosError(null);
    setPaymentMethod(nextMethod);
    if (nextMethod === 'Room Folio') {
      if (chargeTarget === 'walkin') {
        if (inHouseGuests.length > 0) {
          setChargeTarget(inHouseGuests[0].id);
          setServiceType('Room Service');
        } else {
          setPosError(
            'No checked-in guests are currently in-house. Select Card, Cash, or Bank Transfer for walk-in sales.'
          );
        }
      }
    }
  };

  const handleSelectInHouseGuestForBilling = (res: ReservationRecord) => {
    setChargeTarget(res.id);
    setPaymentMethod('Room Folio');
    setServiceType('Room Service');
    setPosModuleTab('terminal');
    setPosError(null);
  };

  // Build printable document from a persisted PosOrderRecord
  const buildPrintableFromOrder = (ord: PosOrderRecord): PrintablePosDocument => {
    const cachedLines = orderLineCache[ord.id];
    const lineItems =
      cachedLines && cachedLines.length > 0
        ? cachedLines
        : parseSummaryToLineItems(ord.itemsSummary, ord.subtotalNgn);
    const disc = Math.max(0, ord.discountNgn || 0);
    const svc = Math.max(0, ord.serviceChargeNgn || 0);
    const tax = Math.max(0, ord.vatNgn || 0);
    const netSub = Math.max(1, ord.subtotalNgn - disc);
    return {
      orderNumber: ord.orderNumber,
      orderDate: ord.orderDate || todayIso,
      serviceType: ord.serviceType,
      tableOrRoom: ord.tableOrRoom,
      guestName: ord.guestName || 'Walk-in Guest',
      itemsSummary: ord.itemsSummary,
      itemCount: ord.itemCount,
      lineItems,
      subtotalNgn: ord.subtotalNgn,
      discountNgn: disc,
      serviceChargeNgn: svc,
      serviceChargeRatePct: svc > 0 ? Math.round((svc / netSub) * 1000) / 10 : 0,
      vatNgn: tax,
      taxRatePct: tax > 0 ? Math.round((tax / netSub) * 1000) / 10 : 0,
      totalNgn: ord.totalNgn,
      paymentMethod: ord.paymentMethod,
      paymentStatus: ord.paymentStatus,
      notes: ord.notes,
      isPreview: false,
    };
  };

  const openOrderDocumentModal = (ord: PosOrderRecord, format: 'receipt' | 'invoice') => {
    setPrintFormat(format);
    setPrintDoc(buildPrintableFromOrder(ord));
  };

  const handlePreviewOrLastReceipt = () => {
    if (cart.length > 0) {
      const targetLabel = selectedInHouseGuest
        ? `Room ${selectedInHouseGuest.roomNumber} (${selectedInHouseGuest.guestName})`
        : tableOrRoom.trim() || 'Walk-in';
      setPrintFormat('receipt');
      setPrintDoc({
        orderNumber: previewOrderNumber,
        orderDate: todayIso,
        serviceType,
        tableOrRoom: targetLabel,
        guestName: walkinGuestName.trim() || selectedInHouseGuest?.guestName || 'Walk-in Guest',
        itemsSummary: cart.map((c) => `${c.qty}x ${c.name}`).join(', '),
        itemCount,
        lineItems: cart.map((c) => ({
          name: c.name,
          qty: c.qty,
          unitPriceNgn: c.priceNgn,
          lineTotalNgn: c.priceNgn * c.qty,
        })),
        subtotalNgn,
        discountNgn,
        serviceChargeNgn,
        serviceChargeRatePct,
        vatNgn,
        taxRatePct,
        totalNgn,
        paymentMethod,
        paymentStatus: paymentMethod === 'Room Folio' ? 'room_folio' : 'unpaid',
        notes: orderNotes.trim() || undefined,
        isPreview: true,
      });
      return;
    }
    if (posOrders.length > 0) {
      openOrderDocumentModal(posOrders[0], 'receipt');
      return;
    }
    setPosError('Add items to the current sale or complete an order before printing a receipt.');
  };

  const handleProcessPayment = async () => {
    if (cart.length === 0) {
      setPosError('Add at least one item to the current sale before processing payment.');
      return;
    }
    setPosError(null);

    const linkedRes =
      chargeTarget !== 'walkin'
        ? inHouseGuests.find((r) => r.id === chargeTarget)
        : undefined;

    if (paymentMethod === 'Room Folio' && !linkedRes) {
      setPosError(
        'Room Charge requires selecting a checked-in guest from the top Room selector.'
      );
      return;
    }

    const targetLabel = linkedRes
      ? `Room ${linkedRes.roomNumber} (${linkedRes.guestName})`
      : tableOrRoom.trim() || 'Walk-in';
    const itemsSummary = cart.map((c) => `${c.qty}x ${c.name}`).join(', ');
    const snapshotLines: PrintableOrderItem[] = cart.map((c) => ({
      name: c.name,
      qty: c.qty,
      unitPriceNgn: c.priceNgn,
      lineTotalNgn: c.priceNgn * c.qty,
    }));

    setSubmitting(true);
    try {
      const created = await submitPosOrderWorkflow({
        property,
        serviceType: linkedRes ? 'Room Service' : serviceType,
        tableOrRoom: targetLabel,
        guestName: walkinGuestName.trim() || linkedRes?.guestName || 'Walk-in Guest',
        notes: orderNotes.trim(),
        linkedReservation: paymentMethod === 'Room Folio' ? linkedRes : undefined,
        itemsSummary,
        itemCount,
        subtotalNgn,
        discountNgn,
        serviceChargeNgn,
        vatNgn,
        paymentMethod,
        actorRole,
      });

      if (created) {
        setOrderLineCache((prev) => ({ ...prev, [created.id]: snapshotLines }));
        setPrintFormat('receipt');
        setPrintDoc({
          orderNumber: created.orderNumber,
          orderDate: created.orderDate || todayIso,
          serviceType: created.serviceType,
          tableOrRoom: created.tableOrRoom,
          guestName: created.guestName || 'Walk-in Guest',
          itemsSummary: created.itemsSummary,
          itemCount: created.itemCount,
          lineItems: snapshotLines,
          subtotalNgn: created.subtotalNgn,
          discountNgn: created.discountNgn || 0,
          serviceChargeNgn: created.serviceChargeNgn || 0,
          serviceChargeRatePct,
          vatNgn: created.vatNgn || 0,
          taxRatePct,
          totalNgn: created.totalNgn,
          paymentMethod: created.paymentMethod,
          paymentStatus: created.paymentStatus,
          notes: created.notes,
          isPreview: false,
        });
      }

      onNotify(
        paymentMethod === 'Room Folio' && linkedRes
          ? `Charged ${formatNgn(totalNgn)} to Room ${linkedRes.roomNumber} (${linkedRes.guestName})`
          : `Payment processed (${formatPaymentMethodLabel(paymentMethod)}): ${formatNgn(totalNgn)}`
      );
      clearSale();
    } catch (err) {
      setPosError(
        err instanceof Error ? err.message : 'Unable to process POS order. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger native print using dedicated #pos-print-portal
  const handleTriggerBrowserPrint = () => {
    document.body.classList.add('pos-printing');
    window.setTimeout(() => {
      window.print();
    }, 60);
  };

  // Download crisp PDF (80mm Thermal Receipt OR A4 Formal Invoice)
  const handleDownloadPdf = (docData: PrintablePosDocument, mode: 'receipt' | 'invoice') => {
    if (mode === 'receipt') {
      const estimatedHeight = Math.max(150, 115 + docData.lineItems.length * 7);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, estimatedHeight],
      });
      let y = 9;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(property.name, 40, y, { align: 'center', maxWidth: 72 });
      y += 5;

      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      if (property.address) {
        const addrLines = pdf.splitTextToSize(property.address, 70);
        pdf.text(addrLines, 40, y, { align: 'center' });
        y += addrLines.length * 3.2;
      }
      if (property.phone || property.email) {
        pdf.text(
          [property.phone, property.email].filter(Boolean).join(' | '),
          40,
          y + 1,
          { align: 'center', maxWidth: 72 }
        );
        y += 4.5;
      }
      if (receiptHeaderNote) {
        const hdr = pdf.splitTextToSize(receiptHeaderNote, 70);
        pdf.text(hdr, 40, y, { align: 'center' });
        y += hdr.length * 3.2 + 1;
      }

      pdf.line(5, y, 75, y);
      y += 4;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        `${docData.isPreview ? 'PROFORMA RECEIPT' : 'POS RECEIPT'}: #${docData.orderNumber}`,
        5,
        y
      );
      y += 4.5;

      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Date: ${docData.orderDate}`, 5, y);
      y += 3.6;
      pdf.text(`Account: ${docData.tableOrRoom}`, 5, y, { maxWidth: 70 });
      y += 3.6;
      pdf.text(`Guest: ${docData.guestName}`, 5, y, { maxWidth: 70 });
      y += 4;

      pdf.line(5, y, 75, y);
      y += 4;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Item', 5, y);
      pdf.text('Qty', 46, y, { align: 'right' });
      pdf.text('Total', 75, y, { align: 'right' });
      y += 3.8;
      pdf.setFont('helvetica', 'normal');
      for (const item of docData.lineItems) {
        const label = item.name.length > 26 ? `${item.name.slice(0, 25)}…` : item.name;
        pdf.text(label, 5, y);
        pdf.text(String(item.qty), 46, y, { align: 'right' });
        pdf.text(formatPdfNgn(item.lineTotalNgn), 75, y, { align: 'right' });
        y += 4;
      }

      y += 1;
      pdf.line(5, y, 75, y);
      y += 4.2;

      pdf.text('Subtotal:', 5, y);
      pdf.text(formatPdfNgn(docData.subtotalNgn), 75, y, { align: 'right' });
      y += 3.8;
      if (docData.discountNgn > 0) {
        pdf.text('Discount:', 5, y);
        pdf.text(`-${formatPdfNgn(docData.discountNgn)}`, 75, y, { align: 'right' });
        y += 3.8;
      }
      if (docData.serviceChargeNgn > 0) {
        pdf.text(
          `Service Charge${docData.serviceChargeRatePct ? ` (${docData.serviceChargeRatePct}%)` : ''}:`,
          5,
          y
        );
        pdf.text(formatPdfNgn(docData.serviceChargeNgn), 75, y, { align: 'right' });
        y += 3.8;
      }
      if (docData.vatNgn > 0) {
        pdf.text(`Tax / VAT${docData.taxRatePct ? ` (${docData.taxRatePct}%)` : ''}:`, 5, y);
        pdf.text(formatPdfNgn(docData.vatNgn), 75, y, { align: 'right' });
        y += 3.8;
      }

      y += 1.5;
      pdf.setFontSize(9.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('TOTAL:', 5, y);
      pdf.text(formatPdfNgn(docData.totalNgn), 75, y, { align: 'right' });
      y += 5;

      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Payment: ${formatPaymentMethodLabel(docData.paymentMethod)}`, 5, y);
      y += 3.6;
      pdf.text(
        `Status: ${
          docData.paymentStatus === 'room_folio'
            ? 'Charged to Room Folio'
            : docData.paymentStatus.toUpperCase()
        }`,
        5,
        y
      );
      y += 5;
      if (docData.notes) {
        const noteLines = pdf.splitTextToSize(`Note: ${docData.notes}`, 70);
        pdf.text(noteLines, 5, y);
        y += noteLines.length * 3.4 + 2;
      }

      const footerLines = pdf.splitTextToSize(receiptFooterNote, 70);
      pdf.text(footerLines, 40, y, { align: 'center' });
      pdf.save(`${docData.orderNumber}-receipt.pdf`);
      onNotify(`Downloaded ${docData.orderNumber}-receipt.pdf`);
      return;
    }

    // A4 Formal Invoice PDF
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.setFillColor(10, 54, 122);
    pdf.rect(0, 0, 210, 34, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(17);
    pdf.text(property.name, 15, 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(
      [property.address, property.phone, property.email].filter(Boolean).join(' · '),
      15,
      23,
      { maxWidth: 120 }
    );
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(docData.isPreview ? 'PROFORMA INVOICE' : 'POS TAX INVOICE', 195, 16, {
      align: 'right',
    });
    pdf.setFontSize(9.5);
    pdf.text(`#${docData.orderNumber}`, 195, 23, { align: 'right' });

    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Billed To:', 15, 45);
    pdf.setFont('helvetica', 'normal');
    pdf.text(docData.guestName, 15, 51);
    pdf.text(docData.tableOrRoom, 15, 56);
    pdf.text(`Service Type: ${docData.serviceType}`, 15, 61);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Invoice Details:', 135, 45);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date: ${docData.orderDate}`, 135, 51);
    pdf.text(`Payment Method: ${formatPaymentMethodLabel(docData.paymentMethod)}`, 135, 56);
    pdf.text(
      `Status: ${
        docData.paymentStatus === 'room_folio'
          ? 'Charged to Room Folio'
          : docData.paymentStatus.toUpperCase()
      }`,
      135,
      61
    );

    autoTable(pdf, {
      startY: 70,
      head: [['Item Description', 'Qty', 'Unit Price', 'Line Total']],
      body: docData.lineItems.map((it) => [
        it.name,
        String(it.qty),
        formatPdfNgn(it.unitPriceNgn),
        formatPdfNgn(it.lineTotalNgn),
      ]),
      headStyles: { fillColor: [10, 54, 122], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
      columnStyles: {
        1: { halign: 'right', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 38 },
        3: { halign: 'right', cellWidth: 38 },
      },
    });

    const finalY =
      (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 120;
    let sy = finalY + 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Subtotal:', 135, sy);
    pdf.text(formatPdfNgn(docData.subtotalNgn), 195, sy, { align: 'right' });
    sy += 6;
    if (docData.discountNgn > 0) {
      pdf.text('Discount:', 135, sy);
      pdf.text(`-${formatPdfNgn(docData.discountNgn)}`, 195, sy, { align: 'right' });
      sy += 6;
    }
    if (docData.serviceChargeNgn > 0) {
      pdf.text(
        `Service Charge${docData.serviceChargeRatePct ? ` (${docData.serviceChargeRatePct}%)` : ''}:`,
        135,
        sy
      );
      pdf.text(formatPdfNgn(docData.serviceChargeNgn), 195, sy, { align: 'right' });
      sy += 6;
    }
    if (docData.vatNgn > 0) {
      pdf.text(`Tax / VAT${docData.taxRatePct ? ` (${docData.taxRatePct}%)` : ''}:`, 135, sy);
      pdf.text(formatPdfNgn(docData.vatNgn), 195, sy, { align: 'right' });
      sy += 6;
    }

    pdf.setFillColor(236, 253, 245);
    pdf.rect(130, sy - 4, 68, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    pdf.setTextColor(10, 54, 122);
    pdf.text('TOTAL DUE / PAID:', 133, sy + 2.5);
    pdf.text(formatPdfNgn(docData.totalNgn), 195, sy + 2.5, { align: 'right' });

    if (docData.notes) {
      pdf.setTextColor(71, 85, 105);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Notes: ${docData.notes}`, 15, sy + 16, { maxWidth: 180 });
    }

    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8.5);
    pdf.text(receiptFooterNote, 105, 282, { align: 'center', maxWidth: 180 });
    pdf.save(`${docData.orderNumber}-invoice.pdf`);
    onNotify(`Downloaded ${docData.orderNumber}-invoice.pdf`);
  };

  // Property Admin: Menu Item CRUD
  const openAddMenuModal = () => {
    setEditingMenuItem(null);
    setMenuName('');
    setMenuSection(activeSectionTab);
    setMenuCategory(activeSectionTab === 'Food & Beverage' ? 'Drinks' : 'Lunch');
    setMenuPrice(3000);
    setMenuCost(1400);
    setMenuPrep(15);
    setMenuAvailable(true);
    setMenuModalOpen(true);
  };

  const openEditMenuModal = (item: PosMenuItemRecord) => {
    setEditingMenuItem(item);
    setMenuName(item.name);
    setMenuSection(inferPosItemSection(item));
    setMenuCategory(item.category);
    setMenuPrice(item.priceNgn);
    setMenuCost(item.costNgn ?? 0);
    setMenuPrep(item.prepMinutes);
    setMenuAvailable(item.available ?? true);
    setMenuModalOpen(true);
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMenu || !menuName.trim()) return;
    setSavingMenu(true);
    try {
      const isPersistedDoc =
        editingMenuItem && posMenuItems.some((m) => m.id === editingMenuItem.id);
      if (isPersistedDoc && editingMenuItem) {
        await updatePosMenuItemWorkflow({
          property,
          item: editingMenuItem,
          updates: {
            name: menuName,
            section: menuSection,
            category: menuCategory,
            priceNgn: menuPrice,
            costNgn: menuCost,
            prepMinutes: menuPrep,
            available: menuAvailable,
          },
          actorRole,
        });
        onNotify(`Updated POS product: ${menuName.trim()}`);
      } else {
        await createPosMenuItemWorkflow({
          property,
          name: menuName,
          section: menuSection,
          category: menuCategory,
          priceNgn: menuPrice,
          costNgn: menuCost,
          prepMinutes: menuPrep,
          available: menuAvailable,
          actorRole,
        });
        onNotify(`Added POS product: ${menuName.trim()}`);
      }
      setMenuModalOpen(false);
    } catch (err) {
      onNotify(
        `Unable to save POS product: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setSavingMenu(false);
    }
  };

  const handleDeleteMenuItem = async () => {
    if (!canManageMenu || !editingMenuItem) return;
    setSavingMenu(true);
    try {
      await deletePosMenuItemWorkflow({
        property,
        item: editingMenuItem,
        actorRole,
      });
      onNotify(`Removed POS product: ${editingMenuItem.name}`);
      setMenuModalOpen(false);
    } catch (err) {
      onNotify(
        `Unable to remove POS product: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setSavingMenu(false);
    }
  };

  const handleSeedStandardMenu = async () => {
    if (!canManageMenu) return;
    setSeedingMenu(true);
    try {
      const added = await seedStandardPosMenuWorkflow({
        property,
        existingItems: posMenuItems,
        actorRole,
      });
      onNotify(
        added > 0
          ? `Loaded ${added} standard Kitchen & Food & Beverage items into ${property.name} POS.`
          : 'Standard POS menu items are already loaded.'
      );
    } catch (err) {
      onNotify(
        `Unable to load standard menu: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setSeedingMenu(false);
    }
  };

  // Property Admin: Edit Order / Transaction
  const openEditOrderModal = (ord: PosOrderRecord) => {
    if (!canManageMenu) return;
    setEditingOrder(ord);
    setEditOrdTableOrRoom(ord.tableOrRoom || '');
    setEditOrdGuestName(ord.guestName || '');
    setEditOrdPaymentMethod(ord.paymentMethod);
    setEditOrdPaymentStatus(ord.paymentStatus);
    setEditOrdKitchenStatus(ord.kitchenStatus);
    setEditOrdDiscountNgn(ord.discountNgn || 0);
    setEditOrdServiceChargeNgn(ord.serviceChargeNgn || 0);
    setEditOrdVatNgn(ord.vatNgn || 0);
    setEditOrdNotes(ord.notes || '');
  };

  const handleSaveOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMenu || !editingOrder) return;
    setSavingOrderEdit(true);
    try {
      const linkedRes = editingOrder.reservationId
        ? reservations.find((r) => r.id === editingOrder.reservationId)
        : undefined;
      await updatePosOrderWorkflow({
        property,
        order: editingOrder,
        linkedReservation: linkedRes,
        updates: {
          tableOrRoom: editOrdTableOrRoom.trim(),
          guestName: editOrdGuestName.trim(),
          paymentMethod: editOrdPaymentMethod,
          paymentStatus: editOrdPaymentStatus,
          kitchenStatus: editOrdKitchenStatus,
          discountNgn: Math.max(0, Math.round(editOrdDiscountNgn)),
          serviceChargeNgn: Math.max(0, Math.round(editOrdServiceChargeNgn)),
          vatNgn: Math.max(0, Math.round(editOrdVatNgn)),
          notes: editOrdNotes.trim(),
        },
        actorRole,
      });
      onNotify(`Updated POS order #${editingOrder.orderNumber} (recorded in audit log).`);
      setEditingOrder(null);
    } catch (err) {
      onNotify(
        `Unable to update order: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setSavingOrderEdit(false);
    }
  };

  // Property Admin: Property POS Settings
  const openSettingsModal = () => {
    setSetServiceRate(serviceChargeRatePct);
    setSetTaxRate(taxRatePct);
    setSetReceiptHeader(property.posReceiptHeader || '');
    setSetReceiptFooter(property.posReceiptFooter || '');
    setSetCustomCategoriesText((property.posCategories || []).join(', '));
    setSettingsModalOpen(true);
  };

  const handleSavePosSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMenu) return;
    setSavingSettings(true);
    try {
      const parsedCategories = setCustomCategoriesText
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      await updatePropertyPosSettingsWorkflow({
        property,
        posServiceChargeRate: setServiceRate,
        posTaxRate: setTaxRate,
        posReceiptHeader: setReceiptHeader,
        posReceiptFooter: setReceiptFooter,
        posCategories: parsedCategories,
        actorRole,
      });
      onNotify(`Saved POS settings for ${property.name} (recorded in audit log).`);
      setSettingsModalOpen(false);
    } catch (err) {
      onNotify(
        `Unable to save POS settings: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setSavingSettings(false);
    }
  };

  // Record POS Purchase Expense + immediate Purchase Invoice
  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purItemDesc.trim() || !purSupplier.trim() || purAmount <= 0) return;
    setSavingPurchase(true);
    try {
      const linkedInv = purInvId ? inventoryItems.find((i) => i.id === purInvId) : undefined;
      const recorded = await recordPosPurchaseWorkflow({
        property,
        itemDescription: purItemDesc,
        supplierName: purSupplier,
        category: purCategory,
        amountNgn: purAmount,
        paymentMethod: purMethod,
        entryDate: purDate,
        linkedInventoryItem: linkedInv,
        restockQty: purRestockQty,
        actorRole,
      });
      onNotify(`Recorded POS purchase ${formatNgn(purAmount)} (${purItemDesc.trim()})`);
      setPurchaseModalOpen(false);
      if (recorded) {
        setPurchaseInvoice({
          invoiceNumber: recorded.reference,
          date: recorded.entryDate,
          title: 'Purchase Invoice',
          subtitle: 'Purchase recorded — view, print, or save PDF invoice',
          partyLabel: 'Supplier / Vendor',
          partyName: recorded.supplierName,
          category: recorded.category,
          paymentMethod: recorded.paymentMethod,
          status: 'Paid',
          items: [
            {
              description: recorded.itemDescription,
              quantity: Math.max(1, purRestockQty || 1),
              unitCostNgn:
                purRestockQty > 0
                  ? Math.round(recorded.amountNgn / Math.max(1, purRestockQty))
                  : recorded.amountNgn,
              totalNgn: recorded.amountNgn,
            },
          ],
          subtotalNgn: recorded.amountNgn,
          vatNgn: 0,
          totalNgn: recorded.amountNgn,
          notes: linkedInv
            ? `Linked Store Inventory restock: ${linkedInv.name} (+${purRestockQty} ${linkedInv.unit})`
            : undefined,
        });
      }
      setPurItemDesc('');
      setPurSupplier('');
      setPurAmount(15000);
      setPurInvId('');
      setPurRestockQty(0);
    } catch (err) {
      onNotify(
        `Unable to record purchase: ${err instanceof Error ? err.message : 'Please try again.'}`
      );
    } finally {
      setSavingPurchase(false);
    }
  };

  // Dedicated Print Document Content (used both in modal preview AND in #pos-print-portal)
  const renderPrintableDocument = (docData: PrintablePosDocument, mode: 'receipt' | 'invoice') => {
    if (mode === 'receipt') {
      return (
        <div className="mx-auto w-[302px] bg-white text-slate-900 border border-slate-200 rounded-lg p-5 font-mono text-[11px] leading-relaxed print:border-0 print:rounded-none print:p-2 print:w-[76mm]">
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <p className="font-display text-sm font-extrabold text-[#0a367a] tracking-tight">
              {property.name}
            </p>
            {property.address && <p className="text-[10px] text-slate-600">{property.address}</p>}
            {(property.phone || property.email) && (
              <p className="text-[10px] text-slate-600">
                {[property.phone, property.email].filter(Boolean).join(' · ')}
              </p>
            )}
            {receiptHeaderNote && (
              <p className="text-[10px] font-semibold text-slate-700 pt-0.5">{receiptHeaderNote}</p>
            )}
          </div>

          <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5 text-[10px]">
            <div className="flex justify-between font-bold text-slate-900">
              <span>{docData.isPreview ? 'PROFORMA RECEIPT' : 'POS RECEIPT'}</span>
              <span>#{docData.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date:</span>
              <span>{docData.orderDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Account:</span>
              <span className="text-right max-w-[180px] truncate">{docData.tableOrRoom}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Guest:</span>
              <span className="text-right max-w-[180px] truncate">{docData.guestName}</span>
            </div>
          </div>

          <div className="py-2.5 border-b border-dashed border-slate-300">
            <div className="grid grid-cols-12 font-bold text-[10px] text-slate-600 pb-1">
              <span className="col-span-6">Item</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-4 text-right">Total</span>
            </div>
            <div className="space-y-1">
              {docData.lineItems.map((line, i) => (
                <div key={`${line.name}-${i}`} className="grid grid-cols-12 text-[10.5px]">
                  <span className="col-span-6 pr-1 break-words">{line.name}</span>
                  <span className="col-span-2 text-right">{line.qty}</span>
                  <span className="col-span-4 text-right font-semibold">
                    {formatNgn(line.lineTotalNgn)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10.5px]">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span>{formatNgn(docData.subtotalNgn)}</span>
            </div>
            {docData.discountNgn > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>Discount</span>
                <span>-{formatNgn(docData.discountNgn)}</span>
              </div>
            )}
            {docData.serviceChargeNgn > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Service Charge{docData.serviceChargeRatePct ? ` (${docData.serviceChargeRatePct}%)` : ''}
                </span>
                <span>{formatNgn(docData.serviceChargeNgn)}</span>
              </div>
            )}
            {docData.vatNgn > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Tax / VAT{docData.taxRatePct ? ` (${docData.taxRatePct}%)` : ''}
                </span>
                <span>{formatNgn(docData.vatNgn)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-slate-200 text-xs font-extrabold text-[#0a367a]">
              <span>TOTAL</span>
              <span>{formatNgn(docData.totalNgn)}</span>
            </div>
          </div>

          <div className="py-2.5 space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Method:</span>
              <span className="font-bold">{formatPaymentMethodLabel(docData.paymentMethod)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className="font-bold uppercase">
                {docData.paymentStatus === 'room_folio'
                  ? 'Charged to Room Folio'
                  : docData.paymentStatus}
              </span>
            </div>
            {docData.notes && (
              <p className="pt-1 text-[10px] text-slate-600">Note: {docData.notes}</p>
            )}
          </div>

          <p className="pt-2.5 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-600">
            {receiptFooterNote}
          </p>
        </div>
      );
    }

    // Formal A4 Invoice Layout
    return (
      <div className="bg-white text-slate-900 border border-slate-200 rounded-xl overflow-hidden print:border-0 print:rounded-none">
        <div className="bg-[#0a367a] text-white px-6 py-5 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-extrabold tracking-tight">{property.name}</h3>
            {property.address && <p className="text-xs text-emerald-100">{property.address}</p>}
            <p className="text-[11px] text-emerald-100">
              {[property.phone, property.email].filter(Boolean).join(' · ')}
            </p>
            {receiptHeaderNote && (
              <p className="text-[11px] text-emerald-50 font-medium pt-0.5">{receiptHeaderNote}</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-display text-base font-extrabold uppercase tracking-wide">
              {docData.isPreview ? 'Proforma Invoice' : 'Tax Invoice'}
            </p>
            <p className="font-mono-tabular text-xs text-emerald-100 mt-0.5">
              #{docData.orderNumber}
            </p>
            <p className="font-mono-tabular text-[11px] text-emerald-100">
              Date: {docData.orderDate}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Billed To
              </p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{docData.guestName}</p>
              <p className="text-slate-600">{docData.tableOrRoom}</p>
              <p className="text-slate-500">Service: {docData.serviceType}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Payment Details
              </p>
              <p className="font-bold text-slate-900 mt-0.5">
                {formatPaymentMethodLabel(docData.paymentMethod)}
              </p>
              <p className="text-[#0a367a] font-semibold uppercase">
                {docData.paymentStatus === 'room_folio'
                  ? 'Charged to Room Folio'
                  : docData.paymentStatus}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-[11px] font-bold text-slate-600">
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docData.lineItems.map((line, i) => (
                  <tr key={`${line.name}-${i}`}>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{line.name}</td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular">{line.qty}</td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular">
                      {formatNgn(line.unitPriceNgn)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-slate-900">
                      {formatNgn(line.lineTotalNgn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {formatNgn(docData.subtotalNgn)}
                </span>
              </div>
              {docData.discountNgn > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Discount</span>
                  <span className="font-mono-tabular font-semibold">
                    -{formatNgn(docData.discountNgn)}
                  </span>
                </div>
              )}
              {docData.serviceChargeNgn > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>
                    Service Charge
                    {docData.serviceChargeRatePct ? ` (${docData.serviceChargeRatePct}%)` : ''}
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {formatNgn(docData.serviceChargeNgn)}
                  </span>
                </div>
              )}
              {docData.vatNgn > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax / VAT{docData.taxRatePct ? ` (${docData.taxRatePct}%)` : ''}</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {formatNgn(docData.vatNgn)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 font-display text-sm font-extrabold text-[#0a367a]">
                <span>Total</span>
                <span className="font-mono-tabular">{formatNgn(docData.totalNgn)}</span>
              </div>
            </div>
          </div>

          {docData.notes && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
              <span className="font-semibold">Order Notes:</span> {docData.notes}
            </div>
          )}

          <p className="pt-3 border-t border-slate-200 text-center text-[11px] text-slate-500">
            {receiptFooterNote}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="no-print space-y-5">
        {/* Top Bar: POS – Point of Sale + Room Selector + Module Tabs + Property Admin Controls */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-xl font-extrabold text-[#0a367a] tracking-tight">
              POS – Point of Sale
            </h1>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPosModuleTab('terminal')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  posModuleTab === 'terminal'
                    ? 'bg-[#0a367a] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>POS Terminal</span>
              </button>
              <button
                type="button"
                onClick={() => setPosModuleTab('orders')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  posModuleTab === 'orders'
                    ? 'bg-[#0a367a] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>Orders &amp; KDS ({posOrders.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setPosModuleTab('dashboard')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  posModuleTab === 'dashboard'
                    ? 'bg-[#0a367a] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live In-House Room Selector (matching PureCrest design top-right Room dropdown) */}
            <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-blue-200 bg-blue-50/70 text-xs">
              <BedDouble className="w-4 h-4 text-[#0a367a] shrink-0" />
              <select
                aria-label="Select Room or Walk-in Guest"
                value={chargeTarget}
                onChange={(e) => handleChargeTargetChange(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="walkin">Walk-in / Table Guest</option>
                {inHouseGuests.map((guestRes) => (
                  <option key={guestRes.id} value={guestRes.id}>
                    Room: {guestRes.roomNumber} — {guestRes.guestName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setPurchaseModalOpen(true)}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#0a367a]" />
              <span>Record Purchase</span>
            </button>

            {canManageMenu && (
              <>
                <button
                  type="button"
                  onClick={openAddMenuModal}
                  className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Product</span>
                </button>
                <button
                  type="button"
                  onClick={openSettingsModal}
                  title="Property POS Settings"
                  className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-600" />
                  <span>POS Settings</span>
                </button>
              </>
            )}
          </div>
        </div>

        {posError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium">{posError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPosError(null)}
              className="text-rose-700 hover:text-rose-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: POS TERMINAL (Matches Attached PureCrest POS Reference Design)    */}
        {/* ========================================================================= */}
        {posModuleTab === 'terminal' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN (7/12 on tablet & desktop): Kitchen & F&B Tabs, Search, Sub-category Chips, Text-Only Product Grid, Quick Actions */}
            <div className="md:col-span-7 space-y-4">
              {/* Primary Section Tabs: Kitchen | Food & Beverage */}
              <div className="flex flex-wrap items-center gap-2.5">
                {POS_SECTIONS.map((sec) => {
                  const isActive = activeSectionTab === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setActiveSectionTab(sec);
                        setCategoryFilter('All Food');
                      }}
                      className={`h-12 px-6 rounded-xl font-display text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#0a367a] text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-800 hover:border-[#0a367a]'
                      }`}
                    >
                      {sec === 'Kitchen' ? (
                        <UtensilsCrossed className="w-4 h-4" />
                      ) : (
                        <ChefHat className="w-4 h-4" />
                      )}
                      <span>{sec}</span>
                    </button>
                  );
                })}
              </div>

              {/* Full-Width Search Menu Items Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchMenu}
                  onChange={(e) => setSearchMenu(e.target.value)}
                  placeholder="Search menu items..."
                  className="w-full h-11 bg-white border border-slate-200 rounded-xl pl-10 pr-9 text-xs text-slate-800 focus:outline-none focus:border-[#0a367a]"
                />
                {searchMenu && (
                  <button
                    type="button"
                    onClick={() => setSearchMenu('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Sub-Category Filter Chips */}
              <div className="flex flex-wrap items-center gap-2">
                {categoryChips.map((chip) => {
                  const active = categoryFilter === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCategoryFilter(chip)}
                      className={`h-9 px-4 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-[#0a367a] text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:border-[#0a367a] hover:text-[#0a367a]'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Clean Text-Based Product Catalogue (Strictly NO product images) */}
              {effectiveMenu.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
                  <p className="font-display text-sm font-bold text-slate-900">
                    No POS products added for {property.name} yet
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {canManageMenu
                      ? 'Load the standard hotel Kitchen & Food & Beverage catalogue in one click, or add your custom property menu items.'
                      : 'Ask your Property Admin to add POS products, or use "+ Custom Item" in Quick Actions below.'}
                  </p>
                  {canManageMenu && (
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={seedingMenu}
                        onClick={handleSeedStandardMenu}
                        className="h-10 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {seedingMenu ? 'Loading Menu...' : 'Load Standard Hotel Menu (20 Items)'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={openAddMenuModal}
                        className="h-10 inline-flex items-center gap-1.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Custom Product</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : visibleMenu.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                  <p className="text-xs text-slate-600 font-medium">
                    No items found in {activeSectionTab} · {categoryFilter}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMenu('');
                      setCategoryFilter('All Food');
                    }}
                    className="text-xs font-semibold text-[#0a367a] hover:underline cursor-pointer"
                  >
                    Show all items
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {visibleMenu.map((item) => {
                    const isDisabled = item.available === false;
                    const inCartQty = cart.find((c) => c.id === item.id)?.qty || 0;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => !isDisabled && addToCart(item)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
                            e.preventDefault();
                            addToCart(item);
                          }
                        }}
                        className={`group relative rounded-xl border bg-white px-3 py-3.5 text-center flex flex-col items-center justify-center gap-1 transition-all select-none ${
                          isDisabled
                            ? 'border-slate-200 opacity-50 cursor-not-allowed'
                            : inCartQty > 0
                              ? 'border-[#0a367a] bg-blue-50/50 ring-1 ring-[#0a367a]/30 cursor-pointer'
                              : 'border-slate-200 hover:border-[#0a367a] hover:bg-blue-50/25 cursor-pointer'
                        }`}
                      >
                        {inCartQty > 0 && (
                          <span className="absolute top-1.5 left-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-[#0a367a] text-white font-mono-tabular text-[10px] font-bold inline-flex items-center justify-center">
                            {inCartQty}
                          </span>
                        )}
                        {canManageMenu && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMenuModal(item);
                            }}
                            title={`Edit ${item.name}`}
                            className="absolute top-1.5 right-1.5 p-1 rounded-md text-slate-400 hover:text-[#0a367a] hover:bg-blue-50 opacity-75 group-hover:opacity-100 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 px-1">
                          {item.name}
                        </p>
                        <p className="font-mono-tabular text-sm font-extrabold text-[#0a367a]">
                          {formatNgn(item.priceNgn)}
                        </p>
                        {isDisabled && (
                          <span className="text-[10px] font-semibold text-rose-600">
                            Unavailable
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quick Actions Bar (Mint Panel matching PureCrest POS design) */}
              <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-xs font-bold text-[#0a367a]">Quick Actions</p>
                  {canManageMenu && effectiveMenu.length > 0 && effectiveMenu.length < 10 && (
                    <button
                      type="button"
                      disabled={seedingMenu}
                      onClick={handleSeedStandardMenu}
                      className="text-[11px] font-semibold text-[#0a367a] hover:underline cursor-pointer"
                    >
                      + Load Standard Menu Items
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={clearSale}
                    className="h-11 inline-flex items-center justify-center gap-2 px-3 rounded-xl bg-white border border-slate-200 hover:border-rose-300 hover:text-rose-700 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-[#0a367a]" />
                    <span>Clear Sale</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDiscountEditor((v) => !v);
                      setShowNoteEditor(false);
                      setShowCustomLine(false);
                    }}
                    className={`h-11 inline-flex items-center justify-center gap-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      showDiscountEditor || discountNgn > 0
                        ? 'bg-[#0a367a] border-[#0a367a] text-white'
                        : 'bg-white border-slate-200 hover:border-[#0a367a] text-slate-800'
                    }`}
                  >
                    <Tag className="w-4 h-4" />
                    <span>
                      {discountNgn > 0 ? `Discount (-${formatNgn(discountNgn)})` : 'Apply Discount'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNoteEditor((v) => !v);
                      setShowDiscountEditor(false);
                      setShowCustomLine(false);
                    }}
                    className={`h-11 inline-flex items-center justify-center gap-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      showNoteEditor || orderNotes.trim()
                        ? 'bg-[#0a367a] border-[#0a367a] text-white'
                        : 'bg-white border-slate-200 hover:border-[#0a367a] text-slate-800'
                    }`}
                  >
                    <StickyNote className="w-4 h-4" />
                    <span>{orderNotes.trim() ? 'Note Added' : 'Add Note'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomLine((v) => !v);
                      setShowDiscountEditor(false);
                      setShowNoteEditor(false);
                    }}
                    className={`h-11 inline-flex items-center justify-center gap-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      showCustomLine
                        ? 'bg-[#0a367a] border-[#0a367a] text-white'
                        : 'bg-white border-slate-200 hover:border-[#0a367a] text-slate-800'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Custom Item</span>
                  </button>
                </div>

                {/* Inline Apply Discount Editor */}
                {showDiscountEditor && (
                  <div className="bg-white border border-blue-200 rounded-xl p-3 flex flex-wrap items-end gap-2.5 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Type
                      </label>
                      <select
                        value={discountType}
                        onChange={(e) =>
                          setDiscountType(e.target.value as 'percent' | 'fixed')
                        }
                        className="h-9 border border-slate-200 rounded-lg px-2.5 bg-white text-xs font-semibold"
                      >
                        <option value="percent">Percentage (%)</option>
                        <option value="fixed">Fixed Amount (₦)</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {discountType === 'percent' ? 'Discount %' : 'Discount Amount (₦)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={discountType === 'percent' ? 100 : undefined}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                        className="w-full h-9 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountValue(0);
                        setShowDiscountEditor(false);
                      }}
                      className="h-9 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDiscountEditor(false)}
                      className="h-9 px-4 rounded-lg bg-[#0a367a] text-white font-semibold cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}

                {/* Inline Order Note Editor */}
                {showNoteEditor && (
                  <div className="bg-white border border-blue-200 rounded-xl p-3 space-y-2 text-xs">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Kitchen / Service Note
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="e.g. Less pepper, extra cutlery, deliver to Room 101..."
                        className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNoteEditor(false)}
                        className="h-9 px-4 rounded-lg bg-[#0a367a] text-white font-semibold cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Custom / Misc Item Adder */}
                {showCustomLine && (
                  <div className="bg-white border border-blue-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Item Name
                      </label>
                      <input
                        type="text"
                        value={customLineName}
                        onChange={(e) => setCustomLineName(e.target.value)}
                        placeholder="e.g. Special Platter"
                        className="w-full h-9 border border-slate-200 rounded-lg px-2.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Unit Price (₦)
                      </label>
                      <input
                        type="number"
                        min={100}
                        step={100}
                        value={customLinePrice}
                        onChange={(e) => setCustomLinePrice(Math.max(0, Number(e.target.value)))}
                        className="w-full h-9 border border-slate-200 rounded-lg px-2.5 font-mono-tabular text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={customLineQty}
                        onChange={(e) => setCustomLineQty(Math.max(1, Number(e.target.value)))}
                        className="w-full h-9 border border-slate-200 rounded-lg px-2.5 font-mono-tabular text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomLine}
                      className="sm:col-span-2 h-9 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN (5/12 on Tablet & Desktop): Current Sale Panel */}
            <div className="md:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs md:sticky md:top-4">
              {/* Dark Blue Header */}
              <div className="bg-[#0a367a] text-white px-5 py-3.5 flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold tracking-tight">Current Sale</h2>
                <span className="font-mono-tabular text-xs font-semibold text-blue-100">
                  #{previewOrderNumber}
                </span>
              </div>

              {/* Linked Room / Walk-in Context Strip */}
              <div className="px-4 py-2.5 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                {selectedInHouseGuest ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <BedDouble className="w-4 h-4 text-[#0a367a] shrink-0" />
                    <span className="font-bold text-slate-900">
                      Room {selectedInHouseGuest.roomNumber}
                    </span>
                    <span className="text-slate-600 truncate">
                      · {selectedInHouseGuest.guestName}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <input
                      type="text"
                      value={tableOrRoom}
                      onChange={(e) => setTableOrRoom(e.target.value)}
                      placeholder="Table 01 / Bar"
                      className="h-8 w-28 border border-slate-200 bg-white rounded-md px-2 text-xs"
                    />
                    <input
                      type="text"
                      value={walkinGuestName}
                      onChange={(e) => setWalkinGuestName(e.target.value)}
                      placeholder="Guest name (optional)"
                      className="h-8 flex-1 border border-slate-200 bg-white rounded-md px-2 text-xs"
                    />
                  </div>
                )}
                <select
                  value={serviceType}
                  onChange={(e) =>
                    setServiceType(e.target.value as PosOrderRecord['serviceType'])
                  }
                  className="h-8 border border-slate-200 bg-white rounded-md px-2 text-[11px] font-semibold text-slate-700"
                >
                  <option value="Dine-In">Dine-In</option>
                  <option value="Room Service">Room Service</option>
                  <option value="Bar Lounge">Bar Lounge</option>
                  <option value="Takeaway">Takeaway</option>
                </select>
              </div>

              {/* Itemized Cart Table */}
              <div className="px-4 pt-3 pb-2">
                <div className="grid grid-cols-12 text-[11px] font-bold text-slate-600 pb-2 border-b border-slate-200">
                  <span className="col-span-4">Item</span>
                  <span className="col-span-3 text-center">Qty</span>
                  <span className="col-span-2 text-right">Unit</span>
                  <span className="col-span-2 text-right">Total</span>
                  <span className="col-span-1" />
                </div>

                {cart.length === 0 ? (
                  <div className="py-10 text-center space-y-1">
                    <p className="text-xs font-semibold text-slate-500">No items in current sale</p>
                    <p className="text-[11px] text-slate-400">
                      Click any product on the left to add it to the order.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
                    {cart.map((line) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-12 items-center py-2.5 text-xs gap-1"
                      >
                        <span className="col-span-4 font-semibold text-slate-900 truncate pr-1">
                          {line.name}
                        </span>
                        <div className="col-span-3 flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQty(line.id, -1)}
                            className="w-6 h-6 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 inline-flex items-center justify-center text-slate-700 cursor-pointer"
                            aria-label={`Decrease ${line.name}`}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-mono-tabular font-bold text-slate-900">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(line.id, 1)}
                            className="w-6 h-6 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 inline-flex items-center justify-center text-slate-700 cursor-pointer"
                            aria-label={`Increase ${line.name}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="col-span-2 text-right font-mono-tabular text-slate-600 text-[11px]">
                          {formatNgn(line.priceNgn)}
                        </span>
                        <span className="col-span-2 text-right font-mono-tabular font-bold text-slate-900 text-[11px]">
                          {formatNgn(line.priceNgn * line.qty)}
                        </span>
                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeCartLine(line.id)}
                            aria-label={`Remove ${line.name}`}
                            className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order Summary (Subtotal, Discount, Service Charge, Tax, Mint Total) */}
              <div className="px-4 py-3 border-t border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Subtotal</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {formatNgn(subtotalNgn)}
                  </span>
                </div>
                {discountNgn > 0 && (
                  <div className="flex items-center justify-between text-rose-700">
                    <span>Discount</span>
                    <span className="font-mono-tabular font-semibold">
                      -{formatNgn(discountNgn)}
                    </span>
                  </div>
                )}
                {serviceChargeRatePct > 0 && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span>Service Charge ({serviceChargeRatePct}%)</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(serviceChargeNgn)}
                    </span>
                  </div>
                )}
                {taxRatePct > 0 && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span>Tax / VAT ({taxRatePct}%)</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {formatNgn(vatNgn)}
                    </span>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 bg-blue-50 border-y border-blue-200 flex items-center justify-between">
                <span className="font-display text-base font-extrabold text-[#0a367a]">Total</span>
                <span className="font-mono-tabular text-xl font-extrabold text-slate-900">
                  {formatNgn(totalNgn)}
                </span>
              </div>

              {/* Payment Method 4-Tile Selector (Card | Cash | Bank Transfer | Room Charge) */}
              <div className="p-4 space-y-3">
                <p className="font-display text-xs font-bold text-slate-900">Payment Method</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'Card POS', label: 'Card', icon: CreditCard },
                      { id: 'Cash NGN', label: 'Cash', icon: Banknote },
                      { id: 'Bank Transfer', label: 'Bank Transfer', icon: Building2 },
                      { id: 'Room Folio', label: 'Room Charge', icon: BedDouble },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const selected = paymentMethod === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(opt.id)}
                        className={`py-2.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#0a367a] border-[#0a367a] text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-[#0a367a]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="leading-tight text-center">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {paymentMethod === 'Room Folio' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-[11px] text-emerald-950 flex items-center justify-between gap-2">
                    {selectedInHouseGuest ? (
                      <>
                        <span>
                          Posting to{' '}
                          <strong>
                            Room {selectedInHouseGuest.roomNumber} ({selectedInHouseGuest.guestName})
                          </strong>
                        </span>
                        <span className="font-mono-tabular font-bold text-[#0a367a]">
                          Active Folio
                        </span>
                      </>
                    ) : (
                      <span className="text-rose-700 font-semibold">
                        Select a checked-in guest in the top Room dropdown to charge to room.
                      </span>
                    )}
                  </div>
                )}

                {orderNotes.trim() && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    <strong>Note:</strong> {orderNotes}
                  </p>
                )}

                {/* Bottom Action Buttons: Print Receipt | Process Payment */}
                <div className="grid grid-cols-12 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handlePreviewOrLastReceipt}
                    className="col-span-5 h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Receipt</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting || cart.length === 0}
                    onClick={handleProcessPayment}
                    className="col-span-7 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{submitting ? 'Processing...' : 'Process Payment'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: ORDERS, KITCHEN DISPLAY (KDS) & F&B PURCHASES                     */}
        {/* ========================================================================= */}
        {posModuleTab === 'orders' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOrdersSubTab('kds')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                    ordersSubTab === 'kds'
                      ? 'bg-[#0a367a] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5" />
                  <span>Orders &amp; KDS ({posOrders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrdersSubTab('purchases')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                    ordersSubTab === 'purchases'
                      ? 'bg-[#0a367a] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>F&amp;B Purchases ({posPurchasesLedger.length})</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPosModuleTab('terminal')}
                className="text-xs font-semibold text-[#0a367a] hover:underline cursor-pointer"
              >
                + New POS Sale
              </button>
            </div>

            {ordersSubTab === 'kds' ? (
              posOrders.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  No POS orders recorded yet. Complete a sale from the POS Terminal to see it here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <th className="py-3 px-3">Order #</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Room / Table</th>
                        <th className="py-3 px-3">Items</th>
                        <th className="py-3 px-3">Payment</th>
                        <th className="py-3 px-3">Kitchen</th>
                        <th className="py-3 px-3 text-right">Total</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {posOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-3 font-mono-tabular font-bold text-slate-900 whitespace-nowrap">
                            #{ord.orderNumber}
                          </td>
                          <td className="py-3 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                            {ord.orderDate}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-slate-900">{ord.tableOrRoom}</p>
                            {ord.guestName && (
                              <p className="text-[11px] text-slate-500">{ord.guestName}</p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-xs">
                            <p className="truncate">{ord.itemsSummary}</p>
                            {ord.notes && (
                              <p className="text-[10px] text-amber-800 truncate">
                                Note: {ord.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                ord.paymentMethod === 'Room Folio' ||
                                ord.paymentStatus === 'room_folio'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {formatPaymentMethodLabel(ord.paymentMethod)}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[11px] font-semibold capitalize ${
                                  ord.kitchenStatus === 'served'
                                    ? 'text-emerald-700'
                                    : ord.kitchenStatus === 'ready'
                                      ? 'text-blue-700'
                                      : 'text-amber-700'
                                }`}
                              >
                                {ord.kitchenStatus}
                              </span>
                              {ord.kitchenStatus !== 'served' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const nextStatus: PosOrderRecord['kitchenStatus'] =
                                      ord.kitchenStatus === 'queued'
                                        ? 'preparing'
                                        : ord.kitchenStatus === 'preparing'
                                          ? 'ready'
                                          : 'served';
                                    await advanceKitchenOrder({
                                      property,
                                      order: ord,
                                      nextKitchenStatus: nextStatus,
                                    });
                                    onNotify(
                                      `Updated #${ord.orderNumber} kitchen status to ${nextStatus}`
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-700 cursor-pointer"
                                >
                                  Advance
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono-tabular font-bold text-slate-900 whitespace-nowrap">
                            {formatNgn(ord.totalNgn)}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openOrderDocumentModal(ord, 'receipt')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Receipt</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openOrderDocumentModal(ord, 'invoice')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[#0a367a] font-semibold cursor-pointer"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Invoice</span>
                              </button>
                              {canManageMenu && (
                                <button
                                  type="button"
                                  onClick={() => openEditOrderModal(ord)}
                                  title="Edit order & transaction details (Property Admin)"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-[#0a367a] text-slate-700 hover:text-[#0a367a] font-semibold cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : posPurchasesLedger.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                No kitchen or bar supply purchases recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Ref</th>
                      <th className="py-3 px-3">Description</th>
                      <th className="py-3 px-3">Method</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                      <th className="py-3 px-3 text-right">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {posPurchasesLedger.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-mono-tabular text-slate-600">
                          {entry.entryDate}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular font-semibold text-slate-800">
                          {entry.reference}
                        </td>
                        <td className="py-3 px-3 text-slate-800">{entry.description}</td>
                        <td className="py-3 px-3 text-slate-600">{entry.paymentMethod}</td>
                        <td className="py-3 px-3 text-right font-mono-tabular font-bold text-rose-700">
                          {formatNgn(entry.amountNgn)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setPurchaseInvoice({
                                invoiceNumber: entry.reference || entry.id,
                                date: entry.entryDate,
                                title: 'Purchase Invoice',
                                subtitle: 'Recorded F&B purchase invoice',
                                partyLabel: 'Category',
                                partyName: entry.category,
                                category: entry.category,
                                paymentMethod: entry.paymentMethod,
                                status: 'Paid',
                                items: [
                                  {
                                    description: entry.description,
                                    quantity: 1,
                                    unitCostNgn: entry.amountNgn,
                                    totalNgn: entry.amountNgn,
                                  },
                                ],
                                subtotalNgn: entry.amountNgn,
                                vatNgn: 0,
                                totalNgn: entry.amountNgn,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print Invoice</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: POS DASHBOARD & IN-HOUSE GUEST ROOM BILLING                       */}
        {/* ========================================================================= */}
        {posModuleTab === 'dashboard' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Today&apos;s POS Sales
                </p>
                <p className="font-mono-tabular text-2xl font-bold text-[#0a367a]">
                  {formatNgn(posDashboardMetrics.todayRevenue)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {posDashboardMetrics.todayOrdersCount} order
                  {posDashboardMetrics.todayOrdersCount === 1 ? '' : 's'} today
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Charged to Guest Rooms
                </p>
                <p className="font-mono-tabular text-2xl font-bold text-[#1c46be]">
                  {formatNgn(posDashboardMetrics.billedToRoomsTotal)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {inHouseGuests.length} in-house guest{inHouseGuests.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Direct Settlements
                </p>
                <p className="font-mono-tabular text-2xl font-bold text-slate-900">
                  {formatNgn(posDashboardMetrics.directPaidTotal)}
                </p>
                <p className="text-[11px] text-slate-500 font-mono-tabular">
                  Card {formatNgn(posDashboardMetrics.cardTotal)} · Cash{' '}
                  {formatNgn(posDashboardMetrics.cashTotal)}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Average Ticket
                </p>
                <p className="font-mono-tabular text-2xl font-bold text-slate-900">
                  {formatNgn(posDashboardMetrics.avgTicketNgn)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {posOrders.length} orders · {effectiveMenu.length} products
                </p>
              </div>
            </div>

            {/* In-House Guests Table for 1-Click Room Charging */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-[#0a367a]" />
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Current In-House Guests (Bill to Room)
                  </h2>
                </div>
                <span className="font-mono-tabular text-xs font-semibold text-[#0a367a]">
                  {inHouseGuests.length} checked-in
                </span>
              </div>
              {inHouseGuests.length === 0 ? (
                <p className="text-xs text-slate-500 p-6 text-center">
                  No guests are currently checked in. Checked-in guests appear here automatically
                  for Room Charge billing.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <th className="py-3 px-4">Room</th>
                        <th className="py-3 px-4">Guest Name</th>
                        <th className="py-3 px-4">Reservation Ref</th>
                        <th className="py-3 px-4">Stay Dates</th>
                        <th className="py-3 px-4 text-right">POS Room Charges</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inHouseGuests.map((guestRes) => (
                        <tr key={guestRes.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            Room {guestRes.roomNumber}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">
                            {guestRes.guestName}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600">
                            {guestRes.bookingRef}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600">
                            {guestRes.checkInDate} → {guestRes.checkOutDate}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#1c46be]">
                            {formatNgn(guestRes.posChargesNgn || 0)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleSelectInHouseGuestForBilling(guestRes)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Charge to Room</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: PRINT RECEIPT (80MM) & PRINT INVOICE (A4) + PDF DOWNLOAD           */}
      {/* ========================================================================= */}
      {printDoc && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
            <div className="bg-[#0a367a] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-200" />
                <div>
                  <h3 className="font-display text-sm font-bold">
                    {printDoc.isPreview ? 'Sale Preview' : 'Transaction Completed'} · #
                    {printDoc.orderNumber}
                  </h3>
                  <p className="text-[11px] text-emerald-100">
                    Print formatted receipt or tax invoice, or download as PDF
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrintDoc(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Format Switcher + Action Buttons */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setPrintFormat('receipt')}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                    printFormat === 'receipt'
                      ? 'bg-[#0a367a] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Thermal Receipt (80mm)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintFormat('invoice')}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                    printFormat === 'invoice'
                      ? 'bg-[#0a367a] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Formal Invoice (A4)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerBrowserPrint}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-semibold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{printFormat === 'receipt' ? 'Print Receipt' : 'Print Invoice'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(printDoc, printFormat)}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto bg-slate-100/70">
              {renderPrintableDocument(printDoc, printFormat)}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Print Portal rendered directly under <body> for clean window.print() */}
      {printDoc &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="pos-print-portal">{renderPrintableDocument(printDoc, printFormat)}</div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* PROPERTY ADMIN MODAL: ADD / EDIT / DELETE POS PRODUCT                     */}
      {/* ========================================================================= */}
      {menuModalOpen && canManageMenu && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMenuItem}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden text-xs"
          >
            <div className="bg-[#0a367a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                {editingMenuItem ? 'Edit POS Product' : 'Add POS Product'}
              </h3>
              <button
                type="button"
                onClick={() => setMenuModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  placeholder="e.g. Grilled Chicken"
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:border-[#0a367a]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">POS Section</label>
                  <select
                    value={menuSection}
                    onChange={(e) => setMenuSection(e.target.value as PosSection)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                  >
                    {POS_SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={menuCategory}
                    onChange={(e) => setMenuCategory(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                  >
                    {productCategoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Price (₦) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={menuPrice}
                    onChange={(e) => setMenuPrice(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cost (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={menuCost}
                    onChange={(e) => setMenuCost(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prep (mins)</label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={menuPrep}
                    onChange={(e) => setMenuPrep(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={menuAvailable}
                  onChange={(e) => setMenuAvailable(e.target.checked)}
                  className="rounded border-slate-300 text-[#0a367a]"
                />
                <span>Available for sale on POS</span>
              </label>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {editingMenuItem ? (
                  <button
                    type="button"
                    disabled={savingMenu}
                    onClick={handleDeleteMenuItem}
                    className="h-9 px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer"
                  >
                    Delete Product
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMenuModalOpen(false)}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingMenu}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingMenu ? 'Saving...' : 'Save Product'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PROPERTY ADMIN MODAL: EDIT POS ORDER & TRANSACTION DETAILS                */}
      {/* ========================================================================= */}
      {editingOrder && canManageMenu && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveOrderEdit}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden text-xs"
          >
            <div className="bg-[#0a367a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">
                Edit Transaction · #{editingOrder.orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-semibold text-slate-500">Order Items</p>
                <p className="text-slate-900 font-medium mt-0.5">{editingOrder.itemsSummary}</p>
                <p className="text-[11px] font-mono-tabular text-slate-600 mt-1">
                  Subtotal: {formatNgn(editingOrder.subtotalNgn)} · Recorded Total:{' '}
                  <strong>{formatNgn(editingOrder.totalNgn)}</strong>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Room / Table</label>
                  <input
                    type="text"
                    required
                    value={editOrdTableOrRoom}
                    onChange={(e) => setEditOrdTableOrRoom(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guest Name</label>
                  <input
                    type="text"
                    value={editOrdGuestName}
                    onChange={(e) => setEditOrdGuestName(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={editOrdPaymentMethod}
                    onChange={(e) =>
                      setEditOrdPaymentMethod(e.target.value as PosOrderRecord['paymentMethod'])
                    }
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                  >
                    <option value="Card POS">Card</option>
                    <option value="Cash NGN">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Room Folio">Room Charge</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Status</label>
                  <select
                    value={editOrdPaymentStatus}
                    onChange={(e) =>
                      setEditOrdPaymentStatus(e.target.value as PosOrderRecord['paymentStatus'])
                    }
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                  >
                    <option value="paid">Paid</option>
                    <option value="room_folio">Charged to Room Folio</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kitchen Status</label>
                  <select
                    value={editOrdKitchenStatus}
                    onChange={(e) =>
                      setEditOrdKitchenStatus(e.target.value as PosOrderRecord['kitchenStatus'])
                    }
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                  >
                    <option value="queued">Queued</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="served">Served</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discount (₦)</label>
                  <input
                    type="number"
                    min={0}
                    max={editingOrder.subtotalNgn}
                    value={editOrdDiscountNgn}
                    onChange={(e) => setEditOrdDiscountNgn(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Service Charge (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editOrdServiceChargeNgn}
                    onChange={(e) =>
                      setEditOrdServiceChargeNgn(Math.max(0, Number(e.target.value)))
                    }
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax / VAT (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={editOrdVatNgn}
                    onChange={(e) => setEditOrdVatNgn(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Order / Adjustment Notes
                </label>
                <input
                  type="text"
                  value={editOrdNotes}
                  onChange={(e) => setEditOrdNotes(e.target.value)}
                  placeholder="Reason for adjustment or kitchen note..."
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                />
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between font-bold text-[#0a367a]">
                <span>Updated Order Total</span>
                <span className="font-mono-tabular text-sm">
                  {formatNgn(
                    Math.max(0, editingOrder.subtotalNgn - editOrdDiscountNgn) +
                      editOrdServiceChargeNgn +
                      editOrdVatNgn
                  )}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOrderEdit}
                  className="h-9 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {savingOrderEdit ? 'Saving...' : 'Save Order Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PROPERTY ADMIN MODAL: PROPERTY-SPECIFIC POS SETTINGS                      */}
      {/* ========================================================================= */}
      {settingsModalOpen && canManageMenu && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePosSettings}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden text-xs"
          >
            <div className="bg-[#0a367a] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-200" />
                <h3 className="font-display text-sm font-bold">
                  POS Settings · {property.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Service Charge (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={setServiceRate}
                    onChange={(e) => setSetServiceRate(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tax / VAT (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={setTaxRate}
                    onChange={(e) => setSetTaxRate(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Receipt Header Note
                </label>
                <input
                  type="text"
                  value={setReceiptHeader}
                  onChange={(e) => setSetReceiptHeader(e.target.value)}
                  placeholder="e.g. Restaurant & Lounge · Open 7AM - 11PM"
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Receipt &amp; Invoice Footer Message
                </label>
                <textarea
                  rows={2}
                  value={setReceiptFooter}
                  onChange={(e) => setSetReceiptFooter(e.target.value)}
                  placeholder="Thank you for dining with us..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Custom POS Categories (comma separated)
                </label>
                <input
                  type="text"
                  value={setCustomCategoriesText}
                  onChange={(e) => setSetCustomCategoriesText(e.target.value)}
                  placeholder="e.g. Grill, Cocktails, Desserts, Wine"
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="h-9 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save POS Settings'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECORD POS PURCHASE EXPENSE                                        */}
      {/* ========================================================================= */}
      {purchaseModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordPurchase}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden text-xs"
          >
            <div className="bg-[#0a367a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Record F&amp;B Purchase</h3>
              <button
                type="button"
                onClick={() => setPurchaseModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  required
                  value={purItemDesc}
                  onChange={(e) => setPurItemDesc(e.target.value)}
                  placeholder="e.g. Fresh Chicken & Produce"
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier *</label>
                  <input
                    type="text"
                    required
                    value={purSupplier}
                    onChange={(e) => setPurSupplier(e.target.value)}
                    placeholder="Vendor name"
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={purCategory}
                    onChange={(e) =>
                      setPurCategory(e.target.value as 'Restaurant & Bar' | 'Procurement')
                    }
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-xs"
                  >
                    <option value="Restaurant & Bar">Restaurant &amp; Bar</option>
                    <option value="Procurement">Procurement</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (₦) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={purAmount}
                    onChange={(e) => setPurAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 font-mono-tabular text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Method</label>
                  <select
                    value={purMethod}
                    onChange={(e) => setPurMethod(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-2 bg-white text-xs"
                  >
                    <option value="Cash NGN">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card POS">Card</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={purDate}
                    onChange={(e) => setPurDate(e.target.value)}
                    className="w-full h-10 border border-slate-200 rounded-lg px-2 font-mono-tabular text-xs"
                  />
                </div>
              </div>

              {inventoryItems.length > 0 && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Restock Store Inventory (Optional)
                    </label>
                    <select
                      value={purInvId}
                      onChange={(e) => setPurInvId(e.target.value)}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2 bg-white text-xs"
                    >
                      <option value="">No inventory link</option>
                      {inventoryItems.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({inv.quantityOnHand} {inv.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Qty</label>
                    <input
                      type="number"
                      min={0}
                      disabled={!purInvId}
                      value={purRestockQty}
                      onChange={(e) => setPurRestockQty(Math.max(0, Number(e.target.value)))}
                      className="w-full h-10 border border-slate-200 rounded-lg px-2 font-mono-tabular text-xs disabled:bg-slate-100"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPurchaseModalOpen(false)}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPurchase}
                  className="h-9 px-4 rounded-lg bg-[#0a367a] hover:bg-[#07275a] text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {savingPurchase ? 'Recording...' : 'Record & Print Invoice'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {purchaseInvoice && (
        <PurchaseInvoiceModal
          property={property}
          invoice={purchaseInvoice}
          onClose={() => setPurchaseInvoice(null)}
          onNotify={onNotify}
        />
      )}
    </>
  );
};
