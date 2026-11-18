import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Shield,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import { PortalMode, RICHGATES_EXTERIOR_IMAGE } from '../types/pms';

interface PortalGatewayProps {
  selectedPortal: PortalMode;
  tenantSlug?: string | null;
  tenantPropertyName?: string;
  tenantLogoUrl?: string;
  onGoogleSignIn: (portal: PortalMode) => Promise<void>;
  onEmailPasswordSignIn: (portal: PortalMode, email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  authError: string | null;
  authNotice: string | null;
  isSigningIn: boolean;
}

const RICHGATES_CREST_IMAGE = '/assets/richgates-crest-transparent.png';
const PCH_ATTACHED_ICON = '/assets/pch-icon-transparent.png';

function formatTenantSlugLabel(slug?: string | null): string {
  if (!slug) return 'Property Workspace';
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const PortalGateway: React.FC<PortalGatewayProps> = ({
  selectedPortal,
  tenantSlug,
  tenantPropertyName,
  tenantLogoUrl,
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
  const [bgImgError, setBgImgError] = useState(false);
  const [crestError, setCrestError] = useState(false);
  const [pchIconError, setPchIconError] = useState(false);
  const [tenantLogoError, setTenantLogoError] = useState(false);

  const isStaffPage = selectedPortal === 'staff';
  const isPchPage = selectedPortal === 'pch-admin';
  const normalizedSlug = (tenantSlug || '').trim().toLowerCase();
  const isRichgatesTenant =
    !isPchPage &&
    (normalizedSlug === 'richgates' ||
      (!normalizedSlug && !tenantPropertyName));
  const resolvedPropertyDisplay =
    tenantPropertyName?.trim() ||
    (isRichgatesTenant ? 'Richgates Apartments' : formatTenantSlugLabel(normalizedSlug));

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (workEmailHint.trim() || passwordHint) {
      void onEmailPasswordSignIn(selectedPortal, workEmailHint, passwordHint);
      return;
    }
    void onGoogleSignIn(selectedPortal);
  };

  const cardHeading = isPchPage
    ? cms.login.pchSignInTitle || 'Super Admin Login'
    : isStaffPage
      ? 'Staff Login'
      : 'Administrator Login';

  const cardSubtitle = isPchPage
    ? cms.login.pchSignInSubtitle || 'Multi-property licensing & platform administration'
    : isStaffPage
      ? 'Sign in to your daily shift workspace'
      : 'Manage your property with ease';

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#03153a] flex flex-col justify-between">
      {/* Architectural Exterior Photo Backdrop (Richgates only; clean deep architectural navy for other clients / super admin) */}
      {isRichgatesTenant && !bgImgError ? (
        <img
          src={RICHGATES_EXTERIOR_IMAGE}
          alt="Richgates Apartments exterior"
          referrerPolicy="no-referrer"
          onError={() => setBgImgError(true)}
          className="absolute inset-0 w-full h-full object-cover object-center scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#020d26] via-[#08245e] to-[#03153a]" />
      )}

      {/* Deep Royal Navy Gradient Scrim */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(135deg, rgba(3, 21, 58, 0.90) 0%, rgba(10, 42, 108, 0.78) 50%, rgba(3, 18, 51, 0.92) 100%)',
        }}
      />

      {/* Bottom Gold & Navy Architectural Corner Swoosh */}
      <svg
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 w-full h-24 sm:h-32 pointer-events-none z-10"
      >
        <path d="M0 155 Q190 215 410 240 L0 240 Z" fill="#f5b800" />
        <path d="M0 185 Q180 225 380 240 L0 240 Z" fill="#041945" />
        <path d="M1440 155 Q1250 215 1030 240 L1440 240 Z" fill="#f5b800" />
        <path d="M1440 185 Q1260 225 1060 240 L1440 240 Z" fill="#041945" />
      </svg>

      {/* Main Content */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-10">
        {/* Centered Transparent Emblem & Brand Lockup */}
        <div className="text-center mb-6 sm:mb-7 select-none">
          {isPchPage ? (
            <div className="flex flex-col items-center">
              {!pchIconError ? (
                <img
                  src={PCH_ATTACHED_ICON}
                  alt="PCH PMS Emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setPchIconError(true)}
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-2xl mb-3 bg-transparent"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center drop-shadow-2xl mb-3">
                  <ShieldCheck className="w-10 h-10 text-[#f5b800]" />
                </div>
              )}
              <h1 className="font-site-title text-3xl sm:text-4xl font-bold tracking-[0.14em] text-white uppercase drop-shadow">
                {cms.brand.pchPortalName || 'PCH PMS'}
              </h1>
              <p className="text-xs sm:text-sm font-semibold tracking-[0.28em] text-white/90 uppercase mt-1">
                Multi-Property Platform
              </p>
            </div>
          ) : isRichgatesTenant ? (
            <div className="flex flex-col items-center">
              {!crestError ? (
                <img
                  src={RICHGATES_CREST_IMAGE}
                  alt="Richgates Apartments Crest"
                  referrerPolicy="no-referrer"
                  onError={() => setCrestError(true)}
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-2xl mb-3 bg-transparent"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center drop-shadow-2xl mb-3">
                  <Building2 className="w-10 h-10 text-[#f5b800]" />
                </div>
              )}
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-[0.12em] text-white uppercase drop-shadow-md leading-none">
                RICHGATES
              </h1>
              <p className="text-xs sm:text-sm font-semibold tracking-[0.38em] text-white/95 uppercase mt-1.5">
                APARTMENTS
              </p>
              <div className="flex items-center justify-center gap-3 mt-2.5">
                <span className="h-[1.5px] w-10 sm:w-14 bg-[#f5b800] rounded-full" />
                <span className="text-xs sm:text-sm italic font-medium text-white/95 tracking-wide">
                  Property Management System
                </span>
                <span className="h-[1.5px] w-10 sm:w-14 bg-[#f5b800] rounded-full" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {tenantLogoUrl && !tenantLogoError ? (
                <img
                  src={tenantLogoUrl}
                  alt={`${resolvedPropertyDisplay} Logo`}
                  referrerPolicy="no-referrer"
                  onError={() => setTenantLogoError(true)}
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-2xl bg-white/95 p-2 shadow-2xl mb-3"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center drop-shadow-2xl mb-3">
                  <Building2 className="w-9 h-9 text-[#f5b800]" />
                </div>
              )}
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-[0.06em] text-white uppercase drop-shadow-md leading-tight">
                {resolvedPropertyDisplay}
              </h1>
              <div className="flex items-center justify-center gap-3 mt-2.5">
                <span className="h-[1.5px] w-10 sm:w-14 bg-[#f5b800] rounded-full" />
                <span className="text-xs sm:text-sm italic font-medium text-white/95 tracking-wide">
                  Private Property Workspace
                </span>
                <span className="h-[1.5px] w-10 sm:w-14 bg-[#f5b800] rounded-full" />
              </div>
            </div>
          )}
        </div>

        {/* Floating Elevated White Login Card */}
        <div className="w-full max-w-[430px] bg-white rounded-2xl shadow-[0_28px_70px_-12px_rgba(2,12,36,0.72)] border border-white/40 overflow-hidden">
          {/* Thin Royal Gold Top Accent Bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#062052] via-[#f5b800] to-[#062052]" />

          <div className="p-6 sm:p-8 space-y-5">
            {/* Shield Icon + Title + Subtitle */}
            <div className="text-center space-y-2">
              <div className="relative w-12 h-12 mx-auto rounded-2xl bg-[#062052]/5 border border-[#062052]/15 flex items-center justify-center">
                {isStaffPage ? (
                  <UserCheck className="w-6 h-6 text-[#062052]" />
                ) : (
                  <>
                    <Shield className="w-7 h-7 text-[#062052]" />
                    <Lock className="w-3.5 h-3.5 text-[#e5a400] absolute" />
                  </>
                )}
              </div>

              <div>
                <h2 className="font-display text-2xl font-bold text-[#062052] tracking-tight">
                  {cardHeading}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{cardSubtitle}</p>
              </div>
            </div>

            {/* Alert / Error Messages */}
            {authNotice && (
              <div
                role="status"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{authNotice}</span>
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="login-email-input"
                  className="block text-[11px] font-bold text-slate-800 mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-email-input"
                    type="email"
                    autoComplete="email"
                    placeholder="Email Address"
                    value={workEmailHint}
                    onChange={(e) => setWorkEmailHint(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#062052] focus:ring-2 focus:ring-[#062052]/10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password-input"
                  className="block text-[11px] font-bold text-slate-800 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={passwordHint}
                    onChange={(e) => setPasswordHint(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#062052] focus:ring-2 focus:ring-[#062052]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={() => void onPasswordReset(workEmailHint)}
                    className="text-xs font-semibold text-[#1c46be] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#062052] hover:bg-[#082c70] disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-sm cursor-pointer whitespace-nowrap"
              >
                <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="relative flex items-center justify-center py-1">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-2.5 text-[11px] font-medium text-slate-400 whitespace-nowrap relative">
                  or
                </span>
              </div>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void onGoogleSignIn(selectedPortal)}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-[#062052] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4 text-[#1c46be]" />
                <span>Continue with Google</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Legal & Platform Credit Bar */}
      <footer className="relative z-20 pb-5 pt-2 px-4 text-center">
        <p className="text-[11px] sm:text-xs text-white/90 tracking-wide">
          © {new Date().getFullYear()} {isPchPage ? 'PCH PMS' : resolvedPropertyDisplay}. All rights
          reserved. <span className="text-[#f5b800] px-1.5">|</span> Powered by{' '}
          <strong className="font-semibold text-white">PCH PMS</strong>
        </p>
      </footer>
    </div>
  );
};
