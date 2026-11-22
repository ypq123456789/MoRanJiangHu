import { describe, expect, it } from 'vitest';

import { onRequestGet } from '../functions/api/apk/latest.json';

const buildRequest = () => new Request('https://msjh.bacon159.pp.ua/api/apk/latest.json');

const buildEnv = (payload: unknown) => ({
    RELEASE_MANIFEST: {
        get: async (key: string, type: string) => {
            expect(key).toBe('release-manifest/latest.json');
            expect(type).toBe('json');
            return payload;
        }
    }
});

describe('APK latest manifest proxy', () => {
    it('normalizes a flat KV manifest and puts OneDrive first without unavailable providers', async () => {
        const response = await onRequestGet({
            request: buildRequest(),
            env: buildEnv({
                versionName: '1.0.528',
                versionCode: 528,
                releaseNotes: ['修复 APK 下载渠道']
            })
        } as any);

        expect(response.status).toBe(200);
        const payload = await response.json();

        expect(payload.versionName).toBe('1.0.528');
        expect(payload.latest.versionName).toBe('1.0.528');
        expect(payload.latest.versionCode).toBe(528);
        expect(payload.latest.b2ApkUrl).toBe('');
        expect(payload.latest.fullstackApkUrl).toBe('');
        expect(payload.latest.quarkTvApkUrl).toBe('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=quark-tv');
        expect(payload.latest.githubApkUrl).toBe('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.528.apk?provider=github');
        expect(payload.latest.githubAcceleratedApkUrls).toEqual([
            'https://ghproxy.net/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.528/MoRanJiangHu-v1.0.528.apk',
            'https://gh.ddlc.top/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.528/MoRanJiangHu-v1.0.528.apk',
            'https://ghfast.top/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.528/MoRanJiangHu-v1.0.528.apk'
        ]);
        expect(payload.latest.oneDriveApkUrl).toBe('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive');
        expect(payload.latest.oneDriveDirectApkUrl).toBe('https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive-direct');
        expect(payload.latest.preferredApkProvider).toBe('onedrive');
        expect(payload.latest.githubRawApkUrl).toBe('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.528.apk?provider=github-raw');
        expect(payload.latest.githubRawDirectApkUrl).toBe('https://raw.githubusercontent.com/ypq123456789/MoRanJiangHu/apk-dist/releases/MoRanJiangHu-v1.0.528.apk');
        expect(payload.latest.githubRawAcceleratedApkUrl).toBe('https://cloudflare-proxy-6rw.pages.dev/https://raw.githubusercontent.com/ypq123456789/MoRanJiangHu/apk-dist/releases/MoRanJiangHu-v1.0.528.apk');
        expect(payload.latest.r2ApkUrl).toBe('');
        expect(payload.latest.hi168ApkUrl).toBe('');
        expect(payload.latest.apkUrls).not.toContain('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.528.apk?provider=b2');
        expect(payload.latest.apkUrls[0]).toBe(payload.latest.oneDriveApkUrl);
        expect(payload.latest.apkUrls.some((url: string) => url.includes('115open'))).toBe(false);
        expect(payload.latest.apkUrls.indexOf(payload.latest.oneDriveApkUrl)).toBeLessThan(
            payload.latest.apkUrls.indexOf(payload.latest.oneDriveDirectApkUrl)
        );
        expect(payload.latest.apkUrls.indexOf(payload.latest.oneDriveDirectApkUrl)).toBeLessThan(
            payload.latest.apkUrls.indexOf(payload.latest.quarkTvApkUrl)
        );
        expect(payload.latest.apkUrls.indexOf(payload.latest.quarkTvApkUrl)).toBeLessThan(
            payload.latest.apkUrls.indexOf(payload.latest.githubRawAcceleratedApkUrl)
        );
        expect(payload.latest.apkUrls).toContain(payload.latest.githubApkUrl);
        expect(payload.latest.apkUrls).toContain(payload.latest.githubAcceleratedApkUrls[0]);
        expect(payload.latest.apkUrls).toContain(payload.latest.oneDriveDirectApkUrl);
    });

    it('keeps nested latest manifest values and uses latest.versionName first', async () => {
        const response = await onRequestGet({
            request: buildRequest(),
            env: buildEnv({
                versionName: '1.0.527',
                versionCode: 527,
                latest: {
                    versionName: '1.0.528',
                    versionCode: 528,
                    releaseChannel: 'stable'
                },
                history: []
            })
        } as any);

        expect(response.status).toBe(200);
        const payload = await response.json();

        expect(payload.latest.versionName).toBe('1.0.528');
        expect(payload.latest.versionCode).toBe(528);
        expect(payload.latest.releaseChannel).toBe('stable');
        expect(payload.latest.apkUrls).toContain('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.528.apk?provider=github');
        expect(payload.latest.apkUrls).toContain('https://gh.ddlc.top/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.528/MoRanJiangHu-v1.0.528.apk');
    });

    it('orders GitHub accelerators before OneDrive when preferredApkProvider is github', async () => {
        const response = await onRequestGet({
            request: buildRequest(),
            env: buildEnv({
                versionName: '1.0.596',
                versionCode: 596,
                preferredApkProvider: 'github',
                releaseNotes: ['修复 APK 下载渠道：B2 额度耗尽，改用 GitHub Release']
            })
        } as any);

        expect(response.status).toBe(200);
        const payload = await response.json();

        expect(payload.latest.preferredApkProvider).toBe('github');
        expect(payload.latest.apkUrls[0]).toBe(payload.latest.githubAcceleratedApkUrls[0]);
        // GitHub 加速镜像必须排在 OneDrive 之前，客户端第一个可下载源不能是已废 B2。
        expect(payload.latest.apkUrls.indexOf(payload.latest.githubAcceleratedApkUrls[0])).toBeLessThan(
            payload.latest.apkUrls.indexOf(payload.latest.githubRawAcceleratedApkUrl)
        );
        expect(payload.latest.apkUrls.indexOf(payload.latest.githubRawAcceleratedApkUrl)).toBeLessThan(
            payload.latest.apkUrls.indexOf(payload.latest.oneDriveApkUrl)
        );
        expect(payload.latest.b2ApkUrl).toBe('');
        expect(payload.latest.apkUrls.some((url: string) => url.includes('provider=b2'))).toBe(false);
    });

    it('orders GitHub Raw proxy first when preferredApkProvider is github-raw', async () => {
        const response = await onRequestGet({
            request: buildRequest(),
            env: buildEnv({
                versionName: '1.0.604',
                versionCode: 604,
                preferredApkProvider: 'github-raw',
                releaseNotes: ['改用 Raw 代理 APK 下载渠道']
            })
        } as any);

        expect(response.status).toBe(200);
        const payload = await response.json();

        expect(payload.latest.preferredApkProvider).toBe('github-raw');
        expect(payload.latest.apkUrls[0]).toBe(payload.latest.githubRawAcceleratedApkUrl);
        expect(payload.latest.apkUrls.indexOf(payload.latest.githubRawAcceleratedApkUrl)).toBeLessThan(
            payload.latest.apkUrls.indexOf(payload.latest.githubAcceleratedApkUrls[0])
        );
        expect(payload.latest.apkUrls.some((url: string) => url.includes('provider=b2'))).toBe(false);
    });

    it('falls back to default ordering when preferredApkProvider is an unsupported channel like vps', async () => {
        const response = await onRequestGet({
            request: buildRequest(),
            env: buildEnv({
                versionName: '1.0.629',
                versionCode: 629,
                preferredApkProvider: 'vps'
            })
        } as any);

        expect(response.status).toBe(200);
        const payload = await response.json();

        // VPS 通道已移除：不再输出死链，也不作为首选下载源。
        expect(payload.latest.vpsApkUrl).toBeUndefined();
        expect(payload.latest.apkUrls).not.toContain('https://moranjianghu.bacon159.pp.ua/latest.apk');
        // 未知/不支持的 provider 回退到默认排序（github-raw 加速组优先）。
        expect(payload.latest.apkUrls[0]).toBe(payload.latest.githubRawAcceleratedApkUrl);
    });
});
