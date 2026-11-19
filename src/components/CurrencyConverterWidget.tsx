import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, RefreshCw, Save } from 'lucide-react';
import { updatePropertyUsdRateWorkflow } from '../services/pmsService';
import {
  convertNgnToUsd,
  DEFAULT_USD_RATE_NGN,
  formatNgn,
  formatUsd,
  PropertyRecord,
  RoomRecord,
  sortRoomsByNumber,
} from '../types/pms';

interface CurrencyConverterWidgetProps {
  property: PropertyRecord;
  rooms?: RoomRecord[];
  canEditRate?: boolean;
  actorRole?: string;
  compact?: boolean;
  onNotify?: (msg: string) => void;
}

export const CurrencyConverterWidget: React.FC<CurrencyConverterWidgetProps> = ({
  property,
  rooms = [],
  canEditRate = false,
  actorRole = 'Operator',
  compact = false,
  onNotify,
}) => {
  const activeRate =
    property.usdExchangeRateNgn && property.usdExchangeRateNgn > 0
      ? property.usdExchangeRateNgn
      : DEFAULT_USD_RATE_NGN;

  const [rateInput, setRateInput] = useState<string>(String(activeRate));
  const [ngnAmount, setNgnAmount] = useState<string>('65500');
  const [usdAmount, setUsdAmount] = useState<string>(() =>
    convertNgnToUsd(65500, activeRate).toFixed(2)
  );
  const [syncingLive, setSyncingLive] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setRateInput(String(activeRate));
    const parsedNgn = Number(ngnAmount);
    if (Number.isFinite(parsedNgn) && parsedNgn >= 0) {
      setUsdAmount(convertNgnToUsd(parsedNgn, activeRate).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRate]);

  const parsedRate = Number(rateInput);
  const effectiveCalcRate =
    Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : activeRate;

  const handleNgnChange = (val: string) => {
    setNgnAmount(val);
    const num = Number(val);
    if (!val.trim() || !Number.isFinite(num) || num < 0) {
      setUsdAmount('');
      return;
    }
    setUsdAmount((num / effectiveCalcRate).toFixed(2));
  };

  const handleUsdChange = (val: string) => {
    setUsdAmount(val);
    const num = Number(val);
    if (!val.trim() || !Number.isFinite(num) || num < 0) {
      setNgnAmount('');
      return;
    }
    setNgnAmount(String(Math.round(num * effectiveCalcRate)));
  };

  const handleRateInputChange = (val: string) => {
    setRateInput(val);
    const nextRate = Number(val);
    const curNgn = Number(ngnAmount);
    if (Number.isFinite(nextRate) && nextRate > 0 && Number.isFinite(curNgn)) {
      setUsdAmount((curNgn / nextRate).toFixed(2));
    }
  };

  const formatFxError = (err: unknown, fallback: string): string => {
    if (!(err instanceof Error)) return fallback;
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      if (parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Plain error message
    }
    return err.message || fallback;
  };

  const handleSyncLiveRate = async () => {
    setSyncingLive(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) {
        throw new Error(`FX feed returned status ${response.status}`);
      }
      const data = (await response.json()) as {
        result?: string;
        rates?: Record<string, number>;
        time_last_update_utc?: string;
      };
      const liveNgn = data?.rates?.NGN;
      if (!liveNgn || !Number.isFinite(liveNgn) || liveNgn <= 0) {
        throw new Error('NGN rate was not available in the daily FX feed.');
      }
      const roundedRate = Math.round(liveNgn * 100) / 100;
      setRateInput(String(roundedRate));
      const curNgn = Number(ngnAmount);
      if (Number.isFinite(curNgn) && curNgn >= 0) {
        setUsdAmount((curNgn / roundedRate).toFixed(2));
      }

      if (canEditRate) {
        await updatePropertyUsdRateWorkflow({
          property,
          usdExchangeRateNgn: roundedRate,
          usdRateSource: 'Daily Live Market FX (open.er-api.com)',
          actorRole,
        });
        setStatusMsg(`Saved live daily rate: $1 = ₦${roundedRate.toLocaleString()}`);
        onNotify?.(`Updated daily USD rate to ₦${roundedRate.toLocaleString()}`);
      } else {
        setStatusMsg(`Fetched live daily market rate: $1 = ₦${roundedRate.toLocaleString()}`);
      }
    } catch (err) {
      setErrorMsg(
        formatFxError(
          err,
          'Unable to fetch live FX feed. Enter today’s desk rate manually.'
        )
      );
    } finally {
      setSyncingLive(false);
    }
  };

  const handleSaveManualRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setErrorMsg('Enter a valid positive Naira amount per $1 USD.');
      return;
    }
    setSavingRate(true);
    try {
      await updatePropertyUsdRateWorkflow({
        property,
        usdExchangeRateNgn: parsedRate,
        usdRateSource: 'Property Daily Desk Rate',
        actorRole,
      });
      setStatusMsg(`Saved property desk rate: $1 = ₦${parsedRate.toLocaleString()}`);
      onNotify?.(`Saved daily USD rate: ₦${parsedRate.toLocaleString()}`);
    } catch (err) {
      setErrorMsg(formatFxError(err, 'Unable to save daily rate.'));
    } finally {
      setSavingRate(false);
    }
  };

  const sortedRooms = sortRoomsByNumber(rooms);
  const updatedLabel = property.usdRateUpdatedIso
    ? property.usdRateUpdatedIso.slice(0, 16).replace('T', ' ')
    : 'Default Desk Rate';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-emerald-700" />
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Daily USD Exchange Rate &amp; Currency Converter
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Active Rate:{' '}
            <span className="font-mono-tabular font-semibold text-slate-900">
              $1.00 USD = ₦{activeRate.toLocaleString()}
            </span>{' '}
            · Updated <span className="font-mono-tabular">{updatedLabel}</span>
            {property.usdRateSource ? ` · ${property.usdRateSource}` : ''}
          </p>
        </div>

        <button
          type="button"
          disabled={syncingLive}
          onClick={handleSyncLiveRate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncingLive ? 'animate-spin' : ''}`} />
          <span>{syncingLive ? 'Syncing FX...' : 'Sync Today’s Live USD Rate'}</span>
        </button>
      </div>

      <div className={`grid grid-cols-1 ${compact ? 'lg:grid-cols-3' : 'lg:grid-cols-12'} gap-4 items-end`}>
        {/* NGN Input */}
        <div className={compact ? '' : 'lg:col-span-4'}>
          <label
            htmlFor="fx-ngn-input"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Amount in Nigerian Naira (₦)
          </label>
          <input
            id="fx-ngn-input"
            type="number"
            min={0}
            step={100}
            value={ngnAmount}
            onChange={(e) => handleNgnChange(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-emerald-600"
          />
        </div>

        {/* USD Input */}
        <div className={compact ? '' : 'lg:col-span-4'}>
          <label
            htmlFor="fx-usd-input"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Equivalent in US Dollars ($)
          </label>
          <input
            id="fx-usd-input"
            type="number"
            min={0}
            step={0.01}
            value={usdAmount}
            onChange={(e) => handleUsdChange(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-emerald-600"
          />
        </div>

        {/* Daily Desk Exchange Rate Form */}
        <form
          onSubmit={handleSaveManualRate}
          className={`${compact ? '' : 'lg:col-span-4'} flex items-end gap-2`}
        >
          <div className="flex-1 min-w-0">
            <label
              htmlFor="fx-rate-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Daily Exchange Rate (₦ per $1 USD)
            </label>
            <input
              id="fx-rate-input"
              type="number"
              min={100}
              step={0.5}
              readOnly={!canEditRate}
              value={rateInput}
              onChange={(e) => handleRateInputChange(e.target.value)}
              className={`w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 ${
                canEditRate ? 'bg-white text-slate-900' : 'bg-slate-50 text-slate-700'
              }`}
            />
          </div>
          {canEditRate && (
            <button
              type="submit"
              disabled={savingRate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingRate ? 'Saving...' : 'Save Rate'}</span>
            </button>
          )}
        </form>
      </div>

      {/* Live Quick Summary & Suite Rate Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
        <p className="font-mono-tabular text-slate-700">
          {formatNgn(Number(ngnAmount) || 0)} ={' '}
          <strong className="text-emerald-700">
            {formatUsd(Number(usdAmount) || 0, 2)} USD
          </strong>
        </p>

        {sortedRooms.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 mr-1">Room Rates:</span>
            {sortedRooms.slice(0, 6).map((rm) => (
              <button
                key={rm.id}
                type="button"
                onClick={() => handleNgnChange(String(rm.nightlyRateNgn))}
                className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 font-mono-tabular text-[11px] text-slate-700 cursor-pointer"
              >
                {rm.roomNumber}: {formatUsd(convertNgnToUsd(rm.nightlyRateNgn, effectiveCalcRate), 0)}
              </button>
            ))}
          </div>
        )}
      </div>

      {statusMsg && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
