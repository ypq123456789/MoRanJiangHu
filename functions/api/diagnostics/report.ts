const JSON_HEADERS = {
    'Content-Type': 'application/json'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const MAX_BODY_BYTES = 512 * 1024;
const RETENTION_DAYS = 30;
const DAILY_REPORT_LIMIT = 10;
const TRUSTED_AUTO_REPORT_LIMIT = 100;
const CHINA_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_TRUSTED_DIAGNOSTIC_IPS = [
    '36.161.108.73'
];
const TRUSTED_DIAGNOSTIC_IP_NOTES: Record<string, string> = {
    '36.161.108.73': '中国 合肥'
};

type DiagnosticReportDocument = {
    id: string;
    createdAt: string;
    expiresAt: string;
    app?: unknown;
    client?: unknown;
    summary?: unknown;
    logs?: unknown[];
};

const buildJsonResponse = (payload: unknown, status = 200): Response => {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...CORS_HEADERS
        }
    });
};

const readString = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const toPositiveInt = (value: unknown, fallback: number): number => {
    const parsed = Math.floor(Number(value));
    return parsed > 0 ? parsed : fallback;
};

const getChinaDateKey = (date = new Date()): string => {
    return new Date(date.getTime() + CHINA_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);
};

const getNextChinaMidnightIso = (date = new Date()): string => {
    const shifted = new Date(date.getTime() + CHINA_TIMEZONE_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    const day = shifted.getUTCDate();
    return new Date(Date.UTC(year, month, day + 1) - CHINA_TIMEZONE_OFFSET_MS).toISOString();
};

const readCsv = (value: unknown): string[] => (
    readString(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
);

const getClientIp = (request: Request): string => {
    const direct = readString(request.headers.get('CF-Connecting-IP'));
    if (direct) return direct;
    const forwarded = readString(request.headers.get('X-Forwarded-For'));
    if (forwarded) return forwarded.split(',')[0]?.trim() || '';
    return readString(request.headers.get('X-Real-IP'));
};

const getTrustedDiagnosticIps = (env: any): string[] => {
    const configured = readCsv(env?.DIAGNOSTIC_TRUSTED_IPS);
    return Array.from(new Set([...DEFAULT_TRUSTED_DIAGNOSTIC_IPS, ...configured]));
};

const isTrustedDiagnosticClient = (request: Request, env: any): boolean => {
    const ip = getClientIp(request);
    return Boolean(ip && getTrustedDiagnosticIps(env).includes(ip));
};

const describeTrustedDiagnosticClient = (request: Request): { ip: string; location?: string } => {
    const ip = getClientIp(request);
    return {
        ip,
        location: TRUSTED_DIAGNOSTIC_IP_NOTES[ip]
    };
};

const getBucket = (env: any): R2Bucket | null => {
    const candidate = env?.DIAGNOSTIC_REPORTS_R2 || env?.CNB_SYNC_R2;
    if (!candidate || typeof candidate.get !== 'function' || typeof candidate.put !== 'function') {
        return null;
    }
    return candidate as R2Bucket;
};

const getRetentionDays = (env: any): number => Math.min(365, toPositiveInt(env?.DIAGNOSTIC_REPORT_RETENTION_DAYS, RETENTION_DAYS));

const getPrefix = (env: any): string => {
    const raw = readString(env?.DIAGNOSTIC_REPORT_R2_PREFIX) || 'moranjianghu/diagnostics';
    return raw.replace(/^\/+|\/+$/g, '') || 'moranjianghu/diagnostics';
};

const buildReportId = (): string => {
    const random = crypto.getRandomValues(new Uint8Array(12));
    const suffix = Array.from(random).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    return `diag_${stamp}_${suffix}`;
};

const buildObjectKey = (env: any, id: string, createdAt?: string): string => {
    const date = new Date(createdAt || Date.now());
    const chinaDate = getChinaDateKey(date);
    const [year, month, day] = chinaDate.split('-');
    return `${getPrefix(env)}/${year}/${month}/${day}/${id}.json`;
};

const buildIndexKey = (env: any, id: string): string => `${getPrefix(env)}/index/${id}.json`;

const buildRateLimitKey = (env: any, date: string, reporterKey: string): string => `${getPrefix(env)}/rate/${date}/${reporterKey}.json`;

const sha256Hex = async (value: string): Promise<string> => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readRequestJson = async (request: Request): Promise<any> => {
    const contentLength = toPositiveInt(request.headers.get('Content-Length'), 0);
    if (contentLength > MAX_BODY_BYTES) {
        throw new Error('诊断日志太大，请先清空旧日志或筛选后再上报');
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
        throw new Error('诊断日志太大，请先清空旧日志或筛选后再上报');
    }
    return JSON.parse(text);
};

const sanitizeLogs = (logs: unknown): unknown[] => {
    if (!Array.isArray(logs)) return [];
    return logs.slice(0, 200).map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const source = entry as Record<string, unknown>;
        return {
            id: readString(source.id).slice(0, 80),
            level: readString(source.level).slice(0, 20),
            time: readString(source.time).slice(0, 80),
            message: readString(source.message).slice(0, 4000),
            detail: readString(source.detail).slice(0, 12000)
        };
    });
};

const isAutoUploadReport = (body: any): boolean => body?.summary && typeof body.summary === 'object' && body.summary.autoUpload === true;

const buildReportDocument = (env: any, body: any): DiagnosticReportDocument => {
    const createdAt = new Date().toISOString();
    const expiresAt = isAutoUploadReport(body)
        ? getNextChinaMidnightIso(new Date(createdAt))
        : new Date(Date.now() + getRetentionDays(env) * 24 * 60 * 60 * 1000).toISOString();
    return {
        id: buildReportId(),
        createdAt,
        expiresAt,
        app: body?.app && typeof body.app === 'object' ? body.app : {},
        client: body?.client && typeof body.client === 'object' ? body.client : {},
        summary: body?.summary && typeof body.summary === 'object' ? body.summary : {},
        logs: sanitizeLogs(body?.logs)
    };
};

const buildReporterKey = async (request: Request, body: any): Promise<string> => {
    const client = body?.client && typeof body.client === 'object' ? body.client : {};
    const deviceId = readString(client.deviceId);
    if (deviceId) return `device-${await sha256Hex(deviceId)}`;
    const ip = readString(request.headers.get('CF-Connecting-IP')) || readString(request.headers.get('X-Forwarded-For')) || 'unknown';
    const ua = readString(request.headers.get('User-Agent'));
    return `fallback-${await sha256Hex(`${ip}\n${ua}`)}`;
};

const enforceDailyLimit = async (request: Request, env: any, body: any): Promise<{ remaining: number }> => {
    const bucket = getBucket(env);
    if (!bucket) return { remaining: DAILY_REPORT_LIMIT };

    const trustedAutoUpload = isAutoUploadReport(body) && isTrustedDiagnosticClient(request, env);
    const dailyLimit = trustedAutoUpload ? TRUSTED_AUTO_REPORT_LIMIT : DAILY_REPORT_LIMIT;
    const today = getChinaDateKey();
    const reporterKey = `${isAutoUploadReport(body) ? 'auto' : 'manual'}-${await buildReporterKey(request, body)}`;
    const key = buildRateLimitKey(env, today, reporterKey);
    const existing = await bucket.get(key);
    const parsed = existing ? await existing.json<{ count?: number }>().catch(() => null) : null;
    const count = Math.max(0, Math.floor(Number(parsed?.count) || 0));
    if (count >= dailyLimit) {
        throw new Error(`今天诊断日志上报次数已达上限（${dailyLimit} 次），请明天再试。`);
    }

    const nextCount = count + 1;
    await bucket.put(key, JSON.stringify({
        date: today,
        count: nextCount,
        updatedAt: new Date().toISOString()
    }), {
        httpMetadata: {
            contentType: 'application/json'
        }
    });

    return {
        remaining: Math.max(0, dailyLimit - nextCount)
    };
};

const cleanupExpiredReports = async (env: any): Promise<void> => {
    const bucket = getBucket(env);
    if (!bucket) return;
    const now = Date.now();
    const prefix = `${getPrefix(env)}/index/`;
    let cursor: string | undefined;
    let checked = 0;

    do {
        const page = await bucket.list({ prefix, cursor, limit: 50 });
        cursor = page.truncated ? page.cursor : undefined;
        for (const object of page.objects) {
            if (checked >= 200) return;
            checked += 1;
            const indexObject = await bucket.get(object.key);
            const index = indexObject ? await indexObject.json<{ key?: string; expiresAt?: string }>().catch(() => null) : null;
            const expiresAt = Date.parse(index?.expiresAt || '');
            if (expiresAt && expiresAt < now) {
                const reportKey = readString(index?.key);
                if (reportKey) await bucket.delete(reportKey).catch(() => undefined);
                await bucket.delete(object.key).catch(() => undefined);
            }
        }
    } while (cursor);
};

const readBearerToken = (request: Request): string => {
    const authHeader = request.headers.get('Authorization')?.trim() || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || '';
};

const findReportById = async (env: any, id: string): Promise<DiagnosticReportDocument | null> => {
    const bucket = getBucket(env);
    if (!bucket) return null;

    const indexObject = await bucket.get(buildIndexKey(env, id));
    if (!indexObject) return null;
    const index = await indexObject.json<{ key?: string; expiresAt?: string }>().catch(() => null);
    const key = readString(index?.key);
    if (!key) return null;

    const reportObject = await bucket.get(key);
    if (!reportObject) return null;
    const report = await reportObject.json<DiagnosticReportDocument>().catch(() => null);
    if (!report) return null;

    if (Date.parse(report.expiresAt || '') < Date.now()) {
        await bucket.delete(key).catch(() => undefined);
        await bucket.delete(buildIndexKey(env, id)).catch(() => undefined);
        return null;
    }

    return report;
};

const listRecentReports = async (env: any, limit: number): Promise<DiagnosticReportDocument[]> => {
    const bucket = getBucket(env);
    if (!bucket) return [];
    const prefix = `${getPrefix(env)}/index/`;
    const page = await bucket.list({ prefix, limit: Math.min(50, Math.max(1, limit * 3)) });
    const indexes = await Promise.all(page.objects.map(async (object) => {
        const indexObject = await bucket.get(object.key);
        const index = indexObject ? await indexObject.json<{ id?: string; createdAt?: string }>().catch(() => null) : null;
        return {
            id: readString(index?.id),
            createdAt: readString(index?.createdAt)
        };
    }));
    const ids = indexes
        .filter(item => item.id)
        .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
        .slice(0, limit)
        .map(item => item.id);
    const reports = await Promise.all(ids.map(id => findReportById(env, id)));
    return reports.filter(Boolean) as DiagnosticReportDocument[];
};

export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
    });
}

export async function onRequestGet({ request, env }: any): Promise<Response> {
    try {
        const url = new URL(request.url);
        const id = readString(url.searchParams.get('id'));
        const expectedToken = readString(env?.DIAGNOSTIC_REPORT_READ_TOKEN);
        const trustedClient = isTrustedDiagnosticClient(request, env);
        const authorizedReader = trustedClient || !expectedToken || readBearerToken(request) === expectedToken;

        if ((url.searchParams.get('list') === '1' || url.searchParams.get('latest') === '1') && !authorizedReader) {
            return buildJsonResponse({ error: 'Unauthorized diagnostic report read' }, 401);
        }
        if (url.searchParams.get('list') === '1' || url.searchParams.get('latest') === '1') {
            await cleanupExpiredReports(env);
            const reports = await listRecentReports(env, toPositiveInt(url.searchParams.get('limit'), 10));
            return buildJsonResponse({
                ok: true,
                trustedClient: trustedClient ? describeTrustedDiagnosticClient(request) : null,
                reports
            });
        }

        if (!id) {
            return buildJsonResponse({ error: 'Missing diagnostic report id' }, 400);
        }

        if (!authorizedReader) {
            return buildJsonResponse({ error: 'Unauthorized diagnostic report read' }, 401);
        }

        const report = await findReportById(env, id);
        if (!report) {
            return buildJsonResponse({ error: 'Diagnostic report not found or expired' }, 404);
        }

        return buildJsonResponse({ ok: true, report });
    } catch (error: any) {
        return buildJsonResponse({ error: error?.message || 'Unknown diagnostic report read error' }, 500);
    }
}

export async function onRequestPost({ request, env, waitUntil }: any): Promise<Response> {
    try {
        const bucket = getBucket(env);
        if (!bucket) {
            return buildJsonResponse({ error: 'Diagnostic R2 bucket is not configured' }, 500);
        }

        const body = await readRequestJson(request).catch((error) => {
            throw new Error(error?.message || 'Invalid diagnostic JSON payload');
        });
        if (!body || typeof body !== 'object') {
            return buildJsonResponse({ error: 'Invalid diagnostic payload' }, 400);
        }
        if (isAutoUploadReport(body) && !isTrustedDiagnosticClient(request, env)) {
            return buildJsonResponse({ error: 'Automatic diagnostic upload is not enabled for this IP' }, 403);
        }

        const rateLimit = await enforceDailyLimit(request, env, body);
        const report = buildReportDocument(env, body);
        const key = buildObjectKey(env, report.id, report.createdAt);
        const indexKey = buildIndexKey(env, report.id);

        await bucket.put(key, JSON.stringify(report, null, 2), {
            httpMetadata: {
                contentType: 'application/json'
            },
            customMetadata: {
                reportId: report.id,
                createdAt: report.createdAt,
                expiresAt: report.expiresAt
            }
        });
        await bucket.put(indexKey, JSON.stringify({ id: report.id, key, createdAt: report.createdAt, expiresAt: report.expiresAt }), {
            httpMetadata: {
                contentType: 'application/json'
            },
            customMetadata: {
                reportId: report.id,
                expiresAt: report.expiresAt
            }
        });

        if (typeof waitUntil === 'function') {
            waitUntil(cleanupExpiredReports(env));
        } else {
            cleanupExpiredReports(env).catch(() => undefined);
        }

        return buildJsonResponse({
            ok: true,
            id: report.id,
            createdAt: report.createdAt,
            expiresAt: report.expiresAt,
            retentionDays: getRetentionDays(env),
            remainingToday: rateLimit.remaining
        });
    } catch (error: any) {
        return buildJsonResponse({ error: error?.message || 'Unknown diagnostic report upload error' }, 500);
    }
}
