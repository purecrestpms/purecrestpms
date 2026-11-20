import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function isBlockedPrivateHost(hostname: string): boolean {
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
  // Block private IPv4 ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
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

const DISABLED_HMR_CLIENT_SHIM = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style && typeof document !== 'undefined') {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style && style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {}
`;

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const httpServer = createHttpServer(app);

  const isPublicMarketingHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase().split(':')[0];
    return (
      host === 'app.pchpms.com' ||
      host === 'pchpms.com' ||
      host === 'www.pchpms.com' ||
      host === 'app.pchmps.com' ||
      host === 'pchmps.com' ||
      host === 'www.pchmps.com' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.run.app')
    );
  };

  const isInternalPortalRequest = (req: express.Request): boolean => {
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const host = rawHost.toLowerCase().split(':')[0];
    if (
      host === 'app.pchpms.com' ||
      host === 'pchpms.com' ||
      host === 'www.pchpms.com' ||
      host === 'app.pchmps.com' ||
      host === 'pchmps.com' ||
      host === 'www.pchmps.com'
    ) {
      return false;
    }
    if (
      host.startsWith('admin.') ||
      ((host.endsWith('.pchpms.com') || host.endsWith('.pchmps.com')) && !isPublicMarketingHost(host))
    ) {
      return true;
    }
    if (/^\/(admin|login|staff|pch-admin|auth-action)(\/|$)/i.test(req.path)) {
      return true;
    }
    const portalParam = typeof req.query.portal === 'string' ? req.query.portal.toLowerCase() : '';
    if (portalParam && portalParam !== 'home') {
      return true;
    }
    if (typeof req.query.page === 'string' || typeof req.query.oobCode === 'string') {
      return true;
    }
    return false;
  };

  app.use((req, res, next) => {
    if (isInternalPortalRequest(req)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    }
    next();
  });

  app.get('/robots.txt', (req, res) => {
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const host = rawHost.toLowerCase().split(':')[0];
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
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(body);
  });

  // 301 redirect any legacy /assets/aistudio/<file> requests to clean application-owned /assets/media/ paths
  const LEGACY_MEDIA_REDIRECTS: Record<string, string> = {
    '4A541DC4-8B5B-4592-9C9E-752D5AE470AD_3f72a29d.png': '/assets/media/brand/pch-pms-logo.png',
    'file_000000003fc881f4b5e66b7352a17edc_c7ca46a2.png': '/assets/media/properties/richgates-apartments-exterior.png',
    'IMG_1945_d08c4168.webp': '/assets/media/rooms/serviced-studio-lounge-kitchenette.webp',
    'B8CC7C05-AC7B-438D-B422-4033B0713BA1_f0334307.png': '/assets/media/rooms/one-bedroom-living-suite.png',
    '96AFAA8F-BEBF-4615-84DD-73F6118C3907_96abf748.png': '/assets/media/rooms/deluxe-studio-bedroom.png',
    'IMG_1819_00d6cdc5.jpeg': '/assets/media/rooms/standard-studio-king-bedroom.jpg',
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

  app.get('/assets/aistudio/:file', (req, res) => {
    const file = decodeURIComponent(req.params.file || '');
    const target = LEGACY_MEDIA_REDIRECTS[file] || '/assets/media/rooms/deluxe-studio-bedroom.png';
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.redirect(301, target);
  });

  // Application-owned media upload endpoint (falls back to shared app database when R2 object storage is not mounted)
  app.post('/api/media/upload', express.json({ limit: '2mb' }), (req, res) => {
    const body = (req.body || {}) as { dataUrl?: string };
    if (!body.dataUrl || typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'A valid base64 image dataUrl is required.' });
      return;
    }
    res.status(200).json({ stored: false, fallback: 'app_database' });
  });

  // Proxy /__/auth/* and /__/firebase/* so custom domain pchpms.com serves sign-in popups & handlers cleanly
  const UPSTREAM_AUTH_ORIGIN = 'https://gen-lang-client-0691436027.firebaseapp.com';
  const UPSTREAM_AUTH_HOST = new URL(UPSTREAM_AUTH_ORIGIN).host;
  app.all('/__/*', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
    try {
      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'pchpms.com');
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
      const reqOrigin = `${proto}://${reqHost}`;

      if (req.path === '/__/auth/action' || req.path.startsWith('/__/auth/action/')) {
        const queryIdx = req.originalUrl.indexOf('?');
        const rawSearch = queryIdx >= 0 ? req.originalUrl.slice(queryIdx + 1) : '';
        const sanitizedParams = new URLSearchParams(rawSearch);
        const continueUrl = sanitizedParams.get('continueUrl');
        if (continueUrl && continueUrl.toLowerCase().includes('firebaseapp.com')) {
          sanitizedParams.set('continueUrl', reqOrigin);
        }
        const qs = sanitizedParams.toString();
        res.redirect(302, `/auth-action${qs ? `?${qs}` : ''}`);
        return;
      }

      const targetUrl = `${UPSTREAM_AUTH_ORIGIN}${req.originalUrl}`;
      const forwardHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        const lower = k.toLowerCase();
        if (lower === 'host' || lower === 'content-length' || lower === 'connection') continue;
        if (typeof v === 'string') forwardHeaders[k] = v;
        else if (Array.isArray(v)) forwardHeaders[k] = v.join(', ');
      }
      forwardHeaders['x-forwarded-host'] = reqHost;

      const method = req.method.toUpperCase();
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const bodyBuffer =
        hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? new Uint8Array(req.body) : undefined;

      const upstreamRes = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: bodyBuffer,
        redirect: 'manual',
      });

      upstreamRes.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') {
          return;
        }
        if (lower === 'location') {
          res.setHeader(key, value.replaceAll(UPSTREAM_AUTH_ORIGIN, reqOrigin));
          return;
        }
        res.setHeader(key, value);
      });

      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
      const isTextLike =
        contentType.includes('text/') ||
        contentType.includes('application/json') ||
        contentType.includes('application/javascript') ||
        contentType.includes('application/x-javascript');

      if (isTextLike) {
        const rawText = await upstreamRes.text();
        const rewritten = rawText
          .replaceAll(UPSTREAM_AUTH_ORIGIN, reqOrigin)
          .replaceAll(UPSTREAM_AUTH_HOST, reqHost);
        res.status(upstreamRes.status).send(rewritten);
        return;
      }

      const payload = Buffer.from(await upstreamRes.arrayBuffer());
      res.status(upstreamRes.status).send(payload);
    } catch (err) {
      res.status(502).send(err instanceof Error ? err.message : 'Unable to reach authentication handler.');
    }
  });

  // Server-side OTA iCal Proxy (bypasses browser CORS while blocking SSRF to private IPs)
  app.get('/api/ical-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing required url query parameter.' });
      return;
    }

    const normalizedUrl = rawUrl.replace(/^webcals?:\/\//i, 'https://');

    let parsed: URL;
    try {
      parsed = new URL(
        /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedUrl)
          ? normalizedUrl
          : `https://${normalizedUrl}`
      );
    } catch {
      res.status(400).json({ error: 'Invalid iCal URL format.' });
      return;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).json({ error: 'Only HTTP/HTTPS/WebCal calendar URLs are supported.' });
      return;
    }

    if (isBlockedPrivateHost(parsed.hostname)) {
      res.status(403).json({ error: 'Private or local network calendar hosts are not permitted.' });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'PCH-PMS-Channel-Manager/1.0 (+https://pchpms.com)',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!upstream.ok) {
        res.status(502).json({
          error: `OTA calendar returned HTTP ${upstream.status}. Verify the .ics link inside your OTA account.`,
        });
        return;
      }

      const rawBody = await upstream.text();
      const body = rawBody.replace(/^\uFEFF/, '');
      if (body.length > 2_500_000) {
        res.status(413).json({ error: 'Calendar feed exceeds maximum supported size.' });
        return;
      }

      if (!/begin:vcalendar/i.test(body)) {
        res.status(422).json({
          error: 'The URL did not return a valid iCalendar (.ics) feed.',
        });
        return;
      }

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(body);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Timed out waiting for OTA calendar server.'
          : err instanceof Error
            ? err.message
            : 'Unable to fetch remote calendar feed.';
      res.status(502).json({ error: msg });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  // Share staff / property user login details via email (defaults to noreply@pchpms.com, supports Cloudflare/Resend/Brevo/SendGrid/Postmark env keys)
  app.post('/api/share-login-email', express.json({ limit: '100kb' }), async (req, res) => {
    const body = (req.body || {}) as {
      to?: string;
      subject?: string;
      text?: string;
      propertyName?: string;
    };
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const propertyName =
      typeof body.propertyName === 'string' && body.propertyName.trim()
        ? body.propertyName.trim()
        : 'PCH PMS';

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ error: 'A valid recipient email address is required.' });
      return;
    }
    if (!subject || !text) {
      res.status(400).json({ error: 'Email subject and message body are required.' });
      return;
    }

    const rawFrom = process.env.EMAIL_FROM?.trim() || 'PCH PMS <noreply@pchpms.com>';
    const fromMatch = rawFrom.match(/^(.*?)<([^>]+)>$/);
    const fromName = fromMatch ? fromMatch[1].replace(/^["']|["']$/g, '').trim() || 'PCH PMS' : 'PCH PMS';
    const fromAddr = fromMatch ? fromMatch[2].trim() : rawFrom;
    const fromDisplay = `${fromName} <${fromAddr}>`;

    const genericKey = process.env.EMAIL_API_KEY?.trim() || '';
    const resendKey = process.env.RESEND_API_KEY?.trim() || (genericKey.startsWith('re_') ? genericKey : '');
    const brevoKey = process.env.BREVO_API_KEY?.trim() || (genericKey.startsWith('xkeysib-') ? genericKey : '');
    const sendgridKey = process.env.SENDGRID_API_KEY?.trim() || (genericKey.startsWith('SG.') ? genericKey : '');
    const postmarkKey = process.env.POSTMARK_API_KEY?.trim() || '';
    const customEmailUrl = (process.env.CLOUDFLARE_EMAIL_API_URL || process.env.EMAIL_API_URL || '').trim();
    const customEmailKey = (process.env.CLOUDFLARE_EMAIL_API_KEY || genericKey).trim();

    const escapedHtml = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6;">
      <div style="background:#0b5d34;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:700;font-size:16px;">
        ${propertyName.replace(/[<>&]/g, '')}
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 10px 10px;background:#ffffff;font-size:14px;">
        ${escapedHtml}
      </div>
      <p style="margin-top:14px;font-size:11px;color:#64748b;text-align:center;">
        Sent securely via PCH PMS &middot; noreply@pchpms.com
      </p>
    </div>`;

    try {
      if (customEmailUrl) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customEmailKey) headers.Authorization = `Bearer ${customEmailKey}`;
        const customRes = await fetch(customEmailUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from: fromDisplay,
            fromEmail: fromAddr,
            fromName,
            to,
            subject,
            text,
            html,
            propertyName,
          }),
        });
        if (customRes.ok) {
          res.status(200).json({
            delivered: true,
            from: fromAddr,
            message: `Login details emailed directly to ${to} from ${fromAddr}.`,
          });
          return;
        }
      }

      if (resendKey) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromDisplay,
            to: [to],
            subject,
            text,
            html,
          }),
        });
        if (emailRes.ok) {
          res.status(200).json({
            delivered: true,
            from: fromAddr,
            message: `Login details emailed directly to ${to} from ${fromAddr}.`,
          });
          return;
        }
        const errPayload = await emailRes.text().catch(() => '');
        res.status(200).json({
          delivered: false,
          fallback: 'mailto',
          message: errPayload || 'Email gateway unavailable; falling back to email client.',
        });
        return;
      }

      if (brevoKey) {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: fromName, email: fromAddr },
            to: [{ email: to }],
            subject,
            textContent: text,
            htmlContent: html,
          }),
        });
        if (brevoRes.ok) {
          res.status(200).json({
            delivered: true,
            from: fromAddr,
            message: `Login details emailed directly to ${to} from ${fromAddr}.`,
          });
          return;
        }
      }

      if (sendgridKey) {
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: fromAddr, name: fromName },
            subject,
            content: [
              { type: 'text/plain', value: text },
              { type: 'text/html', value: html },
            ],
          }),
        });
        if (sgRes.ok) {
          res.status(200).json({
            delivered: true,
            from: fromAddr,
            message: `Login details emailed directly to ${to} from ${fromAddr}.`,
          });
          return;
        }
      }

      if (postmarkKey) {
        const pmRes = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'X-Postmark-Server-Token': postmarkKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: fromDisplay,
            To: to,
            Subject: subject,
            TextBody: text,
            HtmlBody: html,
          }),
        });
        if (pmRes.ok) {
          res.status(200).json({
            delivered: true,
            from: fromAddr,
            message: `Login details emailed directly to ${to} from ${fromAddr}.`,
          });
          return;
        }
      }

      res.status(200).json({
        delivered: false,
        fallback: 'mailto',
        message: 'Opening your email app with login details pre-filled.',
      });
    } catch {
      res.status(200).json({
        delivered: false,
        fallback: 'mailto',
        message: 'Opening your email app with login details pre-filled.',
      });
    }
  });

  if (!isProduction) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(DISABLED_HMR_CLIENT_SHIM);
      });
    }

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: hmrDisabled
        ? { middlewareMode: true, ws: false, hmr: false, watch: null }
        : { middlewareMode: true, ws: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PCH PMS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PCH PMS server:', err);
  process.exit(1);
});
