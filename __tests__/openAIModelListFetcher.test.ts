import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockIsNative = vi.fn(() => false);
const mockHttpRequest = vi.fn();

vi.mock('../utils/apiConfig', () => ({
    构建OpenAI兼容模型列表候选地址: (baseUrl: string) => {
        const normalized = (baseUrl || '').replace(/\/+$/u, '');
        if (!normalized) return [];
        if (normalized.toLowerCase().includes('xiaomimimo.com')) {
            return [`${normalized}/models`];
        }
        return [`${normalized}/models`];
    }
}));

vi.mock('../utils/nativeRuntime', () => ({
    是否原生Capacitor环境: () => mockIsNative()
}));

vi.mock('@capacitor/core', () => ({
    CapacitorHttp: { request: (opts: any) => mockHttpRequest(opts) }
}));

const { 获取OpenAI兼容模型列表, 获取OpenAI兼容模型元数据 } = await import('../utils/openAIModelListFetcher');

describe('OpenAI 兼容模型列表获取', () => {
    it('元数据从真实响应保留label/display_name/name，缺少展示名称时使用ID', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
            { id: 'gemini-3-flash', label: '[按次] Gemini Flash', context_window: 200000 }, { id: 'gpt', display_name: 'GPT显示名' }, { id: 'claude', name: 'Claude显示名' }, { id: 'custom' }, { id: 123 }
        ] }), { status: 200 })));
        expect(await 获取OpenAI兼容模型元数据({ baseUrl: 'https://test/v1', apiKey: 'test-key' })).toEqual([
            { id: 'gemini-3-flash', label: '[按次] Gemini Flash', contextWindowTokens: 200000 }, { id: 'gpt', label: 'GPT显示名' }, { id: 'claude', label: 'Claude显示名' }, { id: 'custom', label: 'custom' }
        ]);
    });
    beforeEach(() => {
        mockIsNative.mockReturnValue(false);
        mockHttpRequest.mockReset();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('Web 环境使用 fetch 获取模型列表', async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }] })
        });

        const models = await 获取OpenAI兼容模型列表({
            baseUrl: 'https://opencode.ai/zen/go/v1',
            apiKey: 'sk-test'
        });

        expect(models).toEqual(['gpt-4', 'gpt-3.5']);
        expect(fetch).toHaveBeenCalledWith(
            'https://opencode.ai/zen/go/v1/models',
            { headers: { Authorization: 'Bearer sk-test' } }
        );
        expect(mockHttpRequest).not.toHaveBeenCalled();
    });

    it('原生环境使用 CapacitorHttp 绕过 CORS', async () => {
        mockIsNative.mockReturnValue(true);
        mockHttpRequest.mockResolvedValueOnce({
            status: 200,
            data: { data: [{ id: 'opencode-model-a' }] }
        });

        const models = await 获取OpenAI兼容模型列表({
            baseUrl: 'https://opencode.ai/zen/go/v1',
            apiKey: 'sk-test'
        });

        expect(models).toEqual(['opencode-model-a']);
        expect(mockHttpRequest).toHaveBeenCalledWith({
            url: 'https://opencode.ai/zen/go/v1/models',
            method: 'GET',
            headers: { Authorization: 'Bearer sk-test' },
            responseType: 'json'
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('小米 MiMo 使用 api-key header', async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ id: 'mimo-model' }] })
        });

        const models = await 获取OpenAI兼容模型列表({
            baseUrl: 'https://api.xiaomimimo.com/v1',
            apiKey: 'mimo-key',
            供应商: 'mimo_api'
        });

        expect(models).toEqual(['mimo-model']);
        expect(fetch).toHaveBeenCalledWith(
            'https://api.xiaomimimo.com/v1/models',
            { headers: { 'api-key': 'mimo-key' } }
        );
    });

    it('所有候选 URL 都失败时抛出格式错误', async () => {
        (fetch as any).mockResolvedValue({ ok: false, status: 403 });

        await expect(
            获取OpenAI兼容模型列表({ baseUrl: 'https://opencode.ai/zen/go/v1', apiKey: 'sk-test' })
        ).rejects.toThrow('获取失败：返回格式错误');
    });
});
