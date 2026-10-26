import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    接口设置结构,
    接口供应商类型,
    单接口配置结构
} from '../../../types';
import GameButton from '../../ui/GameButton';
import InlineSelect from '../../ui/InlineSelect';
import * as textAIService from '../../../services/ai/text';
import {
    创建接口配置模板,
    供应商标签,
    规范化接口设置
} from '../../../utils/apiConfig';
import { 获取OpenAI兼容模型列表 } from '../../../utils/openAIModelListFetcher';
import { 读取跨域中转模式, 写入跨域中转模式 } from '../../../services/ai/corsRelay';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

type 最大输出档位 = '8k' | '32k' | '64k' | 'custom';

type 模型输出推荐项 = {
    key: string;
    providerLabel: string;
    modelLabel: string;
    matchers: RegExp[];
    officialMaxOutput: number;
    suggestedSelection: number;
    note: string;
    source: string;
    sourceLabel: string;
    updatedAt: string;
};

const providerOptions: 接口供应商类型[] = ['openai_compatible', 'openai', 'gemini', 'claude', 'deepseek', 'zhipu', 'mimo_api', 'mimo_token_plan'];

const 最大输出档位预设: Array<{ id: 最大输出档位; label: string; value?: number }> = [
    { id: '8k', label: '8K', value: 8_192 },
    { id: '32k', label: '32K', value: 32_768 },
    { id: '64k', label: '64K', value: 65_536 },
    { id: 'custom', label: '自定义' }
];

const 模型输出推荐数据: 模型输出推荐项[] = [
    {
        key: 'openai-gpt-5x',
        providerLabel: 'OpenAI',
        modelLabel: 'GPT-5 / GPT-5.1 / GPT-5.2',
        matchers: [/^gpt-5(\.|-|$)/i],
        officialMaxOutput: 128_000,
        suggestedSelection: 65_536,
        note: '复杂长文建议 64K 档位，超长任务可用自定义（<=128000）。',
        source: 'https://platform.openai.com/docs/models/gpt-5.2/',
        sourceLabel: 'OpenAI GPT-5.2',
        updatedAt: '2026-02'
    },
    {
        key: 'openai-gpt-4-1',
        providerLabel: 'OpenAI',
        modelLabel: 'GPT-4.1 系列',
        matchers: [/^gpt-4\.1/i],
        officialMaxOutput: 32_768,
        suggestedSelection: 32_768,
        note: '推荐 32K 档位。',
        source: 'https://platform.openai.com/docs/models/gpt-4.1',
        sourceLabel: 'OpenAI GPT-4.1',
        updatedAt: '2026-02'
    },
    {
        key: 'openai-gpt-4o',
        providerLabel: 'OpenAI',
        modelLabel: 'GPT-4o / GPT-4o-mini',
        matchers: [/^gpt-4o(-|$)/i, /^gpt-4o-mini(-|$)/i, /^chatgpt-4o/i],
        officialMaxOutput: 16_384,
        suggestedSelection: 8_192,
        note: '常规剧情建议 8K 档位，若需更长输出可自定义至 16384。',
        source: 'https://platform.openai.com/docs/models/gpt-4o',
        sourceLabel: 'OpenAI GPT-4o',
        updatedAt: '2026-02'
    },
    {
        key: 'anthropic-claude-4-5',
        providerLabel: 'Anthropic',
        modelLabel: 'Claude Sonnet/Haiku/Opus 4.5',
        matchers: [/^claude-(sonnet|haiku|opus)-4-5/i, /^claude-(sonnet|haiku|opus)-4\.5/i],
        officialMaxOutput: 65_536,
        suggestedSelection: 65_536,
        note: '默认可用 64K 档位；长上下文 1M 需额外 beta header（与输出上限无关）。',
        source: 'https://docs.anthropic.com/en/docs/models-overview',
        sourceLabel: 'Claude Models Overview',
        updatedAt: '2026-02'
    },
    {
        key: 'gemini-2-5',
        providerLabel: 'Google Gemini',
        modelLabel: 'Gemini 2.5 Pro / Flash / Flash-Lite',
        matchers: [/^gemini-2\.5-(pro|flash|flash-lite)/i],
        officialMaxOutput: 65_536,
        suggestedSelection: 65_536,
        note: '推荐 64K 档位。',
        source: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro',
        sourceLabel: 'Gemini 2.5 Pro',
        updatedAt: '2026-02'
    },
    {
        key: 'deepseek-chat',
        providerLabel: 'DeepSeek',
        modelLabel: 'deepseek-chat (V3.2)',
        matchers: [/^deepseek-chat$/i],
        officialMaxOutput: 8_192,
        suggestedSelection: 8_192,
        note: '默认 4K，最大 8K。建议 8K 档位。',
        source: 'https://api-docs.deepseek.com/quick_start/pricing',
        sourceLabel: 'DeepSeek Models & Pricing',
        updatedAt: '2026-02'
    },
    {
        key: 'deepseek-reasoner',
        providerLabel: 'DeepSeek',
        modelLabel: 'deepseek-reasoner (V3.2)',
        matchers: [/^deepseek-reasoner$/i],
        officialMaxOutput: 65_536,
        suggestedSelection: 32_768,
        note: '默认 32K，最大 64K；优先 32K，必要时上调到 64K。',
        source: 'https://api-docs.deepseek.com/quick_start/pricing',
        sourceLabel: 'DeepSeek Models & Pricing',
        updatedAt: '2026-02'
    }
];

const 推断最大输出档位 = (maxTokens?: number): 最大输出档位 | null => {
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens <= 0) return null;
    if (maxTokens === 8_192) return '8k';
    if (maxTokens === 32_768) return '32k';
    if (maxTokens === 65_536) return '64k';
    return 'custom';
};

const 匹配模型输出推荐 = (modelRaw: string): 模型输出推荐项 | null => {
    const model = (modelRaw || '').trim().toLowerCase();
    if (!model) return null;
    return 模型输出推荐数据.find((item) => item.matchers.some((matcher) => matcher.test(model))) || null;
};

export const 是否GeminiDeepResearch配置 = (modelRaw: string, baseUrlRaw: string): boolean => (
    /deep-research/i.test(modelRaw || '')
    && /gemini|generativelanguage|googleapis/i.test(baseUrlRaw || '')
);

const 提取模型版本数字 = (model: string): number[] => (
    (model || '')
        .match(/\d+(?:\.\d+)?/g)
        ?.map((item) => Number(item))
        .filter(Number.isFinite)
        || []
);

export const 选择最佳可用模型 = (models: string[]): string => {
    const candidates = Array.from(new Set((Array.isArray(models) ? models : [])
        .map((item) => (item || '').trim())
        .filter(Boolean)));
    if (candidates.length === 0) return '';

    const scoreModel = (model: string): number => {
        const lower = model.toLowerCase();
        let score = 0;
        if (/(embedding|moderation|rerank|tts|audio|image|vision|whisper|speech)/i.test(lower)) score -= 10000;
        if (/(gpt-5|claude|gemini|deepseek|qwen|glm|kimi)/i.test(lower)) score += 4000;
        if (/(pro|max|ultra|opus|sonnet|reasoner|thinking)/i.test(lower)) score += 900;
        if (/(chat|instruct|turbo)/i.test(lower)) score += 150;
        if (/(mini|lite|flash|haiku|nano|small|embedding|moderation|rerank|tts|audio|image|vision)/i.test(lower)) score -= 500;
        if (/(preview|beta|experimental|exp)/i.test(lower)) score -= 120;
        const versionScore = 提取模型版本数字(lower).reduce((acc, value, index) => acc + value / Math.pow(10, index), 0) * 100;
        return score + versionScore;
    };

    return candidates.sort((a, b) => scoreModel(b) - scoreModel(a) || b.localeCompare(a))[0] || '';
};

export const 解析模型列表后的选择 = (currentModelRaw: string, models: string[]): string => {
    const currentModel = (currentModelRaw || '').trim();
    return currentModel || 选择最佳可用模型(models);
};

const ApiSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [跨域中转启用, set跨域中转启用] = useState<boolean>(() => 读取跨域中转模式() !== 'off');
    // 同步追踪最新 form，避免异步请求返回后用旧闭包覆盖用户在等待期间手动填写的模型。
    const formRef = useRef(form);
    formRef.current = form;
    const asyncOperationIdRef = useRef(0);
    const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
    const [mainModelOptions, setMainModelOptions] = useState<string[]>([]);
    const [loadingMainModels, setLoadingMainModels] = useState(false);
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [newProvider, setNewProvider] = useState<接口供应商类型>('openai_compatible');
    const [testingConnection, setTestingConnection] = useState(false);
    const [testResultModal, setTestResultModal] = useState<{
        open: boolean;
        title: string;
        content: string;
        ok: boolean;
    }>({ open: false, title: '', content: '', ok: false });

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
        setSelectedConfigId(normalized.activeConfigId || normalized.configs[0]?.id || null);
        setMainModelOptions([]);
    }, [settings]);

    const activeConfig = useMemo<单接口配置结构 | null>(() => {
        if (!form.configs.length) return null;
        const selected = form.configs.find((cfg) => cfg.id === selectedConfigId);
        return selected || form.configs[0] || null;
    }, [form.configs, selectedConfigId]);

    const 主剧情解析模型 = useMemo(() => {
        return (activeConfig?.model || '').trim() || (form.功能模型占位.主剧情使用模型 || '').trim();
    }, [activeConfig?.model, form.功能模型占位.主剧情使用模型]);

    const 主剧情BaseUrl = useMemo(() => {
        return (activeConfig?.baseUrl || '').trim();
    }, [activeConfig?.baseUrl]);

    const 当前最大输出档位 = useMemo<最大输出档位 | null>(() => {
        return 推断最大输出档位(activeConfig?.maxTokens);
    }, [activeConfig?.maxTokens]);

    const 当前模型推荐 = useMemo(() => {
        return 匹配模型输出推荐(主剧情解析模型);
    }, [主剧情解析模型]);
    const 是否DeepSeek模式 = /deepseek/i.test(主剧情解析模型);
    const 是否GLM模式 = /glm/i.test(主剧情解析模型);
    const 是否MiMo模式 = activeConfig?.供应商 === 'mimo_api'
        || activeConfig?.供应商 === 'mimo_token_plan'
        || 主剧情BaseUrl.toLowerCase().includes('xiaomimimo.com');
    const 温度上限 = 是否MiMo模式 ? 1.5 : 2;
    const 温度提示 = 是否MiMo模式
        ? '留空按小米官方默认（剧情模型1.0/Flash 0.3/TTS 0.6）'
        : '留空按场景默认（主剧情0.7/世界0.8/回忆0.2）';
    const 温度说明 = 是否MiMo模式
        ? '小米 MiMo 官方温度范围 0-1.5；剧情模型推荐 1.0。'
        : 'OpenAI/Gemini/DeepSeek 范围 0-2；Claude 范围 0-1（超过 1 会自动按 1 发送）。';

    const updateActiveConfig = (patch: Partial<单接口配置结构>) => {
        if (!activeConfig) return;
        setForm((prev) => ({
            ...prev,
            activeConfigId: activeConfig.id,
            configs: prev.configs.map((cfg) => cfg.id === activeConfig.id ? { ...cfg, ...patch, updatedAt: Date.now() } : cfg)
        }));
    };

    const updateMainModel = (model: string) => {
        const normalizedModel = model.trim();
        setForm((prev) => ({
            ...prev,
            activeConfigId: activeConfig?.id || prev.activeConfigId,
            configs: prev.configs.map((cfg) => cfg.id === activeConfig?.id ? { ...cfg, model: normalizedModel, updatedAt: Date.now() } : cfg),
            功能模型占位: {
                ...prev.功能模型占位,
                主剧情使用模型: normalizedModel
            }
        }));
    };

    const 校验主剧情最大输出配置 = (): string | null => {
        if (!activeConfig) return '请先创建并选择一个接口配置。';
        const mainModel = 主剧情解析模型.trim();
        if (!mainModel) return '主剧情使用模型为必选项，请先获取列表并选择。';
        const maxTokens = activeConfig.maxTokens;
        const matched = 匹配模型输出推荐(mainModel);
        if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && matched && maxTokens > matched.officialMaxOutput) {
            return `${mainModel} 官方最大输出约为 ${matched.officialMaxOutput}，当前设置 ${maxTokens} 过高，请调整。`;
        }
        return null;
    };

    const fetchModelsFromConfig = async (config: 单接口配置结构): Promise<string[]> => (
        获取OpenAI兼容模型列表({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            供应商: config.供应商,
            自定义请求头: config.自定义请求头
        })
    );

    const 读取最新活动配置 = (): 单接口配置结构 | null => {
        const latestForm = formRef.current;
        return latestForm.configs.find((cfg) => cfg.id === latestForm.activeConfigId) || null;
    };

    const 请求来源一致 = (request: 单接口配置结构, current: 单接口配置结构 | null): boolean => (
        Boolean(current)
        && request.id === current?.id
        && request.baseUrl === current?.baseUrl
        && request.apiKey === current?.apiKey
        && request.供应商 === current?.供应商
        && (request.自定义请求头 || '') === (current?.自定义请求头 || '')
    );

    const handleFetchMainModels = async () => {
        const requestConfig = activeConfig;
        if (!requestConfig) {
            setMessage('请先创建并选择一个接口配置。');
            return;
        }
        const operationId = ++asyncOperationIdRef.current;
        setTestingConnection(false);
        setLoadingMainModels(true);
        setMessage('');
        try {
            const result = await fetchModelsFromConfig(requestConfig);
            if (operationId !== asyncOperationIdRef.current) return;

            const latestForm = formRef.current;
            const latestActiveConfig = 读取最新活动配置();
            if (!请求来源一致(requestConfig, latestActiveConfig)) {
                setMessage('接口配置已切换或发生变化，已丢弃旧模型列表。');
                return;
            }

            setMainModelOptions(result);
            const currentModel = ((latestActiveConfig?.model || '').trim() || (latestForm.功能模型占位.主剧情使用模型 || '').trim());
            if (!currentModel) {
                const selectedModel = 解析模型列表后的选择(currentModel, result);
                if (selectedModel) {
                    updateMainModel(selectedModel);
                    setMessage(`主剧情模型列表获取成功，已自动选择 ${selectedModel}。`);
                } else {
                    setMessage('主剧情模型列表获取成功。');
                }
            } else {
                setMessage(`主剧情模型列表获取成功，已保留当前选择 ${currentModel}。`);
            }
        } catch (e: any) {
            if (operationId === asyncOperationIdRef.current) {
                setMessage(`获取失败：${e.message}`);
            }
        } finally {
            if (operationId === asyncOperationIdRef.current) {
                setLoadingMainModels(false);
            }
        }
    };

    const handleCreateConfig = () => {
        const created = 创建接口配置模板(newProvider);
        setForm((prev) => {
            const nextConfigs = [...prev.configs, created];
            return {
                ...prev,
                activeConfigId: created.id,
                configs: nextConfigs
            };
        });
        setSelectedConfigId(created.id);
        setMainModelOptions([]);
        setMessage(`已新增 ${供应商标签[newProvider]} 配置，请填写后保存。`);
    };

    const handleDeleteActive = () => {
        if (!activeConfig) return;
        setForm((prev) => {
            const nextConfigs = prev.configs.filter((cfg) => cfg.id !== activeConfig.id);
            const fallbackId = nextConfigs[0]?.id || null;
            setSelectedConfigId(fallbackId);
            return {
                ...prev,
                activeConfigId: fallbackId,
                configs: nextConfigs
            };
        });
        setMainModelOptions([]);
        setMessage('配置已删除。');
    };

    const handleSave = () => {
        const tokenValidationError = 校验主剧情最大输出配置();
        if (tokenValidationError) {
            setMessage(tokenValidationError);
            return;
        }
        const normalized = 规范化接口设置({
            ...form,
            activeConfigId: selectedConfigId || form.activeConfigId,
            功能模型占位: {
                ...form.功能模型占位,
                主剧情使用模型: (activeConfig?.model || '').trim()
            }
        });
        onSave(normalized);
        setForm(normalized);
        setSelectedConfigId(normalized.activeConfigId || normalized.configs[0]?.id || null);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const handleTestConnection = async () => {
        const requestConfig = activeConfig;
        if (!requestConfig) return;
        if (!requestConfig.apiKey || !requestConfig.baseUrl) {
            setMessage('请先填写当前配置的 API Key 和 Base URL');
            return;
        }
        const operationId = ++asyncOperationIdRef.current;
        setLoadingMainModels(false);
        setMessage('');
        setTestingConnection(true);
        let cancelled = false;
        let keepMessage = false;
        let modelForTest = (requestConfig.model || '').trim() || (formRef.current.功能模型占位.主剧情使用模型 || '').trim();
        let configForTest = requestConfig;
        const 当前请求仍有效 = (expectedModel?: string): boolean => {
            if (operationId !== asyncOperationIdRef.current) return false;
            const latestForm = formRef.current;
            const latestConfig = 读取最新活动配置();
            if (!请求来源一致(requestConfig, latestConfig)) return false;
            if (expectedModel === undefined) return true;
            const latestModel = (latestConfig?.model || '').trim() || (latestForm.功能模型占位.主剧情使用模型 || '').trim();
            return latestModel === expectedModel;
        };
        try {
            setMessage('正在获取模型列表并验证当前模型...');
            const models = await fetchModelsFromConfig(requestConfig).catch(() => null);
            if (operationId !== asyncOperationIdRef.current) return;

            const latestForm = formRef.current;
            const latestActiveConfig = 读取最新活动配置();
            if (!请求来源一致(requestConfig, latestActiveConfig)) {
                cancelled = true;
                setMessage('接口配置已切换或发生变化，已取消旧配置的连接测试，请重新测试当前配置。');
                return;
            }
            if (models && models.length > 0) {
                setMainModelOptions(models);
                const latestModel = (latestActiveConfig?.model || '').trim() || (latestForm.功能模型占位.主剧情使用模型 || '').trim();
                configForTest = latestActiveConfig || requestConfig;
                modelForTest = latestModel;
                if (!latestModel) {
                    const selectedModel = 解析模型列表后的选择(latestModel, models);
                    if (selectedModel) {
                        modelForTest = selectedModel;
                        const nextConfig = { ...(latestActiveConfig || requestConfig), model: selectedModel, updatedAt: Date.now() };
                        configForTest = nextConfig;
                        setForm((prev) => ({
                            ...prev,
                            activeConfigId: requestConfig.id,
                            configs: prev.configs.map((cfg) => cfg.id === requestConfig.id ? nextConfig : cfg),
                            功能模型占位: {
                                ...prev.功能模型占位,
                                主剧情使用模型: selectedModel
                            }
                        }));
                        formRef.current = {
                            ...latestForm,
                            activeConfigId: requestConfig.id,
                            configs: latestForm.configs.map((cfg) => cfg.id === requestConfig.id ? nextConfig : cfg),
                            功能模型占位: {
                                ...latestForm.功能模型占位,
                                主剧情使用模型: selectedModel
                            }
                        };
                    }
                }
            } else {
                configForTest = latestActiveConfig || requestConfig;
                modelForTest = (configForTest.model || '').trim() || (latestForm.功能模型占位.主剧情使用模型 || '').trim();
            }
            const matched = 匹配模型输出推荐(modelForTest);
            if (
                matched
                && typeof configForTest.maxTokens === 'number'
                && configForTest.maxTokens > matched.officialMaxOutput
            ) {
                keepMessage = true;
                setMessage(`${modelForTest} 官方最大输出约为 ${matched.officialMaxOutput}，当前设置 ${configForTest.maxTokens} 过高，请调整。`);
                return;
            }
            if (!modelForTest) {
                keepMessage = true;
                setMessage('请先填写主剧情模型或配置默认模型');
                return;
            }
            const result = await textAIService.testConnection({
                ...configForTest,
                model: modelForTest
            });
            if (!当前请求仍有效(modelForTest)) {
                if (operationId !== asyncOperationIdRef.current) return;
                cancelled = true;
                const latestConfig = 读取最新活动配置();
                setMessage(请求来源一致(requestConfig, latestConfig)
                    ? '主剧情模型已发生变化，已丢弃旧模型的连接测试结果，请重新测试当前模型。'
                    : '接口配置已切换或发生变化，已丢弃旧配置的连接测试结果，请重新测试当前配置。');
                return;
            }
            const title = result.ok ? '连接测试成功' : '连接测试失败';
            const meta = [
                `配置: ${configForTest.名称 || configForTest.id}`,
                `供应商: ${供应商标签[configForTest.供应商]}`,
                `模型: ${modelForTest}`,
                `最大输出Token: ${typeof configForTest.maxTokens === 'number' ? configForTest.maxTokens : '未设置'}`,
                `温度: ${typeof configForTest.temperature === 'number' ? configForTest.temperature : '按场景默认'}`,
                `Top P: ${typeof configForTest.topP === 'number' ? configForTest.topP : '按模型默认'}`,
                `自定义请求头: ${(configForTest.自定义请求头 || '').trim() ? '已配置' : '未配置'}`,
                `Base URL: ${configForTest.baseUrl}`,
                '',
                '---',
                '',
                result.detail
            ].join('\n');
            setTestResultModal({
                open: true,
                title,
                content: meta,
                ok: result.ok
            });
        } catch (e: any) {
            if (operationId !== asyncOperationIdRef.current) return;
            if (!当前请求仍有效(modelForTest)) {
                cancelled = true;
                const latestConfig = 读取最新活动配置();
                setMessage(请求来源一致(requestConfig, latestConfig)
                    ? '主剧情模型已发生变化，已丢弃旧模型的连接测试结果，请重新测试当前模型。'
                    : '接口配置已切换或发生变化，已丢弃旧配置的连接测试结果，请重新测试当前配置。');
                return;
            }
            setTestResultModal({
                open: true,
                title: '连接测试失败',
                content: String(e?.message || '未知错误'),
                ok: false
            });
        } finally {
            if (operationId === asyncOperationIdRef.current) {
                if (!cancelled && !keepMessage) setMessage('');
                setTestingConnection(false);
            }
        }
    };

    const 主剧情模型选项 = Array.from(
        new Set(
            [
                ...mainModelOptions,
                主剧情解析模型
            ]
                .map((item) => (item || '').trim())
                .filter(Boolean)
        )
    );

    return (
        <div className="relative space-y-6 text-sm animate-fadeIn">
            <div className="sticky top-0 z-30 flex justify-end pointer-events-none">
                <div className="rounded-md border border-wuxia-gold/30 bg-[#0b0b0c]/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-[#0b0b0c]/80 pointer-events-auto day-mode-settings-savebar">
                    <GameButton onClick={handleSave} variant="primary" className="shrink-0 px-4 py-2 text-xs sm:px-6">
                        {showSuccess ? '✔ 配置已保存' : '保存配置'}
                    </GameButton>
                </div>
            </div>

            <div className="-mt-14 pr-32 sm:pr-44">
                <h3 className="text-xl font-bold font-serif text-wuxia-gold">接口配置中心</h3>
                <div className="mt-1 text-xs text-gray-400">这里只保留主接口连接与主剧情模型设置；功能模型请到对应独立页面管理。</div>
            </div>

            <div className="space-y-4 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="text-xs text-gray-400">当前支持：Gemini / Claude / OpenAI / DeepSeek / 智谱 / 小米 MiMo / OpenAI 兼容接口。文本请求统一按 Chat Completions 方式发起。</div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-wuxia-cyan">新建配置 - 供应商</label>
                        <InlineSelect
                            value={newProvider}
                            options={providerOptions.map((provider) => ({
                                value: provider,
                                label: 供应商标签[provider]
                            }))}
                            onChange={(provider) => setNewProvider(provider)}
                            buttonClassName="border-gray-700 bg-black/60 py-2.5"
                        />
                    </div>

                    <div className="md:self-end">
                        <GameButton onClick={handleCreateConfig} variant="secondary" className="w-full md:w-auto">新建配置</GameButton>
                    </div>
                </div>
            </div>

            {form.configs.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-700 bg-black/20 p-6 text-center text-gray-400">
                    还没有任何接口配置，请先点击上方“新建配置”。
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                        {form.configs.map((cfg) => (
                            <button
                                key={cfg.id}
                                onClick={() => {
                                    setSelectedConfigId(cfg.id);
                                    setForm((prev) => ({ ...prev, activeConfigId: cfg.id }));
                                    setMainModelOptions([]);
                                }}
                                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                                    activeConfig?.id === cfg.id
                                        ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold'
                                        : 'border-gray-700 bg-black/40 text-gray-300 hover:border-gray-500'
                                }`}
                            >
                                <div className="truncate font-bold">{cfg.名称 || '未命名配置'}</div>
                                <div className="truncate text-[11px] opacity-80">{供应商标签[cfg.供应商]}</div>
                            </button>
                        ))}
                    </div>

                    {activeConfig && (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-wuxia-cyan">配置名称</label>
                                    <input
                                        type="text"
                                        value={activeConfig.名称}
                                        onChange={(e) => updateActiveConfig({ 名称: e.target.value })}
                                        placeholder="例如：主线生成配置"
                                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-wuxia-cyan">供应商</label>
                                    <input
                                        type="text"
                                        value={供应商标签[activeConfig.供应商]}
                                        disabled
                                        className="w-full rounded-md border border-gray-700 bg-black/40 p-3 text-gray-400"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-wuxia-cyan">接口地址 (Base URL)</label>
                                <input
                                    type="text"
                                    aria-label="接口地址 (Base URL)"
                                    value={activeConfig.baseUrl}
                                    onChange={(e) => updateActiveConfig({ baseUrl: e.target.value })}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-wuxia-cyan">密钥 (API Key)</label>
                                <input
                                    type="password"
                                    aria-label="密钥 (API Key)"
                                    value={activeConfig.apiKey}
                                    onChange={(e) => updateActiveConfig({ apiKey: e.target.value })}
                                    placeholder={activeConfig.供应商 === 'mimo_token_plan' ? 'tp-...' : 'sk-...'}
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-wuxia-cyan">自定义请求头（可选）</label>
                                <textarea
                                    aria-label="自定义请求头"
                                    value={activeConfig.自定义请求头 || ''}
                                    onChange={(e) => updateActiveConfig({ 自定义请求头: e.target.value })}
                                    placeholder={'一行一个，例如：\nx-opencode-session: 你的会话ID\nHTTP-Referer: https://example.com'}
                                    rows={3}
                                    spellCheck={false}
                                    className="w-full resize-y rounded-md border-2 border-transparent bg-black/50 p-3 font-mono text-xs text-white outline-none transition-all focus:border-wuxia-gold"
                                />
                                <div className="text-[11px] text-gray-400">
                                    每行一条 <span className="text-gray-300">Key: Value</span>，会附加到该配置的所有请求（含模型列表）上。
                                </div>
                                <div className="text-[11px] text-gray-400">
                                    OpenCode（opencode.ai）的 x-opencode-session 已自动补齐，无需手填；其余网关的私有头在此追加即可。
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-wuxia-cyan">最大输出 Token（可选）</label>
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                    {最大输出档位预设.map((preset) => {
                                        const selected = 当前最大输出档位 === preset.id;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => {
                                                    if (preset.id === 'custom') {
                                                        if (当前最大输出档位 !== 'custom') {
                                                            updateActiveConfig({ maxTokens: undefined });
                                                        }
                                                        return;
                                                    }
                                                    updateActiveConfig({ maxTokens: preset.value });
                                                }}
                                                className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                                                    selected
                                                        ? 'border-wuxia-gold bg-wuxia-gold/15 text-wuxia-gold'
                                                        : 'border-gray-700 bg-black/40 text-gray-300 hover:border-gray-500'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {(当前最大输出档位 === 'custom' || 当前最大输出档位 === null) && (
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={typeof activeConfig.maxTokens === 'number' ? String(activeConfig.maxTokens) : ''}
                                        onChange={(e) => {
                                            const raw = e.target.value.trim();
                                            if (!raw) {
                                                updateActiveConfig({ maxTokens: undefined });
                                                return;
                                            }
                                            const parsed = Number(raw);
                                            updateActiveConfig({
                                                maxTokens: Number.isFinite(parsed) && parsed > 0
                                                    ? Math.floor(parsed)
                                                    : undefined
                                            });
                                        }}
                                        placeholder="输入自定义最大输出 Token"
                                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                    />
                                )}

                                <div className="text-[11px] text-gray-400">统一档位：8K / 32K / 64K。若模型上限不在档位内，请使用自定义输入。</div>
                                <div className="text-[11px] text-gray-400">留空时默认按 8192 发送，并根据模型上下文自动钳制。</div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-wuxia-cyan">温度 Temperature（留空自动）</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={温度上限}
                                    step={0.1}
                                    value={typeof activeConfig.temperature === 'number' ? String(activeConfig.temperature) : ''}
                                    onChange={(e) => {
                                        const raw = e.target.value.trim();
                                        if (!raw) {
                                            updateActiveConfig({ temperature: undefined });
                                            return;
                                        }
                                        const parsed = Number(raw);
                                        updateActiveConfig({
                                            temperature: Number.isFinite(parsed) && parsed >= 0 && parsed <= 温度上限
                                                ? Math.round(parsed * 100) / 100
                                                : undefined
                                        });
                                    }}
                                    placeholder={温度提示}
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                />
                                <div className="text-[11px] text-gray-400">{温度说明}</div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-wuxia-cyan">Top P（留空按模型默认）</label>
                                <input
                                    type="number"
                                    min={0.01}
                                    max={1}
                                    step={0.01}
                                    value={typeof activeConfig.topP === 'number' ? String(activeConfig.topP) : ''}
                                    onChange={(e) => {
                                        const raw = e.target.value.trim();
                                        if (!raw) {
                                            updateActiveConfig({ topP: undefined });
                                            return;
                                        }
                                        const parsed = Number(raw);
                                        updateActiveConfig({
                                            topP: Number.isFinite(parsed) && parsed >= 0.01 && parsed <= 1
                                                ? Math.round(parsed * 100) / 100
                                                : undefined
                                        });
                                    }}
                                    placeholder={是否MiMo模式 ? '留空按小米官方默认 0.95' : '留空不额外发送'}
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                />
                                <div className="text-[11px] text-gray-400">
                                    {是否MiMo模式 ? '小米 MiMo 官方 Top P 范围 0.01-1.0，推荐默认 0.95。' : '目前仅小米 MiMo 请求会发送 Top P；其他渠道保留原有行为。'}
                                </div>
                            </div>

                            <div className="pt-1">
                                <GameButton
                                    onClick={handleTestConnection}
                                    variant="secondary"
                                    className="w-full"
                                    disabled={testingConnection}
                                >
                                    {testingConnection ? '测试中...' : '测试连接'}
                                </GameButton>
                                <div className="mt-1 text-[11px] text-gray-400">将发送一次极短请求验证 API 连通性与当前模型可用性。</div>
                            </div>

                            <div className="pt-2">
                                <GameButton onClick={handleDeleteActive} variant="danger" className="w-full">
                                    删除当前配置
                                </GameButton>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-4 rounded-md border border-wuxia-gold/20 bg-black/25 p-4">
                <div>
                    <h4 className="font-bold font-serif text-wuxia-gold">主剧情模型</h4>
                    <div className="text-[11px] text-gray-400">这里只有主剧情模型。剧情回忆、变量生成、世界演变、文生图等功能模型请到各自独立页面设置。</div>
                </div>

                <div className="space-y-3 rounded-md border border-gray-700/70 bg-black/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-bold text-wuxia-cyan">主剧情使用模型（必选）</label>
                        <GameButton
                            onClick={handleFetchMainModels}
                            variant="secondary"
                            className="px-4 py-2 text-xs md:min-w-[92px]"
                            disabled={loadingMainModels}
                        >
                            {loadingMainModels ? '...' : '获取列表'}
                        </GameButton>
                    </div>

                    <InlineSelect
                        value={主剧情解析模型}
                        options={主剧情模型选项.map((model) => ({
                            value: model,
                            label: model
                        }))}
                        onChange={(model) => {
                            updateMainModel(model);
                            if (activeConfig) {
                                const matched = 匹配模型输出推荐(model);
                                if (
                                    matched &&
                                    typeof activeConfig.maxTokens === 'number' &&
                                    activeConfig.maxTokens > matched.officialMaxOutput
                                ) {
                                    updateActiveConfig({ maxTokens: undefined });
                                    setMessage(`主剧情模型已切换为 ${model}，原最大输出 Token 超过该模型上限，请重新选择档位。`);
                                }
                            }
                        }}
                        disabled={主剧情模型选项.length === 0}
                        placeholder={主剧情模型选项.length ? '请选择模型' : '请先点击获取列表'}
                        buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        panelClassName="max-w-full"
                    />

                    {主剧情模型选项.length === 0 && (
                        <div className="text-[11px] text-gray-500">请先获取模型列表，或直接在下方手动输入模型名称。</div>
                    )}

                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-gray-300">编辑模型名称</label>
                        <input
                            type="text"
                            value={主剧情解析模型}
                            onChange={(e) => {
                                const nextModel = e.target.value;
                                updateMainModel(nextModel);
                                if (activeConfig) {
                                    const matched = 匹配模型输出推荐(nextModel);
                                    if (
                                        matched &&
                                        typeof activeConfig.maxTokens === 'number' &&
                                        activeConfig.maxTokens > matched.officialMaxOutput
                                    ) {
                                        updateActiveConfig({ maxTokens: undefined });
                                    }
                                }
                            }}
                            placeholder="可直接手动输入模型名称"
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                        />
                    </div>

                    {当前模型推荐 && (
                        <div className="rounded-md border border-cyan-500/20 bg-cyan-950/10 p-3 text-[11px] leading-5 text-gray-300">
                            <div className="font-bold text-cyan-200">{当前模型推荐.providerLabel} · {当前模型推荐.modelLabel}</div>
                            <div>建议输出档位：{当前模型推荐.suggestedSelection.toLocaleString()} tokens；官方上限约 {当前模型推荐.officialMaxOutput.toLocaleString()}。</div>
                            <div>{当前模型推荐.note}</div>
                            <div className="text-gray-500">参考：{当前模型推荐.sourceLabel}（{当前模型推荐.updatedAt}）</div>
                        </div>
                    )}
                    {是否GeminiDeepResearch配置(主剧情解析模型, 主剧情BaseUrl) && (
                        <div className="rounded-md border border-amber-500/40 bg-amber-950/20 p-3 text-[11px] leading-5 text-amber-100">
                            <div className="font-bold">Gemini Deep Research 将使用 Interactions API</div>
                            <div>此类模型不能走 OpenAI 兼容的 chat/completions。系统会自动改用 Gemini Interactions API（/v1beta/interactions），并轮询后台研究结果。</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-md border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-2">
                <div>
                    <h4 className="font-bold font-serif text-cyan-200">网页版跨域自动中转</h4>
                    <div className="text-[11px] text-gray-400 leading-5">
                        仅对网页版生效（APK 不受浏览器跨域限制）。部分第三方接口未开放浏览器跨域（CORS），网页直连会报 Failed to fetch；开启后系统会在直连被拦截时自动经本站同域中转重试一次。中转仅转发请求，不保存密钥。若你使用的接口不允许经过第三方服务器，可关闭此开关。
                    </div>
                </div>
                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>启用跨域自动中转（推荐开启）</span>
                    <input
                        type="checkbox"
                        checked={跨域中转启用}
                        onChange={(event) => {
                            写入跨域中转模式(event.target.checked ? 'auto' : 'off');
                            set跨域中转启用(event.target.checked);
                        }}
                        className="h-4 w-4 accent-cyan-400"
                    />
                </label>
            </div>

            {是否DeepSeek模式 && (
                <div className="space-y-4 rounded-md border border-cyan-500/20 bg-cyan-950/10 p-4">
                    <div>
                        <h4 className="font-bold font-serif text-cyan-200">DeepSeek 稳定救场模型</h4>
                        <div className="text-[11px] text-gray-400">主线健康度低于救场阈值时使用。可只填模型名并复用当前 Base URL/API Key，也可单独填写地址和密钥。</div>
                    </div>
                    <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                        <span>启用稳定模型救场</span>
                        <input
                            type="checkbox"
                            checked={form.功能模型占位.DeepSeek稳定模型救场开关 === true}
                            onChange={(event) => setForm((prev) => ({
                                ...prev,
                                功能模型占位: {
                                    ...prev.功能模型占位,
                                    DeepSeek稳定模型救场开关: event.target.checked,
                                    DeepSeek稳定模型使用模型: (prev.功能模型占位.DeepSeek稳定模型使用模型 || '').trim() || 主剧情解析模型 || ''
                                }
                            }))}
                            className="h-4 w-4 accent-cyan-400"
                        />
                    </label>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">稳定救场使用模型</label>
                        <input
                            type="text"
                            value={form.功能模型占位.DeepSeek稳定模型使用模型 || ''}
                            onChange={(event) => setForm((prev) => ({
                                ...prev,
                                功能模型占位: {
                                    ...prev.功能模型占位,
                                    DeepSeek稳定模型使用模型: event.target.value
                                }
                            }))}
                            placeholder={主剧情解析模型 || '例如 deepseek-chat'}
                            className="w-full rounded-md border border-cyan-500/20 bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-300"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-300">稳定救场 API 地址（可选）</label>
                            <input
                                type="text"
                                value={form.功能模型占位.DeepSeek稳定模型API地址 || ''}
                                onChange={(event) => setForm((prev) => ({
                                    ...prev,
                                    功能模型占位: {
                                        ...prev.功能模型占位,
                                        DeepSeek稳定模型API地址: event.target.value
                                    }
                                }))}
                                placeholder={activeConfig?.baseUrl || '留空复用主接口地址'}
                                className="w-full rounded-md border border-cyan-500/20 bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-300"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-300">稳定救场 API 密钥（可选）</label>
                            <input
                                type="password"
                                value={form.功能模型占位.DeepSeek稳定模型API密钥 || ''}
                                onChange={(event) => setForm((prev) => ({
                                    ...prev,
                                    功能模型占位: {
                                        ...prev.功能模型占位,
                                        DeepSeek稳定模型API密钥: event.target.value
                                    }
                                }))}
                                placeholder="留空复用主接口密钥"
                                className="w-full rounded-md border border-cyan-500/20 bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-300"
                            />
                        </div>
                    </div>
                </div>
            )}

            {是否GLM模式 && (
                <div className="space-y-4 rounded-md border border-green-500/20 bg-green-950/10 p-4">
                    <div>
                        <h4 className="font-bold font-serif text-green-200">GLM 稳定救场模型</h4>
                        <div className="text-[11px] text-gray-400">主线健康度低于救场阈值时使用。可只填模型名并复用当前 Base URL/API Key，也可单独填写地址和密钥。</div>
                    </div>
                    <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                        <span>启用稳定模型救场</span>
                        <input
                            type="checkbox"
                            checked={form.功能模型占位.GLM稳定模型救场开关 === true}
                            onChange={(event) => setForm((prev) => ({
                                ...prev,
                                功能模型占位: {
                                    ...prev.功能模型占位,
                                    GLM稳定模型救场开关: event.target.checked,
                                    GLM稳定模型使用模型: (prev.功能模型占位.GLM稳定模型使用模型 || '').trim() || 主剧情解析模型 || ''
                                }
                            }))}
                            className="h-4 w-4 accent-green-400"
                        />
                    </label>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">稳定救场使用模型</label>
                        <input
                            type="text"
                            value={form.功能模型占位.GLM稳定模型使用模型 || ''}
                            onChange={(event) => setForm((prev) => ({
                                ...prev,
                                功能模型占位: {
                                    ...prev.功能模型占位,
                                    GLM稳定模型使用模型: event.target.value
                                }
                            }))}
                            placeholder={主剧情解析模型 || '例如 glm-4-flash'}
                            className="w-full rounded-md border border-green-500/20 bg-black/50 p-3 text-white outline-none transition-all focus:border-green-300"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-300">稳定救场 API 地址（可选）</label>
                            <input
                                type="text"
                                value={form.功能模型占位.GLM稳定模型API地址 || ''}
                                onChange={(event) => setForm((prev) => ({
                                    ...prev,
                                    功能模型占位: {
                                        ...prev.功能模型占位,
                                        GLM稳定模型API地址: event.target.value
                                    }
                                }))}
                                placeholder={activeConfig?.baseUrl || '留空复用主接口地址'}
                                className="w-full rounded-md border border-green-500/20 bg-black/50 p-3 text-white outline-none transition-all focus:border-green-300"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-300">稳定救场 API 密钥（可选）</label>
                            <input
                                type="password"
                                value={form.功能模型占位.GLM稳定模型API密钥 || ''}
                                onChange={(event) => setForm((prev) => ({
                                    ...prev,
                                    功能模型占位: {
                                        ...prev.功能模型占位,
                                        GLM稳定模型API密钥: event.target.value
                                    }
                                }))}
                                placeholder="留空复用主接口密钥"
                                className="w-full rounded-md border border-green-500/20 bg-black/50 p-3 text-white outline-none transition-all focus:border-green-300"
                            />
                        </div>
                    </div>
                </div>
            )}

            {message && <p className="animate-pulse text-xs text-wuxia-cyan">{message}</p>}

            {testResultModal.open && (
                <div
                    className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onClick={() => setTestResultModal((prev) => ({ ...prev, open: false }))}
                >
                    <div
                        className="min-w-0 w-full max-w-3xl rounded-lg border border-wuxia-gold/30 bg-black/90 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <h4 className={`text-lg font-bold font-serif ${testResultModal.ok ? 'text-green-400' : 'text-red-400'}`}>
                                {testResultModal.title || '连接测试结果'}
                            </h4>
                            <button
                                type="button"
                                onClick={() => setTestResultModal((prev) => ({ ...prev, open: false }))}
                                className="text-gray-400 transition-colors hover:text-white"
                                aria-label="关闭测试结果"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="min-w-0 max-w-full max-h-[60vh] overflow-y-auto rounded-md border border-gray-700/80 bg-black/60 p-3 text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-gray-200 custom-scrollbar">
                            {testResultModal.content}
                        </div>
                        <div className="flex justify-end pt-4">
                            <GameButton
                                onClick={() => setTestResultModal((prev) => ({ ...prev, open: false }))}
                                variant="primary"
                                className="px-6"
                            >
                                关闭
                            </GameButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApiSettings;
