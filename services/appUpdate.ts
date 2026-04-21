import { App as CapacitorApp } from '@capacitor/app';
import { RELEASE_INFO } from '../data/releaseInfo';
import { isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { NativeApkUpdater } from './nativeApkUpdater';

const UPDATE_PROMPT_STORAGE_KEY = 'moranjianghu.lastPromptedUpdateVersion';

export type UpdateManifest = {
    versionCode: number;
    versionName: string;
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

const getPromptedVersion = (): string => {
    try {
        return localStorage.getItem(UPDATE_PROMPT_STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

const setPromptedVersion = (versionName: string) => {
    try {
        localStorage.setItem(UPDATE_PROMPT_STORAGE_KEY, versionName);
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

export const fetchLatestUpdateManifest = async (): Promise<UpdateManifest | null> => {
    if (!RELEASE_INFO.updateManifestUrl) return null;

    try {
        const response = await fetch(RELEASE_INFO.updateManifestUrl, { cache: 'no-store' });
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
    manifest: UpdateManifest
): boolean => {
    const currentCode = Number(currentRelease.versionCode || 0);
    const latestCode = Number(manifest.versionCode || 0);

    if (latestCode > currentCode) return true;
    if (latestCode < currentCode) return false;

    return compareVersionNames(manifest.versionName || '', currentRelease.versionName || '') > 0;
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

    await NativeApkUpdater.downloadAndInstall({
        url: targetUrl,
        versionName: manifest.versionName || RELEASE_INFO.versionName
    });
};

export const checkForAppUpdate = async (options?: { silentNoUpdate?: boolean; auto?: boolean }) => {
    const currentRelease = await getCurrentAppRelease();
    const manifest = await fetchLatestUpdateManifest();

    if (!manifest) {
        if (!options?.silentNoUpdate) {
            window.alert('暂时无法获取更新信息，请稍后重试。');
        }
        return { updateAvailable: false, currentRelease, manifest: null };
    }

    if (!hasNewerRelease(currentRelease, manifest)) {
        if (!options?.silentNoUpdate) {
            window.alert(`当前已经是最新版本 v${currentRelease.versionName}。`);
        }
        return { updateAvailable: false, currentRelease, manifest };
    }

    if (options?.auto && getPromptedVersion() === manifest.versionName) {
        return { updateAvailable: true, currentRelease, manifest, skippedPrompt: true };
    }

    const confirmed = window.confirm(
        `检测到新版本 v${manifest.versionName}（当前 v${currentRelease.versionName}）。\n\n更新内容：\n${formatChanges(manifest.changes)}\n\n是否立即更新？`
    );

    setPromptedVersion(manifest.versionName);

    if (confirmed) {
        if (isNativeCapacitorEnvironment()) {
            await installUpdateInNativeApp(manifest);
        } else {
            await openExternalUrl(manifest.apkUrl || RELEASE_INFO.apkDownloadUrl);
        }
    }

    return { updateAvailable: true, currentRelease, manifest, opened: confirmed };
};
