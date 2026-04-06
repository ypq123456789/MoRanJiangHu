import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import { 规范化接口设置 } from '../../../utils/apiConfig';
import { 默认文章优化提示词 } from '../../../prompts/runtime/defaults';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

const PolishModelSettings: React.FC<Props> = ({ settings, onSave }) => {
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
        return (form.功能模型占位.主剧情使用模型 || '').trim();
    }, [form.功能模型占位.主剧情使用模型]);

    const 独立模型开启 = Boolean(form.功能模型占位.文章优化独立模型开关);
    const 独立API地址 = (form.功能模型占位.文章优化API地址 || '').trim();
    const 独立API密钥 = (form.功能模型占位.文章优化API密钥 || '').trim();

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm(prev => ({
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
            const base = resolvedBaseUrl.replace(/\/+$/, '');
            const normalized = base.replace(/\/v1$/i, '');
            const candidateUrls = Array.from(new Set([
                `${normalized}/v1/models`,
                `${normalized}/models`,
                `${base}/models`
            ]));
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
            setMessage('文章优化模型列表获取成功。');
        }
        setLoadingModels(false);
    };

    const handleToggleIndependent = (checked: boolean) => {
        setForm(prev => {
            const currentModel = (prev.功能模型占位.文章优化使用模型 || '').trim();
            return {
                ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    文章优化独立模型开关: checked,
                    文章优化使用模型: checked ? (currentModel || 主剧情解析模型 || '') : ''
                }
            };
        });
    };

    const handleSave = () => {
        if (独立模型开启 && !(form.功能模型占位.文章优化使用模型 || '').trim()) {
            setMessage('已开启文章优化独立模型，请先获取列表并选择模型。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const polishModelValue = (form.功能模型占位.文章优化使用模型 || '').trim();
    const polishModelDisplay = 独立模型开启 ? polishModelValue : 主剧情解析模型;
    const polishPromptValue = (form.功能模型占位.文章优化提示词 || '').trim().length > 0
        ? form.功能模型占位.文章优化提示词
        : 默认文章优化提示词;
    const selectOptions = Array.from(
        new Set(
            [
                ...modelOptions,
                polishModelValue,
                主剧情解析模型
            ]
                .map(item => (item || '').trim())
                .filter(Boolean)
        )
    );

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">文章优化模型</h3>
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <div className="text-[11px] text-gray-400">
                    当前启用接口配置：{activeConfig?.名称 || '未配置'}。开启后才会自动润色 \`&lt;正文&gt;\`；可单独指定 Base URL 与 API Key，留空时复用主配置。
                </div>

                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>开启文章优化独立模型</span>
                    <ToggleSwitch
                        checked={独立模型开启}
                        onChange={handleToggleIndependent}
                        ariaLabel="切换文章优化独立模型"
                    />
                </label>

                <div className="flex gap-3 items-end">
                    <div className="flex-1 space-y-1">
                        <label className="text-xs text-gray-300">文章优化使用模型</label>
                        <InlineSelect
                            value={polishModelDisplay}
                            options={selectOptions.map((model) => ({
                                value: model,
                                label: model
                            }))}
                            onChange={(model) => updatePlaceholder('文章优化使用模型', model)}
                            disabled={!独立模型开启 || selectOptions.length === 0}
                            placeholder={!独立模型开启
                                ? `跟随主剧情模型：${主剧情解析模型 || '未设置'}`
                                : (selectOptions.length ? '请选择模型' : '请先点击获取列表')}
                            buttonClassName={独立模型开启
                                ? 'bg-black/50 border-gray-600 py-2.5'
                                : 'bg-black/30 border-gray-700 py-2.5'}
                        />
                    </div>
                    <GameButton
                        onClick={handleFetchModels}
                        variant="secondary"
                        className="px-4 py-2 text-xs"
                        disabled={loadingModels}
                    >
                        {loadingModels ? '...' : '获取列表'}
                    </GameButton>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-300">文章优化独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.文章优化API地址 || ''}
                        onChange={(e) => updatePlaceholder('文章优化API地址', e.target.value)}
                        placeholder={activeConfig?.baseUrl || '留空则复用主剧情 Base URL'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">
                        留空则复用主剧情 Base URL；填写后仅文章优化请求改用此地址。
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-300">文章优化独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.文章优化API密钥 || ''}
                        onChange={(e) => updatePlaceholder('文章优化API密钥', e.target.value)}
                        placeholder={activeConfig?.apiKey ? '留空则复用主剧情 API Key' : 'sk-...'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">
                        留空则复用主剧情 API Key；填写后文章优化请求优先使用该密钥。
                    </div>
                </div>

                {!独立模型开启 && (
                    <div className="text-[11px] text-gray-400">
                        当前状态：自动润色关闭
                    </div>
                )}
            </div>

            <div className="rounded-md border border-wuxia-cyan/25 bg-black/20 p-4 space-y-3">
                <div className="text-xs text-wuxia-cyan font-bold">润色提示词</div>
                <textarea
                    value={polishPromptValue}
                    onChange={(e) => updatePlaceholder('文章优化提示词', e.target.value)}
                    className="w-full h-44 bg-black/50 border border-gray-700 p-3 text-white rounded-md outline-none focus:border-wuxia-gold custom-scrollbar resize-none text-xs leading-relaxed"
                />
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => updatePlaceholder('文章优化提示词', 默认文章优化提示词)}
                        className="px-3 py-1.5 text-[11px] rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500"
                    >
                        恢复默认提示词
                    </button>
                </div>
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

export default PolishModelSettings;
