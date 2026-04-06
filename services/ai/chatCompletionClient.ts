import type { 当前可用接口结构 } from '../../utils/apiConfig';

export type 通用消息角色 = 'system' | 'user' | 'assistant';

export type 通用消息 = {
    role: 通用消息角色;
    content: string;
};

export type 响应格式类型 = 'json_object';

export type 通用流式选项 = {
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
} | undefined;

type 请求协议类型 = 'openai' | 'deepseek';

export class 协议请求错误 extends Error {
    status?: number;
    detail?: string;

    constructor(message: string, status?: number, detail?: string) {
        super(message);
        this.name = '协议请求错误';
        this.status = status;
        this.detail = detail;
    }
}

const 清理末尾斜杠 = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

const 响应详情疑似不支持流式 = (text: string): boolean => {
    const raw = (text || '').toLowerCase();
    if (raw.includes('event-stream')) return true;
    if (raw.includes('sse')) return true;
    if (!raw.includes('stream')) return false;
    return raw.includes('unsupported') || raw.includes('not support') || raw.includes('not supported') || raw.includes('invalid');
};

export const 规范化文本补全消息链 = (
    messages: 通用消息[],
    options?: { 保留System?: boolean; 合并同角色?: boolean }
): 通用消息[] => {
    const keepSystem = options?.保留System !== false;
    const mergeSameRole = options?.合并同角色 !== false;
    const normalized: 通用消息[] = messages
        .map((msg) => ({
            role: msg.role === 'assistant'
                ? 'assistant' as const
                : (msg.role === 'system' && keepSystem ? 'system' as const : 'user' as const),
            content: typeof msg.content === 'string' ? msg.content.trim() : ''
        }))
        .filter(msg => msg.content.length > 0);

    if (!mergeSameRole) return normalized;

    const merged: 通用消息[] = [];
    for (const msg of normalized) {
        const last = merged[merged.length - 1];
        if (last && last.role === msg.role) {
            last.content = `${last.content}\n\n${msg.content}`.trim();
        } else {
            merged.push({ ...msg });
        }
    }

    return merged;
};

const 标准化模型名 = (value: string): string => {
    const raw = (value || '').trim().toLowerCase();
    if (!raw) return '';
    const afterSlash = raw.includes('/') ? (raw.split('/').pop() || raw) : raw;
    return afterSlash.replace(/^models\//, '');
};

export const 是否DeepSeek接口配置 = (apiConfig: 当前可用接口结构): boolean => {
    if (apiConfig.供应商 === 'deepseek') return true;

    const baseUrl = (apiConfig.baseUrl || '').trim().toLowerCase();
    if (baseUrl.includes('deepseek')) return true;

    const model = 标准化模型名(apiConfig.model || '');
    if (!model) return false;
    if (model === 'deepseek-chat' || model === 'deepseek-reasoner') return true;
    if (model.startsWith('deepseek-')) return true;
    if (model.includes('deepseek')) return true;
    return false;
};

const 读取自定义最大输出Token = (apiConfig: 当前可用接口结构): number | undefined => {
    const raw = apiConfig.maxTokens;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return Math.floor(raw);
    }
    return undefined;
};

const 读取自定义温度 = (apiConfig: 当前可用接口结构): number | undefined => {
    const raw = apiConfig.temperature;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
    }
    return undefined;
};

const 约束数值范围 = (value: number, min: number, max: number): number => {
    return Math.min(max, Math.max(min, value));
};

const 提取AI身份名称 = (aiRoleDeclaration: string): string => {
    const source = typeof aiRoleDeclaration === 'string' ? aiRoleDeclaration : '';
    if (!source.trim()) return '';
    const patterns = [
        /你是[“"'`]?([^”"'`\n]{1,80})[”"'`]?/u,
        /以[“"'`]?([^”"'`\n]{1,80})[”"'`]?的身份回复/u
    ];
    for (const pattern of patterns) {
        const matched = source.match(pattern);
        const candidate = matched?.[1]?.trim();
        if (candidate) return candidate;
    }
    return '';
};

export const 替换COT伪装身份占位 = (cotPrompt: string, aiRoleDeclaration: string): string => {
    const source = typeof cotPrompt === 'string' ? cotPrompt : '';
    if (!source.includes('<AI身份名称占位>')) return source;
    const aiIdentity = 提取AI身份名称(aiRoleDeclaration) || 'AI';
    return source.replace(/<AI身份名称占位>/g, aiIdentity);
};

const 计算最大输出Token = (apiConfig: 当前可用接口结构): number => {
    const requested = 读取自定义最大输出Token(apiConfig) ?? 8_192;
    return Math.max(256, Math.floor(requested));
};

const 计算请求温度 = (apiConfig: 当前可用接口结构, fallback: number): number => {
    const configured = 读取自定义温度(apiConfig);
    const base = typeof configured === 'number' ? configured : fallback;
    if (!Number.isFinite(base)) {
        return 0.7;
    }
    return 约束数值范围(base, 0, 2);
};

const 响应格式疑似不受支持 = (baseUrlRaw: string, modelRaw: string): boolean => {
    const lowerUrl = (baseUrlRaw || '').toLowerCase();
    const lowerModel = (modelRaw || '').toLowerCase();

    if (lowerUrl.includes('doubao') || lowerUrl.includes('volcengine')) return true;
    if (lowerUrl.includes('volc') || lowerUrl.includes('bytedance')) return true;
    if (lowerUrl.includes('dashscope') && !lowerModel.includes('qwen-max')) return true;
    return false;
};

const 是否Reasoner模型 = (modelRaw: string): boolean => {
    const model = (modelRaw || '').toLowerCase();
    return model.includes('reasoner') || model.includes('r1');
};

const 是否Claude模型 = (modelRaw: string): boolean => {
    return (modelRaw || '').toLowerCase().includes('claude');
};

const 应用强制JSON消息修正 = (
    messages: 通用消息[],
    responseFormat?: 响应格式类型
): 通用消息[] => {
    if (responseFormat !== 'json_object') return messages;
    const hasJsonKeyword = messages.some(msg => (msg.content || '').toLowerCase().includes('json'));
    if (hasJsonKeyword) return messages;

    const cloned = messages.map(msg => ({ ...msg }));
    const systemIndex = cloned.findIndex(msg => msg.role === 'system');
    if (systemIndex >= 0) {
        cloned[systemIndex] = {
            ...cloned[systemIndex],
            content: `${cloned[systemIndex].content}\n\nRespond in JSON format.`.trim()
        };
    } else {
        cloned.unshift({ role: 'system', content: 'Respond in JSON format.' });
    }
    return cloned;
};

const 应用DeepSeek消息兼容修正 = (
    messages: 通用消息[],
    protocol: 请求协议类型
): 通用消息[] => {
    if (protocol !== 'deepseek') return messages;
    return 规范化文本补全消息链(messages, { 保留System: true, 合并同角色: true });
};

const 读取错误消息 = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || '';
    return String(error);
};

const 读取错误状态码 = (error: unknown): number | undefined => {
    if (!error || typeof error !== 'object') return undefined;
    const anyErr = error as any;
    return anyErr?.status ?? anyErr?.response?.status ?? anyErr?.cause?.status ?? anyErr?.cause?.response?.status;
};

const 是可重试状态码 = (status: number): boolean => {
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
};

const 错误可重试 = (error: unknown): boolean => {
    const status = 读取错误状态码(error);
    if (typeof status === 'number') {
        return 是可重试状态码(status);
    }

    const message = 读取错误消息(error).toLowerCase();
    if (!message) return false;
    if (message.includes('aborted') || message.includes('abort') || message.includes('取消')) return false;
    if (message.includes('service unavailable')) return true;
    if (message.includes('timeout') || message.includes('timed out') || message.includes('network error') || message.includes('fetch failed')) {
        return true;
    }
    return /\b(429|500|502|503|504)\b/.test(message);
};

const 等待可中断 = async (delayMs: number, signal?: AbortSignal): Promise<void> => {
    if (delayMs <= 0) return;
    if (!signal) {
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
        return;
    }
    if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
    }

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);

        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
    });
};

const 带重试执行 = async <T>(
    label: string,
    fn: () => Promise<T>,
    options?: { retries?: number; baseDelayMs?: number; signal?: AbortSignal }
): Promise<T> => {
    const retries = typeof options?.retries === 'number' && options.retries >= 0 ? Math.floor(options.retries) : 2;
    const baseDelayMs = typeof options?.baseDelayMs === 'number' && options.baseDelayMs >= 0
        ? Math.floor(options.baseDelayMs)
        : 800;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
        }

        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const message = 读取错误消息(error).toLowerCase();
            if (message.includes('aborted') || message.includes('abort') || message.includes('取消')) {
                throw error;
            }
            if (!错误可重试(error) || attempt >= retries) {
                throw error;
            }

            const jitter = Math.floor(Math.random() * 250);
            const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
            console.warn(`[AI服务] ${label} 失败，准备重试 (${attempt + 1}/${retries + 1})，${delay}ms`);
            await 等待可中断(delay, options?.signal);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} 请求失败`);
};

const 错误疑似不支持流式 = (error: unknown): boolean => {
    return 响应详情疑似不支持流式(读取错误消息(error));
};

type 增量提取器 = ((payload: any) => string) & {
    finalize?: () => string;
};

const 创建OpenAI流增量提取器 = (): 增量提取器 => {
    let inReasoningPhase = false;
    let needsClosingTag = false;

    const extract = ((payload: any): string => {
        const delta = payload?.choices?.[0]?.delta;
        const reasoningContent = delta?.reasoning_content ?? delta?.reasoning ?? delta?.reasoning_text ?? null;
        const hasReasoningContent = reasoningContent !== null && reasoningContent !== undefined;
        const hasActualContent = typeof delta?.content === 'string' && delta.content.length > 0;

        if (hasReasoningContent) {
            const reasoningText = typeof reasoningContent === 'string' ? reasoningContent : '';
            if (!inReasoningPhase && reasoningText) {
                inReasoningPhase = true;
                needsClosingTag = true;
                return `<think>${reasoningText}`;
            }
            if (inReasoningPhase && reasoningText) {
                return reasoningText;
            }
            return '';
        }

        if (inReasoningPhase && hasActualContent) {
            inReasoningPhase = false;
            needsClosingTag = false;
            return `</think>${delta.content}`;
        }

        if (hasActualContent) {
            return delta.content;
        }

        const messageContent = payload?.choices?.[0]?.message?.content;
        if (typeof messageContent === 'string' && messageContent.length > 0) {
            if (inReasoningPhase) {
                inReasoningPhase = false;
                needsClosingTag = false;
                return `</think>${messageContent}`;
            }
            return messageContent;
        }

        return '';
    }) as 增量提取器;

    extract.finalize = () => {
        if (needsClosingTag) {
            needsClosingTag = false;
            inReasoningPhase = false;
            return '</think>';
        }
        return '';
    };

    return extract;
};

export const 提取OpenAI完整文本 = (payload: any): string => {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((item: any) => {
                if (typeof item === 'string') return item;
                if (typeof item?.text === 'string') return item.text;
                if (typeof item?.content === 'string') return item.content;
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    return '';
};

export const 从Markdown图片中提取DataUrl = (text: string): string => {
    const source = (text || '').trim();
    if (!source) return '';
    const markdownMatch = source.match(/!\[[^\]]*\]\((data:image\/[^)]+)\)/i);
    if (markdownMatch?.[1]) return markdownMatch[1].trim();
    const directMatch = source.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/);
    if (directMatch?.[0]) {
        return directMatch[0].replace(/\s+/g, '');
    }
    return '';
};

export const 读取失败详情文本 = async (response: Response, maxLen = 600): Promise<string> => {
    try {
        const text = (await response.text()).trim();
        if (!text) return '';
        if (!Number.isFinite(maxLen) || maxLen < 0) return text;
        return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    } catch {
        return '';
    }
};

const 解析SSE文本 = async (
    response: Response,
    extractDelta: 增量提取器,
    onDelta?: (delta: string, accumulated: string) => void,
    emptyBodyError = 'Stream body is empty'
): Promise<string> => {
    if (!response.body) throw new Error(emptyBodyError);

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let rawBuffer = '';
    let accumulated = '';
    let rawStreamText = '';
    let sawSseFrame = false;
    let doneSignal = false;
    let pendingJsonPayload = '';

    const emitDelta = (delta: string) => {
        if (!delta) return;
        accumulated += delta;
        onDelta?.(delta, accumulated);
    };

    const 尝试解析JSON并提取 = (payloadText: string): boolean => {
        const payload = payloadText.trim();
        if (!payload) return true;

        try {
            const json = JSON.parse(payload);
            emitDelta(extractDelta(json));
            return true;
        } catch {
            if (!payload.startsWith('{') && !payload.startsWith('[')) {
                emitDelta(payload);
                return true;
            }
            return false;
        }
    };

    const 处理事件块 = (eventBlock: string) => {
        if (!eventBlock.trim()) return;
        const lines = eventBlock.split(/\r?\n/);
        const dataLines: string[] = [];

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            if (line.startsWith(':')) continue;
            if (!line.startsWith('data:')) continue;
            sawSseFrame = true;
            dataLines.push(line.slice(5).trim());
        }

        if (dataLines.length === 0) return;
        const payload = dataLines.join('\n').trim();
        if (!payload) return;
        if (payload === '[DONE]') {
            doneSignal = true;
            return;
        }

        const joinedPayload = pendingJsonPayload
            ? `${pendingJsonPayload}${payload}`
            : payload;
        if (尝试解析JSON并提取(joinedPayload)) {
            pendingJsonPayload = '';
            return;
        }
        pendingJsonPayload = joinedPayload;
    };

    const 刷新事件缓冲 = (flushAll: boolean) => {
        const normalized = rawBuffer.replace(/\r\n/g, '\n');
        const blocks = normalized.split('\n\n');
        let tail = '';
        if (!flushAll) {
            rawBuffer = blocks.pop() || '';
        } else {
            tail = blocks.pop() || '';
            rawBuffer = '';
        }
        for (const block of blocks) {
            处理事件块(block);
            if (doneSignal) break;
        }
        if (flushAll && tail.trim()) {
            处理事件块(tail);
        }
    };

    try {
        while (!doneSignal) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            rawStreamText += chunkText;
            rawBuffer += chunkText;
            刷新事件缓冲(false);
        }

        const tail = decoder.decode();
        if (tail) {
            rawStreamText += tail;
            rawBuffer += tail;
        }
        刷新事件缓冲(true);

        if (pendingJsonPayload) {
            尝试解析JSON并提取(pendingJsonPayload);
            pendingJsonPayload = '';
        }

        if (typeof extractDelta.finalize === 'function') {
            const tailDelta = extractDelta.finalize();
            emitDelta(tailDelta);
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // ignore release errors
        }
    }

    if (!sawSseFrame) {
        const plainPayload = rawStreamText.trim();
        if (plainPayload) {
            emitDelta(plainPayload);
        }
    }

    return accumulated.trim();
};

const 非流式回填流式回调 = (text: string, streamOptions?: 通用流式选项) => {
    if (!streamOptions?.stream || !streamOptions?.onDelta || !text) return;
    streamOptions.onDelta(text, text);
};

const 解析可能是JSON字符串 = (text: string): any | null => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const 构建OpenAI端点 = (
    baseUrlRaw: string,
    supplier: 当前可用接口结构['供应商'],
    modelRaw?: string
): string => {
    const base = 清理末尾斜杠(baseUrlRaw || '');
    if (!base) return '';

    const lowerBase = base.toLowerCase();
    const lowerModel = (modelRaw || '').toLowerCase();
    const isZhipuSupplier = supplier === 'zhipu';
    const looksLikeZhipu = isZhipuSupplier
        || lowerBase.includes('open.bigmodel.cn')
        || lowerBase.includes('bigmodel.cn')
        || lowerModel.includes('glm');

    if (looksLikeZhipu) {
        if (/\/api\/paas\/v4\/chat\/completions$/i.test(base) || /\/chat\/completions$/i.test(base)) return base;
        const withoutV1 = base.replace(/\/v1$/i, '');
        if (/\/api\/paas\/v4$/i.test(withoutV1)) return `${withoutV1}/chat/completions`;
        if (isZhipuSupplier) return withoutV1;
        return `${withoutV1}/api/paas/v4/chat/completions`;
    }

    if (/\/v1\/chat\/completions$/i.test(base) || /\/chat\/completions$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
    return `${base}/v1/chat/completions`;
};

const 请求OpenAI家族文本 = async (
    apiConfig: 当前可用接口结构,
    protocol: 请求协议类型,
    messages: 通用消息[],
    temperature: number,
    signal?: AbortSignal,
    streamOptions?: 通用流式选项,
    responseFormat?: 响应格式类型,
    errorDetailLimit?: number
): Promise<string> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');
    const endpoint = 构建OpenAI端点(apiConfig.baseUrl, apiConfig.供应商, apiConfig.model);
    if (!endpoint) throw new Error('Missing API Base URL');
    const enableStream = !!streamOptions?.stream;
    let useStream = enableStream;
    let downgradedFromStream = false;

    for (let pass = 0; pass < 2; pass++) {
        const maxOutputTokens = 计算最大输出Token(apiConfig);
        const body: Record<string, unknown> = {
            model: apiConfig.model,
            messages,
            temperature,
            stream: useStream,
            max_tokens: maxOutputTokens
        };
        if (responseFormat === 'json_object') {
            body.response_format = { type: 'json_object' };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`
            },
            body: JSON.stringify(body),
            signal
        });

        if (!response.ok) {
            const detail = await 读取失败详情文本(response, errorDetailLimit);
            if (useStream && 响应详情疑似不支持流式(detail) && !downgradedFromStream) {
                useStream = false;
                downgradedFromStream = true;
                continue;
            }
            throw new 协议请求错误(`API Error: ${response.status}${detail ? ` - ${detail}` : ''}`, response.status, detail);
        }

        if (!useStream) {
            const rawText = await response.text();
            const json = 解析可能是JSON字符串(rawText);
            const content = json ? 提取OpenAI完整文本(json) : rawText;
            const finalText = (typeof content === 'string' ? content : '').trim();
            非流式回填流式回调(finalText, streamOptions);
            return finalText;
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/event-stream')) {
            if (!downgradedFromStream) {
                useStream = false;
                downgradedFromStream = true;
                continue;
            }
            throw new 协议请求错误(`API Error: stream unsupported (content-type=${contentType || 'unknown'})`);
        }

        try {
            return await 解析SSE文本(response, 创建OpenAI流增量提取器(), streamOptions?.onDelta, 'Stream body is empty');
        } catch (error) {
            if (!downgradedFromStream && 错误疑似不支持流式(error)) {
                useStream = false;
                downgradedFromStream = true;
                continue;
            }
            throw error;
        }
    }

    throw new Error('OpenAI-compatible API call failed after stream downgrade');
};

export const 请求模型文本 = async (
    apiConfig: 当前可用接口结构,
    messages: 通用消息[],
    options: {
        temperature: number;
        signal?: AbortSignal;
        streamOptions?: 通用流式选项;
        responseFormat?: 响应格式类型;
        errorDetailLimit?: number;
    }
): Promise<string> => {
    const protocol: 请求协议类型 = 是否DeepSeek接口配置(apiConfig) ? 'deepseek' : 'openai';
    const resolvedTemperature = 计算请求温度(apiConfig, options.temperature);
    const requestedResponseFormat = options.responseFormat;
    const shouldSkipResponseFormat = 是否Reasoner模型(apiConfig.model)
        || 是否Claude模型(apiConfig.model)
        || 响应格式疑似不受支持(apiConfig.baseUrl, apiConfig.model);
    const effectiveResponseFormat = (requestedResponseFormat && !shouldSkipResponseFormat)
        ? requestedResponseFormat
        : undefined;
    const normalizedMessages = 应用DeepSeek消息兼容修正(
        应用强制JSON消息修正(messages, effectiveResponseFormat),
        protocol
    );

    return 带重试执行(`请求模型文本(${protocol})`, async () => {
        return 请求OpenAI家族文本(
            apiConfig,
            protocol,
            normalizedMessages,
            resolvedTemperature,
            options.signal,
            options.streamOptions,
            effectiveResponseFormat,
            options.errorDetailLimit
        );
    }, {
        signal: options.signal,
        retries: 2,
        baseDelayMs: 800
    });
};
