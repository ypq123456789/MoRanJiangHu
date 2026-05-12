export type DiagnosticLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type DiagnosticLogEntry = {
    id: string;
    level: DiagnosticLogLevel;
    time: string;
    message: string;
    detail?: string;
};

type Listener = () => void;
type PrebootLogEntry = {
    level?: DiagnosticLogLevel;
    time?: string;
    values?: unknown[];
};

declare global {
    interface Window {
        __MORAN_PREBOOT_LOGS__?: PrebootLogEntry[];
        __MORAN_PREBOOT_LOGS_CONSUMED__?: boolean;
    }
}

const MAX_LOGS = 500;
const PERSISTED_LOG_LIMIT = 200;
const STORAGE_KEY = 'moranjianghu.diagnosticLogs';
const logs: DiagnosticLogEntry[] = [];
const listeners = new Set<Listener>();
let installed = false;
let restoredPersistedLogs = false;
let autoReportTimer: ReturnType<typeof setTimeout> | null = null;
let autoReportInFlight = false;

const stringifyValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) {
        return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const emit = () => {
    listeners.forEach(listener => {
        try {
            listener();
        } catch {
            // Listener failures should never break the application log pipeline.
        }
    });
};

const isDiagnosticLogEntry = (value: unknown): value is DiagnosticLogEntry => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<DiagnosticLogEntry>;
    return typeof entry.id === 'string'
        && normalizeLogLevel(entry.level) === entry.level
        && typeof entry.time === 'string'
        && typeof entry.message === 'string';
};

const restorePersistedLogs = () => {
    if (restoredPersistedLogs || typeof localStorage === 'undefined') return;
    restoredPersistedLogs = true;
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return;
        logs.push(...parsed.filter(isDiagnosticLogEntry).slice(0, PERSISTED_LOG_LIMIT));
        if (logs.length > MAX_LOGS) {
            logs.length = MAX_LOGS;
        }
    } catch {
        // Ignore broken persisted logs; the live log pipeline should keep working.
    }
};

const persistLogs = () => {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, PERSISTED_LOG_LIMIT)));
    } catch {
        // Ignore quota/storage failures; in-memory logs are still available.
    }
};

const scheduleAutomaticErrorReport = (entry: DiagnosticLogEntry) => {
    if (typeof window === 'undefined' || entry.level !== 'error') return;
    if (autoReportTimer) {
        window.clearTimeout(autoReportTimer);
    }
    autoReportTimer = window.setTimeout(() => {
        autoReportTimer = null;
        if (autoReportInFlight) return;
        autoReportInFlight = true;
        import('./diagnosticReport')
            .then(module => module.submitAutomaticErrorDiagnosticReport(entry.message))
            .catch(() => undefined)
            .finally(() => {
                autoReportInFlight = false;
            });
    }, 1500);
};

export const recordDiagnosticLog = (level: DiagnosticLogLevel, values: unknown[]) => {
    restorePersistedLogs();
    const rendered = values.map(stringifyValue).filter(Boolean);
    const message = rendered[0] || '(empty log)';
    const detail = rendered.length > 1 ? rendered.slice(1).join('\n') : undefined;
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        level,
        time: new Date().toISOString(),
        message,
        detail
    };
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) {
        logs.length = MAX_LOGS;
    }
    persistLogs();
    emit();
    scheduleAutomaticErrorReport(entry);
};

const normalizeLogLevel = (level: unknown): DiagnosticLogLevel => {
    return level === 'log' || level === 'info' || level === 'warn' || level === 'error' || level === 'debug'
        ? level
        : 'debug';
};

export const getDiagnosticLogs = (): DiagnosticLogEntry[] => {
    restorePersistedLogs();
    return logs.slice();
};

export const clearDiagnosticLogs = () => {
    restorePersistedLogs();
    logs.length = 0;
    persistLogs();
    emit();
};

export const subscribeDiagnosticLogs = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const installDiagnosticLogCapture = () => {
    if (installed || typeof console === 'undefined') return;
    installed = true;
    restorePersistedLogs();

    (['log', 'info', 'warn', 'error', 'debug'] as DiagnosticLogLevel[]).forEach(level => {
        const original = console[level]?.bind(console);
        if (!original) return;
        console[level] = (...args: unknown[]) => {
            recordDiagnosticLog(level, args);
            original(...args);
        };
    });

    if (typeof window !== 'undefined') {
        if (!window.__MORAN_PREBOOT_LOGS_CONSUMED__ && Array.isArray(window.__MORAN_PREBOOT_LOGS__)) {
            window.__MORAN_PREBOOT_LOGS_CONSUMED__ = true;
            window.__MORAN_PREBOOT_LOGS__.forEach(entry => {
                const values = Array.isArray(entry.values) ? entry.values : ['preboot log'];
                recordDiagnosticLog(normalizeLogLevel(entry.level), values);
            });
        }

        window.addEventListener('error', event => {
            recordDiagnosticLog('error', [
                'window.error',
                {
                    message: event.message,
                    source: event.filename,
                    line: event.lineno,
                    column: event.colno,
                    error: event.error instanceof Error ? event.error.stack || event.error.message : event.error
                }
            ]);
        });
        window.addEventListener('unhandledrejection', event => {
            recordDiagnosticLog('error', ['unhandledrejection', event.reason]);
        });
    }
};

installDiagnosticLogCapture();
