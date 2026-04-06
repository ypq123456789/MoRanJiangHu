import { GameResponse, 记忆系统结构, 记忆配置结构 } from '../../types';
import { 默认中期转长期提示词, 默认短期转中期提示词, 默认NPC记忆总结提示词 } from '../../prompts/runtime/defaults';
import { normalizeCanonicalGameTime } from './timeUtils';

export const 即时短期分隔标记 = '\n<<SHORT_TERM_SYNC>>\n';

export const 拆分即时与短期 = (entry: string): { 即时内容: string; 短期摘要: string } => {
    const raw = (entry || '').trim();
    if (!raw) return { 即时内容: '', 短期摘要: '' };
    const splitAt = raw.lastIndexOf(即时短期分隔标记);
    if (splitAt < 0) return { 即时内容: raw, 短期摘要: '' };
    return {
        即时内容: raw.slice(0, splitAt).trim(),
        短期摘要: raw.slice(splitAt + 即时短期分隔标记.length).trim()
    };
};

export const 格式化回忆名称 = (round: number): string => `【回忆${String(Math.max(1, round)).padStart(3, '0')}】`;

export const 从即时记忆推导回忆档案 = (即时记忆: string[]): 记忆系统结构['回忆档案'] => {
    return 即时记忆
        .map((item, index) => {
            const { 即时内容, 短期摘要 } = 拆分即时与短期(item);
            const hasContent = 即时内容.trim().length > 0 || 短期摘要.trim().length > 0;
            if (!hasContent) return null;
            const round = index + 1;
            return {
                名称: 格式化回忆名称(round),
                概括: 短期摘要.trim(),
                原文: 即时内容.trim(),
                回合: round,
                记录时间: '未知时间',
                时间戳: '未知时间'
            };
        })
        .filter(Boolean) as 记忆系统结构['回忆档案'];
};

export const 规范化记忆系统 = (raw?: Partial<记忆系统结构> | null): 记忆系统结构 => {
    const 即时记忆 = Array.isArray(raw?.即时记忆) ? [...raw!.即时记忆] : [];
    const 回忆档案 = Array.isArray((raw as any)?.回忆档案)
        ? (raw as any).回忆档案
            .map((item: any, idx: number) => {
                if (!item || typeof item !== 'object') return null;
                const round = Number(item.回合);
                const normalizedRound = Number.isFinite(round) && round > 0 ? Math.floor(round) : idx + 1;
                return {
                    名称: typeof item.名称 === 'string' && item.名称.trim()
                        ? item.名称.trim()
                        : 格式化回忆名称(normalizedRound),
                    概括: typeof item.概括 === 'string' ? item.概括 : '',
                    原文: typeof item.原文 === 'string' ? item.原文 : '',
                    回合: normalizedRound,
                    记录时间: typeof item.记录时间 === 'string' ? item.记录时间 : '未知时间',
                    时间戳: typeof item.时间戳 === 'string' ? item.时间戳 : '未知时间'
                };
            })
            .filter(Boolean)
        : 从即时记忆推导回忆档案(即时记忆);

    return {
        回忆档案,
        即时记忆,
        短期记忆: Array.isArray(raw?.短期记忆) ? [...raw!.短期记忆] : [],
        中期记忆: Array.isArray(raw?.中期记忆) ? [...raw!.中期记忆] : [],
        长期记忆: Array.isArray(raw?.长期记忆) ? [...raw!.长期记忆] : []
    };
};

export const 规范化记忆配置 = (raw?: Partial<记忆配置结构> | null): 记忆配置结构 => ({
    短期记忆阈值: Math.max(5, Number(raw?.短期记忆阈值) || 30),
    中期记忆阈值: Math.max(20, Number(raw?.中期记忆阈值) || 50),
    重要角色关键记忆条数N: Math.max(1, Number(raw?.重要角色关键记忆条数N) || 20),
    NPC记忆总结阈值: Math.max(5, Number(raw?.NPC记忆总结阈值) || 20),
    即时消息上传条数N: Math.max(1, Number(raw?.即时消息上传条数N) || 10),
    短期转中期提示词: typeof raw?.短期转中期提示词 === 'string'
        ? raw.短期转中期提示词
        : 默认短期转中期提示词,
    中期转长期提示词: typeof raw?.中期转长期提示词 === 'string'
        ? raw.中期转长期提示词
        : 默认中期转长期提示词,
    NPC记忆总结提示词: typeof raw?.NPC记忆总结提示词 === 'string' && raw.NPC记忆总结提示词.trim().length > 0
        ? raw.NPC记忆总结提示词
        : 默认NPC记忆总结提示词
});

export type 记忆压缩来源层 = '短期' | '中期';
export type 记忆压缩目标层 = '中期' | '长期';

export type 记忆压缩任务结构 = {
    id: string;
    来源层: 记忆压缩来源层;
    目标层: 记忆压缩目标层;
    批次: string[];
    批次条数: number;
    起始索引: number;
    结束索引: number;
    起始时间: string;
    结束时间: string;
    提示词模板: string;
    触发方式?: 'auto' | 'manual';
};

export type 记忆条目时间信息 = {
    开始时间: string;
    结束时间: string;
    内容: string;
};

const 记忆条目时间前缀正则 = /^【\s*(\d{1,6}:\d{1,2}:\d{1,2}:\d{1,2}:\d{1,2})(?:\s*(?:-|~|～|至|->|→)\s*(\d{1,6}:\d{1,2}:\d{1,2}:\d{1,2}:\d{1,2}))?\s*】\s*/;

const 规范化记忆时间值 = (raw?: string): string => (
    normalizeCanonicalGameTime((raw || '').trim()) || (raw || '').trim()
);

export const 解析记忆条目时间信息 = (rawText: string): 记忆条目时间信息 => {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) {
        return { 开始时间: '', 结束时间: '', 内容: '' };
    }
    const match = text.match(记忆条目时间前缀正则);
    if (!match) {
        return { 开始时间: '', 结束时间: '', 内容: text };
    }
    return {
        开始时间: 规范化记忆时间值(match[1]),
        结束时间: 规范化记忆时间值(match[2]),
        内容: text.slice(match[0].length).trim()
    };
};

export const 构建带时间戳的记忆条目 = (
    content: string,
    开始时间?: string,
    结束时间?: string
): string => {
    const normalizedContent = (content || '').trim();
    const start = 规范化记忆时间值(开始时间);
    const end = 规范化记忆时间值(结束时间);
    if (!start) return normalizedContent;
    const prefix = end && end !== start ? `【${start} - ${end}】` : `【${start}】`;
    return normalizedContent ? `${prefix} ${normalizedContent}` : prefix;
};

export const 格式化短期记忆展示文本 = (rawText: string): string => {
    const { 开始时间, 结束时间, 内容 } = 解析记忆条目时间信息(rawText);
    const normalizedContent = 内容.trim();
    if (!开始时间) {
        return (rawText || '').trim();
    }
    const timeLabel = 结束时间 && 结束时间 !== 开始时间
        ? `【${开始时间} - ${结束时间}】：`
        : `【${开始时间}】：`;
    return normalizedContent ? `${timeLabel}\n${normalizedContent}` : timeLabel;
};

const 提取时间列表 = (text: string): string[] => {
    const source = typeof text === 'string' ? text : '';
    const matches = source.match(/\d{1,6}:\d{2}:\d{2}:\d{2}:\d{2}/g) || [];
    return matches
        .map(item => normalizeCanonicalGameTime(item) || item)
        .filter(Boolean);
};

const 从批次提取时间范围 = (batch: string[]): { 起始时间: string; 结束时间: string } => {
    const times = batch
        .flatMap(item => 提取时间列表(item))
        .filter(Boolean);
    if (times.length === 0) {
        return { 起始时间: '未知时间', 结束时间: '未知时间' };
    }
    return {
        起始时间: times[0],
        结束时间: times[times.length - 1]
    };
};

const 构建压缩任务ID = (
    来源层: 记忆压缩来源层,
    批次: string[],
    起始索引: number,
    结束索引: number,
    起始时间: string,
    结束时间: string
): string => {
    const head = (批次[0] || '').slice(0, 80);
    return `${来源层}|${起始索引}|${结束索引}|${批次.length}|${起始时间}|${结束时间}|${head}`;
};

const 构建记忆压缩任务 = (
    来源层: 记忆压缩来源层,
    目标层: 记忆压缩目标层,
    批次: string[],
    起始索引: number,
    结束索引: number,
    提示词模板: string,
    触发方式: 'auto' | 'manual'
): 记忆压缩任务结构 | null => {
    const normalizedBatch = Array.isArray(批次)
        ? 批次.map((item) => (item || '').trim()).filter(Boolean)
        : [];
    if (normalizedBatch.length === 0) return null;
    const safeStartIndex = Math.max(0, Math.min(起始索引, 结束索引));
    const safeEndIndex = Math.max(safeStartIndex, Math.max(起始索引, 结束索引));
    const { 起始时间, 结束时间 } = 从批次提取时间范围(normalizedBatch);
    return {
        id: 构建压缩任务ID(来源层, normalizedBatch, safeStartIndex, safeEndIndex, 起始时间, 结束时间),
        来源层,
        目标层,
        批次: normalizedBatch,
        批次条数: normalizedBatch.length,
        起始索引: safeStartIndex,
        结束索引: safeEndIndex,
        起始时间,
        结束时间,
        提示词模板,
        触发方式
    };
};

export const 构建待处理记忆压缩任务 = (
    memoryBase: 记忆系统结构,
    configBase: 记忆配置结构
): 记忆压缩任务结构 | null => {
    const memory = 规范化记忆系统(memoryBase);
    const config = 规范化记忆配置(configBase);
    const shortLimit = Math.max(5, Number(config.短期记忆阈值) || 30);
    const midLimit = Math.max(20, Number(config.中期记忆阈值) || 50);

    if (memory.短期记忆.length > shortLimit) {
        return 构建记忆压缩任务(
            '短期',
            '中期',
            memory.短期记忆.slice(0, shortLimit),
            0,
            shortLimit - 1,
            config.短期转中期提示词,
            'auto'
        );
    }

    if (memory.中期记忆.length > midLimit) {
        return 构建记忆压缩任务(
            '中期',
            '长期',
            memory.中期记忆.slice(0, midLimit),
            0,
            midLimit - 1,
            config.中期转长期提示词,
            'auto'
        );
    }

    return null;
};

export const 构建手动记忆压缩任务 = (
    memoryBase: 记忆系统结构,
    configBase: 记忆配置结构,
    来源层: 记忆压缩来源层,
    起始索引: number,
    结束索引: number
): 记忆压缩任务结构 | null => {
    const memory = 规范化记忆系统(memoryBase);
    const config = 规范化记忆配置(configBase);
    const sourceList = 来源层 === '短期' ? memory.短期记忆 : memory.中期记忆;
    if (sourceList.length === 0) return null;
    const safeStartIndex = Math.max(0, Math.min(起始索引, 结束索引, sourceList.length - 1));
    const safeEndIndex = Math.max(safeStartIndex, Math.min(Math.max(起始索引, 结束索引), sourceList.length - 1));
    const batch = sourceList.slice(safeStartIndex, safeEndIndex + 1);
    return 构建记忆压缩任务(
        来源层,
        来源层 === '短期' ? '中期' : '长期',
        batch,
        safeStartIndex,
        safeEndIndex,
        来源层 === '短期' ? config.短期转中期提示词 : config.中期转长期提示词,
        'manual'
    );
};

export const 应用记忆压缩结果 = (
    memoryBase: 记忆系统结构,
    task: 记忆压缩任务结构,
    summaryText: string
): 记忆系统结构 => {
    const next = 规范化记忆系统(memoryBase);
    const sourceList = task.来源层 === '短期' ? next.短期记忆 : next.中期记忆;
    const targetList = task.目标层 === '中期' ? next.中期记忆 : next.长期记忆;
    const safeStartIndex = Math.max(0, Math.min(Number(task.起始索引) || 0, Math.max(0, sourceList.length - 1)));
    const safeEndIndex = Math.max(
        safeStartIndex,
        Math.min(Number(task.结束索引) || safeStartIndex, Math.max(0, sourceList.length - 1))
    );
    sourceList.splice(safeStartIndex, Math.max(1, safeEndIndex - safeStartIndex + 1));
    const normalizedSummary = 构建带时间戳的记忆条目(
        (summaryText || '').trim(),
        task.起始时间,
        task.结束时间
    );
    if (normalizedSummary) {
        targetList.push(normalizedSummary);
    }
    return next;
};

export const 生成记忆摘要 = (batch: string[], source: '短期' | '中期'): string => {
    const filtered = batch.map(item => item.trim()).filter(Boolean);
    if (filtered.length === 0) return source === '短期' ? '短期记忆汇总（空）' : '中期记忆汇总（空）';
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    const preview = filtered.slice(0, 3).join('；');
    return `${source}汇总(${filtered.length}): ${first} -> ${last}｜要点: ${preview}`.slice(0, 300);
};

export const 格式化记忆时间 = (raw: string): string => {
    if (typeof raw !== 'string') return '【未知时间】';
    const canonical = normalizeCanonicalGameTime(raw.trim());
    if (!canonical) return `【${raw || '未知时间'}】`;
    return `【${canonical}】`;
};

const 格式化记忆日志标签 = (senderRaw: string): string => {
    const sender = (senderRaw || '').trim();
    if (!sender) return '【旁白】';
    return sender.startsWith('【') ? sender : `【${sender}】`;
};

export const 构建即时记忆条目 = (
    gameTime: string,
    playerInput: string,
    aiData: GameResponse,
    options?: { 省略玩家输入?: boolean }
): string => {
    const timeLabel = 格式化记忆时间(gameTime || '未知时间');
    const logsText = Array.isArray(aiData.logs) && aiData.logs.length > 0
        ? aiData.logs
            .map((log) => `${格式化记忆日志标签(log.sender)}${(log.text || '').trim()}`)
            .join('\n')
        : '（本轮无有效剧情日志）';
    const lines = [timeLabel];
    if (!options?.省略玩家输入) {
        lines.push(`玩家输入：${playerInput || '（空输入）'}`);
    }
    lines.push('AI输出：', logsText);
    return lines.join('\n').trim();
};

export const 构建短期记忆条目 = (gameTime: string, aiData: GameResponse): string => {
    const 清理短期记忆时间前缀 = (text: string): string => (
        (text || '')
            .trim()
            .replace(/^\d{2,4}[:：年\-\/]\d{1,2}(?:[:：月\-\/]\d{1,2})?(?:[:：日号\-\/]\d{1,2})?(?:[:：时分秒卯辰巳午未申酉戌亥子丑寅刻]*)?[，,\s]*/u, '')
            .replace(/^[零一二三四五六七八九十百千两〇○]{1,8}年[零一二三四五六七八九十两〇○]{1,4}月[零一二三四五六七八九十两〇○]{1,4}[日号]?(?:[子丑寅卯辰巳午未申酉戌亥]|[零一二三四五六七八九十两〇○]{1,3}时)?[，,\s]*/u, '')
            .replace(/^(今晨|今日|今天|今夜|今晚|昨夜|昨日|昨天|清晨|早晨|上午|中午|午后|下午|傍晚|夜里|深夜)[，,\s]*/u, '')
            .trim()
    );
    const summary = 清理短期记忆时间前缀((aiData.shortTerm || '').trim()) ||
        (Array.isArray(aiData.logs)
            ? aiData.logs.map(log => `${格式化记忆日志标签(log.sender)}${(log.text || '').trim()}`).join(' ').slice(0, 180)
            : '本回合推进');
    return 构建带时间戳的记忆条目(
        summary.replace(/\s+/g, ' ').trim(),
        gameTime
    );
};

export const 合并即时与短期 = (immediateEntry: string, shortEntry: string): string => {
    const full = immediateEntry.trim();
    const summary = shortEntry.trim();
    if (!summary) return full;
    return `${full}${即时短期分隔标记}${summary}`;
};

export const 写入四段记忆 = (
    memoryBase: 记忆系统结构,
    immediateEntry: string,
    shortEntry: string,
    options?: {
        immediateLimit?: number;
        shortLimit?: number;
        midLimit?: number;
        recordTime?: string;
        timestamp?: string;
    }
): 记忆系统结构 => {
    const next = 规范化记忆系统(memoryBase);
    const full = immediateEntry.trim();
    const summary = shortEntry.trim();
    if (!full && !summary) return next;

    const immediateLimit = Math.max(1, Number(options?.immediateLimit) || 10);
    const shortLimit = Math.max(5, Number(options?.shortLimit) || 30);

    if (full) next.即时记忆.push(合并即时与短期(full, summary));
    else if (summary) next.短期记忆.push(summary);

    if (full || summary) {
        const round = (next.回忆档案?.length || 0) + 1;
        next.回忆档案.push({
            名称: 格式化回忆名称(round),
            概括: summary,
            原文: full,
            回合: round,
            记录时间: normalizeCanonicalGameTime(options?.recordTime || '')
                || options?.recordTime
                || '未知时间',
            时间戳: normalizeCanonicalGameTime(options?.timestamp || options?.recordTime || '')
                || options?.recordTime
                || '未知时间'
        });
    }

    while (next.即时记忆.length > immediateLimit) {
        const shifted = next.即时记忆.shift();
        if (!shifted) continue;
        const { 短期摘要 } = 拆分即时与短期(shifted);
        if (短期摘要) next.短期记忆.push(短期摘要);
    }

    return next;
};
