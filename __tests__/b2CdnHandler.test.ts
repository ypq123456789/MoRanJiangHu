import { describe, expect, it, vi } from 'vitest';

import { handleCdnRequest } from '../workers/b2-cdn/src/handler';

const env = {
  B2_CDN_SIGNING_SECRET: 'test-secret',
  MORAN_B2_APPLICATION_KEY_ID: 'key-id',
  MORAN_B2_APPLICATION_KEY: 'key',
  MORAN_B2_BUCKET_ID: 'bucket-id',
  MORAN_B2_BUCKET_NAME: 'bucket-name',
};

describe('handleCdnRequest', () => {
  it('returns 403 for private requests without signature', async () => {
    const request = new Request('https://cdn.example.com/private/moranjianghu/saves/demo.zip');

    const response = await handleCdnRequest(request, env);

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain('缺少签名参数');
  });

  it('serves public requests with cache headers from fetchObject', async () => {
    const fetchObject = vi.fn().mockResolvedValue(
      new Response('apk-binary', {
        status: 200,
        headers: {
          'content-type': 'application/vnd.android.package-archive',
          etag: '"demo"',
        },
      }),
    );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/latest.apk');

    const response = await handleCdnRequest(request, env, { fetchObject });

    expect(response.status).toBe(200);
    expect(fetchObject).toHaveBeenCalledOnce();
    expect(response.headers.get('Cache-Control')).toContain('public');
    expect(response.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    await expect(response.text()).resolves.toBe('apk-binary');
  });
});
