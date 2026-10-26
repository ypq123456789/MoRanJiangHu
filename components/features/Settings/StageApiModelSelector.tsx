import React, { useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import InlineSelect from '../../ui/InlineSelect';
import { 构建OpenAI兼容模型列表候选地址 } from '../../../utils/apiConfig';
import { 构建模型列表请求头, 读取可复用自定义请求头 } from '../../../utils/customRequestHeaders';

type PlaceholderKey = keyof 功能模型占位配置结构;

interface Props {
    form: 接口设置结构;
    enabled: boolean;
    title: string;
    modelKey: PlaceholderKey;
    channelKey: PlaceholderKey;
    baseUrlKey: PlaceholderKey;
    apiKeyKey: PlaceholderKey;
    onChange: <K extends PlaceholderKey>(key: K, value: 功能模型占位配置结构[K]) => void;
    fallbackModel?: string;
    disabledPlaceholder?: string;
}

const trim = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const StageApiModelSelector: React.FC<Props> = ({
    form,
    enabled,
    title,
    modelKey,
    channelKey,
    baseUrlKey,
    apiKeyKey,
    onChange,
    fallbackModel = '',
    disabledPlaceholder
}) => {
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [message, setMessage] = useState('');

    const selectedChannelId = trim(form.功能模型占位[channelKey]) || form.activeConfigId || form.configs[0]?.id || '';
    const selectedConfig = useMemo<单接口配置结构 | null>(() => {
        return form.configs.find((cfg) => cfg.id === selectedChannelId) || form.configs[0] || null;
    }, [form.configs, selectedChannelId]);

    const modelValue = trim(form.功能模型占位[modelKey]);
    const displayModel = enabled ? modelValue : fallbackModel;
    const selectedDefaultModel = trim(selectedConfig?.model);
    const selectOptions = Array.from(new Set([
        ...modelOptions,
        modelValue,
        selectedDefaultModel,
        fallbackModel
    ].map((item) => trim(item)).filter(Boolean)));

    const handleChannelChange = (channelId: string) => {
        const nextConfig = form.configs.find((cfg) => cfg.id === channelId) || null;
        onChange(channelKey, channelId as any);
        onChange(modelKey, trim(nextConfig?.model) as any);
        onChange(baseUrlKey, '' as any);
        onChange(apiKeyKey, '' as any);
        setModelOptions([]);
        setMessage('');
    };

    const fetchModels = async () => {
        const resolvedBaseUrl = trim(form.功能模型占位[baseUrlKey]) || trim(selectedConfig?.baseUrl);
        const resolvedApiKey = trim(form.功能模型占位[apiKeyKey]) || trim(selectedConfig?.apiKey);
        if (!resolvedBaseUrl || !resolvedApiKey) {
            setMessage('请先选择有 Base URL 和 API Key 的渠道，或填写独立地址与密钥。');
            return;
        }
        setLoadingModels(true);
        setMessage('');
        try {
            const candidateUrls = 构建OpenAI兼容模型列表候选地址(resolvedBaseUrl);
            for (const url of candidateUrls) {
                const res = await fetch(url, {
                    headers: 构建模型列表请求头({
                        baseUrl: resolvedBaseUrl,
                        apiKey: resolvedApiKey,
                        自定义请求头: 读取可复用自定义请求头(resolvedBaseUrl, selectedConfig)
                    })
                });
                if (!res.ok) continue;
                const data = await res.json();
                if (Array.isArray(data?.data)) {
                    const models = data.data.map((m: any) => trim(m?.id)).filter(Boolean);
                    setModelOptions(models);
                    setMessage(`${title}模型列表获取成功。`);
                    return;
                }
            }
            setMessage('获取失败：返回格式错误。');
        } catch (error: any) {
            setMessage(`获取失败：${error?.message || '网络异常'}`);
        } finally {
            setLoadingModels(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <label className="text-xs text-gray-300">{title}渠道</label>
                <InlineSelect
                    value={selectedChannelId}
                    options={form.configs.map((cfg) => ({
                        value: cfg.id,
                        label: `${cfg.名称 || '未命名渠道'}${trim(cfg.model) ? ` · ${trim(cfg.model)}` : ''}`
                    }))}
                    onChange={handleChannelChange}
                    disabled={!enabled || form.configs.length === 0}
                    placeholder={form.configs.length ? '请选择渠道' : '请先在接口配置中心新增渠道'}
                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                />
            </div>
            <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-2">
                    <label className="text-xs text-gray-300">{title}使用模型</label>
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                        <InlineSelect
                            value={displayModel}
                            options={selectOptions.map((model) => ({ value: model, label: model }))}
                            onChange={(model) => onChange(modelKey, model as any)}
                            disabled={!enabled || selectOptions.length === 0}
                            placeholder={!enabled
                                ? (disabledPlaceholder || `跟随默认模型：${fallbackModel || '未设置'}`)
                                : (selectOptions.length ? '从列表选择模型' : '刷新后可从列表选择')}
                            buttonClassName={enabled ? 'bg-black/50 border-gray-600 py-2.5' : 'bg-black/30 border-gray-700 py-2.5'}
                        />
                        <input
                            type="text"
                            value={enabled ? modelValue : displayModel}
                            onChange={(event) => onChange(modelKey, event.target.value as any)}
                            disabled={!enabled}
                            placeholder={!enabled
                                ? (disabledPlaceholder || `跟随默认模型：${fallbackModel || '未设置'}`)
                                : '也可直接输入/粘贴模型名'}
                            spellCheck={false}
                            className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition ${
                                enabled
                                    ? 'bg-black/50 border-gray-600 text-white placeholder-gray-500 focus:border-wuxia-gold'
                                    : 'bg-black/30 border-gray-700 text-gray-500 cursor-not-allowed'
                            }`}
                        />
                    </div>
                    <div className="text-[11px] text-gray-500">左侧可下拉选择，右侧可直接输入、复制和粘贴自定义模型名。</div>
                </div>
                <GameButton
                    onClick={fetchModels}
                    variant="secondary"
                    className="px-4 py-2 text-xs"
                    disabled={!enabled || loadingModels}
                >
                    {loadingModels ? '...' : '刷新模型'}
                </GameButton>
            </div>
            {message && <div className="text-[11px] text-wuxia-cyan">{message}</div>}
        </div>
    );
};

export default StageApiModelSelector;
