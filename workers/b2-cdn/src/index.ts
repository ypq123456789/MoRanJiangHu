export interface NormalizedRequestPath {
  visibility: 'public';
  normalizedPath: string;
}

export function normalizeRequestPath(pathname: string): NormalizedRequestPath {
  return {
    visibility: 'public',
    normalizedPath: pathname,
  };
}

export default {
  fetch(request: Request): Response {
    const { normalizedPath } = normalizeRequestPath(new URL(request.url).pathname);

    return new Response(`Not implemented: ${normalizedPath}`, {
      status: 501,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  },
};
