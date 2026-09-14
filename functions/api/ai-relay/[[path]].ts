// 同域 AI 中转（CORS relay）：
// 网页版玩家的浏览器直连第三方 AI 接口时，若对方未开放 CORS，预检/请求会被浏览器拦截
// （Failed to fetch / OPTIONS 404）。本端点把请求转发到玩家指定的上游地址，
// 前端仅在"直连失败且疑似跨域拦截"时自动改走本端点（见 services/ai/chatCompletionClient.ts）。
//
// 防滥用/SSRF 约束：
// - 仅允许 http/https，且上游地址不得指向本站自身域名（防止被用于刷自家接口或绕过前端逻辑）；
// - 拒绝指向私有/回环网段的字面 IP 目标；
// - 上游路径必须在 AI 端点白名单内（chat/completions 等），不会被当作任意 URL 通用代理；
// - 请求体上限 2MB；不跟随重定向。
// 密钥（Authorization）仅原样透传，不落盘、不记录。

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key, x-api-key, x-goog-api-key, Accept'
};

const MAX_BODY_BYTES = 2 * 1024 * 1024;

// 需要原样透传的鉴权请求头：Authorization（Bearer）之外，部分供应商使用专用头
// （小米 MiMo 用 `api-key`，部分自建网关用 `x-api-key`/`x-goog-api-key`）。
// 漏传这些头会让中转变成 401，前端的中转兜底对这类供应商形同失效。
const FORWARDED_AUTH_HEADERS = ['Authorization', 'api-key', 'x-api-key', 'x-goog-api-key'];

const jsonError = (message: string, status: number): Response => (
    new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, 'Cache-Control': 'no-store' }
    })
);

// 上游路径白名单：仅允许常见 AI 端点，防止端点被当通用代理使用。
const ALLOWED_UPSTREAM_PATH_RE = /\/(chat\/completions|completions|messages|models|embeddings|responses|images\/generations|images\/edits|audio\/speech|count_tokens)$/i;

// 禁止指向自家域名（含 OpenList 源站），避免被用来刷自家接口或探测内部服务。
const FORBIDDEN_HOST_RE = /(^|\.)(bacon159\.pp\.ua|bacon\.de5\.net|workers\.dev|cloudflarestorage\.com|localhost|local(?:host)?\.localdomain|.*\.local|in-addr\.arpa|ip6\.arpa)$/i;

// 私有/回环网段的字面 IP 目标（IPv4 + 常见 IPv6）。
const isPrivateIpv4Literal = (host: string): boolean => {
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const parts = m.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true; // 非法数字形式一律拒绝
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true; // 组播/保留段
    return false;
};

const isPrivateIpv6Literal = (host: string): boolean => {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (!h.includes(':')) return false;
    if (h === '::' || h === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 Unique Local
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 Link-Local
    return false;
};

const resolveTargetUrl = (request: Request): URL => {
    const requestUrl = new URL(request.url);
    const encodedTarget = requestUrl.searchParams.get('target') || '';
    if (!encodedTarget) throw new Error('缺少 target 参数');
    let target: URL;
    try {
        target = new URL(encodedTarget);
    } catch {
        throw new Error('target 参数不是合法 URL');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw new Error('target 仅支持 http/https');
    }
    if (target.protocol === 'http:' && target.port && target.port !== '80') {
        throw new Error('http 目标仅允许 80 端口');
    }
    if (target.protocol === 'https:' && target.port && target.port !== '443') {
        throw new Error('https 目标仅允许 443 端口');
    }
    const host = target.hostname.toLowerCase();
    if (FORBIDDEN_HOST_RE.test(host)) throw new Error('不允许通过中转访问该域名');
    if (isPrivateIpv4Literal(host) || isPrivateIpv6Literal(host)) throw new Error('不允许通过中转访问私有地址');
    if (!ALLOWED_UPSTREAM_PATH_RE.test(target.pathname)) {
        throw new Error('仅支持转发 AI 模型端点（chat/completions、models 等）');
    }
    return target;
};

const buildForwardHeaders = (request: Request): Headers => {
    const headers = new Headers();
    for (const name of FORWARDED_AUTH_HEADERS) {
        const value = request.headers.get(name)?.trim() || '';
        if (value) headers.set(name, value);
    }
    const contentType = request.headers.get('Content-Type')?.trim() || 'application/json';
    const accept = request.headers.get('Accept')?.trim() || '';
    headers.set('Content-Type', contentType);
    if (accept) headers.set('Accept', accept);
    return headers;
};

const relay = async (request: Request): Promise<Response> => {
    const target = resolveTargetUrl(request);
    const init: RequestInit = {
        method: request.method,
        headers: buildForwardHeaders(request),
        redirect: 'error'
    };
    if (request.method === 'POST') {
        const body = await request.arrayBuffer();
        if (body.byteLength > MAX_BODY_BYTES) return jsonError('请求体过大，中转上限 2MB', 413);
        init.body = body;
    } else if (request.method !== 'GET') {
        return jsonError('仅支持 GET/POST', 405);
    }

    // Workers 的 fetch 不支持 redirect:'error'，用 manual 并显式拒绝 3xx，
    // 防止重定向跳转绕过上方的主机/路径校验。
    const upstream = await fetch(target.toString(), { ...init, redirect: 'manual' });
    if (upstream.status >= 300 && upstream.status < 400) {
        return jsonError('上游返回了重定向，中转不支持跟随重定向', 502);
    }
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-MSJH-Relay', '1');
    Object.entries(CORS_HEADERS).forEach(([key, value]) => responseHeaders.set(key, value));
    // 直接透传上游响应体（ReadableStream），SSE 流式输出保持逐块转发。
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
};

export function onRequestOptions(): Response {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request }: any): Promise<Response> {
    try {
        return await relay(request);
    } catch (error: any) {
        return jsonError(error?.message || 'AI 中转失败', 400);
    }
}

export async function onRequestPost({ request }: any): Promise<Response> {
    try {
        return await relay(request);
    } catch (error: any) {
        return jsonError(error?.message || 'AI 中转失败', 400);
    }
}
