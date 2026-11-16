import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import {
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
  onEmailPasswordSignIn: (
    portal: PortalMode,
    email: string,
    password: string,
    staffRole?: StaffRole
  ) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  authError: string | null;
  authNotice: string | null;
  isSigningIn: boolean;
}

const RICHGATES_ATTACHED_ICON =
  '/assets/aistudio/001890be-a02f-4bfe-9e94-a4c86e183844_b9376f70.jpeg';

const PCH_ATTACHED_ICON =
  '/assets/aistudio/4A541DC4-8B5B-4592-9C9E-752D5AE470AD_3f72a29d.png';

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
        <span className="block font-site-title text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
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
  onEmailPasswordSignIn,
  onPasswordReset,
  authError,
  authNotice,
  isSigningIn,
}) => {
  const { cms } = useCms();
  const [workEmailHint, setWorkEmailHint] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [pchIconError, setPchIconError] = useState(false);

  const isStaffPage = selectedPortal === 'staff';
  const isPchPage = selectedPortal === 'pch-admin';

  // =========================================================================
  // 1. DEDICATED PCH SUPER ADMIN PORTAL (Independent Branding & Navy/Gold Theme)
  // =========================================================================
  if (isPchPage) {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row">
        <div className="lg:w-1/2 relative bg-[#0B245B] text-white flex flex-col justify-between min-h-[280px] lg:min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#081A44] via-[#0B245B] to-[#13347D]" />
          <div className="relative z-10 p-8 lg:p-12 flex items-center gap-3.5">
            {!pchIconError ? (
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-white shadow-md shrink-0">
                <img
                  src={PCH_ATTACHED_ICON}
                  alt="PCH Emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setPchIconError(true)}
                  className="w-full h-full object-cover scale-[1.06]"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <span className="font-site-title text-2xl font-bold text-white block leading-tight">
                {cms.brand.pchPortalName}
              </span>
              <p className="text-xs text-amber-200/90 mt-0.5">Multi-Property Administration</p>
            </div>
          </div>

          <div className="relative z-10 p-8 lg:p-12 space-y-4 max-w-lg">
            <p className="text-xs font-medium tracking-wide text-amber-300">
              {cms.login.pchHeroKicker}
            </p>
            <h1 className="font-site-title text-3xl lg:text-4xl font-bold text-white [text-wrap:balance]">
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
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1c46be]"
                  />
                </div>
              </div>

              {authNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  {authNotice}
                </div>
              )}

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
    if (workEmailHint.trim() || passwordHint) {
      void onEmailPasswordSignIn(selectedPortal, workEmailHint, passwordHint, selectedStaffRole);
      return;
    }
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

              <div>
                <label
                  htmlFor="login-email-input"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-email-input"
                    type="email"
                    value={workEmailHint}
                    onChange={(e) => setWorkEmailHint(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-3 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:border-[#08461f] focus:ring-2 focus:ring-emerald-900/10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password-input"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={passwordHint}
                    onChange={(e) => setPasswordHint(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:border-[#08461f] focus:ring-2 focus:ring-emerald-900/10"
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

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={() => onPasswordReset(workEmailHint)}
                    className="text-xs font-semibold text-[#08461f] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              {authNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  {authNotice}
                </div>
              )}

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

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => onGoogleSignIn(selectedPortal, selectedStaffRole)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4 text-[#08461f]" />
                <span>Continue with Google</span>
              </button>
            </form>

            {/* Divider & Powered By PCHPMS */}
            <div className="pt-1">
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-xs text-slate-500 whitespace-nowrap relative">
                  Powered by{' '}
                  <strong className="text-[#08461f] font-bold tracking-tight">PCHPMS</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
