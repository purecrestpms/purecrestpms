import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
  getPortalUrl,
  PortalMode,
  RICHGATES_EXTERIOR_IMAGE,
  ROLE_LABELS,
  StaffRole,
} from '../types/pms';

interface PortalGatewayProps {
  selectedPortal: PortalMode;
  onSelectPortal: (portal: PortalMode) => void;
  selectedStaffRole: StaffRole;
  onSelectStaffRole: (role: StaffRole) => void;
  onGoogleSignIn: (portal: PortalMode, staffRole?: StaffRole) => Promise<void>;
  authError: string | null;
  isSigningIn: boolean;
}

const RICHGATES_ATTACHED_ICON =
  '/assets/aistudio/001890be-a02f-4bfe-9e94-a4c86e183844_b9376f70.jpeg';

const STAFF_ROLES: StaffRole[] = [
  'front_desk',
  'housekeeping',
  'fnb_kitchen',
  'accountant',
  'maintenance',
];

const RichgatesEmblem: React.FC = () => {
  const [iconError, setIconError] = useState(false);

  return (
    <div className="inline-flex flex-col sm:flex-row items-center gap-4 select-none">
      {!iconError ? (
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-black border border-yellow-400/50 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.65)] shrink-0">
          <img
            src={RICHGATES_ATTACHED_ICON}
            alt="Richgates Apartments Emblem"
            referrerPolicy="no-referrer"
            onError={() => setIconError(true)}
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-black border border-yellow-400/60 flex items-center justify-center shadow-2xl shrink-0">
          <Building2 className="w-9 h-9 text-yellow-400" />
        </div>
      )}
      <div className="text-center sm:text-left">
        <span className="block font-display text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
          Richgates Apartments
        </span>
        <span className="block text-[11px] sm:text-xs font-semibold tracking-[0.26em] text-yellow-300/95 uppercase mt-1 drop-shadow">
          Property Management System
        </span>
      </div>
    </div>
  );
};

export const PortalGateway: React.FC<PortalGatewayProps> = ({
  selectedPortal,
  onSelectPortal,
  selectedStaffRole,
  onSelectStaffRole,
  onGoogleSignIn,
  authError,
  isSigningIn,
}) => {
  const { cms } = useCms();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [workEmailHint, setWorkEmailHint] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showLinksDrawer, setShowLinksDrawer] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isStaffPage = selectedPortal === 'staff';
  const isPchPage = selectedPortal === 'pch-admin';

  const handleCopyLink = async (id: string, portal: PortalMode | 'richgates') => {
    const url = getPortalUrl(portal);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const signInLinks: Array<{
    id: string;
    title: string;
    portal: PortalMode;
    urlPortal: PortalMode | 'richgates';
  }> = [
    {
      id: 'link-richgates',
      title: 'Richgates Apartments Login',
      portal: 'richgates-admin',
      urlPortal: 'richgates',
    },
    {
      id: 'link-staff',
      title: 'Richgates Staff Sign-In',
      portal: 'staff',
      urlPortal: 'staff',
    },
    {
      id: 'link-pch',
      title: 'PCH Super Admin Portal',
      portal: 'pch-admin',
      urlPortal: 'pch-admin',
    },
  ];

  // =========================================================================
  // 1. DEDICATED PCH SUPER ADMIN PORTAL (Independent Branding & Blue Theme)
  // =========================================================================
  if (isPchPage) {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row">
        <div className="lg:w-1/2 relative bg-[#1a3ca8] text-white flex flex-col justify-between min-h-[280px] lg:min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#15359a] via-[#1c46be] to-[#0e2261]" />
          <div className="relative z-10 p-8 lg:p-12 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 backdrop-blur-sm flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-display text-lg font-bold tracking-tight text-white block leading-tight">
                {cms.brand.pchPortalName}
              </span>
              <p className="text-xs text-blue-100/90">Multi-Property Administration</p>
            </div>
          </div>

          <div className="relative z-10 p-8 lg:p-12 space-y-4 max-w-lg">
            <p className="text-xs font-medium tracking-wide text-blue-200">
              {cms.login.pchHeroKicker}
            </p>
            <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              {cms.login.pchHeroTitle}
            </h1>
            <p className="text-sm text-blue-100/90 leading-relaxed">
              {cms.login.pchHeroDesc}
            </p>
          </div>
        </div>

        <div className="lg:w-1/2 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 bg-white">
          <div className="max-w-md w-full mx-auto space-y-7">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1c46be]">
                <ShieldCheck className="w-4 h-4" />
                <span>PCH Super Admin Portal</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectPortal('richgates-admin')}
                className="text-xs font-semibold text-slate-600 hover:text-[#1c46be] cursor-pointer"
              >
                Open Richgates Login →
              </button>
            </div>

            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                {cms.login.pchSignInTitle}
              </h2>
              <p className="text-sm text-slate-500">{cms.login.pchSignInSubtitle}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={workEmailHint}
                    onChange={(e) => setWorkEmailHint(e.target.value)}
                    placeholder="admin@pchpms.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {authError}
                </div>
              )}

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => onGoogleSignIn('pch-admin')}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1c46be] hover:bg-[#163aa3] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                <span>{isSigningIn ? 'Signing in...' : 'Sign in to PCH Super Admin'}</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase px-1">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>{cms.login.signInLinksHeading || 'SIGN-IN LINKS'}</span>
              </div>

              <div className="divide-y divide-slate-200/80 bg-white border border-slate-200 rounded-xl overflow-hidden">
                {signInLinks.map((item) => {
                  const url = getPortalUrl(item.urlPortal);
                  const isCopied = copiedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                        <p className="font-mono-tabular text-[11px] text-slate-500 truncate">
                          {url}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(item.id, item.urlPortal)}
                          title="Copy sign-in link"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectPortal(item.portal)}
                          title={`Open ${item.title}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#1c46be] hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. RICHGATES APARTMENTS PROPERTY PMS LOGIN
  // =========================================================================
  const handleRichgatesFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onGoogleSignIn(selectedPortal, selectedStaffRole);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-900 flex flex-col justify-center">
      {/* Blurred Architectural Backdrop Photo */}
      {!imgError ? (
        <img
          src={RICHGATES_EXTERIOR_IMAGE}
          alt="Richgates Apartments exterior"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover object-center blur-[4px] scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950" />
      )}

      {/* Measured Scrim for Crisp Icon & Typography Contrast */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(125deg, rgba(6,22,12,0.58) 0%, rgba(10,30,18,0.42) 48%, rgba(5,20,10,0.68) 100%)',
        }}
      />

      {/* Subtle Layered Architectural Waves Along Lower Edge */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <path
          d="M0 790 C380 885 780 835 1120 620 C1270 525 1370 435 1440 370 L1440 900 L0 900 Z"
          fill="rgba(8, 70, 31, 0.34)"
        />
        <path
          d="M0 820 C410 910 830 870 1180 680 C1310 610 1390 545 1440 505 L1440 900 L0 900 Z"
          fill="rgba(5, 46, 20, 0.86)"
        />
      </svg>

      {/* Main Layout */}
      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-5 sm:px-10 lg:px-14 py-8 lg:py-12 flex flex-col lg:flex-row items-center justify-between gap-10">
        {/* Left Brand Zone — Attached Richgates Emblem Only (No phone/email/WhatsApp) */}
        <div className="w-full lg:w-[48%] flex flex-col items-center lg:items-start justify-center space-y-6">
          <RichgatesEmblem />
          <p className="hidden lg:block text-sm text-slate-100/90 max-w-md leading-relaxed drop-shadow">
            Unified reservations, front desk folios, housekeeping dispatch, restaurant POS, and revenue analytics for Richgates Apartments.
          </p>
        </div>

        {/* Right Elevated White Login Card */}
        <div className="w-full max-w-[445px] flex flex-col justify-center">
          <div className="bg-white rounded-[24px] shadow-[0_24px_64px_-14px_rgba(0,0,0,0.45)] border border-slate-200/70 px-6 sm:px-9 py-8 sm:py-9 space-y-5">
            <div className="text-center space-y-2">
              <h1 className="font-display text-3xl sm:text-[34px] font-bold tracking-tight text-[#08461f]">
                Welcome Back
              </h1>
              <p className="text-sm text-slate-600 font-medium">Sign in to Continue</p>
              <div className="w-16 h-[2px] bg-[#08461f] mx-auto rounded-full" />
            </div>

            {/* Admin / Staff Segmented Selector */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => onSelectPortal('richgates-admin')}
                className={`py-2 px-3 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !isStaffPage
                    ? 'bg-[#08461f] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Property Admin
              </button>
              <button
                type="button"
                onClick={() => onSelectPortal('staff')}
                className={`py-2 px-3 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isStaffPage
                    ? 'bg-[#08461f] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Staff Login
              </button>
            </div>

            <form onSubmit={handleRichgatesFormSubmit} className="space-y-3.5">
              {isStaffPage && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Department Workspace
                  </label>
                  <select
                    value={selectedStaffRole}
                    onChange={(e) => onSelectStaffRole(e.target.value as StaffRole)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:outline-none focus:border-[#08461f]"
                  >
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={workEmailHint}
                  onChange={(e) => setWorkEmailHint(e.target.value)}
                  placeholder="Username or Email"
                  aria-label="Username or Email"
                  className="w-full pl-10 pr-3.5 py-3 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#08461f] focus:ring-2 focus:ring-emerald-900/10"
                />
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordHint}
                  onChange={(e) => setPasswordHint(e.target.value)}
                  placeholder="Password"
                  aria-label="Password"
                  className="w-full pl-10 pr-10 py-3 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#08461f] focus:ring-2 focus:ring-emerald-900/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[#08461f] hover:bg-[#063818] disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-sm cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Divider & Powered By PCHPMS */}
            <div className="pt-1 space-y-3">
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-xs text-slate-500 whitespace-nowrap relative">
                  Powered by{' '}
                  <strong className="text-[#08461f] font-bold tracking-tight">PCHPMS</strong>
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLinksDrawer((v) => !v)}
                  className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-[#08461f] cursor-pointer whitespace-nowrap"
                >
                  <Globe className="w-3 h-3" />
                  <span>Sign-In Links</span>
                  {showLinksDrawer ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectPortal('pch-admin')}
                  className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#1c46be] cursor-pointer whitespace-nowrap"
                >
                  <Building2 className="w-3 h-3" />
                  <span>PCH Super Admin Portal</span>
                </button>
              </div>

              {showLinksDrawer && (
                <div className="divide-y divide-slate-200/80 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden text-left">
                  {signInLinks.map((item) => {
                    const url = getPortalUrl(item.urlPortal);
                    const isCopied = copiedId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-900">{item.title}</p>
                          <p className="font-mono-tabular text-[10px] text-slate-500 truncate">
                            {url}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(item.id, item.urlPortal)}
                            title="Copy sign-in link"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white cursor-pointer"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectPortal(item.portal)}
                            title={`Open ${item.title}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#08461f] hover:bg-white cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
