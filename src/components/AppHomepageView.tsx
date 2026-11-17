import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Globe,
  Mail,
  Menu,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import heroLobbyImg from '../assets/images/hero_pms_hospitality_1794814254490.jpg';
import diningPosImg from '../assets/images/bento_dining_pos_1794814255579.jpg';
import suitePreviewImg from '../assets/images/bento_suite_management_1794814255256.jpg';
import { submitPublicPlanInquiryWorkflow } from '../services/pmsService';
import {
  formatUsd,
  LicenseRecord,
  PlanInquiryRecord,
  PortalMode,
} from '../types/pms';

const PCH_LOGO_ICON = '/assets/aistudio/4A541DC4-8B5B-4592-9C9E-752D5AE470AD_3f72a29d.png';

interface AppHomepageViewProps {
  isSignedIn: boolean;
  onSelectPortal: (portal: PortalMode) => void;
  onReturnToWorkspace?: () => void;
}

type BillingCycle = 'monthly' | 'annual' | 'lifetime';

interface PlanSpec {
  id: LicenseRecord['plan'];
  name: string;
  summary: string;
  maxRooms: number;
  monthlyUsd: number;
  annualUsd: number;
  lifetimeUsd: number;
  featured?: boolean;
  highlights: string[];
}

const PLANS: PlanSpec[] = [
  {
    id: 'Starter',
    name: 'Starter',
    summary: 'Built for independent guesthouses, inns, and boutique serviced apartments.',
    maxRooms: 12,
    monthlyUsd: 25,
    annualUsd: 250,
    lifetimeUsd: 690,
    highlights: [
      'Up to 12 rooms, suites, or apartments',
      'Separate property management & staff workspaces',
      'Reservations ledger, calendar & date blocking',
      'Front desk check-in, KYC & printable guest folios',
      'Housekeeping dispatch & maintenance ticketing',
    ],
  },
  {
    id: 'Professional',
    name: 'Professional',
    summary: 'Unified room operations, restaurant POS, channel calendar sync, and P&L reporting.',
    maxRooms: 35,
    monthlyUsd: 55,
    annualUsd: 550,
    lifetimeUsd: 1490,
    featured: true,
    highlights: [
      'Up to 35 rooms or serviced suites',
      'Restaurant POS, Kitchen Display (KDS) & folio posting',
      'Booking.com, Airbnb, Expedia & VRBO iCal sync',
      'Daily room reports, ADR, RevPAR & P&L exports',
      'Daily USD FX rate sync, staff shifts & payroll',
    ],
  },
  {
    id: 'Enterprise',
    name: 'Enterprise',
    summary: 'Full-scale hospitality platform for busy hotels, resorts, and multi-wing properties.',
    maxRooms: 100,
    monthlyUsd: 99,
    annualUsd: 990,
    lifetimeUsd: 2490,
    highlights: [
      'Up to 100 rooms across all property wings',
      'Central store inventory & supplier purchase orders',
      'Role-based access across 6 department workspaces',
      'Inter-departmental messaging & security audit logs',
      'Priority onboarding & custom rate-card setup',
    ],
  },
  {
    id: 'Lifetime Sovereign',
    name: 'Lifetime Sovereign',
    summary: 'One-time perpetual software license for multi-property owners and hospitality groups.',
    maxRooms: 300,
    monthlyUsd: 3490,
    annualUsd: 3490,
    lifetimeUsd: 3490,
    highlights: [
      'Up to 300 rooms · One-time perpetual license key',
      'Central multi-property administration console',
      'Full App CMS editor for custom portal branding',
      'Zero recurring monthly software subscription fees',
      'Dedicated deployment engineer & portfolio setup',
    ],
  },
];

const CAPABILITIES = [
  {
    num: '01.',
    title: 'Reservations, Availability Calendar & Daily FX Rates',
    body: 'Track direct walk-ins, website bookings, Booking.com, Airbnb, and Expedia stays on one interactive grid. Manage room rates with live daily USD conversion and block maintenance dates in seconds.',
    spanTwo: true,
    hasImage: 'suite' as const,
  },
  {
    num: '02.',
    title: 'Front Desk Folios & Verified Check-In',
    body: 'Verify guest ID, collect deposits or card settlements, assign available suites on arrival, and issue itemized checkout receipts from one streamlined screen.',
    spanTwo: false,
  },
  {
    num: '03.',
    title: 'Restaurant POS, Kitchen Display & Inventory',
    body: 'Process dine-in, bar lounge, and room-service tickets with direct guest folio posting alongside live store inventory control and supplier purchase orders.',
    spanTwo: true,
    hasImage: 'dining' as const,
  },
  {
    num: '04.',
    title: 'Executive P&L, ADR & Daily Room Reports',
    body: 'Filter daily room bookings by check-in or booking date, inspect RevPAR and occupancy performance, and export clean PDF or Excel reports for ownership.',
    spanTwo: false,
  },
];

const PROPERTY_TYPES = [
  {
    title: 'Boutique & City Hotels',
    desc: 'Coordinate front desk check-ins, room blocks, minibar/POS charges, and shift handovers across every floor.',
  },
  {
    title: 'Serviced Apartments & Short-Lets',
    desc: 'Manage individual studios and multi-bedroom suites with Airbnb/VRBO calendar links and extended-stay folios.',
  },
  {
    title: 'Resorts, Lodges & Villas',
    desc: 'Unite accommodation, dining outlets, housekeeping turnover, and preventive maintenance in one workspace.',
  },
  {
    title: 'Multi-Property Groups',
    desc: 'Oversee multiple hotels under one central console with property-bound license keys and staff permissions.',
  },
];

function getPlanPriceUsd(plan: PlanSpec, cycle: BillingCycle): number {
  if (plan.id === 'Lifetime Sovereign') return plan.lifetimeUsd;
  if (cycle === 'monthly') return plan.monthlyUsd;
  if (cycle === 'annual') return plan.annualUsd;
  return plan.lifetimeUsd;
}

function slugifyIdentifier(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'property'
  );
}

const PchBrandIcon: React.FC<{ sizeClass?: string }> = ({ sizeClass = 'w-9 h-9' }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${sizeClass} rounded-lg bg-[#0B245B] border border-[#B57B14]/40 flex items-center justify-center shrink-0`}
      >
        <ShieldCheck className="w-4 h-4 text-amber-300" />
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-lg overflow-hidden bg-white shadow-sm shrink-0`}>
      <img
        src={PCH_LOGO_ICON}
        alt="PureCrest Hospitality PCH Emblem"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover scale-[1.06]"
      />
    </div>
  );
};

export const AppHomepageView: React.FC<AppHomepageViewProps> = ({
  isSignedIn,
  onSelectPortal,
  onReturnToWorkspace,
}) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Image error fallbacks (Zero-Broken-Image Policy)
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [suiteImgFailed, setSuiteImgFailed] = useState(false);
  const [diningImgFailed, setDiningImgFailed] = useState(false);

  // Purchase modal state
  const [purchasePlan, setPurchasePlan] = useState<PlanSpec | null>(null);
  const [purchaseCycle, setPurchaseCycle] = useState<BillingCycle>('monthly');
  const [buyerPropName, setBuyerPropName] = useState('');
  const [buyerLocation, setBuyerLocation] = useState('');
  const [buyerRooms, setBuyerRooms] = useState('12');
  const [buyerFirstName, setBuyerFirstName] = useState('');
  const [buyerLastName, setBuyerLastName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerPaymentOption, setBuyerPaymentOption] = useState('Corporate Invoice / Wire Transfer');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseConfirmation, setPurchaseConfirmation] = useState<PlanInquiryRecord | null>(null);

  // Contact form state
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactProperty, setContactProperty] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRooms, setContactRooms] = useState('12');
  const [contactTopic, setContactTopic] = useState('Request Live Demo');
  const [contactMessage, setContactMessage] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactConfirmation, setContactConfirmation] = useState<PlanInquiryRecord | null>(null);

  const scrollToSection = (id: string) => {
    setMobileNavOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openPurchaseModal = (plan: PlanSpec) => {
    const effectiveCycle = plan.id === 'Lifetime Sovereign' ? 'lifetime' : billingCycle;
    setPurchasePlan(plan);
    setPurchaseCycle(effectiveCycle);
    setPurchaseError(null);
    setPurchaseConfirmation(null);
    setBuyerRooms(String(Math.min(plan.maxRooms, 12)));
  };

  const handleOpenPlatformPortal = () => {
    if (isSignedIn && onReturnToWorkspace) {
      onReturnToWorkspace();
    } else {
      onSelectPortal('pch-admin');
    }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchasePlan) return;
    setPurchaseError(null);

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim());
    const parsedRooms = Math.max(1, Math.min(5000, Number(buyerRooms) || 1));

    if (buyerPropName.trim().length < 2) {
      setPurchaseError('Enter your property or hotel name.');
      return;
    }
    const combinedBuyerName = `${buyerFirstName.trim()} ${buyerLastName.trim()}`.trim();
    if (!buyerFirstName.trim() || !buyerLastName.trim()) {
      setPurchaseError('Enter your first name and last name.');
      return;
    }
    if (!emailOk) {
      setPurchaseError('Enter a valid work email address.');
      return;
    }
    if (buyerPhone.trim().length < 6) {
      setPurchaseError('Enter a valid phone number.');
      return;
    }

    const totalUsd = getPlanPriceUsd(purchasePlan, purchaseCycle);

    setPurchaseBusy(true);
    try {
      const saved = await submitPublicPlanInquiryWorkflow({
        inquiryType: 'plan_purchase',
        plan: purchasePlan.id,
        billingCycle: purchasePlan.id === 'Lifetime Sovereign' ? 'lifetime' : purchaseCycle,
        estimatedTotalNgn: totalUsd,
        currency: 'USD',
        propertyName: buyerPropName,
        cityState: buyerLocation || 'International',
        roomCount: parsedRooms,
        preferredSubdomain: slugifyIdentifier(buyerPropName),
        contactName: combinedBuyerName,
        contactEmail: buyerEmail,
        contactPhone: buyerPhone,
        paymentOption: buyerPaymentOption,
        message: buyerNotes || `USD plan order for ${purchasePlan.name} (${purchaseCycle})`,
      });
      setPurchaseConfirmation(saved);
    } catch (err) {
      setPurchaseError(
        err instanceof Error
          ? err.message
          : 'Unable to record your order right now. Please try again or email purecresthospitality@gmail.com.'
      );
    } finally {
      setPurchaseBusy(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
    const parsedRooms = Math.max(1, Math.min(5000, Number(contactRooms) || 1));

    const combinedContactName = `${contactFirstName.trim()} ${contactLastName.trim()}`.trim();
    if (!contactFirstName.trim() || !contactLastName.trim()) {
      setContactError('Enter your first name and last name.');
      return;
    }
    if (contactProperty.trim().length < 2) {
      setContactError('Enter your property or hotel group name.');
      return;
    }
    if (!emailOk) {
      setContactError('Enter a valid email address.');
      return;
    }
    if (contactPhone.trim().length < 6) {
      setContactError('Enter a valid phone number.');
      return;
    }

    setContactBusy(true);
    try {
      const saved = await submitPublicPlanInquiryWorkflow({
        inquiryType: 'contact_demo',
        plan: 'Custom',
        billingCycle: 'n/a',
        estimatedTotalNgn: 0,
        currency: 'USD',
        propertyName: contactProperty,
        cityState: 'Sales & Demo Inquiry',
        roomCount: parsedRooms,
        preferredSubdomain: slugifyIdentifier(contactProperty),
        contactName: combinedContactName,
        contactEmail,
        contactPhone,
        paymentOption: contactTopic,
        message: contactMessage || `${contactTopic} requested for ${contactProperty}.`,
      });
      setContactConfirmation(saved);
      setContactFirstName('');
      setContactLastName('');
      setContactProperty('');
      setContactEmail('');
      setContactPhone('');
      setContactMessage('');
    } catch (err) {
      setContactError(
        err instanceof Error
          ? err.message
          : 'Unable to submit your inquiry right now. Please email purecresthospitality@gmail.com.'
      );
    } finally {
      setContactBusy(false);
    }
  };

  return (
    <div id="top" className="min-h-screen bg-[#F4F7FB] text-slate-900">
      {/* Sticky Top Header over Deep Navy Hero */}
      <header className="no-print sticky top-0 z-30 bg-[#061539]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1200px] mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('top');
            }}
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0"
          >
            <PchBrandIcon sizeClass="w-8 h-8" />
            <div className="leading-tight">
              <span className="font-site-title text-lg font-bold text-white tracking-tight block">
                PCH PMS
              </span>
            </div>
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-blue-100/85"
          >
            <button
              type="button"
              onClick={() => scrollToSection('overview')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('capabilities')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Capabilities
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Contact
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleOpenPlatformPortal}
              className="px-4 py-2 text-xs font-bold text-[#061539] bg-[#F5B800] hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              {isSignedIn ? 'Open Workspace' : 'Group Admin Sign In'}
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden p-2 rounded-lg border border-white/15 text-white cursor-pointer"
            >
              {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#061539] px-4 py-3 flex flex-col gap-2 text-sm font-medium text-blue-100">
            <button
              type="button"
              onClick={() => scrollToSection('overview')}
              className="text-left py-2 hover:text-white"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('capabilities')}
              className="text-left py-2 hover:text-white"
            >
              Capabilities
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="text-left py-2 hover:text-white"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className="text-left py-2 hover:text-white"
            >
              Contact
            </button>
          </div>
        )}
      </header>

      <main>
        {/* SECTION 1: EXECUTIVE BLUE HOSPITALITY HERO */}
        <section
          id="overview"
          className="relative overflow-hidden bg-gradient-to-br from-[#061539] via-[#0B245B] to-[#13347D] text-white border-b border-[#1c46be]/30"
        >
          {/* Subtle Architectural Ambient Radial Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 right-0 w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.22)_0%,rgba(6,21,57,0)_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -left-20 w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle,rgba(245,184,0,0.12)_0%,rgba(6,21,57,0)_68%)]"
          />

          <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-12 lg:pt-16 lg:pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold tracking-wide">
                  <span className="text-[#F5B800] uppercase tracking-wider">
                    PureCrest Hospitality
                  </span>
                  <span aria-hidden="true" className="text-blue-300/40">·</span>
                  <span className="text-blue-100/90 font-medium">
                    Property Management Platform
                  </span>
                  <span aria-hidden="true" className="text-blue-300/40">·</span>
                  <span className="text-blue-100/90 font-medium">From $25 USD / mo</span>
                </div>

                <h1 className="font-site-title text-[clamp(2.25rem,4.1vw,3.65rem)] leading-[1.07] font-bold text-white [text-wrap:balance]">
                  Hospitality operations, guest folios, and financial control in one workspace.
                </h1>

                <p className="text-base text-blue-100/85 leading-relaxed max-w-xl">
                  Manage room reservations, front desk check-ins, housekeeping dispatch, restaurant POS, store inventory, and daily FX accounting across independent hotels, resorts, and serviced apartments anywhere in the world.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={() => scrollToSection('pricing')}
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold text-[#061539] bg-[#F5B800] hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-slate-950/25"
                  >
                    <span>Explore Plans from $25 USD</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('contact')}
                    className="px-5 py-3.5 text-sm font-semibold text-white border border-white/25 bg-white/10 hover:bg-white/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer backdrop-blur-sm"
                  >
                    Request Live Demo
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col">
                <div className="relative rounded-2xl p-2 bg-white/10 border border-white/15 shadow-2xl shadow-slate-950/40 backdrop-blur-sm">
                  <div className="relative min-h-[280px] lg:min-h-[410px] rounded-xl overflow-hidden bg-[#061539]">
                    {!heroImgFailed ? (
                      <img
                        src={heroLobbyImg}
                        alt="Contemporary hotel lobby and reception desk powered by PCH PMS"
                        referrerPolicy="no-referrer"
                        onError={() => setHeroImgFailed(true)}
                        className="w-full h-full lg:h-[410px] object-cover object-center"
                      />
                    ) : (
                      <div className="w-full h-full min-h-[300px] bg-gradient-to-br from-[#0B245B] to-[#061539] flex flex-col items-center justify-center p-8 text-center">
                        <Building2 className="w-10 h-10 text-[#F5B800] mb-3" />
                        <p className="font-site-title text-lg font-bold text-white">
                          Unified Hotel &amp; Serviced Apartment Operations
                        </p>
                      </div>
                    )}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#061539]/75 to-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Integrated Blue-Glass 4-Column Proof Strip */}
            <div className="mt-10 pt-7 border-t border-white/15 grid grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5">
                <p className="font-mono-tabular text-2xl font-bold text-[#F5B800]">$25 USD/mo</p>
                <p className="text-xs text-blue-100/80 mt-1">
                  Starter pricing built for 12-room inns up to 300-room resorts
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5">
                <p className="font-mono-tabular text-2xl font-bold text-white">USD &amp; FX</p>
                <p className="text-xs text-blue-100/80 mt-1">
                  Transparent USD licensing plus live daily exchange conversion
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5">
                <p className="font-mono-tabular text-2xl font-bold text-white">iCal Sync</p>
                <p className="text-xs text-blue-100/80 mt-1">
                  Two-way calendar feeds for Booking.com, Airbnb, Expedia &amp; VRBO
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5">
                <p className="font-mono-tabular text-2xl font-bold text-white">24-Hr Setup</p>
                <p className="text-xs text-blue-100/80 mt-1">
                  Guided room rate import, staff role matrix &amp; team onboarding
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: CORE CAPABILITIES (Asymmetric Bento Grid) */}
        <section id="capabilities" className="py-16 lg:py-20 bg-[#F4F7FB] border-b border-slate-200">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1c46be]">
                Core Capabilities
              </p>
              <h2 className="font-site-title text-3xl sm:text-4xl font-bold text-[#061539] [text-wrap:balance]">
                Every department connected in real time, without spreadsheet reconciliation.
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                From reservation intake to front desk check-in, restaurant billing, and monthly P&amp;L statements, every update flows automatically across your property ledger.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {CAPABILITIES.map((cap) => (
                <article
                  key={cap.num}
                  className={`bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm flex flex-col justify-between gap-6 ${
                    cap.spanTwo ? 'lg:col-span-2' : 'lg:col-span-1'
                  }`}
                >
                  <div className="space-y-2.5">
                    <p className="font-mono-tabular text-xs font-bold text-[#1c46be]">
                      {cap.num}
                    </p>
                    <h3 className="font-display text-xl font-bold text-[#061539] tracking-tight">
                      {cap.title}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                      {cap.body}
                    </p>
                  </div>

                  {cap.hasImage === 'suite' && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 aspect-[16/9] max-h-64 bg-slate-100">
                      {!suiteImgFailed ? (
                        <img
                          src={suitePreviewImg}
                          alt="Executive hotel suite managed inside PCH PMS"
                          referrerPolicy="no-referrer"
                          onError={() => setSuiteImgFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                          Suite Inventory &amp; Availability Calendar
                        </div>
                      )}
                    </div>
                  )}

                  {cap.hasImage === 'dining' && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 aspect-[16/9] max-h-64 bg-slate-100">
                      {!diningImgFailed ? (
                        <img
                          src={diningPosImg}
                          alt="Hotel dining and bar point-of-sale workstation"
                          referrerPolicy="no-referrer"
                          onError={() => setDiningImgFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                          Restaurant POS &amp; Room Folio Posting
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 3: BUILT FOR ANY HOSPITALITY PROPERTY */}
        <section className="py-16 lg:py-20 bg-white border-b border-slate-200">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1c46be]">
                Universal Hospitality Fit
              </p>
              <h2 className="font-site-title text-3xl font-bold text-[#061539] [text-wrap:balance]">
                Flexible enough for any property model or region.
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Configure room categories, nightly rates, department access roles, and daily exchange conversions to match how your property operates.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {PROPERTY_TYPES.map((item, idx) => (
                <div
                  key={item.title}
                  className="border border-slate-200 rounded-2xl p-6 bg-[#F8FAFC] hover:border-[#1c46be]/40 transition-colors space-y-2.5"
                >
                  <p className="font-mono-tabular text-xs font-bold text-[#1c46be]">
                    0{idx + 1}.
                  </p>
                  <h3 className="font-display text-base font-bold text-[#061539]">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4: USD PRICING & PLANS (Starting at $25 USD Monthly) */}
        <section id="pricing" className="py-16 lg:py-20 bg-[#F4F7FB] border-b border-slate-200">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div className="max-w-2xl space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#1c46be]">
                  Transparent USD Licensing
                </p>
                <h2 className="font-site-title text-3xl sm:text-4xl font-bold text-[#061539] [text-wrap:balance]">
                  Simple US Dollar plans starting at $25 monthly.
                </h2>
                <p className="text-sm sm:text-base text-slate-600">
                  Start small with our $25/mo Starter tier, save two months with Annual billing, or secure a one-time Lifetime software license.
                </p>
              </div>

              {/* Interactive Billing Cycle Segmented Control */}
              <div
                role="group"
                aria-label="Billing cycle"
                className="inline-flex items-center gap-1 p-1 bg-slate-200/85 rounded-xl self-start lg:self-auto"
              >
                {(
                  [
                    { id: 'monthly', label: 'Monthly' },
                    { id: 'annual', label: 'Annual (2 Months Free)' },
                    { id: 'lifetime', label: 'Lifetime License' },
                  ] as const
                ).map((cycle) => (
                  <button
                    key={cycle.id}
                    type="button"
                    onClick={() => setBillingCycle(cycle.id)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      billingCycle === cycle.id
                        ? 'bg-[#061539] text-white shadow-sm'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    {cycle.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
              {PLANS.map((plan) => {
                const priceUsd = getPlanPriceUsd(plan, billingCycle);
                const cycleSuffix =
                  plan.id === 'Lifetime Sovereign' || billingCycle === 'lifetime'
                    ? 'USD one-time'
                    : billingCycle === 'annual'
                      ? 'USD / year'
                      : 'USD / month';

                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-6 flex flex-col justify-between gap-6 transition-shadow ${
                      plan.featured
                        ? 'bg-gradient-to-b from-[#061539] to-[#0B245B] text-white border-2 border-[#0B245B] shadow-xl'
                        : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span
                            className={`font-mono-tabular ${
                              plan.featured ? 'text-blue-200' : 'text-slate-500'
                            }`}
                          >
                            Up to {plan.maxRooms} rooms
                          </span>
                          {plan.featured && (
                            <span className="font-bold text-[#F5B800]">Most Popular</span>
                          )}
                        </div>
                        <h3
                          className={`font-site-title text-xl font-bold ${
                            plan.featured ? 'text-white' : 'text-[#061539]'
                          }`}
                        >
                          {plan.name}
                        </h3>
                        <p
                          className={`text-xs leading-relaxed min-h-[38px] ${
                            plan.featured ? 'text-blue-100/85' : 'text-slate-600'
                          }`}
                        >
                          {plan.summary}
                        </p>
                      </div>

                      <div
                        className={`pt-3 border-t ${
                          plan.featured ? 'border-white/15' : 'border-slate-100'
                        }`}
                      >
                        <p
                          className={`font-mono-tabular text-3xl font-bold ${
                            plan.featured ? 'text-[#F5B800]' : 'text-[#061539]'
                          }`}
                        >
                          {formatUsd(priceUsd, 0)}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${
                            plan.featured ? 'text-blue-200' : 'text-slate-500'
                          }`}
                        >
                          {cycleSuffix}
                        </p>
                      </div>

                      <ul
                        className={`space-y-2.5 text-xs pt-1 ${
                          plan.featured ? 'text-blue-50' : 'text-slate-700'
                        }`}
                      >
                        {plan.highlights.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                plan.featured ? 'text-[#F5B800]' : 'text-[#1c46be]'
                              }`}
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => openPurchaseModal(plan)}
                      className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        plan.featured
                          ? 'bg-[#F5B800] hover:bg-amber-300 text-[#061539]'
                          : 'bg-[#061539] hover:bg-[#13347D] text-white'
                      }`}
                    >
                      Select {plan.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 5: CONTACT & ONBOARDING FORM (Zero Placeholders) */}
        <section id="contact" className="py-16 lg:py-20 bg-white border-b border-slate-200">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#1c46be]">
                  Sales &amp; Onboarding
                </p>
                <h2 className="font-site-title text-3xl font-bold text-[#061539] [text-wrap:balance]">
                  Request a live demonstration or custom property deployment.
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Share your property name and room capacity. Our onboarding specialists configure your workspace, import initial suite rates, and train your front-office team within 24 hours.
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-200 text-sm">
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-[#0B245B] mt-1 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Licensing &amp; Sales Desk</p>
                    <p className="text-xs text-slate-600 font-mono-tabular">
                      purecresthospitality@gmail.com
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="w-4 h-4 text-[#0B245B] mt-1 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Global Property Coverage</p>
                    <p className="text-xs text-slate-600">
                      Remote deployment and staff onboarding for properties worldwide
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#F4F7FB] border border-slate-200 rounded-2xl p-6 sm:p-8">
              {contactConfirmation ? (
                <div className="bg-white border border-emerald-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2.5 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="font-site-title text-lg font-bold">Inquiry Recorded</h3>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Thank you, <strong>{contactConfirmation.contactName}</strong>. Your inquiry for{' '}
                    <strong>{contactConfirmation.propertyName}</strong> has been logged with reference{' '}
                    <span className="font-mono-tabular font-semibold text-slate-950">
                      {contactConfirmation.referenceCode}
                    </span>
                    . Our onboarding desk will reply to{' '}
                    <span className="font-mono-tabular">{contactConfirmation.contactEmail}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setContactConfirmation(null)}
                    className="px-4 py-2 text-xs font-semibold bg-[#061539] text-white rounded-lg cursor-pointer"
                  >
                    Submit Another Inquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="contact-first-name"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        First Name *
                      </label>
                      <input
                        id="contact-first-name"
                        type="text"
                        required
                        value={contactFirstName}
                        onChange={(e) => setContactFirstName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-last-name"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Last Name *
                      </label>
                      <input
                        id="contact-last-name"
                        type="text"
                        required
                        value={contactLastName}
                        onChange={(e) => setContactLastName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-property-name"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Hotel or Property Name *
                      </label>
                      <input
                        id="contact-property-name"
                        type="text"
                        required
                        value={contactProperty}
                        onChange={(e) => setContactProperty(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-email"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Work Email *
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-phone"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Phone Number *
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        required
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-rooms"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Number of Rooms / Suites
                      </label>
                      <input
                        id="contact-rooms"
                        type="number"
                        min={1}
                        max={2000}
                        value={contactRooms}
                        onChange={(e) => setContactRooms(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white font-mono-tabular text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-topic"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Inquiry Topic
                      </label>
                      <select
                        id="contact-topic"
                        value={contactTopic}
                        onChange={(e) => setContactTopic(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                      >
                        <option value="Request Live Demo">Request Live Demo</option>
                        <option value="Custom Multi-Property Quote">
                          Custom Multi-Property Quote
                        </option>
                        <option value="Data Migration & Setup">Data Migration &amp; Setup</option>
                        <option value="Technical & Licensing Support">
                          Technical &amp; Licensing Support
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Property Requirements or Questions
                    </label>
                    <textarea
                      id="contact-message"
                      rows={3}
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>

                  {contactError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {contactError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <button
                      type="submit"
                      disabled={contactBusy}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#061539] hover:bg-[#13347D] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>{contactBusy ? 'Submitting...' : 'Submit Inquiry'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-500">
                      Direct onboarding response within 1 business day
                    </span>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Navy Executive Footer (Strict Isolation: Zero Property Links) */}
      <footer className="no-print bg-[#061539] text-blue-100 py-10 border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <PchBrandIcon sizeClass="w-9 h-9" />
            <div>
              <p className="font-site-title text-lg font-bold text-white">PCH PMS</p>
              <p className="text-xs text-blue-200/75">
                Hospitality Property Management Platform
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-blue-200">
            <button
              type="button"
              onClick={() => onSelectPortal('pch-admin')}
              className="hover:text-[#F5B800] hover:underline cursor-pointer"
            >
              Group Admin Sign In
            </button>
            <span className="text-white/25">·</span>
            <span className="text-blue-200/75">
              © {new Date().getFullYear()} PureCrest Hospitality
            </span>
          </div>
        </div>
      </footer>

      {/* PURCHASE & PROPERTY ONBOARDING MODAL (USD, Zero Placeholders, No URLs) */}
      {purchasePlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Order ${purchasePlan.name} Plan`}
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 sm:p-8 space-y-6 my-8 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold text-[#9A650B]">
                  Software License Order (USD)
                </p>
                <h2 className="font-site-title text-2xl font-bold text-[#0B245B] mt-0.5">
                  {purchasePlan.name} Plan · Up to {purchasePlan.maxRooms} Rooms
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPurchasePlan(null)}
                aria-label="Close order dialog"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {purchaseConfirmation ? (
              <div className="space-y-5">
                <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <ShieldCheck className="w-5 h-5" />
                    <h3 className="font-site-title text-lg font-bold">
                      License Order Confirmed
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    Your order for <strong>{purchaseConfirmation.propertyName}</strong> has been logged. Our licensing team will issue your activation key and set up your property workspace.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500">Order Reference</span>
                    <span className="font-mono-tabular font-bold text-slate-950">
                      {purchaseConfirmation.referenceCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500">Selected Tier &amp; Cycle</span>
                    <span className="font-semibold text-slate-900 capitalize">
                      {purchaseConfirmation.plan} · {purchaseConfirmation.billingCycle}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500">Property &amp; Rooms</span>
                    <span className="font-semibold text-slate-900">
                      {purchaseConfirmation.propertyName} ({purchaseConfirmation.roomCount} rooms)
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500">Payment Method</span>
                    <span className="font-medium text-slate-900">
                      {purchaseConfirmation.paymentOption}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-semibold text-slate-900">Order Total (USD)</span>
                    <span className="font-mono-tabular text-base font-bold text-[#0B245B]">
                      {formatUsd(purchaseConfirmation.estimatedTotalNgn, 0)} USD
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Proforma</span>
                    </button>
                    <a
                      href={`mailto:purecresthospitality@gmail.com?subject=${encodeURIComponent(
                        `PCH PMS Order ${purchaseConfirmation.referenceCode} - ${purchaseConfirmation.propertyName}`
                      )}&body=${encodeURIComponent(
                        `Order Ref: ${purchaseConfirmation.referenceCode}\nProperty: ${purchaseConfirmation.propertyName}\nPlan: ${purchaseConfirmation.plan} (${purchaseConfirmation.billingCycle})\nTotal: ${formatUsd(purchaseConfirmation.estimatedTotalNgn, 0)} USD\nContact: ${purchaseConfirmation.contactName} (${purchaseConfirmation.contactPhone})`
                      )}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-50"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Email Receipt Copy</span>
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPurchasePlan(null)}
                    className="px-5 py-2 text-xs font-semibold bg-[#0B245B] text-white rounded-lg cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                {purchasePlan.id !== 'Lifetime Sovereign' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Billing Term
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['monthly', 'annual', 'lifetime'] as const).map((cycle) => (
                        <button
                          key={cycle}
                          type="button"
                          onClick={() => setPurchaseCycle(cycle)}
                          className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize cursor-pointer ${
                            purchaseCycle === cycle
                              ? 'border-[#0B245B] bg-blue-50 text-[#0B245B]'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {cycle} · {formatUsd(getPlanPriceUsd(purchasePlan, cycle), 0)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="buyer-prop-name"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Property / Hotel Name *
                    </label>
                    <input
                      id="buyer-prop-name"
                      type="text"
                      required
                      value={buyerPropName}
                      onChange={(e) => setBuyerPropName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-location"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      City &amp; Country
                    </label>
                    <input
                      id="buyer-location"
                      type="text"
                      value={buyerLocation}
                      onChange={(e) => setBuyerLocation(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-rooms"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Total Suites / Rooms
                    </label>
                    <input
                      id="buyer-rooms"
                      type="number"
                      min={1}
                      max={purchasePlan.maxRooms}
                      value={buyerRooms}
                      onChange={(e) => setBuyerRooms(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-first-name"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Administrator First Name *
                    </label>
                    <input
                      id="buyer-first-name"
                      type="text"
                      required
                      value={buyerFirstName}
                      onChange={(e) => setBuyerFirstName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-last-name"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Administrator Last Name *
                    </label>
                    <input
                      id="buyer-last-name"
                      type="text"
                      required
                      value={buyerLastName}
                      onChange={(e) => setBuyerLastName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-email"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Administrator Work Email *
                    </label>
                    <input
                      id="buyer-email"
                      type="email"
                      required
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-phone"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Phone Number *
                    </label>
                    <input
                      id="buyer-phone"
                      type="tel"
                      required
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="buyer-payment"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Payment Method
                    </label>
                    <select
                      id="buyer-payment"
                      value={buyerPaymentOption}
                      onChange={(e) => setBuyerPaymentOption(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    >
                      <option value="Corporate Invoice / Wire Transfer">
                        Corporate Invoice / Wire Transfer
                      </option>
                      <option value="Credit or Debit Card">Credit or Debit Card</option>
                      <option value="Assisted Onboarding Billing">
                        Assisted Onboarding Billing
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="buyer-notes"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Onboarding Notes (Optional)
                    </label>
                    <input
                      id="buyer-notes"
                      type="text"
                      value={buyerNotes}
                      onChange={(e) => setBuyerNotes(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#0B245B]"
                    />
                  </div>
                </div>

                {(() => {
                  const totalUsd = getPlanPriceUsd(purchasePlan, purchaseCycle);
                  return (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5 text-slate-600">
                        <p>
                          Includes isolated property workspace, staff access portal, and onboarding support
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="block text-[11px] text-slate-500">Order Total</span>
                        <span className="font-mono-tabular text-lg font-bold text-[#0B245B]">
                          {formatUsd(totalUsd, 0)} USD
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {purchaseError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {purchaseError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setPurchasePlan(null)}
                    className="px-4 py-2.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={purchaseBusy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0B245B] hover:bg-[#13347D] disabled:opacity-60 text-white rounded-lg cursor-pointer"
                  >
                    <span>{purchaseBusy ? 'Submitting Order...' : 'Complete USD Order'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
