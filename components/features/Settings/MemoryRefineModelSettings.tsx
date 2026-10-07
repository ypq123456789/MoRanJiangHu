import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import { 构建OpenAI兼容模型列表候选地址, 规范化接口设置 } from '../../../utils/apiConfig';
import StageApiModelSelector from './StageApiModelSelector';
import { 功能模型建议说明 } from './FunctionModelAdviceTip';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

const MemoryRefineModelSettings: React.FC<Props> = ({ settings, onSave }) => {
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

    const 主剧情解析模型 = useMemo(() => (
        (form.功能模型占位.主剧情使用模型 || '').trim()
    ), [form.功能模型占位.主剧情使用模型]);

    const 独立模型开启 = Boolean(form.功能模型占位.记忆精炼独立模型开关);
    const 独立API地址 = (form.功能模型占位.记忆精炼API地址 || '').trim();
    const 独立API密钥 = (form.功能模型占位.记忆精炼API密钥 || '').trim();

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
        const resolvedBaseUrl = 独立模型开启 && 独立API地址
            ? 独立API地址
            : (activeConfig?.baseUrl || '');
        const resolvedApiKey = 独立模型开启 && 独立API密钥
            ? 独立API密钥
            : (activeConfig?.apiKey || '');
        if (!resolvedApiKey || !resolvedBaseUrl) {
            setMessage('请先填写可用的 API Key 与 Base URL（支持独立密钥）。');
            return null;
        }
        try {
            const candidateUrls = 构建OpenAI兼容模型列表候选地址(resolvedBaseUrl);
            for (const url of candidateUrls) {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${resolvedApiKey}`
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
        } catch (error: any) {
            setMessage(`获取失败：${error.message}`);
            return null;
        }
    };

    const handleFetchModels = async () => {
        setLoadingModels(true);
        setMessage('');
        const models = await fetchModelsFromCurrentConfig();
        if (models) {
            setModelOptions(models);
            setMessage('记忆精炼模型列表获取成功。');
        }
        setLoadingModels(false);
    };

    const handleToggleIndependent = (checked: boolean) => {
        setForm((prev) => {
            const currentModel = (prev.功能模型占位.记忆精炼使用模型 || '').trim();
            return {
                ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    记忆精炼独立模型开关: checked,
                    记忆精炼使用模型: checked ? (currentModel || 主剧情解析模型 || '') : ''
                }
            };
        });
    };

    const handleSave = () => {
        if (独立模型开启 && !(form.功能模型占位.记忆精炼使用模型 || '').trim()) {
            setMessage('已开启记忆精炼独立模型，请先获取列表并选择模型。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const refineModelValue = (form.功能模型占位.记忆精炼使用模型 || '').trim();
    const refineModelDisplay = 独立模型开启 ? refineModelValue : 主剧情解析模型;
    const selectOptions = Array.from(new Set(
        [...modelOptions, refineModelValue, 主剧情解析模型]
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">记忆精炼模型</h3>
                {/* 「模型配置建议」问号：说清该配什么模型、三档取舍与常见误区 */}
                <功能模型建议说明 stageId="refine" />
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <div className="text-[11px] text-gray-400">
                    当前启用接口配置：{activeConfig?.名称 || '未配置'}。该设置作用于"互动历史"中的 AI 精炼总结功能；留空时回退记忆总结接口。
                </div>

                <div className="rounded border border-wuxia-gold/20 bg-wuxia-gold/5 p-3 space-y-1.5 text-[11px]">
                    <div className="text-wuxia-gold font-bold text-xs">提示</div>
                    <div className="text-gray-300">1. 该功能仅针对回忆条目过多（如 500+）时使用，正常游玩无需开启。模型使用 3 Flash 即可。</div>
                    <div className="text-gray-300">2. 精炼为手动操作：在设置 → 互动历史中勾选需要压缩的回忆条目，点击"AI 精炼总结"即可。</div>
                    <div className="text-gray-300">3. 推荐每次精炼 15 条左右，条目过多可能导致概况内容不全。</div>
                    <div className="text-gray-300">4. 精炼前请确认勾选的条目中不包含已精炼的内容（如"精炼纪要"），避免重复精炼导致信息失真。</div>
                </div>

                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>开启记忆精炼独立模型</span>
                    <ToggleSwitch
                        checked={独立模型开启}
                        onChange={handleToggleIndependent}
                        ariaLabel="切换记忆精炼独立模型"
                    />
                </label>

                <StageApiModelSelector
                    form={form}
                    enabled={独立模型开启}
                    title="记忆精炼"
                    modelKey="记忆精炼使用模型"
                    channelKey="记忆精炼渠道ID"
                    baseUrlKey="记忆精炼API地址"
                    apiKeyKey="记忆精炼API密钥"
                    fallbackModel={主剧情解析模型}
                    disabledPlaceholder="跟随记忆总结模型（回退主剧情）"
                    onChange={updatePlaceholder}
                />

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">记忆精炼独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.记忆精炼API地址 || ''}
                        onChange={(e) => updatePlaceholder('记忆精炼API地址', e.target.value)}
                        placeholder={activeConfig?.baseUrl || '留空则复用主剧情 Base URL'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">留空则复用主剧情 Base URL；填写后仅精炼请求改用此地址。</div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">记忆精炼独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.记忆精炼API密钥 || ''}
                        onChange={(e) => updatePlaceholder('记忆精炼API密钥', e.target.value)}
                        placeholder={activeConfig?.apiKey ? '留空则复用主剧情 API Key' : 'sk-...'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">留空则复用主剧情 API Key；填写后精炼请求优先使用该密钥。</div>
                </div>

                {!独立模型开启 && (
                    <div className="text-[11px] text-gray-400">
                        当前状态：跟随记忆总结接口，若记忆总结未配置则回退主剧情接口。
                    </div>
                )}
            </div>

            {message && <p className="text-xs text-wuxia-cyan animate-pulse">{message}</p>}

            <div className="pt-6 border-t border-wuxia-gold/20 mt-8">
                <GameButton onClick={handleSave} variant="primary" className="w-full">
                    {showSuccess ? '✔ 配置已保存' : '保存设置'}
                </GameButton>
            </div>
        </div>
    );
};

export default MemoryRefineModelSettings;
