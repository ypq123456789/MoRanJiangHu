import { describe, expect, it } from 'vitest';

import { onRequestGet } from '../functions/api/apk/version/[file]';
import { onRequestGet as onLatestApkRequestGet } from '../functions/api/apk/latest.apk';

describe('APK B2 provider', () => {
    it('uses Quark for latest.apk when the manifest does not declare a provider', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({
            code: 200,
            data: {
                content: [
                    { name: 'latest.apk', is_dir: false, sign: 'default-provider-token' }
                ]
            }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })) as typeof fetch;

        try {
            const response = await onLatestApkRequestGet({
                request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
                env: {
                    MORAN_OPENLIST_AUTH_TOKEN: 'test-token',
                    MORAN_OPENLIST_BASE_URL: 'https://openlist.bacon.de5.net',
                    RELEASE_MANIFEST: {
                        get: async () => ({
                            latest: {
                                versionCode: 628,
                                versionName: '1.0.628'
                            }
                        })
                    }
                }
            } as any);

            expect(response.status).toBe(302);
            expect(response.headers.get('Location')).toBe('https://openlist.bacon.de5.net/d/%E5%A4%B8%E5%85%8B/MoRanJiangHu/releases/latest.apk?sign=default-provider-token');
            expect(response.headers.get('X-Moran-Apk-Source')).toBe('quark-tv');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('rejects explicit B2 provider requests because B2 is decommissioned', async () => {
        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.523.apk?provider=b2'),
            params: { file: 'MoRanJiangHu-v1.0.523.apk' },
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionCode: 523,
                            versionName: '1.0.523',
                            preferredApkProvider: 'github',
                            apkUrls: []
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(410);
        expect(await response.text()).toContain('B2 APK provider is decommissioned');
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
        expect(response.headers.get('Location')).toBe('https://gh.ddlc.top/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.529/MoRanJiangHu-v1.0.529.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('github-release-accelerated');
    });

    it('uses GitHub Raw proxy for latest.apk when the manifest prefers GitHub Raw', async () => {
        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionCode: 604,
                            versionName: '1.0.604',
                            preferredApkProvider: 'github-raw'
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://cloudflare-proxy-6rw.pages.dev/https://raw.githubusercontent.com/ypq123456789/MoRanJiangHu/apk-dist/releases/MoRanJiangHu-v1.0.604.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('github-raw-accelerated');
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
        expect(response.headers.get('Location')).toBe('https://gh.ddlc.top/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.529/MoRanJiangHu-v1.0.529.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('github-release-accelerated');
    });

    it('uses GitHub Raw proxy for the versioned APK when requested explicitly', async () => {
        const response = await onRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.604.apk?provider=github-raw'),
            params: { file: 'MoRanJiangHu-v1.0.604.apk' },
            env: {
                RELEASE_MANIFEST: {
                    get: async () => ({
                        latest: {
                            versionCode: 604,
                            versionName: '1.0.604',
                            preferredApkProvider: 'github'
                        }
                    })
                }
            }
        } as any);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://cloudflare-proxy-6rw.pages.dev/https://raw.githubusercontent.com/ypq123456789/MoRanJiangHu/apk-dist/releases/MoRanJiangHu-v1.0.604.apk');
        expect(response.headers.get('X-Moran-Apk-Source')).toBe('github-raw-accelerated');
    });
});
