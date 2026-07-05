import type { Env } from './config';

export interface FetchPrivateObjectDeps {
  fetchImpl?: typeof fetch;
}

export async function fetchPrivateObjectFromB2(
  _env: Env,
  key: string,
  request: Request,
  deps: FetchPrivateObjectDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const target = `https://example.invalid/${key}`;
  return fetchImpl(target, {
    method: request.method,
    headers: request.headers,
  });
}
