import { initializeApp } from 'firebase/app';
import { ActionCodeSettings, getAuth } from 'firebase/auth';
import {
  doc,
  enableNetwork,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const CENTRAL_AUTH_DOMAIN = 'pchpms.com';
export const CENTRAL_AUTH_ORIGIN = 'https://pchpms.com';
export const CENTRAL_AUTH_HANDLER_URL = 'https://pchpms.com/__/auth/handler';
export const CENTRAL_AUTH_ACTION_URL = 'https://pchpms.com/auth-action';

const customAuthDomain =
  (import.meta.env.VITE_CUSTOM_AUTH_DOMAIN as string | undefined)?.trim() || '';

function resolveEffectiveAuthDomain(): string {
  if (customAuthDomain) return customAuthDomain;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase().trim();
    if (host === CENTRAL_AUTH_DOMAIN || host.endsWith(`.${CENTRAL_AUTH_DOMAIN}`)) {
      return CENTRAL_AUTH_DOMAIN;
    }
  }
  return firebaseConfig.authDomain;
}

export const effectiveFirebaseConfig = {
  ...firebaseConfig,
  authDomain: resolveEffectiveAuthDomain(),
};

const app = initializeApp(effectiveFirebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
          localCache: memoryLocalCache(),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

export const BOOTSTRAPPED_ADMIN_EMAIL = 'purecresthospitality@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'purecresthospitality@gmail.com',
  'rukevwe009@gmail.com',
];

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return BOOTSTRAPPED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

const BLOCKED_AUTH_HOST_SUFFIXES = [
  ['.firebase', 'app', '.com'].join(''),
  ['.web', '.app'].join(''),
];

function isBlockedLegacyAuthHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  return BLOCKED_AUTH_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function isSafePchRedirectUrl(candidate?: string | null): boolean {
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (isBlockedLegacyAuthHost(host)) return false;
    return (
      host === 'pchpms.com' ||
      host.endsWith('.pchpms.com') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app') ||
      host.endsWith('.pages.dev')
    );
  } catch {
    return false;
  }
}

function isAuthActionPathname(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower === '/auth-action' ||
    lower.startsWith('/auth-action/') ||
    lower === '/__/auth/action' ||
    lower.startsWith('/__/auth/action/')
  );
}

function unwrapReturnCandidate(raw?: string | null, depth = 0): string {
  if (!raw || depth > 3) return '';
  let trimmed = raw.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    try {
      trimmed = decodeURIComponent(trimmed);
    } catch {
      return '';
    }
  }
  if (!isSafePchRedirectUrl(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (isAuthActionPathname(parsed.pathname)) {
      const nestedNext = parsed.searchParams.get('next') || parsed.searchParams.get('continueUrl');
      if (nestedNext) {
        return unwrapReturnCandidate(nestedNext, depth + 1);
      }
      return '';
    }
    return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return '';
  }
}

export function extractSafeAuthReturnUrl(
  searchParams: URLSearchParams,
  fallbackOrigin?: string
): string {
  const directNext = unwrapReturnCandidate(searchParams.get('next'));
  if (directNext) return directNext;

  const fromContinue = unwrapReturnCandidate(searchParams.get('continueUrl'));
  if (fromContinue) return fromContinue;

  if (fallbackOrigin && isSafePchRedirectUrl(fallbackOrigin)) {
    try {
      const parsed = new URL(fallbackOrigin);
      const host = parsed.hostname.toLowerCase();
      if (host === CENTRAL_AUTH_DOMAIN || host === `www.${CENTRAL_AUTH_DOMAIN}`) {
        return `https://app.${CENTRAL_AUTH_DOMAIN}`;
      }
      return parsed.origin;
    } catch {
      // fall through
    }
  }

  return `https://app.${CENTRAL_AUTH_DOMAIN}`;
}

export function resolvePchReturnUrl(targetPortalUrl?: string): string {
  const unwrappedTarget = unwrapReturnCandidate(targetPortalUrl);
  if (unwrappedTarget) {
    return unwrappedTarget;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname.toLowerCase();
    const origin = window.location.origin;
    const path = window.location.pathname.toLowerCase();

    if (host === CENTRAL_AUTH_DOMAIN || host.endsWith(`.${CENTRAL_AUTH_DOMAIN}`)) {
      if (host === CENTRAL_AUTH_DOMAIN || host === `www.${CENTRAL_AUTH_DOMAIN}`) {
        return `https://app.${CENTRAL_AUTH_DOMAIN}`;
      }
      if (path === '/staff' || path.startsWith('/staff/') || path === '/login' || path.startsWith('/login/')) {
        return `${origin}/staff`;
      }
      return origin;
    }

    if (isSafePchRedirectUrl(origin) && !isAuthActionPathname(path)) {
      return origin;
    }
  }

  return CENTRAL_AUTH_ORIGIN;
}

export function getPchActionCodeSettings(targetPortalUrl?: string): ActionCodeSettings {
  return {
    url: resolvePchReturnUrl(targetPortalUrl),
    handleCodeInApp: false,
  };
}

export function sanitizeAuthErrorText(rawMessage: string): string {
  return rawMessage
    .replace(/firebase:\s*/gi, '')
    .replace(/https?:\/\/[^\s]*firebaseapp\.com[^\s]*/gi, CENTRAL_AUTH_ORIGIN)
    .replace(/[a-z0-9-]+\.firebaseapp\.com/gi, CENTRAL_AUTH_DOMAIN)
    .replace(/gen-lang-client-\d+/gi, 'PCH PMS')
    .replace(/\s*\(auth\/[^)]+\)\.?$/i, '')
    .trim();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreOfflineError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore') ||
    msg.includes('network error')
  );
}

export async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 700
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isFirestoreOfflineError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      await enableNetwork(db).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await withFirestoreRetry(() => getDocFromServer(doc(db, 'test', 'connection')), 2, 500);
    return true;
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      return false;
    }
    return true;
  }
}
