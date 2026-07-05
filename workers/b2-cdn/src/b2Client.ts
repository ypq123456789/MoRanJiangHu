import type { Env } from './config';

export interface FetchPrivateObjectDeps {
  fetchImpl?: typeof fetch;
}

const B2_API = 'https://api.backblazeb2.com/b2api/v2';
const FORWARDED_REQUEST_HEADERS = ['range', 'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since'];

interface B2AuthorizeResponse {
  authorizationToken?: string;
  downloadUrl?: string;
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function readText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function authorizeAccount(
  env: Env,
  fetchImpl: typeof fetch,
): Promise<Required<Pick<B2AuthorizeResponse, 'authorizationToken' | 'downloadUrl'>>> {
  const basicToken = btoa(`${env.MORAN_B2_APPLICATION_KEY_ID}:${env.MORAN_B2_APPLICATION_KEY}`);
  const response = await fetchImpl(`${B2_API}/b2_authorize_account`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicToken}`,
    },
  });

  if (!response.ok) {
    const message = await readText(response);
    throw new Error(`B2 authorize failed: ${response.status} ${message}`.trim());
  }

  const data = (await response.json()) as B2AuthorizeResponse;
  if (!data.authorizationToken || !data.downloadUrl) {
    throw new Error('B2 authorize failed: missing authorizationToken or downloadUrl');
  }

  return {
    authorizationToken: data.authorizationToken,
    downloadUrl: data.downloadUrl,
  };
}

function buildUpstreamHeaders(request: Request, authorizationToken: string): Headers {
  const headers = new Headers({
    Authorization: authorizationToken,
  });

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const headerValue = request.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
}

export async function fetchPrivateObjectFromB2(
  env: Env,
  key: string,
  request: Request,
  deps: FetchPrivateObjectDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { authorizationToken, downloadUrl } = await authorizeAccount(env, fetchImpl);
  const upstreamUrl = `${downloadUrl}/file/${encodeURIComponent(env.MORAN_B2_BUCKET_NAME)}/${encodeObjectKey(key)}`;
  const upstreamResponse = await fetchImpl(upstreamUrl, {
    method: request.method,
    headers: buildUpstreamHeaders(request, authorizationToken),
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    const message = await readText(upstreamResponse);
    throw new Error(`B2 object fetch failed: ${upstreamResponse.status} ${message}`.trim());
  }

  return upstreamResponse;
}
