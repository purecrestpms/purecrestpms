interface CfMiddlewareContext {
  request: Request;
  next: () => Promise<Response>;
}

const INTERNAL_PATH_RE = /^\/(admin|login|staff|pch-admin|auth-action)(\/|$)/i;

function isInternalTenantHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'app.pchpms.com' ||
    host === 'pchpms.com' ||
    host === 'www.pchpms.com' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.run.app')
  ) {
    return false;
  }
  if (host.startsWith('admin.') || host.endsWith('.pchpms.com')) {
    return true;
  }
  return false;
}

function isInternalRequest(reqUrl: URL): boolean {
  if (isInternalTenantHost(reqUrl.hostname)) return true;
  if (INTERNAL_PATH_RE.test(reqUrl.pathname)) return true;
  const portal = (reqUrl.searchParams.get('portal') || '').toLowerCase();
  if (portal && portal !== 'home') return true;
  if (reqUrl.searchParams.has('page') || reqUrl.searchParams.has('oobCode')) return true;
  return false;
}

export async function onRequest(context: CfMiddlewareContext): Promise<Response> {
  const response = await context.next();
  const reqUrl = new URL(context.request.url);

  if (!isInternalRequest(reqUrl)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  if ((headers.get('Content-Type') || '').includes('text/html')) {
    headers.set('Cache-Control', 'private, no-store');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
