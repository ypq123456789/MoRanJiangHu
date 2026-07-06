import { describe, expect, it, vi } from 'vitest';

import { handleObjectStorageProxyRequest } from '../workers/b2-cdn/src/objectStorageProxy';

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

const baseHeaders = {
  'X-Object-Storage-Endpoint': 'https://s3.us-west-004.backblazeb2.com',
  'X-Object-Storage-Bucket': 'bucket-name',
  'X-Object-Storage-Access-Key': 'key-id',
  'X-Object-Storage-Secret-Key': 'key-secret',
};

function buildProxyRequest(method: string, key: string, body?: string): Request {
  return new Request('https://cdn.example.com/api/object-storage-proxy', {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'X-Object-Storage-Method': method,
      'X-Object-Storage-Key': key,
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    body,
  });
}

describe('object storage proxy cache', () => {
  it('caches manifest reads with a short ttl', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"saves":[]}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }),
    );

    const first = await handleObjectStorageProxyRequest(
      buildProxyRequest('GET', 'MoRanJiangHu/manifest.json'),
      { fetchImpl, cache },
    );
    const second = await handleObjectStorageProxyRequest(
      buildProxyRequest('GET', 'MoRanJiangHu/manifest.json'),
      { fetchImpl, cache },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.headers.get('cache-control')).toBe('public, max-age=15, stale-while-revalidate=60');
    expect(second.headers.get('cache-control')).toBe('public, max-age=15, stale-while-revalidate=60');
    await expect(second.text()).resolves.toBe('{"saves":[]}');
  });

  it('invalidates manifest cache after manifest write', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"saves":[]}', {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"saves":[{"id":"after-write"}]}', {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }),
      );

    await handleObjectStorageProxyRequest(buildProxyRequest('GET', 'MoRanJiangHu/manifest.json'), { fetchImpl, cache });
    await handleObjectStorageProxyRequest(
      buildProxyRequest('PUT', 'MoRanJiangHu/manifest.json', '{"saves":[{"id":"after-write"}]}'),
      { fetchImpl, cache },
    );
    const afterWrite = await handleObjectStorageProxyRequest(
      buildProxyRequest('GET', 'MoRanJiangHu/manifest.json'),
      { fetchImpl, cache },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await expect(afterWrite.text()).resolves.toContain('after-write');
  });
});
