import React, { useState } from 'react';
import { ChefHat, Minus, Plus, Receipt, UtensilsCrossed } from 'lucide-react';
import { advanceKitchenOrder, submitPosOrderWorkflow } from '../services/pmsService';
import {
  formatNgn,
  POS_MENU_ITEMS,
  PosMenuItem,
  PosOrderRecord,
  PropertyRecord,
  ReservationRecord,
} from '../types/pms';

interface PosKitchenViewProps {
  property: PropertyRecord;
  posOrders: PosOrderRecord[];
  reservations: ReservationRecord[];
  actorRole: string;
  onNotify: (msg: string) => void;
}

export const PosKitchenView: React.FC<PosKitchenViewProps> = ({
  property,
  posOrders,
  reservations,
  actorRole,
  onNotify,
}) => {
  const [cart, setCart] = useState<Array<{ item: PosMenuItem; qty: number }>>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [serviceType, setServiceType] = useState<PosOrderRecord['serviceType']>('Dine-In');
  const [tableOrRoom, setTableOrRoom] = useState('Table 01');
  const [paymentMethod, setPaymentMethod] =
    useState<PosOrderRecord['paymentMethod']>('Card POS');
  const [linkedReservationId, setLinkedReservationId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inHouseGuests = reservations.filter((r) => r.status === 'checked_in');
  const categories = ['All', 'Nigerian Kitchen', 'Grill & Continental', 'Breakfast', 'Bar & Cocktails'];

  const visibleMenu = POS_MENU_ITEMS.filter(
    (m) => categoryFilter === 'All' || m.category === categoryFilter
  );

  const addToCart = (item: PosMenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.item.id === itemId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const subtotalNgn = cart.reduce((sum, c) => sum + c.item.priceNgn * c.qty, 0);
  const vatNgn = Math.round(subtotalNgn * 0.075);
  const totalNgn = subtotalNgn + vatNgn;
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const handleFireOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const linkedRes =
      paymentMethod === 'Room Folio'
        ? inHouseGuests.find((r) => r.id === linkedReservationId) || inHouseGuests[0]
        : undefined;

    const targetLabel =
      paymentMethod === 'Room Folio' && linkedRes
        ? `Room ${linkedRes.roomNumber} (${linkedRes.guestName})`
        : tableOrRoom.trim() || 'Lounge Walk-In';

    const itemsSummary = cart.map((c) => `${c.qty}x ${c.item.name}`).join(', ');

    setSubmitting(true);
    try {
      await submitPosOrderWorkflow({
        property,
        serviceType,
        tableOrRoom: targetLabel,
        linkedReservation: linkedRes,
        itemsSummary,
        itemCount,
        subtotalNgn,
        paymentMethod,
        actorRole,
      });
      onNotify(
        paymentMethod === 'Room Folio' && linkedRes
          ? `Charged ${formatNgn(totalNgn)} to Room ${linkedRes.roomNumber} Folio & sent to Kitchen`
          : `Settled ${formatNgn(totalNgn)} (${paymentMethod}) & fired ticket to Kitchen`
      );
      setCart([]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Restaurant Banner Header */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 p-5 flex flex-col justify-between space-y-3">
          <div>
            <p className="text-xs text-slate-500">
              {property.name} · Restaurant, Bar &amp; Room Service
            </p>
            <h1 className="font-display text-xl font-bold text-slate-900 mt-1">
              Restaurant POS &amp; Kitchen Display System (KDS)
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Create dine-in, bar, or room-service tickets in Nigerian Naira (7.5% VAT), post
              directly to occupied Room Folios, and track live kitchen preparation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="h-36 lg:h-auto bg-slate-900 relative">
          <img
            src="/src/assets/images/richgates_dining_lounge_1794795995213.jpg"
            alt="Richgates Restaurant and Bar Lounge"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-85"
          />
        </div>
      </div>

      {/* Main Split: POS Menu & Cart (Left) + Kitchen Display Queue (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Menu & POS Order Builder */}
        <div className="xl:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleMenu.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                className="text-left p-4 bg-white border border-slate-200 hover:border-emerald-600 rounded-xl transition-colors flex flex-col justify-between gap-2"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-500">{item.category}</p>
                  <p className="font-display text-sm font-semibold text-slate-900 mt-0.5">
                    {item.name}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="font-mono-tabular font-bold text-emerald-700">
                    {formatNgn(item.priceNgn)}
                  </span>
                  <span className="text-slate-500">{item.prepMinutes} mins</span>
                </div>
              </button>
            ))}
          </div>

          {/* Current Order Ticket Builder */}
          <form
            onSubmit={handleFireOrder}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Active POS Order Ticket
                </h2>
              </div>
              <span className="font-mono-tabular text-xs text-slate-500">
                {itemCount} items selected
              </span>
            </div>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Select dishes or drinks from the menu above to build an order.
              </p>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div
                    key={c.item.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100"
                  >
                    <span className="font-medium text-slate-900 truncate pr-2">
                      {c.item.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQty(c.item.id, -1)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono-tabular w-5 text-center">{c.qty}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(c.item.id, 1)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="font-mono-tabular font-semibold text-slate-900 w-20 text-right">
                        {formatNgn(c.item.priceNgn * c.qty)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Service Type</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as PosOrderRecord['serviceType'])}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Dine-In">Dine-In</option>
                  <option value="Room Service">Room Service</option>
                  <option value="Bar Lounge">Bar Lounge</option>
                  <option value="Takeaway">Takeaway</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Billing Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as PosOrderRecord['paymentMethod'])
                  }
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="Card POS">Card POS</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash NGN">Cash NGN</option>
                  <option value="Room Folio" disabled={inHouseGuests.length === 0}>
                    Charge to Room Folio
                  </option>
                </select>
              </div>

              {paymentMethod === 'Room Folio' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">In-House Suite</label>
                  <select
                    value={linkedReservationId || inHouseGuests[0]?.id || ''}
                    onChange={(e) => setLinkedReservationId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                  >
                    {inHouseGuests.map((res) => (
                      <option key={res.id} value={res.id}>
                        Rm {res.roomNumber} · {res.guestName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Table / Ref</label>
                  <input
                    type="text"
                    value={tableOrRoom}
                    onChange={(e) => setTableOrRoom(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
              <div className="text-xs space-y-0.5">
                <p className="text-slate-600">
                  Subtotal: <span className="font-mono-tabular">{formatNgn(subtotalNgn)}</span> ·
                  VAT (7.5%): <span className="font-mono-tabular">{formatNgn(vatNgn)}</span>
                </p>
                <p className="font-mono-tabular text-base font-bold text-slate-900">
                  Total Due: {formatNgn(totalNgn)}
                </p>
              </div>

              <button
                type="submit"
                disabled={cart.length === 0 || submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>{submitting ? 'Firing...' : 'Fire Order to Kitchen'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Live Kitchen Display System (KDS) */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-slate-800" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Kitchen Display System (KDS)
              </h2>
            </div>
            <span className="font-mono-tabular text-xs text-slate-500">
              {posOrders.filter((o) => o.kitchenStatus !== 'served').length} active
            </span>
          </div>

          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {posOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {ord.orderNumber} · {ord.serviceType}
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

                <p className="text-xs font-semibold text-slate-900">{ord.tableOrRoom}</p>
                <p className="text-xs text-slate-600">{ord.itemsSummary}</p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 text-xs">
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {formatNgn(ord.totalNgn)} · {ord.paymentMethod}
                  </span>

                  <div className="flex items-center gap-1.5">
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
                        className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium"
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
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium"
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
                        className="px-2.5 py-1 bg-slate-700 text-white rounded font-medium"
                      >
                        Served
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
