import type { NPC总结记忆, NPC结构, NPC记忆 } from '../../models/social';
import type { 记忆配置结构 } from '../../models/system';
import { 规范化记忆配置 } from './memoryUtils';
import { normalizeCanonicalGameTime } from './timeUtils';

export type NPC原始记忆展示项 = {
    标签: string;
    原始索引: number;
    时间: string;
    内容: string;
};

export type NPC总结记忆展示项 = {
    标签: string;
    索引范围: string;
    开始索引: number;
    结束索引: number;
    时间: string;
    内容: string;
    条数: number;
};

export type NPC记忆展示结果 = {
    总结记忆: NPC总结记忆展示项[];
    记忆: NPC原始记忆展示项[];
    原始总数: number;
};

export type NPC记忆总结候选 = {
    批次: NPC记忆[];
    批次条数: number;
    起始原始索引: number;
    结束原始索引: number;
    起始时间: string;
    结束时间: string;
    预留原始条数: number;
};

const 规范化时间 = (raw: unknown): string => {
    if (typeof raw !== 'string') return '未知时间';
    const trimmed = raw.trim();
    return normalizeCanonicalGameTime(trimmed) || trimmed || '未知时间';
};

const 清理内容 = (raw: unknown): string => (
    typeof raw === 'string'
        ? raw.trim().replace(/\s+/g, ' ')
        : String(raw ?? '').trim()
);

const 构建时间范围标签 = (start: string, end: string): string => {
    const 开始 = 规范化时间(start);
    const 结束 = 规范化时间(end);
    return 开始 === 结束 ? `[${开始}]` : `[${开始}-${结束}]`;
};

const 规范化原始记忆 = (memories: NPC记忆[] | undefined): NPC记忆[] => (
    (Array.isArray(memories) ? memories : [])
        .map((item) => ({
            时间: 规范化时间(item?.时间),
            内容: 清理内容(item?.内容)
        }))
        .filter((item) => item.内容.length > 0)
);

const 规范化总结记忆 = (summaries: NPC总结记忆[] | undefined): NPC总结记忆[] => (
    (Array.isArray(summaries) ? summaries : [])
        .map((item) => {
            const 开始索引 = Math.max(0, Math.trunc(Number(item?.开始索引) || 0));
            const 结束索引 = Math.max(开始索引, Math.trunc(Number(item?.结束索引) || 开始索引));
            const 开始时间 = 规范化时间(item?.开始时间);
            const 结束时间 = 规范化时间(item?.结束时间 || item?.开始时间);
            const 时间 = typeof item?.时间 === 'string' && item.时间.trim().length > 0
                ? item.时间.trim()
                : 构建时间范围标签(开始时间, 结束时间);
            const 内容 = 清理内容(item?.内容);
            if (!内容) return null;
            return {
                内容,
                时间,
                开始时间,
                结束时间,
                开始索引,
                结束索引,
                条数: Math.max(1, Math.trunc(Number(item?.条数) || (结束索引 - 开始索引 + 1)))
            };
        })
        .filter(Boolean)
        .sort((a, b) => a!.开始索引 - b!.开始索引) as NPC总结记忆[]
);

const 取NPC总结预留原始条数 = (threshold: number, customRawLimit?: number): number => {
    if (Number.isFinite(Number(customRawLimit)) && Number(customRawLimit) > 0) {
        return Math.max(1, Math.trunc(Number(customRawLimit)));
    }
    return Math.min(5, Math.max(1, threshold - 1));
};

const 取当前原始起始索引 = (summaries: NPC总结记忆[]): number => {
    if (summaries.length === 0) return 0;
    const latest = summaries[summaries.length - 1];
    return Math.max(0, latest.结束索引 + 1);
};

export const 构建NPC记忆总结回退文案 = (batch: NPC记忆[]): string => {
    const unique: string[] = [];
    for (const entry of batch) {
        const text = 清理内容(entry.内容);
        if (!text) continue;
        if (!unique.includes(text)) unique.push(text);
    }
    if (unique.length === 0) return `该角色在这段时间里留下了 ${batch.length} 条可追溯记忆。`;
    const previewCount = Math.min(3, unique.length);
    const preview = unique
        .slice(0, previewCount)
        .map((item) => item.length > 28 ? `${item.slice(0, 28)}...` : item)
        .join('；');
    const suffix = unique.length > previewCount ? '；等经历逐渐沉淀。' : '。';
    return `${preview}${suffix}`;
};

export const 构建自动NPC记忆总结候选 = (
    memories: NPC记忆[] | undefined,
    configBase: Partial<记忆配置结构> | null | undefined
): NPC记忆总结候选 | null => {
    const config = 规范化记忆配置(configBase);
    const normalized = 规范化原始记忆(memories);
    const threshold = Math.max(5, Number(config.NPC记忆总结阈值) || 20);
    const reserveCount = 取NPC总结预留原始条数(threshold);
    if (normalized.length < threshold) return null;
    const batchSize = Math.max(1, threshold - reserveCount);
    const batch = normalized.slice(0, batchSize);
    if (batch.length === 0) return null;
    return {
        批次: batch,
        批次条数: batch.length,
        起始原始索引: 0,
        结束原始索引: batch.length - 1,
        起始时间: batch[0].时间 || '未知时间',
        结束时间: batch[batch.length - 1].时间 || batch[0].时间 || '未知时间',
        预留原始条数: Math.max(0, normalized.length - batch.length)
    };
};

export const 构建手动NPC记忆总结候选 = (
    memories: NPC记忆[] | undefined,
    configBase: Partial<记忆配置结构> | null | undefined
): NPC记忆总结候选 | null => {
    const config = 规范化记忆配置(configBase);
    const normalized = 规范化原始记忆(memories);
    if (normalized.length < 2) return null;
    const threshold = Math.max(5, Number(config.NPC记忆总结阈值) || 20);
    const reserveCount = Math.min(取NPC总结预留原始条数(threshold), Math.max(1, normalized.length - 1));
    const batchSize = Math.max(1, normalized.length - reserveCount);
    const batch = normalized.slice(0, batchSize);
    return {
        批次: batch,
        批次条数: batch.length,
        起始原始索引: 0,
        结束原始索引: batch.length - 1,
        起始时间: batch[0].时间 || '未知时间',
        结束时间: batch[batch.length - 1].时间 || batch[0].时间 || '未知时间',
        预留原始条数: Math.max(0, normalized.length - batch.length)
    };
};

export const 应用NPC记忆总结 = (
    npc: NPC结构,
    candidate: NPC记忆总结候选,
    summaryText: string
): NPC结构 => {
    const normalizedSummaries = 规范化总结记忆(npc?.总结记忆);
    const normalizedMemories = 规范化原始记忆(npc?.记忆);
    const summaryStartIndex = 取当前原始起始索引(normalizedSummaries);
    const summaryEndIndex = summaryStartIndex + candidate.批次条数 - 1;
    const safeSummaryText = 清理内容(summaryText) || 构建NPC记忆总结回退文案(candidate.批次);
    const nextSummary: NPC总结记忆 = {
        内容: safeSummaryText,
        开始时间: candidate.起始时间,
        结束时间: candidate.结束时间,
        时间: 构建时间范围标签(candidate.起始时间, candidate.结束时间),
        开始索引: summaryStartIndex,
        结束索引: summaryEndIndex,
        条数: candidate.批次条数
    };
    return {
        ...npc,
        总结记忆: [...normalizedSummaries, nextSummary],
        记忆: normalizedMemories.slice(candidate.批次条数)
    };
};

export const 构建NPC记忆展示结果 = (
    summaries: NPC总结记忆[] | undefined,
    memories: NPC记忆[] | undefined
): NPC记忆展示结果 => {
    const normalizedSummaries = 规范化总结记忆(summaries);
    const normalizedMemories = 规范化原始记忆(memories);
    const rawStartIndex = 取当前原始起始索引(normalizedSummaries);

    const 总结记忆: NPC总结记忆展示项[] = normalizedSummaries.map((item, index) => ({
        标签: `[${index}]`,
        索引范围: `[${item.开始索引}-${item.结束索引}]`,
        开始索引: item.开始索引,
        结束索引: item.结束索引,
        时间: item.时间 || 构建时间范围标签(item.开始时间, item.结束时间),
        内容: item.内容,
        条数: item.条数
    }));

    const 记忆: NPC原始记忆展示项[] = normalizedMemories.map((item, index) => ({
        标签: `[${rawStartIndex + index}]`,
        原始索引: rawStartIndex + index,
        时间: item.时间,
        内容: item.内容
    }));

    return {
        总结记忆,
        记忆,
        原始总数: normalizedSummaries.reduce((sum, item) => sum + item.条数, 0) + normalizedMemories.length
    };
};
