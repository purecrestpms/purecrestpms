import { initializeApp } from 'firebase/app';
import { ActionCodeSettings, getAuth, GoogleAuthProvider } from 'firebase/auth';
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

const customAuthDomain =
  (import.meta.env.VITE_CUSTOM_AUTH_DOMAIN as string | undefined)?.trim() || '';

export const effectiveFirebaseConfig = {
  ...firebaseConfig,
  // Use Firebase's provisioned authDomain unless a verified custom OAuth proxy domain is explicitly configured.
  // Overriding authDomain without registering https://<domain>/__/auth/handler in Google Cloud OAuth causes Error 400: redirect_uri_mismatch.
  authDomain: customAuthDomain || firebaseConfig.authDomain,
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
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'purecresthospitality@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'purecresthospitality@gmail.com',
  'rukevwe009@gmail.com',
];

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return BOOTSTRAPPED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export const CENTRAL_AUTH_DOMAIN = 'pchpms.com';
export const CENTRAL_AUTH_ORIGIN = 'https://pchpms.com';
export const CENTRAL_AUTH_HANDLER_URL = 'https://pchpms.com/__/auth/handler';
export const CENTRAL_AUTH_ACTION_URL = 'https://pchpms.com/auth-action';

export function isSafePchRedirectUrl(candidate?: string | null): boolean {
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'pchpms.com' ||
      host.endsWith('.pchpms.com') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app')
    );
  } catch {
    return false;
  }
}

export function getPchActionCodeSettings(targetPortalUrl?: string): ActionCodeSettings {
  const currentHost =
    typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const isPchDomain = currentHost === 'pchpms.com' || currentHost.endsWith('.pchpms.com');

  const baseActionUrl =
    isPchDomain || !currentOrigin ? CENTRAL_AUTH_ACTION_URL : `${currentOrigin}/auth-action`;

  const returnCandidate =
    targetPortalUrl && isSafePchRedirectUrl(targetPortalUrl)
      ? targetPortalUrl
      : currentOrigin && isSafePchRedirectUrl(currentOrigin)
        ? currentOrigin
        : '';

  const url =
    returnCandidate && !returnCandidate.startsWith(CENTRAL_AUTH_ORIGIN)
      ? `${baseActionUrl}?next=${encodeURIComponent(returnCandidate)}`
      : baseActionUrl;

  return {
    url,
    handleCodeInApp: true,
  };
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
