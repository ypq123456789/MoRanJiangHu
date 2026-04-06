import { 记忆系统结构 } from '../../types';
import { 规范化记忆系统, 格式化回忆名称 } from './memoryUtils';

export type 剧情回忆候选 = {
    id: string;
    回合: number;
    概括: string;
    原文: string;
    是否完整原文: boolean;
    排序值: number;
    相关度: number;
};

export const 提取剧情回忆标签 = (rawContent: string): { cleanInput: string; recallTag: string } => {
    const source = typeof rawContent === 'string' ? rawContent : '';
    const matches = Array.from(source.matchAll(/<剧情回忆>([\s\S]*?)<\/剧情回忆>/g));
    const recallTag = matches.map((m) => (m[1] || '').trim()).filter(Boolean).join('\n\n');
    const cleanInput = source.replace(/<剧情回忆>[\s\S]*?<\/剧情回忆>/g, '').trim();
    return { cleanInput, recallTag };
};

const 解析回忆序号列表 = (line: string): string[] => {
    const set = new Set<string>();
    const matches: string[] = line.match(/【回忆\s*\d+\s*】/g) || [];
    matches.forEach((item) => {
        const numMatch = String(item).match(/\d+/);
        if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            set.add(格式化回忆名称(num));
        }
    });
    return Array.from(set);
};

export const 解析剧情回忆输出 = (raw: string): { strongIds: string[]; weakIds: string[]; normalizedText: string } => {
    const text = (raw || '').trim();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    const strongLine = lines.find((line) => /(?:^|[^a-zA-Z0-9])强回忆\s*[:：]/.test(line)) || '强回忆:无';
    const weakLine = lines.find((line) => /(?:^|[^a-zA-Z0-9])弱回忆\s*[:：]/.test(line)) || '弱回忆:无';
    const strongIds = 解析回忆序号列表(strongLine);
    const weakIds = 解析回忆序号列表(weakLine).filter((id) => !strongIds.includes(id));
    const normalizedStrong = strongIds.length > 0 ? `强回忆:${strongIds.join('|')}` : '强回忆:无';
    const normalizedWeak = weakIds.length > 0 ? `弱回忆:${weakIds.join('|')}` : '弱回忆:无';

    return {
        strongIds,
        weakIds,
        normalizedText: `${normalizedStrong}\n${normalizedWeak}`
    };
};

const 提取检索词 = (raw: string): string[] => {
    const text = (raw || '').trim().toLowerCase();
    if (!text) return [];
    const terms = new Set<string>();
    const asciiTerms: string[] = text.match(/[a-z0-9_]+/g) || [];
    asciiTerms.forEach((item) => {
        if (item.length >= 2) terms.add(item);
    });
    const hanBlocks: string[] = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
    hanBlocks.forEach((block) => {
        terms.add(block);
        if (block.length >= 3) {
            for (let i = 0; i < block.length - 1; i += 1) {
                terms.add(block.slice(i, i + 2));
            }
        }
        if (block.length >= 4) {
            for (let i = 0; i < block.length - 2; i += 1) {
                terms.add(block.slice(i, i + 3));
            }
        }
    });
    return Array.from(terms).filter(item => item.length >= 2);
};

const 计算候选相关度 = (
    query: string,
    queryTerms: string[],
    candidateText: string,
    index: number,
    total: number
): number => {
    const text = candidateText.toLowerCase();
    if (!text.trim()) return 0;
    let score = 0;
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery && text.includes(normalizedQuery)) {
        score += 12;
    }
    queryTerms.forEach((term) => {
        if (!term || !text.includes(term)) return;
        score += term.length >= 4 ? 5 : term.length === 3 ? 3 : 1.5;
    });
    const recencyBoost = total > 0 ? ((index + 1) / total) * 3 : 0;
    return score + recencyBoost;
};

export const 预筛剧情回忆候选 = (
    playerInput: string,
    mem: 记忆系统结构,
    fullCount: number,
    options?: {
        topK?: number;
        recentReserve?: number;
    }
): 剧情回忆候选[] => {
    const normalized = 规范化记忆系统(mem);
    const archives = Array.isArray(normalized.回忆档案) ? [...normalized.回忆档案] : [];
    if (archives.length === 0) return [];
    const sorted = archives.sort((a, b) => (a.回合 || 0) - (b.回合 || 0));
    const fullN = Math.max(1, Math.floor(fullCount || 20));
    const fullStartIndex = Math.max(0, sorted.length - fullN);
    const queryTerms = 提取检索词(playerInput);
    const topK = Math.max(4, Math.floor(options?.topK || 24));
    const recentReserve = Math.max(2, Math.floor(options?.recentReserve || 6));
    const scored = sorted.map((item, idx) => {
        const name = typeof item?.名称 === 'string' && item.名称.trim().length > 0
            ? item.名称.trim()
            : 格式化回忆名称((item?.回合 || idx + 1));
        const summary = (item?.概括 || '').trim();
        const raw = (item?.原文 || '').trim();
        const 是否完整原文 = idx >= fullStartIndex;
        const searchable = [name, summary, raw].filter(Boolean).join('\n');
        return {
            id: name,
            回合: item?.回合 || idx + 1,
            概括: summary,
            原文: raw,
            是否完整原文,
            排序值: idx,
            相关度: 计算候选相关度(playerInput, queryTerms, searchable, idx, sorted.length)
        };
    });

    const topScored = [...scored]
        .sort((a, b) => b.相关度 - a.相关度 || b.排序值 - a.排序值)
        .slice(0, topK);
    const recentTail = scored.slice(-recentReserve);
    return Array.from(new Map(
        [...topScored, ...recentTail]
            .sort((a, b) => a.排序值 - b.排序值)
            .map(item => [item.id, item] as const)
    ).values());
};

export const 构建剧情回忆检索上下文 = (
    mem: 记忆系统结构,
    fullCount: number,
    options?: { candidateIds?: string[] }
): string => {
    const normalized = 规范化记忆系统(mem);
    const archives = Array.isArray(normalized.回忆档案) ? [...normalized.回忆档案] : [];
    if (archives.length === 0) return '暂无可用回忆。';
    const sorted = archives.sort((a, b) => (a.回合 || 0) - (b.回合 || 0));
    const fullN = Math.max(1, Math.floor(fullCount || 20));
    const fullStartIndex = Math.max(0, sorted.length - fullN);
    const candidateIdSet = options?.candidateIds && options.candidateIds.length > 0
        ? new Set(options.candidateIds)
        : null;
    const candidateSummaryLine = candidateIdSet
        ? `【本地预筛可能相关】\n${Array.from(candidateIdSet).join(' | ')}`
        : '';
    const body = sorted.map((item, idx) => {
        const name = typeof item?.名称 === 'string' && item.名称.trim().length > 0
            ? item.名称.trim()
            : 格式化回忆名称((item?.回合 || idx + 1));
        const candidateMarker = candidateIdSet?.has(name) ? '\n本地预筛：可能相关' : '';
        if (idx >= fullStartIndex) {
            return `${name}：${candidateMarker}\n原文：\n${(item?.原文 || '').trim() || '（无原文）'}`;
        }
        return `${name}：${candidateMarker}\n短期记忆：${(item?.概括 || '').trim() || '（无概括）'}`;
    }).filter(Boolean).join('\n\n');

    return [candidateSummaryLine, body].filter(Boolean).join('\n\n');
};

export const 基于候选生成回忆回退结果 = (
    candidates: 剧情回忆候选[]
): { strongIds: string[]; weakIds: string[]; normalizedText: string } => {
    const sorted = [...candidates].sort((a, b) => b.相关度 - a.相关度 || b.排序值 - a.排序值);
    const topScore = sorted[0]?.相关度 || 0;
    const strongCandidates = sorted.filter((item, idx) => {
        if (idx === 0) return true;
        if (item.相关度 <= 0) return false;
        if (idx < 3 && item.相关度 >= topScore * 0.6) return true;
        if (idx < 6 && item.相关度 >= topScore * 0.72) return true;
        return item.相关度 >= Math.max(8, topScore * 0.82);
    });
    const strongIds = strongCandidates
        .slice(0, 6)
        .map(item => item.id);
    const weakIds = sorted
        .filter(item => !strongIds.includes(item.id))
        .slice(0, 6)
        .map(item => item.id)
        .filter(id => !strongIds.includes(id));
    return {
        strongIds,
        weakIds,
        normalizedText: [
            strongIds.length > 0 ? `强回忆:${strongIds.join('|')}` : '强回忆:无',
            weakIds.length > 0 ? `弱回忆:${weakIds.join('|')}` : '弱回忆:无'
        ].join('\n')
    };
};

export const 根据检索结果构建剧情回忆标签 = (
    mem: 记忆系统结构,
    parsed: { strongIds: string[]; weakIds: string[] }
): string => {
    const normalizedMem = 规范化记忆系统(mem);
    const archives = Array.isArray(normalizedMem.回忆档案) ? normalizedMem.回忆档案 : [];
    const mapByName = new Map<string, any>(archives.map((item) => [item.名称, item]));

    const uniqueStrong = Array.from(new Set(parsed.strongIds));
    const uniqueWeak = Array.from(new Set(parsed.weakIds.filter((id) => !uniqueStrong.includes(id))));

    const strongBlocks = uniqueStrong.map((id) => {
        const matched = mapByName.get(id);
        const rawText = typeof matched?.原文 === 'string' ? matched.原文.trim() : '';
        return `${id}：\n${rawText || '（无原文）'}`;
    });
    const weakBlocks = uniqueWeak.map((id) => {
        const matched = mapByName.get(id);
        const summary = typeof matched?.概括 === 'string' ? matched.概括.trim() : '';
        return `${id}：\n${summary || '（无概括）'}`;
    });

    return [
        '强回忆：',
        strongBlocks.length > 0 ? strongBlocks.join('\n\n') : '无',
        '',
        '弱回忆：',
        weakBlocks.length > 0 ? weakBlocks.join('\n\n') : '无'
    ].join('\n').trim();
};
