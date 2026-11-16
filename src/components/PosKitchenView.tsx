import React, { useMemo, useState } from 'react';
import {
  Check,
  ChefHat,
  Download,
  Minus,
  Pencil,
  Plus,
  Printer,
  Receipt,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import {
  advanceKitchenOrder,
  createPosMenuItemWorkflow,
  deletePosMenuItemWorkflow,
  recordPosPurchaseWorkflow,
  submitPosOrderWorkflow,
  updatePosMenuItemWorkflow,
} from '../services/pmsService';
import {
  formatNgn,
  InventoryItemRecord,
  LedgerEntryRecord,
  POS_DEFAULT_CATEGORIES,
  POS_MENU_ITEMS,
  PosMenuItem,
  PosMenuItemRecord,
  PosOrderRecord,
  PropertyRecord,
  ReservationRecord,
  RICHGATES_PROPERTY_INFO,
} from '../types/pms';
import { useCms } from '../context/CmsContext';

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

function formatReceiptPdfNgn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-US')}`;
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

  // Live menu items from Firestore (falls back cleanly while loading if empty)
  const effectiveMenu: PosMenuItemRecord[] = useMemo(() => {
    if (posMenuItems.length > 0) {
      return [...posMenuItems].sort((a, b) => a.name.localeCompare(b.name));
    }
    return POS_MENU_ITEMS.map((m) => ({
      ...m,
      available: m.available ?? true,
      propertyId: property.id,
      authorizedEmails: property.authorizedEmails,
      ownerUid: property.ownerUid,
    }));
  }, [posMenuItems, property.id, property.authorizedEmails, property.ownerUid]);

  const categories = useMemo(() => {
    const present = Array.from(new Set(effectiveMenu.map((m) => m.category))).filter(Boolean);
    return ['All', ...present];
  }, [effectiveMenu]);

  // Cart & Order Builder state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchMenu, setSearchMenu] = useState('');
  const [chargeTarget, setChargeTarget] = useState<'walkin' | string>('walkin');
  const [serviceType, setServiceType] = useState<PosOrderRecord['serviceType']>('Dine-In');
  const [tableOrRoom, setTableOrRoom] = useState('Table 01');
  const [guestName, setGuestName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<PosOrderRecord['paymentMethod']>('Cash NGN');
  const [submitting, setSubmitting] = useState(false);

  // Quick custom / misc item line
  const [showCustomLine, setShowCustomLine] = useState(false);
  const [customLineName, setCustomLineName] = useState('');
  const [customLinePrice, setCustomLinePrice] = useState(2500);
  const [customLineQty, setCustomLineQty] = useState(1);

  // Add / Edit Menu Item modal state (Property Admin & PCH Super Admin)
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<PosMenuItemRecord | null>(null);
  const [menuName, setMenuName] = useState('');
  const [menuCategory, setMenuCategory] = useState<string>('Nigerian Kitchen');
  const [menuPrice, setMenuPrice] = useState(5000);
  const [menuCost, setMenuCost] = useState(2500);
  const [menuPrep, setMenuPrep] = useState(15);
  const [menuAvailable, setMenuAvailable] = useState(true);
  const [savingMenu, setSavingMenu] = useState(false);

  // Record POS Purchase Expense modal state
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purItemDesc, setPurItemDesc] = useState('');
  const [purSupplier, setPurSupplier] = useState('');
  const [purCategory, setPurCategory] = useState<'Restaurant & Bar' | 'Procurement'>('Restaurant & Bar');
  const [purAmount, setPurAmount] = useState(15000);
  const [purMethod, setPurMethod] = useState('Cash NGN');
  const [purDate, setPurDate] = useState(new Date().toISOString().slice(0, 10));
  const [purInvId, setPurInvId] = useState('');
  const [purRestockQty, setPurRestockQty] = useState(0);
  const [savingPurchase, setSavingPurchase] = useState(false);

  // Receipt printing modal state
  const [receiptOrder, setReceiptOrder] = useState<PosOrderRecord | null>(null);

  // View toggle between Menu + KDS and Purchases Log
  const [activeSubTab, setActiveSubTab] = useState<'kds' | 'purchases'>('kds');

  const inHouseGuests = useMemo(
    () => reservations.filter((r) => r.status === 'checked_in'),
    [reservations]
  );

  const visibleMenu = useMemo(() => {
    const q = searchMenu.trim().toLowerCase();
    return effectiveMenu.filter((m) => {
      if (categoryFilter !== 'All' && m.category !== categoryFilter) return false;
      if (!canManageMenu && m.available === false) return false;
      if (q && !m.name.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [effectiveMenu, categoryFilter, searchMenu, canManageMenu]);

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

  const addToCart = (item: PosMenuItem) => {
    if (item.available === false) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { id: item.id, name: item.name, priceNgn: item.priceNgn, qty: 1 }];
    });
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

  const updateQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === lineId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
    setOrderNotes('');
  };

  const subtotalNgn = cart.reduce((sum, c) => sum + c.priceNgn * c.qty, 0);
  const vatNgn = Math.round(subtotalNgn * 0.075);
  const totalNgn = subtotalNgn + vatNgn;
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const handleChargeTargetChange = (val: string) => {
    setChargeTarget(val);
    if (val === 'walkin') {
      if (paymentMethod === 'Room Folio') setPaymentMethod('Cash NGN');
    } else {
      setPaymentMethod('Room Folio');
      setServiceType('Room Service');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const linkedRes =
      chargeTarget !== 'walkin'
        ? inHouseGuests.find((r) => r.id === chargeTarget)
        : paymentMethod === 'Room Folio'
          ? inHouseGuests[0]
          : undefined;

    const effectiveMethod: PosOrderRecord['paymentMethod'] = linkedRes
      ? 'Room Folio'
      : paymentMethod === 'Room Folio'
        ? 'Cash NGN'
        : paymentMethod;

    const targetLabel = linkedRes
      ? `Room ${linkedRes.roomNumber} (${linkedRes.guestName})`
      : tableOrRoom.trim() || 'Walk-in';

    const itemsSummary = cart.map((c) => `${c.qty}x ${c.name}`).join(', ');

    setSubmitting(true);
    try {
      const created = await submitPosOrderWorkflow({
        property,
        serviceType,
        tableOrRoom: targetLabel,
        guestName: guestName.trim() || linkedRes?.guestName || 'Walk-in Guest',
        notes: orderNotes.trim(),
        linkedReservation: linkedRes,
        itemsSummary,
        itemCount,
        subtotalNgn,
        paymentMethod: effectiveMethod,
        actorRole,
      });

      onNotify(
        linkedRes
          ? `Charged ${formatNgn(totalNgn)} to Room ${linkedRes.roomNumber} Folio & sent to Kitchen`
          : `Settled ${formatNgn(totalNgn)} (${effectiveMethod}) & placed order`
      );
      setCart([]);
      setOrderNotes('');
      if (created) {
        setReceiptOrder(created);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openAddMenuModal = () => {
    setEditingMenuItem(null);
    setMenuName('');
    setMenuCategory('Nigerian Kitchen');
    setMenuPrice(5000);
    setMenuCost(2500);
    setMenuPrep(15);
    setMenuAvailable(true);
    setMenuModalOpen(true);
  };

  const openEditMenuModal = (item: PosMenuItemRecord) => {
    setEditingMenuItem(item);
    setMenuName(item.name);
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
            category: menuCategory,
            priceNgn: menuPrice,
            costNgn: menuCost,
            prepMinutes: menuPrep,
            available: menuAvailable,
          },
          actorRole,
        });
        onNotify(`Updated menu item: ${menuName.trim()}`);
      } else {
        await createPosMenuItemWorkflow({
          property,
          name: menuName,
          category: menuCategory,
          priceNgn: menuPrice,
          costNgn: menuCost,
          prepMinutes: menuPrep,
          available: menuAvailable,
          actorRole,
        });
        onNotify(`Added menu item: ${menuName.trim()}`);
      }
      setMenuModalOpen(false);
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
      onNotify(`Removed menu item: ${editingMenuItem.name}`);
      setMenuModalOpen(false);
    } finally {
      setSavingMenu(false);
    }
  };

  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purItemDesc.trim() || !purSupplier.trim() || purAmount <= 0) return;
    setSavingPurchase(true);
    try {
      const linkedInv = purInvId ? inventoryItems.find((i) => i.id === purInvId) : undefined;
      await recordPosPurchaseWorkflow({
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
      setPurItemDesc('');
      setPurSupplier('');
      setPurAmount(15000);
      setPurInvId('');
      setPurRestockQty(0);
    } finally {
      setSavingPurchase(false);
    }
  };

  const handleDownloadReceiptPdf = (ord: PosOrderRecord) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 175] });
    const propAddress = property.address || RICHGATES_PROPERTY_INFO.address;
    const propPhone = property.phone || RICHGATES_PROPERTY_INFO.phone;
    const propEmail = property.email || RICHGATES_PROPERTY_INFO.email;
    const dateStr = ord.orderDate || new Date().toISOString().slice(0, 10);

    let y = 10;
    if (property.logoUrl && property.logoUrl.startsWith('data:image/')) {
      try {
        const format = property.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(property.logoUrl, format, 32, y, 16, 12);
        y += 15;
      } catch {
        // ignore logo errors
      }
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(property.name, 40, y, { align: 'center', maxWidth: 72 });
    y += 5;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    const addrLines = doc.splitTextToSize(propAddress, 70);
    doc.text(addrLines, 40, y, { align: 'center' });
    y += addrLines.length * 3.2 + 1;
    doc.text(`${propPhone} | ${propEmail}`, 40, y, { align: 'center', maxWidth: 72 });
    y += 4;

    doc.line(5, y, 75, y);
    y += 4;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`POS RECEIPT: ${ord.orderNumber}`, 5, y);
    y += 4.5;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${dateStr}`, 5, y);
    y += 4;
    doc.text(`Service: ${ord.serviceType}`, 5, y);
    y += 4;
    doc.text(`Target: ${ord.tableOrRoom}`, 5, y, { maxWidth: 70 });
    y += 4;
    if (ord.guestName) {
      doc.text(`Guest: ${ord.guestName}`, 5, y, { maxWidth: 70 });
      y += 4;
    }

    doc.line(5, y, 75, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text(`Items (${ord.itemCount})`, 5, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    const itemLines = doc.splitTextToSize(ord.itemsSummary, 70);
    doc.text(itemLines, 5, y);
    y += itemLines.length * 3.8 + 3;

    doc.line(5, y, 75, y);
    y += 4.5;

    doc.text('Subtotal:', 5, y);
    doc.text(formatReceiptPdfNgn(ord.subtotalNgn), 75, y, { align: 'right' });
    y += 4;
    doc.text('VAT (7.5%):', 5, y);
    doc.text(formatReceiptPdfNgn(ord.vatNgn), 75, y, { align: 'right' });
    y += 5;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 5, y);
    doc.text(formatReceiptPdfNgn(ord.totalNgn), 75, y, { align: 'right' });
    y += 5.5;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Payment Method: ${ord.paymentMethod}`, 5, y);
    y += 4;
    doc.text(
      `Status: ${ord.paymentStatus === 'room_folio' ? 'Posted to Room Folio' : ord.paymentStatus.toUpperCase()}`,
      5,
      y
    );
    y += 6;

    doc.setFontSize(7.5);
    const footerLines = doc.splitTextToSize(
      cms.brand.folioFooterNote || 'Thank you for dining with Richgates Apartments, Enugu.',
      70
    );
    doc.text(footerLines, 40, y, { align: 'center' });

    doc.save(`${ord.orderNumber}-receipt.pdf`);
    onNotify(`Downloaded receipt ${ord.orderNumber}-receipt.pdf`);
  };

  return (
    <>
      <div className="no-print space-y-6">
        {/* Clean Header Row (Inspired by IMG_2077.png) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {cms.pages.pos_kitchen.title || 'Point of Sale'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {cms.pages.pos_kitchen.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPurchaseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-700" />
              <span>+ Record Purchase</span>
            </button>
            {canManageMenu && (
              <button
                type="button"
                onClick={openAddMenuModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:border-blue-600 hover:text-blue-700 text-slate-900 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Menu Item</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Two-Column POS Layout: Left Menu + History (7 cols), Right Order Ticket (5 cols) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Category Tabs, Search & Interactive Menu Grid */}
          <div className="xl:col-span-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-[#1c46be] text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={searchMenu}
                onChange={(e) => setSearchMenu(e.target.value)}
                placeholder="Search menu..."
                className="border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs w-full sm:w-48 focus:outline-none focus:border-blue-600"
              />
            </div>

            {visibleMenu.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                No POS items match your filter. {canManageMenu ? 'Click "+ Menu Item" to add a dish or drink.' : ''}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleMenu.map((item) => {
                  const isDisabled = item.available === false;
                  return (
                    <div
                      key={item.id}
                      onClick={() => !isDisabled && addToCart(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
                          e.preventDefault();
                          addToCart(item);
                        }
                      }}
                      className={`group relative text-left p-4 bg-white border rounded-xl transition-colors flex flex-col justify-between gap-2.5 ${
                        isDisabled
                          ? 'border-slate-200 opacity-55 cursor-not-allowed'
                          : 'border-slate-200 hover:border-[#1c46be] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display text-sm font-semibold text-slate-900 leading-snug">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.category}</p>
                        </div>
                        {canManageMenu && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMenuModal(item);
                            }}
                            title={`Edit ${item.name}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1c46be] hover:bg-blue-50 transition-colors shrink-0 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="font-mono-tabular font-bold text-[#1c46be]">
                          {formatNgn(item.priceNgn)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {isDisabled ? 'Unavailable' : `${item.prepMinutes} mins`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* KDS Queue + Purchases Log */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('kds')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeSubTab === 'kds'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>Orders &amp; KDS ({posOrders.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('purchases')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeSubTab === 'purchases'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>F&amp;B Purchases ({posPurchasesLedger.length})</span>
                  </button>
                </div>

                {activeSubTab === 'kds' && (
                  <span className="font-mono-tabular text-xs text-slate-500">
                    {posOrders.filter((o) => o.kitchenStatus !== 'served').length} active in kitchen
                  </span>
                )}
              </div>

              {activeSubTab === 'kds' ? (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {posOrders.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No POS orders recorded yet.
                    </p>
                  ) : (
                    posOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-mono-tabular font-bold text-slate-900">
                            {ord.orderNumber} · {ord.serviceType}
                            {ord.orderDate ? ` · ${ord.orderDate}` : ''}
                          </span>
                          <span
                            className={`font-semibold capitalize ${
                              ord.kitchenStatus === 'queued'
                                ? 'text-amber-700'
                                : ord.kitchenStatus === 'preparing'
                                  ? 'text-blue-700'
                                  : ord.kitchenStatus === 'ready'
                                    ? 'text-emerald-700'
                                    : 'text-slate-500'
                            }`}
                          >
                            {ord.kitchenStatus}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-900">
                          {ord.tableOrRoom}
                          {ord.guestName && !ord.tableOrRoom.includes(ord.guestName)
                            ? ` · ${ord.guestName}`
                            : ''}
                        </p>
                        <p className="text-xs text-slate-600">{ord.itemsSummary}</p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 text-xs">
                          <span className="font-mono-tabular font-semibold text-slate-900">
                            {formatNgn(ord.totalNgn)} · {ord.paymentMethod}
                          </span>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setReceiptOrder(ord)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded font-medium cursor-pointer"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Receipt</span>
                            </button>
                            {ord.kitchenStatus === 'queued' && (
                              <button
                                type="button"
                                onClick={() =>
                                  advanceKitchenOrder({
                                    property,
                                    order: ord,
                                    nextKitchenStatus: 'preparing',
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium cursor-pointer"
                              >
                                Start Prep
                              </button>
                            )}
                            {ord.kitchenStatus === 'preparing' && (
                              <button
                                type="button"
                                onClick={() =>
                                  advanceKitchenOrder({
                                    property,
                                    order: ord,
                                    nextKitchenStatus: 'ready',
                                  })
                                }
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium cursor-pointer"
                              >
                                Mark Ready
                              </button>
                            )}
                            {ord.kitchenStatus === 'ready' && (
                              <button
                                type="button"
                                onClick={() =>
                                  advanceKitchenOrder({
                                    property,
                                    order: ord,
                                    nextKitchenStatus: 'served',
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-700 text-white rounded font-medium cursor-pointer"
                              >
                                Served
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {posPurchasesLedger.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No POS or kitchen purchases logged yet. Click &ldquo;+ Record Purchase&rdquo; to log supplies.
                    </p>
                  ) : (
                    posPurchasesLedger.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {entry.description}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                            {entry.entryDate} · {entry.category} · {entry.paymentMethod}
                            {entry.reference ? ` · ${entry.reference}` : ''}
                          </p>
                        </div>
                        <span className="font-mono-tabular font-bold text-rose-700 shrink-0">
                          -{formatNgn(entry.amountNgn)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sticky Order Card (Inspired by IMG_2077.png) */}
          <form
            onSubmit={handlePlaceOrder}
            className="xl:col-span-5 xl:sticky xl:top-20 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#1c46be]" />
                <h2 className="font-display text-base font-bold text-slate-900">Order</h2>
              </div>
              <span className="font-mono-tabular text-xs text-slate-500">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Charge to</label>
                <select
                  value={chargeTarget}
                  onChange={(e) => handleChargeTargetChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium text-slate-900"
                >
                  <option value="walkin">Walk-in / Direct Settlement</option>
                  {inHouseGuests.map((res) => (
                    <option key={res.id} value={res.id}>
                      Rm {res.roomNumber} · {res.guestName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(e) =>
                      setServiceType(e.target.value as PosOrderRecord['serviceType'])
                    }
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                  >
                    <option value="Dine-In">Dine-In</option>
                    <option value="Room Service">Room Service</option>
                    <option value="Bar Lounge">Bar Lounge</option>
                    <option value="Takeaway">Takeaway</option>
                  </select>
                </div>
                {chargeTarget === 'walkin' ? (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Table / Ref</label>
                    <input
                      type="text"
                      value={tableOrRoom}
                      onChange={(e) => setTableOrRoom(e.target.value)}
                      placeholder="Table 01"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Guest Name</label>
                    <input
                      type="text"
                      value={
                        guestName ||
                        inHouseGuests.find((r) => r.id === chargeTarget)?.guestName ||
                        ''
                      }
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                )}
              </div>

              {chargeTarget === 'walkin' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Guest Name (Optional for Receipt)
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Walk-in Guest"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5"
                  />
                </div>
              )}
            </div>

            {/* Cart Items List */}
            <div className="border-t border-b border-slate-100 py-3 space-y-2 max-h-[240px] overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Tap menu items on the left or add a custom item below.
                </p>
              ) : (
                cart.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 text-xs py-1"
                  >
                    <span className="font-medium text-slate-900 truncate flex-1">{c.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(c.id, -1)}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono-tabular w-5 text-center">{c.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(c.id, 1)}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="font-mono-tabular font-semibold text-slate-900 w-20 text-right">
                        {formatNgn(c.priceNgn * c.qty)}
                      </span>
                    </div>
                  </div>
                ))
              )}

              {/* Quick Custom Line Input */}
              {showCustomLine ? (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <input
                    type="text"
                    value={customLineName}
                    onChange={(e) => setCustomLineName(e.target.value)}
                    placeholder="Custom item or drink name..."
                    className="w-full border border-slate-200 rounded px-2.5 py-1.5 bg-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={1}
                      value={customLineQty}
                      onChange={(e) => setCustomLineQty(Number(e.target.value) || 1)}
                      placeholder="Qty"
                      className="border border-slate-200 rounded px-2 py-1 bg-white font-mono-tabular"
                    />
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={customLinePrice}
                      onChange={(e) => setCustomLinePrice(Number(e.target.value) || 0)}
                      placeholder="Price ₦"
                      className="col-span-2 border border-slate-200 rounded px-2 py-1 bg-white font-mono-tabular"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomLine(false)}
                      className="px-2 py-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCustomLine}
                      className="px-2.5 py-1 bg-slate-900 text-white rounded font-semibold cursor-pointer"
                    >
                      Add Line
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomLine(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1c46be] hover:underline cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Custom / Ad-hoc Item</span>
                </button>
              )}
            </div>

            {/* Totals Breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono-tabular">{formatNgn(subtotalNgn)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Tax (VAT 7.5%)</span>
                <span className="font-mono-tabular">{formatNgn(vatNgn)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="font-display text-sm font-bold text-slate-900">Total</span>
                <span className="font-mono-tabular text-lg font-bold text-[#1c46be]">
                  {formatNgn(totalNgn)}
                </span>
              </div>
            </div>

            {/* Payment Method + Place / Clear Buttons (Matches IMG_2077.png) */}
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as PosOrderRecord['paymentMethod'])
                  }
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-medium bg-white"
                >
                  <option value="Cash NGN">Cash NGN</option>
                  <option value="Card POS">Card POS</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Room Folio" disabled={inHouseGuests.length === 0}>
                    Room Folio
                  </option>
                </select>

                <button
                  type="submit"
                  disabled={cart.length === 0 || submitting}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Placing...' : 'Place'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={clearCart}
                disabled={cart.length === 0}
                className="w-full py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        {/* Add / Edit POS Menu Item Modal */}
        {menuModalOpen && canManageMenu && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveMenuItem}
              className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-display text-base font-bold text-slate-900">
                  {editingMenuItem ? 'Edit POS Menu Item' : 'Add POS Menu Item'}
                </h3>
                <button
                  type="button"
                  onClick={() => setMenuModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Item Name</label>
                  <input
                    required
                    type="text"
                    value={menuName}
                    onChange={(e) => setMenuName(e.target.value)}
                    placeholder="e.g., Bottled Water, Grilled Catfish & Chips"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <input
                    required
                    type="text"
                    list="pos-cat-options"
                    value={menuCategory}
                    onChange={(e) => setMenuCategory(e.target.value)}
                    placeholder="e.g., Beverage, Food, Nigerian Kitchen"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                  <datalist id="pos-cat-options">
                    {POS_DEFAULT_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Price (₦)</label>
                    <input
                      required
                      type="number"
                      min={0}
                      step={50}
                      value={menuPrice}
                      onChange={(e) => setMenuPrice(Number(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Unit Cost (₦)</label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={menuCost}
                      onChange={(e) => setMenuCost(Number(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Prep (mins)</label>
                    <input
                      required
                      type="number"
                      min={0}
                      max={240}
                      value={menuPrep}
                      onChange={(e) => setMenuPrep(Number(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={menuAvailable}
                    onChange={(e) => setMenuAvailable(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span className="font-medium text-slate-800">
                    Item is currently available for sale
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                {editingMenuItem && posMenuItems.some((m) => m.id === editingMenuItem.id) ? (
                  <button
                    type="button"
                    disabled={savingMenu}
                    onClick={handleDeleteMenuItem}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMenuModalOpen(false)}
                    className="px-3.5 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingMenu}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1c46be] hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    <span>{savingMenu ? 'Saving...' : editingMenuItem ? 'Save Changes' : 'Add Item'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Record POS / Kitchen Purchase Input Modal */}
        {purchaseModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
            <form
              onSubmit={handleRecordPurchase}
              className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Record POS / Kitchen Purchase
                </h3>
                <button
                  type="button"
                  onClick={() => setPurchaseModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Purchase Description
                  </label>
                  <input
                    required
                    type="text"
                    value={purItemDesc}
                    onChange={(e) => setPurItemDesc(e.target.value)}
                    placeholder="e.g., Fresh Croaker Fish, Bottled Water Pack, Cooking Gas"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Supplier / Vendor</label>
                    <input
                      required
                      type="text"
                      value={purSupplier}
                      onChange={(e) => setPurSupplier(e.target.value)}
                      placeholder="Ogbete Market / Vendor"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Ledger Category</label>
                    <select
                      value={purCategory}
                      onChange={(e) =>
                        setPurCategory(e.target.value as 'Restaurant & Bar' | 'Procurement')
                      }
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                    >
                      <option value="Restaurant & Bar">Restaurant &amp; Bar</option>
                      <option value="Procurement">Procurement</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Total Cost (₦)</label>
                    <input
                      required
                      type="number"
                      min={100}
                      step={100}
                      value={purAmount}
                      onChange={(e) => setPurAmount(Number(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-2 font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Method</label>
                    <select
                      value={purMethod}
                      onChange={(e) => setPurMethod(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-2 bg-white"
                    >
                      <option value="Cash NGN">Cash NGN</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card POS">Card POS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Purchase Date</label>
                    <input
                      required
                      type="date"
                      value={purDate}
                      onChange={(e) => setPurDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-2 font-mono-tabular"
                    />
                  </div>
                </div>

                {inventoryItems.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <p className="font-semibold text-slate-800">
                      Optional: Restock Store Inventory Item
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={purInvId}
                        onChange={(e) => setPurInvId(e.target.value)}
                        className="col-span-2 border border-slate-200 rounded px-2.5 py-1.5 bg-white"
                      >
                        <option value="">Do not adjust inventory</option>
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.quantityOnHand} {inv.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        disabled={!purInvId}
                        value={purRestockQty}
                        onChange={(e) => setPurRestockQty(Number(e.target.value) || 0)}
                        placeholder="+Qty"
                        className="border border-slate-200 rounded px-2.5 py-1.5 bg-white font-mono-tabular disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => setPurchaseModalOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPurchase}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{savingPurchase ? 'Recording...' : 'Save Purchase'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* POS Receipt Preview Modal (Screen View) */}
        {receiptOrder && (
          <div className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  POS Order Receipt
                </h3>
                <button
                  type="button"
                  onClick={() => setReceiptOrder(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                  {property.logoUrl && (
                    <img
                      src={property.logoUrl}
                      alt={property.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 object-contain mx-auto rounded"
                    />
                  )}
                  <p className="font-display font-bold text-sm text-slate-900">{property.name}</p>
                  <p className="text-[11px] text-slate-600">
                    {property.address || RICHGATES_PROPERTY_INFO.address}
                  </p>
                  <p className="text-[11px] font-mono-tabular text-slate-500">
                    {property.phone || RICHGATES_PROPERTY_INFO.phone}
                  </p>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Receipt No:</span>
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {receiptOrder.orderNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date:</span>
                    <span className="font-mono-tabular">
                      {receiptOrder.orderDate || new Date().toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Service:</span>
                    <span>{receiptOrder.serviceType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Charge / Ref:</span>
                    <span className="font-medium text-right">{receiptOrder.tableOrRoom}</span>
                  </div>
                  {receiptOrder.guestName && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Guest:</span>
                      <span>{receiptOrder.guestName}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-b border-dashed border-slate-300 py-2.5 space-y-1">
                  <p className="font-semibold text-slate-800">Items ({receiptOrder.itemCount})</p>
                  <p className="text-slate-700 leading-relaxed">{receiptOrder.itemsSummary}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono-tabular">{formatNgn(receiptOrder.subtotalNgn)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>VAT (7.5%)</span>
                    <span className="font-mono-tabular">{formatNgn(receiptOrder.vatNgn)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                    <span>Total Paid</span>
                    <span className="font-mono-tabular">{formatNgn(receiptOrder.totalNgn)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                    <span>Payment Method</span>
                    <span className="font-semibold text-slate-800">{receiptOrder.paymentMethod}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReceiptPdf(receiptOrder)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF Receipt</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Printable Thermal Receipt Section */}
      {receiptOrder && (
        <div className="hidden print-only max-w-[80mm] mx-auto p-4 text-xs text-slate-900 font-sans">
          <div className="text-center space-y-1 border-b border-dashed border-slate-400 pb-2 mb-2">
            {property.logoUrl && (
              <img
                src={property.logoUrl}
                alt={property.name}
                className="w-12 h-12 object-contain mx-auto"
              />
            )}
            <p className="font-bold text-sm">{property.name}</p>
            <p className="text-[10px]">{property.address || RICHGATES_PROPERTY_INFO.address}</p>
            <p className="text-[10px] font-mono">
              {property.phone || RICHGATES_PROPERTY_INFO.phone} ·{' '}
              {property.email || RICHGATES_PROPERTY_INFO.email}
            </p>
          </div>
          <div className="space-y-1 text-[11px] mb-2">
            <p>
              <strong>Receipt:</strong> {receiptOrder.orderNumber}
            </p>
            <p>
              <strong>Date:</strong>{' '}
              {receiptOrder.orderDate || new Date().toISOString().slice(0, 10)}
            </p>
            <p>
              <strong>Service:</strong> {receiptOrder.serviceType}
            </p>
            <p>
              <strong>Ref:</strong> {receiptOrder.tableOrRoom}
            </p>
            {receiptOrder.guestName && (
              <p>
                <strong>Guest:</strong> {receiptOrder.guestName}
              </p>
            )}
          </div>
          <div className="border-t border-b border-dashed border-slate-400 py-2 my-2">
            <p className="font-bold mb-1">Items ({receiptOrder.itemCount})</p>
            <p>{receiptOrder.itemsSummary}</p>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatNgn(receiptOrder.subtotalNgn)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT (7.5%)</span>
              <span>{formatNgn(receiptOrder.vatNgn)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-slate-400 pt-1 mt-1">
              <span>TOTAL</span>
              <span>{formatNgn(receiptOrder.totalNgn)}</span>
            </div>
            <p className="pt-1">
              <strong>Method:</strong> {receiptOrder.paymentMethod} (
              {receiptOrder.paymentStatus === 'room_folio' ? 'Posted to Room Folio' : 'Paid'})
            </p>
          </div>
          <p className="text-center text-[10px] mt-4">
            {cms.brand.folioFooterNote ||
              'Thank you for choosing Richgates Apartments, Enugu.'}
          </p>
        </div>
      )}
    </>
  );
};
