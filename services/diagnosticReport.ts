import { RELEASE_INFO } from '../data/releaseInfo';
import { isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { getDiagnosticLogs, type DiagnosticLogEntry } from './diagnosticLog';
import { getCurrentAppRelease } from './appUpdate';

const DAILY_LIMIT = 10;
const RATE_LIMIT_STORAGE_KEY = 'moranjianghu.diagnosticReportRateLimit';
const DEVICE_ID_STORAGE_KEY = 'moranjianghu.diagnosticReportDeviceId';
const AUTO_REPORT_STORAGE_KEY = 'moranjianghu.diagnosticReportAutoUpload';
const AUTO_REPORT_MIN_INTERVAL_MS = 60 * 1000;

type RateLimitState = {
    date: string;
    count: number;
};

export type DiagnosticReportResult = {
    id: string;
    createdAt: string;
    expiresAt: string;
    remainingToday: number;
};

const getTodayKey = (): string => {
    const chinaTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return chinaTime.toISOString().slice(0, 10);
};

const readRateLimitState = (): RateLimitState => {
    try {
        const parsed = JSON.parse(localStorage.getItem(RATE_LIMIT_STORAGE_KEY) || '{}') as Partial<RateLimitState>;
        const today = getTodayKey();
        if (parsed.date !== today) {
            return { date: today, count: 0 };
        }
        return { date: today, count: Math.max(0, Math.floor(Number(parsed.count) || 0)) };
    } catch {
        return { date: getTodayKey(), count: 0 };
    }
};

const writeRateLimitState = (state: RateLimitState) => {
    try {
        localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore localStorage failures; server-side storage still protects data retention.
    }
};

export const getDiagnosticReportQuota = (): { used: number; remaining: number; limit: number } => {
    const state = readRateLimitState();
    const used = Math.min(DAILY_LIMIT, state.count);
    return {
        used,
        remaining: Math.max(0, DAILY_LIMIT - used),
        limit: DAILY_LIMIT
    };
};

const buildApiBaseUrl = (): string => {
    if (typeof window === 'undefined') return RELEASE_INFO.websiteUrl || 'https://msjh.bacon.de5.net';
    const protocol = window.location.protocol;
    if (protocol === 'http:' || protocol === 'https:') {
        return window.location.origin;
    }
    return RELEASE_INFO.websiteUrl || 'https://msjh.bacon.de5.net';
};

const getOrCreateDeviceId = (): string => {
    try {
        const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (existing) return existing;
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const next = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
        return next;
    } catch {
        return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
};

const countByLevel = (logs: DiagnosticLogEntry[]) => logs.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.level] = (acc[entry.level] || 0) + 1;
    return acc;
}, {});

const buildReportPayload = async (
    logs: DiagnosticLogEntry[],
    options?: { autoUpload?: boolean; triggerReason?: string }
) => {
    const currentRelease = await getCurrentAppRelease().catch(() => ({
        versionCode: RELEASE_INFO.versionCode,
        versionName: RELEASE_INFO.versionName
    }));
    return {
        app: {
            name: '墨色江湖',
            versionCode: currentRelease.versionCode,
            versionName: currentRelease.versionName,
            releaseChannel: RELEASE_INFO.releaseChannel,
            websiteUrl: RELEASE_INFO.websiteUrl,
            isNative: isNativeCapacitorEnvironment()
        },
        client: {
            deviceId: getOrCreateDeviceId(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            language: typeof navigator !== 'undefined' ? navigator.language : '',
            platform: typeof navigator !== 'undefined' ? navigator.platform : '',
            url: typeof window !== 'undefined' ? window.location.href : '',
            screen: typeof window !== 'undefined' ? {
                width: window.screen?.width,
                height: window.screen?.height,
                devicePixelRatio: window.devicePixelRatio
            } : undefined,
            reportedAt: new Date().toISOString()
        },
        summary: {
            autoUpload: options?.autoUpload === true,
            triggerReason: options?.triggerReason || '',
            total: logs.length,
            countByLevel: countByLevel(logs),
            latestError: logs.find((entry) => entry.level === 'error') || null
        },
        logs: logs.slice(0, 200)
    };
};

export const submitDiagnosticReport = async (entries?: DiagnosticLogEntry[]): Promise<DiagnosticReportResult> => {
    const state = readRateLimitState();
    if (state.count >= DAILY_LIMIT) {
        throw new Error(`今天诊断日志上报次数已达上限（${DAILY_LIMIT} 次），请明天再试。`);
    }

    const logs = (entries || getDiagnosticLogs()).slice(0, 200);
    if (!logs.length) {
        throw new Error('暂无可上报的诊断日志。');
    }

    const endpoint = new URL('/api/diagnostics/report', buildApiBaseUrl()).toString();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(await buildReportPayload(logs))
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || !payload?.ok || !payload?.id) {
        throw new Error(payload?.error || `诊断日志上报失败：HTTP ${response.status}`);
    }

    const nextState = { date: state.date, count: state.count + 1 };
    writeRateLimitState(nextState);

    return {
        id: String(payload.id),
        createdAt: String(payload.createdAt || ''),
        expiresAt: String(payload.expiresAt || ''),
        remainingToday: Math.max(0, Number(payload.remainingToday ?? (DAILY_LIMIT - nextState.count)) || 0)
    };
};

const readAutoReportState = (): { lastAt: number; lastErrorId: string } => {
    try {
        const parsed = JSON.parse(localStorage.getItem(AUTO_REPORT_STORAGE_KEY) || '{}') as Partial<{ lastAt: number; lastErrorId: string }>;
        return {
            lastAt: Math.max(0, Math.floor(Number(parsed.lastAt) || 0)),
            lastErrorId: typeof parsed.lastErrorId === 'string' ? parsed.lastErrorId : ''
        };
    } catch {
        return { lastAt: 0, lastErrorId: '' };
    }
};

const writeAutoReportState = (state: { lastAt: number; lastErrorId: string }) => {
    try {
        localStorage.setItem(AUTO_REPORT_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Automatic diagnostics are best-effort only.
    }
};

export const submitAutomaticErrorDiagnosticReport = async (reason?: string): Promise<DiagnosticReportResult | null> => {
    const logs = getDiagnosticLogs().slice(0, 200);
    const latestError = logs.find((entry) => entry.level === 'error');
    if (!latestError) return null;

    const state = readAutoReportState();
    const now = Date.now();
    if (state.lastErrorId === latestError.id || now - state.lastAt < AUTO_REPORT_MIN_INTERVAL_MS) {
        return null;
    }

    const endpoint = new URL('/api/diagnostics/report', buildApiBaseUrl()).toString();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(await buildReportPayload(logs, {
            autoUpload: true,
            triggerReason: reason || latestError.message
        }))
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || !payload?.ok || !payload?.id) {
        return null;
    }

    writeAutoReportState({ lastAt: now, lastErrorId: latestError.id });

    return {
        id: String(payload.id),
        createdAt: String(payload.createdAt || ''),
        expiresAt: String(payload.expiresAt || ''),
        remainingToday: Math.max(0, Number(payload.remainingToday ?? 0) || 0)
    };
};
