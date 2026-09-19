import {
    APK_LATEST_CACHE_CONTROL,
    APK_CORS_HEADERS,
    buildVersionedApkFileName,
    buildTextResponse,
    readReleaseBaseUrl,
    readManifestPayload,
    readManifestPreferredApkProvider,
    readManifestVersionName
} from './_shared';

const DEFAULT_GITHUB_RELEASE_ACCELERATORS = [
    'https://gh.ddlc.top',
    'https://gh-proxy.com',
    'https://gh-proxy.ygxz.in',
    'https://ghfast.top'
];
const DEFAULT_GITHUB_RAW_ACCELERATOR = 'https://cloudflare-proxy-6rw.pages.dev';
const GITHUB_RAW_APK_BRANCH = 'apk-dist';

const buildGitHubReleaseDownloadUrl = (versionName: string, fileName: string): string => (
    `https://github.com/ypq123456789/MoRanJiangHu/releases/download/v${versionName}/${fileName}`
);

const buildGitHubRawDownloadUrl = (fileName: string): string => (
    `https://raw.githubusercontent.com/ypq123456789/MoRanJiangHu/${GITHUB_RAW_APK_BRANCH}/releases/${fileName}`
);

const buildGitHubAcceleratedUrls = (versionName: string, fileName: string): string[] => {
    if (!versionName || !fileName) return [];
    const directUrl = buildGitHubReleaseDownloadUrl(versionName, fileName);
    return DEFAULT_GITHUB_RELEASE_ACCELERATORS.map((baseUrl) => `${baseUrl}/${directUrl}`);
};

const pickHeaders = (source: Headers): Headers => {
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': APK_LATEST_CACHE_CONTROL,
        ...APK_CORS_HEADERS
    });
    ['ETag', 'Last-Modified'].forEach((name) => {
        const value = source.get(name);
        if (value) headers.set(name, value);
    });
    return headers;
};

export function onRequestOptions(): Response {
    return new Response(null, { status: 204, headers: APK_CORS_HEADERS });
}

export async function onRequestGet({ request, env }: any): Promise<Response> {
    try {
        const manifest = await readManifestPayload(env);
        if (!manifest) return buildTextResponse('APK manifest not found', 404);
        const payload = manifest.payload;
        // KV manifest 有两种格式，使用兼容的 versionName 读取函数
        const versionName = readManifestVersionName(payload);
        const baseUrl = readReleaseBaseUrl(request, env);
        const versionedFileName = buildVersionedApkFileName(versionName);
        const stableApkUrl = versionedFileName
            ? `${baseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}`
            : `${baseUrl}/api/apk/latest.apk`;
        const stableManifestUrl = `${baseUrl}/api/apk/latest.json`;
        const latestApkUrl = `${baseUrl}/api/apk/latest.apk`;
        // fullstack（全栈云盘）已于 2026-09-19 下线：该 WebDAV 挂载写入上限 < 3MB，
        // 5.88MB 的 APK 结构性传不上去。字段保留空串仅为兼容老客户端的解析。
        const fullstackApkUrl = '';
        // VPS 通道（moranjianghu.bacon159.pp.ua/latest.apk）已长期未同步、无可用部署通道，
        // 不再对外暴露 stale 死链；需要时由发布流程重新写入有效地址。
        const quarkTvApkUrl = `${baseUrl}/api/apk/latest.apk?provider=quark-tv`;
        const oneDriveApkUrl = `${baseUrl}/api/apk/latest.apk?provider=onedrive`;
        const oneDriveDirectApkUrl = `${baseUrl}/api/apk/latest.apk?provider=onedrive-direct`;
        const githubApkUrl = versionedFileName
            ? `${baseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=github`
            : `${baseUrl}/api/apk/latest.apk?provider=github`;
        const githubRawApkUrl = versionedFileName
            ? `${baseUrl}/api/apk/version/${encodeURIComponent(versionedFileName)}?provider=github-raw`
            : `${baseUrl}/api/apk/latest.apk?provider=github-raw`;
        const githubDirectApkUrl = versionedFileName ? buildGitHubReleaseDownloadUrl(versionName, versionedFileName) : '';
        const githubAcceleratedApkUrls = versionedFileName ? buildGitHubAcceleratedUrls(versionName, versionedFileName) : [];
        const githubRawDirectApkUrl = versionedFileName ? buildGitHubRawDownloadUrl(versionedFileName) : '';
        const githubRawAcceleratedApkUrl = githubRawDirectApkUrl ? `${DEFAULT_GITHUB_RAW_ACCELERATOR}/${githubRawDirectApkUrl}` : '';
        const manifestPreferredApkProvider = readManifestPreferredApkProvider(payload);
        const hasManifestPreferredApkProvider = Boolean(
            payload?.latest?.preferredApkProvider || payload?.preferredApkProvider
        );
        const preferredApkProvider = hasManifestPreferredApkProvider
            ? manifestPreferredApkProvider
            : 'onedrive';
        // 按 preferredApkProvider 排序候选源；B2 渠道已废弃，VPS 通道（moranjianghu.bacon159.pp.ua/latest.apk）
        // 长期未同步、无可用部署通道，已不再作为可选 provider，未知 provider 回退到默认排序。
        const quarkGroup = [quarkTvApkUrl];
        const githubGroup = [...githubAcceleratedApkUrls, githubApkUrl, githubDirectApkUrl];
        const githubRawGroup = [githubRawAcceleratedApkUrl, githubRawApkUrl, githubRawDirectApkUrl];
        const oneDriveGroup = [oneDriveApkUrl, oneDriveDirectApkUrl];
        let providerOrderedUrls: string[];
        if (preferredApkProvider === 'quark-tv') {
            providerOrderedUrls = [...quarkGroup, ...oneDriveGroup, ...githubGroup, ...githubRawGroup];
        } else if (preferredApkProvider === 'onedrive' || preferredApkProvider === 'onedrive-direct') {
            providerOrderedUrls = [...oneDriveGroup, ...quarkGroup, ...githubRawGroup, ...githubGroup];
        } else if (preferredApkProvider === 'github') {
            providerOrderedUrls = [...githubGroup, ...githubRawGroup, ...quarkGroup, ...oneDriveGroup];
        } else {
            providerOrderedUrls = [...githubRawGroup, ...quarkGroup, ...githubGroup, ...oneDriveGroup];
        }
        const orderedApkUrls = [
            ...providerOrderedUrls,
            latestApkUrl
        ].filter(Boolean);
        const nextPayload = {
            ...payload,
            latest: {
                ...payload?.latest,
                versionName,
                versionCode: payload?.latest?.versionCode || payload?.versionCode,
                preferredApkProvider,
                apkUrl: stableApkUrl,
                directApkUrl: latestApkUrl,
                apkUrls: Array.from(new Set(orderedApkUrls)),
                r2ApkUrl: '',
                hi168ApkUrl: '',
                b2ApkUrl: '',
                fullstackApkUrl,
                quarkTvApkUrl,
                githubApkUrl,
                githubDirectApkUrl,
                githubAcceleratedApkUrls,
                githubRawApkUrl,
                githubRawDirectApkUrl,
                githubRawAcceleratedApkUrl,
                oneDriveApkUrl,
                oneDriveDirectApkUrl,
                latestApkUrl,
                manifestUrl: stableManifestUrl
            }
        };
        return new Response(JSON.stringify(nextPayload, null, 2), {
            status: 200,
            headers: pickHeaders(manifest.sourceHeaders)
        });
    } catch (error: any) {
        return buildTextResponse(error?.message || 'APK manifest proxy failed', 502);
    }
}

export const onRequestHead = onRequestGet;
