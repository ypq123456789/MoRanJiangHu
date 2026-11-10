import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { RELEASE_INFO } from '../../data/releaseInfo';
import { isNativeCapacitorEnvironment, requiresRemoteSyncApi } from '../../utils/nativeRuntime';

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
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol) && !isNativeCapacitorEnvironment()) {
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

    if (/access_denied|ip .*not .*allow|ip .*not .*allowed|ip.*白名单|ip.*允许访问|不在令牌允许访问的列表/.test(lower)) {
        return `${backendLabel}拒绝访问。当前 IP 不在这枚 Token 允许访问的列表中。${baseUrl}\n请在服务商后台调整 Token 的 IP 白名单，或更换允许当前网络出口 IP 的 Token。`;
    }

    if (/failed to fetch|networkerror|network error|load failed|fetch failed|cors|cross-origin|refused|timeout|abort|econnrefused|enotfound|certificate|ssl/.test(lower)) {
        return `${backendLabel}连接失败。可能是服务器没有启动、地址或端口填错、网络不可达、浏览器跨域拦截，或本地/云端后端已经休眠。${baseUrl}\n建议先在浏览器打开该地址确认能访问；如果是 Cloud Studio/云端 ComfyUI，请保持工作区页面一直打开，并确认后端开启了 CORS。${raw ? `\n原始错误：${raw}` : ''}`;
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

type ComfyUI地址类型 = 'cnb' | 'loopback' | 'lan' | 'public' | 'unknown';

const 判断局域网主机 = (hostname: string): boolean => {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1') return true;
    if (/^127\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
        const second = Number(match172[1]);
        return second >= 16 && second <= 31;
    }
    return /\.local$/i.test(host);
};

const 规范化可解析地址 = (baseUrlRaw: string): string => {
    const raw = (baseUrlRaw || '').trim();
    if (!raw) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
    if (/^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|[a-z0-9.-]+\.local)(?::\d+)?(?:\/.*)?$/i.test(raw)) {
        return `http://${raw}`;
    }
    return raw;
};

// 把用户填写的地址解析成 URL：兼容省略协议的情况（example.com:8886 / localhost:8188）。
// 直接交给 new URL 会把 host 部分当成自定义协议，端口信息随之丢失。
const 解析地址URL = (baseUrlRaw: string): URL | null => {
    const raw = (baseUrlRaw || '').trim();
    if (!raw) return null;
    const candidates = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? [raw] : [raw, `http://${raw}`];
    for (const candidate of candidates) {
        try {
            const url = new URL(candidate);
            if (!/^https?:$/i.test(url.protocol)) continue;
            return url;
        } catch {
            // 当前候选解析失败，继续尝试下一个
        }
    }
    return null;
};

export const 识别ComfyUI地址类型 = (baseUrlRaw: string): ComfyUI地址类型 => {
    const url = 解析地址URL(baseUrlRaw);
    if (!url) return 'unknown';
    const host = url.hostname.toLowerCase();
    if (/(^|\.)cnb\.run$/i.test(host) || /(^|\.)cnb\.space$/i.test(host)
        || /(^|\.)cloudstudio\.net$/i.test(host) || /(^|\.)cloudstudio\.com$/i.test(host) || /(^|\.)cloudstudio\.club$/i.test(host) || /(^|\.)coding\.net$/i.test(host)) return 'cnb';
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host)) return 'loopback';
    if (判断局域网主机(host)) return 'lan';
    return 'public';
};

// 读取地址里实际填写的端口，用于给玩家可照抄的启动参数，避免一律写 8188 造成误导
const 读取地址端口 = (baseUrlRaw: string): string => {
    const url = 解析地址URL(baseUrlRaw);
    if (!url) return '8188';
    if (url.port) return url.port;
    return url.protocol === 'https:' ? '443' : '80';
};

// 自建后端（自有域名/公网服务器）的自查清单：不依赖我们的服务端探测，玩家自己就能定位
const 构建自建后端自查说明 = (baseUrlRaw: string): string[] => {
    const parsed = 解析地址URL(baseUrlRaw);
    // 补全协议，保证清单里的地址能直接粘进浏览器地址栏
    const baseUrl = parsed
        ? `${parsed.origin}${清理末尾斜杠(parsed.pathname)}`
        : 清理末尾斜杠((baseUrlRaw || '').trim());
    const port = 读取地址端口(baseUrlRaw);
    const statsUrl = baseUrl ? `${baseUrl}/system_stats` : '/system_stats';
    const 明文说明 = /^http:\/\//i.test(baseUrl)
        ? '注意：这是 http 明文地址，安卓 APK 可以访问，但浏览器网页版（https 站点）会被混合内容策略拦截；要在网页版使用，请给后端配上 HTTPS。'
        : '';
    return [
        `请先用手机或电脑浏览器直接打开 ${statsUrl}：`,
        `· 打不开或一直转圈：后端没有对外开放。确认 ComfyUI 启动参数包含 --listen 0.0.0.0 --port ${port}，服务器安全组/防火墙已放行 ${port} 端口，域名已解析到这台服务器的公网 IP。`,
        '· 能显示一段 JSON：后端本身正常，问题出在 App 到后端这一段（端口转发、反向代理、协议限制）。请把该页面截图发给开发者。',
        明文说明
    ].filter(Boolean);
};

const 构建ComfyUI连接失败排查说明 = (baseUrl: string): string[] => {
    const addressType = 识别ComfyUI地址类型(baseUrl);
    if (addressType === 'loopback') {
        return [
            '可能原因：本机 ComfyUI 没有启动、端口填错、浏览器跨域 CORS 被拦截，或在手机/APK 里误填了 127.0.0.1/localhost。',
            '请确认：1. 在运行 ComfyUI 的同一台电脑浏览器打开该地址，确认页面或 /system_stats 能访问；2. ComfyUI 启动参数包含 --listen 0.0.0.0 --port 8188 --enable-cors-header "*"；3. 如果是手机/APK 连接电脑本地 ComfyUI，不要填 127.0.0.1，请改填电脑的局域网 IP，例如 http://192.168.1.23:8188。'
        ];
    }
    if (addressType === 'lan') {
        return [
            '可能原因：局域网 IP 或端口不可达、ComfyUI 没有监听 0.0.0.0、电脑防火墙拦截 8188，手机和电脑不在同一网络，或 ComfyUI 没有开启 CORS。',
            '请确认：1. 在同一局域网另一台设备浏览器打开该地址；2. ComfyUI 启动参数包含 --listen 0.0.0.0 --port 8188 --enable-cors-header "*"；3. Windows 防火墙允许 Python/ComfyUI 的 8188 端口入站。'
        ];
    }
    if (addressType === 'cnb') {
        return [
            '可能原因：云端 ComfyUI 工作区未启动、地址已失效、Cloud Studio 工作区页面被关闭导致后端休眠、浏览器被跨域限制拦截，或 ComfyUI 启动时没有开启 CORS。',
            '请确认：1. Cloud Studio 工作区页面保持打开并在线；2. 自动发现列表里的 8188 地址仍可访问；3. ComfyUI 启动参数包含 --listen 0.0.0.0 --enable-cors-header "*"；4. 如果刚重启过后端，请刷新列表后重新选择地址。',
            'Cloud Studio 需要在端口/预览面板开放 8188，并让 cloudstudio_sync.sh 上报公网预览地址。'
        ];
    }
    return [
        '可能原因：服务器没有启动、地址或端口填错、网络不可达、域名没有解析到这台服务器，或后端只监听在本机/内网而没有对外开放。',
        ...构建自建后端自查说明(baseUrl)
    ];
};

// 获取代理基础地址优先级：用户自定义 > 当前 origin > 默认网站
const 获取运行时代理基础地址 = (自定义代理地址?: string): string => {
    const 用户自定义 = (自定义代理地址 || '').trim();
    if (用户自定义) return 用户自定义.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol) && !isNativeCapacitorEnvironment()) {
        return window.location.origin.replace(/\/+$/, '');
    }
    return (RELEASE_INFO.websiteUrl || 'https://msjh.bacon.de5.net').replace(/\/+$/, '');
};

const 判断可走ComfyUI运行时代理 = (baseUrlRaw: string): boolean => {
    try {
        const url = new URL((baseUrlRaw || '').trim());
        return /^https?:$/i.test(url.protocol)
            && (/(^|\.)cnb\.run$/i.test(url.hostname)
                || /(^|\.)cnb\.space$/i.test(url.hostname)
                || /(^|\.)cloudstudio\.net$/i.test(url.hostname)
                || /(^|\.)cloudstudio\.com$/i.test(url.hostname)
                || /(^|\.)cloudstudio\.club$/i.test(url.hostname)
                || /(^|\.)coding\.net$/i.test(url.hostname));
    } catch {
        return false;
    }
};

export const 构建ComfyUI运行时代理端点 = (baseUrlRaw: string, pathRaw: string): string => {
    const baseUrl = 清理末尾斜杠((baseUrlRaw || '').trim());
    if (!baseUrl || !判断可走ComfyUI运行时代理(baseUrl)) {
        const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
        return `${baseUrl}${path}`;
    }

    const proxyBase = 获取运行时代理基础地址();
    const [pathPart, queryPart = ''] = (pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`).split('?');
    const params = new URLSearchParams(queryPart);
    params.set('url', baseUrl);
    return `${proxyBase}/api/image-backend/comfyui-proxy${pathPart}?${params.toString()}`;
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

const 判断可走OpenAI图片运行时代理 = (url: URL): boolean => {
    if (!/^https:$/i.test(url.protocol)) return false;
    if (!/^\/(?:v1\/)?images\/(?:generations|edits)$/i.test(url.pathname)) return false;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)) return false;
    return true;
};

const 转换为运行时OpenAI图片代理端点 = (directEndpoint: string): string => {
    if (!directEndpoint) return directEndpoint;
    try {
        const url = new URL(directEndpoint);
        if (!判断可走OpenAI图片运行时代理(url)) return directEndpoint;
        const proxyUrl = new URL(`${获取运行时代理基础地址()}/api/image-backend/openai-image-proxy${url.pathname}`);
        proxyUrl.search = url.search;
        proxyUrl.searchParams.set('url', `${url.origin}${url.pathname.replace(/\/(?:v1\/)?images\/(?:generations|edits)$/i, '')}`.replace(/\/+$/, ''));
        return proxyUrl.toString();
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

const 预定义供应商目标映射: Record<string, string> = {
    openai: 'https://api.openai.com',
    'openai-official': 'https://api.openai.com',
    xai_official: 'https://api.x.ai',
    'xai-official': 'https://api.x.ai'
};

const 当前是在线环境 = (): boolean => {
    if (typeof window === 'undefined') return false;
    const origin = window.location.origin;
    return origin === 'https://msjh.bacon159.pp.ua' || origin === 'https://msjh.bacon.de5.net';
};

const 构建直连端点 = (baseUrlRaw: string, customPathRaw?: string): string => {
    const base = 规范化OpenAI图片基础地址(baseUrlRaw);
    const customPath = (customPathRaw || '').trim();
    if (/^https?:\/\//i.test(customPath)) {
        const normalizedCustomBase = 规范化OpenAI图片基础地址(customPath);
        if (normalizedCustomBase && normalizedCustomBase !== 清理末尾斜杠(customPath)) {
            return 构建直连端点(normalizedCustomBase);
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

// 同域图片代理是否可用：web 恒可用；原生仅当配置了远程同步 API 时可用
const 可走同域图片代理 = (): boolean => {
    if (typeof window === 'undefined') return false;
    if (isNativeCapacitorEnvironment()) return requiresRemoteSyncApi();
    return /^https?:$/i.test(window.location.protocol);
};

// 是否本地开发环境（localhost / 127.0.0.1）——这类环境下第三方端点大概率回绝 CORS，必须走代理
const 是否本地开发环境 = (): boolean => {
    if (typeof window === 'undefined') return false;
    const h = (window.location?.hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '0.0.0.0';
};

// 代理决策原因（用于日志）
type 代理决策 = {
    走代理: boolean;
    原因: string;
    原始baseUrl: string;
    供应商ID: string;
    origin: string;
    isNative: boolean;
};

export const 获取代理决策 = (
    baseUrlRaw: string,
    供应商ID: string,
    options?: { useRuntimeProxy?: boolean; 供应商ID?: string; 图片需要代理?: boolean; 自定义图片代理地址?: string }
): 代理决策 => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    const isNative = isNativeCapacitorEnvironment();
    const 有自定义代理 = !!(options?.自定义图片代理地址 || '').trim();
    const 用户开启代理 = options?.图片需要代理 === true;

    // 1) 目标地址是 localhost/私网 → 强制直连（Cloudflare Worker 无法访问用户设备的 localhost）
    try {
        const targetUrl = new URL(规范化可解析地址(baseUrlRaw));
        if (判断局域网主机(targetUrl.hostname)) {
            return { 走代理: false, 原因: '目标是localhost/私网地址，强制直连', 原始baseUrl: baseUrlRaw, 供应商ID, origin, isNative };
        }
    } catch {
        // URL 解析失败时继续后续决策
    }

    // 2) 用户显式开启代理 + 配了自定义代理地址 → 走自定义代理
    if (用户开启代理 && 有自定义代理) {
        return { 走代理: true, 原因: '用户开启代理+自定义地址', 原始baseUrl: baseUrlRaw, 供应商ID, origin, isNative };
    }

    // 3) 用户显式开启代理 + 未配自定义地址 + 命中白名单 → 走默认代理
    if (用户开启代理 && 预定义供应商目标映射[供应商ID]) {
        return { 走代理: true, 原因: '用户开启代理+默认代理', 原始baseUrl: baseUrlRaw, 供应商ID, origin, isNative };
    }

    // 4) 用户开启代理但目标不在默认白名单内 → 直连
    if (用户开启代理) {
        return { 走代理: false, 原因: '用户开启代理，但目标不在默认代理白名单内', 原始baseUrl: baseUrlRaw, 供应商ID, origin, isNative };
    }

    // 5) 用户未开启代理 → 直连
    return { 走代理: false, 原因: '用户未开启代理，直连', 原始baseUrl: baseUrlRaw, 供应商ID, origin, isNative };
};

export const 构建OpenAI图片生成端点 = (
    baseUrlRaw: string,
    customPathRaw?: string,
    options?: { useRuntimeProxy?: boolean; 供应商ID?: string; 图片需要代理?: boolean; 自定义图片代理地址?: string }
): string => {
    const 供应商ID = options?.供应商ID || 'openai-custom';
    const 决策 = 获取代理决策(baseUrlRaw, 供应商ID, options);

    if (决策.走代理) {
        const 自定义代理地址 = (options?.自定义图片代理地址 || '').trim();
        if (自定义代理地址) {
            const targetUrl = 构建直连端点(baseUrlRaw, customPathRaw);
            return `${自定义代理地址.replace(/\/+$/, '')}?url=${encodeURIComponent(targetUrl)}`;
        }
        if (预定义供应商目标映射[供应商ID]) {
            const proxyBase = 获取运行时代理基础地址();
            const path = customPathRaw || '/v1/images/generations';
            return `${proxyBase}/api/image-backend/openai-image-proxy${path}?provider=${encodeURIComponent(供应商ID)}`;
        }
    }

    return 构建直连端点(baseUrlRaw, customPathRaw);
};

export const 构建ComfyUI连接失败提示 = (baseUrlRaw: string, error?: any): string => {
    const baseUrl = (baseUrlRaw || '').replace(/\/+$/, '') || '未填写';
    const rawMessage = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
    return [
        `ComfyUI 连接失败，当前地址：${baseUrl}。`,
        ...构建ComfyUI连接失败排查说明(baseUrl),
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
    const addressType = 识别ComfyUI地址类型(baseUrl);

    // 服务端探测只覆盖云端工作区地址：自建域名/公网 IP 会被回 400 invalid_url。
    // 这种情况必须走自查清单，不能继续往下掉进「Cloud Studio 休眠」的兜底文案。
    if (probe?.reason === 'invalid_url') {
        return [
            `ComfyUI 连接失败，当前地址：${baseUrl}。`,
            '这个地址不在远程诊断的服务端探测范围内（我们只代为检查云端工作区地址），所以这次无法替你判断后端状态。',
            ...构建自建后端自查说明(baseUrl),
            rawMessage ? `原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    // 探测请求本身没拿到结果（离线或诊断接口异常）——不能据此断定后端有问题
    if (!probe) {
        return [
            `ComfyUI 连接失败，当前地址：${baseUrl}。`,
            '远程诊断服务这次没有返回结果，无法判断后端状态。',
            ...(addressType === 'cnb' ? 构建ComfyUI连接失败排查说明(baseUrl) : 构建自建后端自查说明(baseUrl)),
            rawMessage ? `原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    if (probe?.reachable === true && probe.ok === true) {
        const corsHeader = probe.headers?.['access-control-allow-origin'] || '';
        return [
            `ComfyUI 后端在线，但浏览器直连失败，当前地址：${baseUrl}。`,
            '最可能原因：跨域 CORS 被浏览器拦截，或浏览器安全策略不允许当前网页直接访问这个 ComfyUI 地址。',
            corsHeader
                ? `服务端当前返回的 CORS 头：Access-Control-Allow-Origin=${corsHeader}`
                : '服务端探测可访问，但没有看到 Access-Control-Allow-Origin 响应头。',
            '处理办法：重启 ComfyUI，并确保启动参数包含 --listen 0.0.0.0 --enable-cors-header "*"；如果使用 Cloud Studio，请保持工作区页面打开。',
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
        if (addressType === 'loopback' || addressType === 'lan') {
            return [
                `ComfyUI 服务器不可达，当前地址：${baseUrl}。`,
                ...构建ComfyUI连接失败排查说明(baseUrl),
                probe.error ? `远程探测错误：${probe.error}` : '',
                rawMessage ? `浏览器原始错误：${rawMessage}` : ''
            ].filter(Boolean).join('\n');
        }
        const reasonText = probe.reason === 'timeout'
            ? '远程探测超时，后端大概率已休眠、正在启动或网络不可达。'
            : probe.reason === 'dns_error'
                ? '域名解析失败，地址可能已失效或复制错了。'
                : probe.reason === 'tls_error'
                    ? 'HTTPS/TLS 证书异常，浏览器和服务器无法建立安全连接。'
                : addressType === 'cnb'
                    ? '远程探测也无法连到该地址，后端大概率未启动、Cloud Studio 工作区已关闭/休眠，或地址已失效。'
                    : '远程探测也无法连到该地址，后端大概率未启动、端口未对外开放，或地址已失效。';
        if (addressType !== 'cnb') {
            return [
                `ComfyUI 服务器不可达，当前地址：${baseUrl}。`,
                `最可能原因：${reasonText}`,
                ...构建自建后端自查说明(baseUrl),
                probe.error ? `远程探测错误：${probe.error}` : '',
                rawMessage ? `浏览器原始错误：${rawMessage}` : ''
            ].filter(Boolean).join('\n');
        }
        return [
            `ComfyUI 服务器不可达，当前地址：${baseUrl}。`,
            `最可能原因：${reasonText}`,
            '处理办法：打开并保持 Cloud Studio 工作区页面在线，确认 ComfyUI 已启动到 8188 端口；然后回到游戏刷新自动发现列表，重新选择最新地址。',
            'Cloud Studio 需要在端口/预览面板开放 8188，并由 cloudstudio_sync.sh 上报公网预览地址。',
            probe.error ? `远程探测错误：${probe.error}` : '',
            rawMessage ? `浏览器原始错误：${rawMessage}` : ''
        ].filter(Boolean).join('\n');
    }

    if (isNativeCapacitorEnvironment()) {
        if (addressType === 'loopback' || addressType === 'lan') {
            return [
                `ComfyUI 连接失败，当前地址：${baseUrl}。`,
                ...构建ComfyUI连接失败排查说明(baseUrl),
                rawMessage ? `原始错误：${rawMessage}` : ''
            ].filter(Boolean).join('\n');
        }
        if (addressType === 'cnb') {
            return [
                `ComfyUI 连接失败，当前地址：${baseUrl}。`,
                '当前在 APK 内，已尝试远程诊断但没有拿到明确结果。最常见原因仍是 Cloud Studio 工作区页面关闭导致后端休眠，或地址已经变化。',
                '请打开 Cloud Studio 工作区页面保活，刷新自动发现列表后重新选择地址。',
                rawMessage ? `原始错误：${rawMessage}` : ''
            ].filter(Boolean).join('\n');
        }
        return [
            `ComfyUI 连接失败，当前地址：${baseUrl}。`,
            '当前在 APK 内，远程诊断没有拿到明确结果，无法确认后端是否在线。',
            ...构建自建后端自查说明(baseUrl),
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
