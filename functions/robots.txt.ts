interface CfContext {
  request: Request;
}

function isPublicMarketingHost(hostname: string): boolean {
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
    return true;
  }
  return false;
}

export async function onRequestGet(context: CfContext): Promise<Response> {
  const reqUrl = new URL(context.request.url);
  const host = reqUrl.hostname.toLowerCase();

  const body = isPublicMarketingHost(host)
    ? [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /login',
        'Disallow: /staff',
        'Disallow: /pch-admin',
        'Disallow: /auth-action',
        'Disallow: /*?*portal=',
        'Disallow: /*?*page=',
        '',
      ].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
