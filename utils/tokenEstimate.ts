import { 聊天记录结构, 提示词结构 } from '../types';
import { Tiktoken } from 'js-tiktoken/lite';
import cl100k_base from 'js-tiktoken/ranks/cl100k_base';
import o200k_base from 'js-tiktoken/ranks/o200k_base';

type OpenAI编码名称 = 'cl100k_base' | 'o200k_base';

const OpenAI消息固定开销 = 3;
const OpenAI名称额外开销 = 1;
const OpenAI回复预留开销 = 3;
const 文本Token缓存上限 = 256;

const 分词器缓存: Partial<Record<OpenAI编码名称, Tiktoken>> = {};
const 文本Token缓存 = new Map<string, number>();

const 归一化模型名 = (model?: string): string => (
    typeof model === 'string'
        ? model.trim().toLowerCase()
        : ''
);

export const 解析OpenAI编码名称 = (model?: string): OpenAI编码名称 => {
    const normalized = 归一化模型名(model);
    if (!normalized) return 'o200k_base';

    if (
        normalized.includes('gpt-4o') ||
        normalized.includes('gpt-4.1') ||
        normalized.includes('gpt-4.5') ||
        normalized.includes('gpt-5') ||
        normalized.includes('o1') ||
        normalized.includes('o3') ||
        normalized.includes('o4') ||
        normalized.includes('gpt-oss')
    ) {
        return 'o200k_base';
    }

    if (
        normalized.includes('gpt-4') ||
        normalized.includes('gpt-3.5') ||
        normalized.includes('text-embedding-3') ||
        normalized.includes('text-embedding-ada') ||
        normalized.includes('text-moderation')
    ) {
        return 'cl100k_base';
    }

    return 'o200k_base';
};

const 获取OpenAI分词器 = (encodingOrModel?: OpenAI编码名称 | string): Tiktoken => {
    const encoding = encodingOrModel === 'cl100k_base' || encodingOrModel === 'o200k_base'
        ? encodingOrModel
        : 解析OpenAI编码名称(encodingOrModel);
    const cached = 分词器缓存[encoding];
    if (cached) return cached;

    const next = new Tiktoken(encoding === 'cl100k_base' ? cl100k_base : o200k_base);
    分词器缓存[encoding] = next;
    return next;
};

const 读取文本Token缓存 = (key: string): number | undefined => {
    const hit = 文本Token缓存.get(key);
    if (hit === undefined) return undefined;
    文本Token缓存.delete(key);
    文本Token缓存.set(key, hit);
    return hit;
};

const 写入文本Token缓存 = (key: string, value: number): void => {
    if (文本Token缓存.has(key)) {
        文本Token缓存.delete(key);
    }
    文本Token缓存.set(key, value);
    if (文本Token缓存.size <= 文本Token缓存上限) return;
    const oldestKey = 文本Token缓存.keys().next().value;
    if (typeof oldestKey === 'string') {
        文本Token缓存.delete(oldestKey);
    }
};

const 按编码统计文本Token = (text: string, encoding: OpenAI编码名称): number => {
    const src = typeof text === 'string' ? text : '';
    if (src.length === 0) return 0;
    const cacheKey = `${encoding}\u0000${src}`;
    const cached = 读取文本Token缓存(cacheKey);
    if (cached !== undefined) return cached;
    const tokenCount = 获取OpenAI分词器(encoding).encode(src).length;
    写入文本Token缓存(cacheKey, tokenCount);
    return tokenCount;
};

export type OpenAI聊天消息结构 = {
    role?: string;
    content?: string;
    name?: string;
};

export type OpenAI聊天消息Token明细 = {
    role: string;
    content: string;
    name?: string;
    roleTokens: number;
    contentTokens: number;
    nameTokens: number;
    wrapperTokens: number;
    primingTokens: number;
    totalTokens: number;
};

export type OpenAI聊天消息Token统计 = {
    encoding: OpenAI编码名称;
    items: OpenAI聊天消息Token明细[];
    totalTokens: number;
};

export type TokenEstimateBreakdown = {
    chars: number;
    cjk: number;
    latinWords: number;
    numbers: number;
    symbols: number;
    estimatedTokens: number;
};

export const countOpenAITextTokens = (text: string, model?: string): number => {
    const encoding = 解析OpenAI编码名称(model);
    return 按编码统计文本Token(text, encoding);
};

export const countOpenAIChatMessagesTokensWithBreakdown = (
    messages: OpenAI聊天消息结构[],
    model?: string
): OpenAI聊天消息Token统计 => {
    const encoding = 解析OpenAI编码名称(model);
    const normalizedMessages = (Array.isArray(messages) ? messages : []).map((item) => ({
        role: typeof item?.role === 'string' ? item.role.trim() : '',
        content: typeof item?.content === 'string' ? item.content : '',
        name: typeof item?.name === 'string' ? item.name : ''
    }));

    const items = normalizedMessages.map<OpenAI聊天消息Token明细>((item) => {
        const roleTokens = 按编码统计文本Token(item.role, encoding);
        const contentTokens = 按编码统计文本Token(item.content, encoding);
        const nameTokens = item.name
            ? 按编码统计文本Token(item.name, encoding) + OpenAI名称额外开销
            : 0;
        const wrapperTokens = OpenAI消息固定开销;
        return {
            role: item.role,
            content: item.content,
            name: item.name || undefined,
            roleTokens,
            contentTokens,
            nameTokens,
            wrapperTokens,
            primingTokens: 0,
            totalTokens: wrapperTokens + roleTokens + contentTokens + nameTokens
        };
    });

    if (items.length > 0) {
        const last = items[items.length - 1];
        last.primingTokens = OpenAI回复预留开销;
        last.totalTokens += OpenAI回复预留开销;
    }

    return {
        encoding,
        items,
        totalTokens: items.reduce((sum, item) => sum + item.totalTokens, 0)
    };
};

export const countOpenAIChatMessagesTokens = (
    messages: OpenAI聊天消息结构[],
    model?: string
): number => countOpenAIChatMessagesTokensWithBreakdown(messages, model).totalTokens;

export const estimateTextTokens = (text: string, model?: string): number => (
    countOpenAITextTokens(text, model)
);

export const estimateTextTokensWithBreakdown = (text: string, model?: string): TokenEstimateBreakdown => {
    const src = typeof text === 'string' ? text : '';
    if (src.length === 0) {
        return { chars: 0, cjk: 0, latinWords: 0, numbers: 0, symbols: 0, estimatedTokens: 0 };
    }
    const cjkMatches = src.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
    const latinWordMatches = src.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    const numberMatches = src.match(/\d+(?:\.\d+)?/g) || [];
    const noSpaceChars = src.replace(/\s+/g, '').length;
    const cjkChars = cjkMatches.length;
    const latinChars = latinWordMatches.join('').length;
    const numberChars = numberMatches.join('').replace(/\./g, '').length;
    const symbolChars = Math.max(0, noSpaceChars - cjkChars - latinChars - numberChars);
    return {
        chars: src.length,
        cjk: cjkChars,
        latinWords: latinWordMatches.length,
        numbers: numberMatches.length,
        symbols: symbolChars,
        estimatedTokens: countOpenAITextTokens(src, model)
    };
};

export const buildHistoryTokenSource = (item: 聊天记录结构): string => {
    if (item.role === 'assistant' && item.structuredResponse) {
        const thinkingKeys = [
            'thinking_pre',
            't_input',
            't_plan',
            't_var_plan',
            't_state',
            't_branch',
            't_precheck',
            't_logcheck',
            't_var',
            't_npc',
            't_cmd',
            't_audit',
            't_fix',
            'thinking_post',
            't_mem',
            't_opts'
        ] as const;
        const thinkingText = thinkingKeys
            .map((key) => item.structuredResponse?.[key] || '')
            .filter(Boolean)
            .join('\n');
        const logs = Array.isArray(item.structuredResponse.logs)
            ? item.structuredResponse.logs.map((log) => `${log.sender}：${log.text || ''}`).join('\n')
            : '';
        const shortTerm = item.structuredResponse.shortTerm || '';
        const actionOptions = Array.isArray(item.structuredResponse.action_options)
            ? item.structuredResponse.action_options.join('\n')
            : '';
        return [thinkingText, logs, shortTerm, actionOptions].filter(Boolean).join('\n');
    }
    return item.content || '';
};

export const estimateHistoryItemTokens = (item: 聊天记录结构, model?: string): number => {
    return countOpenAITextTokens(buildHistoryTokenSource(item), model);
};

export const estimateHistoryTokens = (history: 聊天记录结构[], model?: string): number => {
    return (history || []).reduce((sum, item) => sum + estimateHistoryItemTokens(item, model), 0);
};

export const estimatePromptPoolTokens = (prompts: 提示词结构[], model?: string): number => {
    const enabled = (prompts || []).filter((prompt) => prompt.启用);
    return enabled.reduce((sum, prompt) => sum + countOpenAITextTokens(prompt.内容 || '', model), 0);
};
