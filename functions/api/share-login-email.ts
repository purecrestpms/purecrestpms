interface CfEmailBinding {
  send: (message: unknown) => Promise<void>;
}

interface CfEnv {
  RESEND_API_KEY?: string;
  EMAIL_API_KEY?: string;
  CLOUDFLARE_EMAIL_API_URL?: string;
  EMAIL_API_URL?: string;
  CLOUDFLARE_EMAIL_API_KEY?: string;
  BREVO_API_KEY?: string;
  SENDGRID_API_KEY?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  POSTMARK_API_KEY?: string;
  EMAIL_FROM?: string;
  USE_MAILCHANNELS?: string;
  SEND_EMAIL?: CfEmailBinding;
}

interface CfContext {
  request: Request;
  env: CfEnv;
}

const DEFAULT_FROM_EMAIL = 'PCH PMS <noreply@pchpms.com>';

function parseFromIdentity(rawFrom: string): { display: string; email: string; name: string } {
  const trimmed = rawFrom.trim() || DEFAULT_FROM_EMAIL;
  const angleMatch = trimmed.match(/^(.*?)<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1].replace(/^["']|["']$/g, '').trim() || 'PCH PMS';
    const email = angleMatch[2].trim();
    return { display: `${name} <${email}>`, email, name };
  }
  return { display: `PCH PMS <${trimmed}>`, email: trimmed, name: 'PCH PMS' };
}

function buildHtmlEmail(propertyName: string, text: string): string {
  const safeProperty = (propertyName || 'PCH PMS').replace(/[<>&]/g, '');
  const escapedHtml = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.6;">
    <div style="background:#0b5d34;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:700;font-size:16px;">
      ${safeProperty}
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 10px 10px;background:#ffffff;font-size:14px;">
      ${escapedHtml}
    </div>
    <p style="margin-top:14px;font-size:11px;color:#64748b;text-align:center;">
      Sent securely via PCH PMS &middot; noreply@pchpms.com
    </p>
  </div>`;
}

export async function onRequestPost(context: CfContext): Promise<Response> {
  const { request, env } = context;

  let body: {
    to?: string;
    subject?: string;
    text?: string;
    propertyName?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const propertyName =
    typeof body?.propertyName === 'string' && body.propertyName.trim()
      ? body.propertyName.trim()
      : 'PCH PMS';

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return Response.json({ error: 'A valid recipient email address is required.' }, { status: 400 });
  }
  if (!subject || !text) {
    return Response.json({ error: 'Email subject and message body are required.' }, { status: 400 });
  }

  const from = parseFromIdentity(env.EMAIL_FROM || DEFAULT_FROM_EMAIL);
  const html = buildHtmlEmail(propertyName, text);

  const genericKey = (env.EMAIL_API_KEY || '').trim();
  const resendKey =
    (env.RESEND_API_KEY || '').trim() || (genericKey.startsWith('re_') ? genericKey : '');
  const brevoKey =
    (env.BREVO_API_KEY || '').trim() || (genericKey.startsWith('xkeysib-') ? genericKey : '');
  const sendgridKey =
    (env.SENDGRID_API_KEY || '').trim() || (genericKey.startsWith('SG.') ? genericKey : '');
  const mailgunKey = (env.MAILGUN_API_KEY || '').trim();
  const mailgunDomain = (env.MAILGUN_DOMAIN || '').trim();
  const postmarkKey = (env.POSTMARK_API_KEY || '').trim();
  const customEmailUrl = (env.CLOUDFLARE_EMAIL_API_URL || env.EMAIL_API_URL || '').trim();
  const customEmailKey = (env.CLOUDFLARE_EMAIL_API_KEY || genericKey).trim();

  try {
    // 1. Custom Cloudflare Email Worker / HTTP API Endpoint (when configured)
    if (customEmailUrl) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customEmailKey) {
        headers.Authorization = `Bearer ${customEmailKey}`;
      }
      const customRes = await fetch(customEmailUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: from.display,
          fromEmail: from.email,
          fromName: from.name,
          to,
          subject,
          text,
          html,
          propertyName,
        }),
      });
      if (customRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'cloudflare_api',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
    }

    // 2. Resend API (RESEND_API_KEY or re_* EMAIL_API_KEY in Cloudflare Pages Secrets)
    if (resendKey) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: from.display,
          to: [to],
          subject,
          text,
          html,
        }),
      });
      if (resendRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'resend',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
      const errText = await resendRes.text().catch(() => '');
      return Response.json({
        delivered: false,
        fallback: 'mailto',
        message: errText || 'Email provider rejected the message; opening email client instead.',
      });
    }

    // 3. Brevo API
    if (brevoKey) {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: from.name, email: from.email },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
      });
      if (brevoRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'brevo',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
    }

    // 4. SendGrid API
    if (sendgridKey) {
      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from.email, name: from.name },
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html },
          ],
        }),
      });
      if (sgRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'sendgrid',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
    }

    // 5. Postmark API
    if (postmarkKey) {
      const pmRes = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': postmarkKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          From: from.display,
          To: to,
          Subject: subject,
          TextBody: text,
          HtmlBody: html,
        }),
      });
      if (pmRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'postmark',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
    }

    // 6. Mailgun API
    if (mailgunKey && mailgunDomain) {
      const formData = new URLSearchParams();
      formData.set('from', from.display);
      formData.set('to', to);
      formData.set('subject', subject);
      formData.set('text', text);
      formData.set('html', html);
      const mgRes = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
      if (mgRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'mailgun',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
    }

    // 7. MailChannels (optional when explicitly enabled on Cloudflare)
    if (env.USE_MAILCHANNELS === 'true') {
      const mcRes = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from.email, name: from.name },
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html },
          ],
        }),
      });
      if (mcRes.ok) {
        return Response.json({
          delivered: true,
          provider: 'mailchannels',
          from: from.email,
          message: `Login details emailed directly to ${to} from ${from.email}.`,
        });
      }
    }

    return Response.json({
      delivered: false,
      fallback: 'mailto',
      message: 'Opening your email app with login details pre-filled.',
    });
  } catch {
    return Response.json({
      delivered: false,
      fallback: 'mailto',
      message: 'Opening your email app with login details pre-filled.',
    });
  }
}
