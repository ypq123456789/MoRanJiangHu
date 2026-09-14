// @vitest-environment jsdom
// 网页版流式请求的跨域中转兜底回归测试。
//
// 背景：网页版「测试连接」是非流式（走 fetch + fetchWithCorsRelay，有同域中转兜底），
// 而「主剧情生成」是流式（走 XHR）。2026-09-14 玩家反馈"接口测试正常、进游戏报无法连接"，
// 根因就是 XHR 流式路径没有任何中转兜底，却抛出"已自动尝试同域中转仍失败"的文案。
// 本文件锁定修复后的四条路径：改走中转、零输出才允许重发、中转拒绝要翻译、正常流式不受影响。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { 请求模型文本 } from '../services/ai/chatCompletionClient';
import { 翻译跨域中转拒绝 } from '../services/ai/corsRelay';
import { 创建接口配置模板 } from '../utils/apiConfig';

type 剧本 = '网络失败' | '先产出再中断' | '中转拒绝' | '正常流式';

let 直连剧本: 剧本 = '网络失败';
let 中转剧本: 剧本 = '网络失败';

const SSE_正文 = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n';

/** 可控 XHR：按 URL 判定直连/中转，按剧本给出网络失败、部分产出后中断、400 拒绝或正常 SSE。 */
class 可控XHR {
    static 打开过的地址: string[] = [];
    static 直连请求数 = 0;
    static 中转请求数 = 0;

    onprogress: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    readyState = 0;
    status = 0;
    responseText = '';
    private url = '';

    open(_method: string, url: string): void {
        this.url = String(url);
        可控XHR.打开过的地址.push(this.url);
        if (this.url.includes('/api/ai-relay')) 可控XHR.中转请求数 += 1;
        else 可控XHR.直连请求数 += 1;
        this.readyState = 1;
    }

    setRequestHeader(): void { /* noop */ }

    getResponseHeader(name: string): string {
        return name.toLowerCase() === 'content-type' ? 'text/event-stream' : '';
    }

    abort(): void { /* noop */ }

    send(): void {
        const 是中转 = this.url.includes('/api/ai-relay');
        const 当前剧本 = 是中转 ? 中转剧本 : 直连剧本;
        setTimeout(() => {
            this.readyState = 4;
            if (当前剧本 === '网络失败') {
                this.status = 0;
                this.onerror?.();
                return;
            }
            if (当前剧本 === '先产出再中断') {
                // 上游已开始产出正文后连接中断：不允许重发（会重复计费）
                this.responseText = 'data: {"choices":[{"delta":{"content":"半"}}]}\n\n';
                this.onprogress?.();
                this.status = 0;
                this.onerror?.();
                return;
            }
            if (当前剧本 === '中转拒绝') {
                this.status = 400;
                this.responseText = JSON.stringify({ error: '不允许通过中转访问私有地址' });
                this.onload?.();
                return;
            }
            this.status = 200;
            this.responseText = SSE_正文;
            this.onload?.();
        }, 0);
    }
}

const 构建配置 = () => ({
    ...创建接口配置模板('openai_compatible'),
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: 'qwen3:8b'
});

const 执行流式请求 = () => 请求模型文本(构建配置(), [{ role: 'user', content: 'ping' }], {
    temperature: 0,
    streamOptions: { stream: true }
});

const 捕获报错文本 = () => 执行流式请求().then(() => '', (error: any) => String(error?.message || error));

describe('网页版流式请求的跨域中转兜底', () => {
    beforeEach(() => {
        直连剧本 = '网络失败';
        中转剧本 = '网络失败';
        可控XHR.打开过的地址 = [];
        可控XHR.直连请求数 = 0;
        可控XHR.中转请求数 = 0;
        vi.stubGlobal('XMLHttpRequest', 可控XHR);
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('直连被网络层拦截后必须改走 /api/ai-relay（修复前中转请求数恒为 0）', async () => {
        const 报错文本 = await 捕获报错文本();

        expect(可控XHR.打开过的地址.some((url) => url.includes('api.example.com'))).toBe(true);
        expect(可控XHR.中转请求数).toBeGreaterThan(0);
        expect(可控XHR.打开过的地址.every((url) => url.includes('api.example.com') || url.includes('/api/ai-relay'))).toBe(true);
        // 中转确实被尝试过，此时这句提示才是真话
        expect(报错文本).toContain('已自动尝试同域中转仍失败');
    });

    it('已收到部分正文后中断时不得重发（避免重复调用与重复计费）', async () => {
        直连剧本 = '先产出再中断';
        const 报错文本 = await 捕获报错文本();

        expect(可控XHR.中转请求数).toBe(0);
        expect(报错文本).toContain('为避免重复计费未自动重发');
        expect(报错文本).not.toContain('已自动尝试同域中转仍失败');
    });

    it('中转因内网地址拒绝时给出可读处置建议，而不是透传 400 JSON', async () => {
        中转剧本 = '中转拒绝';
        const 报错文本 = await 捕获报错文本();

        expect(可控XHR.中转请求数).toBeGreaterThan(0);
        expect(报错文本).toContain('内网');
        expect(报错文本).toContain('APK');
        expect(报错文本).not.toContain('API Error: 400');
    });

    it('直连正常流式时不触发中转，且正文解析不受影响', async () => {
        直连剧本 = '正常流式';
        await expect(执行流式请求()).resolves.toBe('你好');
        expect(可控XHR.中转请求数).toBe(0);
    });
});

describe('翻译跨域中转拒绝', () => {
    it('内网/回环地址 → 提示改用 APK 或公网 443', () => {
        expect(翻译跨域中转拒绝(400, '{"error":"不允许通过中转访问私有地址"}')).toContain('内网');
        expect(翻译跨域中转拒绝(400, '{"error":"不允许通过中转访问该域名"}')).toContain('内网');
    });

    it('非标准端口 → 提示端口限制', () => {
        expect(翻译跨域中转拒绝(400, '{"error":"http 目标仅允许 80 端口"}')).toContain('端口');
        expect(翻译跨域中转拒绝(400, '{"error":"https 目标仅允许 443 端口"}')).toContain('端口');
    });

    it('体积超限与非法端点各自给出对应建议', () => {
        expect(翻译跨域中转拒绝(413, '请求体过大，中转上限 2MB')).toContain('2MB');
        expect(翻译跨域中转拒绝(400, '仅支持转发 AI 模型端点（chat/completions、models 等）')).toContain('Base URL');
    });

    it('普通接口错误不翻译，保持原样', () => {
        expect(翻译跨域中转拒绝(401, '{"error":"invalid api key"}')).toBeNull();
        expect(翻译跨域中转拒绝(500, 'internal error')).toBeNull();
        expect(翻译跨域中转拒绝(400, '')).toBeNull();
    });
});
