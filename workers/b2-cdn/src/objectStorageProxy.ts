const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Object-Storage-Method, X-Object-Storage-Endpoint, X-Object-Storage-Bucket, X-Object-Storage-Key, X-Object-Storage-Access-Key, X-Object-Storage-Secret-Key, X-Object-Storage-Username',
};

const ALLOWED_METHODS = new Set(['GET', 'PUT', 'HEAD', 'DELETE', 'LIST']);
const encoder = new TextEncoder();

const readHeader = (request: Request, name: string): string => request.headers.get(name)?.trim() || '';

const buildJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });

const isBlockedHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower === 'metadata.google.internal') {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    const [a, b] = lower.split('.').map((part) => Number(part));
    return (
      a === 0
      || a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
    );
  }
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
};

const readMethod = (request: Request): string => {
  const method = readHeader(request, 'X-Object-Storage-Method').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new Error('Unsupported object storage method');
  return method;
};

const normalizeEndpoint = (raw: string): URL => {
  if (!raw) throw new Error('Missing X-Object-Storage-Endpoint header');
  const endpoint = new URL(raw.replace(/\/+$/, ''));
  if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
    throw new Error('Unsupported object storage protocol');
  }
  if (isBlockedHostname(endpoint.hostname)) throw new Error('Blocked object storage endpoint host');
  return endpoint;
};

const encodeS3Path = (value: string): string =>
  value
    .split('/')
    .filter(Boolean)
    .map((part) =>
      encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`),
    )
    .join('/');

const encodeAwsQueryValue = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const buildCanonicalQueryString = (url: URL): string => {
  const entries: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeAwsQueryValue(key)}=${encodeAwsQueryValue(value)}`)
    .join('&');
};

const buildTargetUrl = (request: Request): URL => {
  const endpoint = normalizeEndpoint(readHeader(request, 'X-Object-Storage-Endpoint'));
  const bucket = readHeader(request, 'X-Object-Storage-Bucket');
  const key = readHeader(request, 'X-Object-Storage-Key').replace(/^\/+/, '');
  const method = readMethod(request);

  if (!bucket) throw new Error('Missing X-Object-Storage-Bucket header');
  if (!key && method !== 'LIST') throw new Error('Missing X-Object-Storage-Key header');

  endpoint.pathname = [endpoint.pathname.replace(/\/+$/, ''), encodeURIComponent(bucket), method === 'LIST' ? '' : encodeS3Path(key)]
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');

  if (method === 'LIST') {
    endpoint.searchParams.set('list-type', '2');
    endpoint.searchParams.set('prefix', key);
    endpoint.searchParams.set('max-keys', '1000');
  } else {
    endpoint.search = '';
  }

  return endpoint;
};

const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
};

const sha256Hex = async (data: ArrayBuffer | string): Promise<string> => {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
};

const bytesToHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');

const deriveSigningKey = async (secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> => {
  const kDate = await hmac(encoder.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const formatAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};

const buildAuthorization = async (params: {
  method: string;
  url: URL;
  bodyHash: string;
  accessKey: string;
  secretKey: string;
  amzDate: string;
  dateStamp: string;
  contentType?: string;
}): Promise<string> => {
  const region = 'auto';
  const service = 's3';
  const canonicalHeaders = [
    params.contentType ? `content-type:${params.contentType}\n` : '',
    `host:${params.url.host}\n`,
    `x-amz-content-sha256:${params.bodyHash}\n`,
    `x-amz-date:${params.amzDate}\n`,
  ].join('');
  const signedHeaders = `${params.contentType ? 'content-type;' : ''}host;x-amz-content-sha256;x-amz-date`;
  const canonicalRequest = [
    params.method,
    params.url.pathname,
    buildCanonicalQueryString(params.url),
    canonicalHeaders,
    signedHeaders,
    params.bodyHash,
  ].join('\n');
  const credentialScope = `${params.dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', params.amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  const signingKey = await deriveSigningKey(params.secretKey, params.dateStamp, region, service);
  const signature = bytesToHex(await hmac(signingKey, stringToSign));
  return `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
};

export interface HandleObjectStorageProxyDeps {
  fetchImpl?: typeof fetch;
  cache?: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
    delete(request: Request): Promise<boolean>;
  };
}

export const isObjectStorageProxyPath = (pathname: string): boolean => pathname === '/api/object-storage-proxy';

export const buildObjectStorageProxyPreflightResponse = (): Response =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

const CACHE_SCOPE_URL = 'https://object-storage-cache.invalid';

const digestHex = async (value: string): Promise<string> => {
  const bytes = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
};

const readCacheControlForObject = (method: string, key: string): string => {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'LIST') return 'public, max-age=15, stale-while-revalidate=60';
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') return 'no-store';
  if (/\/manifest\.json$/i.test(key)) return 'public, max-age=15, stale-while-revalidate=60';
  if (/\/settings\.json$/i.test(key)) return 'public, max-age=60, stale-while-revalidate=300';
  if (/\/(saves|chunks)\//i.test(key)) return 'public, max-age=86400, stale-while-revalidate=604800, immutable';
  return 'public, max-age=300, stale-while-revalidate=900';
};

const isCacheableRead = (request: Request, method: string): boolean => {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD' && normalizedMethod !== 'LIST') return false;
  if (request.headers.has('Range')) return false;
  if (
    request.headers.has('If-None-Match')
    || request.headers.has('If-Modified-Since')
    || request.headers.has('If-Match')
    || request.headers.has('If-Unmodified-Since')
    || request.headers.has('If-Range')
  ) {
    return false;
  }
  return true;
};

const buildCacheKeyRequest = async (request: Request, method: string, bucket: string, key: string, endpoint: string): Promise<Request> => {
  const credentialScope = await digestHex(
    [
      readHeader(request, 'X-Object-Storage-Access-Key'),
      request.headers.get('X-Object-Storage-Secret-Key') || '',
      endpoint,
      bucket,
    ].join('\n'),
  );
  const encodedKey = encodeURIComponent(key);
  const cacheUrl = `${CACHE_SCOPE_URL}/${method.toUpperCase()}/${credentialScope}/${encodeURIComponent(bucket)}/${encodedKey}`;
  return new Request(cacheUrl, { method: 'GET' });
};

const withProxyHeaders = (response: Response, cacheControl?: string): Response => {
  const responseHeaders = new Headers();
  ['Content-Type', 'ETag', 'Last-Modified', 'Content-Length', 'Content-Range'].forEach((name) => {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  });
  Object.entries(CORS_HEADERS).forEach(([key, value]) => responseHeaders.set(key, value));
  if (cacheControl) responseHeaders.set('Cache-Control', cacheControl);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

const buildInvalidationTargets = async (
  request: Request,
  endpoint: string,
  bucket: string,
  key: string,
): Promise<Request[]> => {
  const targets = [await buildCacheKeyRequest(request, 'GET', bucket, key, endpoint)];
  if (/\/manifest\.json$/i.test(key)) {
    targets.push(await buildCacheKeyRequest(request, 'HEAD', bucket, key, endpoint));
    targets.push(await buildCacheKeyRequest(request, 'LIST', bucket, key.replace(/manifest\.json$/i, 'saves/'), endpoint));
  } else if (/\/(saves|chunks)\//i.test(key)) {
    targets.push(await buildCacheKeyRequest(request, 'GET', bucket, key.replace(/\/(saves|chunks)\/.*$/i, '/manifest.json'), endpoint));
    targets.push(await buildCacheKeyRequest(request, 'HEAD', bucket, key.replace(/\/(saves|chunks)\/.*$/i, '/manifest.json'), endpoint));
    targets.push(await buildCacheKeyRequest(request, 'LIST', bucket, key.replace(/\/(saves|chunks)\/.*$/i, '/saves/'), endpoint));
  }
  return targets;
};

export async function handleObjectStorageProxyRequest(
  request: Request,
  deps: HandleObjectStorageProxyDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cache = deps.cache ?? (globalThis as unknown as { caches: { default: HandleObjectStorageProxyDeps['cache'] } }).caches.default;

  try {
    const method = readMethod(request);
    const upstreamMethod = method === 'LIST' ? 'GET' : method;
    const targetUrl = buildTargetUrl(request);
    const endpoint = readHeader(request, 'X-Object-Storage-Endpoint');
    const bucket = readHeader(request, 'X-Object-Storage-Bucket');
    const key = readHeader(request, 'X-Object-Storage-Key').replace(/^\/+/, '');
    const accessKey = readHeader(request, 'X-Object-Storage-Access-Key');
    const secretKey = request.headers.get('X-Object-Storage-Secret-Key') || '';

    if (!accessKey || !secretKey) throw new Error('Missing object storage access key or secret key');

    const cacheControl = readCacheControlForObject(method, key);
    const cacheableRead = isCacheableRead(request, method);
    const cacheKey = cacheableRead ? await buildCacheKeyRequest(request, method, bucket, key, endpoint) : null;

    if (cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return withProxyHeaders(cached, cacheControl);
      }
    }

    const body =
      method === 'GET' || method === 'HEAD' || method === 'LIST' || method === 'DELETE'
        ? undefined
        : await request.arrayBuffer();
    const contentType = request.headers.get('Content-Type')?.trim() || (body ? 'application/octet-stream' : '');
    const bodyHash = await sha256Hex(body || '');
    const { amzDate, dateStamp } = formatAmzDate(new Date());
    const headers = new Headers();
    headers.set('Host', targetUrl.host);
    headers.set('x-amz-content-sha256', bodyHash);
    headers.set('x-amz-date', amzDate);
    if (contentType) headers.set('Content-Type', contentType);
    headers.set(
      'Authorization',
      await buildAuthorization({
        method: upstreamMethod,
        url: targetUrl,
        bodyHash,
        accessKey,
        secretKey,
        amzDate,
        dateStamp,
        contentType,
      }),
    );

    const upstreamResponse = await fetchImpl(targetUrl.toString(), {
      method: upstreamMethod,
      headers,
      body,
    });
    const proxiedResponse = withProxyHeaders(upstreamResponse, cacheControl);

    if (cacheKey && proxiedResponse.ok) {
      await cache.put(cacheKey, proxiedResponse.clone());
    }

    if ((method === 'PUT' || method === 'DELETE') && proxiedResponse.ok) {
      const invalidationTargets = await buildInvalidationTargets(request, endpoint, bucket, key);
      await Promise.all(invalidationTargets.map((target) => cache.delete(target)));
    }

    return proxiedResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildJsonResponse({ error: 'Object storage proxy failed', detail: message }, 502);
  }
}
