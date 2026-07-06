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

vi.mock('../utils/nativeRuntime', () => ({
    isNativeCapacitorEnvironment: () => true
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

    it('chooses the fastest available APK source among B2, GitHub accelerators, OneDrive and OneDrive direct', async () => {
        const b2Url = 'https://msjh.bacon159.pp.ua/api/apk/version/MoRanJiangHu-v1.0.289.apk?provider=b2';
        const githubAcceleratedUrl = 'https://gh.ddlc.top/https://github.com/ypq123456789/MoRanJiangHu/releases/download/v1.0.289/MoRanJiangHu-v1.0.289.apk';
        const oneDriveUrl = 'https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive';
        const oneDriveDirectUrl = 'https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive-direct';

        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (init?.method === 'HEAD') {
                if (url === b2Url) {
                    await delay(1);
                    return new Response(null, { status: 404 });
                }
                if (url === githubAcceleratedUrl) {
                    await delay(160);
                    return new Response(null, { status: 200 });
                }
                if (url === oneDriveUrl) {
                    await delay(300);
                    return new Response(null, { status: 200 });
                }
                if (url === oneDriveDirectUrl) {
                    await delay(5);
                    return new Response(null, { status: 200 });
                }
                return new Response(null, { status: 404 });
            }
            return new Response(JSON.stringify({
                latest: {
                    versionCode: 290,
                    versionName: '1.0.289',
                    apkSha256: 'new-sha',
                    apkSize: 123456,
                    apkUrls: [b2Url, githubAcceleratedUrl, oneDriveUrl, oneDriveDirectUrl],
                    changes: ['测试更新']
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        downloadAndInstallMock.mockResolvedValueOnce({ filePath: '/tmp/onedrive-direct.apk', versionName: '1.0.289' });

        const { checkForAppUpdate } = await import('../services/appUpdate');
        const result = await checkForAppUpdate();

        expect(result.opened).toBe(true);
        expect(downloadAndInstallMock).toHaveBeenCalledTimes(1);
        expect(downloadAndInstallMock.mock.calls[0][0].url).toBe(oneDriveDirectUrl);
    });

    it('keeps exposing the selected download channel in progress updates', async () => {
        const progressListeners: Array<(progress: any) => void> = [];
        addListenerMock.mockImplementationOnce(async (_eventName: string, listener: (progress: any) => void) => {
            progressListeners.push(listener);
            return { remove: vi.fn() };
        });

        const oneDriveDirectUrl = 'https://msjh.bacon159.pp.ua/api/apk/latest.apk?provider=onedrive-direct';
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === 'HEAD') {
                return new Response(null, { status: 200 });
            }
            return new Response(JSON.stringify({
                latest: {
                    versionCode: 290,
                    versionName: '1.0.289',
                    apkSha256: 'new-sha',
                    apkSize: 123456,
                    apkUrls: [oneDriveDirectUrl],
                    changes: ['测试更新']
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        downloadAndInstallMock.mockImplementationOnce(async () => {
            progressListeners[0]?.({
                stage: 'downloading',
                versionName: '1.0.289',
                downloadedBytes: 64,
                totalBytes: 128,
                percent: 50,
                message: '原生下载中'
            });
            return { filePath: '/tmp/onedrive-direct.apk', versionName: '1.0.289' };
        });

        const { checkForAppUpdate, subscribeAppUpdateProgress } = await import('../services/appUpdate');
        const snapshots: any[] = [];
        const unsubscribe = subscribeAppUpdateProgress((progress) => {
            if (progress) snapshots.push(progress);
        });

        await checkForAppUpdate();
        unsubscribe();

        expect(snapshots.some((item) => item.channelLabel === 'OneDrive直连')).toBe(true);
        expect(snapshots.some((item) => item.message?.includes('当前下载渠道：OneDrive直连'))).toBe(true);
    });
});
