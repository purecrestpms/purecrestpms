import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDriveDownload,
  Laptop,
  Share,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { PropertyRecord } from '../types/pms';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const OFFLINE_BRANDING_STORAGE_KEY = 'pchpms_offline_property_branding_v1';

export interface OfflinePropertyBranding {
  propertyId: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  logoUrl?: string;
  currency: string;
  usdExchangeRateNgn?: number;
  updatedAtIso: string;
}

export function readOfflinePropertyBranding(): OfflinePropertyBranding | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_BRANDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflinePropertyBranding>;
    if (!parsed || typeof parsed.name !== 'string') return null;
    return parsed as OfflinePropertyBranding;
  } catch {
    return null;
  }
}

/**
 * Dynamically binds the Web App Manifest, document title, and local offline branding cache
 * to the active property so the installed desktop app uses that property's branding & settings.
 */
export function usePropertyPwaBranding(property: PropertyRecord | null | undefined) {
  useEffect(() => {
    if (typeof document === 'undefined' || !property) return;

    const cleanName = (property.name || 'PCHPMS').trim();
    const manifestParams = new URLSearchParams({
      propertyId: property.id,
      name: cleanName,
      city: property.city || '',
      themeColor: '#0a367a',
    });
    const manifestHref = `/api/manifest?${manifestParams.toString()}`;

    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    if (manifestLink.getAttribute('href') !== manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
    }

    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
      appleTitle.content = cleanName.slice(0, 12);
    }

    try {
      const brandingSnapshot: OfflinePropertyBranding = {
        propertyId: property.id,
        name: cleanName,
        city: property.city || '',
        state: property.state || '',
        address: property.address || '',
        phone: property.phone || '',
        logoUrl: property.logoUrl,
        currency: property.currency || 'NGN',
        usdExchangeRateNgn: property.usdExchangeRateNgn,
        updatedAtIso: new Date().toISOString(),
      };
      window.localStorage.setItem(OFFLINE_BRANDING_STORAGE_KEY, JSON.stringify(brandingSnapshot));
    } catch {
      // Ignore storage quota issues
    }
  }, [
    property?.id,
    property?.name,
    property?.city,
    property?.state,
    property?.address,
    property?.phone,
    property?.logoUrl,
    property?.currency,
    property?.usdExchangeRateNgn,
  ]);
}

interface PropertyPwaInstallControlProps {
  property: PropertyRecord;
  isPropertyAdmin: boolean;
  onNotify?: (msg: string) => void;
}

export const PropertyPwaInstallControl: React.FC<PropertyPwaInstallControlProps> = ({
  property,
  isPropertyAdmin,
  onNotify,
}) => {
  const { canNativeInstall, isInstalled, isIOS, isSafari, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Strict RBAC guard: ONLY Property Admins may access the Desktop App Install icon
  if (!isPropertyAdmin) return null;

  const propertyLogo = property.logoUrl || '/pwa-192x192.png';
  const propertyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?property=${encodeURIComponent(property.id)}`
      : '/';

  const handleTriggerNativeInstall = async () => {
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        setInstallSuccess(true);
        onNotify?.(`${property.name} Desktop App installed successfully.`);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleDownloadDesktopLauncher = () => {
    const safeSlug = (property.name || 'pchpms')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

    if (isMac) {
      const webloc = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>URL</key>\n  <string>${propertyUrl}</string>\n</dict>\n</plist>\n`;
      const blob = new Blob([webloc], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeSlug || 'pchpms'}-desktop-app.webloc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const shortcut = `[InternetShortcut]\r\nURL=${propertyUrl}\r\nIconIndex=0\r\n`;
      const blob = new Blob([shortcut], { type: 'application/internet-shortcut' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeSlug || 'pchpms'}-desktop-app.url`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    onNotify?.(`Downloaded ${property.name} desktop launcher shortcut.`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title={`Install ${property.name} Desktop App`}
        aria-label={`Install ${property.name} Desktop App`}
        className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-[#0a367a] text-[#0a367a] hover:text-white hover:border-[#0a367a] text-xs font-semibold transition-colors cursor-pointer shrink-0"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="hidden lg:inline whitespace-nowrap">
          {isInstalled ? 'Desktop App' : 'Install App'}
        </span>
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-[#0a367a] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src={propertyLogo}
                    alt={property.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold truncate">
                    {property.name} Desktop App
                  </h3>
                  <p className="text-[11px] text-blue-100 truncate">
                    Property Admin Installation · Offline-Ready PCHPMS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close install dialog"
                className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              {/* Property Branding & Offline Capabilities Summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#061f4d]">Property Branding &amp; Settings</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Admin Verified
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-3.5 h-3.5 text-[#0a367a] shrink-0" />
                    <span className="truncate">
                      App Name: <strong className="text-slate-900">{property.name}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Offline Access:{' '}
                      <strong className="text-slate-900">
                        {isOnline ? 'Cached & Synced' : 'Active Offline'}
                      </strong>
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Installs as a dedicated desktop window using <strong>{property.name}</strong>’s
                  branding, currency settings ({property.currency || 'NGN'}), and local Firestore +
                  service worker caching so front desk operations remain accessible offline.
                </p>
              </div>

              {isInstalled || installSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-950">
                      Desktop App Installed
                    </p>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      You are running or have installed the {property.name} desktop app with offline
                      caching enabled.
                    </p>
                  </div>
                </div>
              ) : canNativeInstall ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={installing}
                    onClick={() => void handleTriggerNativeInstall()}
                    className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a367a] hover:bg-[#07275a] text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {installing
                        ? 'Installing Desktop App...'
                        : `Install ${property.name} Desktop App`}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2.5">
                  <p className="font-bold text-[#061f4d]">
                    {isIOS || isSafari
                      ? 'Install on macOS / Safari'
                      : 'Install on Desktop (Chrome / Edge)'}
                  </p>
                  {isIOS || isSafari ? (
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed">
                      <li>
                        Click the <Share className="w-3 h-3 inline mx-0.5 text-[#0a367a]" />{' '}
                        <strong>Share</strong> menu (or <strong>File → Add to Dock</strong> in macOS Safari).
                      </li>
                      <li>
                        Select <strong>Add to Dock</strong> (macOS) or <strong>Add to Home Screen</strong> (iPad/iOS).
                      </li>
                      <li>
                        Confirm <strong>{property.name}</strong> to launch it as a standalone app.
                      </li>
                    </ol>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed">
                      <li>
                        Open the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) or click the{' '}
                        <strong>Install</strong> icon in the address bar.
                      </li>
                      <li>
                        Choose <strong>Install {property.name} — PCHPMS</strong> (or{' '}
                        <strong>Cast, save, and share → Install page as app</strong>).
                      </li>
                      <li>
                        Pin it to your taskbar or Dock for instant 1-click offline-ready launch.
                      </li>
                    </ol>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDownloadDesktopLauncher}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 text-[#0a367a]" />
                  <span>Download Desktop Shortcut</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-[#061f4d] text-white px-4 py-2 text-xs font-semibold shadow-lg border border-blue-400/30"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <span>Offline mode active — cached property data is available and will sync when reconnected.</span>
    </div>
  );
};
