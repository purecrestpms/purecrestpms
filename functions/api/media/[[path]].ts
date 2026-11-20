interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  httpEtag?: string;
}

interface R2BucketBinding {
  get: (key: string) => Promise<R2ObjectBody | null>;
}

interface CfMediaGetContext {
  params: { path?: string | string[] };
  env: { MEDIA_BUCKET?: R2BucketBinding };
}

export async function onRequestGet(context: CfMediaGetContext): Promise<Response> {
  const { params, env } = context;
  if (!env.MEDIA_BUCKET) {
    return new Response('Media storage not configured', { status: 404 });
  }

  const rawPath = Array.isArray(params.path) ? params.path.join('/') : params.path || '';
  const cleanKey = rawPath.replace(/^\/+/, '').replace(/\.\.+/g, '');
  if (!cleanKey || !/^(rooms|logos)\/[a-z0-9/_-]+\.(jpg|jpeg|png|webp)$/i.test(cleanKey)) {
    return new Response('Invalid media path', { status: 400 });
  }

  const obj = await env.MEDIA_BUCKET.get(cleanKey);
  if (!obj) {
    return new Response('Media asset not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set(
    'Cache-Control',
    obj.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable'
  );
  if (obj.httpEtag) {
    headers.set('ETag', obj.httpEtag);
  }

  return new Response(obj.body, { status: 200, headers });
}
