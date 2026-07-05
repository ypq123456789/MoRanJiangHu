export function getCacheControl(pathname: string): string {
  if (pathname.startsWith('/private/')) {
    return 'no-store';
  }

  if (/\/latest\.(apk|json)$/i.test(pathname)) {
    return 'public, max-age=60, stale-while-revalidate=300';
  }

  return 'public, max-age=31536000, immutable';
}
