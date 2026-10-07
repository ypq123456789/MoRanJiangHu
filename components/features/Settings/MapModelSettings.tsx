import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import InlineSelect from '../../ui/InlineSelect';
import ToggleSwitch from '../../ui/ToggleSwitch';
import { 构建OpenAI兼容模型列表候选地址, 规范化接口设置 } from '../../../utils/apiConfig';
import StageApiModelSelector from './StageApiModelSelector';
import { 功能模型建议说明 } from './FunctionModelAdviceTip';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
    onRegenerateMapFromMemory?: (onDelta: (delta: string) => void) => Promise<{ ok: boolean; message: string }>;
}

const MapModelSettings: React.FC<Props> = ({ settings, onSave, onRegenerateMapFromMemory }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [memoryParsing, setMemoryParsing] = useState(false);
    const [streamText, setStreamText] = useState('');
    const streamRef = React.useRef<HTMLDivElement>(null);

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

    const 地图生成模型 = (form.功能模型占位.地图生成使用模型 || '').trim();
    const 地图生成API地址 = (form.功能模型占位.地图生成API地址 || '').trim();
    const 地图生成API密钥 = (form.功能模型占位.地图生成API密钥 || '').trim();
    const 地图生成功能开启 = form.功能模型占位.地图生成功能启用 !== false;
    const 主剧情解析模型 = (form.功能模型占位.主剧情使用模型 || '').trim() || (activeConfig?.model || '').trim();
    const 自动更新独立开启 = Boolean(form.功能模型占位.地图自动更新独立模型开关);
    const 自动更新模型 = (form.功能模型占位.地图自动更新使用模型 || '').trim();
    const 自动更新API地址 = (form.功能模型占位.地图自动更新API地址 || '').trim();
    const 自动更新API密钥 = (form.功能模型占位.地图自动更新API密钥 || '').trim();

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
        const resolvedBaseUrl = 自动更新独立开启
            ? (自动更新API地址 || activeConfig?.baseUrl || '')
            : (地图生成API地址 || activeConfig?.baseUrl || '');
        const resolvedApiKey = 自动更新独立开启
            ? (自动更新API密钥 || activeConfig?.apiKey || '')
            : (地图生成API密钥 || activeConfig?.apiKey || '');
        if (!resolvedApiKey || !resolvedBaseUrl) {
            setMessage('请先填写可用的 API Key 与 Base URL。');
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
            setMessage('地图生成模型列表获取成功。');
        }
        setLoadingModels(false);
    };

    const handleSave = () => {
        if (自动更新独立开启 && !自动更新模型) {
            setMessage('已开启地图自动更新独立模型，请先选择模型。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    React.useEffect(() => {
        if (streamRef.current) {
            streamRef.current.scrollTop = streamRef.current.scrollHeight;
        }
    }, [streamText]);

    const handleRegenerateFromMemory = async () => {
        if (!onRegenerateMapFromMemory || memoryParsing) return;
        setMemoryParsing(true);
        setStreamText('');
        try {
            const result = await onRegenerateMapFromMemory((delta) => {
                setStreamText((prev) => prev + delta);
            });
            if (!result.ok) {
                setStreamText((prev) => prev + `\n\n[失败] ${result.message}`);
            } else {
                setStreamText((prev) => prev + `\n\n[完成] ${result.message}`);
            }
        } catch (error: any) {
            setStreamText((prev) => prev + `\n\n[错误] ${error?.message || '未知错误'}`);
        } finally {
            setMemoryParsing(false);
        }
    };

    const mapModelValue = 地图生成模型;
    const mapModelDisplay = mapModelValue || (activeConfig?.model || '');
    const autoMapModelDisplay = 自动更新独立开启 ? 自动更新模型 : 主剧情解析模型;
    const selectOptions = Array.from(new Set(
        [...modelOptions, mapModelValue, 自动更新模型, 主剧情解析模型, activeConfig?.model || '']
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <h3 className="text-wuxia-gold font-serif font-bold text-xl">地图生成模型</h3>
                {/* 「模型配置建议」问号：说清该配什么模型、三档取舍与常见误区 */}
                <功能模型建议说明 stageId="map" />
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <div className="rounded border border-wuxia-gold/20 bg-wuxia-gold/5 p-3 space-y-1.5 text-[11px]">
                    <div className="text-wuxia-gold font-bold text-xs">提示</div>
                    <div className="text-gray-300">1. 地图生成是对 AI 算力消耗较低的轻量任务，通过检索正文来更新地图，推荐使用 Flash 或 mini 级模型。</div>
                    <div className="text-gray-300">2. 开启地图生成功能后，需要在下面配置 API 模型，否则就和正文使用同一个模型。</div>
                    <div className="text-gray-300">3. 回忆解析是根据回忆库来生成地图，会删除目前的地图内容；如果你是老版本迁移过来的存档，可以先使用这个功能。</div>
                    <div className="text-gray-300">4. 回忆解析多用于老存档兼容；如果你是新开的存档，则不需要使用它，只需要选择是否开启地图生成以及是否使用独立模型生成。</div>
                </div>

                <div className="text-[11px] text-gray-400">
                    当前启用接口配置：{activeConfig?.名称 || '未配置'}。手动「回忆解析」会使用下方解析配置；正文后的自动地图更新由地图生成功能总开关控制，开启后默认跟随主剧情接口，也可单独指定模型。
                </div>

                <div className="rounded-md border border-wuxia-gold/20 bg-wuxia-gold/5 p-3 space-y-2">
                    <label className="flex items-center justify-between gap-3 text-xs text-gray-200">
                        <span>
                            <span className="block text-wuxia-gold font-bold">开启地图生成功能</span>
                            <span className="mt-1 block text-[11px] text-gray-400">
                                开启后，正文输出结束会加入地图更新队列；关闭后自动地图更新阶段会显示"未开启，跳过"。手动回忆解析仍可用于旧存档地图重建。
                            </span>
                        </span>
                        <ToggleSwitch
                            checked={地图生成功能开启}
                            onChange={(checked) => updatePlaceholder('地图生成功能启用', checked)}
                            ariaLabel="切换地图生成功能"
                        />
                    </label>
                </div>

                {onRegenerateMapFromMemory && (
                    <div className="rounded-md border border-wuxia-cyan/25 bg-wuxia-cyan/5 p-3 space-y-3">
                        <div>
                            <div className="text-wuxia-cyan font-bold text-xs">回忆解析</div>
                            <div className="mt-1 text-[11px] text-gray-400">
                                使用下方地图生成 API 读取当前存档回忆库，重建新版六层地图树。适合旧地图数据已清理、但回忆库仍保留地点线索的存档。
                            </div>
                        </div>
                        <GameButton
                            onClick={handleRegenerateFromMemory}
                            variant="secondary"
                            className="w-full py-2 text-xs"
                            disabled={memoryParsing}
                        >
                            {memoryParsing ? '解析中...' : '回忆解析'}
                        </GameButton>
                        {streamText && (
                            <div
                                ref={streamRef}
                                className="mt-2 max-h-48 overflow-y-auto rounded border border-wuxia-cyan/20 bg-black/40 p-2 text-[11px] text-gray-300 whitespace-pre-wrap font-mono leading-relaxed"
                            >
                                {streamText}
                            </div>
                        )}
                    </div>
                )}

                <div className="text-[11px] text-gray-400">
                    这里控制手动解析、回忆解析和旧存档重建时使用的全量地图生成接口；不单独配置时会复用主剧情模型和接口。
                </div>

                <StageApiModelSelector
                    form={form}
                    enabled={地图生成功能开启}
                    title="全量地图生成"
                    modelKey="地图生成使用模型"
                    channelKey="地图生成渠道ID"
                    baseUrlKey="地图生成API地址"
                    apiKeyKey="地图生成API密钥"
                    fallbackModel={activeConfig?.model || 主剧情解析模型}
                    disabledPlaceholder="地图生成功能未开启"
                    onChange={updatePlaceholder}
                />

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">地图生成独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.地图生成API地址 || ''}
                        onChange={(e) => updatePlaceholder('地图生成API地址', e.target.value)}
                        placeholder={activeConfig?.baseUrl || '留空则复用主剧情 Base URL'}
                        className="w-full border p-2 text-white rounded-md outline-none bg-black/50 border-gray-700 focus:border-wuxia-gold"
                    />
                    <div className="text-[11px] text-gray-500">留空则复用主剧情 Base URL。</div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">地图生成独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.地图生成API密钥 || ''}
                        onChange={(e) => updatePlaceholder('地图生成API密钥', e.target.value)}
                        placeholder={activeConfig?.apiKey ? '留空则复用主剧情 API Key' : 'sk-...'}
                        className="w-full border p-2 text-white rounded-md outline-none bg-black/50 border-gray-700 focus:border-wuxia-gold"
                    />
                    <div className="text-[11px] text-gray-500">留空则复用主剧情 API Key。</div>
                </div>

                {!mapModelValue && (
                    <div className="text-[11px] text-gray-400">
                        当前状态：复用主剧情接口（{activeConfig?.model || '未配置'}）。
                    </div>
                )}
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/25 p-4 space-y-4">
                <div className="text-wuxia-gold font-bold text-xs">正文后自动地图更新</div>
                <div className="text-[11px] text-gray-400">
                    这里控制每回合正文生成后的增量地图更新。它会读取主剧情和前面阶段产出的结果，只补本回合新增地点、人物位置和地图层级变化；关闭独立模型时跟随主剧情接口，开启独立模型后仅本阶段改用这里的渠道和模型。
                </div>

                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>开启地图自动更新独立模型</span>
                    <ToggleSwitch
                        checked={自动更新独立开启}
                        onChange={(checked) => {
                            setForm(prev => ({
                                ...prev,
                                功能模型占位: {
                                    ...prev.功能模型占位,
                                    地图自动更新独立模型开关: checked,
                                    地图自动更新使用模型: checked
                                        ? ((prev.功能模型占位.地图自动更新使用模型 || '').trim() || 主剧情解析模型 || '')
                                        : ''
                                }
                            }));
                        }}
                        disabled={!地图生成功能开启}
                        ariaLabel="切换地图自动更新独立模型"
                    />
                </label>

                <StageApiModelSelector
                    form={form}
                    enabled={地图生成功能开启 && 自动更新独立开启}
                    title="每回合地图更新"
                    modelKey="地图自动更新使用模型"
                    channelKey="地图自动更新渠道ID"
                    baseUrlKey="地图自动更新API地址"
                    apiKeyKey="地图自动更新API密钥"
                    fallbackModel={主剧情解析模型}
                    disabledPlaceholder={!地图生成功能开启 ? '地图生成功能未开启' : undefined}
                    onChange={updatePlaceholder}
                />

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">地图自动更新独立 API 地址（可选）</label>
                    <input
                        type="text"
                        value={form.功能模型占位.地图自动更新API地址 || ''}
                        onChange={(e) => updatePlaceholder('地图自动更新API地址', e.target.value)}
                        placeholder={activeConfig?.baseUrl || '留空则复用主剧情 Base URL'}
                        disabled={!地图生成功能开启 || !自动更新独立开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            地图生成功能开启 && 自动更新独立开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">地图自动更新独立 API 密钥（可选）</label>
                    <input
                        type="password"
                        value={form.功能模型占位.地图自动更新API密钥 || ''}
                        onChange={(e) => updatePlaceholder('地图自动更新API密钥', e.target.value)}
                        placeholder={activeConfig?.apiKey ? '留空则复用主剧情 API Key' : 'sk-...'}
                        disabled={!地图生成功能开启 || !自动更新独立开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${
                            地图生成功能开启 && 自动更新独立开启
                                ? 'bg-black/50 border-gray-700 focus:border-wuxia-gold'
                                : 'bg-black/30 border-gray-800 text-gray-400'
                        }`}
                    />
                </div>

                {!地图生成功能开启 ? (
                    <div className="text-[11px] text-gray-400">
                        当前状态：地图生成功能未开启，正文后自动地图更新会跳过。
                    </div>
                ) : !自动更新独立开启 && (
                    <div className="text-[11px] text-gray-400">
                        当前状态：自动地图更新跟随主剧情接口（{主剧情解析模型 || '未配置'}）。
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

export default MapModelSettings;
