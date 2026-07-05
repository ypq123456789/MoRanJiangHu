import { describe, expect, it } from 'vitest';
import { normalizeRequestPath } from '../workers/b2-cdn/src/pathing';

describe('normalizeRequestPath', () => {
  it('accepts public paths', () => {
    expect(normalizeRequestPath('/public/moranjianghu/apk/latest.apk')).toEqual({
      visibility: 'public',
      normalizedPath: '/public/moranjianghu/apk/latest.apk',
      bucketKey: 'public/moranjianghu/apk/latest.apk',
    });
  });

  it('accepts private paths', () => {
    expect(normalizeRequestPath('/private/moranjianghu/saves/a.zip')).toEqual({
      visibility: 'private',
      normalizedPath: '/private/moranjianghu/saves/a.zip',
      bucketKey: 'private/moranjianghu/saves/a.zip',
    });
  });

  it('rejects traversal', () => {
    expect(() => normalizeRequestPath('/private/moranjianghu/../secrets.txt')).toThrow(
      /非法路径/,
    );
  });

  it('rejects unsupported roots', () => {
    expect(() => normalizeRequestPath('/foo/bar.txt')).toThrow(/仅支持 public 或 private/);
  });
});
