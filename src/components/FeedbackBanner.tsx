import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type FeedbackVariant = 'error' | 'warning' | 'success' | 'info';

interface FeedbackBannerProps {
  message: string | null | undefined;
  variant?: FeedbackVariant;
  title?: string;
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<
  FeedbackVariant,
  {
    container: string;
    icon: React.ComponentType<{ className?: string }>;
    iconClass: string;
    dismissClass: string;
  }
> = {
  error: {
    container: 'bg-rose-50 border-rose-200 text-rose-900',
    icon: AlertCircle,
    iconClass: 'text-rose-600',
    dismissClass: 'text-rose-600 hover:text-rose-900 hover:bg-rose-100',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-950',
    icon: AlertTriangle,
    iconClass: 'text-amber-600',
    dismissClass: 'text-amber-700 hover:text-amber-950 hover:bg-amber-100',
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200 text-emerald-950',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    dismissClass: 'text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100',
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-[#061f4d]',
    icon: Info,
    iconClass: 'text-[#0a367a]',
    dismissClass: 'text-[#0a367a] hover:text-[#061f4d] hover:bg-blue-100',
  },
};

export const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  message,
  variant = 'error',
  title,
  onDismiss,
  className = '',
}) => {
  if (!message) return null;
  const cfg = VARIANT_STYLES[variant];
  const Icon = cfg.icon;

  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-start justify-between gap-3 ${cfg.container} ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.iconClass}`} />
        <div className="min-w-0 leading-relaxed">
          {title && <p className="font-semibold mb-0.5">{title}</p>}
          <p className="font-medium break-words">{message}</p>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className={`p-1 rounded-md transition-colors shrink-0 cursor-pointer ${cfg.dismissClass}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
