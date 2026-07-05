import { describe, expect, it } from 'vitest';
import { normalizeRequestPath } from '../workers/b2-cdn/src/pathing';

describe('b2 cdn worker scaffold', () => {
  it('normalizes a simple public path', () => {
    expect(normalizeRequestPath('/public/moranjianghu/apk/latest.apk')).toMatchObject({
      visibility: 'public',
      normalizedPath: '/public/moranjianghu/apk/latest.apk',
    });
  });
});
