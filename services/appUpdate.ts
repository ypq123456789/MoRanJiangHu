import { App as CapacitorApp } from '@capacitor/app';
import { RELEASE_INFO } from '../data/releaseInfo';
import { isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { NativeApkUpdater, type NativeApkUpdateProgress } from './nativeApkUpdater';

const UPDATE_PROMPT_STORAGE_KEY = 'moranjianghu.lastPromptedUpdateRelease';

export type UpdateManifest = {
    versionCode: number;
    versionName: string;
    apkSha256?: string;
    apkSize?: number;
    releaseChannel?: string;
    apkUrl?: string;
    manifestUrl?: string;
    githubRepoUrl?: string;
    releaseNotesUrl?: string;
    websiteUrl?: string;
    publishedAt?: string;
    changes?: string[];
};

type UpdateManifestDocument = {
    latest?: UpdateManifest;
    history?: UpdateManifest[];
};

export type AppUpdateProgressState = NativeApkUpdateProgress & {
    visible: boolean;
};

const appUpdateProgressListeners = new Set<(progress: AppUpdateProgressState | null) => void>();

const emitAppUpdateProgress = (progress: AppUpdateProgressState | null) => {
    appUpdateProgressListeners.forEach((listener) => {
        try {
            listener(progress);
        } catch (error) {
            console.warn('App update progress listener failed:', error);
        }
    });
};

export const subscribeAppUpdateProgress = (
    listener: (progress: AppUpdateProgressState | null) => void
): (() => void) => {
    appUpdateProgressListeners.add(listener);
    return () => {
        appUpdateProgressListeners.delete(listener);
    };
};

const parseVersionParts = (value: string): number[] => (
    String(value || '')
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map((part) => Number(part))
);

const compareVersionNames = (left: string, right: string): number => {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = leftParts[index] || 0;
        const rightPart = rightParts[index] || 0;
        if (leftPart > rightPart) return 1;
        if (leftPart < rightPart) return -1;
    }

    return 0;
};

const getPromptedReleaseKey = (): string => {
    try {
        return localStorage.getItem(UPDATE_PROMPT_STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

const getManifestReleaseKey = (manifest: UpdateManifest): string => (
    String(manifest.apkSha256 || manifest.versionName || '').trim().toLowerCase()
);

const setPromptedReleaseKey = (value: string) => {
    try {
        localStorage.setItem(UPDATE_PROMPT_STORAGE_KEY, value);
    } catch {
        // ignore storage failures
    }
};

export const openExternalUrl = async (url: string): Promise<void> => {
    if (!url) return;

    if (isNativeCapacitorEnvironment()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
        return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
};

export const getCurrentAppRelease = async (): Promise<{ versionCode: number; versionName: string }> => {
    if (!isNativeCapacitorEnvironment()) {
        return {
            versionCode: RELEASE_INFO.versionCode,
            versionName: RELEASE_INFO.versionName
        };
    }

    try {
        const info = await CapacitorApp.getInfo();
        return {
            versionCode: Number(info.build || RELEASE_INFO.versionCode) || RELEASE_INFO.versionCode,
            versionName: info.version || RELEASE_INFO.versionName
        };
    } catch {
        return {
            versionCode: RELEASE_INFO.versionCode,
            versionName: RELEASE_INFO.versionName
        };
    }
};

const getCurrentInstalledApkFingerprint = async (): Promise<{ sha256?: string; fileSize?: number } | null> => {
    if (!isNativeCapacitorEnvironment()) {
        return null;
    }

    try {
        const info = await NativeApkUpdater.getInstalledApkInfo();
        return {
            sha256: typeof info?.sha256 === 'string' ? info.sha256.trim().toLowerCase() : undefined,
            fileSize: Number(info?.fileSize || 0) || undefined
        };
    } catch {
        return null;
    }
};

export const fetchLatestUpdateManifest = async (): Promise<UpdateManifest | null> => {
    if (!RELEASE_INFO.updateManifestUrl) return null;

    try {
        const requestUrl = new URL(
            RELEASE_INFO.updateManifestUrl,
            typeof window !== 'undefined' ? window.location.href : 'https://msjh.bacon.de5.net'
        );
        requestUrl.searchParams.set('t', String(Date.now()));
        const response = await fetch(requestUrl.toString(), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json() as UpdateManifestDocument | UpdateManifest;
        if (payload && typeof payload === 'object' && 'latest' in payload && payload.latest) {
            return payload.latest;
        }

        return payload as UpdateManifest;
    } catch (error) {
        console.warn('Failed to fetch update manifest:', error);
        return null;
    }
};

export const hasNewerRelease = (
    currentRelease: { versionCode: number; versionName: string },
    manifest: UpdateManifest,
    currentFingerprint?: { sha256?: string; fileSize?: number } | null
): boolean => {
    const currentCode = Number(currentRelease.versionCode || 0);
    const latestCode = Number(manifest.versionCode || 0);
    const versionNameCompare = compareVersionNames(manifest.versionName || '', currentRelease.versionName || '');

    if (latestCode > currentCode) return true;
    if (latestCode < currentCode) return false;
    if (versionNameCompare > 0) return true;
    if (versionNameCompare < 0) return false;

    const currentSha = String(currentFingerprint?.sha256 || '').trim().toLowerCase();
    const manifestSha = String(manifest.apkSha256 || '').trim().toLowerCase();

    if (currentSha && manifestSha) {
        return currentSha !== manifestSha;
    }

    return false;
};

const formatChanges = (changes?: string[]) => {
    if (!Array.isArray(changes) || changes.length === 0) {
        return '本次版本未填写详细更新日志。';
    }

    return changes.map((item, index) => `${index + 1}. ${item}`).join('\n');
};

const installUpdateInNativeApp = async (manifest: UpdateManifest) => {
    const targetUrl = manifest.apkUrl || RELEASE_INFO.apkDownloadUrl;
    if (!targetUrl) {
        throw new Error('缺少 APK 下载地址。');
    }

    const versionName = manifest.versionName || RELEASE_INFO.versionName;
    const listenerHandle = await NativeApkUpdater.addListener('updateProgress', (progress) => {
        emitAppUpdateProgress({
            visible: true,
            ...progress
        });
    });

    emitAppUpdateProgress({
        visible: true,
        stage: 'preparing',
        message: '正在准备下载更新包...',
        versionName
    });

    try {
        await NativeApkUpdater.downloadAndInstall({
            url: targetUrl,
            versionName
        });
    } catch (error) {
        emitAppUpdateProgress({
            visible: true,
            stage: 'error',
            message: error instanceof Error ? error.message : '更新失败',
            versionName
        });
        throw error;
    } finally {
        window.setTimeout(() => {
            emitAppUpdateProgress(null);
        }, 2400);
        void listenerHandle.remove();
    }
};

export const checkForAppUpdate = async (options?: { silentNoUpdate?: boolean; auto?: boolean }) => {
    const currentRelease = await getCurrentAppRelease();
    const currentFingerprint = await getCurrentInstalledApkFingerprint();
    const manifest = await fetchLatestUpdateManifest();

    if (!manifest) {
        if (!options?.silentNoUpdate) {
            window.alert('暂时无法获取更新信息，请稍后重试。');
        }
        return { updateAvailable: false, currentRelease, currentFingerprint, manifest: null };
    }

    if (!hasNewerRelease(currentRelease, manifest, currentFingerprint)) {
        if (!options?.silentNoUpdate) {
            window.alert(`当前已经是最新版本 v${currentRelease.versionName}。`);
        }
        return { updateAvailable: false, currentRelease, currentFingerprint, manifest };
    }

    const promptReleaseKey = getManifestReleaseKey(manifest);

    if (options?.auto && promptReleaseKey && getPromptedReleaseKey() === promptReleaseKey) {
        return { updateAvailable: true, currentRelease, currentFingerprint, manifest, skippedPrompt: true };
    }

    const confirmed = window.confirm(
        `检测到新版本 v${manifest.versionName}（当前 v${currentRelease.versionName}）。\n\n更新内容：\n${formatChanges(manifest.changes)}\n\n是否立即更新？`
    );

    if (promptReleaseKey) {
        setPromptedReleaseKey(promptReleaseKey);
    }

    if (confirmed) {
        if (isNativeCapacitorEnvironment()) {
            await installUpdateInNativeApp(manifest);
        } else {
            await openExternalUrl(manifest.apkUrl || RELEASE_INFO.apkDownloadUrl);
        }
    }

    return { updateAvailable: true, currentRelease, currentFingerprint, manifest, opened: confirmed };
};
