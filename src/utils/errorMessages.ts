export interface ParsedAppError {
  userMessage: string;
  category: 'permission' | 'network' | 'auth' | 'validation' | 'quota' | 'not_found' | 'unknown';
  technicalMessage: string;
}

const TECHNICAL_LEAK_PATTERNS = [
  /missing or insufficient permissions/i,
  /permission[-_\s]?denied/i,
  /firestore/i,
  /firebase/i,
  /"operationType"\s*:/i,
  /"authInfo"\s*:/i,
  /properties\/[a-z0-9_-]+\//i,
  /audit_logs\//i,
  /users\/[a-z0-9_-]+/i,
  /\bauth\/[a-z0-9-]+\b/i,
  /failed-precondition/i,
  /invalid-argument/i,
  /resource-exhausted/i,
  /deadline-exceeded/i,
  /unauthenticated/i,
  /quota exceeded/i,
  /uid\s*[:=]/i,
  /client is offline/i,
  /could not reach cloud/i,
  /failed to fetch/i,
  /networkerror/i,
  /err_network/i,
];

function extractRawErrorDetails(error: unknown): {
  code: string;
  rawMessage: string;
  innerMessage: string;
  operationType?: string;
} {
  const code = String((error as { code?: unknown })?.code ?? '').trim().toLowerCase();
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '');

  let innerMessage = rawMessage;
  let operationType: string | undefined;

  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as {
        error?: unknown;
        operationType?: unknown;
        code?: unknown;
      };
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        innerMessage = parsed.error.trim();
      }
      if (typeof parsed.operationType === 'string') {
        operationType = parsed.operationType;
      }
    } catch {
      // Keep rawMessage
    }
  }

  return { code, rawMessage, innerMessage, operationType };
}

export function isPermissionError(error: unknown): boolean {
  const { code, rawMessage, innerMessage } = extractRawErrorDetails(error);
  const combined = `${code} ${rawMessage} ${innerMessage}`.toLowerCase();
  return (
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    combined.includes('missing or insufficient permissions') ||
    combined.includes('permission-denied') ||
    combined.includes('permission_denied') ||
    combined.includes('insufficient permissions')
  );
}

export function isNetworkError(error: unknown): boolean {
  const { code, rawMessage, innerMessage } = extractRawErrorDetails(error);
  const combined = `${code} ${rawMessage} ${innerMessage}`.toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'auth/network-request-failed' ||
    combined.includes('failed to fetch') ||
    combined.includes('network request failed') ||
    combined.includes('network error') ||
    combined.includes('client is offline') ||
    combined.includes('could not reach cloud firestore') ||
    combined.includes('err_internet_disconnected') ||
    combined.includes('load failed')
  );
}

function containsTechnicalLeak(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return true;
  return TECHNICAL_LEAK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Translates any technical Firebase, Firestore, network, or runtime error into
 * a clear, professional, user-safe message while keeping detailed diagnostics
 * strictly in internal developer logs.
 */
export function parseApplicationError(
  error: unknown,
  fallbackMessage = 'Unable to complete this request. Please try again.'
): ParsedAppError {
  const { code, rawMessage, innerMessage } = extractRawErrorDetails(error);
  const combinedLower = `${code} ${rawMessage} ${innerMessage}`.toLowerCase();

  // 1. Network / Connectivity errors
  if (isNetworkError(error)) {
    return {
      category: 'network',
      userMessage: 'Unable to connect. Please check your internet connection and try again.',
      technicalMessage: rawMessage,
    };
  }

  // 2. Permission / Access Control errors
  if (isPermissionError(error)) {
    return {
      category: 'permission',
      userMessage: "You don't have permission to perform this action.",
      technicalMessage: rawMessage,
    };
  }

  // 3. Authentication / Session errors
  if (
    code === 'unauthenticated' ||
    combinedLower.includes('authentication required') ||
    combinedLower.includes('user-token-expired') ||
    combinedLower.includes('id-token-expired')
  ) {
    return {
      category: 'auth',
      userMessage: 'Your session has expired. Please sign in again to continue.',
      technicalMessage: rawMessage,
    };
  }

  if (code.startsWith('auth/')) {
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return {
        category: 'auth',
        userMessage: 'Invalid email or password. Please check your credentials and try again.',
        technicalMessage: rawMessage,
      };
    }
    if (code === 'auth/email-already-in-use') {
      return {
        category: 'validation',
        userMessage: 'An account with this email address already exists.',
        technicalMessage: rawMessage,
      };
    }
    if (code === 'auth/weak-password') {
      return {
        category: 'validation',
        userMessage: 'Password is too weak. Use at least 6 characters with letters and numbers.',
        technicalMessage: rawMessage,
      };
    }
    if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
      return {
        category: 'validation',
        userMessage: 'Please enter a valid email address.',
        technicalMessage: rawMessage,
      };
    }
    if (code === 'auth/too-many-requests') {
      return {
        category: 'quota',
        userMessage: 'Too many attempts. Please wait a moment and try again.',
        technicalMessage: rawMessage,
      };
    }
    if (code === 'auth/user-disabled') {
      return {
        category: 'auth',
        userMessage: 'This account has been disabled. Please contact your administrator.',
        technicalMessage: rawMessage,
      };
    }
    const sanitized = innerMessage
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(auth\/[a-z0-9-]+\)\.?/gi, '')
      .trim();
    return {
      category: 'auth',
      userMessage:
        sanitized && !containsTechnicalLeak(sanitized)
          ? sanitized
          : 'Unable to verify your account right now. Please try again.',
      technicalMessage: rawMessage,
    };
  }

  // 4. Quota / Rate limit errors
  if (
    code === 'resource-exhausted' ||
    combinedLower.includes('quota exceeded') ||
    combinedLower.includes('too many requests')
  ) {
    return {
      category: 'quota',
      userMessage: 'The service is temporarily busy. Please wait a moment and try again.',
      technicalMessage: rawMessage,
    };
  }

  // 5. Missing record / conflict / invalid input codes
  if (code === 'not-found') {
    return {
      category: 'not_found',
      userMessage: 'The requested record could not be found. Please refresh and try again.',
      technicalMessage: rawMessage,
    };
  }

  if (code === 'already-exists') {
    return {
      category: 'validation',
      userMessage: 'A duplicate record already exists. Please review your entries and try again.',
      technicalMessage: rawMessage,
    };
  }

  if (code === 'invalid-argument' || code === 'failed-precondition') {
    return {
      category: 'validation',
      userMessage: fallbackMessage,
      technicalMessage: rawMessage,
    };
  }

  // 6. Clean business / validation messages (e.g., room conflict, OTA date guard, required field)
  const cleanCandidate = innerMessage.trim();
  if (
    cleanCandidate.length > 0 &&
    cleanCandidate.length <= 280 &&
    !containsTechnicalLeak(cleanCandidate)
  ) {
    return {
      category: 'validation',
      userMessage: cleanCandidate,
      technicalMessage: rawMessage,
    };
  }

  // 7. Fallback for any opaque or technical error
  return {
    category: 'unknown',
    userMessage: fallbackMessage,
    technicalMessage: rawMessage,
  };
}

/**
 * Logs technical error context internally and returns a clean, user-friendly message.
 */
export function getUserFriendlyErrorMessage(
  error: unknown,
  fallbackMessage = 'Unable to complete this request. Please try again.',
  contextLabel?: string
): string {
  const parsed = parseApplicationError(error, fallbackMessage);
  if (parsed.technicalMessage) {
    if (contextLabel) {
      console.error(`[PCHPMS:${contextLabel}]`, parsed.technicalMessage);
    } else if (parsed.category !== 'validation') {
      console.error('[PCHPMS:Error]', parsed.technicalMessage);
    }
  }
  return parsed.userMessage;
}
