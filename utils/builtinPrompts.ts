import type {
    世界书内置分类,
    世界书条目结构,
    内置提示词分类,
    内置提示词导出结构,
    内置提示词条目结构
} from '../types';
import {
    创建内置预设世界书,
    获取剧情风格世界书槽位,
    渲染世界书模板文本,
    世界书本体槽位
} from './worldbook';
import { 构建变量模型用户附加规则提示词, 构建变量模型用户提示词模板 } from '../prompts/runtime/variableModel';

export const 内置提示词存储键 = 'builtin_prompt_entries';
export const 内置提示词导出版本 = 1;
export const 内置提示词分类顺序: 内置提示词分类[] = ['常驻', '开局', '主剧情', '变量生成', '文章优化', '回忆', '世界演变'];

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value : '');

const 生成ID = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const 排除槽位集合 = new Set<string>([
    世界书本体槽位.主剧情世界观
]);

const 变量模型用户槽位集合 = new Set<string>([
    世界书本体槽位.变量模型用户_常规,
    世界书本体槽位.变量模型用户_世界演变已更新
]);

const 看起来像旧变量模型模板 = (content: string): boolean => {
    const normalized = 读取文本(content).trim();
    if (!normalized) return false;
    if (normalized === 构建变量模型用户提示词模板().trim()) return true;
    return normalized.includes('${stateJson}')
        || normalized.includes('${recentRoundsBlock}')
        || normalized.includes('${currentRoundBlock}')
        || normalized.includes('${responseLogs}')
        || normalized.includes('【当前状态基底 JSON】');
};

const 规范化内置提示词内容 = (slotId: string, content: unknown): string => {
    const normalized = 读取文本(content);
    if (变量模型用户槽位集合.has(slotId) && 看起来像旧变量模型模板(normalized)) {
        return 构建变量模型用户附加规则提示词();
    }
    return normalized;
};

const 转换世界书条目为内置提示词 = (entry: 世界书条目结构): 内置提示词条目结构 | null => {
    const slotId = 读取文本(entry.内置槽位 || entry.id).trim();
    if (!slotId || 排除槽位集合.has(slotId)) return null;
    const category = 读取文本(entry.内置分类).trim() as 世界书内置分类;
    if (!category) return null;
    return {
        id: entry.id || 生成ID('builtin_prompt'),
        槽位ID: slotId,
        标题: 读取文本(entry.标题).trim() || '未命名内置提示词',
        分类: category,
        内容: 规范化内置提示词内容(slotId, entry.内容),
        启用: false,
        创建时间: entry.创建时间 || Date.now(),
        更新时间: entry.更新时间 || Date.now()
    };
};

export const 创建默认内置提示词列表 = (): 内置提示词条目结构[] => {
    const builtinBook = 创建内置预设世界书();
    return (Array.isArray(builtinBook.条目) ? builtinBook.条目 : [])
        .map(转换世界书条目为内置提示词)
        .filter((item): item is 内置提示词条目结构 => Boolean(item));
};

const 默认内置提示词映射 = (): Map<string, 内置提示词条目结构> => (
    new Map(创建默认内置提示词列表().map((item) => [item.槽位ID, item]))
);

export const 规范化内置提示词列表 = (raw: unknown): 内置提示词条目结构[] => {
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as any).entries)
            ? (raw as any).entries
            : [];
    const defaultMap = 默认内置提示词映射();
    const mergedMap = new Map<string, 内置提示词条目结构>(defaultMap);

    list.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const source = item as Partial<内置提示词条目结构>;
        const base = defaultMap.get(读取文本(source.槽位ID).trim()) || null;
        const slotId = 读取文本(source.槽位ID ?? base?.槽位ID).trim();
        if (!slotId || 排除槽位集合.has(slotId)) return;
        const now = Date.now();
        const normalized: 内置提示词条目结构 = {
            id: 读取文本(source.id ?? base?.id).trim() || 生成ID('builtin_prompt'),
            槽位ID: slotId,
            标题: 读取文本(source.标题 ?? base?.标题).trim() || '未命名内置提示词',
            分类: (读取文本(source.分类 ?? base?.分类).trim() as 内置提示词分类) || '常驻',
            内容: 规范化内置提示词内容(slotId, source.内容 ?? base?.内容),
            启用: source.启用 !== undefined ? source.启用 === true : base?.启用 === true,
            创建时间: Number.isFinite(source.创建时间) ? Number(source.创建时间) : (base?.创建时间 || now),
            更新时间: Number.isFinite(source.更新时间) ? Number(source.更新时间) : now
        };
        mergedMap.set(slotId, normalized);
    });

    return Array.from(mergedMap.values()).sort((a, b) => {
        const categoryOrderDiff = 内置提示词分类顺序.indexOf(a.分类) - 内置提示词分类顺序.indexOf(b.分类);
        if (categoryOrderDiff !== 0) return categoryOrderDiff;
        return (a.更新时间 || 0) - (b.更新时间 || 0);
    });
};

export const 获取内置提示词槽位原文 = (
    entries: 内置提示词条目结构[] | undefined,
    slotId: string
): string => {
    const normalizedEntries = 规范化内置提示词列表(Array.isArray(entries) ? entries : []);
    const matched = normalizedEntries.find((item) => item.槽位ID === slotId && item.启用 !== false);
    return matched?.内容 || '';
};

export const 获取内置提示词槽位内容 = (params: {
    entries?: 内置提示词条目结构[];
    slotId: string;
    fallback: string;
    variables?: Record<string, string | number | boolean | null | undefined>;
}): string => {
    const slotContent = 获取内置提示词槽位原文(params.entries, params.slotId);
    return 渲染世界书模板文本(slotContent || params.fallback, params.variables);
};

export const 构建内置提示词导出数据 = (entries: 内置提示词条目结构[]): 内置提示词导出结构 => ({
    version: 内置提示词导出版本,
    exportedAt: new Date().toISOString(),
    entries: 规范化内置提示词列表(entries)
});

export const 解析内置提示词导入数据 = (payload: unknown): 内置提示词条目结构[] => 规范化内置提示词列表(payload);

export {
    世界书本体槽位,
    获取剧情风格世界书槽位 as 获取剧情风格内置槽位
};
