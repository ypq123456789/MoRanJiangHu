import { describe, expect, it, vi } from 'vitest';

import { __resetB2AuthorizeCacheForTests, fetchPrivateObjectFromB2 } from '../workers/b2-cdn/src/b2Client';
import { handleCdnRequest } from '../workers/b2-cdn/src/handler';
import { createPrivateSignature } from '../workers/b2-cdn/src/signing';
import { beforeEach } from 'vitest';

const env = {
  B2_CDN_SIGNING_SECRET: 'test-secret',
  MORAN_B2_APPLICATION_KEY_ID: 'key-id',
  MORAN_B2_APPLICATION_KEY: 'key',
  MORAN_B2_BUCKET_ID: 'bucket-id',
  MORAN_B2_BUCKET_NAME: 'bucket-name',
};

beforeEach(() => {
  __resetB2AuthorizeCacheForTests();
});

class MemoryCache {
  private readonly store = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    const value = this.store.get(request.url);
    return value ? value.clone() : undefined;
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response.clone());
  }

  async delete(request: Request): Promise<boolean> {
    return this.store.delete(request.url);
  }
}

describe('handleCdnRequest', () => {
  it('answers object storage proxy preflight requests', async () => {
    const request = new Request('https://cdn.example.com/api/object-storage-proxy', {
      method: 'OPTIONS',
    });

    const response = await handleCdnRequest(request, env);

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('handles object storage proxy POST requests for list operations', async () => {
    const fetchObjectStorage = vi.fn().mockResolvedValue(
      new Response('<ListBucketResult><Key>MoRanJiangHu/saves/demo.json</Key></ListBucketResult>', {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      }),
    );
    const request = new Request('https://cdn.example.com/api/object-storage-proxy', {
      method: 'POST',
      headers: {
        'X-Object-Storage-Method': 'LIST',
        'X-Object-Storage-Endpoint': 'https://s3.us-west-004.backblazeb2.com',
        'X-Object-Storage-Bucket': 'bucket-name',
        'X-Object-Storage-Key': 'MoRanJiangHu/saves/',
        'X-Object-Storage-Access-Key': 'key-id',
        'X-Object-Storage-Secret-Key': 'key-secret',
      },
    });

    const response = await handleCdnRequest(request, env, { fetchObjectStorage });

    expect(fetchObjectStorage).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    await expect(response.text()).resolves.toContain('demo.json');
  });

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

  it('caches public apk responses at the worker edge', async () => {
    const cache = new MemoryCache();
    const fetchObject = vi.fn().mockResolvedValue(
      new Response('apk-binary', {
        status: 200,
        headers: {
          'content-type': 'application/vnd.android.package-archive',
        },
      }),
    );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/MoRanJiangHu-v1.0.570.apk');

    const first = await handleCdnRequest(request, env, { fetchObject, cache });
    const second = await handleCdnRequest(request, env, { fetchObject, cache });

    expect(fetchObject).toHaveBeenCalledTimes(1);
    expect(first.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(second.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await expect(second.text()).resolves.toBe('apk-binary');
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
  it('reuses b2 authorize results across repeated public fetches', async () => {
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
      .mockResolvedValue(
        new Response('apk', {
          status: 200,
          headers: {
            'content-type': 'application/vnd.android.package-archive',
          },
        }),
      );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/latest.apk');

    const first = await fetchPrivateObjectFromB2(env, 'public/moranjianghu/apk/latest.apk', request, { fetchImpl });
    const second = await fetchPrivateObjectFromB2(env, 'public/moranjianghu/apk/latest.apk', request, { fetchImpl });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl.mock.calls.filter((call) => String(call[0]).includes('b2_authorize_account'))).toHaveLength(1);
  });

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

    const response = await fetchPrivateObjectFromB2(env, 'public/moranjianghu/apk/latest build.apk', request, { fetchImpl });

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
      'https://f002.backblazeb2.com/file/bucket-name/public/moranjianghu/apk/latest%20build.apk',
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

  it('preserves 304 responses for conditional requests', async () => {
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
        new Response(null, {
          status: 304,
          headers: {
            etag: '"demo"',
          },
        }),
      );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/latest.apk', {
      headers: {
        'If-None-Match': '"demo"',
      },
    });

    const response = await fetchPrivateObjectFromB2(env, 'public/moranjianghu/apk/latest.apk', request, { fetchImpl });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"demo"');
  });

  it('preserves 404 responses for missing objects', async () => {
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
        new Response('missing', {
          status: 404,
          headers: {
            'content-type': 'text/plain',
          },
        }),
      );
    const request = new Request('https://cdn.example.com/public/moranjianghu/apk/missing.apk');

    const response = await fetchPrivateObjectFromB2(env, 'public/moranjianghu/apk/missing.apk', request, { fetchImpl });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('missing');
  });
});
