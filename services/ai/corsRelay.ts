// 网页版跨域（CORS）自动中转：
// 浏览器直连第三方 AI 接口时，若对方未开放 CORS，请求会被浏览器在网络层拦截
// （TypeError: Failed to fetch，预检 OPTIONS 404 等）。本模块在直连出现
// 网络层失败时，自动改走同域中转端点 /api/ai-relay 再试一次。
// APK 原生环境不受浏览器 CORS 限制，不启用中转。

import { isNativeCapacitorEnvironment } from '../../utils/nativeRuntime';

export type 跨域中转模式 = 'auto' | 'off';

const RELAY_MODE_STORAGE_KEY = 'msjh_ai_cors_relay_mode';

export const 读取跨域中转模式 = (): 跨域中转模式 => {
    try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(RELAY_MODE_STORAGE_KEY);
        return raw === 'off' ? 'off' : 'auto';
    } catch {
        return 'auto';
    }
};

export const 写入跨域中转模式 = (mode: 跨域中转模式): void => {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(RELAY_MODE_STORAGE_KEY, mode);
    } catch { /* 忽略隐私模式等存储失败 */ }
};

export const 构建AI中转地址 = (endpoint: string): string => {
    const base = typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)
        ? window.location.origin.replace(/\/+$/, '')
        : 'https://msjh.bacon159.pp.ua';
    return `${base}/api/ai-relay?target=${encodeURIComponent(endpoint)}`;
};

/** 网络层错误（请求根本没有到达服务器或响应被浏览器拦截）：fetch 抛 TypeError 且无 HTTP 状态。 */
export const 疑似浏览器跨域失败 = (error: unknown): boolean => {
    if (!error) return false;
    if (typeof error !== 'object') return false;
    const anyError = error as any;
    if (anyError.status || anyError.statusCode) return false;
    if (anyError.name === 'AbortError' || anyError.name === 'TimeoutError') return false;
    const message = String(anyError.message || anyError).toLowerCase();
    if (!message) return false;
    return anyError instanceof TypeError
        || message.includes('failed to fetch')
        || message.includes('networkerror')
        || message.includes('network error')
        || message.includes('load failed');
};

export const 中转可用 = (): boolean => (
    !isNativeCapacitorEnvironment() && 读取跨域中转模式() !== 'off'
);

/**
 * 把中转端点的拒绝原因翻译成玩家能看懂的处置建议。
 *
 * 中转端点（functions/api/ai-relay/[[path]].ts）出于防滥用/SSRF 约束会拒绝若干目标，
 * 例如内网/回环地址、非 80/443 端口、超大请求体。这些是"中转不可能成功"的硬性限制，
 * 直接透传 `API Error: 400 - {"error":"..."}` 对玩家毫无指导意义，必须翻译。
 * 返回 null 表示这条报错不是中转拒绝（按普通接口错误处理）。
 */
export const 翻译跨域中转拒绝 = (status: number | undefined, detail: string): string | null => {
    const text = (detail || '').trim();
    if (!text) return null;
    const 像中转拒绝 = status === 413
        || text.includes('不允许通过中转访问')
        || text.includes('仅支持转发 AI 模型端点')
        || text.includes('仅允许 80 端口')
        || text.includes('仅允许 443 端口')
        || text.includes('中转上限');
    if (!像中转拒绝) return null;

    if (text.includes('私有地址') || text.includes('不允许通过中转访问该域名')) {
        return '该接口地址是内网/本机地址，浏览器和网页版同域中转都无法访问内网服务。'
            + '请改用 APK 版本（不受此限制），或把接口放到公网 HTTPS（443 端口）后再填写地址。';
    }
    if (text.includes('仅允许 80 端口') || text.includes('仅允许 443 端口')) {
        return '该接口使用了网页版中转不支持的端口（http 仅允许 80、https 仅允许 443，例如 Ollama 默认的 11434）。'
            + '请改用标准端口，或改用 APK 版本（可直连任意端口）。';
    }
    if (text.includes('中转上限')) {
        return '本次请求体积超出网页版中转上限（2MB）。请改用 APK 版本，或精简上下文/缩短存档历史后重试。';
    }
    if (text.includes('AI 模型端点')) {
        return '该地址不是可识别的 AI 接口端点（需要以 chat/completions、models 等结尾）。请核对 Base URL 是否填写完整。';
    }
    return null;
};

/**
 * 直连优先、跨域失败自动经同域中转重试一次的 fetch。
 * 返回 null 表示中转不可用或中转也失败（此时抛出原始错误由调用方处理）。
 */
export const fetchWithCorsRelay = async (
    endpoint: string,
    init: RequestInit,
    onRelayAttempt?: () => void
): Promise<{ response: Response; viaRelay: boolean }> => {
    try {
        return { response: await fetch(endpoint, init), viaRelay: false };
    } catch (directError) {
        if (!疑似浏览器跨域失败(directError) || !中转可用()) throw directError;
        onRelayAttempt?.();
        try {
            const response = await fetch(构建AI中转地址(endpoint), init);
            return { response, viaRelay: true };
        } catch {
            // 中转也失败：抛出最初的直连错误，避免把中转端点问题误报成接口问题。
            throw directError;
        }
    }
};
