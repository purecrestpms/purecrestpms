import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FileText,
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageCircle,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { useCms } from '../context/CmsContext';
import { sendPropertyMessageWorkflow } from '../services/pmsService';
import {
  PropertyRecord,
  RICHGATES_PROPERTY_INFO,
  ROLE_LABELS,
  ROLE_TO_DEPARTMENT,
  StaffRole,
} from '../types/pms';

interface HelpDocsTrainingViewProps {
  property: PropertyRecord;
  activeRole: StaffRole;
  userEmail: string;
  userName: string;
  onNotify: (msg: string) => void;
}

interface VideoStep {
  title: string;
  caption: string;
  uiBanner: string;
  highlightBox: string;
  actionButton: string;
  metrics: Array<{ label: string; value: string }>;
}

interface TrainingModule {
  id: string;
  title: string;
  roleAudience: string;
  durationSec: number;
  summary: string;
  steps: VideoStep[];
}

const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'vid-checkin',
    title: '1. Front Desk Check-In & Key Issuance Workflow',
    roleAudience: 'Front Desk · Property Admin',
    durationSec: 40,
    summary:
      'Learn how to confirm payment, verify guest KYC ID, assign a suite (RM-1 to RM-8+), mark Key Issued = Yes, and trigger the check-in confirmation.',
    steps: [
      {
        title: 'Open Arrivals or Reservations',
        caption: 'Step 1: Select any confirmed or pending arrival and click Check In to launch the mandatory verification checklist.',
        uiBanner: 'Arrivals -> Pending Guest Verification',
        highlightBox: 'Booking RG-1003 · Barr. Tunde Adeyemi · RM-4',
        actionButton: 'Open Check-In Verification',
        metrics: [
          { label: 'Nightly Rate', value: '₦55,000' },
          { label: 'Deposit Paid', value: '₦110,000' },
          { label: 'Room Readiness', value: 'Inspected' },
        ],
      },
      {
        title: 'Confirm Payment & Verify Guest ID',
        caption: 'Step 2: Confirm outstanding NGN payment method, enter NIN/Passport number, and verify physical ID matches the booking.',
        uiBanner: 'Step 1 & 2 · Payment + KYC Verification',
        highlightBox: 'ID Type: NIN · Verified · Payment Status: Paid',
        actionButton: 'Confirm Payment & ID',
        metrics: [
          { label: 'Payment', value: 'Confirmed' },
          { label: 'Balance Due', value: '₦0' },
          { label: 'KYC Match', value: 'Verified' },
        ],
      },
      {
        title: 'Assign Suite & Issue Key (Yes/No)',
        caption: 'Step 3: Assign suite, verify Housekeeping status is Clean/Inspected, and set Key Issued = Yes before completing check-in.',
        uiBanner: 'Step 3 & 4 · Suite Assignment & Key Issuance',
        highlightBox: 'Suite RM-4 · Key Issued: Yes · Guest Checked In',
        actionButton: 'Complete Check-In ->',
        metrics: [
          { label: 'Suite Status', value: 'Occupied' },
          { label: 'Key Issued', value: 'Yes' },
          { label: 'Folio', value: 'Active' },
        ],
      },
    ],
  },
  {
    id: 'vid-rooms',
    title: '2. Rooms, Nightly Rates & 20-Room License Control',
    roleAudience: 'Property Admin',
    durationSec: 36,
    summary:
      'Add new suites up to Richgates Apartments’ 20-room license ceiling, edit NGN nightly rates, and upload suite photos.',
    steps: [
      {
        title: 'Monitor Licensed Capacity',
        caption: 'Step 1: Open Rooms & Rates to inspect current rooms against the active Richgates 20-room license quota.',
        uiBanner: 'Rooms & Rates · License Usage 8 / 20',
        highlightBox: 'Serviced Apartments (RM-1..RM-3) & Hotel Rooms',
        actionButton: '+ Add New Room',
        metrics: [
          { label: 'Active Suites', value: '8 Rooms' },
          { label: 'License Max', value: '20 Rooms' },
          { label: 'Remaining', value: '12 Slots' },
        ],
      },
      {
        title: 'Create Room & Set Nightly Rate',
        caption: 'Step 2: Fill in Room Code (e.g., RM-9), Section, Room Type, Floor, Nightly Rate (₦), Max Guests, and upload a photo.',
        uiBanner: 'Create New Licensed Room -> Saved',
        highlightBox: 'RM-9 Executive Studio · ₦70,000 / night',
        actionButton: 'Save New Room',
        metrics: [
          { label: 'Code', value: 'RM-9' },
          { label: 'Rate / Night', value: '₦70,000' },
          { label: 'Status', value: 'Vacant' },
        ],
      },
    ],
  },
  {
    id: 'vid-calendar',
    title: '3. Calendar Availability Search & Date Blocking',
    roleAudience: 'Front Desk · Maintenance · Property Admin',
    durationSec: 36,
    summary:
      'Check suite availability by check-in/out dates, click any open calendar cell to create a booking, or place Owner/Maintenance date blocks.',
    steps: [
      {
        title: 'Filter Open Suites by Date Range',
        caption: 'Step 1: Pick Check-In and Check-Out dates (checkout automatically defaults to Check-In + 1 day) to find open suites.',
        uiBanner: 'Availability Calendar · Date Search',
        highlightBox: '4 Suites Available for Selected Stay Dates',
        actionButton: 'Book Open Cell',
        metrics: [
          { label: 'Check-In', value: 'Today' },
          { label: 'Check-Out', value: 'Tomorrow' },
          { label: 'Open Suites', value: '4 Ready' },
        ],
      },
      {
        title: 'Block Dates for Maintenance or VIP Hold',
        caption: 'Step 2: Click Block Room Dates to lock a suite for AC maintenance, deep clean, or VIP hold across OTA & Front Desk.',
        uiBanner: 'Date Block Placed -> Synced to iCal',
        highlightBox: 'RM-6 · Maintenance Hold · Synced to Channels',
        actionButton: 'Save Date Block',
        metrics: [
          { label: 'Block Type', value: 'Maintenance' },
          { label: 'Double Booking', value: 'Blocked' },
          { label: 'iCal Export', value: 'Updated' },
        ],
      },
    ],
  },
  {
    id: 'vid-pos',
    title: '4. Restaurant POS, Purchases Input & Receipt Printing',
    roleAudience: 'Kitchen & F&B · Front Desk · Property Admin',
    durationSec: 38,
    summary:
      'Manage editable POS menu items, record walk-in or room-folio orders with 7.5% VAT, log kitchen purchases, and print customer receipts.',
    steps: [
      {
        title: 'Edit Menu & Ring Up Order',
        caption: 'Step 1: Admins can add/edit menu prices anytime. Staff tap menu items, select Dine-In or Room Folio, and submit.',
        uiBanner: 'Restaurant POS -> Order #POS-910',
        highlightBox: 'Jollof Croaker + Cold Press · 7.5% VAT Auto',
        actionButton: 'Send & Post Order',
        metrics: [
          { label: 'Subtotal', value: '₦23,500' },
          { label: 'VAT (7.5%)', value: '₦1,763' },
          { label: 'Total', value: '₦25,263' },
        ],
      },
      {
        title: 'Record Purchases & Print Thermal Receipt',
        caption: 'Step 2: Log F&B supply purchases straight to Procurement & Accounting, and click Print Receipt for the guest copy.',
        uiBanner: 'POS Receipt & Purchases Ledger',
        highlightBox: 'Richgates Apartments · Official NGN Receipt',
        actionButton: 'Print Receipt',
        metrics: [
          { label: 'Folio Sync', value: 'Posted' },
          { label: 'KDS Queue', value: 'Preparing' },
          { label: 'Receipt', value: 'Print Ready' },
        ],
      },
    ],
  },
  {
    id: 'vid-messaging',
    title: '5. Inter-Departmental Messaging & Bulk Staff Alerts',
    roleAudience: 'All Staff & Property Admin',
    durationSec: 34,
    summary:
      'Coordinate instant department handovers, send urgent room alerts, broadcast bulk messages to selected staff, and monitor the notification bell.',
    steps: [
      {
        title: 'Send Department or Bulk Staff Message',
        caption: 'Step 1: Choose Department, Direct Staff, Bulk Staff multi-select, or All Staff Broadcast, set priority, and click Send.',
        uiBanner: 'Messages & Alerts -> New Dispatch',
        highlightBox: 'Front Desk -> Housekeeping · Urgent Turnover',
        actionButton: 'Send Bulk Message',
        metrics: [
          { label: 'Audience', value: 'Bulk / Dept' },
          { label: 'Priority', value: 'Urgent' },
          { label: 'Delivery', value: 'Instant' },
        ],
      },
      {
        title: 'Acknowledge Alerts from Header Bell',
        caption: 'Step 2: Unread badges appear in the Sidebar and top Bell icon. Click any alert to jump straight to the message and mark read.',
        uiBanner: 'Top Bar Notification Bell · 2 Unread',
        highlightBox: 'Real-Time Toast + Unread Badge Synced',
        actionButton: 'Mark as Read',
        metrics: [
          { label: 'Unread Bell', value: 'Live Count' },
          { label: 'Read Receipts', value: 'Tracked' },
          { label: 'Audit Trail', value: 'Logged' },
        ],
      },
    ],
  },
  {
    id: 'vid-reports',
    title: '6. Management Analytics, P&L & PDF/Excel Export',
    roleAudience: 'Property Admin · Accountant',
    durationSec: 38,
    summary:
      'Analyze real-time occupancy, ADR, RevPAR, profit & loss, booking source performance, inventory costs, and export boardroom PDF/Excel packs.',
    steps: [
      {
        title: 'Filter Period & Compare Performance',
        caption: 'Step 1: Filter by 7 Days, 30 Days, Quarter, Year, or Custom dates with automatic previous-period KPI comparisons.',
        uiBanner: 'Admin Management Reports -> Live KPIs',
        highlightBox: 'Occupancy · ADR · RevPAR · Net Profit Margin',
        actionButton: 'Apply Date Filter',
        metrics: [
          { label: 'RevPAR', value: 'Live DB' },
          { label: 'ADR', value: 'Live DB' },
          { label: 'P&L Margin', value: 'Auto-Calc' },
        ],
      },
      {
        title: 'Export Executive PDF & Multi-Sheet Excel',
        caption: 'Step 2: Export formatted Excel spreadsheets (.xls) or print clean executive PDF packs connected directly to Firestore.',
        uiBanner: 'Export Boardroom Pack (.xls / PDF)',
        highlightBox: 'Zero Dummy Data · 100% Live PMS Records',
        actionButton: 'Export Excel / PDF',
        metrics: [
          { label: 'Charts', value: 'Bar / Line / Pie' },
          { label: 'Data Source', value: 'Firestore Live' },
          { label: 'Access', value: 'Admin Only' },
        ],
      },
    ],
  },
];

const DOC_TOPICS = [
  {
    id: 'doc-checkin',
    category: 'Front Desk',
    title: 'Mandatory Guest Check-In & Room Change Rules',
    summary:
      'Every arrival and walk-in must confirm payment, verify guest ID (NIN/Passport/Driver License), assign an available suite, and confirm Key Issued = Yes.',
    bullets: [
      'Use Walk-in Check-in for immediate arrivals; checkout automatically defaults to Tomorrow and blocks invalid earlier checkout dates.',
      'For existing Confirmed or Pending bookings, click Check In from Arrivals or Reservations to run the 4-step verification modal.',
      'To relocate an In-House guest, open their reservation row or Folio and click Change Room to pick a vacant suite and optionally adjust the nightly rate.',
    ],
  },
  {
    id: 'doc-rooms',
    category: 'Inventory & License',
    title: 'Adding Suites & Richgates 20-Room License Limit',
    summary:
      'Richgates Apartments operates under an active Lifetime Sovereign license capped at 20 rooms maximum across Serviced Apartments and Hotel Rooms.',
    bullets: [
      'Property Administrators can click + Add New Room inside Rooms & Rates to register new suites (e.g. RM-9 through RM-20).',
      'Room creation automatically checks current room count against the 20-room Richgates ceiling and blocks creation once 20 rooms exist.',
      'Nightly Naira rates and suite photos can be edited anytime via Manage Suite or the inline Rate button.',
    ],
  },
  {
    id: 'doc-pos',
    category: 'Kitchen & POS',
    title: 'POS Menu Editing, Kitchen Purchases & Receipts',
    summary:
      'Restaurant POS supports instant dining, bar, and room-folio billing with 7.5% VAT and printed receipts.',
    bullets: [
      'Admins can add, edit price/cost, or toggle availability on menu items directly inside Restaurant POS & KDS.',
      'Use Record Purchase inside POS to log kitchen/bar ingredient purchases directly into Procurement & the Accounting Ledger.',
      'Click Print Receipt on any completed order to produce a clean Richgates Apartments thermal/A4 receipt.',
    ],
  },
  {
    id: 'doc-messaging',
    category: 'Communications',
    title: 'Inter-Departmental Messaging & Bulk Staff Broadcasts',
    summary:
      'Keep Front Desk, Housekeeping, Kitchen, Accounts, Maintenance, and Management synchronized with live read-tracked alerts.',
    bullets: [
      'All staff roles can send Department or Direct Staff messages.',
      'Property Administrators can send Bulk Staff messages (multi-select employees) or All Staff Broadcasts.',
      'New incoming messages trigger toast alerts, increment the Sidebar badge, and appear in the top Notification Bell.',
    ],
  },
  {
    id: 'doc-channels',
    category: 'Channel Manager',
    title: 'Two-Way iCal (.ics) Sync with Airbnb, Booking.com & VRBO',
    summary:
      'Prevent double bookings by linking inbound and outbound iCal feeds per suite or property-wide.',
    bullets: [
      'Click Add Channel / iCal Link inside Channel Manager & iCal to paste an OTA .ics feed URL and set the guest booking currency (NGN, USD, GBP, EUR).',
      'Copy the Outbound Property iCal Export Feed URL or download the .ics file to paste back into Airbnb or Booking.com.',
    ],
  },
  {
    id: 'doc-branding',
    category: 'Branding & Property Profile',
    title: 'Property Logo & Official Contact Setup',
    summary:
      'Updating your property logo updates your Property Portal workspace, guest receipts, and executive reports.',
    bullets: [
      'Upload or change the property logo inside Admin & Property Profile.',
      'Your official address, phone number, email, and WhatsApp contacts sync automatically to guest receipts and dashboards.',
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'Why can I not add a 21st room on Richgates Apartments?',
    a: 'Richgates Apartments is bound to a 20-room maximum software license ceiling. Contact Licensing Support if your property expands beyond 20 units.',
  },
  {
    q: 'Where does uploading the property logo apply?',
    a: 'Property logos apply directly to the Property Admin Portal, Staff Portal, Dashboard, Guest Receipts, and Exported Reports.',
  },
  {
    q: 'How do I receive new message alerts immediately?',
    a: 'Watch the Notification Bell in the top header and the unread counter on Messages & Alerts in the sidebar. Clicking a message marks it as read across your session.',
  },
  {
    q: 'Why did my Check-In button stay disabled?',
    a: 'All mandatory steps must be satisfied: suite assigned, payment confirmed, valid guest ID entered & verified, suite readiness confirmed, and Key Issued set to Yes.',
  },
];

export const HelpDocsTrainingView: React.FC<HelpDocsTrainingViewProps> = ({
  property,
  activeRole,
  userEmail,
  userName,
  onNotify,
}) => {
  const { cms } = useCms();
  const [activeTab, setActiveTab] = useState<'videos' | 'docs' | 'help'>('videos');

  // Video player state
  const [selectedVideoId, setSelectedVideoId] = useState<string>(TRAINING_MODULES[0].id);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5>(1);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [completedVideos, setCompletedVideos] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pch_pms_completed_training');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [customVideoUrl, setCustomVideoUrl] = useState('');
  const [showCustomVideo, setShowCustomVideo] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Docs search
  const [docSearch, setDocSearch] = useState('');

  // Help support message form
  const [helpSubject, setHelpSubject] = useState('');
  const [helpBody, setHelpBody] = useState('');
  const [helpUrgent, setHelpUrgent] = useState(false);
  const [sendingHelp, setSendingHelp] = useState(false);

  const activeModule = useMemo(
    () => TRAINING_MODULES.find((m) => m.id === selectedVideoId) || TRAINING_MODULES[0],
    [selectedVideoId]
  );

  const currentStepIndex = Math.min(
    activeModule.steps.length - 1,
    Math.floor((progressPct / 100) * activeModule.steps.length)
  );
  const currentStep = activeModule.steps[currentStepIndex];

  // Smooth interactive playback ticker
  useEffect(() => {
    if (!isPlaying || showCustomVideo) return;
    const stepMs = 80;
    const increment = (100 / (activeModule.durationSec * 1000)) * stepMs * playbackSpeed;
    const timer = window.setInterval(() => {
      setProgressPct((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          setIsPlaying(false);
          setCompletedVideos((done) => {
            if (done.includes(activeModule.id)) return done;
            const updated = [...done, activeModule.id];
            try {
              localStorage.setItem('pch_pms_completed_training', JSON.stringify(updated));
            } catch {
              // ignore storage error
            }
            return updated;
          });
          return 100;
        }
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeed, activeModule, showCustomVideo]);

  // Animated Canvas Walkthrough Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || showCustomVideo) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background slate dashboard frame
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Sidebar mockup
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(16, 16, 150, H - 32);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(28, 30, 28, 28, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText('Richgates PMS', 64, 48);

    // Sidebar mock nav rows
    const navItems = ['Dashboard', 'Reservations', 'Rooms & Rates', 'POS & KDS', 'Messages', 'Reports'];
    navItems.forEach((label, idx) => {
      const y = 84 + idx * 34;
      const isHighlighted = idx === (currentStepIndex % navItems.length);
      if (isHighlighted) {
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.roundRect(24, y - 16, 134, 26, 6);
        ctx.fill();
      }
      ctx.fillStyle = isHighlighted ? '#ffffff' : '#94a3b8';
      ctx.font = isHighlighted ? 'bold 11px Inter, sans-serif' : '11px Inter, sans-serif';
      ctx.fillText(label, 34, y);
    });

    // Main Workspace Canvas Card
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(182, 16, W - 198, H - 32, 12);
    ctx.fill();

    // Top bar inside workspace
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(198, 30, W - 230, 44, 8);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(198, 30, W - 230, 44);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(currentStep.uiBanner, 214, 57);

    // Step Tag top right
    ctx.fillStyle = '#ecfdf5';
    ctx.beginPath();
    ctx.roundRect(W - 140, 40, 96, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText(`Step ${currentStepIndex + 1} of ${activeModule.steps.length}`, W - 126, 56);

    // 3 Metric Cards
    const cardW = (W - 254) / 3;
    currentStep.metrics.forEach((m, i) => {
      const cx = 198 + i * (cardW + 12);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cx, 90, cardW, 74, 8);
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(cx, 90, cardW, 74);

      ctx.fillStyle = '#64748b';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(m.label, cx + 14, 114);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillText(m.value, cx + 14, 144);
    });

    // Highlighted Workflow Box
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(198, 182, W - 230, 116, 10);
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(198, 182, W - 230, 116);
    ctx.lineWidth = 1;

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(currentStep.title.toUpperCase(), 216, 208);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillText(currentStep.highlightBox, 216, 238);

    // Animated Action Button + Moving Pointer
    const btnX = W - 210;
    const btnY = 248;
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, 160, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(currentStep.actionButton, btnX + 16, btnY + 21);

    // Animated pointer gliding across workflow card
    const phase = (progressPct * 3.5) % 100;
    const ptrX = 240 + ((btnX + 75 - 240) * Math.min(100, phase)) / 100;
    const ptrY = 230 + Math.sin(progressPct * 0.25) * 14;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ptrX, ptrY);
    ctx.lineTo(ptrX + 14, ptrY + 12);
    ctx.lineTo(ptrX + 6, ptrY + 13);
    ctx.lineTo(ptrX + 4, ptrY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtitle Captions Strip at bottom of frame
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(198, H - 72, W - 230, 44, 8);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(currentStep.caption.slice(0, 92), 214, H - 45);
  }, [activeModule, currentStep, currentStepIndex, progressPct, showCustomVideo]);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return DOC_TOPICS;
    return DOC_TOPICS.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.bullets.some((b) => b.toLowerCase().includes(q))
    );
  }, [docSearch]);

  const handleSendHelpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpSubject.trim() || !helpBody.trim()) return;
    setSendingHelp(true);
    try {
      await sendPropertyMessageWorkflow({
        property,
        senderName: userName,
        senderRole: ROLE_LABELS[activeRole],
        senderDepartment: ROLE_TO_DEPARTMENT[activeRole],
        recipientScope: 'department',
        targetDepartment: 'Management',
        recipientEmails: property.authorizedEmails,
        recipientNames: ['Management & Support Desk'],
        subject: `[Help Request] ${helpSubject.trim()}`,
        body: helpBody.trim(),
        priority: helpUrgent ? 'Urgent' : 'Normal',
      });
      onNotify('Help request dispatched to Property Management & Support Desk');
      setHelpSubject('');
      setHelpBody('');
      setHelpUrgent(false);
    } finally {
      setSendingHelp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {cms.pages.training_help?.title || 'PMS Documentation, Video Training & Help Desk'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cms.pages.training_help?.subtitle ||
              'Interactive video walkthroughs, standard operating procedures, and direct support contacts for every department.'}
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
              activeTab === 'videos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-emerald-700" />
            <span>Video Training ({completedVideos.length}/{TRAINING_MODULES.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
              activeTab === 'docs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-700" />
            <span>Documentation &amp; SOPs</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
              activeTab === 'help' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <LifeBuoy className="w-3.5 h-3.5 text-amber-700" />
            <span>Help &amp; Support</span>
          </button>
        </div>
      </div>

      {/* TAB 1: INTERACTIVE VIDEO TRAINING */}
      {activeTab === 'videos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Module Playlist */}
          <div className="lg:col-span-4 space-y-2.5">
            {TRAINING_MODULES.map((mod) => {
              const active = mod.id === activeModule.id;
              const done = completedVideos.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    setSelectedVideoId(mod.id);
                    setProgressPct(0);
                    setIsPlaying(true);
                    setShowCustomVideo(false);
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                    active
                      ? 'bg-emerald-50/70 border-emerald-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">{mod.title}</span>
                    {done && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">{mod.summary}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span className="font-semibold text-slate-700">{mod.roleAudience}</span>
                    <span className="font-mono-tabular">{mod.durationSec}s walkthrough</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Video Walkthrough Player */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                  {activeModule.roleAudience}
                </p>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {activeModule.title}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowCustomVideo((v) => !v)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {showCustomVideo ? 'Interactive Walkthrough' : 'Custom Video Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!completedVideos.includes(activeModule.id)) {
                      const updated = [...completedVideos, activeModule.id];
                      setCompletedVideos(updated);
                      try {
                        localStorage.setItem('pch_pms_completed_training', JSON.stringify(updated));
                      } catch {
                        // ignore
                      }
                      onNotify(`Completed training: ${activeModule.title}`);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                    completedVideos.includes(activeModule.id)
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-900 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {completedVideos.includes(activeModule.id) ? 'Completed' : 'Mark Completed'}
                  </span>
                </button>
              </div>
            </div>

            {showCustomVideo ? (
              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                <label className="block font-semibold text-slate-700">
                  Attach Property Training Video File URL (.mp4 / .webm)
                </label>
                <input
                  type="url"
                  value={customVideoUrl}
                  onChange={(e) => setCustomVideoUrl(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono-tabular"
                />
                {customVideoUrl.trim() ? (
                  <video
                    src={customVideoUrl.trim()}
                    controls
                    className="w-full rounded-xl bg-slate-950 aspect-video"
                  />
                ) : (
                  <div className="aspect-video rounded-xl bg-slate-900 text-slate-300 flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <Video className="w-8 h-8 text-slate-400" />
                    <p>Paste an MP4/WebM training recording URL above, or switch back to the Interactive Walkthrough Player.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                  <canvas
                    ref={canvasRef}
                    width={840}
                    height={420}
                    className="w-full h-auto block"
                  />
                </div>

                {/* Controls & Scrubber */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (progressPct >= 100) setProgressPct(0);
                          setIsPlaying((p) => !p);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlaying ? 'Pause' : progressPct >= 100 ? 'Replay' : 'Play'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProgressPct(0);
                          setIsPlaying(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restart</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlaybackSpeed((s) => (s === 1 ? 1.5 : 1))}
                        className="px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg font-mono-tabular font-semibold text-slate-700 cursor-pointer"
                      >
                        {playbackSpeed}x
                      </button>
                    </div>

                    <span className="font-mono-tabular text-slate-600">
                      {Math.round((progressPct / 100) * activeModule.durationSec)}s /{' '}
                      {activeModule.durationSec}s
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(progressPct)}
                    onChange={(e) => setProgressPct(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />

                  {/* Chapters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {activeModule.steps.map((step, idx) => {
                      const isCurrent = idx === currentStepIndex;
                      return (
                        <button
                          key={step.title}
                          type="button"
                          onClick={() => {
                            setProgressPct((idx / activeModule.steps.length) * 100 + 2);
                            setIsPlaying(true);
                          }}
                          className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-white border-emerald-500 text-slate-900'
                              : 'bg-slate-100/70 border-slate-200 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <p className="text-[10px] font-bold text-emerald-700">
                            Chapter {idx + 1}
                          </p>
                          <p className="font-semibold text-[11px] truncate">{step.title}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DOCUMENTATION & SOPs */}
      {activeTab === 'docs' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <FileText className="w-4 h-4 text-emerald-700" />
              <span>Standard Operating Procedures &amp; Operator Reference</span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                aria-label="Search documentation"
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-semibold">
                    {doc.category}
                  </span>
                  <Sparkles className="w-4 h-4 text-slate-300" />
                </div>
                <h2 className="font-display text-sm font-bold text-slate-900">{doc.title}</h2>
                <p className="text-xs text-slate-600 leading-relaxed">{doc.summary}</p>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {doc.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Role Access Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Department Role Access Reference
              </h2>
            </div>
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${
                activeRole === 'pch_admin' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
              } gap-3 text-xs`}
            >
              {(
                [
                  ...(activeRole === 'pch_admin'
                    ? ([
                        [
                          'PCH Super Admin',
                          'Multi-property management, Licensing, RBAC & Audit Logs, Cloudflare Deploy, CMS',
                        ],
                      ] as const)
                    : []),
                  [
                    'Property Admin (GM)',
                    'All Richgates operations, Rooms (up to 20), Bulk Staff Messaging, Channel Manager, Reports',
                  ],
                  [
                    'Front Desk',
                    'Reservations, Calendar, Arrivals, In-House, Walk-in Check-in, Guest Folios, Messages',
                  ],
                  [
                    'Housekeeping / Kitchen / Maint',
                    'Department tasks, Store inventory, Shifts, Messaging & Training',
                  ],
                ] as const
              ).map(([title, scope]) => (
                <div key={title} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <p className="font-bold text-slate-900">{title}</p>
                  <p className="text-[11px] text-slate-600">{scope}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HELP & SUPPORT DESK */}
      {activeTab === 'help' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-700" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Frequently Asked Questions
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {FAQ_ITEMS.map((item) => (
                  <div key={item.q} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <p className="text-xs font-bold text-slate-900">{item.q}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Richgates Apartments Support Contacts
              </h3>
              <p className="text-slate-600">
                {property.address || RICHGATES_PROPERTY_INFO.address}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href={`tel:${(property.phone || RICHGATES_PROPERTY_INFO.phone).replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-slate-800 hover:text-emerald-700"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{property.phone || RICHGATES_PROPERTY_INFO.phone}</span>
                </a>
                <a
                  href={RICHGATES_PROPERTY_INFO.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Support</span>
                </a>
                <a
                  href={`mailto:${property.email || RICHGATES_PROPERTY_INFO.email}`}
                  className="inline-flex items-center gap-1.5 text-slate-700 hover:text-emerald-700"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{property.email || RICHGATES_PROPERTY_INFO.email}</span>
                </a>
              </div>
            </div>
          </div>

          {/* Direct Help Message Form */}
          <form
            onSubmit={handleSendHelpRequest}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 text-xs h-fit"
          >
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Request Admin or Technical Help
              </h2>
              <p className="text-slate-500 mt-0.5">
                Sends a live priority alert directly to Property Management via PMS Messaging.
              </p>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Issue / Topic *</label>
              <input
                required
                type="text"
                value={helpSubject}
                onChange={(e) => setHelpSubject(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Details *</label>
              <textarea
                required
                rows={4}
                value={helpBody}
                onChange={(e) => setHelpBody(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={helpUrgent}
                onChange={(e) => setHelpUrgent(e.target.checked)}
                className="rounded border-slate-300 text-rose-600"
              />
              <span>Mark as Urgent Alert for immediate attention</span>
            </label>

            <button
              type="submit"
              disabled={sendingHelp}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingHelp ? 'Sending Request...' : 'Send Help Request'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
