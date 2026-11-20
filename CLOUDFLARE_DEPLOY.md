# Deploying PCH PMS to Cloudflare Pages

PCH PMS is engineered as a cloud-native React + TypeScript SaaS platform backed by PCH Cloud Database, ready for instant global edge deployment on Cloudflare Pages.

## Option 1: Wrangler CLI (Direct Deploy)
```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name=pch-pms
```

## Option 2: Cloudflare Dashboard (Git Integration)
1. Connect your repository in Cloudflare Dashboard -> **Workers & Pages** -> **Create Application** -> **Pages**.
2. Set **Build command**: `npm run build`
3. Set **Build output directory**: `dist`
4. SPA deep links (`/staff`, `/login`, `/auth-action`, `/pch-admin`) are handled automatically by `public/_redirects`.

## Connecting Direct Custom Subdomains (`app.pchpms.com`, `admin.pchpms.com` & `richgates.pchpms.com/staff`)

The app automatically detects the subdomain and `/staff` path on startup:
- `https://app.pchpms.com` -> **PCH PMS Public Homepage, Pricing & Plan Purchase Portal** (showcase, plans, purchase orders & contact form)
- `https://admin.pchpms.com` -> **PCH Super Admin Console** (manage Richgates and all client properties, subdomains, licenses, inquiries, and CMS)
- `https://richgates.pchpms.com` -> **Richgates Property Admin Portal** (locked strictly to Richgates Apartments)
- `https://richgates.pchpms.com/staff` -> **Richgates Staff Operations Portal** (and `<client>.pchpms.com/staff` for any future client property)

### Setup Steps (Cloudflare + DNS + Branded Auth Links)
1. **Cloudflare Pages Custom Domains**:
   - Open Cloudflare Dashboard -> **Workers & Pages** -> `pch-pms` -> **Custom domains** -> **Set up a custom domain**.
   - Add `pchpms.com`, `app.pchpms.com`, `admin.pchpms.com`, and `richgates.pchpms.com` (and each additional `<client>.pchpms.com`).
2. **DNS Records (`pchpms.com`)**:
   - Ensure Cloudflare DNS creates (or has) proxied **CNAME** records:
     - `@` (`pchpms.com`) -> `pch-pms.pages.dev` (Proxied)
     - `app` -> `pch-pms.pages.dev` (Proxied)
     - `admin` -> `pch-pms.pages.dev` (Proxied)
     - `richgates` -> `pch-pms.pages.dev` (Proxied)
   - Set **SSL/TLS** encryption mode to **Full (strict)**. No extra DNS record is needed for `/staff` or `/auth-action`; Cloudflare Pages SPA routing (`public/_redirects`) and `functions/_middleware.ts` (`X-Robots-Tag: noindex, nofollow`) handle routing and search-engine exclusion automatically.
3. **Branded Email Links & Authorized Domains (`pchpms.com`)**:
   - In **Authentication -> Settings -> Authorized domains**, add `pchpms.com` (covers `app.pchpms.com`, `admin.pchpms.com`, and all `<client>.pchpms.com` subdomains).
   - In **Project Settings -> General -> Public-facing name**, set the app name to **`PCH PMS`**.
   - In **Authentication -> Templates** (Password reset, Email address verification, Email address change), click **Edit -> Customize action URL** and set it to **`https://pchpms.com/auth-action`**.
   - In **Authentication -> Templates -> SMTP settings**, enable custom SMTP for **`noreply@pchpms.com`** with sender name **`PCH PMS`** so all password reset and verification emails send exclusively from `pchpms.com`.

## Live OTA Account iCal Sync (`/api/ical-proxy`)
- The workspace includes `functions/api/ical-proxy.ts` (Cloudflare Pages Function) alongside `server.ts` (for Node/Express).
- When deploying `dist` via Cloudflare Pages (`npx wrangler pages deploy dist --project-name=pch-pms`), Cloudflare automatically mounts `functions/api/ical-proxy.ts` at `/api/ical-proxy` so properties can pull live `.ics` reservations from Booking.com, Airbnb, Expedia, and VRBO without browser CORS errors.

## Transactional Login Share Email (`/api/share-login-email`)
- `functions/api/share-login-email.ts` runs as a Cloudflare Pages Function at `/api/share-login-email` and sends from `PCH PMS <noreply@pchpms.com>` (or `EMAIL_FROM`).
- Configure your mail provider secret in Cloudflare Pages -> **Settings -> Environment variables** (`RESEND_API_KEY`, `EMAIL_API_KEY`, `CLOUDFLARE_EMAIL_API_URL`, `BREVO_API_KEY`, `SENDGRID_API_KEY`, or `POSTMARK_API_KEY`).

## Application-Owned Media Storage (`/assets/media/*` & `/api/media/*`)
- All brand, property, and room images live under `public/assets/media/` (`brand/`, `properties/`, `rooms/`, `library/`).
- Newly uploaded room and property photos post to `functions/api/media/upload.ts` (`/api/media/upload`) and are served via `functions/api/media/[[path]].ts` (`/api/media/<key>`) when a Cloudflare R2 bucket binding named `MEDIA_BUCKET` is configured in Cloudflare Pages -> **Settings -> Functions -> R2 bucket bindings**.
- If `MEDIA_BUCKET` is not yet bound, uploads automatically fall back to compressed storage inside the application's Firestore database so uploaded photos work across all custom subdomains without broken links.


