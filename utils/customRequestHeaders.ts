// 自定义请求头
//
// 背景：部分第三方 AI 网关会校验厂商私有的请求头，缺了就整条链路 400。
// 典型例子是 OpenCode（opencode.ai）：自 2026-09 起要求所有网关请求携带
// `x-opencode-session`，缺失时直接拒绝请求——玩家订阅本身没问题，
// 但在第三方客户端里就是「一进游戏就 HTTP 400」。
//
// 处理方式分两层：
// 1. 内置补头：识别到已知供应商域名时自动附带它要求的头（会话标识等），
//    玩家不用做任何配置；同一会话内保持稳定（平台按会话路由，不能每次请求换一个）。
// 2. 自定义补头：接口配置里可以手写任意 `Key: Value`，覆盖上面两层没覆盖到的网关。
//
// 手工头的优先级最高，方便玩家自行纠正或覆盖内置补头。

const 请求头名称规则 = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// 由运行时/传输层决定，玩家覆盖只会让请求非法或引发难以排查的行为。
const 禁止自定义的请求头 = new Set([
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
    'upgrade',
    'expect',
    'te',
    'trailer',
    'keep-alive',
    'proxy-authorization',
    'proxy-connection'
]);

const 单个请求头值的最大长度 = 4096;
const 最大自定义请求头数量 = 32;

const 规整请求头名 = (raw: string): string => (raw || '').trim();

/** 一行一个请求头，支持 `Key: Value` 与 `Key=Value`，`#` 开头为注释。 */
const 解析单行请求头 = (line: string): { name: string; value: string } | null => {
    const text = line.trim();
    if (!text || text.startsWith('#') || text.startsWith('//')) return null;
    const colonIndex = text.indexOf(':');
    const equalIndex = text.indexOf('=');
    let splitIndex = -1;
    if (colonIndex >= 0 && (equalIndex < 0 || colonIndex < equalIndex)) splitIndex = colonIndex;
    else if (equalIndex >= 0) splitIndex = equalIndex;
    if (splitIndex <= 0) return null;

    const name = 规整请求头名(text.slice(0, splitIndex));
    // 值里允许出现冒号（例如 Authorization: Bearer a:b），只在第一个分隔符处切开。
    const value = text.slice(splitIndex + 1).replace(/[\r\n]+/g, ' ').trim();
    if (!name || !value) return null;
    if (!请求头名称规则.test(name)) return null;
    if (禁止自定义的请求头.has(name.toLowerCase())) return null;
    if (value.length > 单个请求头值的最大长度) return null;
    return { name, value };
};

/**
 * 解析玩家填写的自定义请求头。非法行直接忽略，不抛错——
 * 一个写错的行不应该让整条链路无法发请求。
 */
export const 解析自定义请求头 = (raw: unknown): Record<string, string> => {
    const text = typeof raw === 'string' ? raw : '';
    if (!text.trim()) return {};

    const headers: Record<string, string> = {};
    const 已用小写名 = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
        if (已用小写名.size >= 最大自定义请求头数量) break;
        const parsed = 解析单行请求头(line);
        if (!parsed) continue;
        const lower = parsed.name.toLowerCase();
        // 同一名字出现多次时后者生效（和浏览器 Headers 的语义一致）。
        const previous = 已用小写名.get(lower);
        if (previous !== undefined) delete headers[previous];
        headers[parsed.name] = parsed.value;
        已用小写名.set(lower, parsed.name);
    }
    return headers;
};

/**
 * 合并请求头：extra 覆盖 base 中的同名头（大小写不敏感）。
 * 结果保留写入方的原始大小写，但保证一个名字只出现一次
 * （否则 `Authorization` 与 `authorization` 会同时挂在对象上）。
 */
export const 合并请求头 = (
    base: Record<string, string>,
    extra: Record<string, string>
): Record<string, string> => {
    const merged: Record<string, string> = {};
    const 实际键名 = new Map<string, string>();
    const 写入 = (rawName: string, value: string) => {
        const name = 规整请求头名(rawName);
        const lower = name.toLowerCase();
        if (!lower || typeof value !== 'string') return;
        const existing = 实际键名.get(lower);
        if (existing !== undefined) delete merged[existing];
        merged[name] = value;
        实际键名.set(lower, name);
    };
    for (const [name, value] of Object.entries(base || {})) 写入(name, value);
    for (const [name, value] of Object.entries(extra || {})) 写入(name, value);
    return merged;
};

const 会话标识存储键 = 'moranjianghu.opencode.session.v1';
const 会话标识格式 = /^[\x21-\x7E]{8,128}$/;

let 缓存会话标识: string | null = null;

const 读取会话存储 = (): Storage | null => {
    try {
        return typeof globalThis !== 'undefined' ? ((globalThis as any).sessionStorage || null) : null;
    } catch {
        return null;
    }
};

const 生成会话标识 = (): string => {
    try {
        const cryptoRef = (globalThis as any)?.crypto;
        if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
            return String(cryptoRef.randomUUID());
        }
    } catch {
        // 非安全上下文没有 randomUUID，落到下面的兜底
    }
    return `mj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * OpenCode 会话标识：同一会话（含刷新后的同一标签页）内必须保持稳定，
 * 平台按它把请求路由到同一条会话；每次请求换新 ID 会被当成新会话。
 */
export const 读取OpenCode会话标识 = (): string => {
    if (缓存会话标识) return 缓存会话标识;
    const storage = 读取会话存储();
    let saved = '';
    try {
        saved = (storage?.getItem(会话标识存储键) || '').trim();
    } catch {
        saved = '';
    }
    if (会话标识格式.test(saved)) {
        缓存会话标识 = saved;
        return saved;
    }
    const generated = 生成会话标识();
    缓存会话标识 = generated;
    try {
        storage?.setItem(会话标识存储键, generated);
    } catch {
        // 隐私模式下写入失败不影响本次会话使用
    }
    return generated;
};

/** 从接口地址里取主机名（允许玩家填不带协议的地址）。 */
const 提取主机名 = (baseUrl: unknown): string => {
    const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!raw) return '';
    try {
        return new URL(raw).hostname.toLowerCase();
    } catch {
        const stripped = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
        return (stripped.split(/[/?#]/)[0] || '').toLowerCase();
    }
};

export const 是否OpenCode接口地址 = (baseUrl: unknown): boolean => {
    const host = 提取主机名(baseUrl);
    if (!host) return false;
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
};

/**
 * 判断能否把某条渠道配置的自定义头用到实际请求地址上。
 *
 * 独立模型允许「渠道」与「独立 API 地址」分开填：此时代理头属于渠道那家网关，
 * 发给另一家只会被当成可疑请求（甚至 401）。主机不同就不复用，宁可少发。
 */
export const 读取可复用自定义请求头 = (
    实际请求地址: unknown,
    渠道配置?: { baseUrl?: string; 自定义请求头?: string } | null
): string => {
    const configured = (渠道配置?.自定义请求头 || '').trim();
    if (!configured) return '';
    const 请求主机 = 提取主机名(实际请求地址);
    const 渠道主机 = 提取主机名(渠道配置?.baseUrl);
    if (请求主机 && 渠道主机 && 请求主机 !== 渠道主机) return '';
    return configured;
};

/**
 * 内置供应商补充头：目前只有 OpenCode 强制要求会话头。
 * 后续若遇到同类网关，在这里加一条即可（不要写进玩家配置默认值）。
 */
export const 构建内置补充请求头 = (baseUrl: unknown): Record<string, string> => {
    if (是否OpenCode接口地址(baseUrl)) {
        return { 'x-opencode-session': 读取OpenCode会话标识() };
    }
    return {};
};

/**
 * 模型列表（/models）等非对话请求使用的请求头。
 * 与对话请求保持一致，否则「模型列表能拉、生成却 400」会更难排查。
 */
export const 构建模型列表请求头 = (params: {
    baseUrl: unknown;
    apiKey: unknown;
    供应商?: unknown;
    自定义请求头?: unknown;
}): Record<string, string> => {
    const apiKey = typeof params.apiKey === 'string' ? params.apiKey.trim() : '';
    const baseUrl = typeof params.baseUrl === 'string' ? params.baseUrl.trim() : '';
    const 供应商 = typeof params.供应商 === 'string' ? params.供应商 : '';
    const isMimo = 供应商 === 'mimo_api'
        || 供应商 === 'mimo_token_plan'
        || baseUrl.toLowerCase().includes('xiaomimimo.com');

    const base: Record<string, string> = isMimo
        ? { 'api-key': apiKey }
        : { Authorization: `Bearer ${apiKey}` };
    return 合并请求头(
        合并请求头(base, 构建内置补充请求头(baseUrl)),
        解析自定义请求头(params.自定义请求头)
    );
};
