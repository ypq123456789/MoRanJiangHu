import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildFullstackApkRedirect } from '../functions/api/apk/_shared';
import { onRequestGet as onLatestApkRequestGet } from '../functions/api/apk/latest.apk';

describe('Fullstack cloud APK redirect (provider 已下线)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('redirects the latest APK through the signed Fullstack cloud mount', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [{ name: 'latest.apk', is_dir: false, sign: 'fullstack sign' }] }
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await buildFullstackApkRedirect(
            { MORAN_OPENLIST_AUTH_TOKEN: 'token', MORAN_OPENLIST_BASE_URL: 'https://openlist.example' },
            'latest.apk',
            'MoRanJiangHu-v1.0.633.apk'
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://openlist.example/api/fs/list',
            expect.objectContaining({
                body: JSON.stringify({
                    path: '/全栈云盘/MoRanJiangHu/releases',
                    password: '',
                    page: 1,
                    per_page: 100,
                    refresh: false
                })
            })
        );
        expect(response?.status).toBe(302);
        expect(response?.headers.get('Location')).toBe(
            'https://openlist.example/d/%E5%85%A8%E6%A0%88%E4%BA%91%E7%9B%98/MoRanJiangHu/releases/latest.apk?sign=fullstack%20sign'
        );
        expect(response?.headers.get('X-Moran-Apk-Source')).toBe('fullstack');
    });

    it('keeps the legacy builder for reference but no longer routes it', async () => {
        // buildFullstackApkRedirect 仍保留（与 b2 的处理方式一致，便于将来复用），
        // 但它已不在 _providerRouter 的候选链里，任何显式请求都必须拿到 410。
        expect(typeof buildFullstackApkRedirect).toBe('function');

        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [{ name: 'latest.apk', is_dir: false, sign: 'latest-sign' }] }
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=fullstack'),
            env: {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                RELEASE_MANIFEST: {
                    get: async () => ({ latest: { versionName: '1.0.633', versionCode: 633 } })
                }
            }
        } as any);

        expect(response.status).toBe(410);
        expect(await response.text()).toContain('decommissioned');
        // 已下线，连 OpenList 都不该再去问
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never falls back to the Fullstack provider when no provider is requested', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { content: [] }
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await onLatestApkRequestGet({
            request: new Request('https://msjh.bacon159.pp.ua/api/apk/latest.apk'),
            env: {
                MORAN_OPENLIST_AUTH_TOKEN: 'token',
                RELEASE_MANIFEST: {
                    get: async () => ({ latest: { versionName: '1.0.633', versionCode: 633 } })
                }
            }
        } as any);

        // 无论落到哪个 provider，都不允许出现 fullstack 的来源标记
        expect(response.headers.get('X-Moran-Apk-Source')).not.toBe('fullstack');
    });
});
