import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore 方括号路径由打包器解析
import { onRequestGet, onRequestPost } from '../functions/api/ai-relay/[[path]]';
import { 疑似浏览器跨域失败, 构建AI中转地址, fetchWithCorsRelay, 读取跨域中转模式, 写入跨域中转模式 } from '../services/ai/corsRelay';

const makeRequest = (url: string, init?: RequestInit) => new Request(url, init);

const okUpstream = (body = '{"ok":true}', contentType = 'application/json') => new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType }
});

describe('AI 同域中转端点防护', () => {
    it('缺少 target 参数返回 400', async () => {
        const res = await onRequestGet({ request: makeRequest('https://msjh.bacon159.pp.ua/api/ai-relay') });
        expect(res.status).toBe(400);
    });

    it('非 http/https 协议被拒绝', async () => {
        const res = await onRequestGet({ request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${encodeURIComponent('ftp://example.com/v1/models')}`) });
        expect(res.status).toBe(400);
    });

    it('指向本站自身域名被拒绝（防刷自家接口）', async () => {
        const target = encodeURIComponent('https://msjh.bacon159.pp.ua/api/workshop/modules');
        const res = await onRequestGet({ request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${target}`) });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(String(body.error)).toContain('不允许');
    });

    it('指向私有/回环 IP 被拒绝（SSRF 防护）', async () => {
        for (const host of ['127.0.0.1', '10.1.2.3', '192.168.1.5', '172.16.0.9', '169.254.1.1', '[::1]']) {
            const target = encodeURIComponent(`https://${host}/v1/models`);
            const res = await onRequestGet({ request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${target}`) });
            expect(res.status).toBe(400);
        }
    });

    it('非 AI 端点路径被拒绝（防通用代理滥用）', async () => {
        const target = encodeURIComponent('https://evil.example.com/admin/login');
        const res = await onRequestGet({ request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${target}`) });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(String(body.error)).toContain('AI 模型端点');
    });

    it('合法 chat/completions 目标透传请求与响应', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okUpstream('{"content":"hi"}'));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const target = 'https://api.example.com/v1/chat/completions';
            const res = await onRequestPost({
                request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${encodeURIComponent(target)}`, {
                    method: 'POST',
                    headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'gpt-x', messages: [] })
                })
            });
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ content: 'hi' });
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [calledUrl, init] = fetchMock.mock.calls[0];
            expect(calledUrl).toBe(target);
            expect((init as any).redirect).toBe('manual'); // Workers 不支持 redirect:'error'
            expect((init as any).headers.get('Authorization')).toBe('Bearer sk-test');
            expect(res.headers.get('X-MSJH-Relay')).toBe('1');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('透传 api-key 等专用鉴权头（小米 MiMo / 自建网关）', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okUpstream('{"ok":true}'));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const target = 'https://api.example.com/v1/chat/completions';
            const res = await onRequestPost({
                request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${encodeURIComponent(target)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': 'mimo-key',
                        'x-api-key': 'gw-key',
                        'x-goog-api-key': 'gemini-key'
                    },
                    body: JSON.stringify({ model: 'mimo-v2-flash', messages: [] })
                })
            });
            expect(res.status).toBe(200);
            const [, init] = fetchMock.mock.calls[0];
            const forwarded = (init as any).headers as Headers;
            expect(forwarded.get('api-key')).toBe('mimo-key');
            expect(forwarded.get('x-api-key')).toBe('gw-key');
            expect(forwarded.get('x-goog-api-key')).toBe('gemini-key');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('models 列表（GET）可中转', async () => {        const fetchMock = vi.fn().mockResolvedValue(okUpstream('{"data":[{"id":"m1"}]}'));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const target = 'https://api.example.com/v1/models';
            const res = await onRequestGet({ request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${encodeURIComponent(target)}`) });
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.data[0].id).toBe('m1');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('上游错误状态码原样透传', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"bad key"}', { status: 401, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const target = 'https://api.example.com/v1/chat/completions';
            const res = await onRequestPost({ request: makeRequest(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${encodeURIComponent(target)}`, { method: 'POST', body: '{}' }) });
            expect(res.status).toBe(401);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('corsRelay 前端判定与降级', () => {
    beforeEach(() => {
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => { store.set(k, v); },
            removeItem: (k: string) => { store.delete(k); },
            clear: () => { store.clear(); }
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('疑似浏览器跨域失败只对无状态的网络层错误返回 true', () => {
        expect(疑似浏览器跨域失败(new TypeError('Failed to fetch'))).toBe(true);
        expect(疑似浏览器跨域失败(new TypeError('Load failed'))).toBe(true);
        const withStatus: any = new TypeError('Failed to fetch');
        withStatus.status = 500;
        expect(疑似浏览器跨域失败(withStatus)).toBe(false);
        expect(疑似浏览器跨域失败(new DOMException('The operation was aborted.', 'AbortError'))).toBe(false);
        expect(疑似浏览器跨域失败(null)).toBe(false);
    });

    it('构建AI中转地址对 endpoint 做 URL 编码', () => {
        const url = 构建AI中转地址('https://api.example.com/v1/chat/completions?x=1');
        expect(url).toContain('/api/ai-relay?target=');
        expect(url).toContain(encodeURIComponent('https://api.example.com/v1/chat/completions?x=1'));
    });

    it('中转模式开关持久化', () => {
        expect(读取跨域中转模式()).toBe('auto');
        写入跨域中转模式('off');
        expect(读取跨域中转模式()).toBe('off');
        写入跨域中转模式('auto');
        expect(读取跨域中转模式()).toBe('auto');
    });

    it('直连成功时不触发中转', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okUpstream());
        vi.stubGlobal('fetch', fetchMock);
        try {
            const { response, viaRelay } = await fetchWithCorsRelay('https://api.example.com/v1/models', { method: 'GET' });
            expect(viaRelay).toBe(false);
            expect(response.status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
