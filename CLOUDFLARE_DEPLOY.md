# Deploying PCH PMS to Cloudflare Pages

PCH PMS is engineered as a cloud-native React + TypeScript + Firebase Firestore SPA, ready for instant global edge deployment on Cloudflare Pages.

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
4. SPA deep links (`/staff`, `/login/pch-admin`, `/login/richgates-admin`, `/login/staff`) are handled automatically by `public/_redirects`.

## Connecting Direct Custom Subdomains (`app.pchpms.com`, `admin.pchpms.com` & `richgates.pchpms.com/staff`)

The app automatically detects the subdomain and `/staff` path on startup:
- `https://app.pchpms.com` -> **PCH PMS Public Homepage, Pricing & Plan Purchase Portal** (showcase, plans, purchase orders & contact form)
- `https://admin.pchpms.com` -> **PCH Super Admin Console** (manage Richgates and all other properties, issue licenses, view incoming inquiries, edit CMS)
- `https://richgates.pchpms.com` -> **Richgates Property Admin Portal** (locked to Richgates Apartments)
- `https://richgates.pchpms.com/staff` -> **Richgates Staff Operations Portal** (and `<property>.pchpms.com/staff` for any future property)

### Setup Steps (Cloudflare + DNS + Firebase)
1. **Cloudflare Pages Custom Domains**:
   - Open Cloudflare Dashboard -> **Workers & Pages** -> `pch-pms` -> **Custom domains** -> **Set up a custom domain**.
   - Add `app.pchpms.com`, `admin.pchpms.com`, and `richgates.pchpms.com` (and each additional `<property>.pchpms.com`).
2. **DNS Records (`pchpms.com`)**:
   - Ensure Cloudflare DNS creates (or has) proxied **CNAME** records:
     - `app` -> `pch-pms.pages.dev` (Proxied)
     - `admin` -> `pch-pms.pages.dev` (Proxied)
     - `richgates` -> `pch-pms.pages.dev` (Proxied)
   - Set **SSL/TLS** encryption mode to **Full (strict)**. No extra DNS record is needed for `/staff` or `/home`; Cloudflare Pages SPA routing (`public/_redirects`) handles them automatically under each domain.
3. **Firebase Authorized Domains (Required for Google Login)**:
   - Open **Firebase Console -> Authentication -> Settings -> Authorized domains**.
   - Add `pch-pms.pages.dev`, `app.pchpms.com`, `admin.pchpms.com`, and `richgates.pchpms.com`.

## Live OTA Account iCal Sync (`/api/ical-proxy`)
- The workspace includes `functions/api/ical-proxy.ts` (Cloudflare Pages Function) alongside `server.ts` (for Node/Express).
- When deploying `dist` via Cloudflare Pages (`npx wrangler pages deploy dist --project-name=pch-pms`), Cloudflare automatically mounts `functions/api/ical-proxy.ts` at `/api/ical-proxy` so properties can pull live `.ics` reservations from Booking.com, Airbnb, Expedia, and VRBO without browser CORS errors.
