export interface 结构化时间对象 {
    年: number;
    月: number;
    日: number;
    时: number;
    分: number;
}

const two = (n: number): string => Math.trunc(n).toString().padStart(2, '0');

const toBoundedInt = (value: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return fallback;
    const int = Math.trunc(num);
    if (int < min || int > max) return fallback;
    return int;
};

export const 规范化结构化时间 = (input?: unknown): 结构化时间对象 | null => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const src = input as Record<string, unknown>;
    const 年 = toBoundedInt(src.年, Number.NaN, 1, 999999);
    const 月 = toBoundedInt(src.月, Number.NaN, 1, 12);
    const 日 = toBoundedInt(src.日, Number.NaN, 1, 31);
    const 时 = toBoundedInt(src.时, Number.NaN, 0, 23);
    const 分 = toBoundedInt(src.分, Number.NaN, 0, 59);
    if (![年, 月, 日, 时, 分].every(Number.isFinite)) return null;
    return { 年, 月, 日, 时, 分 };
};

export const 结构化时间转标准串 = (input?: unknown): string | null => {
    const t = 规范化结构化时间(input);
    if (!t) return null;
    return `${t.年}:${two(t.月)}:${two(t.日)}:${two(t.时)}:${two(t.分)}`;
};

export const 标准时间串转结构化 = (input?: string): 结构化时间对象 | null => {
    const canonical = normalizeCanonicalGameTime(input);
    if (!canonical) return null;
    const match = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    return {
        年: Number(match[1]),
        月: Number(match[2]),
        日: Number(match[3]),
        时: Number(match[4]),
        分: Number(match[5])
    };
};

export const 环境时间转标准串 = (env?: unknown): string | null => {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return null;
    const source = env as Record<string, unknown>;
    if (typeof source.时间 === 'string') {
        const canonical = normalizeCanonicalGameTime(source.时间);
        if (canonical) return canonical;
    }
    return 结构化时间转标准串(env);
};

export const 提取环境月日 = (env?: unknown): { month: number; day: number } | null => {
    return 提取时间月日(环境时间转标准串(env) || undefined);
};

export const normalizeCanonicalGameTime = (input?: string): string | null => {
    if (!input || typeof input !== 'string') return null;
    const match = input.trim().match(/^(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59
    ) {
        return null;
    }
    return `${year}:${two(month)}:${two(day)}:${two(hour)}:${two(minute)}`;
};

export const 提取时间月日 = (input?: string): { month: number; day: number } | null => {
    const canonical = normalizeCanonicalGameTime(input);
    if (!canonical) return null;
    const m = canonical.match(/^\d{1,6}:(\d{2}):(\d{2}):/);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { month, day };
};
