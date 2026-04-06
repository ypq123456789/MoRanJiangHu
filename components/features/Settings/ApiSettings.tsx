import React, { useEffect, useMemo, useState } from 'react';
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

const providerOptions: 接口供应商类型[] = ['openai_compatible', 'openai', 'gemini', 'claude', 'deepseek', 'zhipu'];

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

const ApiSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
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

    const 当前最大输出档位 = useMemo<最大输出档位 | null>(() => {
        return 推断最大输出档位(activeConfig?.maxTokens);
    }, [activeConfig?.maxTokens]);

    const 当前模型推荐 = useMemo(() => {
        return 匹配模型输出推荐(主剧情解析模型);
    }, [主剧情解析模型]);

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

    const fetchModelsFromCurrentConfig = async (): Promise<string[] | null> => {
        const baseUrlForRequest = (activeConfig?.baseUrl || '').trim();
        const apiKeyForRequest = (activeConfig?.apiKey || '').trim();
        if (!apiKeyForRequest || !baseUrlForRequest) {
            setMessage('请先填写当前配置的 API Key 和 Base URL');
            return null;
        }
        try {
            const base = baseUrlForRequest.replace(/\/+$/, '');
            const normalized = base.replace(/\/v1$/i, '');
            const candidateUrls = Array.from(new Set([
                `${normalized}/v1/models`,
                `${normalized}/models`,
                `${base}/models`
            ]));
            for (const url of candidateUrls) {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${apiKeyForRequest}`
                    }
                });
                if (!res.ok) continue;
                const data = await res.json();
                if (data && Array.isArray(data.data)) {
                    return data.data.map((m: any) => m?.id).filter(Boolean);
                }
            }
            setMessage('获取失败：返回格式错误。');
            return null;
        } catch (e: any) {
            setMessage(`获取失败：${e.message}`);
            return null;
        }
    };

    const handleFetchMainModels = async () => {
        setLoadingMainModels(true);
        setMessage('');
        const result = await fetchModelsFromCurrentConfig();
        if (result) {
            setMainModelOptions(result);
            setMessage('主剧情模型列表获取成功。');
        }
        setLoadingMainModels(false);
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
        if (!activeConfig) return;
        const tokenValidationError = 校验主剧情最大输出配置();
        if (tokenValidationError) {
            setMessage(tokenValidationError);
            return;
        }
        const modelForTest = (activeConfig.model || '').trim() || (form.功能模型占位.主剧情使用模型 || '').trim();
        if (!activeConfig.apiKey || !activeConfig.baseUrl) {
            setMessage('请先填写当前配置的 API Key 和 Base URL');
            return;
        }
        if (!modelForTest) {
            setMessage('请先填写主剧情模型或配置默认模型');
            return;
        }
        setMessage('');
        setTestingConnection(true);
        try {
            const result = await textAIService.testConnection({
                ...activeConfig,
                model: modelForTest
            });
            const title = result.ok ? '连接测试成功' : '连接测试失败';
            const meta = [
                `配置: ${activeConfig.名称 || activeConfig.id}`,
                `供应商: ${供应商标签[activeConfig.供应商]}`,
                `模型: ${modelForTest}`,
                `最大输出Token: ${typeof activeConfig.maxTokens === 'number' ? activeConfig.maxTokens : '未设置'}`,
                `温度: ${typeof activeConfig.temperature === 'number' ? activeConfig.temperature : '按场景默认'}`,
                `Base URL: ${activeConfig.baseUrl}`,
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
            setTestResultModal({
                open: true,
                title: '连接测试失败',
                content: String(e?.message || '未知错误'),
                ok: false
            });
        } finally {
            setTestingConnection(false);
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
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="mb-6 flex items-center justify-between border-b border-wuxia-gold/30 pb-3">
                <div>
                    <h3 className="text-xl font-bold font-serif text-wuxia-gold">接口配置中心</h3>
                    <div className="mt-1 text-xs text-gray-400">这里只保留主接口连接与主剧情模型设置；功能模型请到对应独立页面管理。</div>
                </div>
            </div>

            <div className="space-y-4 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                <div className="text-xs text-gray-400">当前支持：Gemini / Claude / OpenAI / DeepSeek / 智谱 / OpenAI 兼容接口。文本请求统一按 Chat Completions 方式发起。</div>
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
                                    value={activeConfig.apiKey}
                                    onChange={(e) => updateActiveConfig({ apiKey: e.target.value })}
                                    placeholder="sk-..."
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                />
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
                                    max={2}
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
                                            temperature: Number.isFinite(parsed) && parsed >= 0 && parsed <= 2
                                                ? Math.round(parsed * 100) / 100
                                                : undefined
                                        });
                                    }}
                                    placeholder="留空按场景默认（主剧情0.7/世界0.8/回忆0.2）"
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-wuxia-gold"
                                />
                                <div className="text-[11px] text-gray-400">OpenAI/Gemini/DeepSeek 范围 0-2；Claude 范围 0-1（超过 1 会自动按 1 发送）。</div>
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
                </div>
            </div>

            {message && <p className="animate-pulse text-xs text-wuxia-cyan">{message}</p>}

            <div className="mt-8 border-t border-wuxia-gold/20 pt-6">
                <GameButton onClick={handleSave} variant="primary" className="w-full">
                    {showSuccess ? '✔ 配置已保存' : '保存配置'}
                </GameButton>
            </div>

            {testResultModal.open && (
                <div
                    className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onClick={() => setTestResultModal((prev) => ({ ...prev, open: false }))}
                >
                    <div
                        className="w-full max-w-3xl rounded-lg border border-wuxia-gold/30 bg-black/90 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]"
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
                        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-gray-700/80 bg-black/60 p-3 text-xs whitespace-pre-wrap text-gray-200 custom-scrollbar">
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
