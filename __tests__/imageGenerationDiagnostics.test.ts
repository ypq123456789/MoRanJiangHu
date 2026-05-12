import { describe, expect, it } from 'vitest';
import {
    判断疑似网络或跨域错误,
    构建ComfyUI连接失败提示,
    构建OpenAI图片生成端点,
    构建通用生图连接失败提示,
    规范化OpenAI图片基础地址,
    规范化OpenAI图片模型名称
} from '../services/ai/imageGenerationDiagnostics';

describe('imageGenerationDiagnostics', () => {
    it('recognizes common browser fetch and CORS failures', () => {
        expect(判断疑似网络或跨域错误(new TypeError('Failed to fetch'))).toBe(true);
        expect(判断疑似网络或跨域错误(new Error('blocked by CORS policy'))).toBe(true);
        expect(判断疑似网络或跨域错误(new Error('validation failed'))).toBe(false);
    });

    it('builds actionable ComfyUI connection guidance', () => {
        const message = 构建ComfyUI连接失败提示('https://cnb-demo-001.cnb.space/', new Error('Failed to fetch'));

        expect(message).toContain('ComfyUI 连接失败');
        expect(message).toContain('CNB 的 VS Code 页面保持打开');
        expect(message).toContain('--enable-cors-header "*"');
        expect(message).toContain('https://cnb-xxxx-xxxx-001.cnb.space/?folder=/workspace');
        expect(message).toContain('原始错误：Failed to fetch');
    });

    it('uses backend-specific wording for SD WebUI', () => {
        const message = 构建通用生图连接失败提示('sd_webui', 'http://127.0.0.1:7860', new Error('NetworkError'));

        expect(message).toContain('Stable Diffusion WebUI 连接失败');
        expect(message).toContain('API/CORS');
        expect(message).toContain('NetworkError');
    });

    it('normalizes pucoding image console URLs to the OpenAI-compatible image endpoint', () => {
        expect(规范化OpenAI图片基础地址('https://pucoding.com/playground/image')).toBe('https://pucoding.com');
        expect(构建OpenAI图片生成端点('https://pucoding.com/playground/image')).toBe('https://pucoding.com/v1/images/generations');
        expect(构建OpenAI图片生成端点('https://example.com/v1')).toBe('https://example.com/v1/images/generations');
        expect(构建OpenAI图片生成端点('https://api.example.com', 'https://pucoding.com/playground/image')).toBe('https://pucoding.com/v1/images/generations');
    });

    it('routes pucoding image endpoints through the runtime same-origin proxy when requested', () => {
        const originalWindow = (globalThis as any).window;
        (globalThis as any).window = {
            location: {
                protocol: 'http:',
                origin: 'http://127.0.0.1:4173'
            }
        };

        try {
            expect(构建OpenAI图片生成端点('https://pucoding.com/playground/image', undefined, { useRuntimeProxy: true }))
                .toBe('http://127.0.0.1:4173/api/pucoding-image/v1/images/generations');
            expect(构建OpenAI图片生成端点('https://api.example.com/v1', undefined, { useRuntimeProxy: true }))
                .toBe('https://api.example.com/v1/images/generations');
        } finally {
            (globalThis as any).window = originalWindow;
        }
    });

    it('repairs the common gpt-image model typo before image requests', () => {
        expect(规范化OpenAI图片模型名称('gpt-iamge-2')).toBe('gpt-image-2');
        expect(规范化OpenAI图片模型名称('gpt-image-2')).toBe('gpt-image-2');
    });
});
