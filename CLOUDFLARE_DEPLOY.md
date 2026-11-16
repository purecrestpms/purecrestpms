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
4. SPA deep links (`/login/pch-admin`, `/login/richgates-admin`, `/login/staff`) are handled automatically by `public/_redirects`.

## Connecting Direct Custom Subdomains (`admin.pchpms.com` & `richgates.pchpms.com`)

The app automatically detects the hostname subdomain on startup and opens the matching portal:
- `https://admin.pchpms.com` -> **PCH Super Admin Console** (manage Richgates and all other properties, issue licenses, edit CMS)
- `https://richgates.pchpms.com` -> **Richgates Property Admin Portal** (locked to Richgates Apartments)
- `https://staff.pchpms.com` -> **Staff Operations Portal**

### Setup Steps (Cloudflare + DNS + Firebase)
1. **Cloudflare Pages Custom Domains**:
   - Open Cloudflare Dashboard -> **Workers & Pages** -> `pch-pms` -> **Custom domains** -> **Set up a custom domain**.
   - Add `admin.pchpms.com`, `richgates.pchpms.com`, and optionally `staff.pchpms.com`.
2. **DNS Records (`pchpms.com`)**:
   - Ensure Cloudflare DNS creates (or has) proxied **CNAME** records:
     - `admin` -> `pch-pms.pages.dev` (Proxied)
     - `richgates` -> `pch-pms.pages.dev` (Proxied)
     - `staff` -> `pch-pms.pages.dev` (Proxied)
   - Set **SSL/TLS** encryption mode to **Full (strict)**.
3. **Firebase Authorized Domains (Required for Google Login)**:
   - Open **Firebase Console -> Authentication -> Settings -> Authorized domains**.
   - Add `pch-pms.pages.dev`, `admin.pchpms.com`, `richgates.pchpms.com`, and `staff.pchpms.com`.

