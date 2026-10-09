import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeVariableReviewSettings, resolveVariableReviewApi, normalizeVariableReviewModelOptions, VARIABLE_REVIEW_SETTINGS_KEY } from '../utils/variableReviewSettings';
import { DEFAULT_VARIABLE_REVIEW_PROMPT } from '../prompts/runtime/variableReview';
import { createVariableReviewConfigurationActions } from '../services/variableReviewSettingsService';
import * as models from '../utils/openAIModelListFetcher';
import { reviewApi } from './helpers/variableReviewFixture';
vi.mock('../utils/openAIModelListFetcher', () => ({ 获取OpenAI兼容模型元数据: vi.fn() }));
const api = { ...reviewApi, configs: [{ ...reviewApi.configs[0], id: 'A', 名称: '肘子福利', 供应商: 'claude', baseUrl: 'https://a.test/v1', apiKey: 'key-A', model: 'story-A' }, { ...reviewApi.configs[0], id: 'B', 名称: '修女', baseUrl: 'https://b.test/v1', apiKey: 'key-B', model: 'story-B' }], activeConfigId: 'B' } as any;
const settings = () => ({ ...normalizeVariableReviewSettings(undefined, api), mainConfigId: 'A', mainConfigName: '肘子福利', model: 'review-GPT' });
beforeEach(() => vi.mocked(models.获取OpenAI兼容模型元数据).mockReset());
describe('变量审查独立应用设置与严格API解析', () => {
    it('默认迁移使用有效主库配置和默认Prompt，不绑定失效旧渠道', () => {
        const initial = normalizeVariableReviewSettings(undefined, { ...api, 功能模型占位: { 变量计算渠道ID: 'deleted' } } as any);
        expect(initial.mainConfigId).toBe('B'); expect(initial.customPrompt).toBe(DEFAULT_VARIABLE_REVIEW_PROMPT);
    });
    it('选中A使用A的连接，但审查模型与正文模型独立', () => {
        const before = structuredClone(api);
        expect(resolveVariableReviewApi(settings(), api)).toMatchObject({ baseUrl: 'https://a.test/v1', apiKey: 'key-A', 供应商: 'claude', model: 'review-GPT', maxTokens: 32768, temperature: 0.2 });
        expect(api).toEqual(before);
    });
    it('已保存的渠道ID被删除时带原显示名报错，不重新绑定B', () => {
        const saved = normalizeVariableReviewSettings(settings(), { ...api, configs: api.configs.slice(1) });
        expect(saved.mainConfigId).toBe('A');
        expect(() => resolveVariableReviewApi(saved, { ...api, configs: api.configs.slice(1) })).toThrow('变量审查使用的接口配置“肘子福利”已不存在，请重新选择。');
    });
    it('Model不可继承正文；空model仅允许刷新列表', () => {
        const value = { ...settings(), model: '' };
        expect(() => resolveVariableReviewApi(value, api)).toThrow('Model ID');
        expect(resolveVariableReviewApi(value, api, true).model).toBe('');
    });
    it('独立供应商、URL、key、参数不借用主库连接', () => {
        const independent = { ...settings(), apiMode: 'independent' as const, provider: 'deepseek' as const, baseUrl: 'https://independent.test/v1', apiKey: 'own-key', maxOutputTokens: 8192, temperature: 0, topP: 0.8 };
        expect(resolveVariableReviewApi(independent, api)).toMatchObject({ 供应商: 'deepseek', baseUrl: independent.baseUrl, apiKey: 'own-key', model: 'review-GPT', temperature: 0, topP: 0.8, maxTokens: 8192 });
    });
    it.each(['baseUrl', 'apiKey', 'model'])('独立配置缺%s时严格报错', key => {
        expect(() => resolveVariableReviewApi({ ...settings(), apiMode: 'independent', baseUrl: 'https://own.test', apiKey: 'own', [key]: '' }, api)).toThrow('配置不完整');
    });
    it('展示名称与实际ID分离，重复无效列表项排除', () => {
        expect(normalizeVariableReviewModelOptions([{ id: 'gemini-3-flash', name: '[0.01/次][备用] Gemini Flash' }, { id: 'gemini-3-flash' }, '', 3, 'gpt'])).toEqual([{ id: 'gemini-3-flash', label: '[0.01/次][备用] Gemini Flash' }, { id: 'gpt', label: 'gpt' }]);
    });
    it('独立设置保存、重载，过滤备注和非设置字段；快速写入按顺序落盘', async () => {
        const map = new Map<string, any>();
        const storage = { read: vi.fn(async (key: string) => map.get(key)), write: vi.fn(async (key: string, value: any) => { map.set(key, structuredClone(value)); }) };
        const service = createVariableReviewConfigurationActions(() => api, storage);
        const loaded = await service.getVariableReviewConfiguration(); expect(loaded.settings.customPrompt).toBe(DEFAULT_VARIABLE_REVIEW_PROMPT);
        const first = service.saveVariableReviewSettings({ ...settings(), customPrompt: '检查装备', reviewNotes: '不持久化' } as any);
        const last = service.saveVariableReviewSettings({ ...settings(), customPrompt: '检查服装' }); await Promise.all([first, last]);
        expect(map.get(VARIABLE_REVIEW_SETTINGS_KEY).customPrompt).toBe('检查服装'); expect(map.get(VARIABLE_REVIEW_SETTINGS_KEY).reviewNotes).toBeUndefined();
        expect((await createVariableReviewConfigurationActions(() => api, storage).getVariableReviewConfiguration()).settings.customPrompt).toBe('检查服装');
        expect(storage.write.mock.calls.every(call => call[0] === VARIABLE_REVIEW_SETTINGS_KEY)).toBe(true);
    });
    it.each(['main-library', 'independent'] as const)('刷新%s模型使用审查连接，不请求当前正文B', async mode => {
        vi.mocked(models.获取OpenAI兼容模型元数据).mockResolvedValue([{ id: 'review-GPT', label: 'review-GPT' }]);
        const service = createVariableReviewConfigurationActions(() => api);
        const value = { ...settings(), apiMode: mode, baseUrl: 'https://own.test/v1', apiKey: 'own-key', provider: 'deepseek' as const };
        const result = await service.refreshVariableReviewModels(value);
        expect(result).toEqual([{ id: 'review-GPT', label: 'review-GPT' }]);
        expect(models.获取OpenAI兼容模型元数据).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: mode === 'independent' ? 'https://own.test/v1' : 'https://a.test/v1', apiKey: mode === 'independent' ? 'own-key' : 'key-A' }));
    });
    it('删除选中渠道后刷新也必须先报错，无模型列表请求', async () => {
        const service = createVariableReviewConfigurationActions(() => ({ ...api, configs: api.configs.slice(1) }));
        await expect(service.refreshVariableReviewModels(settings())).rejects.toThrow('已不存在');
        expect(models.获取OpenAI兼容模型元数据).not.toHaveBeenCalled();
    });
    it('容量metadata按实际连接和模型隔离，刷新不修改手动窗口设置', async () => {
        const root = structuredClone(api);
        const storage = { read: vi.fn(async () => undefined), write: vi.fn(async () => undefined) };
        const service = createVariableReviewConfigurationActions(() => root, storage);
        const selected = { ...settings(), contextWindowMode: 'custom' as const, contextWindowTokens: 400000 };
        await service.saveVariableReviewSettings(selected);
        vi.mocked(models.获取OpenAI兼容模型元数据).mockResolvedValue([{ id: 'review-GPT', label: 'Review', contextWindowTokens: 200000 }]);
        await service.refreshVariableReviewModels(selected);
        expect(service.getVariableReviewModelMetadata(selected)).toMatchObject({ contextWindowTokens: 200000 });
        expect(service.peekSettings()).toMatchObject({ contextWindowMode: 'custom', contextWindowTokens: 400000 });
        expect(service.getVariableReviewModelMetadata({ ...selected, model: 'other' })).toBeUndefined();
        expect(service.getVariableReviewModelMetadata({ ...selected, mainConfigId: 'B' })).toBeUndefined();
        root.configs[0].apiKey = 'different-account';
        expect(service.getVariableReviewModelMetadata(selected)).toBeUndefined();
        expect(storage.write).toHaveBeenCalledTimes(1);
    });
});
