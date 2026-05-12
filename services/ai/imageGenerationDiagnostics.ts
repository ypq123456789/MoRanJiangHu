import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { RELEASE_INFO } from '../../data/releaseInfo';
import { isNativeCapacitorEnvironment } from '../../utils/nativeRuntime';

type ComfyUI远程探测结果 = {
    ok?: boolean;
    reachable?: boolean;
    status?: number;
    reason?: string;
    error?: string;
    elapsedMs?: number;
    headers?: Record<string, string>;
};

const 构建诊断API地址 = (path: string): string => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
        return `${window.location.origin}${normalizedPath}`;
    }
    const base = RELEASE_INFO.websiteUrl || 'https://msjh.bacon.de5.net';
    return `${base.replace(/\/+$/, '')}${normalizedPath}`;
};

export const 翻译连接测试错误 = (error: any, context?: { baseUrl?: string; backendLabel?: string }): string => {
    const raw = typeof error?.detail === 'string'
        ? error.detail
        : typeof error?.message === 'string'
            ? error.message
            : typeof error === 'string'
                ? error
                : '';
    const lower = raw.toLowerCase();
    const baseUrl = context?.baseUrl ? `\n当前地址：${context.baseUrl}` : '';
    const backendLabel = context?.backendLabel || '接口';

    if (/failed to fetch|networkerror|network error|load failed|fetch failed|cors|cross-origin|refused|timeout|abort|econnrefused|enotfound|certificate|ssl/.test(lower)) {
        return `${backendLabel}连接失败。可能是服务器没有启动、地址或端口填错、网络不可达、浏览器跨域拦截，或本地/云端后端已经休眠。${baseUrl}\n建议先在浏览器打开该地址确认能访问；如果是 CNB/ComfyUI，请保持 VS Code 工作区页面一直打开，并确认后端开启了 CORS。${raw ? `\n原始错误：${raw}` : ''}`;
    }

    if (/401|unauthorized|invalid api key|invalid_api_key|incorrect api key|permission denied/.test(lower)) {
        return `${backendLabel}鉴权失败。API Key 或 Token 可能填错、已过期，或当前账号没有调用该模型的权限。${baseUrl}\n请重新复制密钥，确认没有多余空格。${raw ? `\n原始错误：${raw}` : ''}`;
    }

    if (/403|forbidden|quota|billing|insufficient|balance|payment|required/.test(lower)) {
        return `${backendLabel}被服务端拒绝。常见原因是额度不足、未开通计费、模型权限不足，或服务商限制了当前 Key。${baseUrl}${raw ? `\n原始错误：${raw}` : ''}`;
    }

    if (/404|not found|model.*not|does not exist|unknown model|invalid model/.test(lower)) {
        return `${backendLabel}请求到了服务器，但模型或接口路径不存在。请检查 Base URL、接口路径和模型名称是否匹配当前服务商。${baseUrl}${raw ? `\n原始错误：${raw}` : ''}`;
    }

    if (/429|rate limit|too many requests|rate_limit/.test(lower)) {
        return `${backendLabel}触发限流。请求过快或当前 Key 的并发/频率额度不足，请稍后再试，或降低自动生成频率。${raw ? `\n原始错误：${raw}` : ''}`;
    }

    if (/500|502|503|504|bad gateway|service unavailable|gateway timeout/.test(lower)) {
        return `${backendLabel}服务端临时异常。可能是上游模型服务繁忙、后端重启中，或代理服务不可用。请稍后重试。${baseUrl}${raw ? `\n原始错误：${raw}` : ''}`;
    }

    return raw || `${backendLabel}测试失败，但没有返回明确错误。请检查地址、模型、密钥和网络状态。`;
};

export const 判断疑似网络或跨域错误 = (error: any): boolean => {
    const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
    return error instanceof TypeError
        || /failed to fetch|networkerror|network error|load failed|fetch failed|cors|cross-origin|connection|refused|timeout|abort/.test(text);
};

const 清理末尾斜杠 = (value: string): string => value.replace(/\/+$/, '');

const 获取运行时代理基础地址 = (): string => {
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
        return window.location.origin.replace(/\/+$/, '');
    }
    return (RELEASE_INFO.websiteUrl || 'https://msjh.bacon.de5.net').replace(/\/+$/, '');
};

export const 规范化OpenAI图片模型名称 = (modelRaw: string): string => {
    const model = (modelRaw || '').trim();
    return model.replace(/^gpt-iamge-/i, 'gpt-image-');
};

export const 规范化OpenAI图片基础地址 = (baseUrlRaw: string): string => {
    const trimmed = 清理末尾斜杠((baseUrlRaw || '').trim());
    if (!trimmed) return '';

    try {
        const url = new URL(trimmed);
        const path = 清理末尾斜杠(url.pathname || '');
        const lowerPath = path.toLowerCase();
        const isKnownPucodingPage = /(^|\.)pucoding\.com$/i.test(url.hostname)
            && (
                lowerPath === '/playground/image'
                || lowerPath === '/keys'
                || lowerPath === '/dashboard/api-keys'
                || lowerPath === '/docs/image-api'
            );
        if (isKnownPucodingPage) {
            return url.origin;
        }
    } catch {
        return trimmed;
    }

    return trimmed;
};

const 转换为运行时OpenAI图片代理端点 = (directEndpoint: string): string => {
    if (!directEndpoint) return directEndpoint;
    try {
        const url = new URL(directEndpoint);
        if (!/(^|\.)pucoding\.com$/i.test(url.hostname)) return directEndpoint;
        if (!/^\/v1\/images\/(?:generations|edits)$/i.test(url.pathname)) return directEndpoint;
        return `${获取运行时代理基础地址()}/api/pucoding-image${url.pathname}${url.search}`;
    } catch {
        return directEndpoint;
    }
};

const 构建OpenAI图片直连生成端点 = (baseUrlRaw: string, customPathRaw?: string): string => {
    const base = 规范化OpenAI图片基础地址(baseUrlRaw);
    const customPath = (customPathRaw || '').trim();
    if (/^https?:\/\//i.test(customPath)) {
        const normalizedCustomBase = 规范化OpenAI图片基础地址(customPath);
        if (normalizedCustomBase && normalizedCustomBase !== 清理末尾斜杠(customPath)) {
            return 构建OpenAI图片直连生成端点(normalizedCustomBase);
        }
        return 清理末尾斜杠(customPath);
    }
    if (!base) return '';
    if (customPath) {
        const rawPath = customPath.startsWith('/') ? customPath : `/${customPath}`;
        const normalizedPath = /\/v1$/i.test(base) && /^\/v1\//i.test(rawPath)
            ? rawPath.replace(/^\/v1/i, '')
            : rawPath;
        return `${base}${normalizedPath}`;
    }
    if (/\/images\/generations$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/images/generations`;
    return `${base}/v1/images/generations`;
};

export const 构建OpenAI图片生成端点 = (
    baseUrlRaw: string,
    customPathRaw?: string,
    options?: { useRuntimeProxy?: boolean }
): string => {
    const directEndpoint = 构建OpenAI图片直连生成端点(baseUrlRaw, customPathRaw);
    return options?.useRuntimeProxy
        ? 转换为运行时OpenAI图片代理端点(directEndpoint)
        : directEndpoint;
};

export const 构建ComfyUI连接失败提示 = (baseUrlRaw: string, error?: any): string => {
    const baseUrl = (baseUrlRaw || '').replace(/\/+$/, '') || '未填写';
    const rawMessage = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
    return [
        `ComfyUI 连接失败，当前地址：${baseUrl}。`,
        '可能原因：服务器未启动、地址已失效、CNB 工作区或 VS Code 页面被关闭导致后端休眠、浏览器被跨域限制拦截，或 ComfyUI 启动时没有开启 CORS。',
        '请确认：1. CNB 的 VS Code 页面保持打开并在线；2. 自动发现列表里的 8188 地址仍可访问；3. ComfyUI 启动参数包含 --listen 0.0.0.0 --enable-cors-header "*"；4. 如果刚重启过后端，请刷新列表后重新选择地址。',
        'CNB 工作区页面地址通常类似：https://cnb-xxxx-xxxx-001.cnb.space/?folder=/workspace。',
        rawMessage ? `原始错误：${rawMessage}` : ''
    ].filter(Boolean).join('\n');
};

export const 远程探测ComfyUI连接 = async (baseUrlRaw: string): Promise<ComfyUI远程探测结果 | null> => {
    const baseUrl = (baseUrlRaw || '').replace(/\/+$/, '');
    if (!baseUrl) return null;
    try {
        const url = new URL(构建诊断API地址('/api/image-backend/probe'));
        url.searchParams.set('backendType', 'comfyui');
        url.searchParams.set('url', baseUrl);
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        return await response.json().catch(() => null) as ComfyUI远程探测结果 | null;
    } catch {
        return null;
    }
};

export const 构建ComfyUI精确连接失败提示 = async (baseUrlRaw: string, error?: any): Promise<string> => {
    const baseUrl = (baseUrlRaw || '').replace(/\/+$/, '') || '未填写';
    const rawMessage = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
    const probe = await 远程探测ComfyUI连接(baseUrl);

    if (probe?.reachable === true && probe.ok === true) {
        const corsHeader = probe.headers?.['access-control-allow-origin'] || '';
        return [
            `ComfyUI 后端在线，但浏览器直连失败，当前地址：${baseUrl}。`,
            '最可能原因：跨域 CORS 被浏览器拦截，或浏览器安全策略不允许当前网页直接访问这个 ComfyUI 地址。',
            corsHeader
                ? `服务端当前返回的 CORS 头：Access-Control-Allow-Origin=${corsHeader}`
                : '服务端探测可访问，但没有看到 Access-Control-Allow-Origin 响应头。',
            '处理办法：重启 ComfyUI，并确保启动参数包含 --listen 0.0.0.0 --enable-cors-header "*"；如果使用 CNB，请保持 VS Code / workspace 页面打开。',
            rawMessage ? `浏览器原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    if (probe?.reachable === true && probe.ok === false) {
        return [
            `ComfyUI 地址能连上，但服务端返回异常，当前地址：${baseUrl}。`,
            `最可能原因：连接到了服务，但不是可用的 ComfyUI /system_stats 接口，或后端正在启动、报错、被代理返回了错误页面。`,
            typeof probe.status === 'number' ? `服务端状态码：HTTP ${probe.status}` : '',
            '处理办法：打开 ComfyUI 工作区确认控制台没有报错；刷新自动发现列表后重新选择 8188 地址。',
            rawMessage ? `浏览器原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    if (probe?.reachable === false) {
        const reasonText = probe.reason === 'timeout'
            ? '远程探测超时，后端大概率已休眠、正在启动或网络不可达。'
            : probe.reason === 'dns_error'
                ? '域名解析失败，地址可能已失效或复制错了。'
                : probe.reason === 'tls_error'
                    ? 'HTTPS/TLS 证书异常，浏览器和服务器无法建立安全连接。'
                    : '远程探测也无法连到该地址，后端大概率未启动、CNB 工作区已关闭/休眠，或地址已失效。';
        return [
            `ComfyUI 服务器不可达，当前地址：${baseUrl}。`,
            `最可能原因：${reasonText}`,
            '处理办法：打开并保持 CNB 的 VS Code / workspace 页面在线，确认 ComfyUI 已启动到 8188 端口；然后回到游戏刷新自动发现列表，重新选择最新地址。',
            'CNB 工作区页面地址通常类似：https://cnb-xxxx-xxxx-001.cnb.space/?folder=/workspace。',
            probe.error ? `远程探测错误：${probe.error}` : '',
            rawMessage ? `浏览器原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    if (isNativeCapacitorEnvironment()) {
        return [
            `ComfyUI 连接失败，当前地址：${baseUrl}。`,
            '当前在 APK 内，已尝试远程诊断但没有拿到明确结果。最常见原因仍是 CNB 工作区页面关闭导致后端休眠，或地址已经变化。',
            '请打开 CNB 的 VS Code / workspace 页面保活，刷新自动发现列表后重新选择地址。',
            rawMessage ? `原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    return 构建ComfyUI连接失败提示(baseUrl, error);
};

export const 构建通用生图连接失败提示 = (
    backendType: 当前可用接口结构['图片后端类型'] | undefined,
    baseUrlRaw: string,
    error: any
): string => {
    if (backendType === 'comfyui') {
        return 构建ComfyUI连接失败提示(baseUrlRaw, error);
    }
    if (backendType === 'sd_webui') {
        const rawMessage = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '网络异常';
        return `Stable Diffusion WebUI 连接失败。可能是服务器未启动、地址不可访问、跨域被浏览器拦截，或 WebUI 未开启 API/CORS。请确认地址、端口和启动参数后重试。\n原始错误：${rawMessage}`;
    }
    return error?.message || '图片生成请求失败，请检查网络、接口地址和密钥配置。';
};
