import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import { 构建OpenAI兼容模型列表候选地址, 规范化接口设置 } from '../../../utils/apiConfig';
import { 构建模型列表请求头 } from '../../../utils/customRequestHeaders';
import StageApiModelSelector from './StageApiModelSelector';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

const StoryPlanModelSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
        setModelOptions([]);
    }, [settings]);

    const activeConfig = useMemo<单接口配置结构 | null>(() => {
        if (!form.configs.length) return null;
        const selected = form.configs.find((cfg) => cfg.id === form.activeConfigId);
        return selected || form.configs[0] || null;
    }, [form.activeConfigId, form.configs]);

    const 主剧情解析模型 = useMemo(() => {
        return (activeConfig?.model || '').trim() || (form.功能模型占位.主剧情使用模型 || '').trim();
    }, [activeConfig?.model, form.功能模型占位.主剧情使用模型]);

    const 独立模型开启 = Boolean(form.功能模型占位.剧情规划独立模型开关);
    const 独立API地址 = (form.功能模型占位.剧情规划API地址 || '').trim();
    const 独立API密钥 = (form.功能模型占位.剧情规划API密钥 || '').trim();

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                [key]: value
            }
        }));
    };

    const fetchModelsFromCurrentConfig = async (): Promise<string[] | null> => {
        const resolvedBaseUrl = 独立模型开启 && 独立API地址 ? 独立API地址 : (activeConfig?.baseUrl || '');
        const resolvedApiKey = 独立模型开启 && 独立API密钥 ? 独立API密钥 : (activeConfig?.apiKey || '');
        if (!resolvedApiKey || !resolvedBaseUrl) {
            setMessage('请先填写可用的 API Key 与 Base URL。');
            return null;
        }
        try {
            const candidateUrls = 构建OpenAI兼容模型列表候选地址(resolvedBaseUrl);
            for (const url of candidateUrls) {
                const res = await fetch(url, {
                    headers: 构建模型列表请求头({
                        baseUrl: resolvedBaseUrl,
                        apiKey: resolvedApiKey,
                        自定义请求头: activeConfig?.自定义请求头
                    })
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

    const handleFetchModels = async () => {
        setLoadingModels(true);
        setMessage('');
        const models = await fetchModelsFromCurrentConfig();
        if (models) {
            setModelOptions(models);
            setMessage('剧情规划模型列表获取成功。');
        }
        setLoadingModels(false);
    };

    const handleToggleIndependent = (checked: boolean) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                剧情规划独立模型开关: checked,
                剧情规划使用模型: (prev.功能模型占位.剧情规划使用模型 || '').trim() || 主剧情解析模型 || ''
            }
        }));
    };

    const handleSave = () => {
        if (独立模型开启 && !(form.功能模型占位.剧情规划使用模型 || '').trim()) {
            setMessage('已开启剧情规划独立模型，请先获取列表并选择模型。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const modelValue = (form.功能模型占位.剧情规划使用模型 || '').trim();
    const modelDisplay = 独立模型开启 ? modelValue : 主剧情解析模型;
    const selectOptions = Array.from(new Set([...modelOptions, modelValue, 主剧情解析模型].map((item) => (item || '').trim()).filter(Boolean)));

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3 mb-6">
                <div>
                    <h3 className="text-emerald-200 font-serif font-bold text-xl">剧情规划</h3>
                    <div className="mt-1 text-xs text-gray-400">为剧情规划池提供独立更新模型，失败时回退为主流程状态。</div>
                </div>
            </div>

            <div className="rounded-md border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-4">
                <div className="text-[11px] text-gray-400">当前启用接口配置：{activeConfig?.名称 || '未配置'}。</div>
                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>启用剧情规划独立模型</span>
                    <ToggleSwitch checked={独立模型开启} onChange={handleToggleIndependent} ariaLabel="切换剧情规划独立模型" />
                </label>
                <StageApiModelSelector
                    form={form}
                    enabled={独立模型开启}
                    title="剧情规划"
                    modelKey="剧情规划使用模型"
                    channelKey="剧情规划渠道ID"
                    baseUrlKey="剧情规划API地址"
                    apiKeyKey="剧情规划API密钥"
                    fallbackModel={主剧情解析模型}
                    onChange={updatePlaceholder}
                />
                <div className="space-y-1">
                    <label className="text-xs text-gray-300">剧情规划独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.剧情规划API地址 || ''}
                        onChange={(e) => updatePlaceholder('剧情规划API地址', e.target.value)}
                        placeholder={activeConfig?.baseUrl || '留空则复用主剧情 Base URL'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${独立模型开启 ? 'bg-black/50 border-gray-700 focus:border-emerald-400' : 'bg-black/30 border-gray-800 text-gray-400'}`}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-300">剧情规划独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.剧情规划API密钥 || ''}
                        onChange={(e) => updatePlaceholder('剧情规划API密钥', e.target.value)}
                        placeholder={activeConfig?.apiKey ? '留空则复用主剧情 API Key' : 'sk-...'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${独立模型开启 ? 'bg-black/50 border-gray-700 focus:border-emerald-400' : 'bg-black/30 border-gray-800 text-gray-400'}`}
                    />
                </div>
            </div>

            {message && <p className="text-xs text-emerald-300 animate-pulse">{message}</p>}

            <div className="pt-6 border-t border-emerald-500/20 mt-8">
                <GameButton onClick={handleSave} variant="primary" className="w-full">
                    {showSuccess ? '✔ 配置已保存' : '保存设置'}
                </GameButton>
            </div>
        </div>
    );
};

export default StoryPlanModelSettings;
