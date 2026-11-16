import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  LogIn,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react';
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

const STAFF_ROLES: StaffRole[] = [
  'front_desk',
  'housekeeping',
  'fnb_kitchen',
  'accountant',
  'maintenance',
];

export const PortalGateway: React.FC<PortalGatewayProps> = ({
  selectedPortal,
  onSelectPortal,
  selectedStaffRole,
  onSelectStaffRole,
  onGoogleSignIn,
  authError,
  isSigningIn,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [workEmailHint, setWorkEmailHint] = useState('');
  const [imgError, setImgError] = useState(false);

  const isStaffPage = selectedPortal === 'staff';

  const handleCopyLink = async (id: string, portal: PortalMode | 'admin') => {
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
    urlPortal: PortalMode | 'admin';
    subtitle: string;
  }> = [
    {
      id: 'link-admin',
      title: 'Admin Login Page',
      portal: 'richgates-admin',
      urlPortal: 'admin',
      subtitle: 'General Manager & Super Admin gateway',
    },
    {
      id: 'link-pch',
      title: 'PCH Super Admin & Licensing',
      portal: 'pch-admin',
      urlPortal: 'pch-admin',
      subtitle: 'Multi-property control & PureCrest keys',
    },
    {
      id: 'link-richgates',
      title: 'Richgates Apartments Enugu',
      portal: 'richgates-admin',
      urlPortal: 'richgates-admin',
      subtitle: 'Serviced Apartments & Hotel Rooms admin',
    },
    {
      id: 'link-staff',
      title: 'Staff Sign-In',
      portal: 'staff',
      urlPortal: 'staff',
      subtitle: 'Front Desk, Housekeeping, Kitchen & Maintenance',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row">
      {/* Left Architectural Royal-Blue Panel */}
      <div className="lg:w-1/2 relative bg-[#1a3ca8] text-white flex flex-col justify-between min-h-[300px] lg:min-h-screen overflow-hidden">
        {!imgError ? (
          <img
            src={RICHGATES_EXTERIOR_IMAGE}
            alt="Richgates Apartments, Enugu"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-35 mix-blend-luminosity"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#16338f] via-[#1c46be] to-[#0f2468]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-[#15359a]/90 via-[#1d4ed8]/80 to-[#0e2261]/95" />

        {/* Top Mark */}
        <div className="relative z-10 p-8 lg:p-12 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 backdrop-blur-sm flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-display text-lg font-bold tracking-tight text-white block leading-tight">
              PCH PMS
            </span>
            <p className="text-xs text-blue-100/90">Property Management</p>
          </div>
        </div>

        {/* Bottom Architectural Context */}
        <div className="relative z-10 p-8 lg:p-12 space-y-4 max-w-lg">
          <p className="text-xs font-medium tracking-wide text-blue-200">
            {isStaffPage ? 'Department Staff Portal' : 'Executive Administration Portal'}
          </p>
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
            {isStaffPage
              ? 'Richgates Apartments Operations Workspace'
              : 'PureCrest Hospitality & Richgates Administration'}
          </h1>
          <p className="text-sm text-blue-100/90 leading-relaxed">
            {isStaffPage
              ? 'Dedicated sign-in for Front Desk, Housekeeping, Restaurant POS & Kitchen, Accounts, and Engineering teams in Enugu.'
              : 'Manage room pricing, suite photography, calendar availability blocks, multi-property administration, and centralized PureCrest licensing.'}
          </p>
        </div>
      </div>

      {/* Right Separate Login Page Surface */}
      <div className="lg:w-1/2 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 bg-white">
        <div className="max-w-md w-full mx-auto space-y-7">
          {/* Page Mode Switcher Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onSelectPortal(selectedPortal === 'pch-admin' ? 'pch-admin' : 'richgates-admin')
                }
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  !isStaffPage
                    ? 'bg-[#1c46be] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Admin Login
              </button>
              <button
                type="button"
                onClick={() => onSelectPortal('staff')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isStaffPage
                    ? 'bg-[#1c46be] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Staff Login
              </button>
            </div>
            <span className="text-[11px] text-slate-400 font-mono-tabular">Enugu · NGN (₦)</span>
          </div>

          {/* Dedicated Heading per Login Page */}
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              {isStaffPage ? 'Staff sign-in' : 'Admin sign-in'}
            </h2>
            <p className="text-sm text-slate-500">
              {isStaffPage
                ? 'Sign in with your verified staff account.'
                : 'Sign in with your PCH Super Admin or Property Admin account.'}
            </p>
          </div>

          {/* Admin Portal Selector vs Staff Department Selector */}
          {!isStaffPage ? (
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">
                Administrator Scope
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onSelectPortal('richgates-admin')}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    selectedPortal === 'richgates-admin'
                      ? 'border-[#1c46be] bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                    <Building2 className="w-4 h-4 text-[#1c46be]" />
                    <span>Property Admin</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Richgates Apartments, Enugu · Rooms, Rates &amp; P&amp;L
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectPortal('pch-admin')}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    selectedPortal === 'pch-admin'
                      ? 'border-[#1c46be] bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                    <ShieldCheck className="w-4 h-4 text-[#1c46be]" />
                    <span>PCH Super Admin</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Multi-Property, Licensing &amp; Global Audit
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">
                Department Workspace
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STAFF_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onSelectStaffRole(role)}
                    className={`px-3 py-2 text-left text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      selectedStaffRole === role
                        ? 'bg-[#1c46be] text-white border-[#1c46be]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Email Reference & Sign-in Button */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {isStaffPage ? 'Staff Email' : 'Administrator Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={workEmailHint}
                  onChange={(e) => setWorkEmailHint(e.target.value)}
                  placeholder={isStaffPage ? 'staff@richgatesenugu.com' : 'admin@richgatesenugu.com'}
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
              onClick={() => onGoogleSignIn(selectedPortal, selectedStaffRole)}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1c46be] hover:bg-[#163aa3] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {isSigningIn
                  ? 'Signing in...'
                  : isStaffPage
                    ? `Sign in as ${ROLE_LABELS[selectedStaffRole]}`
                    : selectedPortal === 'pch-admin'
                      ? 'Sign in as PCH Super Admin'
                      : 'Sign in as Property Admin'}
              </span>
            </button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => onSelectPortal(isStaffPage ? 'richgates-admin' : 'staff')}
                className="inline-flex items-center gap-1 text-[#1c46be] hover:underline font-medium cursor-pointer"
              >
                {isStaffPage ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Switch to Admin Login Page</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <Users className="w-3.5 h-3.5" />
                    <span>Switch to Staff Login Page</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
              <span className="text-slate-400">Google Workspace SSO</span>
            </div>
          </div>

          {/* SIGN-IN LINKS Directory Card (modeled on reference) */}
          <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase px-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>SIGN-IN LINKS</span>
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
};
