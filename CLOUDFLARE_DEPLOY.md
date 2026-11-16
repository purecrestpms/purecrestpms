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

## Firebase Authorized Domain
After deploying to `https://pch-pms.pages.dev` (or your custom PureCrest domain), add your Cloudflare domain under **Firebase Console -> Authentication -> Settings -> Authorized domains**.
