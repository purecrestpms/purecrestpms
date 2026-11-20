interface R2ObjectPutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
}

interface R2BucketBinding {
  put: (key: string, value: Uint8Array, options?: R2ObjectPutOptions) => Promise<unknown>;
}

interface CfMediaEnv {
  MEDIA_BUCKET?: R2BucketBinding;
}

interface CfMediaContext {
  request: Request;
  env: CfMediaEnv;
}

function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function onRequestPost(context: CfMediaContext): Promise<Response> {
  const { request, env } = context;

  let body: {
    propertyId?: string;
    folder?: string;
    slug?: string;
    dataUrl?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
  }

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return Response.json(
      { error: 'Only JPEG, PNG, and WebP image uploads are supported.' },
      { status: 400 }
    );
  }

  const mimeType = match[1];
  const base64Data = match[2];
  if (base64Data.length > 600_000) {
    return Response.json(
      { error: 'Uploaded image exceeds maximum size limit.' },
      { status: 413 }
    );
  }

  // If Cloudflare R2 MEDIA_BUCKET is not bound, instruct client to persist cleanly in app database
  if (!env.MEDIA_BUCKET) {
    return Response.json({
      stored: false,
      fallback: 'app_database',
      message: 'Application object storage bucket is not bound; storing optimized image in application database.',
    });
  }

  const folder = body.folder === 'logos' ? 'logos' : 'rooms';
  const propertySlug = sanitizeSegment(body.propertyId || 'property', 'property');
  const fileSlug = sanitizeSegment(body.slug || 'photo', 'photo');
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const objectKey = `${folder}/${propertySlug}/${fileSlug}-${uniqueSuffix}.${ext}`;

  try {
    const bytes = decodeBase64ToBytes(base64Data);
    await env.MEDIA_BUCKET.put(objectKey, bytes, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return Response.json({
      stored: true,
      storage: 'r2',
      url: `/api/media/${objectKey}`,
    });
  } catch {
    return Response.json({
      stored: false,
      fallback: 'app_database',
      message: 'Object storage unavailable; storing optimized image in application database.',
    });
  }
}
