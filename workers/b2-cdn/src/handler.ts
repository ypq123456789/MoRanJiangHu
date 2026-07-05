import type { Env } from './config';
import { fetchPrivateObjectFromB2 } from './b2Client';
import { getCacheControl } from './cachePolicy';
import { normalizeRequestPath } from './pathing';
import { textResponse } from './response';
import { verifyPrivateSignature } from './signing';

export interface HandleCdnRequestDeps {
  fetchObject?: (env: Env, key: string, request: Request) => Promise<Response>;
}

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

export async function handleCdnRequest(
  request: Request,
  env: Env,
  deps: HandleCdnRequestDeps = {},
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const normalized = normalizeRequestPath(url.pathname);

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

    return buildResponseFromUpstream(request, upstream, getCacheControl(normalized.normalizedPath));
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
