import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateMemoryRecall = vi.fn(async (..._args: unknown[]) => '强回忆:无\n弱回忆:无');
vi.mock('../services/ai/text', () => ({
    generateMemoryRecall: (..._args: unknown[]) => generateMemoryRecall(..._args)
}));

import { 执行剧情回忆检索 } from '../hooks/useGame/recallWorkflow';
import { 规范化接口设置 } from '../utils/apiConfig';

const 构造接口设置 = (extra: Record<string, unknown> = {}) => 规范化接口设置({
    activeConfigId: 'c1',
    configs: [{
        id: 'c1',
        名称: '测试渠道',
        供应商: 'openai_compatible',
        baseUrl: 'https://example.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o',
        maxTokens: 8192,
        temperature: 0.7,
        topP: 1,
        自定义请求头: ''
    }],
    功能模型占位: {
        剧情回忆独立模型开关: true,
        剧情回忆使用模型: 'gpt-4o',
        ...extra
    }
} as any);

describe('省次数模式：剧情回忆', () => {
    beforeEach(() => {
        generateMemoryRecall.mockClear();
    });

    it('省次数开启时跳过检索模型，直接用本地预筛结果', async () => {
        const settings = 构造接口设置({ 省次数模式启用: true });

        const result = await 执行剧情回忆检索('去藏经阁查旧籍', {} as any, settings);

        expect(generateMemoryRecall).not.toHaveBeenCalled();
        expect(result?.previewText).toContain('省次数模式');
    });

    it('显式关闭「包含剧情回忆」后仍调用检索模型', async () => {
        const settings = 构造接口设置({
            省次数模式启用: true,
            省次数模式包含剧情回忆: false
        });

        const result = await 执行剧情回忆检索('去藏经阁查旧籍', {} as any, settings);

        expect(generateMemoryRecall).toHaveBeenCalledTimes(1);
        expect(result?.previewText).not.toContain('省次数模式');
    });

    it('省次数未开启时仍调用检索模型', async () => {
        const settings = 构造接口设置({ 省次数模式启用: false });

        await 执行剧情回忆检索('去藏经阁查旧籍', {} as any, settings);

        expect(generateMemoryRecall).toHaveBeenCalledTimes(1);
    });
});

describe('省次数模式：新增范围的默认值', () => {
    it('未显式设置时开局与剧情回忆默认纳入', () => {
        const settings = 构造接口设置({ 省次数模式启用: true });

        expect(settings.功能模型占位.省次数模式包含开局).toBe(true);
        expect(settings.功能模型占位.省次数模式包含剧情回忆).toBe(true);
    });

    it('显式关闭后保持关闭', () => {
        const settings = 构造接口设置({
            省次数模式启用: true,
            省次数模式包含开局: false,
            省次数模式包含剧情回忆: false
        });

        expect(settings.功能模型占位.省次数模式包含开局).toBe(false);
        expect(settings.功能模型占位.省次数模式包含剧情回忆).toBe(false);
    });
});
