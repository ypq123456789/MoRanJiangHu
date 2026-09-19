import { App as CapacitorApp } from '@capacitor/app';
import { RELEASE_INFO } from '../data/releaseInfo';
import { isCapacitorPluginAvailable, isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { NativeApkUpdater, type NativeApkUpdateProgress } from './nativeApkUpdater';

const UPDATE_PROMPT_STORAGE_KEY = 'moranjianghu.lastPromptedUpdateRelease';

export type UpdateManifest = {
    versionCode: number;
    versionName: string;
    apkSha256?: string;
    apkSize?: number;
    releaseChannel?: string;
    apkUrl?: string;
    directApkUrl?: string;
    apkUrls?: string[];
    fullstackApkUrl?: string;
    oneDriveDirectApkUrl?: string;
    latestApkUrl?: string;
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
let lastAppUpdateProgress: AppUpdateProgressState | null = null;

const normalizeProgress = (progress: AppUpdateProgressState | null): AppUpdateProgressState | null => {
    if (!progress) {
        lastAppUpdateProgress = null;
        return null;
    }

    const previous = lastAppUpdateProgress;
    if (!previous || previous.versionName !== progress.versionName) {
        lastAppUpdateProgress = progress;
        return progress;
    }

    const next = { ...progress };
    const currentDownloaded = Number(next.downloadedBytes || 0);
    const previousDownloaded = Number(previous.downloadedBytes || 0);
    if (previousDownloaded > currentDownloaded && next.stage === 'downloading') {
        next.downloadedBytes = previousDownloaded;
    }

    const currentPercent = Number(next.percent || 0);
    const previousPercent = Number(previous.percent || 0);
    if (previousPercent > currentPercent && next.stage === 'downloading') {
        next.percent = previousPercent;
    }

    lastAppUpdateProgress = next;
    return next;
};

const emitAppUpdateProgress = (progress: AppUpdateProgressState | null) => {
    const normalizedProgress = normalizeProgress(progress);
    appUpdateProgressListeners.forEach((listener) => {
        try {
            listener(normalizedProgress);
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

    const resolvedUrl = url.startsWith('/') ? `${(typeof RELEASE_INFO.websiteUrl === 'string' ? RELEASE_INFO.websiteUrl : 'https://msjh.bacon159.pp.ua').replace(/\/+$/, '')}${url}` : url;
    window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
};

const triggerBrowserFileDownload = (url: string, filename: string): void => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    // 不要在 click() 之后同步移除：部分浏览器还没开始读取 href 就把节点摘掉，下载会静默失败。
    window.setTimeout(() => {
        link.remove();
    }, 1000);
};

/**
 * 触发浏览器端 APK 下载。
 *
 * ⚠️ 这里**刻意不用 fetch + Blob**：`/api/apk/*` 会 302 到第三方加速镜像
 * （GitHub Release 加速、OpenList 代理等），而 `fetch` 默认是 `mode: 'cors'`，
 * **末跳响应必须带 `Access-Control-Allow-Origin`**，否则抛
 * `TypeError: Failed to fetch`（站内那个 302 自己带的 CORS 头不算数）。
 * 实测 `gh-proxy.com`、`ghfast.top` 都不带该头，一旦它们被选为 provider，
 * 网页端下载就必然失败。
 *
 * 顶层导航不受 CORS 约束，且每个 provider 的 302 都带
 * `Content-Disposition: attachment; filename=...`，所以直接交给浏览器下载最稳，
 * 也顺带避免了「Blob URL 用完立刻 revoke 把下载掐断」的老问题。
 */
const downloadBrowserFile = (url: string, filename: string): void => {
    triggerBrowserFileDownload(url, filename);
};

const resolveBrowserApkDownloadUrl = (rawUrl: string): string => {
    const base = typeof window !== 'undefined' ? window.location.href : 'https://msjh.bacon159.pp.ua';
    const current = new URL(base);
    const target = new URL(rawUrl, current.href);
    if (/^(msjh\.bacon159\.pp\.ua|msjh\.bacon\.de5\.net|moranjianghu\.bacon159\.pp\.ua)$/i.test(current.hostname)) {
        target.protocol = current.protocol;
        target.host = current.host;
        const versionMatch = target.pathname.match(/\/MoRanJiangHu-v([^/?#]+\.apk)$/i);
        target.pathname = versionMatch
            ? `/api/apk/version/${encodeURIComponent(`MoRanJiangHu-v${decodeURIComponent(versionMatch[1])}`)}`
            : target.pathname;
    }
    return target.toString();
};

export const getCurrentAppRelease = async (): Promise<{ versionCode: number; versionName: string }> => {
    if (!isNativeCapacitorEnvironment() || !isCapacitorPluginAvailable('App')) {
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

const normalizeApkDownloadUrl = (rawUrl?: string): string => {
    const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!value) return '';

    try {
        const baseUrl = typeof window !== 'undefined' ? window.location.href : 'https://msjh.bacon.de5.net';
        return new URL(value, baseUrl).toString();
    } catch {
        return '';
    }
};

const resolveNativeApkDownloadUrls = (manifest: UpdateManifest): string[] => {
    const rawCandidates = [
        ...(Array.isArray(manifest.apkUrls) ? manifest.apkUrls : []),
        // manifest.fullstackApkUrl 已于 2026-09-19 下线（<3MB 写入上限，无可用产物）：
        // Worker 侧恒返回空串，这里也不再把它当候选，避免旧清单/缓存把客户端指向死链。
        manifest.directApkUrl,
        manifest.oneDriveDirectApkUrl,
        manifest.apkUrl,
        manifest.latestApkUrl,
        RELEASE_INFO.apkDownloadUrl
    ];
    const seen = new Set<string>();

    return rawCandidates
        .map((item) => normalizeApkDownloadUrl(item))
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
};

const installUpdateInNativeApp = async (manifest: UpdateManifest) => {
    const rawUrls = resolveNativeApkDownloadUrls(manifest);
    if (rawUrls.length === 0) {
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
        message: '正在选择推荐下载源...',
        versionName
    });

    const targetUrls = rawUrls;

    // 从 URL 提取渠道名称
    const getChannelLabel = (url: string): string => {
        const lower = url.toLowerCase();
        if (lower.includes('provider=fullstack') || lower.includes('/d/%e5%85%a8%e6%a0%88%e4%ba%91%e7%9b%98/')) return '全栈云盘';
        // 夸克通道自 2026-09-19 起改读 /夸克（Quark driver），provider 键仍是 quark-tv
        if (lower.includes('provider=quark-tv') || lower.includes('provider=quark') || lower.includes('/d/%e5%a4%b8%e5%85%8b/')) return '夸克';
        if (lower.includes('moranjianghu.bacon159.pp.ua')) return 'VPS';
        if (lower.includes('provider=github-raw') || lower.includes('cloudflare-proxy-6rw.pages.dev/https://raw.githubusercontent.com') || lower.includes('raw.githubusercontent.com/ypq123456789/moranjianghu/apk-dist')) return 'GitHub Raw加速';
        if (lower.includes('provider=github') || lower.includes('objects.githubusercontent.com') || lower.includes('github.com/ypq123456789/moranjianghu/releases')) return 'GitHub';
        if (lower.includes('provider=b2') || lower.includes('backblazeb2.com') || lower.includes('obs.bacon159.pp.ua')) return 'B2';
        if (lower.includes('provider=onedrive-direct') || lower.includes('provider=onedrive-origin') || lower.includes('159.138.7.126:5244')) return 'OneDrive直连';
        if (lower.includes('provider=onedrive') || lower.includes('openlist.bacon.de5.net')) return 'OneDrive';
        if (lower.includes('provider=r2') || lower.includes('download.bacon.de5.net')) return 'R2';
        if (lower.includes('provider=hi168') || lower.includes('s3.hi168.com')) return 'S3';
        if (lower.includes('/api/apk/')) return 'CDN';
        return '备用';
    };

    emitAppUpdateProgress({
        visible: true,
        stage: 'preparing',
        message: `正在准备下载更新包（渠道：${getChannelLabel(targetUrls[0])}）...`,
        versionName
    });

    try {
        let lastError: unknown = null;
        for (let index = 0; index < targetUrls.length; index += 1) {
            const targetUrl = targetUrls[index];
            const channelLabel = getChannelLabel(targetUrl);
            if (index > 0) {
                emitAppUpdateProgress({
                    visible: true,
                    stage: 'preparing',
                    message: `当前下载源速度过慢或不可用，正在切换到 ${channelLabel} 渠道...`,
                    versionName
                });
            }

            try {
                await NativeApkUpdater.downloadAndInstall({
                    url: targetUrl,
                    versionName,
                    apkSha256: manifest.apkSha256,
                    apkSize: manifest.apkSize
                });
                return;
            } catch (error) {
                lastError = error;
                console.warn('APK download candidate failed:', targetUrl, error);
            }
        }

        throw lastError instanceof Error ? lastError : new Error('更新失败：所有 APK 下载地址均不可用。');
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

export const downloadLatestApkPackage = async (): Promise<void> => {
    if (!isNativeCapacitorEnvironment()) {
        const rawUrl = RELEASE_INFO.apkDownloadUrl;
        if (!rawUrl) throw new Error('缺少 APK 下载地址。');
        downloadBrowserFile(
            resolveBrowserApkDownloadUrl(rawUrl),
            `MoRanJiangHu-v${RELEASE_INFO.versionName}.apk`
        );
        return;
    }

    const manifest = await fetchLatestUpdateManifest();
    const targetManifest: UpdateManifest = manifest || {
        versionCode: RELEASE_INFO.versionCode,
        versionName: RELEASE_INFO.versionName,
        apkUrl: RELEASE_INFO.apkDownloadUrl,
        apkSha256: RELEASE_INFO.apkSha256,
        apkSize: RELEASE_INFO.apkSize
    };

    await installUpdateInNativeApp(targetManifest);
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
            const rawUrl = manifest.apkUrl || RELEASE_INFO.apkDownloadUrl;
            if (rawUrl) {
                await downloadBrowserFile(
                    resolveBrowserApkDownloadUrl(rawUrl),
                    `MoRanJiangHu-v${manifest.versionName || RELEASE_INFO.versionName}.apk`
                );
            }
        }
    }

    return { updateAvailable: true, currentRelease, currentFingerprint, manifest, opened: confirmed };
};
