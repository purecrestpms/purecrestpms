import React, { useEffect, useState } from 'react';
import {
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Expand,
  Laptop,
  ShieldCheck,
  ShowerHead,
  Sofa,
  Sun,
  Tv,
  UtensilsCrossed,
  Wifi,
  Wind,
  X,
  Zap,
} from 'lucide-react';

export interface GallerySlideItem {
  url: string;
  label: string;
}

const FALLBACK_ROOM_IMAGE =
  '/assets/aistudio/96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png';

export function getAmenityIcon(amenity: string): React.ComponentType<{ className?: string }> {
  const lower = amenity.toLowerCase();
  if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('starlink') || lower.includes('internet')) {
    return Wifi;
  }
  if (lower.includes('tv') || lower.includes('ps5') || lower.includes('smart')) {
    return Tv;
  }
  if (lower.includes('kitchen') || lower.includes('dining') || lower.includes('bar')) {
    return UtensilsCrossed;
  }
  if (lower.includes('coffee') || lower.includes('tea')) {
    return Coffee;
  }
  if (lower.includes('power') || lower.includes('inverter') || lower.includes('diesel')) {
    return Zap;
  }
  if (lower.includes('ac') || lower.includes('air')) {
    return Wind;
  }
  if (lower.includes('shower') || lower.includes('bath') || lower.includes('en-suite')) {
    return ShowerHead;
  }
  if (lower.includes('desk') || lower.includes('workspace') || lower.includes('work')) {
    return Laptop;
  }
  if (lower.includes('balcony') || lower.includes('view')) {
    return Sun;
  }
  if (lower.includes('lounge') || lower.includes('living') || lower.includes('parlour') || lower.includes('armchair')) {
    return Sofa;
  }
  if (lower.includes('bed') || lower.includes('king') || lower.includes('queen')) {
    return BedDouble;
  }
  if (lower.includes('vip') || lower.includes('service') || lower.includes('security')) {
    return ShieldCheck;
  }
  return Check;
}

interface RoomGallerySliderProps {
  slides: GallerySlideItem[];
  roomNumber: string;
  roomName: string;
  heightClass?: string;
  showThumbnails?: boolean;
  onImageClick?: () => void;
  overlayTopRight?: React.ReactNode;
  overlayBottom?: React.ReactNode;
}

export const RoomGallerySlider: React.FC<RoomGallerySliderProps> = ({
  slides,
  roomNumber,
  roomName,
  heightClass = 'h-48',
  showThumbnails = false,
  onImageClick,
  overlayTopRight,
  overlayBottom,
}) => {
  const safeSlides: GallerySlideItem[] =
    slides.length > 0
      ? slides
      : [{ url: FALLBACK_ROOM_IMAGE, label: `${roomNumber} — ${roomName}` }];

  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (activeIndex >= safeSlides.length) {
      setActiveIndex(0);
    }
  }, [safeSlides.length, activeIndex]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev + 1) % safeSlides.length);
      }
      if (e.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev - 1 + safeSlides.length) % safeSlides.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, safeSlides.length]);

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + safeSlides.length) % safeSlides.length);
  };

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % safeSlides.length);
  };

  const currentSlide = safeSlides[activeIndex] || safeSlides[0];

  return (
    <div className="space-y-2.5">
      <div
        onClick={onImageClick}
        className={`${heightClass} bg-slate-100 relative overflow-hidden group select-none ${
          onImageClick ? 'cursor-pointer' : ''
        }`}
      >
        <img
          src={currentSlide.url || FALLBACK_ROOM_IMAGE}
          alt={`${roomNumber} — ${currentSlide.label}`}
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = FALLBACK_ROOM_IMAGE;
          }}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-slate-950/25" />

        {/* Slide counter + fullscreen trigger (top-left) */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
          {safeSlides.length > 1 && (
            <span className="px-2 py-0.5 rounded-md bg-slate-950/75 text-white font-mono-tabular text-[10px] font-semibold backdrop-blur-xs">
              {activeIndex + 1} / {safeSlides.length}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
            title="Expand photo gallery"
            aria-label={`Expand ${roomNumber} photo gallery`}
            className="p-1.5 rounded-md bg-slate-950/75 hover:bg-slate-950 text-white backdrop-blur-xs transition-colors cursor-pointer"
          >
            <Expand className="w-3 h-3" />
          </button>
        </div>

        {/* Optional top-right action slot */}
        {overlayTopRight && (
          <div className="absolute top-2.5 right-2.5 z-10">{overlayTopRight}</div>
        )}

        {/* Prev / Next arrows */}
        {safeSlides.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous room photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white flex items-center justify-center transition-opacity cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next room photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white flex items-center justify-center transition-opacity cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Dot indicators (above bottom overlay or bottom-center) */}
        {safeSlides.length > 1 && !showThumbnails && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 ${
              overlayBottom ? 'bottom-12' : 'bottom-2.5'
            }`}
          >
            {safeSlides.map((s, idx) => (
              <button
                key={`${s.url}-${idx}`}
                type="button"
                aria-label={`View slide ${idx + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === activeIndex
                    ? 'w-5 bg-white'
                    : 'w-1.5 bg-white/60 hover:bg-white/90'
                }`}
              />
            ))}
          </div>
        )}

        {/* Optional bottom overlay */}
        {overlayBottom && (
          <div className="absolute bottom-2.5 left-3 right-3 z-10">{overlayBottom}</div>
        )}
      </div>

      {/* Clickable Thumbnail Strip (for Room Detail View) */}
      {showThumbnails && safeSlides.length > 1 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {safeSlides.map((slide, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <button
                key={`${slide.url}-${idx}`}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`relative h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#061539] ring-2 ring-[#061539]/20'
                    : 'border-slate-200 opacity-75 hover:opacity-100'
                }`}
              >
                <img
                  src={slide.url || FALLBACK_ROOM_IMAGE}
                  alt={slide.label}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_ROOM_IMAGE;
                  }}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Lightbox Gallery Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="max-w-4xl w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-white">
              <div>
                <p className="font-mono-tabular text-xs text-slate-300">
                  {roomNumber} · Slide {activeIndex + 1} of {safeSlides.length}
                </p>
                <h3 className="font-display text-base font-bold">
                  {roomName} — {currentSlide.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close photo gallery"
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative h-[58vh] min-h-[300px] max-h-[620px] rounded-2xl overflow-hidden bg-slate-900 border border-white/15">
              <img
                src={currentSlide.url || FALLBACK_ROOM_IMAGE}
                alt={`${roomNumber} — ${currentSlide.label}`}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = FALLBACK_ROOM_IMAGE;
                }}
                className="w-full h-full object-contain bg-slate-950"
              />
              {safeSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous slide"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950/75 hover:bg-slate-950 text-white flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next slide"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950/75 hover:bg-slate-950 text-white flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {safeSlides.length > 1 && (
              <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
                {safeSlides.map((slide, idx) => (
                  <button
                    key={`lb-${slide.url}-${idx}`}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`w-16 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                      idx === activeIndex
                        ? 'border-white opacity-100'
                        : 'border-transparent opacity-55 hover:opacity-90'
                    }`}
                  >
                    <img
                      src={slide.url || FALLBACK_ROOM_IMAGE}
                      alt={slide.label}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_ROOM_IMAGE;
                      }}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
