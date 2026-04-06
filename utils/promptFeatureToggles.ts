import type { 游戏设置结构 } from '../types';

const 生理系统提示词关键词正则 = /(饱腹|口渴|水分|饥饿|脱水)/u;
const 功能附加块正则 = /<!--\s*PROMPT_FEATURE:([a-z0-9_-]+):START\s*-->([\s\S]*?)<!--\s*PROMPT_FEATURE:\1:END\s*-->/giu;

const 修炼体系字段集合 = new Set([
    '境界',
    '境界层级',
    '当前经验',
    '升级经验',
    '突破条件',
    '当前内力',
    '最大内力',
    '功法列表',
    '境界映射值',
    '推荐境界'
]);

const 按关键词过滤整行 = (content: string, keyword: RegExp): string => (
    (content || '')
        .split('\n')
        .filter((line) => !keyword.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

export const 过滤饱腹口渴提示词行 = (content: string): string => (
    按关键词过滤整行(content, 生理系统提示词关键词正则)
);

const 归一化功能附加块内容 = (content: string): string => (
    (content || '')
        .replace(/\r\n/g, '\n')
        .trim()
);

const 功能附加块是否启用 = (
    featureId: string,
    config?: Partial<游戏设置结构> | null
): boolean => {
    switch ((featureId || '').trim().toLowerCase()) {
        case 'cultivation':
            return config?.启用修炼体系 !== false;
        case 'survival':
            return config?.启用饱腹口渴系统 !== false;
        default:
            return true;
    }
};

export const 构建功能附加块 = (featureId: string, content: string): string => {
    const normalizedFeatureId = (featureId || '').trim().toLowerCase();
    const normalizedContent = 归一化功能附加块内容(content);
    if (!normalizedFeatureId || !normalizedContent) return '';
    return [
        `<!-- PROMPT_FEATURE:${normalizedFeatureId}:START -->`,
        normalizedContent,
        `<!-- PROMPT_FEATURE:${normalizedFeatureId}:END -->`
    ].join('\n');
};

export const 构建修炼体系附加块 = (content: string): string => (
    构建功能附加块('cultivation', content)
);

const 解析功能附加块 = (
    content: string,
    config?: Partial<游戏设置结构> | null
): string => {
    let next = typeof content === 'string' ? content : '';
    let previous = '';
    while (next !== previous) {
        previous = next;
        next = next.replace(功能附加块正则, (_match, featureId: string, body: string) => (
            功能附加块是否启用(featureId, config)
                ? 归一化功能附加块内容(body)
                : ''
        ));
    }
    return next;
};

export const 按功能开关过滤提示词内容 = (
    content: string,
    config?: Partial<游戏设置结构> | null
): string => {
    let next = 解析功能附加块(typeof content === 'string' ? content : '', config);
    if (config?.启用饱腹口渴系统 === false) {
        next = 过滤饱腹口渴提示词行(next);
    }
    return next
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const 递归裁剪修炼字段 = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => 递归裁剪修炼字段(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    Object.entries(source).forEach(([key, child]) => {
        if (修炼体系字段集合.has(key)) return;
        result[key] = 递归裁剪修炼字段(child);
    });
    return result;
};

export const 裁剪修炼体系上下文数据 = <T>(
    value: T,
    config?: Partial<游戏设置结构> | null
): T => {
    if (config?.启用修炼体系 !== false) return value;
    return 递归裁剪修炼字段(value) as T;
};
