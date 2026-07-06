import type { Env } from './config';
import { fetchPrivateObjectFromB2 } from './b2Client';
import { getCacheControl } from './cachePolicy';
import {
  buildObjectStorageProxyPreflightResponse,
  handleObjectStorageProxyRequest,
  isObjectStorageProxyPath,
} from './objectStorageProxy';
import { normalizeRequestPath } from './pathing';
import { textResponse } from './response';
import { verifyPrivateSignature } from './signing';

export interface HandleCdnRequestDeps {
  fetchObject?: (env: Env, key: string, request: Request) => Promise<Response>;
  fetchObjectStorage?: (request: Request) => Promise<Response>;
  cache?: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
}

const createNoopCache = (): NonNullable<HandleCdnRequestDeps['cache']> => ({
  async match() {
    return undefined;
  },
  async put() {
    return;
  },
});

function cloneHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers();
  headers.forEach((value, key) => {
    nextHeaders.set(key, value);
  });
  return nextHeaders;
}

function buildResponseFromUpstream(request: Request, upstream: Response, cacheControl: string): Response {
  const headers = cloneHeaders(upstream.headers);
  headers.set('cache-control', cacheControl);

  return new Response(request.method.toUpperCase() === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function isCacheablePublicRequest(request: Request, cacheControl: string): boolean {
  const method = request.method.toUpperCase();
  if (cacheControl.includes('no-store')) return false;
  if (method !== 'GET' && method !== 'HEAD') return false;
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
}

function buildPublicCacheKey(request: Request): Request {
  return new Request(`https://b2-cdn-cache.invalid/${request.method.toUpperCase()}${new URL(request.url).pathname}${new URL(request.url).search}`, {
    method: 'GET',
  });
}

export async function handleCdnRequest(
  request: Request,
  env: Env,
  deps: HandleCdnRequestDeps = {},
): Promise<Response> {
  try {
    const url = new URL(request.url);

    if (isObjectStorageProxyPath(url.pathname)) {
      if (request.method.toUpperCase() === 'OPTIONS') {
        return buildObjectStorageProxyPreflightResponse();
      }
      if (request.method.toUpperCase() !== 'POST') {
        return textResponse('对象存储代理仅支持 POST / OPTIONS', 405);
      }
      const fetchObjectStorage = deps.fetchObjectStorage ?? ((proxyRequest: Request) => handleObjectStorageProxyRequest(proxyRequest));
      return fetchObjectStorage(request);
    }

    const normalized = normalizeRequestPath(url.pathname);
    const cacheControl = getCacheControl(normalized.normalizedPath);
    const globalCache = (globalThis as unknown as { caches?: { default?: HandleCdnRequestDeps['cache'] } }).caches?.default;
    const cache = deps.cache ?? globalCache ?? createNoopCache();
    const shouldCachePublic = normalized.visibility === 'public' && isCacheablePublicRequest(request, cacheControl);
    const cacheKey = shouldCachePublic ? buildPublicCacheKey(request) : null;

    if (cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return buildResponseFromUpstream(request, cached, cacheControl);
      }
    }

    if (normalized.visibility === 'private') {
      await verifyPrivateSignature({
        method: request.method,
        pathname: normalized.normalizedPath,
        expiresAt: url.searchParams.get('e') ?? '',
        sig: url.searchParams.get('sig') ?? undefined,
        secret: env.B2_CDN_SIGNING_SECRET,
      });
    }

    const fetchObject = deps.fetchObject ?? ((runtimeEnv, key, runtimeRequest) =>
      fetchPrivateObjectFromB2(runtimeEnv, key, runtimeRequest));
    const upstream = await fetchObject(env, normalized.bucketKey, request);
    const response = buildResponseFromUpstream(request, upstream, cacheControl);
    if (cacheKey && response.ok) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    if (message.includes('签名')) {
      return textResponse(message, 403);
    }

    if (message.includes('非法路径') || message.includes('仅支持')) {
      return textResponse(message, 400);
    }

    return textResponse(message, 500);
  }
}
