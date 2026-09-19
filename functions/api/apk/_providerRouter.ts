import {
    APK_LATEST_CACHE_CONTROL,
    buildVpsApkRedirect,
    buildGitHubApkRedirect,
    buildGitHubRawApkRedirect,
    buildOneDriveApkRedirect,
    buildQuarkTvApkRedirect,
    isOneDriveDirectProvider,
    isOneDriveProvider
} from './_shared';

export type ResolvedApkProvider = 'vps' | 'quark-tv' | 'onedrive' | 'onedrive-direct' | 'github' | 'github-raw';

export type ResolveApkDownloadInput = {
    env: any;
    requestedProvider?: string | null;
    preferredProvider?: string | null;
    versionName: string;
    storageFileName: string;
    downloadFileName: string;
    cacheControl?: string;
};

export type ResolvedApkDownload = {
    provider: ResolvedApkProvider;
    response: Response;
};

// fullstack 已于 2026-09-19 下线（WebDAV 挂载写入上限 < 3MB，见 latest.apk.ts 的 410 分支）。
const DEFAULT_PROVIDER_ORDER: ResolvedApkProvider[] = [
    'vps',
    'quark-tv',
    'onedrive',
    'github',
    'github-raw'
];

const buildProviderResponse = async (
    provider: string,
    input: ResolveApkDownloadInput
): Promise<Response | null> => {
    const cacheControl = input.cacheControl || APK_LATEST_CACHE_CONTROL;
    if (provider === 'vps') {
        return buildVpsApkRedirect(
            input.env,
            input.storageFileName,
            input.downloadFileName,
            cacheControl
        );
    }
    if (provider === 'quark-tv') {
        return buildQuarkTvApkRedirect(
            input.env,
            input.storageFileName,
            input.downloadFileName,
            cacheControl
        );
    }
    if (isOneDriveProvider(provider)) {
        return buildOneDriveApkRedirect(
            input.env,
            input.downloadFileName,
            cacheControl,
            isOneDriveDirectProvider(provider) ? 'direct' : 'public'
        );
    }
    if (provider === 'github') {
        const accelerator = typeof input.env?.MORAN_GITHUB_RELEASE_ACCELERATOR === 'string'
            ? input.env.MORAN_GITHUB_RELEASE_ACCELERATOR
            : undefined;
        return buildGitHubApkRedirect(
            input.versionName,
            input.downloadFileName,
            cacheControl,
            accelerator
        );
    }
    if (provider === 'github-raw') {
        const accelerator = typeof input.env?.MORAN_GITHUB_RAW_ACCELERATOR === 'string'
            ? input.env.MORAN_GITHUB_RAW_ACCELERATOR
            : undefined;
        return buildGitHubRawApkRedirect(input.downloadFileName, cacheControl, accelerator);
    }
    return null;
};

export const resolveApkDownload = async (
    input: ResolveApkDownloadInput
): Promise<ResolvedApkDownload | null> => {
    const explicit = input.requestedProvider?.trim();
    const preferred = DEFAULT_PROVIDER_ORDER.includes(input.preferredProvider as ResolvedApkProvider)
        ? input.preferredProvider as ResolvedApkProvider
        : 'quark-tv';
    const chain = explicit
        ? [explicit]
        : [preferred, ...DEFAULT_PROVIDER_ORDER.filter((provider) => provider !== preferred)];

    for (const provider of chain) {
        const response = await buildProviderResponse(provider, input);
        if (response) {
            return { provider: provider as ResolvedApkProvider, response };
        }
    }
    return null;
};
