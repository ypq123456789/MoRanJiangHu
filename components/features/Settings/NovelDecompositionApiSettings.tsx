import React, { useEffect, useMemo, useState } from 'react';
import { 接口设置结构, 单接口配置结构, 功能模型占位配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import {
    构建OpenAI兼容模型列表候选地址,
    规范化Gemini模型资源ID,
    规范化接口设置
} from '../../../utils/apiConfig';
import { 构建模型列表请求头 } from '../../../utils/customRequestHeaders';
import {
    解析小说拆分连接测试草稿,
    测试小说拆分接口连接,
    type 小说拆分连接测试结果
} from '../../../services/novelDecompositionApiDiagnostics';
import StageApiModelSelector from './StageApiModelSelector';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

const NovelDecompositionApiSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionResult, setConnectionResult] = useState<小说拆分连接测试结果 | null>(null);

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
        setModelOptions([]);
        setConnectionResult(null);
    }, [settings]);

    const activeConfig = useMemo<单接口配置结构 | null>(() => {
        if (!form.configs.length) return null;
        const selected = form.configs.find((cfg) => cfg.id === form.activeConfigId);
        return selected || form.configs[0] || null;
    }, [form.activeConfigId, form.configs]);

    const 主剧情解析模型 = useMemo(() => {
        return (activeConfig?.model || '').trim() || (form.功能模型占位.主剧情使用模型 || '').trim();
    }, [activeConfig?.model, form.功能模型占位.主剧情使用模型]);

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                [key]: value
            }
        }));
    };

    const 独立模型开启 = Boolean(form.功能模型占位.小说拆分独立模型开关);
    const 独立API地址 = (form.功能模型占位.小说拆分API地址 || '').trim();
    const 独立API密钥 = (form.功能模型占位.小说拆分API密钥 || '').trim();

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
                    return Array.from(new Set(data.data
                        .map((m: any) => 规范化Gemini模型资源ID(m?.id))
                        .filter(Boolean)));
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
            setMessage('小说分解模型列表获取成功。');
        }
        setLoadingModels(false);
    };

    const handleTestConnection = async () => {
        if (testingConnection) return;
        const draft = 解析小说拆分连接测试草稿(form);
        if (!draft.apiConfig) {
            setConnectionResult(draft.failure || null);
            return;
        }
        setTestingConnection(true);
        setConnectionResult(null);
        try {
            setConnectionResult(await 测试小说拆分接口连接(draft.apiConfig));
        } finally {
            setTestingConnection(false);
        }
    };

    const handleSave = () => {
        if (!(form.功能模型占位.小说拆分功能启用)) {
            const normalized = 规范化接口设置(form);
            onSave(normalized);
            setForm(normalized);
            setShowSuccess(true);
            window.setTimeout(() => setShowSuccess(false), 2000);
            return;
        }
        if (!独立模型开启) {
            setMessage('请先开启小说分解独立模型，再保存该接口配置。');
            return;
        }
        if (!(form.功能模型占位.小说拆分使用模型 || '').trim()) {
            setMessage('请先选择小说分解独立模型。');
            return;
        }
        if (!独立API地址 || !独立API密钥) {
            setMessage('请填写小说分解独立 API 地址和密钥。');
            return;
        }
        const normalized = 规范化接口设置(form);
        onSave(normalized);
        setForm(normalized);
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 2000);
    };

    const modelValue = (form.功能模型占位.小说拆分使用模型 || '').trim();
    const modelDisplay = 独立模型开启 ? modelValue : 主剧情解析模型;
    const selectOptions = Array.from(new Set([...modelOptions, modelValue, 主剧情解析模型].map((item) => (item || '').trim()).filter(Boolean)));

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3 mb-6">
                <div>
                    <h3 className="text-emerald-200 font-serif font-bold text-xl">小说分解接口</h3>
                    <div className="mt-1 text-xs text-gray-400">这里专门配置小说分解工作台使用的独立 API。首页打开小说分解前，请先完成这里的配置。</div>
                </div>
            </div>

            <div className="rounded-md border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-4">
                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>启用小说分解附加功能</span>
                    <ToggleSwitch
                        checked={Boolean(form.功能模型占位.小说拆分功能启用)}
                        onChange={(checked) => updatePlaceholder('小说拆分功能启用', checked)}
                        ariaLabel="切换小说分解附加功能"
                    />
                </label>

                <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>启用小说分解独立模型</span>
                    <ToggleSwitch
                        checked={独立模型开启}
                        onChange={(checked) => updatePlaceholder('小说拆分独立模型开关', checked)}
                        ariaLabel="切换小说分解独立模型"
                    />
                </label>

                <StageApiModelSelector
                    form={form}
                    enabled={独立模型开启}
                    title="小说分解"
                    modelKey="小说拆分使用模型"
                    channelKey="小说拆分渠道ID"
                    baseUrlKey="小说拆分API地址"
                    apiKeyKey="小说拆分API密钥"
                    fallbackModel={主剧情解析模型}
                    disabledPlaceholder={`请先开启独立模型，当前主模型：${主剧情解析模型 || '未设置'}`}
                    onChange={updatePlaceholder}
                />

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">小说分解独立 API 地址</label>
                    <input
                        type="text"
                        value={form.功能模型占位.小说拆分API地址 || ''}
                        onChange={(e) => updatePlaceholder('小说拆分API地址', e.target.value)}
                        placeholder="https://your-endpoint/v1"
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${独立模型开启 ? 'bg-black/50 border-gray-700 focus:border-emerald-400' : 'bg-black/30 border-gray-800 text-gray-400'}`}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">小说分解独立 API 密钥</label>
                    <input
                        type="password"
                        value={form.功能模型占位.小说拆分API密钥 || ''}
                        onChange={(e) => updatePlaceholder('小说拆分API密钥', e.target.value)}
                        placeholder="sk-..."
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${独立模型开启 ? 'bg-black/50 border-gray-700 focus:border-emerald-400' : 'bg-black/30 border-gray-800 text-gray-400'}`}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-300">小说分解 RPM 限制</label>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={form.功能模型占位.小说拆分RPM限制}
                        onChange={(e) => updatePlaceholder('小说拆分RPM限制', Math.max(1, Number(e.target.value) || 10))}
                        disabled={!独立模型开启}
                        className={`w-full border p-2 text-white rounded-md outline-none ${独立模型开启 ? 'bg-black/50 border-gray-700 focus:border-emerald-400' : 'bg-black/30 border-gray-800 text-gray-400'}`}
                    />
                    <div className="text-[11px] text-gray-500 leading-6">
                        每分钟最多允许多少次小说分解请求。默认 10 RPM，后台拆分与手动开始任务都会按这个速率自动限流。
                    </div>
                </div>

                <div className="rounded border border-amber-500/20 bg-amber-950/10 px-3 py-3 text-[11px] leading-6 text-amber-100">
                    首页“小说分解”入口现在会优先要求这里完成独立 API 配置。建议使用独立模型，避免长篇拆分任务占用主剧情接口。
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <GameButton
                        onClick={() => { void handleFetchModels(); }}
                        variant="secondary"
                        className="px-4 py-2 text-xs"
                        disabled={loadingModels || !独立模型开启}
                    >
                        {loadingModels ? '刷新中...' : '刷新模型列表'}
                    </GameButton>
                    <GameButton
                        onClick={() => { void handleTestConnection(); }}
                        variant="primary"
                        className={`px-4 py-2 text-xs ${testingConnection ? '!bg-amber-100/85 !text-amber-950 !border-amber-500' : ''}`}
                        disabled={testingConnection || !独立模型开启}
                    >
                        {testingConnection ? '测试中...' : '测试连接'}
                    </GameButton>
                </div>

                <div
                    className={`novel-api-connection-result min-h-12 whitespace-pre-wrap break-words rounded border px-3 py-2 text-xs leading-6 ${connectionResult?.ok
                        ? 'border-emerald-500/30 bg-emerald-950/15 text-emerald-100'
                        : 'border-amber-500/25 bg-amber-950/10 text-amber-100'}`}
                    aria-live="polite"
                >
                    {connectionResult
                        ? `${connectionResult.identity}\n${connectionResult.ok ? '测试成功' : '测试失败'}：${connectionResult.detail}`
                        : '连接测试结果会在这里显示，并明确标注当前渠道与模型。'}
                </div>
            </div>

            {message && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-950/10 px-3 py-2 text-xs text-emerald-100">
                    {message}
                </div>
            )}

            <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-gray-500">
                    {showSuccess ? '小说分解接口配置已保存。' : '保存后，首页入口会使用这里的独立 API。'}
                </div>
                <GameButton onClick={handleSave} variant="primary" className="px-6 py-2 text-xs">
                    保存小说分解接口
                </GameButton>
            </div>
        </div>
    );
};

export default NovelDecompositionApiSettings;
