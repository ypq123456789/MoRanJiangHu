import { countOpenAIChatMessagesTokens, type OpenAI聊天消息结构 } from './tokenEstimate';

export const DEFAULT_REVIEW_CONTEXT_WINDOW = 128000;
export const REVIEW_ABSOLUTE_CHARACTER_CAP = 8000000;
export const MIN_REVIEW_CONTEXT_WINDOW = 4096;
export const MAX_REVIEW_CONTEXT_WINDOW = 16000000;

export interface ReviewModelCapacity {
    contextWindowTokens?: number;
    inputTokenLimit?: number;
}
export interface VariableReviewCapacity {
    estimatedInputTokens: number;
    contextWindowTokens: number;
    maxOutputTokens: number;
    safetyReserveTokens: number;
    inputBudgetTokens: number;
    remainingTokens: number;
    withinBudget: boolean;
    source: 'manual' | 'metadata-context' | 'metadata-input' | 'fallback';
    characters: number;
    model: string;
}
export const validReviewContextTokens = (value: unknown): number | undefined => {
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n >= MIN_REVIEW_CONTEXT_WINDOW && n <= MAX_REVIEW_CONTEXT_WINDOW ? n : undefined;
};
export const readReviewModelCapacity = (raw: any): ReviewModelCapacity => {
    const minimum = (values: unknown[]) => {
        const valid = values.filter(value => typeof value === 'number' || typeof value === 'string').map(Number)
            .filter(n => Number.isInteger(n) && n > 0 && n <= MAX_REVIEW_CONTEXT_WINDOW);
        return valid.length ? Math.min(...valid) : undefined;
    };
    const contextWindowTokens = minimum([raw?.contextWindowTokens, raw?.context_window, raw?.context_length, raw?.contextWindow, raw?.context_window_tokens, raw?.max_context_length, raw?.max_context_tokens, raw?.top_provider?.context_length, raw?.limits?.context_window]);
    const inputTokenLimit = minimum([raw?.inputTokenLimit, raw?.input_token_limit, raw?.max_input_tokens, raw?.maxInputTokens, raw?.limits?.input_tokens]);
    return { ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}), ...(inputTokenLimit !== undefined ? { inputTokenLimit } : {}) };
};

export class VariableReviewCapacityError extends Error {
    constructor(message: string, public capacity?: VariableReviewCapacity) {
        super(message); this.name = 'VariableReviewCapacityError';
    }
}
// 这是构造字符串前的内存保险，不代表模型容量。图片/cache已在调用前排除。
export const assertReviewAbsoluteSize = (value: unknown, cap = REVIEW_ABSOLUTE_CHARACTER_CAP): void => {
    let characters = 0;
    const visit = (v: any): void => {
        if (typeof v === 'string') characters += v.length;
        else if (Array.isArray(v)) { characters += v.length + 2; for (const item of v) visit(item); }
        else if (v && typeof v === 'object') {
            for (const key of Object.keys(v)) { characters += key.length + 4; visit(v[key]); }
        } else characters += 8;
        if (characters > cap) throw new VariableReviewCapacityError(`变量审查上下文过大：超过工程字符安全上限 ${cap.toLocaleString()}，未发起请求。此上限仅用于异常内存保护。`);
    };
    visit(value);
};
export const calculateVariableReviewCapacity = (params: {
    messages: OpenAI聊天消息结构[];
    model: string;
    maxOutputTokens: number;
    contextWindowTokens?: number;
    metadata?: ReviewModelCapacity;
    absoluteCharacterCap?: number;
}): VariableReviewCapacity => {
    const characters = params.messages.reduce((n, m) => n + (m.content?.length || 0), 0);
    if (characters > (params.absoluteCharacterCap ?? REVIEW_ABSOLUTE_CHARACTER_CAP)) throw new VariableReviewCapacityError('变量审查上下文过大：超过工程字符安全上限，未发起请求。');
    const manual = validReviewContextTokens(params.contextWindowTokens);
    const metadata = readReviewModelCapacity(params.metadata);
    const contextWindowTokens = manual ?? metadata?.contextWindowTokens ?? metadata?.inputTokenLimit ?? DEFAULT_REVIEW_CONTEXT_WINDOW;
    const source = manual ? 'manual' : metadata?.contextWindowTokens ? 'metadata-context' : metadata?.inputTokenLimit ? 'metadata-input' : 'fallback';
    // 复用现有密度估算，取两种编码口径的较大值，再加15%估算余量。
    const estimatedInputTokens = Math.ceil(Math.max(countOpenAIChatMessagesTokens(params.messages, params.model), countOpenAIChatMessagesTokens(params.messages, 'gpt-4')) * 1.15);
    const maxOutputTokens = Math.max(1, Math.floor(params.maxOutputTokens));
    const safetyReserveTokens = Math.max(8192, Math.ceil(contextWindowTokens * 0.04));
    const inputBudgetTokens = Math.min(contextWindowTokens - maxOutputTokens - safetyReserveTokens,
        !manual && metadata?.inputTokenLimit !== undefined ? metadata.inputTokenLimit - safetyReserveTokens : Infinity);
    const remainingTokens = inputBudgetTokens - estimatedInputTokens;
    return { estimatedInputTokens, contextWindowTokens, maxOutputTokens, safetyReserveTokens, inputBudgetTokens, remainingTokens, withinBudget: remainingTokens >= 0, source, characters, model: params.model };
};
export const assertVariableReviewCapacity = (capacity: VariableReviewCapacity): void => {
    if (!capacity.withinBudget) throw new VariableReviewCapacityError(
        `当前变量审查上下文预计超过所选模型容量。预计输入：${capacity.estimatedInputTokens.toLocaleString()} tokens；模型上下文：${capacity.contextWindowTokens.toLocaleString()}；最大输出：${capacity.maxOutputTokens.toLocaleString()}；安全预留：${capacity.safetyReserveTokens.toLocaleString()}。请使用更大上下文模型或上下文窗口设置，缩短自定义审查 Prompt；分域审查保留为后续功能。未发起请求，也未裁掉业务数据。`, capacity);
};
