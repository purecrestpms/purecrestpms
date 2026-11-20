interface CfMiddlewareContext {
  request: Request;
  next: () => Promise<Response>;
}

const INTERNAL_PATH_RE = /^\/(admin|login|staff|pch-admin|auth-action)(\/|$)/i;

function isInternalTenantHost(hostname: string): boolean {
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
    return false;
  }
  if (host.startsWith('admin.') || host.endsWith('.pchpms.com')) {
    return true;
  }
  return false;
}

function isInternalRequest(reqUrl: URL): boolean {
  if (isInternalTenantHost(reqUrl.hostname)) return true;
  if (INTERNAL_PATH_RE.test(reqUrl.pathname)) return true;
  const portal = (reqUrl.searchParams.get('portal') || '').toLowerCase();
  if (portal && portal !== 'home') return true;
  if (reqUrl.searchParams.has('page') || reqUrl.searchParams.has('oobCode')) return true;
  return false;
}

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

export async function onRequest(context: CfMiddlewareContext): Promise<Response> {
  const reqUrl = new URL(context.request.url);
  const legacyPrefix = '/assets/' + 'aistudio/';
  if (reqUrl.pathname.startsWith(legacyPrefix)) {
    const fileName = decodeURIComponent(reqUrl.pathname.slice(legacyPrefix.length));
    const targetPath = LEGACY_MEDIA_REDIRECTS[fileName] || '/assets/media/rooms/deluxe-studio-bedroom.png';
    return Response.redirect(new URL(targetPath, reqUrl.origin).toString(), 301);
  }

  const response = await context.next();

  if (!isInternalRequest(reqUrl)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  if ((headers.get('Content-Type') || '').includes('text/html')) {
    headers.set('Cache-Control', 'private, no-store');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
