interface CfContext {
  request: Request;
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export async function onRequestGet(context: CfContext): Promise<Response> {
  const reqUrl = new URL(context.request.url);
  const rawUrl = (reqUrl.searchParams.get('url') || '').trim();

  if (!rawUrl) {
    return Response.json({ error: 'Missing required url query parameter.' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return Response.json({ error: 'Invalid iCal URL format.' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return Response.json({ error: 'Only HTTP/HTTPS calendar URLs are supported.' }, { status: 400 });
  }

  if (isBlockedHost(parsed.hostname)) {
    return Response.json(
      { error: 'Private or local network calendar hosts are not permitted.' },
      { status: 403 }
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'PCH-PMS-Channel-Manager/1.0 (+https://pchpms.com)',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `OTA calendar returned HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    const body = await upstream.text();
    if (!body.includes('BEGIN:VCALENDAR')) {
      return Response.json(
        { error: 'The URL did not return a valid iCalendar (.ics) feed.' },
        { status: 422 }
      );
    }

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unable to fetch remote calendar feed.' },
      { status: 502 }
    );
  }
}
