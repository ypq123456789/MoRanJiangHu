const encoder = new TextEncoder();

export const APK_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept'
};

export const APK_LATEST_CACHE_CONTROL = 'no-store,no-cache,max-age=0,must-revalidate';
export const APK_VERSIONED_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const readEnvString = (env: any, name: string, fallback = ''): string => (
    typeof env?.[name] === 'string' && env[name].trim() ? env[name].trim() : fallback
);

export type ApkProvider = 'vps' | 'quark-tv' | 'r2' | 'hi168' | 'b2' | 'github' | 'github-raw' | 'onedrive' | 'onedrive-direct' | 'onedrive-origin';

export const readReleaseBaseUrl = (request: Request, env: any): string => {
    const configured = readEnvString(env, 'MORAN_RELEASE_BASE_URL');
    if (configured) return configured.replace(/\/+$/, '');
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
};

export const buildTextResponse = (message: string, status = 400): Response => (
    new Response(message, {
        status,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            ...APK_CORS_HEADERS
        }
    })
);

export const normalizeObjectKey = (value: string): string => (
    value.replace(/^\/+/, '').replace(/\/+/g, '/')
);

export const encodeS3Path = (value: string): string => value
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');

const bytesToHex = (bytes: ArrayBuffer): string => (
    Array.from(new Uint8Array(bytes)).map((item) => item.toString(16).padStart(2, '0')).join('')
);

const sha256Hex = async (data: string): Promise<string> => (
    bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(data)))
);

const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
};

const deriveSigningKey = async (secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> => {
    const kDate = await hmac(encoder.encode(`AWS4${secretKey}`), dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
};

const formatAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
    const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};

export const buildSignedObjectUrl = async (
    env: any,
    key: string,
    expiresSeconds = 1800,
    method: 'GET' | 'HEAD' = 'GET'
): Promise<string> => {
    const endpoint = readEnvString(env, 'MORAN_OSS_ENDPOINT', 'https://s3.hi168.com').replace(/\/+$/, '');
    const bucket = readEnvString(env, 'MORAN_OSS_BUCKET');
    const accessKey = readEnvString(env, 'MORAN_OSS_ACCESS_KEY');
    const secretKey = readEnvString(env, 'MORAN_OSS_SECRET_KEY');
    const region = readEnvString(env, 'MORAN_OSS_REGION', 'auto');
    const service = 's3';
    if (!bucket || !accessKey || !secretKey) throw new Error('APK object storage credentials are not configured');

    const target = new URL(`${endpoint}/${encodeURIComponent(bucket)}/${encodeS3Path(normalizeObjectKey(key))}`);
    const { amzDate, dateStamp } = formatAmzDate(new Date());
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    target.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    target.searchParams.set('X-Amz-Credential', `${accessKey}/${credentialScope}`);
    target.searchParams.set('X-Amz-Date', amzDate);
    target.searchParams.set('X-Amz-Expires', String(Math.max(60, Math.min(604800, expiresSeconds))));
    target.searchParams.set('X-Amz-SignedHeaders', 'host');

    const canonicalQuery = Array.from(target.searchParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
        .join('&');
    const canonicalRequest = [
        method,
        target.pathname,
        canonicalQuery,
        `host:${target.host}\n`,
        'host',
        'UNSIGNED-PAYLOAD'
    ].join('\n');
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest)
    ].join('\n');
    const signingKey = await deriveSigningKey(secretKey, dateStamp, region, service);
    const signature = bytesToHex(await hmac(signingKey, stringToSign));
    target.searchParams.set('X-Amz-Signature', signature);
    return target.toString();
};

export const readReleaseObjectPrefix = (env: any): string => (
    readEnvString(env, 'MORAN_OSS_RELEASE_PREFIX', 'moranjianghu').replace(/^\/+|\/+$/g, '') || 'moranjianghu'
);

/**
 * 从 KV manifest payload 中读取当前版本号。
 * KV manifest 有两种格式：
 *   旧格式（扁平）：{ versionName, versionCode, ... }
 *   新格式（嵌套）：{ latest: { versionName, versionCode, ... }, history: [...] }
 * 优先从 latest 取，fallback 到顶层。
 */
export const readManifestVersionName = (payload: any): string => {
    const fromLatest = payload?.latest?.versionName;
    const fromTop = payload?.versionName;
    return (typeof fromLatest === 'string' && fromLatest.trim()) || (typeof fromTop === 'string' && fromTop.trim()) || '';
};

export const buildVersionedApkFileName = (versionName: unknown): string => {
    const safeVersion = typeof versionName === 'string'
        ? versionName.trim().replace(/[^0-9A-Za-z._-]/g, '')
        : '';
    return safeVersion ? `MoRanJiangHu-v${safeVersion}.apk` : '';
};

export const readManifestPreferredApkProvider = (payload: any): ApkProvider => {
    const provider = payload?.latest?.preferredApkProvider || payload?.preferredApkProvider;
    return provider === 'vps' || provider === 'quark-tv' || provider === 'github' || provider === 'github-raw' || provider === 'onedrive' || provider === 'onedrive-direct' || provider === 'onedrive-origin'
        ? provider
        : 'quark-tv';
};

export const isOneDriveDirectProvider = (provider: unknown): boolean => (
    provider === 'onedrive-direct' || provider === 'onedrive-origin'
);

export const isOneDriveProvider = (provider: unknown): boolean => (
    provider === 'onedrive' || isOneDriveDirectProvider(provider)
);

export const pickApkProvider = (_request: Request, _manifestPayload: any): ApkProvider => {
    // hi168 S3, R2, and B2 are retired for release distribution.
    return 'onedrive';
};

export const buildVersionedApkHeaders = (
    fileName: string,
    sourceHeaders?: Headers,
    source = 'hi168'
): Headers => {
    const headers = new Headers({
        'Content-Type': 'application/vnd.android.package-archive',
        'Cache-Control': APK_VERSIONED_CACHE_CONTROL,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Moran-Apk-Source': source,
        ...APK_CORS_HEADERS
    });
    const contentLength = sourceHeaders?.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);
    const etag = sourceHeaders?.get('ETag');
    if (etag) headers.set('ETag', etag);
    const lastModified = sourceHeaders?.get('Last-Modified');
    if (lastModified) headers.set('Last-Modified', lastModified);
    return headers;
};

export const buildR2ApkResponse = async (
    env: any,
    key: string,
    fileName: string,
    method: 'GET' | 'HEAD',
    source = 'r2'
): Promise<Response | null> => {
    const r2Object = env?.CNB_SYNC_R2 ? await env.CNB_SYNC_R2.get(key) : null;
    if (!r2Object) return null;
    const sourceHeaders = new Headers();
    r2Object.writeHttpMetadata?.(sourceHeaders);
    if (r2Object.size) sourceHeaders.set('Content-Length', String(r2Object.size));
    if (r2Object.etag) sourceHeaders.set('ETag', r2Object.etag);
    const headers = buildVersionedApkHeaders(fileName, sourceHeaders, source);
    return new Response(method === 'HEAD' ? null : r2Object.body, { status: 200, headers });
};

export const readB2ReleaseObjectPrefix = (env: any): string => (
    readEnvString(env, 'MORAN_B2_DISTRIBUTION_RELEASE_PREFIX', readReleaseObjectPrefix(env)).replace(/^\/+|\/+$/g, '') || 'moranjianghu'
);

export const buildB2ObjectUrl = (env: any, key: string): string => {
    const baseUrl = readEnvString(env, 'MORAN_B2_DISTRIBUTION_BASE_URL', 'https://f004.backblazeb2.com/file/bacon111').replace(/\/+$/, '');
    return `${baseUrl}/${encodeS3Path(normalizeObjectKey(key))}`;
};

// ---------- B2 Authorized Download (private bucket support) ----------

/** Global cache for b2_authorize_account result (valid 24h, refresh at 23h). */
let b2AuthCache: { apiUrl: string; authToken: string; expiresAt: number } | null = null;

/** Global cache for download authorization token (valid up to 1h). */
let b2DownloadAuthCache: { token: string; prefix: string; expiresAt: number } | null = null;

/**
 * Call b2_authorize_account and cache the result.
 * Returns null if credentials are missing or the call fails.
 */
const authorizeB2Account = async (env: any): Promise<{ apiUrl: string; authToken: string } | null> => {
    if (b2AuthCache && Date.now() < b2AuthCache.expiresAt) {
        return b2AuthCache;
    }
    const keyId = env?.MORAN_B2_APPLICATION_KEY_ID;
    const key = env?.MORAN_B2_APPLICATION_KEY;
    if (!keyId || !key) return null;

    try {
        const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
            headers: { 'Authorization': `Basic ${btoa(`${keyId}:${key}`)}` },
        });
        if (!res.ok) return null;
        const json = await res.json() as any;
        if (!json?.apiUrl || !json?.authorizationToken) return null;
        b2AuthCache = {
            apiUrl: json.apiUrl,
            authToken: json.authorizationToken,
            expiresAt: Date.now() + 23 * 3600 * 1000, // refresh 1h before expiry
        };
        return b2AuthCache;
    } catch {
        return null;
    }
};

/**
 * Call b2_get_download_authorization for a fileNamePrefix and cache the result.
 * Returns null if credentials are missing or the call fails.
 */
const getB2DownloadAuthorization = async (env: any, keyPrefix: string): Promise<string | null> => {
    if (b2DownloadAuthCache && b2DownloadAuthCache.prefix === keyPrefix && Date.now() < b2DownloadAuthCache.expiresAt) {
        return b2DownloadAuthCache.token;
    }
    const auth = await authorizeB2Account(env);
    if (!auth) return null;
    const bucketId = env?.MORAN_B2_BUCKET_ID;
    if (!bucketId) return null;

    try {
        const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
            method: 'POST',
            headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bucketId,
                fileNamePrefix: keyPrefix,
                validDurationInSeconds: 3600,
            }),
        });
        if (!res.ok) return null;
        const json = await res.json() as any;
        if (!json?.authorizationToken) return null;
        const validSeconds = Math.min(json.validDurationInSeconds || 3600, 3540); // refresh 1min before expiry
        b2DownloadAuthCache = {
            token: json.authorizationToken,
            prefix: keyPrefix,
            expiresAt: Date.now() + validSeconds * 1000,
        };
        return b2DownloadAuthCache.token;
    } catch {
        return null;
    }
};

/**
 * Build B2 APK redirect. When B2 application keys are configured (private bucket),
 * acquires a download authorization token and appends it to the download URL.
 * Falls back to public URL when keys are absent (backward compatible).
 */
export const buildB2ApkRedirect = async (
    env: any,
    key: string,
    fileName: string,
    cacheControl = APK_VERSIONED_CACHE_CONTROL
): Promise<Response> => {
    const baseUrl = buildB2ObjectUrl(env, key);

    // Try private bucket authorized download
    const prefix = readB2ReleaseObjectPrefix(env);
    const downloadToken = await getB2DownloadAuthorization(env, `${prefix}/`);

    if (downloadToken) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        const authorizedUrl = `${baseUrl}${separator}Authorization=${encodeURIComponent(downloadToken)}`;
        return new Response(null, {
            status: 302,
            headers: {
                Location: authorizedUrl,
                'Content-Type': 'application/vnd.android.package-archive',
                'Cache-Control': cacheControl,
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'X-Moran-Apk-Source': 'b2-authorized',
                ...APK_CORS_HEADERS
            }
        });
    }

    // Fallback: public bucket direct redirect (backward compatible)
    return new Response(null, {
        status: 302,
        headers: {
            Location: baseUrl,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'X-Moran-Apk-Source': 'b2-redirect',
            ...APK_CORS_HEADERS
        }
    });
};

// ---------- OneDrive APK fallback (via OpenList proxy) ----------

const ONEDRIVE_APK_DIR = '/Onedrive/MoRanJiangHu/releases';
const ONEDRIVE_APK_FILE = 'latest.apk';
// ⚠️ 夸克 APK 目录：历史上读的是 /夸克TV，但那个挂载用的是 QuarkTV driver ——
// 它既要扫码换 refresh token（无法无头续期），又是 NoUpload（APK 根本传不进去），
// 所以那条链路从未有过可用产物。2026-09-19 起改读 /夸克：Quark driver + 网页 cookie，
// 支持上传、可正常签发下载签名。
// 对外 provider 键仍是 'quark-tv'（不改动，避免破坏老客户端与既有的下载统计口径）。
const QUARK_APK_DIR = '/夸克/MoRanJiangHu/releases';
const FULLSTACK_APK_ROOT = '/全栈云盘/MoRanJiangHu';
const ONEDRIVE_SIGN_CACHE_CONTROL = 'public, max-age=3600';
const DEFAULT_OPENLIST_PUBLIC_BASE_URL = 'https://openlist.bacon.de5.net';
const DEFAULT_OPENLIST_DIRECT_BASE_URL = 'http://159.138.7.126:5244';

const trimBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const readOpenListPublicBaseUrl = (env: any): string => trimBaseUrl(
    readEnvString(env, 'MORAN_OPENLIST_PUBLIC_BASE_URL')
    || readEnvString(env, 'MORAN_OPENLIST_BASE_URL', DEFAULT_OPENLIST_PUBLIC_BASE_URL)
);

const readOpenListApiBaseUrl = (env: any): string => trimBaseUrl(
    readEnvString(env, 'MORAN_OPENLIST_API_BASE_URL')
    || readEnvString(env, 'MORAN_OPENLIST_BASE_URL', DEFAULT_OPENLIST_PUBLIC_BASE_URL)
);

const readOpenListDirectBaseUrl = (env: any): string => trimBaseUrl(
    readEnvString(env, 'MORAN_OPENLIST_DIRECT_BASE_URL')
    || readEnvString(env, 'MORAN_OPENLIST_API_BASE_URL')
    || DEFAULT_OPENLIST_DIRECT_BASE_URL
);

const readOpenListApiBaseUrlCandidates = (env: any): string[] => {
    const candidates = [
        readOpenListApiBaseUrl(env),
        readOpenListPublicBaseUrl(env),
        DEFAULT_OPENLIST_PUBLIC_BASE_URL
    ].map(trimBaseUrl).filter(Boolean);
    return Array.from(new Set(candidates));
};

const fetchOpenListFileSign = async (
    env: any,
    directory: string,
    storageFileName: string
): Promise<string | null> => {
    const authToken = env?.MORAN_OPENLIST_AUTH_TOKEN;
    if (!authToken) return null;
    for (const baseUrl of readOpenListApiBaseUrlCandidates(env)) {
        try {
            const response = await fetch(`${baseUrl}/api/fs/list`, {
                method: 'POST',
                headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: directory, password: '', page: 1, per_page: 100, refresh: false }),
            });
            if (!response.ok) continue;
            const json = await response.json() as any;
            if (json?.code !== 200 || !Array.isArray(json?.data?.content)) continue;
            const apkItem = json.data.content.find(
                (item: any) => item?.name === storageFileName && !item?.is_dir && item?.sign
            );
            if (apkItem?.sign) return apkItem.sign;
        } catch {
            // Try the next OpenList API base. The final download URL still follows the requested provider.
        }
    }
    return null;
};

const fetchOneDriveApkSign = async (env: any): Promise<string | null> => (
    fetchOpenListFileSign(env, ONEDRIVE_APK_DIR, ONEDRIVE_APK_FILE)
);

export const buildQuarkTvApkRedirect = async (
    env: any,
    storageFileName: string,
    downloadFileName: string,
    cacheControl = APK_LATEST_CACHE_CONTROL
): Promise<Response | null> => {
    const sign = await fetchOpenListFileSign(env, QUARK_APK_DIR, storageFileName);
    if (!sign) return null;
    const encodedPath = QUARK_APK_DIR
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
    const baseUrl = readOpenListPublicBaseUrl(env);
    return new Response(null, {
        status: 302,
        headers: {
            Location: `${baseUrl}/d/${encodedPath}/${encodeURIComponent(storageFileName)}?sign=${encodeURIComponent(sign)}`,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${downloadFileName}"`,
            'X-Moran-Apk-Source': 'quark-tv',
            ...APK_CORS_HEADERS
        }
    });
};

export const buildFullstackApkRedirect = async (
    env: any,
    storageFileName: string,
    downloadFileName: string,
    cacheControl = APK_LATEST_CACHE_CONTROL
): Promise<Response | null> => {
    const directory = `${FULLSTACK_APK_ROOT}/releases`;
    const sign = await fetchOpenListFileSign(env, directory, storageFileName);
    if (!sign) return null;
    const encodedPath = directory
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
    const baseUrl = readOpenListPublicBaseUrl(env);
    return new Response(null, {
        status: 302,
        headers: {
            Location: `${baseUrl}/d/${encodedPath}/${encodeURIComponent(storageFileName)}?sign=${encodeURIComponent(sign)}`,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${downloadFileName}"`,
            'X-Moran-Apk-Source': 'fullstack',
            ...APK_CORS_HEADERS
        }
    });
};

export const buildVpsApkRedirect = (
    env: any,
    storageFileName: string,
    downloadFileName: string,
    cacheControl = APK_LATEST_CACHE_CONTROL
): Response => {
    const baseUrl = readEnvString(env, 'MORAN_VPS_APK_BASE_URL', 'https://moranjianghu.bacon159.pp.ua').replace(/\/+$/, '');
    return new Response(null, {
        status: 302,
        headers: {
            Location: `${baseUrl}/${encodeURIComponent(storageFileName)}`,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${downloadFileName}"`,
            'X-Moran-Apk-Source': 'vps',
            ...APK_CORS_HEADERS
        }
    });
};

export const buildOneDriveApkRedirect = async (
    env: any,
    fileName: string,
    cacheControl = APK_LATEST_CACHE_CONTROL,
    mode: 'public' | 'direct' = 'public'
): Promise<Response | null> => {
    const sign = await fetchOneDriveApkSign(env);
    if (!sign) return null;
    const baseUrl = mode === 'direct' ? readOpenListDirectBaseUrl(env) : readOpenListPublicBaseUrl(env);
    const proxyUrl = `${baseUrl}/d${ONEDRIVE_APK_DIR}/${ONEDRIVE_APK_FILE}?sign=${encodeURIComponent(sign)}`;
    return new Response(null, {
        status: 302,
        headers: {
            Location: proxyUrl,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'X-Moran-Apk-Source': mode === 'direct' ? 'onedrive-direct-proxy' : 'onedrive-proxy',
            ...APK_CORS_HEADERS
        }
    });
};

// ---------- GitHub Releases APK channel ----------

const GITHUB_REPO_OWNER = 'ypq123456789';
const GITHUB_REPO_NAME = 'MoRanJiangHu';
const GITHUB_RAW_APK_BRANCH = 'apk-dist';
const DEFAULT_GITHUB_RAW_ACCELERATOR = 'https://cloudflare-proxy-6rw.pages.dev';

// 国内直连 github.com release 下载极慢（实测约 15KB/s，常超时），因此默认经加速镜像代理。
// 首选镜像可用环境变量 MORAN_GITHUB_RELEASE_ACCELERATOR 覆盖；设为空字符串则回退裸 github.com 直链。
const DEFAULT_GITHUB_RELEASE_ACCELERATOR = 'https://gh.ddlc.top';

const buildGitHubReleaseDirectUrl = (safeVersion: string, fileName: string): string => (
    `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/download/v${safeVersion}/${fileName}`
);

/**
 * 构建 GitHub Release 下载 URL（零延迟，无需 API 调用）。
 * 默认经国内加速镜像代理（gh.ddlc.top），可用 env.MORAN_GITHUB_RELEASE_ACCELERATOR 覆盖，
 * 显式传入空字符串镜像则回退到裸 github.com 直链。
 * 如果版本名无效则返回 null。
 */
export const buildGitHubApkRedirect = (
    versionName: string,
    fileName: string,
    cacheControl = APK_VERSIONED_CACHE_CONTROL,
    accelerator: string | undefined = DEFAULT_GITHUB_RELEASE_ACCELERATOR
): Response | null => {
    const safeVersion = typeof versionName === 'string'
        ? versionName.trim().replace(/[^0-9A-Za-z._-]/g, '')
        : '';
    if (!safeVersion) return null;

    const directUrl = buildGitHubReleaseDirectUrl(safeVersion, fileName);
    const normalizedAccelerator = typeof accelerator === 'string' ? accelerator.trim().replace(/\/+$/, '') : '';
    const downloadUrl = normalizedAccelerator && /^https:\/\/[^/]+$/i.test(normalizedAccelerator)
        ? `${normalizedAccelerator}/${directUrl}`
        : directUrl;

    return new Response(null, {
        status: 302,
        headers: {
            Location: downloadUrl,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'X-Moran-Apk-Source': normalizedAccelerator ? 'github-release-accelerated' : 'github-release',
            ...APK_CORS_HEADERS
        },
    });
};

const buildGitHubRawDirectUrl = (fileName: string): string => (
    `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_RAW_APK_BRANCH}/releases/${fileName}`
);

export const buildGitHubRawApkRedirect = (
    fileName: string,
    cacheControl = APK_VERSIONED_CACHE_CONTROL,
    accelerator: string | undefined = DEFAULT_GITHUB_RAW_ACCELERATOR
): Response | null => {
    if (!/^MoRanJiangHu-v[0-9A-Za-z._-]+\.apk$/.test(fileName)) return null;
    const directUrl = buildGitHubRawDirectUrl(fileName);
    const normalizedAccelerator = typeof accelerator === 'string' ? accelerator.trim().replace(/\/+$/, '') : '';
    const downloadUrl = normalizedAccelerator && /^https:\/\/[^/]+$/i.test(normalizedAccelerator)
        ? `${normalizedAccelerator}/${directUrl}`
        : directUrl;

    return new Response(null, {
        status: 302,
        headers: {
            Location: downloadUrl,
            'Content-Type': 'application/vnd.android.package-archive',
            'Cache-Control': cacheControl,
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'X-Moran-Apk-Source': normalizedAccelerator ? 'github-raw-accelerated' : 'github-raw',
            ...APK_CORS_HEADERS
        },
    });
};

const parseVersionParts = (value: unknown): number[] => (
    String(value || '')
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map((part) => Number(part) || 0)
);

const compareVersionNames = (left: unknown, right: unknown): number => {
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

const compareManifestPayloads = (left: any, right: any): number => {
    const leftLatest = left?.latest || left || {};
    const rightLatest = right?.latest || right || {};
    const leftCode = Number(leftLatest.versionCode || 0);
    const rightCode = Number(rightLatest.versionCode || 0);

    if (leftCode > rightCode) return 1;
    if (leftCode < rightCode) return -1;
    return compareVersionNames(leftLatest.versionName, rightLatest.versionName);
};

type ManifestCandidate = {
    payload: any;
    sourceHeaders: Headers;
    etag?: string;
    source: 'kv' | 's3' | 'r2';
};

const KV_MANIFEST_KEY = 'release-manifest/latest.json';

export const readManifestPayload = async (env: any): Promise<{ payload: any; sourceHeaders: Headers; etag?: string } | null> => {
    // Primary and only source: Cloudflare KV.
    if (env?.RELEASE_MANIFEST) {
        try {
            const kvValue = await env.RELEASE_MANIFEST.get(KV_MANIFEST_KEY, 'json');
            if (kvValue) {
                return {
                    payload: kvValue,
                    sourceHeaders: new Headers({ 'Content-Type': 'application/json; charset=utf-8' }),
                    source: 'kv'
                };
            }
        } catch (kvError) {
            console.warn('APK manifest KV read failed:', kvError);
        }
    }
    return null;
};
