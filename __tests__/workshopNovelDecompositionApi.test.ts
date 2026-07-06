import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost } from '../functions/api/workshop/novel-decomposition';

const indexKey = 'moranjianghu/workshop/novel-decomposition/index/latest.json';
const userPrefix = 'moranjianghu/cloud-play/users';

const textEncoder = new TextEncoder();

const bytesToHex = (bytes: ArrayBuffer): string => (
    Array.from(new Uint8Array(bytes)).map((item) => item.toString(16).padStart(2, '0')).join('')
);

const sha256Hex = async (value: string): Promise<string> => (
    bytesToHex(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)))
);

const hmacHex = async (secret: string, value: string): Promise<string> => {
    const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return bytesToHex(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)));
};

const createIndexBucket = (entries: any[]) => ({
    get: vi.fn(async (key: string) => {
        if (key !== indexKey) return null;
        return {
            json: async () => ({ entries }),
            text: async () => JSON.stringify({ entries }),
            body: null
        };
    }),
    put: vi.fn(),
    list: vi.fn(),
    delete: vi.fn()
});

const createWorkshopBucket = (entries: any[] = []) => {
    const values = new Map<string, string>([[indexKey, JSON.stringify({ entries })]]);
    return {
        get: vi.fn(async (key: string) => {
            const value = values.get(key);
            if (!value) return null;
            return {
                json: async () => JSON.parse(value),
                text: async () => value,
                body: null
            };
        }),
        put: vi.fn(async (key: string, value: any) => {
            values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        }),
        list: vi.fn(),
        delete: vi.fn()
    };
};

const createAuthBucket = async (username: string, password: string) => {
    const usernameKey = await sha256Hex(username.toLowerCase());
    const salt = 'test-salt';
    const passwordHash = await hmacHex(salt, `${usernameKey}\n${password}`);
    const user = {
        userId: 'test-user-id',
        username,
        usernameKey,
        passwordSalt: salt,
        passwordHash
    };
    return {
        get: vi.fn(async (key: string) => {
            if (key !== `${userPrefix}/${usernameKey}.json`) return null;
            return {
                json: async () => user,
                text: async () => JSON.stringify(user),
                body: null
            };
        }),
        put: vi.fn(),
        list: vi.fn(),
        delete: vi.fn()
    };
};

describe('workshop novel decomposition API', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('uses OpenList file metadata raw_url and proxies the ZIP through the stable download endpoint', async () => {
        const entry = {
            id: 'NDW-demo',
            title: '测试模块',
            workName: '测试作品',
            contributor: 'tester',
            note: '',
            createdAt: '2026-05-29T00:00:00.000Z',
            updatedAt: '2026-05-29T00:00:00.000Z',
            fileName: 'demo.zip',
            size: 3,
            sha256: 'abc',
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'novel',
            tags: [],
            r2Key: 'legacy/demo.zip',
            oneDrivePath: '/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip'
        };
        const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('/api/fs/get')) {
                return new Response(JSON.stringify({
                    code: 200,
                    data: {
                        name: 'NDW-demo.zip',
                        is_dir: false,
                        size: 9,
                        sign: 'sig+value/with space',
                        raw_url: 'http://159.138.7.126:5244/p/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=sig%2Bvalue%2Fwith%20space'
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('zip-bytes', {
                status: 200,
                headers: { 'Content-Type': 'application/zip', 'Content-Length': '9' }
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition?action=download&id=NDW-demo'),
            env: {
                WORKSHOP_R2: createIndexBucket([entry]),
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/',
                MORAN_OPENLIST_PUBLIC_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        });

        expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
            'http://159.138.7.126:5244/api/fs/get',
            'http://159.138.7.126:5244/d/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=sig%2Bvalue%2Fwith%20space'
        ]);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/zip');
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="demo.zip"');
        expect(await response.text()).toBe('zip-bytes');
    });

    it('does not expose a broken OneDrive stream and retries the next signed download URL', async () => {
        const entry = {
            id: 'NDW-demo',
            title: '测试模块',
            workName: '测试作品',
            contributor: 'tester',
            note: '',
            createdAt: '2026-05-29T00:00:00.000Z',
            updatedAt: '2026-05-29T00:00:00.000Z',
            fileName: 'demo.zip',
            size: 3,
            sha256: 'abc',
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'novel',
            tags: [],
            r2Key: 'legacy/demo.zip',
            oneDrivePath: '/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip'
        };
        const brokenStream = new ReadableStream({
            start(controller) {
                controller.enqueue(textEncoder.encode('partial'));
                controller.error(new Error('upstream reset'));
            }
        });
        const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            const textUrl = String(url);
            if (textUrl.includes('/api/fs/get')) {
                return new Response(JSON.stringify({
                    code: 200,
                    data: {
                        name: 'NDW-demo.zip',
                        is_dir: false,
                        size: 9,
                        sign: 'good-sign',
                        raw_url: 'http://159.138.7.126:5244/p/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=bad-sign'
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            if (textUrl.includes('bad-sign')) {
                return new Response(brokenStream, {
                    status: 200,
                    headers: { 'Content-Type': 'application/zip', 'Content-Length': '9' }
                });
            }
            return new Response('zip-bytes', {
                status: 200,
                headers: { 'Content-Type': 'application/zip', 'Content-Length': '9' }
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition?action=download&id=NDW-demo'),
            env: {
                WORKSHOP_R2: createIndexBucket([entry]),
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/'
            }
        });

        expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
            'http://159.138.7.126:5244/api/fs/get',
            'http://159.138.7.126:5244/d/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=bad-sign',
            'http://159.138.7.126:5244/d/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=good-sign'
        ]);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/zip');
        expect(response.headers.get('Content-Length')).toBe('9');
        expect(await response.text()).toBe('zip-bytes');
    });

    it('downloads OneDrive ZIPs with range requests so large packages are not held on one long upstream stream', async () => {
        const entry = {
            id: 'NDW-demo',
            title: '测试模块',
            workName: '测试作品',
            contributor: 'tester',
            note: '',
            createdAt: '2026-05-29T00:00:00.000Z',
            updatedAt: '2026-05-29T00:00:00.000Z',
            fileName: 'demo.zip',
            size: 9,
            sha256: 'abc',
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'novel',
            tags: [],
            r2Key: 'legacy/demo.zip',
            oneDrivePath: '/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip'
        };
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            if (String(url).includes('/api/fs/get')) {
                return new Response(JSON.stringify({
                    code: 200,
                    data: {
                        name: 'NDW-demo.zip',
                        is_dir: false,
                        size: 9,
                        raw_url: 'http://159.138.7.126:5244/p/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=range-sign'
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            const range = new Headers(init?.headers).get('Range');
            if (range === 'bytes=0-4194303') {
                return new Response('zip-bytes', {
                    status: 206,
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Range': 'bytes 0-8/9',
                        'Content-Length': '9'
                    }
                });
            }
            throw new Error(`unexpected download request without expected range: ${range || 'none'}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition?action=download&id=NDW-demo'),
            env: {
                WORKSHOP_R2: createIndexBucket([entry]),
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/'
            }
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/zip');
        expect(response.headers.get('Content-Length')).toBe('9');
        expect(await response.text()).toBe('zip-bytes');
    });

    it('falls back to signed public download URLs when OpenList raw_url is unavailable', async () => {
        const entry = {
            id: 'NDW-demo',
            title: '测试模块',
            workName: '测试作品',
            contributor: 'tester',
            note: '',
            createdAt: '2026-05-29T00:00:00.000Z',
            updatedAt: '2026-05-29T00:00:00.000Z',
            fileName: 'demo.zip',
            size: 3,
            sha256: 'abc',
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'novel',
            tags: [],
            r2Key: 'legacy/demo.zip',
            oneDrivePath: '/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip'
        };
        const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('/api/fs/get')) {
                return new Response(JSON.stringify({ code: 500, message: 'metadata unavailable' }), { status: 200 });
            }
            if (String(url).startsWith('http://159.138.7.126:5244/')) {
                throw new Error('direct origin unavailable from worker');
            }
            if (String(url).includes('/d/Onedrive/')) {
                return new Response('zip-bytes', {
                    status: 200,
                    headers: { 'Content-Type': 'application/zip' }
                });
            }
            return new Response(JSON.stringify({
                code: 200,
                data: {
                    content: [
                        { name: 'NDW-demo.zip', is_dir: false, sign: 'public-sign' }
                    ]
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition?action=download&id=NDW-demo'),
            env: {
                WORKSHOP_R2: createIndexBucket([entry]),
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        });

        expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
            'http://159.138.7.126:5244/api/fs/get',
            'https://openlist.bacon.de5.net/api/fs/get',
            'http://159.138.7.126:5244/api/fs/list',
            'https://openlist.bacon.de5.net/api/fs/list',
            'https://openlist.bacon.de5.net/d/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-05-29/NDW-demo/NDW-demo.zip?sign=public-sign'
        ]);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/zip');
        expect(await response.text()).toBe('zip-bytes');
    });

    it('uploads workshop ZIPs to the direct OpenList origin even when the public base is proxied by Cloudflare', async () => {
        const workshopBucket = createWorkshopBucket();
        const authBucket = await createAuthBucket('tester', 'secret123');
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 200 }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestPost({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: '发布验证模块',
                    workName: '发布验证作品',
                    fileName: 'publish-demo.zip',
                    zipBase64: btoa('zip'),
                    chapterCount: 1,
                    segmentCount: 1,
                    sourceType: 'txt',
                    auth: { username: 'tester', password: 'secret123' }
                })
            }),
            env: {
                WORKSHOP_R2: workshopBucket,
                CLOUD_PLAY_R2: authBucket,
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        });
        const payload: any = await response.json();
        const putKeys = workshopBucket.put.mock.calls.map((call) => String(call[0]));

        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe('http://159.138.7.126:5244/api/fs/put');
        expect(payload.entry.oneDrivePath).toMatch(/^\/Onedrive\/MoRanJiangHu\/workshop\/novel-decomposition\/packages\//);
        expect(putKeys).toContain(indexKey);
        expect(putKeys.some((key) => key.includes('/packages/'))).toBe(false);
    });

    it('retries workshop ZIP uploads through the public OpenList base when the direct origin rejects Worker PUTs', async () => {
        const workshopBucket = createWorkshopBucket();
        const authBucket = await createAuthBucket('tester', 'secret123');
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const textUrl = String(url);
            const filePath = new Headers(init?.headers).get('File-Path') || '';
            if (textUrl.startsWith('http://159.138.7.126:5244/') && filePath.endsWith('.zip')) {
                return new Response(JSON.stringify({ code: 403, message: 'HTTP 403' }), { status: 403 });
            }
            if (textUrl === 'https://openlist.bacon.de5.net/api/fs/put' && filePath.endsWith('.zip')) {
                return new Response(JSON.stringify({ code: 200 }), { status: 200 });
            }
            throw new Error(`unexpected OpenList upload request: ${textUrl} ${filePath}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        const largeZip = new Uint8Array(5 * 1024 * 1024 + 123);
        largeZip[0] = 0x50;
        largeZip[1] = 0x4b;

        const formData = new FormData();
        formData.append('metadata', JSON.stringify({
            title: 'Worker 公开入口重试模块',
            workName: 'Worker 公开入口重试作品',
            fileName: 'worker-public-retry.zip',
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'txt',
            auth: { username: 'tester', password: 'secret123' }
        }));
        formData.append('zip', new Blob([largeZip], { type: 'application/zip' }), 'worker-public-retry.zip');

        const response = await onRequestPost({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition', {
                method: 'POST',
                body: formData
            }),
            env: {
                WORKSHOP_R2: workshopBucket,
                CLOUD_PLAY_R2: authBucket,
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/',
                MORAN_OPENLIST_PUBLIC_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        });
        const payload: any = await response.json();
        const putKeys = workshopBucket.put.mock.calls.map((call) => String(call[0]));

        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.entry.oneDrivePath).toMatch(/^\/Onedrive\/MoRanJiangHu\/workshop\/novel-decomposition\/packages\//);
        expect(payload.entry.oneDriveParts).toBeUndefined();
        expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
            'http://159.138.7.126:5244/api/fs/put',
            'https://openlist.bacon.de5.net/api/fs/put'
        ]);
        expect(putKeys).toContain(indexKey);
        expect(putKeys.some((key) => key.includes('/packages/'))).toBe(false);
    });

    it('falls back to uploading large workshop ZIPs as OneDrive parts when the whole ZIP is rejected', async () => {
        const workshopBucket = createWorkshopBucket();
        const authBucket = await createAuthBucket('tester', 'secret123');
        const uploadedPartSizes: number[] = [];
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const filePath = new Headers(init?.headers).get('File-Path') || '';
            if (filePath.endsWith('.zip')) {
                return new Response(JSON.stringify({ code: 403, message: 'HTTP 403' }), { status: 403 });
            }
            if (filePath.includes('/parts/')) {
                const body = init?.body as any;
                uploadedPartSizes.push(Number(body?.byteLength || body?.size || 0));
                return new Response(JSON.stringify({ code: 200 }), { status: 200 });
            }
            throw new Error(`unexpected OpenList upload path: ${filePath}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        const largeZip = new Uint8Array(5 * 1024 * 1024 + 123);
        largeZip[0] = 0x50;
        largeZip[1] = 0x4b;

        const formData = new FormData();
        formData.append('metadata', JSON.stringify({
            title: '大包分片模块',
            workName: '剑来',
            fileName: 'large-demo.zip',
            chapterCount: 1231,
            segmentCount: 247,
            sourceType: 'txt',
            auth: { username: 'tester', password: 'secret123' }
        }));
        formData.append('zip', new Blob([largeZip], { type: 'application/zip' }), 'large-demo.zip');

        const response = await onRequestPost({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition', {
                method: 'POST',
                body: formData
            }),
            env: {
                WORKSHOP_R2: workshopBucket,
                CLOUD_PLAY_R2: authBucket,
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/'
            }
        });
        const payload: any = await response.json();
        const putKeys = workshopBucket.put.mock.calls.map((call) => String(call[0]));

        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.entry.oneDrivePath).toBeUndefined();
        expect(payload.entry.oneDriveParts.length).toBeGreaterThan(1);
        expect(uploadedPartSizes.reduce((sum, size) => sum + size, 0)).toBe(largeZip.byteLength);
        expect(uploadedPartSizes.every((size) => size > 0 && size <= 2 * 1024 * 1024)).toBe(true);
        expect(putKeys).toContain(indexKey);
        expect(putKeys.some((key) => key.includes('/packages/'))).toBe(false);
    });

    it('downloads and merges OneDrive part uploads when the full ZIP was too large to upload', async () => {
        const entry = {
            id: 'NDW-demo',
            title: '测试模块',
            workName: '剑来',
            contributor: 'tester',
            note: '',
            createdAt: '2026-07-05T00:00:00.000Z',
            updatedAt: '2026-07-05T00:00:00.000Z',
            fileName: 'demo.zip',
            size: 10,
            sha256: await bytesToHex(await crypto.subtle.digest('SHA-256', textEncoder.encode('zip-part-1'))),
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'novel',
            tags: [],
            r2Key: 'legacy/demo.zip',
            oneDriveParts: [
                {
                    index: 0,
                    path: '/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-07-05/NDW-demo/parts/part-0001.bin',
                    size: 4
                },
                {
                    index: 1,
                    path: '/Onedrive/MoRanJiangHu/workshop/novel-decomposition/packages/2026-07-05/NDW-demo/parts/part-0002.bin',
                    size: 6
                }
            ]
        };
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const textUrl = String(url);
            if (textUrl.includes('/api/fs/get')) {
                const rawBody = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
                const path = String(rawBody?.path || '');
                return new Response(JSON.stringify({
                    code: 200,
                    data: {
                        name: path.split('/').pop(),
                        is_dir: false,
                        size: path.includes('0001') ? 4 : 6,
                        raw_url: `http://159.138.7.126:5244/p${path}?sign=part-sign`
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            if (textUrl.includes('part-0001')) {
                return new Response('zip-', { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '4' } });
            }
            if (textUrl.includes('part-0002')) {
                return new Response('part-1', { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '6' } });
            }
            throw new Error(`unexpected download URL: ${textUrl}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition?action=download&id=NDW-demo'),
            env: {
                WORKSHOP_R2: createIndexBucket([entry]),
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/'
            }
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/zip');
        expect(response.headers.get('Content-Length')).toBe('10');
        expect(await response.text()).toBe('zip-part-1');
    });

    it('rejects large workshop ZIPs when OpenList upload is not accepted instead of saving broken D1 payloads', async () => {
        const workshopBucket = createWorkshopBucket();
        const authBucket = await createAuthBucket('tester', 'secret123');
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 500, message: 'upload failed' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const largeZip = new Uint8Array(5 * 1024 * 1024);
        largeZip[0] = 0x50;
        largeZip[1] = 0x4b;

        const formData = new FormData();
        formData.append('metadata', JSON.stringify({
            title: '大包验证模块',
            workName: '大包验证作品',
            fileName: 'large-demo.zip',
            chapterCount: 1,
            segmentCount: 1,
            sourceType: 'txt',
            auth: { username: 'tester', password: 'secret123' }
        }));
        formData.append('zip', new Blob([largeZip], { type: 'application/zip' }), 'large-demo.zip');

        const response = await onRequestPost({
            request: new Request('https://msjh.bacon159.pp.ua/api/workshop/novel-decomposition', {
                method: 'POST',
                body: formData
            }),
            env: {
                WORKSHOP_R2: workshopBucket,
                CLOUD_PLAY_R2: authBucket,
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token'
            }
        });
        const payload: any = await response.json();
        const putKeys = workshopBucket.put.mock.calls.map((call) => String(call[0]));

        expect(response.status).toBe(500);
        expect(payload.error).toContain('OneDrive');
        expect(payload.error).toContain('upload failed');
        expect(putKeys.some((key) => key.includes('/packages/'))).toBe(false);
        expect(putKeys).not.toContain(indexKey);
    });
});
