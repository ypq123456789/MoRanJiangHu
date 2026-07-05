import { describe, expect, it } from 'vitest';

import { onRequestGet } from '../functions/api/apk/version/[file]';
import { onRequestGet as onLatestApkRequestGet } from '../functions/api/apk/latest.apk';

describe('APK B2 provider', () => {
    it('redirects the current versioned APK to the public CDN worker URL', async () => {
        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.523.apk?provider=b2'),
            params: { file: 'MoRanJiangHu-v1.0.523.apk' },
            env: {
                MORAN_B2_CDN_BASE_URL: 'https://cdn.bacon159.pp.ua/',
                MORAN_B2_DISTRIBUTION_BASE_URL: 'https://f004.backblazeb2.com/file/bacon111',
                MORAN_B2_DISTRIBUTION_RELEASE_PREFIX: 'moranjianghu',
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionCode: 523,
                            versionName: '1.0.523',
                            preferredApkProvider: 'b2',
                            b2ApkUrl: 'https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.523.apk?provider=b2',
                            apkUrls: [
                                'https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.523.apk?provider=b2'
                            ]
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://cdn.bacon159.pp.ua/public/moranjianghu/apk/MoRanJiangHu-v1.0.523.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('b2-cdn');
    });

    it('uses GitHub Release for latest.apk when the manifest prefers GitHub', async () => {
        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionCode: 529,
                            versionName: '1.0.529',
                            preferredApkProvider: 'github'
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.529/MoRanJiangHu-v1.0.529.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('github-release');
    });

    it('uses OneDrive for latest.apk when the manifest prefers OneDrive', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            expect(String(input)).toBe('https://openlist.bacon.de5.net/api/fs/list');
            return new Response(JSON.stringify({
                code: 200,
                data: {
                    content: [
                        { name: 'latest.apk', is_dir: false, sign: 'signed-token' }
                    ]
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }) as typeof fetch;

        try {
            const response = await onLatestApkRequestGet({
                request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
                env: {
                    MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                    MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net',
                    RELEASE_MANIFEST: {
                        get: async () => ({
                            latest: {
                                versionCode: 559,
                                versionName: '1.0.559',
                                preferredApkProvider: 'onedrive'
                            }
                        })
                    }
                }
            } as any);

            expect(response.status).toBe(302);
            expect(response.headers.get('Location')).toBe('https://openlist.bacon.de5.net/d/Onedrive/MoRanJiangHu/releases/latest.apk?sign=signed-token');
            expect(response.headers.get('X-Moran-Apk-Source')).toBe('onedrive-proxy');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('uses GitHub Release for the versioned APK when the manifest prefers GitHub', async () => {
        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.529.apk'),
            params: { file: 'MoRanJiangHu-v1.0.529.apk' },
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionCode: 529,
                            versionName: '1.0.529',
                            preferredApkProvider: 'github'
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.529/MoRanJiangHu-v1.0.529.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('github-release');
    });
});
