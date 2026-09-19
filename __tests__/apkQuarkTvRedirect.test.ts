import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildQuarkTvApkRedirect } from '../functions/api/apk/_shared';
import { onRequestGet as onLatestApkRequestGet } from '../functions/api/apk/latest.apk';
import { onRequestGet as onVersionedApkRequestGet } from '../functions/api/apk/version/[file]';

describe('Quark TV APK redirect', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('redirects a signed latest APK through the Quark TV mount', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [{ name: 'latest.apk', is_dir: false, sign: 'quark sign' }] }
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await buildQuarkTvApkRedirect(
            { MORAN_OPENLIST_AUTH_TOKEN: 'token', MORAN_OPENLIST_BASE_URL: 'https://openlist.example' },
            'latest.apk',
            'MoRanJiangHu-v1.0.627.apk'
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://openlist.example/api/fs/list',
            expect.objectContaining({
                body: JSON.stringify({
                    path: '/夸克TV/MoRanJiangHu/releases',
                    password: '',
                    page: 1,
                    per_page: 100,
                    refresh: false
                })
            })
        );
        expect(response?.status).toBe(302);
        expect(response?.headers.get('Location')).toBe(
            'https://openlist.example/d/%E5%A4%B8%E5%85%8BTV/MoRanJiangHu/releases/latest.apk?sign=quark%20sign'
        );
        expect(response?.headers.get('X-Moran-Apk-Source')).toBe('quark-tv');
    });

    it('redirects a signed versioned APK through the Quark TV mount', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: {
                content: [{
                    name: 'MoRanJiangHu-v1.0.627.apk',
                    is_dir: false,
                    sign: 'version-sign'
                }]
            }
        }), { status: 200 })));

        const response = await buildQuarkTvApkRedirect(
            { MORAN_OPENLIST_AUTH_TOKEN: 'token' },
            'MoRanJiangHu-v1.0.627.apk',
            'MoRanJiangHu-v1.0.627.apk'
        );

        expect(response?.headers.get('Location')).toContain(
            '/d/%E5%A4%B8%E5%85%8BTV/MoRanJiangHu/releases/MoRanJiangHu-v1.0.627.apk?sign=version-sign'
        );
    });

    it('returns null when the Quark TV file has no sign', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [] }
        }), { status: 200 })));

        await expect(buildQuarkTvApkRedirect(
            { MORAN_OPENLIST_AUTH_TOKEN: 'token' },
            'latest.apk',
            'MoRanJiangHu-v1.0.627.apk'
        )).resolves.toBeNull();
    });

    it('falls back to the public OpenList API when the configured API base fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('unavailable', { status: 502 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                code: 200,
                data: { content: [{ name: 'latest.apk', is_dir: false, sign: 'fallback-sign' }] }
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await buildQuarkTvApkRedirect(
            {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                MORAN_OPENLIST_API_BASE_URL: 'https://api.openlist.example',
                MORAN_OPENLIST_PUBLIC_BASE_URL: 'https://openlist.bacon.de5.net'
            },
            'latest.apk',
            'MoRanJiangHu-v1.0.627.apk'
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(response?.headers.get('Location')).toContain('?sign=fallback-sign');
    });

    it('uses Quark TV by default for latest APK requests', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [{ name: 'latest.apk', is_dir: false, sign: 'latest-sign' }] }
        }), { status: 200 })));

        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                RELEASE_MANIFEST: {
                    get: async () => ({ latest: { versionName: '1.0.627', versionCode: 627 } })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('quark-tv');
    });

    it('falls back to VPS when Quark TV is unavailable', async () => {
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const path = JSON.parse(String(init?.body || '{}')).path;
            const content = path === '/Onedrive/MoRanJiangHu/releases'
                ? [{ name: 'latest.apk', is_dir: false, sign: 'onedrive-sign' }]
                : [];
            return new Response(JSON.stringify({ code: 200, data: { content } }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionName: '1.0.627',
                            versionCode: 627,
                            preferredApkProvider: 'quark-tv'
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('vps');
        expect(response.headers.get('location')).toBe('https://moranjianghu.bacon159.pp.ua/latest.apk');
        // 候选链：quark-tv（1 次 OpenList 探测，取不到 sign）→ vps（不发请求，直接 302）。
        // fullstack 已于 2026-09-19 下线，不再占用一次探测。
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps VPS as the final direct fallback when API-backed providers are unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [] }
        }), { status: 200 })));

        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                RELEASE_MANIFEST: { get: async () => ({ latest: {} }) }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('vps');
        expect(response.headers.get('location')).toBe('https://moranjianghu.bacon159.pp.ua/latest.apk');
    });

    it('uses Quark TV for a versioned APK request', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: {
                content: [{
                    name: 'MoRanJiangHu-v1.0.627.apk',
                    is_dir: false,
                    sign: 'versioned-sign'
                }]
            }
        }), { status: 200 })));

        const response = await onVersionedApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.627.apk'),
            params: { file: 'MoRanJiangHu-v1.0.627.apk' },
            env: {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                RELEASE_MANIFEST: {
                    get: async () => ({ latest: { versionName: '1.0.627', versionCode: 627 } })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('quark-tv');
        expect(response.headers.get('Location')).toContain('MoRanJiangHu-v1.0.627.apk?sign=versioned-sign');
    });
});
