import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';
import { saveMyUserProfile, updatePropertyProfile } from '../services/pmsService';
import {
  LicenseRecord,
  PropertyRecord,
  RICHGATES_PROPERTY_INFO,
  ROLE_LABELS,
  StaffRole,
  UserRoleProfile,
} from '../types/pms';
import { useCms } from '../context/CmsContext';

interface ProfileViewProps {
  property: PropertyRecord;
  activeLicense?: LicenseRecord;
  activeRole: StaffRole;
  userEmail: string;
  userUid: string;
  defaultDisplayName: string;
  userProfile: UserRoleProfile | null;
  onNotify: (msg: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  property,
  activeLicense,
  activeRole,
  userEmail,
  userUid,
  defaultDisplayName,
  userProfile,
  onNotify,
}) => {
  const { cms } = useCms();
  const canManageProperty = activeRole === 'pch_admin' || activeRole === 'property_admin';

  // Personal Admin / Staff Profile state
  const initialNameParts = (
    userProfile?.displayName ||
    defaultDisplayName ||
    'Property Administrator'
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const [firstName, setFirstName] = useState(initialNameParts[0] || '');
  const [lastName, setLastName] = useState(initialNameParts.slice(1).join(' ') || '');
  const [jobTitle, setJobTitle] = useState(userProfile?.jobTitle || ROLE_LABELS[activeRole]);
  const [phone, setPhone] = useState(userProfile?.phone || property.phone || RICHGATES_PROPERTY_INFO.phone);
  const [whatsapp, setWhatsapp] = useState(
    userProfile?.whatsapp || property.whatsapp || RICHGATES_PROPERTY_INFO.whatsapp
  );
  const [notes, setNotes] = useState(userProfile?.notes || '');
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Property Info & Contact state
  const [propName, setPropName] = useState(property.name || RICHGATES_PROPERTY_INFO.name);
  const [propAddress, setPropAddress] = useState(property.address || RICHGATES_PROPERTY_INFO.address);
  const [propPhone, setPropPhone] = useState(property.phone || RICHGATES_PROPERTY_INFO.phone);
  const [propWhatsapp, setPropWhatsapp] = useState(
    property.whatsapp || RICHGATES_PROPERTY_INFO.whatsapp
  );
  const [propEmail, setPropEmail] = useState(property.email || RICHGATES_PROPERTY_INFO.email);
  const [savingProp, setSavingProp] = useState(false);

  useEffect(() => {
    const parts = (
      userProfile?.displayName ||
      defaultDisplayName ||
      'Property Administrator'
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setJobTitle(userProfile?.jobTitle || ROLE_LABELS[activeRole]);
    setPhone(userProfile?.phone || property.phone || RICHGATES_PROPERTY_INFO.phone);
    setWhatsapp(userProfile?.whatsapp || property.whatsapp || RICHGATES_PROPERTY_INFO.whatsapp);
    setNotes(userProfile?.notes || '');
  }, [userProfile, defaultDisplayName, activeRole, property.phone, property.whatsapp]);

  useEffect(() => {
    setPropName(property.name || RICHGATES_PROPERTY_INFO.name);
    setPropAddress(property.address || RICHGATES_PROPERTY_INFO.address);
    setPropPhone(property.phone || RICHGATES_PROPERTY_INFO.phone);
    setPropWhatsapp(property.whatsapp || RICHGATES_PROPERTY_INFO.whatsapp);
    setPropEmail(property.email || RICHGATES_PROPERTY_INFO.email);
  }, [property]);

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedDisplay = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim() || !lastName.trim()) return;
    setSavingPersonal(true);
    try {
      await saveMyUserProfile({
        propertyId: property.id,
        role: activeRole,
        existingProfile: userProfile,
        displayName: combinedDisplay,
        phone,
        whatsapp,
        jobTitle,
        notes,
      });
      onNotify('Saved your administrator profile');
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageProperty) return;
    setSavingProp(true);
    try {
      await updatePropertyProfile({
        property,
        updates: {
          name: propName.trim() || property.name,
          address: propAddress.trim() || property.address,
          phone: propPhone.trim(),
          whatsapp: propWhatsapp.trim(),
          email: propEmail.trim(),
        },
        actorRole: ROLE_LABELS[activeRole],
      });
      onNotify('Updated property contact & address profile');
    } finally {
      setSavingProp(false);
    }
  };

  const cleanWaNumber = (propWhatsapp || RICHGATES_PROPERTY_INFO.whatsapp).replace(/[^0-9]/g, '');
  const whatsappHref = cleanWaNumber ? `https://wa.me/${cleanWaNumber}` : RICHGATES_PROPERTY_INFO.whatsappUrl;

  const fullDisplayName = `${firstName} ${lastName}`.trim();
  const initials = (fullDisplayName || userEmail || 'PA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl text-white font-display font-bold text-base flex items-center justify-center shrink-0 ${
              activeRole === 'pch_admin' ? 'bg-[#1c46be]' : 'bg-[#0B245B]'
            }`}
          >
            {activeRole === 'pch_admin' ? (
              <ShieldCheck className="w-5 h-5" />
            ) : (
              initials || 'PA'
            )}
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              {cms.pages.profile.title}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {cms.pages.profile.subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg self-start sm:self-center">
          <ShieldCheck className="w-4 h-4" />
          <span>{ROLE_LABELS[activeRole]}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Admin / Staff Profile Form */}
        <form
          onSubmit={handleSavePersonal}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserCircle2 className="w-4 h-4 text-emerald-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                My Administrator Profile
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Active Session</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">First Name *</label>
              <input
                required
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
              <input
                required
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Title / Designation</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Account Email</label>
              <input
                type="email"
                value={userEmail}
                disabled
                className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Direct Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">WhatsApp Number</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Handover / Shift Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
            <span className="font-mono-tabular text-[11px] text-slate-400 truncate max-w-[200px]">
              ID: {userUid}
            </span>
            <button
              type="submit"
              disabled={savingPersonal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingPersonal ? 'Saving...' : 'Save Personal Profile'}</span>
            </button>
          </div>
        </form>

        {/* Property Contact & Address Profile */}
        <form
          onSubmit={handleSaveProperty}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Property Address &amp; Official Contact
              </h2>
            </div>
            <span className="font-mono-tabular text-[11px] font-semibold text-slate-500">
              {property.code}
            </span>
          </div>

          {/* Live Contact Card Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
            <p className="font-display font-bold text-slate-900">{propName}</p>
            <p className="flex items-start gap-2 text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
              <span>{propAddress}</span>
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                href={`tel:${propPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 font-mono-tabular text-slate-800 hover:text-emerald-700"
              >
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>{propPhone}</span>
              </a>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
              <a
                href={`mailto:${propEmail}`}
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-emerald-700"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>{propEmail}</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Property Name</label>
              <input
                type="text"
                disabled={!canManageProperty}
                value={propName}
                onChange={(e) => setPropName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Street Address</label>
              <input
                type="text"
                disabled={!canManageProperty}
                value={propAddress}
                onChange={(e) => setPropAddress(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Front Desk Phone</label>
              <input
                type="text"
                disabled={!canManageProperty}
                value={propPhone}
                onChange={(e) => setPropPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">WhatsApp Line</label>
              <input
                type="text"
                disabled={!canManageProperty}
                value={propWhatsapp}
                onChange={(e) => setPropWhatsapp(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono-tabular disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Support &amp; Booking Email</label>
              <input
                type="email"
                disabled={!canManageProperty}
                value={propEmail}
                onChange={(e) => setPropEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 disabled:bg-slate-50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
              <span className="font-mono-tabular">
                {activeLicense?.licenseKey || property.licenseKey || 'Active License'}
              </span>
            </span>
            {canManageProperty && (
              <button
                type="submit"
                disabled={savingProp}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingProp ? 'Updating...' : cms.pages.profile.ctaLabel || 'Update Property Info'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
