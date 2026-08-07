import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { isNativeCapacitorEnvironment } from '../../utils/nativeRuntime';
import { OpenAI兼容地址已包含版本路径, 去除OpenAI兼容聊天端点 } from '../../utils/openAICompatibleEndpoint';
import { 小米MiMo稳定输出预设 } from '../../prompts/providers/xiaomiMiMoStablePreset';
import { GLM稳定输出预设 } from '../../prompts/providers/glmStablePreset';

export type 通用消息角色 = 'system' | 'user' | 'assistant';

export type 通用消息 = {
    role: 通用消息角色;
    content: string;
    prefix?: boolean;
};

export type 响应格式类型 = 'json_object';

export type 通用流式结束信息 = {
    /** 是否收到了上游的 [DONE] 结束信号；false 表示连接被上游提前关闭（常见于内容审核拦截或代理断流）。 */
    sawDone: boolean;
    /** SSE 最后一帧的 finish_reason（如有）；'content_filter' 表示明确命中上游内容审核。 */
    finishReason?: string;
    /** 流结束时的累积文本长度。 */
    accumulatedLength: number;
};

export type 通用流式选项 = {
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
    onStreamEnd?: (info: 通用流式结束信息) => void;
} | undefined;

export type 模型请求附加选项 = {
    includeReasoning?: boolean;
    disableThinking?: boolean;
    stripReasoning?: boolean;
    prefixMode?: boolean;
    glmHTMLCommentThinking?: boolean;
};

type 请求协议类型 = 'openai' | 'deepseek' | 'glm';

type 原生聊天流事件 = {
    requestId?: string;
    type?: 'meta' | 'chunk' | 'done' | 'error';
    text?: string;
    message?: string;
    status?: number;
    contentType?: string;
    byteLength?: number;
};

type 原生聊天流插件 = {
    streamChat(options: {
        requestId: string;
        endpoint: string;
        headers: Record<string, string>;
        body: string;
    }): Promise<void>;
    cancelStream(options: { requestId: string }): Promise<void>;
    addListener(
        eventName: 'chatStream',
        listenerFunc: (event: 原生聊天流事件) => void
    ): Promise<PluginListenerHandle>;
};

const 原生聊天流 = registerPlugin<原生聊天流插件>('NativeChatStreamer');

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
        .map((msg) => {
            const isPrefix = msg.prefix === true;
            return {
                role: msg.role === 'assistant'
                    ? 'assistant' as const
                    : (msg.role === 'system' && keepSystem ? 'system' as const : 'user' as const),
                content: typeof msg.content === 'string'
                    ? (isPrefix ? msg.content : msg.content.trim())
                    : '',
                prefix: isPrefix ? true : undefined
            };
        })
        .filter(msg => msg.content.length > 0);

    if (!mergeSameRole) return normalized;

    const merged: 通用消息[] = [];
    for (const msg of normalized) {
        const last = merged[merged.length - 1];
        if (last && last.role === msg.role && last.prefix !== true && msg.prefix !== true) {
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

export const 规范化请求模型名称 = (value: string): string => {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^[\x20-\x7E]+$/.test(raw)) return raw;

    let candidate = raw;
    for (let index = 0; index < 3; index += 1) {
        const next = candidate
            .replace(/[\s_-]*[（(【\[][^）)】\]]*[）)】\]]\s*$/u, '')
            .trim();
        if (next === candidate) break;
        candidate = next;
    }

    if (/^[\x20-\x7E]+$/.test(candidate)) return candidate;

    const nonAsciiIndex = [...candidate].findIndex((char) => char.charCodeAt(0) > 0x7E);
    if (nonAsciiIndex > 0) {
        const asciiPrefix = [...candidate]
            .slice(0, nonAsciiIndex)
            .join('')
            .replace(/[\s_\-:/\\[(（【]+$/u, '')
            .trim();
        if (/[A-Za-z0-9]/.test(asciiPrefix) && /^[\x20-\x7E]+$/.test(asciiPrefix)) {
            return asciiPrefix;
        }
    }

    return raw;
};

export const 是否DeepSeek原生接口配置 = (apiConfig: 当前可用接口结构): boolean => {
    if (apiConfig.供应商 === 'deepseek') return true;

    const baseUrl = (apiConfig.baseUrl || '').trim().toLowerCase();
    if (baseUrl.includes('deepseek')) return true;
    return false;
};

export const 是否小米MiMo接口配置 = (apiConfig: 当前可用接口结构): boolean => {
    if (apiConfig.供应商 === 'mimo_api' || apiConfig.供应商 === 'mimo_token_plan') return true;
    const baseUrl = (apiConfig.baseUrl || '').trim().toLowerCase();
    return baseUrl.includes('xiaomimimo.com');
};

const 读取小米MiMo推荐超参 = (modelRaw: string): { temperature: number; topP: number; maxTemperature: number; minTopP: number; maxTopP: number } => {
    const model = 标准化模型名(modelRaw || '');
    if (model.includes('tts')) {
        return { temperature: 0.6, topP: 0.95, maxTemperature: 1.5, minTopP: 0.01, maxTopP: 1 };
    }
    if (model === 'mimo-v2-flash') {
        return { temperature: 0.3, topP: 0.95, maxTemperature: 1.5, minTopP: 0.01, maxTopP: 1 };
    }
    return { temperature: 1.0, topP: 0.95, maxTemperature: 1.5, minTopP: 0.01, maxTopP: 1 };
};

export const 构建OpenAI家族请求头 = (apiConfig: 当前可用接口结构): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (是否小米MiMo接口配置(apiConfig)) {
        headers['api-key'] = apiConfig.apiKey;
    } else {
        headers.Authorization = `Bearer ${apiConfig.apiKey}`;
    }
    return headers;
};

const 错误疑似不支持Prefix = (error: unknown): boolean => {
    const message = 读取错误消息(error).toLowerCase();
    if (!message) return false;
    if (message.includes('prefix')) return true;
    if (message.includes('/beta')) return true;
    if (message.includes('invalid') && message.includes('assistant')) return true;
    if (message.includes('unsupported') && message.includes('prefill')) return true;
    if (message.includes('not support') && message.includes('prefill')) return true;
    return false;
};

const 响应详情疑似不支持Prefix = (text: string): boolean => {
    const message = (text || '').toLowerCase();
    if (!message) return false;
    if (message.includes('prefix')) return true;
    if (message.includes('/beta')) return true;
    if (message.includes('invalid') && message.includes('assistant')) return true;
    if (message.includes('unsupported') && message.includes('prefill')) return true;
    if (message.includes('not support') && message.includes('prefill')) return true;
    return false;
};

export const 是否DeepSeek模型配置 = (apiConfig: 当前可用接口结构): boolean => {
    if (是否DeepSeek原生接口配置(apiConfig)) return true;
    const model = 标准化模型名(apiConfig.model || '');
    if (!model) return false;
    if (model === 'deepseek-chat' || model === 'deepseek-reasoner') return true;
    if (model.startsWith('deepseek-')) return true;
    if (model.includes('deepseek')) return true;
    return false;
};

export const 是否DeepSeek接口配置 = 是否DeepSeek模型配置;

export const 是否GLM接口配置 = (apiConfig: 当前可用接口结构): boolean => {
    if (apiConfig.供应商 === 'zhipu') return true;
    const baseUrl = (apiConfig.baseUrl || '').trim().toLowerCase();
    if (baseUrl.includes('bigmodel.cn')) return true;
    const model = 标准化模型名(apiConfig.model || '');
    if (!model) return false;
    if (model.includes('glm')) return true;
    return false;
};

const 解析请求协议类型 = (apiConfig: 当前可用接口结构): 请求协议类型 => {
    if (是否DeepSeek原生接口配置(apiConfig)) return 'deepseek';
    if (是否GLM接口配置(apiConfig)) return 'glm';
    return 'openai';
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

const 读取自定义TopP = (apiConfig: 当前可用接口结构): number | undefined => {
    const raw = apiConfig.topP;
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

const 读取模型最大输出上限 = (apiConfig: 当前可用接口结构): number => {
    const model = 标准化模型名(apiConfig.model || '');
    const baseUrl = (apiConfig.baseUrl || '').toLowerCase();

    if (model === 'deepseek-chat') return 8_192;
    if (model === 'deepseek-reasoner') return 65_536;
    if (model.includes('deepseek-v4') || model.includes('deepseek-v3') || baseUrl.includes('deepseek')) return 393_216;
    if (model.startsWith('gpt-4.1')) return 32_768;
    if (model.startsWith('gpt-4o')) return 16_384;
    if (model.includes('claude') || model.startsWith('gemini-2.5')) return 65_536;
    return 128_000;
};

const 计算最大输出Token = (apiConfig: 当前可用接口结构): number => {
    const requested = 读取自定义最大输出Token(apiConfig) ?? 8_192;
    return 约束数值范围(Math.floor(requested), 256, 读取模型最大输出上限(apiConfig));
};

const 计算请求温度 = (apiConfig: 当前可用接口结构, fallback: number): number => {
    const configured = 读取自定义温度(apiConfig);
    if (是否小米MiMo接口配置(apiConfig)) {
        const recommended = 读取小米MiMo推荐超参(apiConfig.model);
        const base = typeof configured === 'number' ? configured : recommended.temperature;
        if (!Number.isFinite(base)) {
            return recommended.temperature;
        }
        return 约束数值范围(base, 0, recommended.maxTemperature);
    }
    const base = typeof configured === 'number' ? configured : fallback;
    if (!Number.isFinite(base)) {
        return 0.7;
    }
    return 约束数值范围(base, 0, 2);
};

const 计算小米MiMoTopP = (apiConfig: 当前可用接口结构, requestModel?: string): number => {
    const recommended = 读取小米MiMo推荐超参(requestModel || apiConfig.model);
    const configured = 读取自定义TopP(apiConfig);
    const base = typeof configured === 'number' ? configured : recommended.topP;
    if (!Number.isFinite(base)) {
        return recommended.topP;
    }
    return 约束数值范围(base, recommended.minTopP, recommended.maxTopP);
};

const 响应格式疑似不受支持 = (baseUrlRaw: string, modelRaw: string): boolean => {
    const lowerUrl = (baseUrlRaw || '').toLowerCase();
    const lowerModel = (modelRaw || '').toLowerCase();

    if (lowerUrl.includes('doubao') || lowerUrl.includes('volcengine')) return true;
    if (lowerUrl.includes('volc') || lowerUrl.includes('bytedance')) return true;
    if (lowerUrl.includes('ark.cn') || lowerUrl.includes('volces.com')) return true;
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

const 是否GeminiDeepResearch模型 = (modelRaw: string): boolean => {
    const model = 标准化模型名(modelRaw || '');
    return model.includes('deep-research');
};

const 是否Gemini接口地址 = (baseUrlRaw: string): boolean => {
    const baseUrl = (baseUrlRaw || '').toLowerCase();
    return baseUrl.includes('generativelanguage.googleapis.com') || baseUrl.includes('googleapis.com');
};

const 构建GeminiInteractions端点 = (baseUrlRaw: string): string => {
    const base = 清理末尾斜杠(baseUrlRaw || '');
    if (!base) return '';
    if (/\/v1beta\/interactions$/i.test(base) || /\/v1\/interactions$/i.test(base)) return base;
    if (/\/v1beta\/openai$/i.test(base)) return `${base.replace(/\/openai$/i, '')}/interactions`;
    if (/\/v1\/openai$/i.test(base)) return `${base.replace(/\/openai$/i, '')}/interactions`;
    if (/\/v1beta$/i.test(base) || /\/v1$/i.test(base)) return `${base}/interactions`;
    return `${base}/v1beta/interactions`;
};

const 是否Claude兼容末尾User模型 = (apiConfig: 当前可用接口结构): boolean => {
    const model = (apiConfig.model || '').toLowerCase();
    const baseUrl = (apiConfig.baseUrl || '').toLowerCase();
    const supplier = (apiConfig.供应商 || '').toLowerCase();
    return supplier.includes('claude')
        || supplier.includes('anthropic')
        || baseUrl.includes('anthropic')
        || baseUrl.includes('claude')
        || model.includes('claude')
        || model.includes('opus')
        || model.includes('sonnet')
        || model.includes('haiku')
        || model.includes('max');
};

const 上下文完整性校验标记前缀 = '[CTXCHK:';
const 上下文完整性校验标记后缀 = ']';
const 上下文完整性校验最小字符数 = 80_000;
const 已触发上下文截断警告 = new Set<string>();

type 上下文完整性校验结果 = {
    injectedMessages: 通用消息[];
    checkTag: string;
    messageCount: number;
    totalChars: number;
};

const 生成校验标记 = (): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let tag = '';
    for (let i = 0; i < 6; i += 1) {
        tag += chars[Math.floor(Math.random() * chars.length)];
    }
    return tag;
};

const 注入上下文完整性校验标记 = (
    messages: 通用消息[],
    apiConfig: 当前可用接口结构
): 上下文完整性校验结果 => {
    const endpointKey = (apiConfig.baseUrl || '').toLowerCase().replace(/\/+$/, '');
    if (!endpointKey) return { injectedMessages: messages, checkTag: '', messageCount: messages.length, totalChars: 0 };
    if (已触发上下文截断警告.has(endpointKey)) return { injectedMessages: messages, checkTag: '', messageCount: messages.length, totalChars: 0 };

    const messageCount = messages.length;
    const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
    if (totalChars < 上下文完整性校验最小字符数) {
        return { injectedMessages: messages, checkTag: '', messageCount, totalChars };
    }

    const checkTag = `${上下文完整性校验标记前缀}${生成校验标记()}${上下文完整性校验标记后缀}`;

    const lastSystemIndex = messages.findLastIndex(msg => msg.role === 'system');
    if (lastSystemIndex < 0) {
        const injectedMessages: 通用消息[] = [
            { role: 'system', content: `上下文校验：本次请求包含 ${messageCount} 条消息约 ${totalChars} 字符。请在最终响应末尾原样输出校验标记 ${checkTag}。` },
            ...messages
        ];
        return { injectedMessages, checkTag, messageCount, totalChars };
    }

    const injectedMessages = messages.map((msg, index) => {
        if (index !== lastSystemIndex) return msg;
        const suffix = `\n上下文校验：本次请求包含 ${messageCount} 条消息约 ${totalChars} 字符。请在最终响应末尾原样输出校验标记 ${checkTag}。`;
        return { ...msg, content: `${msg.content || ''}${suffix}` };
    });
    return { injectedMessages, checkTag, messageCount, totalChars };
};

const 检查上下文完整性 = (
    responseText: string,
    checkTag: string,
    apiConfig: 当前可用接口结构,
    messageCount: number,
    totalChars: number
): void => {
    if (!checkTag) return;
    const endpointKey = (apiConfig.baseUrl || '').toLowerCase().replace(/\/+$/, '');
    if (已触发上下文截断警告.has(endpointKey)) return;

    const tagInResponse = responseText.includes(checkTag);
    if (tagInResponse) return;

    const lower = responseText.toLowerCase();
    const msgCountMentioned = lower.includes(`${messageCount} 条消息`) || lower.includes(`${messageCount} 条`)
        || lower.includes(`${messageCount} messages`) || lower.includes(`message count: ${messageCount}`);
    const charsMentioned = lower.includes(`${totalChars} 字`) || lower.includes(`${totalChars} char`)
        || lower.includes(`${totalChars} 字符`);

    if (msgCountMentioned || charsMentioned) return;

    已触发上下文截断警告.add(endpointKey);
    const supplierName = apiConfig.供应商 || '';
    const baseUrl = apiConfig.baseUrl || '';
    console.warn(
        `[上下文完整性警告] API 供应商="${supplierName}" baseUrl="${baseUrl}" 可能存在上下文截断：`
        + `发送了 ${messageCount} 条消息约 ${totalChars} 字符，但 AI 响应未校验到完整性标记。`
        + `这通常意味着该 API 端点或中转服务悄悄丢弃了部分消息。建议使用官方渠道或支持完整上下文的 API。`
    );
};

const 移除上下文完整性校验标记 = (responseText: string, checkTag: string): string => {
    if (!checkTag || !responseText.includes(checkTag)) return responseText;
    const escapedTag = checkTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return responseText
        .replace(new RegExp(`\\s*${escapedTag}\\s*$`), '')
        .replace(new RegExp(escapedTag, 'g'), '')
        .trimEnd();
};

export const __测试__清除已触发上下文截断警告 = (): void => {
    已触发上下文截断警告.clear();
};

export const 应用Claude兼容末尾User修正 = (
    messages: 通用消息[],
    apiConfig: 当前可用接口结构
): 通用消息[] => {
    if (!是否Claude兼容末尾User模型(apiConfig)) return messages;
    const last = messages[messages.length - 1];
    if (!last || last.role === 'user') return messages;
    return [
        ...messages,
        {
            role: 'user',
            content: '请根据以上全部上下文和任务要求继续执行，并直接输出本次任务的最终结果。'
        }
    ];
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
    const normalized = 规范化文本补全消息链(messages, { 保留System: true, 合并同角色: true });

    while (normalized.length > 0) {
        const tail = normalized[normalized.length - 1];
        if (tail.role === 'assistant' && tail.prefix !== true) {
            normalized.pop();
            continue;
        }
        break;
    }

    const firstNonSystemIndex = normalized.findIndex(msg => msg.role !== 'system');
    if (firstNonSystemIndex >= 0) {
        const firstNonSystem = normalized[firstNonSystemIndex];
        const hasUserAfter = normalized.slice(firstNonSystemIndex + 1).some(msg => msg.role === 'user');
        if (firstNonSystem.role === 'assistant' && firstNonSystem.prefix !== true && !hasUserAfter) {
            normalized[firstNonSystemIndex] = {
                role: 'user',
                content: firstNonSystem.content
            };
        }
    }

    const nonSystemMessages = normalized.filter(msg => msg.role !== 'system');
    const userIndexes = normalized
        .map((msg, index) => ({ msg, index }))
        .filter(item => item.msg.role === 'user')
        .map(item => item.index);
    const assistantBeforeOnlyUser = nonSystemMessages
        .filter(msg => msg.role === 'assistant' && msg.prefix !== true)
        .map(msg => msg.content)
        .filter(Boolean);

    if (userIndexes.length === 1 && assistantBeforeOnlyUser.length > 0) {
        const userIndex = userIndexes[0];
        const userMessage = normalized[userIndex];
        normalized[userIndex] = {
            ...userMessage,
            content: [
                '【前置任务说明】',
                assistantBeforeOnlyUser.join('\n\n'),
                '',
                '【当前用户触发】',
                userMessage.content
            ].join('\n').trim()
        };
        for (let index = normalized.length - 1; index >= 0; index--) {
            if (index !== userIndex && normalized[index].role === 'assistant' && normalized[index].prefix !== true) {
                normalized.splice(index, 1);
            }
        }
    }

    const last = normalized[normalized.length - 1];
    if (last?.role === 'assistant' && last.prefix === true) return normalized;
    const lastNonSystem = [...normalized].reverse().find(msg => msg.role !== 'system');
    if (lastNonSystem && lastNonSystem.role !== 'user') {
        normalized.push({
            role: 'user',
            content: '请继续执行上一条任务，并严格按既定输出协议完成回复。'
        });
    }

    return normalized;
};

const 应用GLM消息兼容修正 = (
    messages: 通用消息[],
    protocol: 请求协议类型
): 通用消息[] => {
    if (protocol !== 'glm') return messages;
    const normalized = 规范化文本补全消息链(messages, { 保留System: true, 合并同角色: true });

    // GLM 不支持尾部非 prefix assistant 消息 — 移除尾部非 prefix assistant
    while (normalized.length > 0) {
        const tail = normalized[normalized.length - 1];
        if (tail.role === 'assistant' && tail.prefix !== true) {
            normalized.pop();
            continue;
        }
        break;
    }

    // GLM 对首条非 system 消息为 assistant 更敏感 — 首条非 system 的 assistant 转为 user
    const firstNonSystemIndex = normalized.findIndex(msg => msg.role !== 'system');
    if (firstNonSystemIndex >= 0) {
        const firstNonSystem = normalized[firstNonSystemIndex];
        const hasUserAfter = normalized.slice(firstNonSystemIndex + 1).some(msg => msg.role === 'user');
        if (firstNonSystem.role === 'assistant' && firstNonSystem.prefix !== true && !hasUserAfter) {
            normalized[firstNonSystemIndex] = {
                role: 'user',
                content: firstNonSystem.content
            };
        }
    }

    // GLM 对连续 assistant 消息更敏感：合并 assistant-before-only-user 模式
    const nonSystemMessages = normalized.filter(msg => msg.role !== 'system');
    const userIndexes = normalized
        .map((msg, index) => ({ msg, index }))
        .filter(item => item.msg.role === 'user')
        .map(item => item.index);
    const assistantBeforeOnlyUser = nonSystemMessages
        .filter(msg => msg.role === 'assistant' && msg.prefix !== true)
        .map(msg => msg.content)
        .filter(Boolean);

    if (userIndexes.length === 1 && assistantBeforeOnlyUser.length > 0) {
        const userIndex = userIndexes[0];
        const userMessage = normalized[userIndex];
        normalized[userIndex] = {
            ...userMessage,
            content: [
                '【前置任务说明】',
                assistantBeforeOnlyUser.join('\n\n'),
                '',
                '【当前用户触发】',
                userMessage.content
            ].join('\n').trim()
        };
        for (let index = normalized.length - 1; index >= 0; index--) {
            if (index !== userIndex && normalized[index].role === 'assistant' && normalized[index].prefix !== true) {
                normalized.splice(index, 1);
            }
        }
    }

    // 末尾必须为 user 角色消息（prefix assistant 除外）
    const last = normalized[normalized.length - 1];
    if (last?.role === 'assistant' && last.prefix === true) return normalized;
    const lastNonSystem = [...normalized].reverse().find(msg => msg.role !== 'system');
    if (lastNonSystem && lastNonSystem.role !== 'user') {
        normalized.push({
            role: 'user',
            content: '请继续执行上一条任务，并严格按既定输出协议完成回复。'
        });
    }

    return normalized;
};

const 读取错误消息 = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || '';
    return String(error);
};

export const 是否流式连接中断错误消息 = (message: string): boolean => {
    const raw = (message || '').toLowerCase();
    if (!raw) return false;
    if (raw.includes('unexpected end of stream')) return true;
    if (raw.includes('end of stream')) return true;
    if (raw.includes('eofexception')) return true;
    if (raw.includes('connection reset')) return true;
    if (raw.includes('socket closed')) return true;
    if (raw.includes('broken pipe')) return true;
    if (raw.includes('stream was reset')) return true;
    return raw.includes('protocol exception') && raw.includes('stream');
};

export const 规范化流式连接错误提示 = (message: string): string => {
    const raw = (message || '').trim();
    if (!是否流式连接中断错误消息(raw)) return raw;
    return '模型流式连接中途断开，通常是网络波动、代理断流或上游模型服务提前关闭连接导致。系统会自动重试；如果仍失败，请稍后重试或切换网络/API节点。';
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
    if (是否流式连接中断错误消息(message)) return true;
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

const 创建OpenAI流增量提取器 = (options?: { includeReasoning?: boolean }): 增量提取器 => {
    const includeReasoning = options?.includeReasoning === true;
    let inReasoningPhase = false;
    let needsClosingTag = false;

    const extract = ((payload: any): string => {
        const delta = payload?.choices?.[0]?.delta;
        const reasoningContent = delta?.reasoning_content ?? delta?.reasoning ?? delta?.reasoning_text ?? null;
        const hasReasoningContent = reasoningContent !== null && reasoningContent !== undefined;
        const hasActualContent = typeof delta?.content === 'string' && delta.content.length > 0;

        if (hasReasoningContent) {
            const reasoningText = typeof reasoningContent === 'string' ? reasoningContent : '';
            if (!includeReasoning) return '';
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
            return includeReasoning ? `</think>${delta.content}` : delta.content;
        }

        if (hasActualContent) {
            return delta.content;
        }

        const messageContent = payload?.choices?.[0]?.message?.content;
        if (typeof messageContent === 'string' && messageContent.length > 0) {
            if (inReasoningPhase) {
                inReasoningPhase = false;
                needsClosingTag = false;
                return includeReasoning ? `</think>${messageContent}` : messageContent;
            }
            return messageContent;
        }

        return '';
    }) as 增量提取器;

    extract.finalize = () => {
        if (includeReasoning && needsClosingTag) {
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

const 创建SSE文本处理器 = (
    extractDelta: 增量提取器,
    onDelta?: (delta: string, accumulated: string) => void,
    onStreamEnd?: (info: 通用流式结束信息) => void
) => {
    let rawBuffer = '';
    let accumulated = '';
    let sawSseFrame = false;
    let doneSignal = false;
    let pendingJsonPayload = '';
    let lastFinishReason = '';

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
            const finishReason = json?.choices?.[0]?.finish_reason;
            if (typeof finishReason === 'string' && finishReason.trim()) {
                lastFinishReason = finishReason.trim();
            }
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

    const 追加文本 = (chunkText: string) => {
        if (!chunkText || doneSignal) return;
        rawBuffer += chunkText;
        刷新事件缓冲(false);
    };

    const 完成 = () => {
        刷新事件缓冲(true);

        if (pendingJsonPayload) {
            尝试解析JSON并提取(pendingJsonPayload);
            pendingJsonPayload = '';
        }

        if (typeof extractDelta.finalize === 'function') {
            const tailDelta = extractDelta.finalize();
            emitDelta(tailDelta);
        }

        if (!sawSseFrame) {
            throw new Error('Stream response did not contain text/event-stream data frames');
        }

        onStreamEnd?.({
            sawDone: doneSignal,
            finishReason: lastFinishReason || undefined,
            accumulatedLength: accumulated.length
        });

        return accumulated.trim();
    };

    return {
        追加文本,
        完成,
        是否完成: () => doneSignal
    };
};

const 解析SSE文本 = async (
    response: Response,
    extractDelta: 增量提取器,
    onDelta?: (delta: string, accumulated: string) => void,
    emptyBodyError = 'Stream body is empty',
    onStreamEnd?: (info: 通用流式结束信息) => void
): Promise<string> => {
    if (!response.body) throw new Error(emptyBodyError);

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const processor = 创建SSE文本处理器(extractDelta, onDelta, onStreamEnd);
    const fetchStats = {
        totalChunks: 0,
        totalBytes: 0,
        firstChunkAt: 0,
        lastChunkAt: 0,
        startAt: Date.now()
    };

    try {
        while (!processor.是否完成()) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            const now = Date.now();
            if (fetchStats.totalChunks === 0) fetchStats.firstChunkAt = now;
            fetchStats.totalChunks++;
            fetchStats.totalBytes += value.byteLength;
            fetchStats.lastChunkAt = now;
            processor.追加文本(chunkText);
        }

        const tail = decoder.decode();
        if (tail) {
            processor.追加文本(tail);
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // ignore release errors
        }
    }

    const fetchElapsedMs = Date.now() - fetchStats.startAt;
    写入流式诊断日志('fetch stream done', {
        totalChunks: fetchStats.totalChunks,
        totalBytes: fetchStats.totalBytes,
        firstChunkAt: fetchStats.firstChunkAt,
        lastChunkAt: fetchStats.lastChunkAt,
        elapsedMs: fetchElapsedMs,
        avgChunkIntervalMs: fetchStats.totalChunks > 1 && fetchStats.lastChunkAt > fetchStats.firstChunkAt
            ? Math.round((fetchStats.lastChunkAt - fetchStats.firstChunkAt) / (fetchStats.totalChunks - 1))
            : null
    });

    return processor.完成();
};

const 支持XHR流式请求 = (): boolean => {
    return typeof XMLHttpRequest !== 'undefined' && typeof window !== 'undefined';
};

// [修复] 旧包/异常包里原生插件未实现时，Capacitor 会抛 "plugin is not implemented"，
// 记录后本会话不再尝试原生流式，后续请求直接走 XHR/fetch 流式
let 原生流式插件判定不可用 = false;

const 支持原生流式请求 = (): boolean => {
    if (原生流式插件判定不可用) return false;
    if (!isNativeCapacitorEnvironment()) return false;
    const capacitor = typeof window !== 'undefined' ? (window as any)?.Capacitor : undefined;
    // [修复] registerPlugin 生成的 JS 代理自带方法桩，仅看方法是否存在会把
    // “原生侧未实现”的旧包/异常包误判为可用；isPluginAvailable 才能反映原生注册情况
    if (typeof capacitor?.isPluginAvailable === 'function' && !capacitor.isPluginAvailable('NativeChatStreamer')) {
        return false;
    }
    const runtimePlugin = capacitor?.Plugins?.NativeChatStreamer;
    return typeof runtimePlugin?.streamChat === 'function'
        && typeof runtimePlugin?.addListener === 'function'
        && typeof runtimePlugin?.cancelStream === 'function';
};

const 错误疑似原生插件未实现 = (error: unknown): boolean => {
    const message = 读取错误消息(error).toLowerCase();
    if (!message) return false;
    // 仅匹配 Capacitor 桥层报的“插件未实现”类错误（形如 `"NativeChatStreamer" plugin is not implemented on android`）。
    // 不能只看 "not implemented"：请求一旦已到达模型服务，误判会导致同一请求经 XHR/fetch 重发，产生重复调用与费用。
    return (message.includes('nativechatstreamer') || message.includes('plugin'))
        && (message.includes('not implemented') || message.includes('unavailable') || message.includes('missing') || message.includes('not found'));
};

const 生成原生流请求ID = (): string => {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `chat-${Date.now()}-${randomPart}`;
};

const 解析SSE文本原生 = async (
    endpoint: string,
    headers: Record<string, string>,
    body: string,
    signal: AbortSignal | undefined,
    extractDelta: 增量提取器,
    onDelta?: (delta: string, accumulated: string) => void,
    onStreamEnd?: (info: 通用流式结束信息) => void
): Promise<string> => {
    const requestId = 生成原生流请求ID();
    const processor = 创建SSE文本处理器(extractDelta, onDelta, onStreamEnd);
    let listenerHandle: PluginListenerHandle | null = null;
    let settled = false;

    const cleanup = () => {
        signal?.removeEventListener('abort', abortHandler);
        if (listenerHandle) {
            void listenerHandle.remove();
            listenerHandle = null;
        }
    };

    const abortHandler = () => {
        if (settled) return;
        settled = true;
        void 原生聊天流.cancelStream({ requestId });
        cleanup();
    };

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    return new Promise<string>(async (resolve, reject) => {
        const settleResolve = (value: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
        };

        const settleReject = (error: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };

        try {
            signal?.addEventListener('abort', () => {
                abortHandler();
                reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });

            listenerHandle = await 原生聊天流.addListener('chatStream', (event) => {
                if (event.requestId !== requestId) return;

                if (event.type === 'meta') {
                    写入流式诊断日志('native stream meta', {
                        status: event.status || 0,
                        contentType: event.contentType || ''
                    });
                    return;
                }

                if (event.type === 'chunk') {
                    const chunk = event.text || '';
                    写入流式诊断日志('native stream chunk', {
                        byteLength: event.byteLength || 0,
                        textLength: chunk.length
                    });
                    processor.追加文本(chunk);
                    return;
                }

                if (event.type === 'done') {
                    settleResolve(processor.完成());
                    return;
                }

                if (event.type === 'error') {
                    const rawMessage = event.message || 'API Error: native stream failed';
                    const normalizedMessage = 规范化流式连接错误提示(rawMessage);
                    settleReject(new 协议请求错误(
                        normalizedMessage || rawMessage,
                        event.status || undefined
                    ));
                }
            });

            await 原生聊天流.streamChat({
                requestId,
                endpoint,
                headers,
                body
            });
        } catch (error) {
            const message = 读取错误消息(error);
            if (是否流式连接中断错误消息(message)) {
                settleReject(new 协议请求错误(规范化流式连接错误提示(message), undefined, message));
                return;
            }
            settleReject(error);
        }
    });
};

const 解析SSE文本XHR = (
    endpoint: string,
    headers: Record<string, string>,
    body: string,
    signal: AbortSignal | undefined,
    extractDelta: 增量提取器,
    onDelta?: (delta: string, accumulated: string) => void,
    onStreamEnd?: (info: 通用流式结束信息) => void
): Promise<string> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const processor = 创建SSE文本处理器(extractDelta, onDelta, onStreamEnd);
    let consumedLength = 0;
    let settled = false;
    const streamStats = {
        totalChunks: 0,
        totalBytes: 0,
        firstChunkAt: 0,
        lastChunkAt: 0,
        startAt: Date.now()
    };

    const settleReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
    };

    const settleResolve = (value: string) => {
        if (settled) return;
        settled = true;
        resolve(value);
    };

    const consumeAvailableText = () => {
        const text = xhr.responseText || '';
        if (text.length <= consumedLength) return;
        const chunk = text.slice(consumedLength);
        consumedLength = text.length;
        const now = Date.now();
        if (streamStats.totalChunks === 0) streamStats.firstChunkAt = now;
        streamStats.totalChunks++;
        streamStats.totalBytes += new TextEncoder().encode(chunk).length;
        streamStats.lastChunkAt = now;
        processor.追加文本(chunk);
    };

    const writeStreamSummary = (eventType: string, extra: Record<string, unknown> = {}) => {
        const elapsedMs = Date.now() - streamStats.startAt;
        写入流式诊断日志(eventType, {
            totalChunks: streamStats.totalChunks,
            totalBytes: streamStats.totalBytes,
            firstChunkAt: streamStats.firstChunkAt,
            lastChunkAt: streamStats.lastChunkAt,
            elapsedMs,
            avgChunkIntervalMs: streamStats.totalChunks > 1 && streamStats.lastChunkAt > streamStats.firstChunkAt
                ? Math.round((streamStats.lastChunkAt - streamStats.firstChunkAt) / (streamStats.totalChunks - 1))
                : null,
            responseTextLength: (xhr.responseText || '').length,
            readyState: xhr.readyState,
            status: xhr.status || 0,
            ...extra
        });
    };

    const abortHandler = () => {
        const responseTextLengthAtAbort = (xhr.responseText || '').length;
        try {
            xhr.abort();
        } catch {
            // ignore abort errors
        }
        writeStreamSummary('xhr stream abort', { responseTextLengthAtAbort });
        settleReject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal?.aborted) {
        abortHandler();
        return;
    }
    signal?.addEventListener('abort', abortHandler, { once: true });

    xhr.open('POST', endpoint, true);
    xhr.responseType = 'text';
    Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
    });

    xhr.onprogress = () => {
        try {
            consumeAvailableText();
        } catch (error) {
            settleReject(error);
        }
    };

    xhr.onerror = () => {
        writeStreamSummary('xhr stream network error');
        console.warn('[xhr.stream.network.error]', {
            endpoint,
            method: 'POST',
            headersPresent: Object.keys(headers).length,
            bodyLength: body.length,
            readyState: xhr.readyState,
            status: xhr.status
        });
        settleReject(new 协议请求错误('API Error: network error during stream request'));
    };

    xhr.ontimeout = () => {
        writeStreamSummary('xhr stream timeout');
        settleReject(new 协议请求错误('API Error: stream request timeout'));
    };

    xhr.onload = () => {
        signal?.removeEventListener('abort', abortHandler);
        try {
            const contentType = (xhr.getResponseHeader('content-type') || '').toLowerCase();
            writeStreamSummary('xhr stream load');
            写入流式诊断日志('xhr stream load status', {
                status: xhr.status,
                contentType
            });
            if (xhr.status < 200 || xhr.status >= 300) {
                const detail = (xhr.responseText || '').trim();
                settleReject(new 协议请求错误(`API Error: ${xhr.status}${detail ? ` - ${detail}` : ''}`, xhr.status, detail));
                return;
            }
            if (!contentType.includes('text/event-stream')) {
                settleReject(new 协议请求错误(`API Error: stream unsupported (content-type=${contentType || 'unknown'})`));
                return;
            }
            consumeAvailableText();
            settleResolve(processor.完成());
        } catch (error) {
            settleReject(error);
        }
    };

    xhr.send(body);
});

const 写入流式诊断日志 = (message: string, detail?: Record<string, unknown>) => {
    if (message.includes('stream chunk')) return;
    const payload = detail || {};
    try {
        if (typeof console !== 'undefined') {
            console.info('[MoRanJiangHu stream]', message, payload);
        }
    } catch {
        // ignore console failures
    }
};

const 非流式回填流式回调 = (text: string, streamOptions?: 通用流式选项) => {
    if (!streamOptions?.stream || typeof streamOptions.onDelta !== 'function') return;
    const finalText = typeof text === 'string' ? text : '';
    if (!finalText) return;
    streamOptions.onDelta(finalText, finalText);
};

const 解析可能是JSON字符串 = (text: string): any | null => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const 构建GeminiInteractions输入 = (messages: 通用消息[]): string => {
    return 规范化文本补全消息链(messages, { 保留System: true, 合并同角色: true })
        .map((msg) => {
            const content = (msg.content || '').trim();
            if (!content) return '';
            if (msg.role === 'system') return `【系统规则】\n${content}`;
            if (msg.role === 'assistant') return `【既有回复】\n${content}`;
            return content;
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();
};

const 提取GeminiInteractions文本 = (payload: any): string => {
    const direct = payload?.output_text ?? payload?.outputText ?? payload?.text;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const output = payload?.output ?? payload?.response ?? payload?.result;
    if (typeof output === 'string' && output.trim()) return output.trim();
    if (typeof output?.text === 'string' && output.text.trim()) return output.text.trim();
    if (typeof output?.output_text === 'string' && output.output_text.trim()) return output.output_text.trim();

    const candidates = payload?.candidates;
    if (Array.isArray(candidates)) {
        const text = candidates
            .map((candidate: any) => candidate?.content?.parts || candidate?.parts || [])
            .flat()
            .map((part: any) => typeof part?.text === 'string' ? part.text : '')
            .filter(Boolean)
            .join('\n')
            .trim();
        if (text) return text;
    }

    return '';
};

const 提取GeminiInteractionId = (payload: any): string => {
    const raw = payload?.id ?? payload?.name ?? payload?.interaction?.id ?? payload?.interaction?.name;
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    return trimmed.includes('/') ? (trimmed.split('/').pop() || trimmed) : trimmed;
};

const 读取GeminiInteraction状态 = (payload: any): string => {
    return String(payload?.status ?? payload?.state ?? payload?.interaction?.status ?? '').trim().toLowerCase();
};

const 请求GeminiInteractions文本 = async (
    apiConfig: 当前可用接口结构,
    messages: 通用消息[],
    signal?: AbortSignal,
    streamOptions?: 通用流式选项,
    errorDetailLimit?: number
): Promise<string> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');
    const endpoint = 构建GeminiInteractions端点(apiConfig.baseUrl);
    if (!endpoint) throw new Error('Missing API Base URL');

    const agent = 规范化请求模型名称(apiConfig.model).replace(/^models\//i, '');
    const input = 构建GeminiInteractions输入(messages);
    if (!agent) throw new Error('Missing Gemini Deep Research agent model');
    if (!input) throw new Error('Gemini Deep Research input is empty');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiConfig.apiKey,
        'Api-Revision': '2026-05-20'
    };
    const requestBody = JSON.stringify({
        agent,
        input,
        agent_config: {
            type: 'deep-research',
            thinking_summaries: 'auto'
        },
        background: true,
        store: true
    });

    const createResponse = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: requestBody,
        signal
    });
    if (!createResponse.ok) {
        const detail = await 读取失败详情文本(createResponse, errorDetailLimit);
        throw new 协议请求错误(`Gemini Interactions API Error: ${createResponse.status}${detail ? ` - ${detail}` : ''}`, createResponse.status, detail);
    }

    const created = 解析可能是JSON字符串(await createResponse.text()) || {};
    const createdText = 提取GeminiInteractions文本(created);
    const createdStatus = 读取GeminiInteraction状态(created);
    if (createdText && (createdStatus === 'completed' || createdStatus === 'succeeded' || createdStatus === 'done' || !createdStatus)) {
        非流式回填流式回调(createdText, streamOptions);
        return createdText;
    }

    const interactionId = 提取GeminiInteractionId(created);
    if (!interactionId) {
        throw new 协议请求错误('Gemini Interactions API did not return an interaction id');
    }

    const pollEndpoint = `${endpoint.replace(/\/+$/u, '')}/${encodeURIComponent(interactionId)}`;
    for (let attempt = 0; attempt < 240; attempt += 1) {
        await 等待可中断(attempt === 0 ? 1500 : 5000, signal);
        const pollResponse = await fetch(pollEndpoint, {
            method: 'GET',
            headers: {
                'x-goog-api-key': apiConfig.apiKey,
                'Api-Revision': '2026-05-20'
            },
            signal
        });
        if (!pollResponse.ok) {
            const detail = await 读取失败详情文本(pollResponse, errorDetailLimit);
            throw new 协议请求错误(`Gemini Interactions API Error: ${pollResponse.status}${detail ? ` - ${detail}` : ''}`, pollResponse.status, detail);
        }

        const payload = 解析可能是JSON字符串(await pollResponse.text()) || {};
        const status = 读取GeminiInteraction状态(payload);
        if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
            const errorText = typeof payload?.error === 'string'
                ? payload.error
                : (payload?.error?.message || payload?.message || 'unknown error');
            throw new 协议请求错误(`Gemini Deep Research failed: ${errorText}`);
        }

        const text = 提取GeminiInteractions文本(payload);
        if (text && (status === 'completed' || status === 'succeeded' || status === 'done' || status === 'complete')) {
            非流式回填流式回调(text, streamOptions);
            return text;
        }
    }

    throw new 协议请求错误(`Gemini Deep Research timed out while waiting for interaction ${interactionId}`);
};

const 构建OpenAI端点 = (
    baseUrlRaw: string,
    supplier: 当前可用接口结构['供应商'],
    modelRaw?: string,
    options?: { prefixMode?: boolean; protocol?: 请求协议类型 }
): string => {
    const base = 清理末尾斜杠(baseUrlRaw || '');
    if (!base) return '';

    const lowerBase = base.toLowerCase();
    const looksLikeQianfan = lowerBase.includes('qianfan.baidubce.com')
        && /\/v2(?:\/coding)?(?:\/chat\/completions)?$/i.test(base);
    if (looksLikeQianfan) {
        return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
    }

    // 火山引擎 Ark 接口：/api/coding/v3 已包含版本路径，只需追加 /chat/completions
    const looksLikeVolcArkCoding = (lowerBase.includes('volces.com') || lowerBase.includes('ark.cn'))
        && /\/api\/coding\/v\d+(?:\/chat\/completions)?$/i.test(base);
    if (looksLikeVolcArkCoding) {
        return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
    }

    if (options?.prefixMode === true && options.protocol === 'deepseek') {
        if (/\/beta\/chat\/completions$/i.test(base) || /\/chat\/completions$/i.test(base)) return base;
        if (/\/v1$/i.test(base)) return `${base.replace(/\/v1$/i, '')}/beta/chat/completions`;
        if (/\/beta$/i.test(base)) return `${base}/chat/completions`;
        return `${base}/beta/chat/completions`;
    }

    const lowerModel = (modelRaw || '').toLowerCase();
    const isZhipuSupplier = supplier === 'zhipu';
    // [修复] 仅当 base 的 hostname 本身为 bigmodel.cn 或其子域时才视为智谱官方域名。
    // 旧实现用 includes('bigmodel.cn') 会误命中路径里出现 bigmodel.cn 的中转站地址
    //（如 https://relay.example.com/v1/bigmodel.cn/glm-4），把这类中转站错当成智谱官方并重写成 /api/paas/v4。
    let isZhipuHost = false;
    try {
        const host = new URL(base).hostname.toLowerCase();
        isZhipuHost = host === 'bigmodel.cn' || host.endsWith('.bigmodel.cn');
    } catch {
        isZhipuHost = lowerBase.includes('bigmodel.cn');
    }
    // [修复] 模型名里带 glm 只是弱信号：第三方 OpenAI 兼容中转站（类脑、one-api 等）同样提供 glm-* 模型，
    // 但它们的正确端点是 /v1/chat/completions。旧实现只要模型名含 glm 就把用户填写的 /v1 抹掉、
    // 改写成智谱私有的 /api/paas/v4/chat/completions，导致这类中转站直接 404（模型列表能拉到、发消息就失败）。
    // 因此只有在地址完全没有给出版本路径线索时，才允许按智谱网关补 /api/paas/v4；
    // 用户已显式写出 /v1、/v4 或完整聊天端点时一律尊重原地址。
    const 地址已给出版本线索 = /\/chat\/completions$/i.test(base)
        || /\/v\d+$/i.test(base)
        || OpenAI兼容地址已包含版本路径(去除OpenAI兼容聊天端点(base));
    const looksLikeZhipu = isZhipuSupplier
        || isZhipuHost
        || (lowerModel.includes('glm') && !地址已给出版本线索);

    if (looksLikeZhipu) {
        if (/\/api\/paas\/v4\/chat\/completions$/i.test(base) || /\/chat\/completions$/i.test(base)) return base;
        const withoutV1 = base.replace(/\/v1$/i, '');
        if (/\/api\/paas\/v4$/i.test(withoutV1)) return `${withoutV1}/chat/completions`;
        if (isZhipuSupplier) return withoutV1;
        return `${withoutV1}/api/paas/v4/chat/completions`;
    }

    if (/\/v1\/chat\/completions$/i.test(base) || /\/chat\/completions$/i.test(base)) return base;
    const versionedEndpointBase = 去除OpenAI兼容聊天端点(base);
    if (OpenAI兼容地址已包含版本路径(versionedEndpointBase)) {
        return `${versionedEndpointBase}/chat/completions`;
    }
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
    errorDetailLimit?: number,
    requestOptions?: 模型请求附加选项
): Promise<string> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');
    const enableStream = !!streamOptions?.stream;
    let useStream = enableStream;
    let downgradedFromStream = false;
    let usePrefixMode = requestOptions?.prefixMode === true && (protocol === 'deepseek' || protocol === 'glm');
    let requestMessages = messages;
    if (是否小米MiMo接口配置(apiConfig)) {
        const firstSystemIndex = requestMessages.findIndex(message => message.role === 'system' && message.content.trim().length > 0);
        if (firstSystemIndex >= 0) {
            requestMessages = requestMessages.map((message, index) => index === firstSystemIndex
                ? { ...message, content: `${小米MiMo稳定输出预设}\n\n${message.content}`.trim() }
                : message
            );
        } else {
            requestMessages = [
                { role: 'system', content: 小米MiMo稳定输出预设 },
                ...requestMessages
            ];
        }
    }
    if (是否GLM接口配置(apiConfig)) {
        const firstSystemIndex = requestMessages.findIndex(message => message.role === 'system' && message.content.trim().length > 0);
        if (firstSystemIndex >= 0) {
            requestMessages = requestMessages.map((message, index) => index === firstSystemIndex
                ? { ...message, content: `${GLM稳定输出预设}\n\n${message.content}`.trim() }
                : message
            );
        } else {
            requestMessages = [
                { role: 'system', content: GLM稳定输出预设 },
                ...requestMessages
            ];
        }
    }

    for (let pass = 0; pass < 3; pass++) {
        const requestModel = 规范化请求模型名称(apiConfig.model);
        const endpoint = 构建OpenAI端点(apiConfig.baseUrl, apiConfig.供应商, requestModel, {
            protocol,
            prefixMode: usePrefixMode
        });
        if (!endpoint) throw new Error('Missing API Base URL');
        const maxOutputTokens = 计算最大输出Token(apiConfig);
        const body: Record<string, unknown> = {
            model: requestModel || apiConfig.model,
            messages: requestMessages,
            temperature,
            stream: useStream
        };
        if (是否小米MiMo接口配置(apiConfig)) {
            body.top_p = 计算小米MiMoTopP(apiConfig, String(requestModel || apiConfig.model));
            body.max_completion_tokens = maxOutputTokens;
            body.thinking = { type: 'disabled' };
        } else {
            body.max_tokens = maxOutputTokens;
        }
        if (responseFormat === 'json_object') {
            body.response_format = { type: 'json_object' };
        }
        if (requestOptions?.disableThinking === true) {
            body.disable_thinking = true;
        }
        const requestHeaders = 构建OpenAI家族请求头(apiConfig);
        const requestBody = JSON.stringify(body);

        if (useStream && 支持原生流式请求()) {
            写入流式诊断日志('use native stream transport', {
                endpoint,
                model: requestModel || apiConfig.model,
                supplier: apiConfig.供应商
            });
            try {
                return await 解析SSE文本原生(
                    endpoint,
                    requestHeaders,
                    requestBody,
                    signal,
                    创建OpenAI流增量提取器({ includeReasoning: requestOptions?.includeReasoning }),
                    streamOptions?.onDelta,
                    streamOptions?.onStreamEnd
                );
            } catch (error) {
                console.warn('[native.stream.failed]', {
                    endpoint,
                    model: requestModel || apiConfig.model,
                    supplier: apiConfig.供应商,
                    message: 读取错误消息(error)
                });
                写入流式诊断日志('native stream failed', {
                    message: 读取错误消息(error)
                });
                if (错误疑似原生插件未实现(error)) {
                    // [修复] 原生插件未实现（旧包/异常包）：本会话停用原生流式，
                    // 不中断当前请求，直接落到下面的 XHR/fetch 流式传输
                    原生流式插件判定不可用 = true;
                    写入流式诊断日志('native stream plugin unavailable, fallback to xhr/fetch stream', {
                        message: 读取错误消息(error)
                    });
                } else {
                    if (!downgradedFromStream && 错误疑似不支持流式(error)) {
                        useStream = false;
                        downgradedFromStream = true;
                        continue;
                    }
                    if (usePrefixMode && 错误疑似不支持Prefix(error)) {
                        usePrefixMode = false;
                        requestMessages = requestMessages.map(msg => msg.prefix ? { role: msg.role, content: msg.content } : msg);
                        continue;
                    }
                    throw error;
                }
            }
        }

        if (useStream && 支持XHR流式请求()) {
            写入流式诊断日志('use xhr stream transport', {
                endpoint,
                model: requestModel || apiConfig.model,
                supplier: apiConfig.供应商
            });
            try {
                return await 解析SSE文本XHR(
                    endpoint,
                    requestHeaders,
                    requestBody,
                    signal,
                    创建OpenAI流增量提取器({ includeReasoning: requestOptions?.includeReasoning }),
                    streamOptions?.onDelta,
                    streamOptions?.onStreamEnd
                );
            } catch (error) {
                写入流式诊断日志('xhr stream failed', {
                    message: 读取错误消息(error)
                });
                if (!downgradedFromStream && 错误疑似不支持流式(error)) {
                    useStream = false;
                    downgradedFromStream = true;
                    continue;
                }
                if (usePrefixMode && 错误疑似不支持Prefix(error)) {
                    usePrefixMode = false;
                    requestMessages = requestMessages.map(msg => msg.prefix ? { role: msg.role, content: msg.content } : msg);
                    continue;
                }
                throw error;
            }
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: requestHeaders,
            body: requestBody,
            signal
        });

        if (!response.ok) {
            const detail = await 读取失败详情文本(response, errorDetailLimit);
            if (useStream && 响应详情疑似不支持流式(detail) && !downgradedFromStream) {
                useStream = false;
                downgradedFromStream = true;
                continue;
            }
            if (usePrefixMode && 响应详情疑似不支持Prefix(detail)) {
                usePrefixMode = false;
                requestMessages = requestMessages.map(msg => msg.prefix ? { role: msg.role, content: msg.content } : msg);
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
            写入流式诊断日志('use fetch stream transport', {
                endpoint,
                model: requestModel || apiConfig.model,
                supplier: apiConfig.供应商,
                contentType
            });
            return await 解析SSE文本(response, 创建OpenAI流增量提取器({ includeReasoning: requestOptions?.includeReasoning }), streamOptions?.onDelta, 'Stream body is empty', streamOptions?.onStreamEnd);
        } catch (error) {
            if (!downgradedFromStream && 错误疑似不支持流式(error)) {
                useStream = false;
                downgradedFromStream = true;
                continue;
            }
            if (usePrefixMode && 错误疑似不支持Prefix(error)) {
                usePrefixMode = false;
                requestMessages = requestMessages.map(msg => msg.prefix ? { role: msg.role, content: msg.content } : msg);
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
        includeReasoning?: boolean;
        disableThinking?: boolean;
        stripReasoning?: boolean;
        prefixMode?: boolean;
    }
): Promise<string> => {
    if (是否GeminiDeepResearch模型(apiConfig.model) && 是否Gemini接口地址(apiConfig.baseUrl)) {
        return 带重试执行('请求模型文本(gemini-interactions)', async () => {
            return 请求GeminiInteractions文本(
                apiConfig,
                messages,
                options.signal,
                options.streamOptions,
                options.errorDetailLimit
            );
        }, {
            signal: options.signal,
            retries: 1,
            baseDelayMs: 1200
        });
    }

    const protocol = 解析请求协议类型(apiConfig);
    const resolvedTemperature = 计算请求温度(apiConfig, options.temperature);
    const requestedResponseFormat = options.responseFormat;
    const shouldSkipResponseFormat = 是否Reasoner模型(apiConfig.model)
        || 是否Claude模型(apiConfig.model)
        || 响应格式疑似不受支持(apiConfig.baseUrl, apiConfig.model);
    const effectiveResponseFormat = (requestedResponseFormat && !shouldSkipResponseFormat)
        ? requestedResponseFormat
        : undefined;
    const normalizedMessages = 应用Claude兼容末尾User修正(
        应用GLM消息兼容修正(
            应用DeepSeek消息兼容修正(
                应用强制JSON消息修正(messages, effectiveResponseFormat),
                protocol
            ),
            protocol
        ),
        apiConfig
    );
    const { injectedMessages, checkTag, messageCount, totalChars } = 注入上下文完整性校验标记(normalizedMessages, apiConfig);

    const result = await 带重试执行(`请求模型文本(${protocol})`, async () => {
        return 请求OpenAI家族文本(
            apiConfig,
            protocol,
            injectedMessages,
            resolvedTemperature,
            options.signal,
            options.streamOptions,
            effectiveResponseFormat,
            options.errorDetailLimit,
            {
                includeReasoning: options.includeReasoning,
                disableThinking: options.disableThinking,
                stripReasoning: options.stripReasoning,
                prefixMode: options.prefixMode
            }
        );
    }, {
        signal: options.signal,
        retries: 2,
        baseDelayMs: 800
    });

    检查上下文完整性(result, checkTag, apiConfig, messageCount, totalChars);
    return 移除上下文完整性校验标记(result, checkTag);
};
