import React, { createContext, useContext, useState } from 'react';
import {
  CmsContent,
  CmsPageCopy,
  DEFAULT_CMS_CONTENT,
  NavSectionId,
} from '../types/pms';

export const CMS_CACHE_KEY = 'richgates_cms_cache_v1';

const ALL_SECTION_IDS = Object.keys(DEFAULT_CMS_CONTENT.pages) as NavSectionId[];

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function pickStrings<T extends Record<string, string>>(
  base: T,
  override: unknown
): T {
  const result: Record<string, string> = { ...base };
  if (!isPlainObject(override)) return result as T;
  for (const key of Object.keys(base)) {
    const candidate = override[key];
    if (typeof candidate === 'string') {
      result[key] = candidate;
    }
  }
  return result as T;
}

export function mergeCmsWithDefaults(raw?: unknown): CmsContent {
  if (!isPlainObject(raw)) {
    return DEFAULT_CMS_CONTENT;
  }

  const rawPages = isPlainObject(raw.pages) ? raw.pages : {};
  const mergedPages = {} as Record<NavSectionId, CmsPageCopy>;

  for (const secId of ALL_SECTION_IDS) {
    const defPage = DEFAULT_CMS_CONTENT.pages[secId];
    const overPage = rawPages[secId];
    mergedPages[secId] = {
      navLabel:
        isPlainObject(overPage) && typeof overPage.navLabel === 'string' && overPage.navLabel.trim()
          ? overPage.navLabel
          : defPage.navLabel,
      title:
        isPlainObject(overPage) && typeof overPage.title === 'string'
          ? overPage.title
          : defPage.title,
      subtitle:
        isPlainObject(overPage) && typeof overPage.subtitle === 'string'
          ? overPage.subtitle
          : defPage.subtitle,
      ctaLabel:
        isPlainObject(overPage) && typeof overPage.ctaLabel === 'string'
          ? overPage.ctaLabel
          : defPage.ctaLabel,
    };
  }

  return {
    brand: pickStrings(
      DEFAULT_CMS_CONTENT.brand as unknown as Record<string, string>,
      raw.brand
    ) as unknown as CmsContent['brand'],
    login: pickStrings(
      DEFAULT_CMS_CONTENT.login as unknown as Record<string, string>,
      raw.login
    ) as unknown as CmsContent['login'],
    dashboard: pickStrings(
      DEFAULT_CMS_CONTENT.dashboard as unknown as Record<string, string>,
      raw.dashboard
    ) as unknown as CmsContent['dashboard'],
    pages: mergedPages,
    updatedByEmail:
      typeof raw.updatedByEmail === 'string' ? raw.updatedByEmail : undefined,
  };
}

export function readCachedCmsContent(): CmsContent {
  if (typeof window === 'undefined') return DEFAULT_CMS_CONTENT;
  try {
    const raw = window.localStorage.getItem(CMS_CACHE_KEY);
    if (!raw) return DEFAULT_CMS_CONTENT;
    return mergeCmsWithDefaults(JSON.parse(raw));
  } catch {
    return DEFAULT_CMS_CONTENT;
  }
}

export function writeCachedCmsContent(cms: CmsContent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CMS_CACHE_KEY, JSON.stringify(cms));
  } catch {
    // Ignore storage quota errors
  }
}

interface CmsContextValue {
  cms: CmsContent;
  setCms: (next: CmsContent) => void;
}

const CmsContext = createContext<CmsContextValue>({
  cms: DEFAULT_CMS_CONTENT,
  setCms: () => {},
});

export const CmsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cms, setCmsState] = useState<CmsContent>(() => readCachedCmsContent());

  const setCms = (next: CmsContent) => {
    const normalized = mergeCmsWithDefaults(next);
    setCmsState(normalized);
    writeCachedCmsContent(normalized);
  };

  return (
    <CmsContext.Provider value={{ cms, setCms }}>
      {children}
    </CmsContext.Provider>
  );
};

export function useCms(): CmsContextValue {
  return useContext(CmsContext);
}
