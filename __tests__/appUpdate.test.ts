import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const downloadAndInstallMock = vi.fn();
const addListenerMock = vi.fn(async () => ({ remove: vi.fn() }));
const getInstalledApkInfoMock = vi.fn(async () => ({ sha256: 'old-sha', fileSize: 1 }));

vi.mock('../data/releaseInfo', () => ({
    RELEASE_INFO: {
        versionCode: 290,
        versionName: '1.0.289',
        updateManifestUrl: 'https://msjh.bacon159.pp.ua/api/apk/latest.json',
        apkDownloadUrl: 'https://msjh.bacon159.pp.ua/api/apk/latest.apk',
        releaseNotes: []
    }
}));

const nativeRuntimeMock = vi.hoisted(() => ({
    native: true,
    appPluginAvailable: true
}));

vi.mock('../utils/nativeRuntime', () => ({
    isNativeCapacitorEnvironment: () => nativeRuntimeMock.native,
    isCapacitorPluginAvailable: (name: string) => name === 'App' ? nativeRuntimeMock.appPluginAvailable : false
}));

vi.mock('@capacitor/app', () => ({
    App: {
        getInfo: vi.fn(async () => ({ build: '289', version: '1.0.288' }))
    }
}));

vi.mock('../services/nativeApkUpdater', () => ({
    NativeApkUpdater: {
        addListener: addListenerMock,
        downloadAndInstall: downloadAndInstallMock,
        getInstalledApkInfo: getInstalledApkInfoMock
    }
}));

const createLocalStorageMock = () => {
    const store = new Map<string, string>();
    return {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
            store.delete(key);
        }),
        clear: vi.fn(() => {
            store.clear();
        })
    };
};

describe('appUpdate native APK download', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        nativeRuntimeMock.native = true;
        nativeRuntimeMock.appPluginAvailable = true;
        vi.stubGlobal('localStorage', createLocalStorageMock());
        vi.stubGlobal('window', {
            location: { href: 'capacitor://localhost' },
            confirm: vi.fn(() => true),
            alert: vi.fn(),
            setTimeout: vi.fn((callback: () => void) => {
                callback();
                return 1;
            })
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('falls back to latest.apk when the versioned APK candidate fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            latest: {
                versionCode: 290,
                versionName: '1.0.289',
                apkSha256: 'new-sha',
                apkSize: 123456,
                directApkUrl: 'https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.289.apk',
                latestApkUrl: 'https://msjh.bacon159.pp.ua/api/apk/latest.apk',
                changes: ['测试更新']
            }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
        downloadAndInstallMock
            .mockRejectedValueOnce(new Error('下载更新失败，HTTP 404'))
            .mockResolvedValueOnce({ filePath: '/tmp/latest.apk', versionName: '1.0.289' });

        const { checkForAppUpdate } = await import('../services/appUpdate');
        const result = await checkForAppUpdate();

        expect(result.opened).toBe(true);
        expect(downloadAndInstallMock).toHaveBeenCalledTimes(2);
        expect(downloadAndInstallMock.mock.calls[0][0].url).toBe('https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.289.apk');
        expect(downloadAndInstallMock.mock.calls[1][0].url).toBe('https://msjh.bacon159.pp.ua/api/apk/latest.apk');
    });

    it('preserves manifest throughput order and falls back only after a download fails', async () => {
        const fullstackUrl = 'https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=fullstack';
        const fallbackUrl = 'https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive';
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === 'HEAD') {
                throw new Error(`Unexpected HEAD probe for ${String(input)}`);
            }
            return new Response(JSON.stringify({
                latest: {
                    versionCode: 290,
                    versionName: '1.0.289',
                    apkSha256: 'new-sha',
                    apkSize: 123456,
                    apkUrls: [fullstackUrl, fallbackUrl],
                    changes: ['测试更新']
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        downloadAndInstallMock
            .mockRejectedValueOnce(new Error('下载速度过慢'))
            .mockResolvedValueOnce({ filePath: '/tmp/fallback.apk', versionName: '1.0.289' });

        const { checkForAppUpdate } = await import('../services/appUpdate');
        const result = await checkForAppUpdate();

        expect(result.opened).toBe(true);
        expect(downloadAndInstallMock).toHaveBeenCalledTimes(2);
        expect(downloadAndInstallMock.mock.calls[0][0].url).toBe(fullstackUrl);
        expect(downloadAndInstallMock.mock.calls[1][0].url).toBe(fallbackUrl);
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'HEAD')).toBe(false);
    });

    it('labels a Quark TV APK source in update progress', async () => {
        const quarkTvUrl = 'https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=quark-tv';
        vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === 'HEAD') return new Response(null, { status: 200 });
            return new Response(JSON.stringify({
                latest: {
                    versionCode: 290,
                    versionName: '1.0.289',
                    apkSha256: 'new-sha',
                    apkSize: 123456,
                    apkUrls: [quarkTvUrl],
                    changes: ['测试更新']
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        downloadAndInstallMock.mockResolvedValueOnce({ filePath: '/tmp/quark.apk', versionName: '1.0.289' });

        const { checkForAppUpdate, subscribeAppUpdateProgress } = await import('../services/appUpdate');
        const messages: string[] = [];
        const unsubscribe = subscribeAppUpdateProgress((progress) => {
            if (progress?.message) messages.push(progress.message);
        });

        try {
            await checkForAppUpdate();
        } finally {
            unsubscribe();
        }

        expect(messages).toContain('正在准备下载更新包（渠道：夸克TV）...');
    });

    it('falls back to bundled release info when the App plugin is unavailable in native webview mode', async () => {
        nativeRuntimeMock.appPluginAvailable = false;
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            latest: {
                versionCode: 290,
                versionName: '1.0.289',
                apkSha256: 'new-sha',
                apkSize: 123456,
                latestApkUrl: 'https://msjh.bacon159.pp.ua/api/apk/latest.apk',
                changes: ['测试更新']
            }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
        downloadAndInstallMock.mockResolvedValueOnce({ filePath: '/tmp/latest.apk', versionName: '1.0.289' });

        const { getCurrentAppRelease, checkForAppUpdate } = await import('../services/appUpdate');

        await expect(getCurrentAppRelease()).resolves.toEqual({
            versionCode: 290,
            versionName: '1.0.289'
        });

        const result = await checkForAppUpdate();
        expect(result.opened).toBe(true);
    });

    it('hands the web APK URL straight to the browser instead of fetching it, so third-party redirects cannot break it via CORS', async () => {
        nativeRuntimeMock.native = false;
        const click = vi.fn();
        const remove = vi.fn();
        const appendChild = vi.fn();
        const link: Record<string, any> = { click, remove, style: {} };
        vi.stubGlobal('document', {
            body: { appendChild },
            createElement: vi.fn(() => link)
        });
        // /api/apk/* 会 302 到第三方加速镜像（如 gh-proxy.com），而 fetch 默认是
        // mode:'cors'，末跳响应不带 Access-Control-Allow-Origin 时会抛
        // `TypeError: Failed to fetch`。浏览器端必须走顶层导航，绝不能再 fetch。
        const fetchMock = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        vi.stubGlobal('fetch', fetchMock);

        const { downloadLatestApkPackage } = await import('../services/appUpdate');
        await downloadLatestApkPackage();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(appendChild).toHaveBeenCalledWith(link);
        expect(link.href).toBe('https://msjh.bacon159.pp.ua/api/apk/latest.apk');
        expect(link.download).toBe('MoRanJiangHu-v1.0.289.apk');
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('downloads the web APK from the VPS origin when opened on the VPS backup domain', async () => {
        nativeRuntimeMock.native = false;
        vi.stubGlobal('window', {
            location: { href: 'https://moranjianghu.bacon159.pp.ua/' },
            confirm: vi.fn(() => true),
            alert: vi.fn(),
            setTimeout: vi.fn((callback: () => void) => {
                callback();
                return 1;
            })
        });
        const link: Record<string, any> = { click: vi.fn(), remove: vi.fn(), style: {} };
        vi.stubGlobal('document', {
            body: { appendChild: vi.fn() },
            createElement: vi.fn(() => link)
        });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { downloadLatestApkPackage } = await import('../services/appUpdate');
        await downloadLatestApkPackage();

        expect(link.href).toBe('https://moranjianghu.bacon159.pp.ua/api/apk/latest.apk');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
