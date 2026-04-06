export const 默认小说时间线起点 = '0001:01:01:00:00';

interface 时间部件 {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

const 中文数字映射: Record<string, number> = {
    '零': 0,
    '〇': 0,
    '○': 0,
    '一': 1,
    '二': 2,
    '两': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9
};

const 补位 = (value: number, length: number): string => Math.max(0, Math.floor(value)).toString().padStart(length, '0');

const 限制范围 = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.floor(value)));

const 规范化文本 = (value: unknown): string => (typeof value === 'string' ? value : '').trim();

const 是否闰年 = (year: number): boolean => (
    year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
);

const 获取当月天数 = (year: number, month: number): number => {
    if (month === 2) return 是否闰年(year) ? 29 : 28;
    if ([4, 6, 9, 11].includes(month)) return 30;
    return 31;
};

const 获取月前累计天数 = (year: number, month: number): number => {
    let total = 0;
    for (let current = 1; current < month; current += 1) {
        total += 获取当月天数(year, current);
    }
    return total;
};

const 获取年前累计天数 = (year: number): number => {
    const normalizedYear = Math.max(1, Math.floor(year));
    const previousYear = normalizedYear - 1;
    return previousYear * 365
        + Math.floor(previousYear / 4)
        - Math.floor(previousYear / 100)
        + Math.floor(previousYear / 400);
};

const 规范化时间部件 = (parts: Partial<时间部件> | null | undefined): 时间部件 => {
    const year = Math.max(1, Math.floor(Number(parts?.year) || 1));
    const month = 限制范围(Number(parts?.month) || 1, 1, 12);
    const day = 限制范围(Number(parts?.day) || 1, 1, 获取当月天数(year, month));
    return {
        year,
        month,
        day,
        hour: 限制范围(Number(parts?.hour) || 0, 0, 23),
        minute: 限制范围(Number(parts?.minute) || 0, 0, 59)
    };
};

const 序列化时间部件 = (parts: Partial<时间部件> | null | undefined): string => {
    const normalized = 规范化时间部件(parts);
    return `${补位(normalized.year, 4)}:${补位(normalized.month, 2)}:${补位(normalized.day, 2)}:${补位(normalized.hour, 2)}:${补位(normalized.minute, 2)}`;
};

const 解析阿拉伯数字 = (raw: string): number => {
    const normalized = raw.replace(/[^\d]/g, '');
    return normalized ? Number(normalized) : 0;
};

const 解析中文数字 = (raw: string): number => {
    const text = raw.trim();
    if (!text) return 0;
    if (/^\d+$/.test(text)) return Number(text);

    let total = 0;
    let current = 0;
    let hasUnit = false;
    const unitMap: Record<string, number> = {
        '十': 10,
        '百': 100,
        '千': 1000,
        '万': 10000
    };

    for (const char of text) {
        if (char in 中文数字映射) {
            current = 中文数字映射[char];
            continue;
        }
        const unit = unitMap[char];
        if (!unit) continue;
        hasUnit = true;
        if (unit === 10000) {
            total = (total + (current || 1)) * unit;
            current = 0;
            continue;
        }
        total += (current || 1) * unit;
        current = 0;
    }

    if (!hasUnit) {
        return Array.from(text).reduce((sum, char) => {
            if (!(char in 中文数字映射)) return sum;
            return sum * 10 + 中文数字映射[char];
        }, 0);
    }

    return total + current;
};

const 解析数字片段 = (raw: string): number => {
    const text = raw.trim();
    if (!text) return 0;
    return /[零〇○一二两三四五六七八九十百千万]/.test(text) ? 解析中文数字(text) : 解析阿拉伯数字(text);
};

const 解析规范时间 = (value: string): 时间部件 | null => {
    const normalized = 规范化文本(value);
    if (!normalized) return null;
    const full = normalized.match(/^(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (full) {
        return 规范化时间部件({
            year: Number(full[1]),
            month: Number(full[2]),
            day: Number(full[3]),
            hour: Number(full[4]),
            minute: Number(full[5])
        });
    }
    const short = normalized.match(/^(\d{1,6}):(\d{1,2}):(\d{1,2})$/);
    if (short) {
        return 规范化时间部件({
            year: Number(short[1]),
            month: Number(short[2]),
            day: Number(short[3]),
            hour: 0,
            minute: 0
        });
    }
    return null;
};

const 解析中文日期 = (value: string): Partial<时间部件> | null => {
    const normalized = 规范化文本(value);
    if (!normalized) return null;
    const match = normalized.match(/([0-9零〇○一二两三四五六七八九十百千万]+)年([0-9零〇○一二两三四五六七八九十百千万]+)月([0-9零〇○一二两三四五六七八九十百千万]+)(?:日|号)?/);
    if (!match) return null;
    const hour = /凌晨/.test(normalized) ? 3
        : /清晨|早上|上午/.test(normalized) ? 8
            : /中午/.test(normalized) ? 12
                : /下午/.test(normalized) ? 15
                    : /傍晚/.test(normalized) ? 18
                        : /晚上|夜里|深夜/.test(normalized) ? 21
                            : 0;
    return {
        year: 解析数字片段(match[1]),
        month: 解析数字片段(match[2]),
        day: 解析数字片段(match[3]),
        hour,
        minute: 0
    };
};

const 增加天数 = (parts: 时间部件, offsetDays: number): 时间部件 => {
    const next = { ...parts };
    let remain = Math.max(0, Math.floor(offsetDays));
    while (remain > 0) {
        next.day += 1;
        if (next.day > 获取当月天数(next.year, next.month)) {
            next.day = 1;
            next.month += 1;
            if (next.month > 12) {
                next.month = 1;
                next.year += 1;
            }
        }
        remain -= 1;
    }
    return next;
};

const 时间部件转分钟序数 = (parts: 时间部件): number => {
    const normalized = 规范化时间部件(parts);
    const totalDays = 获取年前累计天数(normalized.year)
        + 获取月前累计天数(normalized.year, normalized.month)
        + (normalized.day - 1);
    return totalDays * 24 * 60 + normalized.hour * 60 + normalized.minute;
};

const 根据累计天数反推年份 = (totalDays: number): number => {
    let low = 1;
    let high = Math.max(2, Math.floor(totalDays / 365) + 2);
    while (获取年前累计天数(high) <= totalDays) {
        high *= 2;
    }
    while (low < high) {
        const mid = Math.floor((low + high + 1) / 2);
        if (获取年前累计天数(mid) <= totalDays) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
};

const 分钟序数转时间部件 = (totalMinutes: number): 时间部件 => {
    const safeMinutes = Math.max(0, Math.floor(totalMinutes));
    const totalDays = Math.floor(safeMinutes / (24 * 60));
    const remainingMinutes = safeMinutes % (24 * 60);
    const year = 根据累计天数反推年份(totalDays);
    let dayOfYear = totalDays - 获取年前累计天数(year);
    let month = 1;
    while (month < 12) {
        const daysInMonth = 获取当月天数(year, month);
        if (dayOfYear < daysInMonth) break;
        dayOfYear -= daysInMonth;
        month += 1;
    }
    return 规范化时间部件({
        year,
        month,
        day: dayOfYear + 1,
        hour: Math.floor(remainingMinutes / 60),
        minute: remainingMinutes % 60
    });
};

export const 增加小说时间线天数 = (anchor: string, offsetDays: number): string => {
    const base = 解析规范时间(anchor) || 解析规范时间(默认小说时间线起点) || 规范化时间部件(null);
    return 序列化时间部件(增加天数(base, offsetDays));
};

export const 小说时间锚点转分钟序数 = (value?: string): number | null => {
    const parts = 解析规范时间(规范化文本(value));
    if (!parts) return null;
    return 时间部件转分钟序数(parts);
};

export const 小说分钟序数转时间锚点 = (totalMinutes: number): string => (
    序列化时间部件(分钟序数转时间部件(totalMinutes))
);

export const 计算小说时间偏移分钟 = (from?: string, to?: string): number | null => {
    const fromMinutes = 小说时间锚点转分钟序数(from);
    const toMinutes = 小说时间锚点转分钟序数(to);
    if (fromMinutes === null || toMinutes === null) return null;
    return toMinutes - fromMinutes;
};

export const 平移小说时间锚点 = (value: unknown, offsetMinutes: number): string => {
    const normalized = 规范化文本(value);
    if (!normalized) return '';
    const baseMinutes = 小说时间锚点转分钟序数(normalized);
    if (baseMinutes === null) return '';
    const nextMinutes = Math.max(0, baseMinutes + Math.floor(Number(offsetMinutes) || 0));
    return 小说分钟序数转时间锚点(nextMinutes);
};

export const 尝试规范化小说时间锚点 = (
    value: unknown,
    fallback = 默认小说时间线起点,
    reference?: string
): string => {
    const text = 规范化文本(value);
    if (!text || /^(?:无|未知|未明示|未说明|未提及|n\/a|null|none)$/iu.test(text)) {
        return '';
    }

    const canonical = 解析规范时间(text);
    if (canonical) return 序列化时间部件(canonical);

    const chineseDate = 解析中文日期(text);
    if (chineseDate) return 序列化时间部件(chineseDate);

    const base = 解析规范时间(reference || '')
        || 解析规范时间(fallback)
        || 解析规范时间(默认小说时间线起点)
        || 规范化时间部件(null);
    const relativeDay = text.match(/第([0-9零〇○一二两三四五六七八九十百千万]+)(?:天|日|夜)/);
    if (relativeDay) {
        return 序列化时间部件(增加天数(base, Math.max(0, 解析数字片段(relativeDay[1]) - 1)));
    }

    if (/当天|当日|这一日|这一夜/.test(text)) {
        return 序列化时间部件(base);
    }
    if (/次日|翌日|第二天|隔日/.test(text)) {
        return 序列化时间部件(增加天数(base, 1));
    }
    if (/第三天/.test(text)) {
        return 序列化时间部件(增加天数(base, 2));
    }
    if (/之后|随后|其后|接着/.test(text)) {
        return 序列化时间部件(增加天数(base, 1));
    }

    return '';
};

export const 规范化小说时间锚点 = (
    value: unknown,
    fallback = 默认小说时间线起点,
    reference?: string
): string => {
    const normalizedFallback = 序列化时间部件(
        解析规范时间(reference || '')
        || 解析规范时间(fallback)
        || 解析规范时间(默认小说时间线起点)
        || 规范化时间部件(null)
    );
    return 尝试规范化小说时间锚点(value, fallback, reference) || normalizedFallback;
};
