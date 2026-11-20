interface CfPagesContext {
  request: Request;
  params: {
    path?: string | string[];
  };
}

const UPSTREAM_AUTH_ORIGIN = 'https://gen-lang-client-0691436027.firebaseapp.com';

export async function onRequest(context: CfPagesContext): Promise<Response> {
  const { request, params } = context;
  const reqUrl = new URL(request.url);
  const rawSegments = params.path;
  const subPath = Array.isArray(rawSegments)
    ? rawSegments.join('/')
    : typeof rawSegments === 'string'
      ? rawSegments
      : '';

  // Route any /__/auth/action link straight to our branded PCH PMS /auth-action handler
  if (subPath === 'auth/action' || subPath.startsWith('auth/action/')) {
    const sanitizedParams = new URLSearchParams(reqUrl.searchParams);
    const continueUrl = sanitizedParams.get('continueUrl');
    if (continueUrl && continueUrl.toLowerCase().includes('firebaseapp.com')) {
      sanitizedParams.set('continueUrl', reqUrl.origin);
    }
    const qs = sanitizedParams.toString();
    return Response.redirect(`${reqUrl.origin}/auth-action${qs ? `?${qs}` : ''}`, 302);
  }

  const targetUrl = `${UPSTREAM_AUTH_ORIGIN}/__/${subPath}${reqUrl.search}`;

  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'content-length' ||
      lower === 'cf-connecting-ip' ||
      lower === 'cf-ipcountry' ||
      lower === 'cf-ray' ||
      lower === 'cf-visitor' ||
      lower === 'x-forwarded-proto'
    ) {
      return;
    }
    forwardHeaders.set(key, value);
  });
  forwardHeaders.set('X-Forwarded-Host', reqUrl.host);

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const upstreamRes = await fetch(targetUrl, {
    method,
    headers: forwardHeaders,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });

  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') {
      return;
    }
    if (lower === 'location') {
      resHeaders.set(key, value.replaceAll(UPSTREAM_AUTH_ORIGIN, reqUrl.origin));
      return;
    }
    resHeaders.append(key, value);
  });

  resHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');

  const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
  const isTextLike =
    contentType.includes('text/') ||
    contentType.includes('application/json') ||
    contentType.includes('application/javascript') ||
    contentType.includes('application/x-javascript');

  if (isTextLike) {
    const upstreamHost = new URL(UPSTREAM_AUTH_ORIGIN).host;
    const rawText = await upstreamRes.text();
    const rewrittenText = rawText
      .replaceAll(UPSTREAM_AUTH_ORIGIN, reqUrl.origin)
      .replaceAll(upstreamHost, reqUrl.host);
    return new Response(rewrittenText, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders,
    });
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: resHeaders,
  });
}
