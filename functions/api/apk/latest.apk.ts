import {
    APK_CORS_HEADERS,
    APK_LATEST_CACHE_CONTROL,
    buildVersionedApkFileName,
    buildTextResponse,
    readManifestPayload,
    readManifestPreferredApkProvider,
    readManifestVersionName,
} from './_shared';
import { resolveApkDownload } from './_providerRouter';
import { scheduleApkDownloadCount } from './_downloadStats';

const handleLatestApkRequest = async (context: any, method: 'GET' | 'HEAD'): Promise<Response> => {
    const { request, env } = context;
    try {
        const manifest = await readManifestPayload(env);
        const versionName = readManifestVersionName(manifest?.payload);
        const versionedFileName = buildVersionedApkFileName(versionName);
        const fileName = versionedFileName || 'MoRanJiangHu-latest.apk';
        const requestedProvider = new URL(request.url).searchParams.get('provider');
        if (requestedProvider === 'b2') {
            return buildTextResponse('B2 APK provider is decommissioned', 410);
        }
        // 全栈云盘（WebDAV）挂载的写入上限 < 3MB，5.88MB 的 APK 结构性传不上去，
        // 该 provider 从未有过可用产物。已下线，明确返回 410 而不是让客户端拿到 503。
        if (requestedProvider === 'fullstack') {
            return buildTextResponse('Fullstack APK provider is decommissioned', 410);
        }
        const resolved = await resolveApkDownload({
            env,
            requestedProvider,
            preferredProvider: readManifestPreferredApkProvider(manifest?.payload),
            versionName,
            storageFileName: 'latest.apk',
            downloadFileName: fileName,
            cacheControl: APK_LATEST_CACHE_CONTROL
        });
        if (resolved) {
            scheduleApkDownloadCount({
                env,
                waitUntil: context.waitUntil,
                method,
                versionName,
                provider: resolved.provider
            });
            return resolved.response;
        }
        return buildTextResponse('APK download providers are unavailable', 503);
    } catch (error: any) {
        return buildTextResponse(error?.message || 'APK redirect failed', 502);
    }
};

export function onRequestOptions(): Response {
    return new Response(null, { status: 204, headers: APK_CORS_HEADERS });
}

export const onRequestGet = (context: any): Promise<Response> => handleLatestApkRequest(context, 'GET');
export const onRequestHead = (context: any): Promise<Response> => handleLatestApkRequest(context, 'HEAD');
