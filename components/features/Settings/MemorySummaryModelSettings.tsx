import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import { 获取剧情回忆接口配置, 获取记忆总结接口配置, 规范化接口设置, 接口配置是否可用 } from '../../../utils/apiConfig';
import StageApiModelSelector from './StageApiModelSelector';
import { 功能模型建议说明 } from './FunctionModelAdviceTip';

/** 只取主机名，避免把整条 Base URL（可能带密钥参数）展示出来。 */
const 取地址标识 = (url?: string): string => {
    const raw = (url || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw).host;
    } catch {
        return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }
};

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

const MemorySummaryModelSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
    }, [settings]);

    const 主剧情解析模型 = useMemo(() => (
        (form.功能模型占位.主剧情使用模型 || '').trim()
    ), [form.功能模型占位.主剧情使用模型]);

    const 独立模型开启 = Boolean(form.功能模型占位.记忆总结独立模型开关);

    // 面板顶部必须展示「真正会发请求的那个接口」，而不是主配置：
    // 未开独立模型时实际走的是剧情回忆配置，只改主渠道对这里毫无影响。
    const 生效接口 = useMemo(() => 获取记忆总结接口配置(form), [form]);
    const 生效接口来源 = useMemo(() => {
        if (独立模型开启) return '「记忆总结」独立配置';
        const recall = 获取剧情回忆接口配置(form);
        if (接口配置是否可用(recall)) return '「剧情回忆」配置（记忆总结未开独立模型时跟随其后）';
        return '当前启用接口（主配置）';
    }, [form, 独立模型开启]);

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                [key]: value
            }
        }));
    };

    const handleToggleIndependent = (checked: boolean) => {
        setForm((prev) => {
            const currentModel = (prev.功能模型占位.记忆总结使用模型 || '').trim();
            return {
                ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    记忆总结独立模型开关: checked,
                    记忆总结使用模型: checked ? (currentModel || 主剧情解析模型 || '') : ''
                }
            };
        });
    };

    const handleSave = () => {
        if (独立模型开启 && !(form.功能模型占位.记忆总结使用模型 || '').trim()) {
            setMessage('已开启记忆总结独立模型，请先选择或填写模型名（也可点「刷新模型」拉列表）。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">记忆总结模型</h3>
                {/* 「模型配置建议」问号：说清该配什么模型、三档取舍与常见误区 */}
                <功能模型建议说明 stageId="summary" />
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <div className="rounded-md border border-wuxia-cyan/25 bg-wuxia-cyan/5 p-3 space-y-1">
                    <div className="text-[11px] text-gray-300">
                        当前实际生效：
                        <span className="text-wuxia-cyan font-bold">
                            {生效接口
                                ? `${生效接口.名称 || '未命名渠道'} · ${生效接口.model}${生效接口.baseUrl ? ` @ ${取地址标识(生效接口.baseUrl)}` : ''}`
                                : '未配置完成（缺少可用模型或密钥）'}
                        </span>
                    </div>
                    <div className="text-[11px] text-gray-500">来源：{生效接口来源}</div>
                    <div className="text-[11px] text-gray-500">
                        本页改动需点下方「保存设置」才会用于后续总结；在「接口连接」里切换主渠道不会自动改变这里。
                    </div>
                </div>

                <div className="text-[11px] text-gray-400">
                    该设置同时作用于“短期转中期”“中期转长期”以及 NPC 记忆总结流程。开启独立模型后使用本页渠道/模型，关闭时按上方「来源」逐级回退。
                </div>

                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>开启记忆总结独立模型</span>
                    <ToggleSwitch
                        checked={独立模型开启}
                        onChange={handleToggleIndependent}
                        ariaLabel="切换记忆总结独立模型"
                    />
                </label>

                <StageApiModelSelector
                    form={form}
                    enabled={独立模型开启}
                    title="记忆总结"
                    modelKey="记忆总结使用模型"
                    channelKey="记忆总结渠道ID"
                    baseUrlKey="记忆总结API地址"
                    apiKeyKey="记忆总结API密钥"
                    fallbackModel={主剧情解析模型}
                    onChange={updatePlaceholder}
                />

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">记忆总结独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.记忆总结API地址 || ''}
                        onChange={(e) => updatePlaceholder('记忆总结API地址', e.target.value)}
                        placeholder={生效接口?.baseUrl || '留空则复用所选渠道的 Base URL'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">留空则复用所选渠道的 Base URL；填写后仅总结请求改用此地址。</div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">记忆总结独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.记忆总结API密钥 || ''}
                        onChange={(e) => updatePlaceholder('记忆总结API密钥', e.target.value)}
                        placeholder={生效接口?.apiKey ? '留空则复用所选渠道的 API Key' : 'sk-...'}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            独立模型开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                    <div className="text-[11px] text-gray-500">留空则复用所选渠道的 API Key；填写后总结请求优先使用该密钥。</div>
                </div>

                {!独立模型开启 && (
                    <div className="text-[11px] text-gray-400">
                        当前状态：跟随剧情回忆接口，若剧情回忆未启用则回退主剧情接口。
                        <span className="mt-1 block text-gray-500">
                            上面的渠道、模型、地址、密钥要能编辑，请先打开「开启记忆总结独立模型」。
                        </span>
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

export default MemorySummaryModelSettings;
