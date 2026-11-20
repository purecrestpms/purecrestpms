import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import { PropertyRecord, RICHGATES_EXTERIOR_IMAGE } from '../types/pms';

const RICHGATES_CREST_IMAGE = '/assets/richgates-crest-transparent.png';
const PCH_ATTACHED_ICON = '/assets/pch-icon-transparent.png';

function formatSlugDisplayName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveTenantBrandingFromUrl(
  returnHref: string,
  properties: PropertyRecord[]
): {
  mode: 'super_admin' | 'richgates' | 'property';
  slug: string | null;
  propertyName: string;
  logoUrl?: string;
  domainLabel: string;
} {
  let hostname = '';
  try {
    hostname = new URL(returnHref).hostname.toLowerCase();
  } catch {
    hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : 'pchpms.com';
  }

  const domainLabel = hostname || 'pchpms.com';

  // Super admin or root platform domains
  if (
    hostname === 'admin.pchpms.com' ||
    hostname === 'app.pchpms.com' ||
    hostname === 'pchpms.com' ||
    hostname === 'www.pchpms.com'
  ) {
    return {
      mode: 'super_admin',
      slug: null,
      propertyName: 'PCH PMS',
      domainLabel,
    };
  }

  // Extract subdomain slug for <slug>.pchpms.com
  let slug: string | null = null;
  if (hostname.endsWith('.pchpms.com')) {
    const sub = hostname.slice(0, -'.pchpms.com'.length);
    if (sub && !['www', 'app', 'admin'].includes(sub)) {
      slug = sub;
    }
  } else if (typeof window !== 'undefined') {
    const tenantQuery = new URLSearchParams(window.location.search).get('tenant');
    if (tenantQuery) slug = tenantQuery.trim().toLowerCase();
  }

  const matchedProp = slug
    ? properties.find(
        (p) =>
          (p.subdomainSlug || '').toLowerCase() === slug ||
          (p.code || '').toLowerCase() === slug
      )
    : undefined;

  if (slug === 'richgates') {
    return {
      mode: 'richgates',
      slug: 'richgates',
      propertyName: matchedProp?.name || 'Richgates Apartments',
      logoUrl: matchedProp?.logoUrl,
      domainLabel,
    };
  }

  if (slug || matchedProp) {
    return {
      mode: 'property',
      slug,
      propertyName: matchedProp?.name || (slug ? formatSlugDisplayName(slug) : 'Property Workspace'),
      logoUrl: matchedProp?.logoUrl,
      domainLabel,
    };
  }

  return {
    mode: 'super_admin',
    slug: null,
    propertyName: 'PCH PMS',
    domainLabel,
  };
}

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  barClass: string;
  textClass: string;
} {
  if (!password) {
    return { score: 0, label: '', barClass: 'bg-slate-200', textClass: 'text-slate-400' };
  }
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return { score: 1, label: 'Weak', barClass: 'bg-rose-500', textClass: 'text-rose-600' };
  }
  if (score === 2) {
    return { score: 2, label: 'Fair', barClass: 'bg-amber-500', textClass: 'text-amber-600' };
  }
  if (score === 3) {
    return { score: 3, label: 'Good', barClass: 'bg-blue-600', textClass: 'text-blue-700' };
  }
  return { score: 4, label: 'Strong', barClass: 'bg-emerald-600', textClass: 'text-emerald-700' };
}

export interface AuthActionViewProps {
  mode: string;
  returnHref: string;
  properties: PropertyRecord[];
  authActionState: 'loading' | 'ready_reset' | 'success' | 'error' | 'redirecting';
  authActionMessage: string;
  authActionFormError: string | null;
  authActionEmail: string;
  newResetPassword: string;
  confirmResetPassword: string;
  authActionSubmitting: boolean;
  recoveryEmail: string;
  recoverySubmitting: boolean;
  recoveryStatus: string | null;
  recoveryError: string | null;
  onChangeNewPassword: (val: string) => void;
  onChangeConfirmPassword: (val: string) => void;
  onSubmitPasswordReset: (e: React.FormEvent) => void;
  onChangeRecoveryEmail: (val: string) => void;
  onSubmitFreshResetLink: (e: React.FormEvent) => void;
}

export const AuthActionView: React.FC<AuthActionViewProps> = ({
  mode,
  returnHref,
  properties,
  authActionState,
  authActionMessage,
  authActionFormError,
  authActionEmail,
  newResetPassword,
  confirmResetPassword,
  authActionSubmitting,
  recoveryEmail,
  recoverySubmitting,
  recoveryStatus,
  recoveryError,
  onChangeNewPassword,
  onChangeConfirmPassword,
  onSubmitPasswordReset,
  onChangeRecoveryEmail,
  onSubmitFreshResetLink,
}) => {
  const { cms } = useCms();
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [bgImgError, setBgImgError] = useState(false);
  const [crestError, setCrestError] = useState(false);
  const [pchIconError, setPchIconError] = useState(false);
  const [tenantLogoError, setTenantLogoError] = useState(false);

  const branding = resolveTenantBrandingFromUrl(returnHref, properties);
  const strength = getPasswordStrength(newResetPassword);
  const isResetFlow = mode === 'resetPassword';
  const isVerifyFlow = mode === 'verifyEmail' || mode === 'verifyAndChangeEmail';

  const cardHeading =
    authActionState === 'success'
      ? isResetFlow
        ? 'Password Updated'
        : isVerifyFlow
          ? 'Email Verified'
          : 'Action Completed'
      : authActionState === 'redirecting'
        ? 'Returning to Portal'
        : isResetFlow
          ? 'Reset Account Password'
          : isVerifyFlow
            ? 'Verify Email Address'
            : 'Account Security';

  const cardSubtitle =
    authActionState === 'ready_reset'
      ? 'Create a new secure password for your workspace'
      : authActionState === 'success'
        ? `Your ${branding.propertyName} account is ready`
        : authActionState === 'loading'
          ? 'Verifying your secure link...'
          : authActionState === 'redirecting'
            ? `Redirecting to ${branding.domainLabel}`
            : `Security verification for ${branding.propertyName}`;

  const returnButtonLabel =
    branding.mode === 'super_admin'
      ? `Continue to ${branding.domainLabel === 'pchpms.com' ? 'PCH PMS' : branding.domainLabel} Sign In`
      : `Continue to ${branding.propertyName} Sign In`;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#03153a] flex flex-col justify-between">
      {/* Architectural Exterior Photo Backdrop (Richgates) or Deep Royal Navy Gradient */}
      {branding.mode === 'richgates' && !bgImgError ? (
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
        {/* Centered Brand Emblem & Lockup */}
        <div className="text-center mb-6 sm:mb-7 select-none">
          {branding.mode === 'super_admin' ? (
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
                Account Security
              </p>
            </div>
          ) : branding.mode === 'richgates' ? (
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
              {branding.logoUrl && !tenantLogoError ? (
                <img
                  src={branding.logoUrl}
                  alt={`${branding.propertyName} Logo`}
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
                {branding.propertyName}
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

        {/* Floating Elevated White Security Card */}
        <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-[0_28px_70px_-12px_rgba(2,12,36,0.72)] border border-white/40 overflow-hidden">
          {/* Thin Royal Gold Top Accent Bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#062052] via-[#f5b800] to-[#062052]" />

          <div className="p-6 sm:p-8 space-y-5">
            {/* Icon + Title + Subtitle */}
            <div className="text-center space-y-2">
              <div className="relative w-12 h-12 mx-auto rounded-2xl bg-[#062052]/5 border border-[#062052]/15 flex items-center justify-center">
                {authActionState === 'success' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                ) : authActionState === 'error' ? (
                  <AlertTriangle className="w-6 h-6 text-rose-600" />
                ) : isResetFlow ? (
                  <>
                    <Shield className="w-7 h-7 text-[#062052]" />
                    <KeyRound className="w-3.5 h-3.5 text-[#e5a400] absolute" />
                  </>
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

              {(authActionEmail || branding.domainLabel) && (
                <div className="pt-1 flex flex-col items-center gap-0.5">
                  {authActionEmail && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono-tabular font-semibold text-slate-800">
                      <Mail className="w-3.5 h-3.5 text-[#062052]" />
                      <span>{authActionEmail}</span>
                    </span>
                  )}
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    {branding.domainLabel}
                  </span>
                </div>
              )}
            </div>

            {authActionState === 'ready_reset' ? (
              <form onSubmit={onSubmitPasswordReset} className="space-y-4">
                {authActionFormError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{authActionFormError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="reset-new-password"
                    className="block text-[11px] font-bold text-slate-800 mb-1"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={newResetPassword}
                      onChange={(e) => onChangeNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#062052] focus:ring-2 focus:ring-[#062052]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    >
                      {showNewPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>

                  {newResetPassword.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`h-1 rounded-full transition-colors ${
                              strength.score >= step ? strength.barClass : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-[11px] font-semibold ${strength.textClass}`}>
                        Password strength: {strength.label}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="block text-[11px] font-bold text-slate-800 mb-1"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmResetPassword}
                      onChange={(e) => onChangeConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#062052] focus:ring-2 focus:ring-[#062052]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authActionSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-[#062052] hover:bg-[#082c70] text-white text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <span>{authActionSubmitting ? 'Saving Password...' : 'Save New Password'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="pt-1 text-center">
                  <a
                    href={returnHref}
                    className="text-xs font-semibold text-[#062052] hover:text-[#1c46be] hover:underline"
                  >
                    Back to {branding.domainLabel} Sign In
                  </a>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed text-center ${
                    authActionState === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : authActionState === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  {authActionMessage}
                </div>

                {authActionState === 'error' && (
                  <form
                    onSubmit={onSubmitFreshResetLink}
                    className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <p className="text-xs font-bold text-[#062052]">
                      Request a Fresh Password Reset Link
                    </p>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={recoveryEmail}
                        onChange={(e) => onChangeRecoveryEmail(e.target.value)}
                        placeholder="Enter your work email"
                        className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#062052]"
                      />
                    </div>
                    {recoveryError && (
                      <p className="text-[11px] text-rose-700 font-medium">{recoveryError}</p>
                    )}
                    {recoveryStatus && (
                      <p className="text-[11px] text-emerald-700 font-medium">{recoveryStatus}</p>
                    )}
                    <button
                      type="submit"
                      disabled={recoverySubmitting}
                      className="w-full py-2.5 px-3 bg-[#062052] hover:bg-[#082c70] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {recoverySubmitting ? 'Sending Reset Link...' : 'Send Fresh Reset Link'}
                    </button>
                  </form>
                )}

                {authActionState !== 'loading' && (
                  <a
                    href={returnHref}
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#062052] hover:bg-[#082c70] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm transition-colors"
                  >
                    <span>{returnButtonLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Branded Footer */}
      <footer className="relative z-20 text-center pb-5 px-4">
        <p className="text-[11px] text-white/75 tracking-wide">
          Powered by <strong className="text-white font-semibold">{cms.brand.pchPortalName || 'PCH PMS'}</strong> · pchpms.com
        </p>
      </footer>
    </div>
  );
};
