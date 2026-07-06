import { tryDbBucket } from '../_shared/dbStore';

const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Headers': 'Content-Type, Authorization'
};

const WORKSHOP_PREFIX = 'moranjianghu/workshop/novel-decomposition';
const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_D1_ZIP_FALLBACK_BYTES = 4 * 1024 * 1024;
const OPENLIST_METADATA_TIMEOUT_MS = 12_000;
const OPENLIST_DOWNLOAD_TIMEOUT_MS = 180_000;
const OPENLIST_DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const OPENLIST_UPLOAD_PART_BYTES = 2 * 1024 * 1024;
const CHINA_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const encoder = new TextEncoder();

type OneDrivePart = {
    index: number;
    path: string;
    size: number;
    sha256?: string;
};

type WorkshopEntry = {
    id: string;
    title: string;
    workName: string;
    contributor: string;
    note: string;
    createdAt: string;
    updatedAt: string;
    fileName: string;
    size: number;
    sha256: string;
    chapterCount: number;
    segmentCount: number;
    sourceType: string;
    tags: string[];
    r2Key: string;
    hi168Key?: string;
    hi168Url?: string;
    /** When the ZIP is stored on OneDrive, this holds the OpenList path. */
    oneDrivePath?: string;
    /** Large ZIP fallback: the original ZIP split into ordered OneDrive parts. */
    oneDriveParts?: OneDrivePart[];
    ownerUserId?: string;
    ownerUsername?: string;
    anonymous?: boolean;
};

type CloudPlayUser = {
    userId: string;
    username: string;
    usernameKey: string;
    passwordSalt: string;
    passwordHash: string;
};

const jsonResponse = (payload: unknown, status = 200): Response => (
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...CORS_HEADERS,
            'Cache-Control': 'no-store'
        }
    })
);

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const getBucket = (env: any): any => {
    const dbBucket = tryDbBucket(env, 'workshop_novel_data');
    if (dbBucket) return dbBucket;
    const candidate = env?.WORKSHOP_R2 || env?.CNB_SYNC_R2;
    if (!candidate || typeof candidate.get !== 'function' || typeof candidate.put !== 'function') return null;
    return candidate;
};

/** Auth bucket reads from the same store as cloud-play user registration. */
const getAuthBucket = (env: any): any => {
    const dbBucket = tryDbBucket(env, 'cloud_play_data');
    if (dbBucket) return dbBucket;
    const candidate = env?.CLOUD_PLAY_R2 || env?.CNB_SYNC_R2;
    if (!candidate || typeof candidate.get !== 'function' || typeof candidate.put !== 'function') return null;
    return candidate;
};

// ---------------------------------------------------------------------------
// OneDrive helpers (via OpenList proxy)
// ---------------------------------------------------------------------------

const DEFAULT_OPENLIST_BASE = 'https://openlist.bacon.de5.net';
const DEFAULT_OPENLIST_API_BASE = 'http://159.138.7.126:5244';
const ONEDRIVE_WORKSHOP_ROOT = '/Onedrive/MoRanJiangHu/workshop/novel-decomposition';

const getOpenListToken = (env: any): string => readString(env?.MORAN_OPENLIST_AUTH_TOKEN);

const normalizeOpenListBase = (value: unknown, fallback = DEFAULT_OPENLIST_BASE): string => {
    const base = (readString(value) || fallback).replace(/\/+$/, '');
    return base || DEFAULT_OPENLIST_BASE;
};

const getOpenListApiBase = (env: any): string => normalizeOpenListBase(
    env?.MORAN_OPENLIST_API_BASE_URL,
    DEFAULT_OPENLIST_API_BASE
);

const getOpenListPublicBase = (env: any): string => normalizeOpenListBase(
    env?.MORAN_OPENLIST_PUBLIC_BASE_URL || env?.MORAN_OPENLIST_BASE_URL,
    DEFAULT_OPENLIST_BASE
);

const getOpenListSigningApiBases = (env: any): string[] => {
    const candidates = [
        getOpenListApiBase(env),
        normalizeOpenListBase(env?.MORAN_OPENLIST_BASE_URL, getOpenListPublicBase(env)),
        getOpenListPublicBase(env)
    ];
    return Array.from(new Set(candidates.filter(Boolean)));
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const encodeOpenListPath = (path: string): string => (
    path
        .split('/')
        .map((part, index) => (index === 0 ? '' : encodeURIComponent(part)))
        .join('/')
);

const toStableOpenListDownloadUrl = (url: string): string => {
    const text = readString(url);
    if (!text) return '';
    try {
        const parsed = new URL(text);
        if (parsed.pathname.startsWith('/p/')) {
            parsed.pathname = `/d/${parsed.pathname.slice(3)}`;
        }
        return parsed.toString();
    } catch {
        return text.replace(/\/p\//, '/d/');
    }
};

const buildSignedOpenListDownloadUrl = (base: string, oneDrivePath: string, sign: string): string => (
    `${base}/d${encodeOpenListPath(oneDrivePath)}?sign=${encodeURIComponent(sign)}`
);

const appendUnique = (target: string[], value: string): void => {
    const text = readString(value);
    if (text && !target.includes(text)) target.push(text);
};

const appendOpenListBaseCandidate = (target: string[], value: unknown): void => {
    const text = readString(value);
    if (text) appendUnique(target, normalizeOpenListBase(text));
};

const getOpenListUploadApiBases = (env: any): string[] => {
    const candidates: string[] = [];
    appendUnique(candidates, getOpenListApiBase(env));
    appendOpenListBaseCandidate(candidates, env?.MORAN_OPENLIST_DIRECT_BASE_URL);
    appendOpenListBaseCandidate(candidates, env?.MORAN_OPENLIST_BASE_URL);
    appendOpenListBaseCandidate(candidates, env?.MORAN_OPENLIST_PUBLIC_BASE_URL);
    appendUnique(candidates, getOpenListPublicBase(env));
    appendUnique(candidates, DEFAULT_OPENLIST_BASE);
    return candidates;
};

type OpenListDownloadBytes = {
    response: Response;
    bytes: Uint8Array;
};

type ParsedContentRange = {
    start: number;
    end: number;
    total: number;
};

const parseContentRange = (value: string | null): ParsedContentRange | null => {
    const match = readString(value).match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total)) return null;
    if (start < 0 || end < start || total <= 0 || end >= total) return null;
    return { start, end, total };
};

const isZipDownloadResponse = (response: Response): boolean => {
    if (!response.ok && response.status !== 206) return false;
    const contentType = response.headers.get('Content-Type') || '';
    return !/text\/html|application\/json/i.test(contentType);
};

const fetchOpenListDownloadBytes = async (
    downloadUrl: string,
    headers?: Record<string, string>
): Promise<OpenListDownloadBytes> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENLIST_DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(downloadUrl, {
            headers,
            signal: controller.signal
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { response, bytes };
    } finally {
        clearTimeout(timeout);
    }
};

const mergeZipChunks = (chunks: Uint8Array[], totalBytes: number): Uint8Array => {
    if (totalBytes <= 0 || totalBytes > MAX_ZIP_BYTES) throw new Error('OneDrive ZIP 大小超出限制');
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        if (chunk.byteLength <= 0) throw new Error('OneDrive ZIP 分片为空');
        if (offset + chunk.byteLength > totalBytes) throw new Error('OneDrive ZIP 分片大小异常');
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    if (offset !== totalBytes) throw new Error('OneDrive ZIP 分片未完整下载');
    return merged;
};

const downloadOneDriveZipByRanges = async (downloadUrl: string): Promise<Uint8Array | null> => {
    const firstEnd = OPENLIST_DOWNLOAD_CHUNK_BYTES - 1;
    const first = await fetchOpenListDownloadBytes(downloadUrl, { Range: `bytes=0-${firstEnd}` });
    if (!isZipDownloadResponse(first.response)) return null;
    if (first.bytes.byteLength <= 0) throw new Error('OneDrive ZIP 响应为空');
    if (first.response.status === 200) return first.bytes;
    if (first.response.status !== 206) return null;

    const firstRange = parseContentRange(first.response.headers.get('Content-Range'));
    if (!firstRange || firstRange.start !== 0) return null;
    if (firstRange.total > MAX_ZIP_BYTES) throw new Error('OneDrive ZIP 过大');
    const expectedFirstLength = firstRange.end - firstRange.start + 1;
    if (first.bytes.byteLength !== expectedFirstLength) throw new Error('OneDrive ZIP 首分片大小不匹配');

    const chunks: Uint8Array[] = [first.bytes];
    let nextStart = firstRange.end + 1;
    while (nextStart < firstRange.total) {
        const nextEnd = Math.min(firstRange.total - 1, nextStart + OPENLIST_DOWNLOAD_CHUNK_BYTES - 1);
        const part = await fetchOpenListDownloadBytes(downloadUrl, { Range: `bytes=${nextStart}-${nextEnd}` });
        if (!isZipDownloadResponse(part.response) || part.response.status !== 206) {
            throw new Error('OneDrive ZIP 分片下载失败');
        }
        const range = parseContentRange(part.response.headers.get('Content-Range'));
        if (!range || range.start !== nextStart || range.total !== firstRange.total) {
            throw new Error('OneDrive ZIP 分片范围异常');
        }
        const expectedLength = range.end - range.start + 1;
        if (part.bytes.byteLength !== expectedLength) throw new Error('OneDrive ZIP 分片大小不匹配');
        chunks.push(part.bytes);
        nextStart = range.end + 1;
    }

    return mergeZipChunks(chunks, firstRange.total);
};

const downloadOneDriveZipBytes = async (downloadUrl: string): Promise<Uint8Array> => {
    const ranged = await downloadOneDriveZipByRanges(downloadUrl);
    if (ranged && ranged.byteLength > 0) return ranged;

    // Range is not supported by this endpoint; use a single buffered read as a compatibility fallback.
    const full = await fetchOpenListDownloadBytes(downloadUrl);
    if (!isZipDownloadResponse(full.response) || full.bytes.byteLength <= 0) {
        throw new Error('OneDrive ZIP 下载响应无效');
    }
    if (full.bytes.byteLength > MAX_ZIP_BYTES) throw new Error('OneDrive ZIP 过大');
    return full.bytes;
};

const downloadOneDrivePathBytes = async (env: any, oneDrivePath: string): Promise<Uint8Array | null> => {
    const downloadUrls = await getOneDriveDownloadCandidates(env, oneDrivePath);
    for (const downloadUrl of downloadUrls) {
        try {
            return await downloadOneDriveZipBytes(downloadUrl);
        } catch {
            // Try the next signed URL candidate.
        }
    }
    return null;
};

/**
 * Upload a ZIP to OneDrive via OpenList PUT API.
 * Returns the OneDrive path on success, empty string on failure.
 */
const describeOpenListUploadFailure = (response: Response, text: string, payload: any): string => {
    const detail = readString(payload?.message)
        || readString(payload?.error)
        || readString(payload?.data?.message)
        || readString(payload?.data?.error)
        || readString(text).slice(0, 240)
        || `HTTP ${response.status}`;
    return `OpenList 上传失败：HTTP ${response.status}${payload?.code ? ` / code ${payload.code}` : ''}，${detail}`;
};

type OneDrivePutResult = {
    ok: boolean;
    path?: string;
    parts?: OneDrivePart[];
    error?: string;
};

const putBytesToOneDrive = async (
    env: any,
    oneDrivePath: string,
    bytes: Uint8Array,
    contentType: string
): Promise<OneDrivePutResult> => {
    const token = getOpenListToken(env);
    if (!token) return { ok: false, error: '缺少 MORAN_OPENLIST_AUTH_TOKEN' };
    const failures: string[] = [];
    const apiBases = getOpenListUploadApiBases(env);
    for (const apiBase of apiBases) {
        try {
            const response = await fetch(`${apiBase}/api/fs/put`, {
                method: 'PUT',
                headers: {
                    'Authorization': token,
                    'Content-Type': contentType,
                    'File-Path': oneDrivePath
                },
                body: bytes
            });
            const text = await response.text().catch(() => '');
            let payload: any = null;
            try {
                payload = text ? JSON.parse(text) : null;
            } catch {
                failures.push(`OpenList 上传返回非 JSON：HTTP ${response.status}，${text.slice(0, 240) || '空响应'}`);
                continue;
            }
            if (!response.ok || payload?.code !== 200) {
                failures.push(describeOpenListUploadFailure(response, text, payload));
                continue;
            }
            return { ok: true, path: oneDrivePath };
        } catch (error: any) {
            failures.push(`OpenList 上传请求异常：${error?.message || error || '未知错误'}`);
        }
    }
    const uniqueFailures = Array.from(new Set(failures.filter(Boolean)));
    const error = uniqueFailures.length > 1
        ? `OpenList 上传失败（已尝试 ${apiBases.length} 个入口）：${uniqueFailures.join('；')}`
        : (uniqueFailures[0] || 'OpenList 上传失败：未知错误');
    return { ok: false, error };
};

const putToOneDrive = async (env: any, oneDrivePath: string, zipBytes: Uint8Array): Promise<OneDrivePutResult> => (
    putBytesToOneDrive(env, oneDrivePath, zipBytes, 'application/zip')
);

const buildOneDrivePartPath = (oneDrivePath: string, partIndex: number): string => {
    const lastSlash = oneDrivePath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? oneDrivePath.slice(0, lastSlash) : oneDrivePath;
    const partName = `part-${String(partIndex + 1).padStart(4, '0')}.bin`;
    return `${dir}/parts/${partName}`;
};

const putToOneDriveParts = async (
    env: any,
    oneDrivePath: string,
    zipBytes: Uint8Array
): Promise<OneDrivePutResult> => {
    const parts: OneDrivePart[] = [];
    const totalParts = Math.ceil(zipBytes.byteLength / OPENLIST_UPLOAD_PART_BYTES);
    for (let index = 0; index < totalParts; index += 1) {
        const start = index * OPENLIST_UPLOAD_PART_BYTES;
        const end = Math.min(zipBytes.byteLength, start + OPENLIST_UPLOAD_PART_BYTES);
        const partBytes = zipBytes.subarray(start, end);
        const partPath = buildOneDrivePartPath(oneDrivePath, index);
        const result = await putBytesToOneDrive(env, partPath, partBytes, 'application/octet-stream');
        if (!result.ok) {
            return {
                ok: false,
                error: `OpenList 分片上传失败：第 ${index + 1}/${totalParts} 片。${result.error || '未知错误'}`
            };
        }
        parts.push({
            index,
            path: partPath,
            size: partBytes.byteLength,
            sha256: await sha256HexBytes(partBytes)
        });
    }
    return { ok: true, parts };
};

/**
 * Get signed download URL candidates for a file on OneDrive via OpenList.
 * Prefer /api/fs/get raw_url because it is the same URL OpenList has already
 * prepared for the storage provider. Fall back to directory signing.
 */
const getOneDriveDownloadCandidates = async (env: any, oneDrivePath: string): Promise<string[]> => {
    const token = getOpenListToken(env);
    if (!token) return [];
    const candidates: string[] = [];

    for (const apiBase of getOpenListSigningApiBases(env)) {
        try {
            const getResp = await fetchWithTimeout(`${apiBase}/api/fs/get`, {
                method: 'POST',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: oneDrivePath, password: '' })
            }, OPENLIST_METADATA_TIMEOUT_MS);
            if (!getResp.ok) continue;
            const getData: any = await getResp.json().catch(() => null);
            if (getData?.code !== 200 || getData?.data?.is_dir) continue;
            appendUnique(candidates, toStableOpenListDownloadUrl(readString(getData?.data?.raw_url)));
            const sign = readString(getData?.data?.sign);
            if (sign) appendUnique(candidates, buildSignedOpenListDownloadUrl(apiBase, oneDrivePath, sign));
            if (candidates.length > 0) return candidates;
        } catch {
            // Try the next metadata endpoint.
        }
    }

    // Extract the parent directory and filename.
    const lastSlash = oneDrivePath.lastIndexOf('/');
    const dir = oneDrivePath.substring(0, lastSlash);
    const fileName = oneDrivePath.substring(lastSlash + 1);

    for (const apiBase of getOpenListSigningApiBases(env)) {
        try {
            // List the directory to get the sign value for the file. Uploads use the
            // direct origin, but this lightweight signing request can safely fall back
            // to the public OpenList domain when Workers cannot reach the origin.
            const listResp = await fetchWithTimeout(`${apiBase}/api/fs/list`, {
                method: 'POST',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: dir, password: '', page: 1, per_page: 200, refresh: true })
            }, OPENLIST_METADATA_TIMEOUT_MS);
            if (!listResp.ok) continue;
            const listData: any = await listResp.json();
            if (listData?.code !== 200) continue;
            const content = listData?.data?.content;
            if (!Array.isArray(content)) continue;
            const fileEntry = content.find((item: any) => item.name === fileName && !item.is_dir);
            if (!fileEntry?.sign) continue;
            appendUnique(candidates, buildSignedOpenListDownloadUrl(apiBase, oneDrivePath, String(fileEntry.sign)));
            return candidates;
        } catch {
            // Try the next signing endpoint.
        }
    }
    return candidates;
};

const proxyOneDriveZip = async (
    env: any,
    oneDrivePath: string,
    zipHeaders: Record<string, string>
): Promise<Response | null> => {
    const downloadUrls = await getOneDriveDownloadCandidates(env, oneDrivePath);
    for (const downloadUrl of downloadUrls) {
        try {
            const zipBytes = await downloadOneDriveZipBytes(downloadUrl);
            const headers = new Headers(zipHeaders);
            headers.set('Content-Length', String(zipBytes.byteLength));
            return new Response(zipBytes, { status: 200, headers });
        } catch {
            // Try the next download URL candidate.
        }
    }
    return null;
};

const proxyOneDrivePartZip = async (
    env: any,
    parts: OneDrivePart[],
    expectedSize: number,
    expectedSha256: string,
    zipHeaders: Record<string, string>
): Promise<Response | null> => {
    const orderedParts = [...parts]
        .filter((part) => readString(part?.path) && Number.isFinite(Number(part?.index)))
        .sort((left, right) => Number(left.index) - Number(right.index));
    if (orderedParts.length <= 0) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (const part of orderedParts) {
        const chunk = await downloadOneDrivePathBytes(env, part.path);
        if (!chunk || chunk.byteLength <= 0) return null;
        if (Number(part.size) > 0 && chunk.byteLength !== Number(part.size)) return null;
        if (part.sha256) {
            const partSha = await sha256HexBytes(chunk);
            if (partSha !== part.sha256) return null;
        }
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_ZIP_BYTES) return null;
    }

    if (Number(expectedSize) > 0 && totalBytes !== Number(expectedSize)) return null;
    const zipBytes = mergeZipChunks(chunks, totalBytes);
    if (expectedSha256) {
        const actualSha = await sha256HexBytes(zipBytes);
        if (actualSha !== expectedSha256) return null;
    }
    const headers = new Headers(zipHeaders);
    headers.set('Content-Length', String(zipBytes.byteLength));
    return new Response(zipBytes, { status: 200, headers });
};

const getPrefix = (env: any): string => (
    readString(env?.WORKSHOP_NOVEL_DECOMPOSITION_PREFIX) || WORKSHOP_PREFIX
).replace(/^\/+|\/+$/g, '') || WORKSHOP_PREFIX;

const getChinaDateKey = (date = new Date()): string => (
    new Date(date.getTime() + CHINA_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10)
);

const buildOneDriveWorkshopPath = (id: string, createdAt: string): string => (
    `${ONEDRIVE_WORKSHOP_ROOT}/packages/${getChinaDateKey(new Date(createdAt))}/${id}/${id}.zip`
);

const sanitizeFilename = (value: unknown, fallback: string): string => {
    const safe = readString(value)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
    return (safe || fallback).replace(/\.zip$/i, '') + '.zip';
};

const sanitizeText = (value: unknown, maxLength: number): string => readString(value).replace(/\s+/g, ' ').slice(0, maxLength);

const normalizeWorkTitle = (value: unknown, maxLength = 80): string => {
    const text = sanitizeText(value, maxLength * 2);
    const bracketMatch = text.match(/《\s*([^《》]{1,120}?)\s*》/);
    const candidate = bracketMatch?.[1] || text;
    return candidate
        .replace(/[《》]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
};

const decodeBase64 = (value: unknown): Uint8Array => {
    const text = readString(value).replace(/^data:application\/zip;base64,/i, '').replace(/\s+/g, '');
    if (!text) throw new Error('缺少 ZIP 内容');
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.byteLength <= 0) throw new Error('ZIP 内容为空');
    if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('ZIP 过大，请控制在 64MB 以内');
    return bytes;
};

const normalizeZipBytes = (bytes: Uint8Array): Uint8Array => {
    if (bytes.byteLength <= 0) throw new Error('ZIP 内容为空');
    if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('ZIP 过大，请控制在 64MB 以内');
    return bytes;
};

const readZipBytesFromFile = async (value: unknown): Promise<Uint8Array> => {
    if (!value || typeof (value as any).arrayBuffer !== 'function') throw new Error('缺少 ZIP 内容');
    return normalizeZipBytes(new Uint8Array(await (value as any).arrayBuffer()));
};

const parseCreateRequest = async (request: Request): Promise<{ body: any; zipBytes: Uint8Array }> => {
    const contentType = request.headers.get('content-type') || '';
    if (/multipart\/form-data/i.test(contentType)) {
        const form = await request.formData();
        const metadataRaw = readString(form.get('metadata'));
        const body = metadataRaw ? JSON.parse(metadataRaw) : {};
        return {
            body,
            zipBytes: await readZipBytesFromFile(form.get('zip'))
        };
    }
    const body = await request.json();
    return {
        body,
        zipBytes: decodeBase64(body?.zipBase64)
    };
};

const zipBytesToJsonArray = (bytes: Uint8Array): number[] => Array.from(bytes);

const zipBytesFromStoredPayload = (stored: string): Uint8Array => {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && typeof parsed[0] === 'number') {
        return new Uint8Array(parsed);
    }
    if (parsed && typeof parsed === 'object') {
        const numericKeys = Object.keys(parsed).filter((key) => /^\d+$/.test(key));
        if (numericKeys.length > 0) {
            return new Uint8Array(numericKeys
                .sort((a, b) => Number(a) - Number(b))
                .map((key) => Number(parsed[key]) || 0));
        }
    }
    if (typeof parsed === 'string') {
        return decodeBase64(parsed);
    }
    return decodeBase64(stored);
};

const bytesToHex = (bytes: ArrayBuffer): string => (
    Array.from(new Uint8Array(bytes)).map((item) => item.toString(16).padStart(2, '0')).join('')
);

const sha256HexBytes = async (bytes: Uint8Array): Promise<string> => (
    bytesToHex(await crypto.subtle.digest('SHA-256', bytes))
);

const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
};

const sha256HexText = async (value: string): Promise<string> => (
    bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
);

const hmacHex = async (secret: string, value: string): Promise<string> => {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
};

const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
    return diff === 0;
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

const encodeS3Path = (value: string): string => value
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');

const buildHi168PublicUrl = (env: any, key: string): string => {
    const endpoint = readString(env?.MORAN_OSS_ENDPOINT) || 'https://s3.hi168.com';
    const bucket = readString(env?.MORAN_OSS_BUCKET);
    if (!bucket) return '';
    return `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${encodeS3Path(key)}`;
};

const getCloudPlayPrefix = (env: any): string => (
    readString(env?.CLOUD_PLAY_R2_PREFIX) || 'moranjianghu/cloud-play'
).replace(/^\/+|\/+$/g, '') || 'moranjianghu/cloud-play';

const sanitizeUsername = (value: unknown): string => {
    const username = readString(value).replace(/\s+/g, '');
    if (username.length < 3 || username.length > 32) throw new Error('请先用有效联机用户名登录。');
    if (!/^[\p{L}\p{N}_-]+$/u.test(username)) throw new Error('联机用户名格式无效。');
    return username;
};

const sanitizePassword = (value: unknown): string => {
    const password = typeof value === 'string' ? value : '';
    if (password.length < 6 || password.length > 128) throw new Error('请先用有效联机密码登录。');
    return password;
};

const authenticateWorkshopUser = async (env: any, auth: any): Promise<CloudPlayUser> => {
    const bucket = getAuthBucket(env);
    if (!bucket) throw new Error('创意工坊存储未配置。');
    const username = sanitizeUsername(auth?.username);
    const password = sanitizePassword(auth?.password);
    const usernameKey = await sha256HexText(username.toLowerCase());
    const object = await bucket.get(`${getCloudPlayPrefix(env)}/users/${usernameKey}.json`);
    if (!object) throw new Error('请先登录联机账号后再管理创意工坊投稿。');
    const user = await object.json<CloudPlayUser>().catch(() => null);
    if (!user?.passwordSalt || !user.passwordHash) throw new Error('账号数据损坏。');
    const passwordHash = await hmacHex(user.passwordSalt, `${usernameKey}\n${password}`);
    if (!timingSafeEqual(passwordHash, user.passwordHash)) throw new Error('联机账号或密码错误。');
    return user;
};

const requireOwner = (entry: WorkshopEntry, user: CloudPlayUser): void => {
    if (!entry.ownerUserId) throw new Error('旧版匿名投稿暂不支持在线编辑或删除。');
    if (entry.ownerUserId !== user.userId) throw new Error('只能编辑或删除自己的投稿。');
};

const putHi168Object = async (env: any, key: string, body: Uint8Array | string, contentType: string): Promise<string> => {
    const endpoint = readString(env?.MORAN_OSS_ENDPOINT) || 'https://s3.hi168.com';
    const bucket = readString(env?.MORAN_OSS_BUCKET);
    const accessKey = readString(env?.MORAN_OSS_ACCESS_KEY);
    const secretKey = readString(env?.MORAN_OSS_SECRET_KEY);
    if (!bucket || !accessKey || !secretKey) return '';

    const target = new URL(`${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${encodeS3Path(key)}`);
    const bodyBytes = typeof body === 'string' ? encoder.encode(body) : body;
    const bodyHash = await sha256HexBytes(bodyBytes);
    const { amzDate, dateStamp } = formatAmzDate(new Date());
    const region = readString(env?.MORAN_OSS_REGION) || 'auto';
    const service = 's3';
    const canonicalHeaders = [
        `content-type:${contentType}\n`,
        `host:${target.host}\n`,
        `x-amz-content-sha256:${bodyHash}\n`,
        `x-amz-date:${amzDate}\n`
    ].join('');
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = ['PUT', target.pathname, '', canonicalHeaders, signedHeaders, bodyHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256HexText(canonicalRequest)].join('\n');
    const signingKey = await deriveSigningKey(secretKey, dateStamp, region, service);
    const signature = bytesToHex(await hmac(signingKey, stringToSign));

    const response = await fetch(target, {
        method: 'PUT',
        headers: {
            'Content-Type': contentType,
            'x-amz-content-sha256': bodyHash,
            'x-amz-date': amzDate,
            Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        },
        body: bodyBytes
    });
    if (!response.ok) throw new Error(`hi168 上传失败：${response.status} ${await response.text().catch(() => '')}`);
    return buildHi168PublicUrl(env, key);
};

const buildId = (): string => {
    const random = crypto.getRandomValues(new Uint8Array(5));
    const suffix = Array.from(random).map((byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
    const stamp = new Date(Date.now() + CHINA_TIMEZONE_OFFSET_MS).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    return `NDW-${stamp}-${suffix}`;
};

const buildKeys = (env: any, id: string, createdAt: string, fileName: string) => {
    const prefix = getPrefix(env);
    const [year, month, day] = getChinaDateKey(new Date(createdAt)).split('-');
    const base = `${prefix}/packages/${year}/${month}/${day}/${id}`;
    return {
        zipKey: `${base}/${fileName}`,
        docKey: `${prefix}/entries/${id}.json`,
        indexKey: `${prefix}/index/latest.json`
    };
};

const readIndex = async (env: any): Promise<WorkshopEntry[]> => {
    const bucket = getBucket(env);
    if (!bucket) return [];
    const object = await bucket.get(`${getPrefix(env)}/index/latest.json`);
    if (!object) return [];
    const parsed = await object.json<{ entries?: WorkshopEntry[] }>().catch(() => null);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
};

const writeIndex = async (env: any, entries: WorkshopEntry[]): Promise<void> => {
    const bucket = getBucket(env);
    if (!bucket) return;
    const payload = JSON.stringify({ schema: 'moranjianghu-novel-decomposition-workshop', version: 1, updatedAt: new Date().toISOString(), entries }, null, 2);
    await bucket.put(`${getPrefix(env)}/index/latest.json`, payload, {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store,no-cache,max-age=0,must-revalidate' }
    });
    await putHi168Object(env, `${getPrefix(env)}/index/latest.json`, payload, 'application/json; charset=utf-8').catch(() => '');
};

export function onRequestOptions(): Response {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }: any): Promise<Response> {
    try {
        const url = new URL(request.url);
        const action = readString(url.searchParams.get('action'));
        if (action === 'download') {
            const id = readString(url.searchParams.get('id'));
            const entries = await readIndex(env);
            const entry = entries.find((item) => item.id === id);
            if (!entry) return jsonResponse({ error: '未找到该创意工坊模块' }, 404);

            const zipHeaders = {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${entry.fileName.replace(/"/g, '')}"`,
                'Cache-Control': 'public, max-age=300',
                ...CORS_HEADERS
            };

            // 1. Try OneDrive part download for large ZIPs that were uploaded in chunks.
            if (Array.isArray(entry.oneDriveParts) && entry.oneDriveParts.length > 0) {
                const proxied = await proxyOneDrivePartZip(env, entry.oneDriveParts, entry.size, entry.sha256, zipHeaders);
                if (proxied) return proxied;
                // Part download failed — fall through to legacy/full ZIP paths.
            }

            // 2. Try OneDrive proxy download (for entries with oneDrivePath).
            if (entry.oneDrivePath) {
                const proxied = await proxyOneDriveZip(env, entry.oneDrivePath, zipHeaders);
                if (proxied) return proxied;
                // OneDrive signed URL failed — fall through to D1.
            }

            // 3. Try D1-backed bucket.
            const bucket = getBucket(env);
            const object = bucket ? await bucket.get(entry.r2Key) : null;

            if (object?.body) {
                // R2 bucket returns a readable body stream directly.
                return new Response(object.body, { headers: zipHeaders });
            }

            if (object) {
                // D1-backed bucket stores body as null; reconstruct binary from text value.
                const stored = await object.text();
                let zipBytes: Uint8Array;
                try {
                    zipBytes = zipBytesFromStoredPayload(stored);
                } catch {
                    zipBytes = decodeBase64(stored);
                }
                return new Response(zipBytes, { headers: zipHeaders });
            }

            // 4. Last resort: if entry has OneDrive metadata but D1 fetch also failed,
            //    try OneDrive signing + same-origin proxy once more (rare edge case).
            if (Array.isArray(entry.oneDriveParts) && entry.oneDriveParts.length > 0) {
                const proxied = await proxyOneDrivePartZip(env, entry.oneDriveParts, entry.size, entry.sha256, zipHeaders);
                if (proxied) return proxied;
            }
            if (entry.oneDrivePath) {
                const proxied = await proxyOneDriveZip(env, entry.oneDrivePath, zipHeaders);
                if (proxied) return proxied;
            }

            return jsonResponse({ error: '模块 ZIP 暂不可下载' }, 404);
        }
        return jsonResponse({ ok: true, entries: await readIndex(env) });
    } catch (error: any) {
        return jsonResponse({ error: error?.message || '读取创意工坊失败' }, 500);
    }
}

export async function onRequestPost({ request, env }: any): Promise<Response> {
    try {
        const bucket = getBucket(env);
        if (!bucket) return jsonResponse({ error: '创意工坊存储未配置' }, 500);
        const isMultipartCreate = /multipart\/form-data/i.test(request.headers.get('content-type') || '');
        let body: any;
        let zipBytesForCreate: Uint8Array | null = null;
        if (isMultipartCreate) {
            const parsed = await parseCreateRequest(request);
            body = parsed.body;
            zipBytesForCreate = parsed.zipBytes;
        } else {
            body = await request.json();
        }
        const action = readString(body?.action) || 'create';
        const existingEntries = await readIndex(env);

        if (action === 'update' || action === 'delete') {
            const user = await authenticateWorkshopUser(env, body?.auth);
            const id = readString(body?.id);
            const target = existingEntries.find((item) => item.id === id);
            if (!target) return jsonResponse({ ok: false, error: '未找到该小说分解模块。' }, 404);
            requireOwner(target, user);
            if (action === 'delete') {
                await writeIndex(env, existingEntries.filter((item) => item.id !== id));
                return jsonResponse({ ok: true, deleted: true });
            }
            const patch = body?.patch && typeof body.patch === 'object' ? body.patch : {};
            const anonymous = body?.anonymous === true;
            const updated: WorkshopEntry = {
                ...target,
                title: normalizeWorkTitle(patch.title) || target.title,
                workName: normalizeWorkTitle(patch.workName) || normalizeWorkTitle(patch.title) || target.workName,
                contributor: anonymous ? '匿名玩家' : (sanitizeText(patch.contributor, 40) || user.username),
                note: sanitizeText(patch.note, 500),
                tags: Array.isArray(patch.tags) ? patch.tags.map((item: unknown) => sanitizeText(item, 20)).filter(Boolean).slice(0, 12) : target.tags,
                anonymous,
                updatedAt: new Date().toISOString()
            };
            const keys = buildKeys(env, updated.id, updated.createdAt, updated.fileName);
            await bucket.put(keys.docKey, JSON.stringify(updated, null, 2), {
                httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
            });
            await putHi168Object(env, keys.docKey, JSON.stringify(updated, null, 2), 'application/json; charset=utf-8').catch(() => '');
            const nextEntries = [updated, ...existingEntries.filter((item) => item.id !== updated.id)].slice(0, 200);
            await writeIndex(env, nextEntries);
            return jsonResponse({ ok: true, entry: updated });
        }

        const zipBytes = zipBytesForCreate || decodeBase64(body?.zipBase64);
        const owner = await authenticateWorkshopUser(env, body?.auth);
        const id = buildId();
        const createdAt = new Date().toISOString();
        const title = normalizeWorkTitle(body?.title) || normalizeWorkTitle(body?.workName) || '未命名小说分解模块';
        const workName = normalizeWorkTitle(body?.workName) || title;
        const fileName = sanitizeFilename(body?.fileName, `${workName}_${id}`);
        const keys = buildKeys(env, id, createdAt, fileName);
        const sha256 = await sha256HexBytes(zipBytes);

        // Keep D1 for the searchable index/metadata; store ZIP payloads in OneDrive when available.
        const useOneDrive = Boolean(getOpenListToken(env));
        const odPath = buildOneDriveWorkshopPath(id, createdAt);

        const entry: WorkshopEntry = {
            id,
            title,
            workName,
            contributor: sanitizeText(body?.contributor, 40),
            note: sanitizeText(body?.note, 500),
            createdAt,
            updatedAt: createdAt,
            fileName,
            size: zipBytes.byteLength,
            sha256,
            chapterCount: Math.max(0, Math.floor(Number(body?.chapterCount) || 0)),
            segmentCount: Math.max(0, Math.floor(Number(body?.segmentCount) || 0)),
            sourceType: sanitizeText(body?.sourceType, 30),
            tags: Array.isArray(body?.tags) ? body.tags.map((item: unknown) => sanitizeText(item, 20)).filter(Boolean).slice(0, 12) : [],
            r2Key: keys.zipKey,
            oneDrivePath: useOneDrive ? odPath : undefined,
            hi168Key: keys.zipKey,
            ownerUserId: owner?.userId,
            ownerUsername: owner?.username,
            anonymous: body?.anonymous === true
        };
        entry.contributor = entry.anonymous ? '匿名玩家' : (sanitizeText(body?.contributor, 40) || owner?.username || '');

        // Upload ZIP: OneDrive primary when configured; D1 is only the fallback.
        if (useOneDrive) {
            const odResult = await putToOneDrive(env, odPath, zipBytes);
            if (!odResult.ok) {
                const uploadError = odResult.error ? `原因：${odResult.error}` : '原因：未知错误';
                if (zipBytes.byteLength > MAX_D1_ZIP_FALLBACK_BYTES) {
                    const partResult = await putToOneDriveParts(env, odPath, zipBytes);
                    if (!partResult.ok || !partResult.parts?.length) {
                        const partError = partResult.error ? `分片原因：${partResult.error}` : '分片原因：未知错误';
                        throw new Error(`OneDrive 上传失败，当前 ZIP 较大，整包上传失败后分片上传也失败，已停止发布以避免生成不可下载的创意工坊模块。${uploadError}；${partError}`);
                    }
                    entry.oneDrivePath = undefined;
                    entry.oneDriveParts = partResult.parts;
                } else {
                    // OneDrive upload failed — small ZIPs can still use D1 fallback.
                    entry.oneDrivePath = undefined;
                    await bucket.put(keys.zipKey, zipBytesToJsonArray(zipBytes), {
                        httpMetadata: { contentType: 'application/zip', cacheControl: 'public, max-age=31536000, immutable' },
                        customMetadata: { sha256, workshopId: id }
                    }).catch(() => { throw new Error('ZIP 文件上传失败，OneDrive 和 D1 均不可用。'); });
                }
            }
        } else {
            if (zipBytes.byteLength > MAX_D1_ZIP_FALLBACK_BYTES) {
                throw new Error('OneDrive 存储未配置，当前 ZIP 较大，无法发布为可下载模块。');
            }
            // No OneDrive token — preserve the old D1 fallback path for small ZIPs.
            await bucket.put(keys.zipKey, zipBytesToJsonArray(zipBytes), {
                httpMetadata: { contentType: 'application/zip', cacheControl: 'public, max-age=31536000, immutable' },
                customMetadata: { sha256, workshopId: id }
            });
        }
        entry.hi168Url = await putHi168Object(env, keys.zipKey, zipBytes, 'application/zip').catch(() => '');

        await bucket.put(keys.docKey, JSON.stringify(entry, null, 2), {
            httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
        });
        await putHi168Object(env, keys.docKey, JSON.stringify(entry, null, 2), 'application/json; charset=utf-8').catch(() => '');

        const nextEntries = [entry, ...existingEntries.filter((item) => item.id !== id)].slice(0, 200);
        await writeIndex(env, nextEntries);

        return jsonResponse({
            ok: true,
            entry,
            downloadUrl: `/api/workshop/novel-decomposition?action=download&id=${encodeURIComponent(id)}`
        });
    } catch (error: any) {
        return jsonResponse({ error: error?.message || '发布创意工坊失败' }, 500);
    }
}
