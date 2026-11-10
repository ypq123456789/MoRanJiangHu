import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    构建ComfyUI精确连接失败提示,
    识别ComfyUI地址类型
} from '../services/ai/imageGenerationDiagnostics';

const 设置运行环境 = (options: { native?: boolean } = {}) => {
    const fakeWindow: any = {
        location: { protocol: 'http:', origin: 'http://localhost:3000', hostname: 'localhost' }
    };
    if (options.native) {
        fakeWindow.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android'
        };
    }
    vi.stubGlobal('window', fakeWindow);
};

const 模拟探测响应 = (payload: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    })));
};

const 模拟探测不可用 = () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('Failed to fetch');
    }));
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('ComfyUI 诊断提示：自建后端不得被 Cloud Studio 文案误导', () => {
    it('识别自建公网域名与云端工作区域名的区别', () => {
        expect(识别ComfyUI地址类型('http://my-comfy.example.com:8886')).toBe('public');
        expect(识别ComfyUI地址类型('https://abc-8188.cnb.run')).toBe('cnb');
        expect(识别ComfyUI地址类型('http://192.168.1.23:8188')).toBe('lan');
    });

    it('探测接口回 invalid_url 时给出自查清单，而不是甩锅 Cloud Studio', async () => {
        设置运行环境();
        // 线上 /api/image-backend/probe 对自建域名正是回这个结构
        模拟探测响应({ ok: false, reason: 'invalid_url', message: '探测地址无效或不在允许范围内。' });

        const message = await 构建ComfyUI精确连接失败提示(
            'http://my-comfy.example.com:8886',
            new TypeError('Failed to fetch')
        );

        expect(message).toContain('不在远程诊断的服务端探测范围内');
        expect(message).toContain('http://my-comfy.example.com:8886/system_stats');
        expect(message).toContain('--port 8886');
        expect(message).not.toContain('Cloud Studio');
        expect(message).toContain('原始错误：Failed to fetch');
    });

    it('APK 内遇到 invalid_url 时同样不提 Cloud Studio', async () => {
        设置运行环境({ native: true });
        模拟探测响应({ ok: false, reason: 'invalid_url' });

        const message = await 构建ComfyUI精确连接失败提示(
            'http://my-comfy.example.com:8886',
            new TypeError('Failed to fetch')
        );

        expect(message).not.toContain('Cloud Studio');
        expect(message).toContain('--listen 0.0.0.0');
    });

    it('探测服务本身不可用时不自称「Cloud Studio 休眠」', async () => {
        设置运行环境({ native: true });
        模拟探测不可用();

        const message = await 构建ComfyUI精确连接失败提示(
            'http://my-comfy.example.com:8886',
            new TypeError('Failed to fetch')
        );

        expect(message).toContain('远程诊断服务这次没有返回结果');
        expect(message).not.toContain('Cloud Studio');
    });

    it('探测判定自建域名不可达时给出端口自查而非工作区保活', async () => {
        设置运行环境();
        模拟探测响应({ ok: false, reachable: false, reason: 'unreachable' });

        const message = await 构建ComfyUI精确连接失败提示(
            'http://my-comfy.example.com:8886',
            new TypeError('Failed to fetch')
        );

        expect(message).toContain('ComfyUI 服务器不可达');
        expect(message).toContain('安全组/防火墙');
        expect(message).not.toContain('Cloud Studio');
    });

    it('云端工作区地址仍保留 Cloud Studio 保活指引（回归）', async () => {
        设置运行环境({ native: true });
        模拟探测不可用();

        const message = await 构建ComfyUI精确连接失败提示(
            'https://abc-8188.cnb.run',
            new TypeError('Failed to fetch')
        );

        expect(message).toContain('Cloud Studio');
    });

    it('http 明文地址会额外提示网页版混合内容限制', async () => {
        设置运行环境();
        模拟探测响应({ ok: false, reason: 'invalid_url' });

        const message = await 构建ComfyUI精确连接失败提示(
            'http://my-comfy.example.com:8886',
            new TypeError('Failed to fetch')
        );

        expect(message).toContain('混合内容');
    });
});
