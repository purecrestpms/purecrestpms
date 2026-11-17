import express from 'express';
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

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

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

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PCH PMS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PCH PMS server:', err);
  process.exit(1);
});
