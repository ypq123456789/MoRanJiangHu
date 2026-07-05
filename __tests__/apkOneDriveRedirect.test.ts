import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequestGet } from '../functions/api/apk/latest.apk';

describe('APK OneDrive redirect', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('uses the stable OpenList download endpoint for OneDrive APK fallback', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            expect(String(url)).toBe('https://openlist.bacon.de5.net/api/fs/list');
            return new Response(JSON.stringify({
                code: 200,
                data: {
                    content: [
                        { name: 'latest.apk', is_dir: false, sign: 'apk+sign/with space' }
                    ]
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }));

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive'),
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionName: '1.0.560',
                            versionCode: 560,
                            preferredApkProvider: 'onedrive'
                        }
                    })
                },
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe(
            'https://openlist.bacon.de5.net/d/Onedrive/MoRanJiangHu/releases/latest.apk?sign=apk%2Bsign%2Fwith%20space'
        );
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('onedrive-proxy');
    });

    it('can bypass Cloudflare and redirect OneDrive APK downloads to the OpenList origin', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            expect(String(url)).toBe('http://159.138.7.126:5244/api/fs/list');
            return new Response(JSON.stringify({
                code: 200,
                data: {
                    content: [
                        { name: 'latest.apk', is_dir: false, sign: 'direct+sign/with space' }
                    ]
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }));

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive-direct'),
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionName: '1.0.560',
                            versionCode: 560,
                            preferredApkProvider: 'onedrive'
                        }
                    })
                },
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/',
                MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe(
            'http://159.138.7.126:5244/d/Onedrive/MoRanJiangHu/releases/latest.apk?sign=direct%2Bsign%2Fwith%20space'
        );
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('onedrive-direct-proxy');
    });

    it('falls back to the public OpenList API for signing when the origin API is unreachable', async () => {
        const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            const value = String(url);
            if (value === 'http://159.138.7.126:5244/api/fs/list') {
                return new Response('origin unavailable', { status: 502 });
            }
            expect(value).toBe('https://openlist.bacon.de5.net/api/fs/list');
            return new Response(JSON.stringify({
                code: 200,
                data: {
                    content: [
                        { name: 'latest.apk', is_dir: false, sign: 'fallback-sign' }
                    ]
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive-direct'),
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionName: '1.0.560',
                            versionCode: 560,
                            preferredApkProvider: 'onedrive'
                        }
                    })
                },
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_API_BASE_URL: 'http://159.138.7.126:5244/',
                MORAN_OPENLIST_PUBLIC_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        } as any);

        expect(response.status).toBe(302);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(response.headers.get('Location')).toBe(
            'http://159.138.7.126:5244/d/Onedrive/MoRanJiangHu/releases/latest.apk?sign=fallback-sign'
        );
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('onedrive-direct-proxy');
    });

    it('uses B2 as the default APK provider when the manifest has no preferred provider', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                MORAN_B2_DISTRIBUTION_BASE_URL: 'https://f004.backblazeb2.com/file/bacon111',
                MORAN_B2_DISTRIBUTION_RELEASE_PREFIX: 'moranjianghu',
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionName: '1.0.560',
                            versionCode: 560
                        }
                    })
                },
                MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net/'
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://cdn.bacon159.pp.ua/public/moranjianghu/apk/MoRanJiangHu-v1.0.560.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('b2-cdn');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
