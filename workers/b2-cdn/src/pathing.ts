import type { NormalizedRequestPath, Visibility } from './types';

const INVALID_SEGMENTS = new Set(['.', '..']);

export const normalizeRequestPath = (pathname: string): NormalizedRequestPath => {
  const clean = `/${String(pathname || '').replace(/^\/+/, '')}`.replace(/\/+/g, '/');
  const parts = clean.split('/').filter(Boolean);
  const visibility = parts[0] as Visibility | undefined;

  if (visibility !== 'public' && visibility !== 'private') {
    throw new Error('仅支持 public 或 private 根路径');
  }

  if (parts.some((part) => INVALID_SEGMENTS.has(part))) {
    throw new Error('非法路径：不允许目录穿透');
  }

  if (parts.length < 3) {
    throw new Error('非法路径：至少需要 public|private/<namespace>/<file>');
  }

  return {
    visibility,
    normalizedPath: `/${parts.join('/')}`,
    bucketKey: parts.join('/'),
  };
};
