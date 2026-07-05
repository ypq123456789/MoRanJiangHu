import {
    APK_CORS_HEADERS,
    APK_LATEST_CACHE_CONTROL,
    ApkProvider,
    buildB2ApkRedirect,
    buildGitHubApkRedirect,
    buildOneDriveApkRedirect,
    buildVersionedApkFileName,
    buildTextResponse,
    isOneDriveDirectProvider,
    isOneDriveProvider,
    normalizeObjectKey,
    readManifestPayload,
    readManifestPreferredApkProvider,
    readManifestVersionName,
    readReleaseObjectPrefix
} from './_shared';

const resolveLatestApkProvider = (request: Request, manifestPayload: any): ApkProvider => {
    const requestedProvider = new URL(request.url).searchParams.get('provider');
    return (requestedProvider as ApkProvider) || readManifestPreferredApkProvider(manifestPayload);
};

const resolveLatestApkFileName = (provider: ApkProvider, versionedFileName: string): string => {
    if (provider === 'b2') {
        return versionedFileName || 'MoRanJiangHu-latest.apk';
    }
    if (provider === 'github') {
        return versionedFileName || 'MoRanJiangHu-latest.apk';
    }
    return 'MoRanJiangHu-latest.apk';
};

const handleLatestApkRequest = async ({ request, env }: any): Promise<Response> => {
    try {
        const manifest = await readManifestPayload(env);
        const versionName = readManifestVersionName(manifest?.payload);
        const versionedFileName = buildVersionedApkFileName(versionName);
        const provider = resolveLatestApkProvider(request, manifest?.payload);
        const fileName = resolveLatestApkFileName(provider, versionedFileName);

        if (isOneDriveProvider(provider)) {
            const oneDriveResponse = await buildOneDriveApkRedirect(
                env,
                fileName,
                APK_LATEST_CACHE_CONTROL,
                isOneDriveDirectProvider(provider) ? 'direct' : 'public'
            );
            if (oneDriveResponse) return oneDriveResponse;
            return buildTextResponse('OneDrive APK not available', 502);
        }
        if (provider === 'github') {
            const githubResponse = buildGitHubApkRedirect(versionName, fileName, APK_LATEST_CACHE_CONTROL);
            if (githubResponse) return githubResponse;
            return buildTextResponse('GitHub Release APK not available', 502);
        }

        const prefix = readReleaseObjectPrefix(env);
        const key = normalizeObjectKey(`${prefix}/${versionedFileName || 'latest.apk'}`);
        return await buildB2ApkRedirect(env, key, fileName, APK_LATEST_CACHE_CONTROL);
    } catch (error: any) {
        return buildTextResponse(error?.message || 'APK redirect failed', 502);
    }
};

export function onRequestOptions(): Response {
    return new Response(null, { status: 204, headers: APK_CORS_HEADERS });
}

export const onRequestGet = handleLatestApkRequest;
export const onRequestHead = handleLatestApkRequest;
