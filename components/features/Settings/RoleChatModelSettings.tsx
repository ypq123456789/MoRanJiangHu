import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import { 构建OpenAI兼容模型列表候选地址, 规范化接口设置 } from '../../../utils/apiConfig';
import { 默认角色对话提示词 } from '../../../prompts/runtime/defaults';
import StageApiModelSelector from './StageApiModelSelector';
import { 功能模型建议说明 } from './FunctionModelAdviceTip';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

// 「角色对话」侧聊模型设置：独立模型是硬前提，未开启/未配齐时侧聊面板会引导玩家来这里配置。
const RoleChatModelSettings: React.FC<Props> = ({ settings, onSave }) => {
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

    const 独立模型开启 = Boolean(form.功能模型占位.角色对话独立模型开关);
    const 独立API地址 = (form.功能模型占位.角色对话API地址 || '').trim();
    const 独立API密钥 = (form.功能模型占位.角色对话API密钥 || '').trim();
    const 群聊开启 = Boolean(form.功能模型占位.角色对话群聊开关);

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
            setMessage('角色对话模型列表获取成功。');
        }
        setLoadingModels(false);
    };

    const handleToggleIndependent = (checked: boolean) => {
        setForm(prev => {
            const currentModel = (prev.功能模型占位.角色对话使用模型 || '').trim();
            return {
                ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    角色对话独立模型开关: checked,
                    // 独立模型是硬前提：不拿主剧情模型兜底，否则「独立模型」名不副实、
                    // 且开启开关后会直接复用主剧情模型静默生效。未选模型时面板只给引导。
                    角色对话使用模型: checked ? currentModel : ''
                }
            };
        });
    };

    const handleSave = () => {
        if (独立模型开启 && !(form.功能模型占位.角色对话使用模型 || '').trim()) {
            setMessage('已开启角色对话独立模型，请先获取列表并选择模型。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const roleChatModelValue = (form.功能模型占位.角色对话使用模型 || '').trim();
    const roleChatPromptValue = (form.功能模型占位.角色对话提示词 || '').trim().length > 0
        ? form.功能模型占位.角色对话提示词
        : 默认角色对话提示词;
    const selectOptions = Array.from(
        new Set(
            [
                ...modelOptions,
                roleChatModelValue,
                主剧情解析模型
            ]
                .map(item => (item || '').trim())
                .filter(Boolean)
        )
    );

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">角色对话模型</h3>
                {/* 角色对话不在「功能模型工作流」流程图里，问号挂在这里 */}
                <功能模型建议说明 stageId="rolechat" />
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <div className="text-[11px] text-gray-400 leading-relaxed">
                    「角色对话」是主输入框旁的场外侧聊：可以与一名附近 NPC 私聊，也可以勾选多名附近 NPC 群聊。
                    对话不进正文、不耗时间；暂存的对话会在你下次提交行动时打包注入主剧情，主回合成功后自动清空。
                    独立模型是硬前提——不开启时侧聊面板只显示引导，不会回退到主剧情模型。
                </div>

                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>开启角色对话独立模型</span>
                    <ToggleSwitch
                        checked={独立模型开启}
                        onChange={handleToggleIndependent}
                        ariaLabel="切换角色对话独立模型"
                    />
                </label>

                <StageApiModelSelector
                    form={form}
                    enabled={独立模型开启}
                    title="角色对话"
                    modelKey="角色对话使用模型"
                    channelKey="角色对话渠道ID"
                    baseUrlKey="角色对话API地址"
                    apiKeyKey="角色对话API密钥"
                    fallbackModel={主剧情解析模型}
                    onChange={updatePlaceholder}
                />

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">角色对话独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.角色对话API地址 || ''}
                        onChange={(e) => updatePlaceholder('角色对话API地址', e.target.value)}
                        placeholder={activeConfig?.baseUrl || '留空则复用主剧情 Base URL'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">
                        建议配一个便宜、响应快的小模型（如 Flash 类）；留空则复用主剧情 Base URL。
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-300">角色对话独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.角色对话API密钥 || ''}
                        onChange={(e) => updatePlaceholder('角色对话API密钥', e.target.value)}
                        placeholder={activeConfig?.apiKey ? '留空则复用主剧情 API Key' : 'sk-...'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">
                        留空则复用主剧情 API Key；填写后角色对话请求优先使用该密钥。
                    </div>
                </div>

                {!独立模型开启 && (
                    <div className="text-[11px] text-gray-400">
                        当前状态：角色对话未启用（面板将显示配置引导）
                    </div>
                )}
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/20 p-4 space-y-4">
                <div className="text-xs text-wuxia-gold font-bold">群聊与显示</div>
                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>开启多人群聊</span>
                    <ToggleSwitch
                        checked={群聊开启}
                        onChange={(checked) => updatePlaceholder('角色对话群聊开关', checked)}
                        ariaLabel="切换多人群聊"
                    />
                </label>
                <div className="text-[11px] text-amber-200/80 leading-relaxed">
                    群聊中的每次角色发言会分别调用所选模型。自动接话次数越多，通常等待越久、费用越高；缓存优惠取决于接口，无法保证。
                </div>
                <label className="block space-y-1 text-xs text-gray-300">
                    <span>每次玩家发言后的自动接话上限：{form.功能模型占位.角色对话群聊自动回复上限}</span>
                    <input
                        type="range"
                        min={1}
                        max={6}
                        value={form.功能模型占位.角色对话群聊自动回复上限}
                        onChange={(e) => updatePlaceholder('角色对话群聊自动回复上限', Number(e.target.value))}
                        disabled={!群聊开启}
                        className="w-full accent-amber-500"
                    />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs text-gray-300">
                        <span>单聊气泡</span>
                        <select
                            value={form.功能模型占位.角色对话单聊气泡样式}
                            onChange={(e) => updatePlaceholder('角色对话单聊气泡样式', e.target.value as 'single' | 'split')}
                            className="w-full bg-black/50 border border-gray-700 p-2 text-white rounded-md"
                        >
                            <option value="single">整段显示</option>
                            <option value="split">按段落分气泡</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-xs text-gray-300">
                        <span>群聊气泡</span>
                        <select
                            value={form.功能模型占位.角色对话群聊气泡样式}
                            onChange={(e) => updatePlaceholder('角色对话群聊气泡样式', e.target.value as 'single' | 'split')}
                            className="w-full bg-black/50 border border-gray-700 p-2 text-white rounded-md"
                        >
                            <option value="split">按段落分气泡</option>
                            <option value="single">整段显示</option>
                        </select>
                    </label>
                </div>
            </div>

            <div className="rounded-md border border-wuxia-cyan/25 bg-black/20 p-4 space-y-3">
                <div className="text-xs text-wuxia-cyan font-bold">角色对话提示词</div>
                <textarea
                    value={roleChatPromptValue}
                    onChange={(e) => updatePlaceholder('角色对话提示词', e.target.value)}
                    className="w-full h-44 bg-black/50 border border-gray-700 p-3 text-white rounded-md outline-none focus:border-wuxia-gold custom-scrollbar resize-none text-xs leading-relaxed"
                />
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => updatePlaceholder('角色对话提示词', 默认角色对话提示词)}
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

export default RoleChatModelSettings;
