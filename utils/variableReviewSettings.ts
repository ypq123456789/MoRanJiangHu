import type { 接口设置结构, 接口供应商类型 } from '../types';
import { 供应商标签, VariableReviewApiConfigurationError, type 当前可用接口结构 } from './apiConfig';
import { DEFAULT_VARIABLE_REVIEW_PROMPT } from '../prompts/runtime/variableReview';
import { supportsVariableReviewTopP, variableReviewSamplingLimits } from './variableReviewSampling';
import { validReviewContextTokens, readReviewModelCapacity, type ReviewModelCapacity } from './variableReviewBudget';

export const VARIABLE_REVIEW_SETTINGS_KEY = 'variable_review_settings';
export interface VariableReviewSettings {
    apiMode: 'main-library' | 'independent';
    mainConfigId: string;
    mainConfigName: string;
    provider: 接口供应商类型;
    baseUrl: string;
    apiKey: string;
    model: string;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    contextWindowMode?: 'auto' | 'manual' | 'custom';
    contextWindowTokens?: number;
    customPrompt: string;
}
export interface VariableReviewConfiguration {
    settings: VariableReviewSettings;
    library: Array<{ id: string; name: string; model: string; baseUrl?: string; provider?: 接口供应商类型 }>;
    modelMetadata?: VariableReviewModelOption[];
}
export interface VariableReviewModelOption extends ReviewModelCapacity { id: string; label: string }
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const number = (v: unknown, min: number, max: number) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
    ? Math.max(min, Math.min(max, Number(v))) : undefined;
export const normalizeVariableReviewSettings = (raw: any, api?: 接口设置结构): VariableReviewSettings => {
    // 仅首次创建默认值时迁移现有有效选择；已有设置的失效ID必须保留并报错。
    const configs = api?.configs || [];
    const legacy = configs.find(c => c.id === api?.功能模型占位?.变量计算渠道ID);
    const initial = legacy || configs.find(c => c.id === api?.activeConfigId);
    const defaults: VariableReviewSettings = { apiMode: 'main-library', mainConfigId: initial?.id || '', mainConfigName: initial?.名称 || '',
        provider: 'openai_compatible', baseUrl: '', apiKey: '', model: (legacy ? text(api?.功能模型占位?.变量计算使用模型) : '') || text(initial?.model), contextWindowMode: 'auto', customPrompt: DEFAULT_VARIABLE_REVIEW_PROMPT };
    if (!raw || typeof raw !== 'object') return defaults;
    const tokens = number(raw.maxOutputTokens, 1024, 262144);
    return { apiMode: raw.apiMode === 'independent' ? 'independent' : 'main-library', mainConfigId: text(raw.mainConfigId), mainConfigName: text(raw.mainConfigName),
        provider: Object.hasOwn(供应商标签, raw.provider) ? raw.provider : defaults.provider,
        baseUrl: text(raw.baseUrl), apiKey: text(raw.apiKey), model: text(raw.model), maxOutputTokens: tokens === undefined ? undefined : Math.floor(tokens),
        temperature: number(raw.temperature, 0, 2), topP: number(raw.topP, 0, 1),
        contextWindowMode: raw.contextWindowMode === 'manual' || raw.contextWindowMode === 'custom' ? raw.contextWindowMode : 'auto', contextWindowTokens: validReviewContextTokens(raw.contextWindowTokens),
        customPrompt: typeof raw.customPrompt === 'string' ? raw.customPrompt : DEFAULT_VARIABLE_REVIEW_PROMPT };
};
// 保留 API 时仅保留连接、模型与采样参数；Prompt 在清理后使用当前代码默认值。
export const extractVariableReviewApiSettings = (raw: unknown): Omit<VariableReviewSettings, 'customPrompt'> | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const { customPrompt, ...connection } = normalizeVariableReviewSettings(raw);
    return connection;
};
export const resolveVariableReviewApi = (settings: VariableReviewSettings, api: 接口设置结构, forModelList = false): 当前可用接口结构 => {
    const fail = (message: string): never => { throw new VariableReviewApiConfigurationError(message); };
    const selected = api?.configs?.find(c => c.id === settings.mainConfigId);
    if (settings.apiMode === 'main-library' && !selected) {
        if (!settings.mainConfigId) fail('请先选择变量审查的接口配置。');
        fail(`变量审查使用的接口配置“${settings.mainConfigName || settings.mainConfigId}”已不存在，请重新选择。`);
    }
    const config: 当前可用接口结构 = settings.apiMode === 'main-library' ? { ...selected! } : {
        id: 'variable-review-independent', 名称: '变量审查独立 API', 供应商: settings.provider, 协议覆盖: 'auto', baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: ''
    };
    config.model = text(settings.model); // 绝不继承主剧情模型或把展示label当model ID。
    config.maxTokens = settings.maxOutputTokens ?? 32768;
    config.temperature = settings.temperature ?? 0.2;
    config.topP = settings.topP;
    if (!text(config.baseUrl)) fail('变量审查 API 配置不完整：缺少 Base URL。');
    if (!text(config.apiKey)) fail('变量审查 API 配置不完整：缺少 API Key。');
    if (!forModelList && !config.model) fail('变量审查 API 配置不完整：请填写审查 Model ID。');
    if (!forModelList) {
        const limits = variableReviewSamplingLimits(config);
        if (config.temperature > limits.temperatureMax) fail(`当前审查接口的 Temperature 最大值为 ${limits.temperatureMax}，请调整设置。`);
        if (supportsVariableReviewTopP(config) && config.topP !== undefined && config.topP < limits.topPMin) fail(`当前审查接口的 Top P 最小值为 ${limits.topPMin}，请调整设置。`);
    }
    return config;
};
export const normalizeVariableReviewModelOptions = (values: unknown[]): VariableReviewModelOption[] => {
    const seen = new Set<string>();
    return values.flatMap((v: any) => {
        const id = text(typeof v === 'string' ? v : v?.id);
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [{ id, label: text(typeof v === 'object' ? v.label || v.name : '') || id, ...readReviewModelCapacity(v) }];
    });
};
