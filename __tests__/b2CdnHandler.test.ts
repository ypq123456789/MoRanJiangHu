import { describe, expect, it, vi } from 'vitest';

import { fetchPrivateObjectFromB2 } from '../workers/b2-cdn/src/b2Client';
import { handleCdnRequest } from '../workers/b2-cdn/src/handler';
import { createPrivateSignature } from '../workers/b2-cdn/src/signing';

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

  it('forwards range public requests and preserves 206 responses', async () => {
    const fetchObject = vi.fn().mockResolvedValue(
      new Response('partial', {
        status: 206,
        headers: {
          'content-range': 'bytes 0-6/42',
          'content-type': 'application/octet-stream',
        },
      }),
    );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/latest.apk', {
      headers: {
        Range: 'bytes=0-6',
      },
    });

    const response = await handleCdnRequest(request, env, { fetchObject });

    expect(fetchObject).toHaveBeenCalledOnce();
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-6/42');
    await expect(response.text()).resolves.toBe('partial');
  });

  it('returns null body for HEAD responses', async () => {
    const fetchObject = vi.fn().mockResolvedValue(
      new Response('apk-binary', {
        status: 200,
        headers: {
          'content-type': 'application/vnd.android.package-archive',
        },
      }),
    );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/latest.apk', {
      method: 'HEAD',
    });

    const response = await handleCdnRequest(request, env, { fetchObject });

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it('uses no-store cache policy for private responses', async () => {
    const expiresAt = Math.floor(Date.now() / 1000 + 60).toString();
    const fetchObject = vi.fn().mockResolvedValue(
      new Response('save-data', {
        status: 200,
        headers: {
          'content-type': 'application/zip',
        },
      }),
    );
    const signature = await createPrivateSignature({
      method: 'GET',
      pathname: '/private/moranjianghu/saves/demo.zip',
      expiresAt,
      secret: env.B2_CDN_SIGNING_SECRET,
    });
    const request = new Request(
      `https://cdn.example.com/private/moranjianghu/saves/demo.zip?e=${expiresAt}&sig=${signature}`,
    );

    const response = await handleCdnRequest(request, env, { fetchObject });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

describe('fetchPrivateObjectFromB2', () => {
  it('authorizes against b2 and forwards range plus conditional headers to private download', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authorizationToken: 'account-token',
            downloadUrl: 'https://f002.backblazeb2.com',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response('partial-apk', {
          status: 206,
          headers: {
            'content-range': 'bytes 0-6/42',
            etag: '"demo"',
          },
        }),
      );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/latest build.apk', {
      headers: {
        Range: 'bytes=0-6',
        'If-Range': '"range-etag"',
        'If-None-Match': '"etag-value"',
        'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT',
      },
    });

    const response = await fetchPrivateObjectFromB2(env, 'moranjianghu/apk/latest build.apk', request, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from(`${env.MORAN_B2_APPLICATION_KEY_ID}:${env.MORAN_B2_APPLICATION_KEY}`).toString('base64')}`,
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://f002.backblazeb2.com/file/bucket-name/moranjianghu/apk/latest%20build.apk',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    const secondCallInit = fetchImpl.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondCallHeaders = secondCallInit?.headers as Headers | undefined;
    expect(secondCallHeaders?.get('Authorization')).toBe('account-token');
    expect(secondCallHeaders?.get('Range')).toBe('bytes=0-6');
    expect(secondCallHeaders?.get('If-Range')).toBe('"range-etag"');
    expect(secondCallHeaders?.get('If-None-Match')).toBe('"etag-value"');
    expect(secondCallHeaders?.get('If-Modified-Since')).toBe('Wed, 21 Oct 2015 07:28:00 GMT');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-6/42');
    await expect(response.text()).resolves.toBe('partial-apk');
  });
});
