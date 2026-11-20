export const PCH_BRAND_LOGO_URL = '/assets/media/brand/pch-pms-logo.png';
export const RICHGATES_EXTERIOR_IMAGE_URL =
  '/assets/media/properties/richgates-apartments-exterior.png';
export const DEFAULT_ROOM_COVER_IMAGE_URL =
  '/assets/media/rooms/deluxe-studio-bedroom.png';

export const ROOM_MEDIA_PATHS = {
  servicedStudioLounge: '/assets/media/rooms/serviced-studio-lounge-kitchenette.webp',
  oneBedroomLivingSuite: '/assets/media/rooms/one-bedroom-living-suite.png',
  deluxeStudioBedroom: '/assets/media/rooms/deluxe-studio-bedroom.png',
  standardStudioKingBed: '/assets/media/rooms/standard-studio-king-bedroom.jpg',
  propertyExterior: RICHGATES_EXTERIOR_IMAGE_URL,
} as const;

export const LEGACY_MEDIA_FILE_MAP: Record<string, string> = {
  '4A541DC4-8B5B-4592-9C9E-752D5AE470AD_3f72a29d.png': PCH_BRAND_LOGO_URL,
  'file_000000003fc881f4b5e66b7352a17edc_c7ca46a2.png': RICHGATES_EXTERIOR_IMAGE_URL,
  'IMG_1945_d08c4168.webp': ROOM_MEDIA_PATHS.servicedStudioLounge,
  'B8CC7C05-AC7B-438D-B422-4033B0713BA1_f0334307.png': ROOM_MEDIA_PATHS.oneBedroomLivingSuite,
  '96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png': ROOM_MEDIA_PATHS.deluxeStudioBedroom,
  'IMG_1819_00d6cdc5.jpeg': ROOM_MEDIA_PATHS.standardStudioKingBed,
  '001890be-a02f-4bfe-9e94-a4c86e183844_b9376f70.jpeg': '/assets/media/library/property-media-01.jpg',
  '1B78D20E-8F80-4A7D-AE8E-837256EB8DE5_72507bc3.png': '/assets/media/library/property-media-02.png',
  '4fa32701-43d9-40f9-af09-2bd87df2b850_760a662c.jpeg': '/assets/media/library/property-media-03.jpg',
  '505AE63A-6CE5-43A7-9024-CEAA4F160F38_c5da9915.png': '/assets/media/library/property-media-04.png',
  '983CEC2F-C655-40D4-8200-E03BCA67B7EC_2fe78b54.png': '/assets/media/library/property-media-05.png',
  'D314EE92-F75D-454E-8951-569C5B6B93AB_a0284630.png': '/assets/media/library/property-media-06.png',
  'DD89D22A-46CC-4AC7-A527-1CD4A0ECA742_8bc2f7d1.png': '/assets/media/library/property-media-07.png',
  'F4CFBE9B-2B7C-4025-95EE-42FC3CADC245_b5a4d143.png': '/assets/media/library/property-media-08.png',
  'IMG_2075_65880928.png': '/assets/media/library/property-media-09.png',
  'IMG_2077_856ae722.png': '/assets/media/library/property-media-10.png',
  'IMG_2094_8c70c549.png': '/assets/media/library/property-media-11.png',
  'IMG_2095_379c5b1d.png': '/assets/media/library/property-media-12.png',
  'IMG_2096_5d6c8063.png': '/assets/media/library/property-media-13.png',
  'IMG_2122_318be244.png': '/assets/media/library/property-media-14.png',
};

const LEGACY_SEGMENT_RE = /\/assets\/aistudio\/([^/?#]+)/i;
const DISALLOWED_AI_HOST_RE =
  /(^|\.)(aistudio\.google\.com|googleusercontent\.com|run\.app)$/i;
const DISALLOWED_AI_URL_HINT_RE =
  /aistudio\.google\.com|\/assets\/aistudio\/|ais-dev-|ais-pre-|googleusercontent\.com/i;

export function isLegacyOrAiStudioImageUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:image/')) return false;
  if (LEGACY_SEGMENT_RE.test(trimmed)) return true;
  if (DISALLOWED_AI_URL_HINT_RE.test(trimmed)) return true;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      if (DISALLOWED_AI_HOST_RE.test(parsed.hostname)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function resolveAppImageUrl(
  rawUrl?: string | null,
  fallback: string = DEFAULT_ROOM_COVER_IMAGE_URL
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallback;

  // Preserve uploaded data URLs and clean application-owned paths
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('/assets/media/') || trimmed.startsWith('/api/media/')) {
    return trimmed;
  }

  // Migrate any legacy /assets/aistudio/<file> path (relative or absolute)
  const legacyMatch = trimmed.match(LEGACY_SEGMENT_RE);
  if (legacyMatch?.[1]) {
    const fileName = decodeURIComponent(legacyMatch[1]);
    return LEGACY_MEDIA_FILE_MAP[fileName] || fallback;
  }

  // Handle absolute URLs
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      // Strip preview/Google AI Studio origin if it points to an app asset
      if (
        DISALLOWED_AI_HOST_RE.test(parsed.hostname) ||
        parsed.hostname.includes('ais-dev-') ||
        parsed.hostname.includes('ais-pre-')
      ) {
        const innerLegacy = parsed.pathname.match(LEGACY_SEGMENT_RE);
        if (innerLegacy?.[1]) {
          return LEGACY_MEDIA_FILE_MAP[decodeURIComponent(innerLegacy[1])] || fallback;
        }
        if (
          parsed.pathname.startsWith('/assets/media/') ||
          parsed.pathname.startsWith('/api/media/')
        ) {
          return parsed.pathname;
        }
        return fallback;
      }
      return trimmed;
    } catch {
      return fallback;
    }
  }

  // Allow other clean relative /assets/... paths (e.g., /assets/richgates-crest-transparent.png)
  if (trimmed.startsWith('/assets/')) {
    return trimmed;
  }

  return trimmed;
}

export function resolveGalleryImageUrls(
  urls?: string[] | null,
  fallback: string = DEFAULT_ROOM_COVER_IMAGE_URL
): string[] {
  if (!Array.isArray(urls)) return [];
  return Array.from(
    new Set(
      urls
        .map((u) => (typeof u === 'string' ? resolveAppImageUrl(u, fallback) : ''))
        .filter(Boolean)
    )
  ).slice(0, 6);
}

export function formatReadableImageSourceLabel(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const resolved = resolveAppImageUrl(url, '');
  if (!resolved) return '';
  if (resolved.startsWith('data:image/')) return '[Uploaded Photo · Saved in App Storage]';
  if (resolved.startsWith('/api/media/')) return '[Uploaded Photo · App Media Storage]';
  if (resolved.startsWith('/assets/media/')) {
    const file = resolved.split('/').pop() || '';
    const pretty = file
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    return `[Property Media · ${pretty}]`;
  }
  return resolved;
}

export async function compressImageFileToDataUrl(
  file: File,
  options?: { maxWidth?: number; maxBytes?: number; mimeType?: 'image/jpeg' | 'image/png' }
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 880;
  const maxBytes = options?.maxBytes ?? 320000;
  const targetMime = options?.mimeType ?? 'image/jpeg';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);

        if (targetMime === 'image/png') {
          const pngData = canvas.toDataURL('image/png');
          if (pngData.length <= maxBytes) {
            resolve(pngData);
            return;
          }
        }

        let quality = 0.78;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length > maxBytes && quality > 0.32) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        if (result.length > maxBytes + 25000) {
          reject(new Error('Image too large after compression. Please pick a smaller image.'));
          return;
        }
        resolve(result);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadAppMediaImage(
  file: File,
  options: {
    propertyId: string;
    folder: 'rooms' | 'logos';
    slug?: string;
    maxWidth?: number;
    maxBytes?: number;
  }
): Promise<string> {
  const compressedDataUrl = await compressImageFileToDataUrl(file, {
    maxWidth: options.maxWidth ?? 720,
    maxBytes: options.maxBytes ?? 120000,
    mimeType: options.folder === 'logos' && file.type === 'image/png' ? 'image/png' : 'image/jpeg',
  });

  // Persist to application-owned object storage (/api/media/upload -> R2) when available;
  // otherwise keep the compressed image stored directly inside the application database.
  try {
    const response = await fetch('/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: options.propertyId,
        folder: options.folder,
        slug: options.slug || file.name.replace(/\.[^.]+$/, ''),
        dataUrl: compressedDataUrl,
      }),
    });
    if (response.ok) {
      const result = (await response.json()) as { stored?: boolean; url?: string };
      if (result.stored && typeof result.url === 'string' && result.url.startsWith('/api/media/')) {
        return result.url;
      }
    }
  } catch {
    // Gracefully fall back to app-owned Firestore storage below
  }

  return compressedDataUrl;
}
