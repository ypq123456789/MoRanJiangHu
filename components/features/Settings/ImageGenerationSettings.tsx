import React, { useEffect, useMemo, useState } from 'react';
import {
    接口设置结构,
    功能模型占位配置结构,
    单接口配置结构,
    画师串预设结构,
    词组转化器提示词预设结构,
    PNG画风预设结构
} from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import { 规范化接口设置 } from '../../../utils/apiConfig';
import { 自动场景横屏尺寸选项, 自动场景竖屏尺寸选项 } from '../../../utils/imageSizeOptions';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

type 生图模型字段 = '文生图模型使用模型' | '场景生图模型使用模型' | '词组转化器使用模型' | 'PNG提炼使用模型';
type 设置分页 = 'basic' | 'backend' | 'provider' | 'transformer' | 'presets' | 'automation';
type 画师串适用页签 = 'npc' | 'scene';
type 词组预设页签 = 'nai' | 'npc' | 'scene';

const 初始化模型列表 = (): Record<生图模型字段, string[]> => ({
    文生图模型使用模型: [],
    场景生图模型使用模型: [],
    词组转化器使用模型: [],
    PNG提炼使用模型: []
});

const 初始化加载状态 = (): Record<生图模型字段, boolean> => ({
    文生图模型使用模型: false,
    场景生图模型使用模型: false,
    词组转化器使用模型: false,
    PNG提炼使用模型: false
});

const 基础页面选项: Array<{ value: 设置分页; label: string }> = [
    { value: 'basic', label: '基础' },
    { value: 'backend', label: '接口' },
    { value: 'provider', label: '后端设置' },
    { value: 'transformer', label: '转化器' },
    { value: 'automation', label: '自动任务' }
];

const 文生图后端选项: Array<{ value: 功能模型占位配置结构['文生图后端类型']; label: string }> = [
    { value: 'openai', label: 'OpenAI 兼容' },
    { value: 'novelai', label: 'NovelAI 官方' },
    { value: 'sd_webui', label: 'Stable Diffusion WebUI' },
    { value: 'comfyui', label: 'ComfyUI' }
];

const 接口路径模式选项: Array<{ value: 功能模型占位配置结构['文生图接口路径模式']; label: string }> = [
    { value: 'preset', label: '预设路径' },
    { value: 'custom', label: '自定义路径' }
];

const 预设路径选项映射: Record<功能模型占位配置结构['文生图后端类型'], Array<{
    value: 功能模型占位配置结构['文生图预设接口路径'];
    label: string;
}>> = {
    openai: [
        { value: 'openai_images', label: '/v1/images/generations' },
        { value: 'openai_chat', label: '/v1/chat/completions' }
    ],
    novelai: [
        { value: 'novelai_generate', label: '/ai/generate-image' }
    ],
    sd_webui: [
        { value: 'sd_txt2img', label: '/sdapi/v1/txt2img' }
    ],
    comfyui: [
        { value: 'comfyui_prompt', label: '/prompt' }
    ]
};

const NovelAI模型建议 = ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full'];
const NovelAI采样器选项: Array<{ value: 功能模型占位配置结构['NovelAI采样器']; label: string }> = [
    { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
    { value: 'k_euler', label: 'Euler' },
    { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
    { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
    { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
    { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' }
];
const NovelAI噪点表选项: Array<{ value: 功能模型占位配置结构['NovelAI噪点表']; label: string }> = [
    { value: 'karras', label: 'Karras' },
    { value: 'native', label: 'Native' },
    { value: 'exponential', label: 'Exponential' },
    { value: 'polyexponential', label: 'Polyexponential' }
];

const 获取后端设置标签 = (backend: 功能模型占位配置结构['文生图后端类型']): string => {
    switch (backend) {
        case 'sd_webui':
            return 'WebUI 设置';
        case 'comfyui':
            return 'ComfyUI 设置';
        case 'novelai':
            return 'NovelAI 设置';
        case 'openai':
        default:
            return '后端设置';
    }
};

const 图片后端需要模型选择 = (backend: 功能模型占位配置结构['文生图后端类型']): boolean => {
    return backend === 'openai' || backend === 'novelai';
};

const 图片后端需要鉴权 = (backend: 功能模型占位配置结构['文生图后端类型']): boolean => {
    return backend === 'openai' || backend === 'novelai';
};

const ComfyUI工作流占位提示 = '__PROMPT__ / {{prompt}}，__NEGATIVE_PROMPT__ / {{negative_prompt}}，__WIDTH__ / {{width}}，__HEIGHT__ / {{height}}，__STEPS__ / {{steps}}，__CFG__ / {{cfg}}，__CFG_RESCALE__ / {{cfg_rescale}}，__SAMPLER__ / {{sampler}}，__SCHEDULER__ / {{scheduler}}，__SEED__ / {{seed}}，__SMEA__ / {{smea}}，__SMEA_DYN__ / {{smea_dyn}}';

const 页面容器样式 = 'rounded-2xl border border-fuchsia-500/20 bg-black/25 p-5 space-y-5';
const 卡片样式 = 'rounded-xl border border-white/10 bg-black/20 p-4 space-y-4';
const 标签样式 = 'text-sm font-bold text-fuchsia-200';
const 生成预设ID = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 创建空画师串预设 = (scope: 画师串适用页签): 画师串预设结构 => {
    const now = Date.now();
    return {
        id: 生成预设ID('artist_preset'),
        名称: scope === 'scene' ? '新建场景画师串' : '新建NPC画师串',
        适用范围: scope,
        画师串: '',
        正面提示词: '',
        负面提示词: '',
        createdAt: now,
        updatedAt: now
    };
};
const 创建空词组预设 = (scope: 词组预设页签): 词组转化器提示词预设结构 => {
    const now = Date.now();
    return {
        id: 生成预设ID('transformer_preset'),
        名称: scope === 'nai' ? '新建NAI提示词' : scope === 'scene' ? '新建场景提示词' : '新建NPC提示词',
        类型: scope,
        提示词: '',
        createdAt: now,
        updatedAt: now
    };
};

const ImageGenerationSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
    const [modelOptions, setModelOptions] = useState<Record<生图模型字段, string[]>>(初始化模型列表);
    const [modelLoading, setModelLoading] = useState<Record<生图模型字段, boolean>>(初始化加载状态);
    const [activePage, setActivePage] = useState<设置分页>('basic');
    const [artistPresetScope, setArtistPresetScope] = useState<画师串适用页签>('npc');
    const [transformerPresetScope, setTransformerPresetScope] = useState<词组预设页签>('nai');
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const artistImportRef = React.useRef<HTMLInputElement | null>(null);
    const transformerImportRef = React.useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
        setSelectedConfigId(normalized.activeConfigId || normalized.configs[0]?.id || null);
        setModelOptions(初始化模型列表());
        setModelLoading(初始化加载状态());
        setActivePage('basic');
        setArtistPresetScope('npc');
        setTransformerPresetScope('nai');
    }, [settings]);

    const activeConfig = useMemo<单接口配置结构 | null>(() => {
        if (!form.configs.length) return null;
        return form.configs.find((cfg) => cfg.id === selectedConfigId) || form.configs[0] || null;
    }, [form.configs, selectedConfigId]);

    const 主剧情解析模型 = useMemo(() => {
        return (activeConfig?.model || '').trim() || (form.功能模型占位.主剧情使用模型 || '').trim();
    }, [activeConfig?.model, form.功能模型占位.主剧情使用模型]);

    const 当前后端 = form.功能模型占位.文生图后端类型;
    const 当前场景后端 = form.功能模型占位.场景生图独立接口启用
        ? form.功能模型占位.场景生图后端类型
        : 当前后端;
    const 当前预设路径选项 = 预设路径选项映射[当前后端];
    const 当前预设路径值集合 = new Set(当前预设路径选项.map((item) => item.value));
    const 当前预设路径 = 当前预设路径值集合.has(form.功能模型占位.文生图预设接口路径)
        ? form.功能模型占位.文生图预设接口路径
        : 当前预设路径选项[0]?.value || 'openai_images';
    const 文生图模型选项 = Array.from(new Set(
        (当前后端 === 'novelai' ? NovelAI模型建议 : [])
            .concat(modelOptions.文生图模型使用模型, form.功能模型占位.文生图模型使用模型)
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));
    const 词组转化器模型选项 = Array.from(new Set(
        modelOptions.词组转化器使用模型
            .concat(form.功能模型占位.词组转化器使用模型, 主剧情解析模型)
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));
    const PNG提炼模型选项 = Array.from(new Set(
        modelOptions.PNG提炼使用模型
            .concat(form.功能模型占位.PNG提炼使用模型, 主剧情解析模型)
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));
    const 场景文生图模型选项 = Array.from(new Set(
        (当前场景后端 === 'novelai' ? NovelAI模型建议 : [])
            .concat(modelOptions.场景生图模型使用模型, form.功能模型占位.场景生图模型使用模型, form.功能模型占位.文生图模型使用模型)
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));
    const 可见页面 = useMemo(() => 基础页面选项.map((item) => (
        item.value === 'provider'
            ? { ...item, label: 获取后端设置标签(当前后端) }
            : item
    )), [当前后端]);
    const 是否强制启用词组转化器 = 当前后端 === 'novelai';
    const artistPresets = useMemo(
        () => (Array.isArray(form.功能模型占位.画师串预设列表) ? form.功能模型占位.画师串预设列表 : [])
            .filter((item) => item && typeof item.id === 'string' && !item.id.startsWith('png_artist_')),
        [form.功能模型占位.画师串预设列表]
    );
    const scopedArtistPresets = useMemo(() => artistPresets.filter((item) => item.适用范围 === artistPresetScope || item.适用范围 === 'all'), [artistPresets, artistPresetScope]);
    const currentArtistPresetId = artistPresetScope === 'scene'
        ? form.功能模型占位.当前场景画师串预设ID
        : form.功能模型占位.当前NPC画师串预设ID;
    const pngStylePresets = useMemo<PNG画风预设结构[]>(
        () => Array.isArray(form.功能模型占位.PNG画风预设列表) ? form.功能模型占位.PNG画风预设列表 : [],
        [form.功能模型占位.PNG画风预设列表]
    );
    const currentAutoPngPresetId = artistPresetScope === 'scene'
        ? form.功能模型占位.当前场景PNG画风预设ID
        : form.功能模型占位.当前NPCPNG画风预设ID;
    const selectedArtistPreset = scopedArtistPresets.find((item) => item.id === currentArtistPresetId)
        || scopedArtistPresets[0]
        || null;
    const transformerPresets = useMemo(() => Array.isArray(form.功能模型占位.词组转化器提示词预设列表) ? form.功能模型占位.词组转化器提示词预设列表 : [], [form.功能模型占位.词组转化器提示词预设列表]);
    const scopedTransformerPresets = useMemo(() => transformerPresets.filter((item) => item.类型 === transformerPresetScope), [transformerPresets, transformerPresetScope]);
    const currentTransformerPresetId = transformerPresetScope === 'nai'
        ? form.功能模型占位.当前NAI词组转化器提示词预设ID
        : transformerPresetScope === 'scene'
            ? form.功能模型占位.当前场景词组转化器提示词预设ID
            : form.功能模型占位.当前NPC词组转化器提示词预设ID;
    const selectedTransformerPreset = scopedTransformerPresets.find((item) => item.id === currentTransformerPresetId)
        || scopedTransformerPresets[0]
        || null;

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                [key]: value
            }
        }));
    };

    const 更新当前画师串预设ID = (scope: 画师串适用页签, presetId: string) => {
        updatePlaceholder(scope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID', presetId);
    };

    const 更新当前PNG预设ID = (scope: 画师串适用页签, presetId: string) => {
        updatePlaceholder(scope === 'scene' ? '当前场景PNG画风预设ID' : '当前NPCPNG画风预设ID', presetId);
    };

    const 更新当前词组预设ID = (scope: 词组预设页签, presetId: string) => {
        if (scope === 'nai') {
            updatePlaceholder('当前NAI词组转化器提示词预设ID', presetId);
            return;
        }
        if (scope === 'scene') {
            updatePlaceholder('当前场景词组转化器提示词预设ID', presetId);
            return;
        }
        updatePlaceholder('当前NPC词组转化器提示词预设ID', presetId);
    };

    const updateArtistPreset = (presetId: string, updater: (preset: 画师串预设结构) => 画师串预设结构) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                画师串预设列表: (Array.isArray(prev.功能模型占位.画师串预设列表) ? prev.功能模型占位.画师串预设列表 : []).map((preset) => (
                    preset.id === presetId ? updater(preset) : preset
                ))
            }
        }));
    };

    const updateTransformerPreset = (presetId: string, updater: (preset: 词组转化器提示词预设结构) => 词组转化器提示词预设结构) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                词组转化器提示词预设列表: (Array.isArray(prev.功能模型占位.词组转化器提示词预设列表) ? prev.功能模型占位.词组转化器提示词预设列表 : []).map((preset) => (
                    preset.id === presetId ? updater(preset) : preset
                ))
            }
        }));
    };

    const handleAddArtistPreset = () => {
        const nextPreset = 创建空画师串预设(artistPresetScope);
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                画师串预设列表: [...(Array.isArray(prev.功能模型占位.画师串预设列表) ? prev.功能模型占位.画师串预设列表 : []), nextPreset],
                当前NPC画师串预设ID: artistPresetScope === 'npc' ? nextPreset.id : prev.功能模型占位.当前NPC画师串预设ID,
                当前场景画师串预设ID: artistPresetScope === 'scene' ? nextPreset.id : prev.功能模型占位.当前场景画师串预设ID
            }
        }));
    };

    const handleDeleteArtistPreset = () => {
        if (!selectedArtistPreset) return;
        const remaining = artistPresets.filter((item) => item.id !== selectedArtistPreset.id);
        const nextNpcId = form.功能模型占位.当前NPC画师串预设ID === selectedArtistPreset.id
            ? (remaining.find((item) => item.适用范围 === 'npc' || item.适用范围 === 'all')?.id || '')
            : form.功能模型占位.当前NPC画师串预设ID;
        const nextSceneId = form.功能模型占位.当前场景画师串预设ID === selectedArtistPreset.id
            ? (remaining.find((item) => item.适用范围 === 'scene' || item.适用范围 === 'all')?.id || '')
            : form.功能模型占位.当前场景画师串预设ID;
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                画师串预设列表: remaining,
                当前NPC画师串预设ID: nextNpcId,
                当前场景画师串预设ID: nextSceneId
            }
        }));
    };

    const handleAddTransformerPreset = () => {
        const nextPreset = 创建空词组预设(transformerPresetScope);
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                词组转化器提示词预设列表: [...(Array.isArray(prev.功能模型占位.词组转化器提示词预设列表) ? prev.功能模型占位.词组转化器提示词预设列表 : []), nextPreset],
                当前NAI词组转化器提示词预设ID: transformerPresetScope === 'nai' ? nextPreset.id : prev.功能模型占位.当前NAI词组转化器提示词预设ID,
                当前NPC词组转化器提示词预设ID: transformerPresetScope === 'npc' ? nextPreset.id : prev.功能模型占位.当前NPC词组转化器提示词预设ID,
                当前场景词组转化器提示词预设ID: transformerPresetScope === 'scene' ? nextPreset.id : prev.功能模型占位.当前场景词组转化器提示词预设ID
            }
        }));
    };

    const handleDeleteTransformerPreset = () => {
        if (!selectedTransformerPreset) return;
        const remaining = transformerPresets.filter((item) => item.id !== selectedTransformerPreset.id);
        const nextByScope = (scope: 词组预设页签) => remaining.find((item) => item.类型 === scope)?.id || '';
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                词组转化器提示词预设列表: remaining,
                当前NAI词组转化器提示词预设ID: prev.功能模型占位.当前NAI词组转化器提示词预设ID === selectedTransformerPreset.id ? nextByScope('nai') : prev.功能模型占位.当前NAI词组转化器提示词预设ID,
                当前NPC词组转化器提示词预设ID: prev.功能模型占位.当前NPC词组转化器提示词预设ID === selectedTransformerPreset.id ? nextByScope('npc') : prev.功能模型占位.当前NPC词组转化器提示词预设ID,
                当前场景词组转化器提示词预设ID: prev.功能模型占位.当前场景词组转化器提示词预设ID === selectedTransformerPreset.id ? nextByScope('scene') : prev.功能模型占位.当前场景词组转化器提示词预设ID
            }
        }));
    };

    const 导出JSON文件 = (filename: string, payload: unknown) => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const 读取JSON文件 = async (file: File): Promise<any> => {
        const text = await file.text();
        return JSON.parse(text);
    };

    const handleBackendChange = (value: 功能模型占位配置结构['文生图后端类型']) => {
        const fallbackPreset = 预设路径选项映射[value][0]?.value || 'openai_images';
        setForm((prev) => ({
            ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    文生图后端类型: value,
                    文生图预设接口路径: fallbackPreset,
                    NPC生图使用词组转化器: value === 'novelai' ? true : prev.功能模型占位.NPC生图使用词组转化器,
                    文生图模型API地址: value === 'novelai' && !prev.功能模型占位.文生图模型API地址.trim()
                        ? 'https://image.novelai.net'
                        : prev.功能模型占位.文生图模型API地址,
                文生图OpenAI自定义格式: value === 'openai' ? prev.功能模型占位.文生图OpenAI自定义格式 : false,
                文生图响应格式: value === 'openai' ? prev.功能模型占位.文生图响应格式 : 'url'
            }
        }));
        if (activePage === 'provider') setActivePage('provider');
    };

    const handleToggleTransformerIndependent = (checked: boolean) => {
        setForm((prev) => {
            const currentModel = (prev.功能模型占位.词组转化器使用模型 || '').trim();
            return {
                ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    词组转化器启用独立模型: checked,
                    词组转化器使用模型: checked ? (currentModel || 主剧情解析模型 || '') : ''
                }
            };
        });
    };

    const handleToggleSceneMode = (checked: boolean) => {
        setForm((prev) => {
            const currentModel = (prev.功能模型占位.词组转化器使用模型 || '').trim();
            return {
                ...prev,
                功能模型占位: {
                    ...prev.功能模型占位,
                    场景生图启用: checked,
                    词组转化器启用独立模型: checked ? true : prev.功能模型占位.词组转化器启用独立模型,
                    词组转化器使用模型: checked
                        ? (currentModel || 主剧情解析模型 || '')
                        : prev.功能模型占位.词组转化器使用模型
                }
            };
        });
    };

    const handleToggleSceneIndependentImageApi = (checked: boolean) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                场景生图独立接口启用: checked,
                场景生图后端类型: checked
                    ? prev.功能模型占位.场景生图后端类型
                    : prev.功能模型占位.场景生图后端类型,
                场景生图模型使用模型: checked
                    ? ((prev.功能模型占位.场景生图模型使用模型 || '').trim() || (prev.功能模型占位.文生图模型使用模型 || '').trim())
                    : prev.功能模型占位.场景生图模型使用模型,
                场景生图模型API地址: checked
                    ? ((prev.功能模型占位.场景生图模型API地址 || '').trim() || (prev.功能模型占位.文生图模型API地址 || '').trim())
                    : prev.功能模型占位.场景生图模型API地址,
                场景生图模型API密钥: checked
                    ? ((prev.功能模型占位.场景生图模型API密钥 || '').trim() || (prev.功能模型占位.文生图模型API密钥 || '').trim())
                    : prev.功能模型占位.场景生图模型API密钥
            }
        }));
    };

    const fetchModelsFromCurrentConfig = async (key: 生图模型字段): Promise<string[] | null> => {
        const feature = form.功能模型占位;
        const sceneBackend = feature.场景生图独立接口启用 ? feature.场景生图后端类型 : feature.文生图后端类型;
        const targetBackend = key === '文生图模型使用模型'
            ? feature.文生图后端类型
            : key === '场景生图模型使用模型'
                ? sceneBackend
                : feature.文生图后端类型;
        const customBaseUrl = key === '文生图模型使用模型'
            ? (feature.文生图模型API地址 || '').trim()
            : key === '场景生图模型使用模型'
                ? ((feature.场景生图独立接口启用 ? feature.场景生图模型API地址 : feature.文生图模型API地址) || '').trim()
                : key === 'PNG提炼使用模型'
                    ? ((feature.PNG提炼启用独立模型 ? feature.PNG提炼API地址 : '') || '').trim()
                    : ((feature.词组转化器启用独立模型 ? feature.词组转化器API地址 : '') || '').trim();
        const customApiKey = key === '文生图模型使用模型'
            ? (feature.文生图模型API密钥 || '').trim()
            : key === '场景生图模型使用模型'
                ? ((feature.场景生图独立接口启用 ? feature.场景生图模型API密钥 : feature.文生图模型API密钥) || '').trim()
                : key === 'PNG提炼使用模型'
                    ? ((feature.PNG提炼启用独立模型 ? feature.PNG提炼API密钥 : '') || '').trim()
                    : ((feature.词组转化器启用独立模型 ? feature.词组转化器API密钥 : '') || '').trim();
        const canReuseMainConnection = key !== '场景生图模型使用模型' || !feature.场景生图独立接口启用 || sceneBackend === feature.文生图后端类型;
        const resolvedBaseUrl = customBaseUrl || (canReuseMainConnection ? (activeConfig?.baseUrl || '').trim() : '');
        const resolvedApiKey = customApiKey || (canReuseMainConnection ? (activeConfig?.apiKey || '').trim() : '');
        const targetNeedsModel = key === '词组转化器使用模型' || key === 'PNG提炼使用模型'
            ? true
            : 图片后端需要模型选择(targetBackend);
        const targetNeedsAuth = key === '词组转化器使用模型' || key === 'PNG提炼使用模型'
            ? true
            : 图片后端需要鉴权(targetBackend);

        if (!targetNeedsModel) {
            setMessage(`${文生图后端选项.find((item) => item.value === targetBackend)?.label || '当前后端'}不需要模型选择，也不提供模型列表。`);
            return null;
        }
        if (!resolvedBaseUrl || (targetNeedsAuth && !resolvedApiKey)) {
            setMessage(key === 'PNG提炼使用模型'
                ? '请先填写 PNG 提炼 API 地址与 API Key。'
                : (targetBackend === 'novelai' ? '请先填写 API 地址与 Persistent API Token。' : '请先填写 API 地址与 API Key。'));
            return null;
        }
        try {
            if (targetBackend === 'novelai' && (key === '文生图模型使用模型' || key === '场景生图模型使用模型')) return NovelAI模型建议;
            const base = resolvedBaseUrl.replace(/\/+$/, '');
            const normalized = base.replace(/\/v1$/i, '');
            const candidateUrls = Array.from(new Set([
                `${normalized}/v1/models`,
                `${normalized}/models`,
                `${base}/models`
            ]));
            for (const url of candidateUrls) {
                const res = await fetch(url, {
                    headers: targetNeedsAuth ? { Authorization: `Bearer ${resolvedApiKey}` } : undefined
                });
                if (!res.ok) continue;
                const data = await res.json();
                if (data && Array.isArray(data.data)) {
                    return data.data.map((m: any) => m?.id).filter(Boolean);
                }
            }
            setMessage(`获取模型列表失败：${resolvedBaseUrl}`);
            return null;
        } catch (e: any) {
            setMessage(`获取模型列表失败：${e.message}`);
            return null;
        }
    };

    const handleFetchModels = async (key: 生图模型字段, label: string) => {
        setModelLoading((prev) => ({ ...prev, [key]: true }));
        setMessage('');
        const result = await fetchModelsFromCurrentConfig(key);
        if (result) {
            setModelOptions((prev) => ({ ...prev, [key]: result }));
            setMessage(`${label}获取成功`);
        }
        setModelLoading((prev) => ({ ...prev, [key]: false }));
    };

    const handleExportArtistPresets = () => {
        导出JSON文件('artist-presets.json', {
            version: 1,
            type: 'artist_prompt_presets',
            presets: artistPresets
        });
        setMessage('画师串预设已导出。');
    };

    const handleExportTransformerPresets = () => {
        导出JSON文件('transformer-presets.json', {
            version: 1,
            type: 'transformer_prompt_presets',
            presets: transformerPresets
        });
        setMessage('词组转化器预设已导出。');
    };

    const handleImportArtistPresets = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const parsed = await 读取JSON文件(file);
            const presets = Array.isArray(parsed?.presets) ? parsed.presets : [];
            const normalized = 规范化接口设置({
                ...form,
                功能模型占位: {
                    ...form.功能模型占位,
                    画师串预设列表: presets
                }
            });
            setForm(normalized);
            setMessage(`已导入 ${normalized.功能模型占位.画师串预设列表.length} 条画师串预设。`);
        } catch (error: any) {
            setMessage(`导入画师串预设失败：${error?.message || '文件格式错误'}`);
        } finally {
            event.target.value = '';
        }
    };

    const handleImportTransformerPresets = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const parsed = await 读取JSON文件(file);
            const presets = Array.isArray(parsed?.presets) ? parsed.presets : [];
            const normalized = 规范化接口设置({
                ...form,
                功能模型占位: {
                    ...form.功能模型占位,
                    词组转化器提示词预设列表: presets
                }
            });
            setForm(normalized);
            setMessage(`已导入 ${normalized.功能模型占位.词组转化器提示词预设列表.length} 条词组转化器预设。`);
        } catch (error: any) {
            setMessage(`导入词组转化器预设失败：${error?.message || '文件格式错误'}`);
        } finally {
            event.target.value = '';
        }
    };

    const handleSave = () => {
        const normalized = 规范化接口设置({
            ...form,
            activeConfigId: selectedConfigId || form.activeConfigId,
            功能模型占位: {
                ...form.功能模型占位,
                词组转化器提示词: '',
                NPC生图使用词组转化器: 当前后端 === 'novelai' ? true : form.功能模型占位.NPC生图使用词组转化器
            }
        });
        onSave(normalized);
        setForm(normalized);
        setSelectedConfigId(normalized.activeConfigId || normalized.configs[0]?.id || null);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const renderBasicPage = () => (
        <div className={页面容器样式}>
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className={卡片样式}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-bold text-fuchsia-200">文生图总开关</div>
                        </div>
                        <ToggleSwitch
                            checked={form.功能模型占位.文生图功能启用}
                            onChange={(next) => updatePlaceholder('文生图功能启用', next)}
                            ariaLabel="切换文生图总开关"
                        />
                    </div>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                    <div className="text-base font-bold text-emerald-200">当前后端</div>
                    <div className="mt-2 text-xl font-serif text-white">{文生图后端选项.find((item) => item.value === 当前后端)?.label || '未选择'}</div>
                </div>
            </div>

        </div>
    );

    const renderBackendPage = () => (
        <div className={页面容器样式}>
            <div className={卡片样式}>
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                        <label className={标签样式}>后端类型</label>
                        <InlineSelect
                            value={当前后端}
                            options={文生图后端选项}
                            onChange={(value) => handleBackendChange(value as 功能模型占位配置结构['文生图后端类型'])}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                    <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 px-4 py-3 text-sm text-white">{文生图后端选项.find((item) => item.value === 当前后端)?.label}</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className={标签样式}>API 地址</label>
                        <input
                            type="text"
                            value={form.功能模型占位.文生图模型API地址}
                            onChange={(e) => updatePlaceholder('文生图模型API地址', e.target.value)}
                            placeholder={当前后端 === 'novelai'
                                ? 'https://image.novelai.net'
                                : 当前后端 === 'sd_webui'
                                    ? '例如：http://127.0.0.1:7860'
                                    : 当前后端 === 'comfyui'
                                        ? '例如：http://127.0.0.1:8188'
                                        : 'https://api.openai.com/v1'}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className={标签样式}>{当前后端 === 'novelai' ? 'Persistent API Token' : 'API Key'}</label>
                        <input
                            type="password"
                            value={form.功能模型占位.文生图模型API密钥}
                            onChange={(e) => updatePlaceholder('文生图模型API密钥', e.target.value)}
                            placeholder={当前后端 === 'novelai'
                                ? '在 NovelAI 账户设置中生成 Persistent API Token'
                                : 当前后端 === 'sd_webui' || 当前后端 === 'comfyui'
                                    ? '可留空；默认不会发送 Authorization'
                                    : '留空则回退当前接口配置'}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400"
                        />
                    </div>
                </div>
            </div>

        </div>
    );

    const renderProviderPage = () => (
        <div className={页面容器样式}>
            <div className={卡片样式}>
                {图片后端需要模型选择(当前后端) ? (
                    <>
                        <div className="flex flex-col gap-3 md:flex-row md:items-end">
                            <div className="flex-1 space-y-2">
                                <label className={标签样式}>模型名称</label>
                                <InlineSelect
                                    value={form.功能模型占位.文生图模型使用模型}
                                    options={文生图模型选项.map((model) => ({ value: model, label: model }))}
                                    onChange={(model) => updatePlaceholder('文生图模型使用模型', model)}
                                    placeholder="请选择或输入模型名"
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                    panelClassName="max-w-full"
                                />
                            </div>
                            <GameButton
                                onClick={() => handleFetchModels('文生图模型使用模型', '文生图模型列表')}
                                variant="secondary"
                                className="px-4 py-2 text-xs md:min-w-[96px]"
                                disabled={modelLoading.文生图模型使用模型}
                            >
                                {modelLoading.文生图模型使用模型 ? '...' : '获取列表'}
                            </GameButton>
                        </div>
                        <input
                            type="text"
                            value={form.功能模型占位.文生图模型使用模型}
                            onChange={(e) => updatePlaceholder('文生图模型使用模型', e.target.value)}
                            placeholder="例如：gpt-image-1 / nai-diffusion-4-5-full"
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400"
                        />
                    </>
                ) : (
                    <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-sm text-sky-100">
                        当前后端直接调用固定生图接口，不需要选择模型名称。
                    </div>
                )}
            </div>

            <div className={卡片样式}>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className={标签样式}>接口路径模式</label>
                        <InlineSelect
                            value={form.功能模型占位.文生图接口路径模式}
                            options={接口路径模式选项}
                            onChange={(value) => updatePlaceholder('文生图接口路径模式', value as 功能模型占位配置结构['文生图接口路径模式'])}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">{activeConfig?.名称 || '未选择接口配置'}</div>
                </div>

                {form.功能模型占位.文生图接口路径模式 === 'preset' ? (
                    <div className="space-y-2">
                        <label className={标签样式}>预设路径</label>
                        <InlineSelect
                            value={当前预设路径}
                            options={当前预设路径选项.map((item) => ({ value: item.value, label: item.label }))}
                            onChange={(value) => updatePlaceholder('文生图预设接口路径', value as 功能模型占位配置结构['文生图预设接口路径'])}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className={标签样式}>自定义接口路径</label>
                        <input
                            type="text"
                            value={form.功能模型占位.文生图接口路径}
                            onChange={(e) => updatePlaceholder('文生图接口路径', e.target.value)}
                            placeholder={当前后端 === 'novelai'
                                ? '/ai/generate-image'
                                : 当前后端 === 'sd_webui'
                                    ? '/sdapi/v1/txt2img'
                                    : 当前后端 === 'comfyui'
                                        ? '/prompt'
                                        : '/v1/images/generations'}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400"
                        />
                    </div>
                )}
            </div>

            {当前后端 === 'openai' && (
                <div className={卡片样式}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className={标签样式}>图片响应格式</label>
                            <InlineSelect
                                value={form.功能模型占位.文生图响应格式}
                                options={[
                                    { value: 'url', label: 'URL' },
                                    { value: 'b64_json', label: 'Base64 / b64_json' }
                                ]}
                                onChange={(value) => updatePlaceholder('文生图响应格式', value as 功能模型占位配置结构['文生图响应格式'])}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-3">
                            <div className="text-sm font-bold text-fuchsia-200">OpenAI 兼容图片请求体</div>
                            <ToggleSwitch
                                checked={form.功能模型占位.文生图OpenAI自定义格式}
                                onChange={(next) => updatePlaceholder('文生图OpenAI自定义格式', next)}
                                ariaLabel="切换 OpenAI 图片请求体"
                            />
                        </div>
                    </div>
                </div>
            )}

            {当前后端 === 'novelai' && (
                <div className="rounded-2xl border border-emerald-500/25 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_55%),rgba(1,10,16,0.7)] p-5 space-y-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-bold text-emerald-200">NovelAI 自定义参数</div>
                        <ToggleSwitch
                            checked={form.功能模型占位.NovelAI启用自定义参数}
                            onChange={(next) => updatePlaceholder('NovelAI启用自定义参数', next)}
                            ariaLabel="切换 NovelAI 自定义参数"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-emerald-200">采样方法</label>
                            <InlineSelect
                                value={form.功能模型占位.NovelAI采样器}
                                options={NovelAI采样器选项}
                                onChange={(value) => updatePlaceholder('NovelAI采样器', value as 功能模型占位配置结构['NovelAI采样器'])}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                disabled={!form.功能模型占位.NovelAI启用自定义参数}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-emerald-200">噪点表</label>
                            <InlineSelect
                                value={form.功能模型占位.NovelAI噪点表}
                                options={NovelAI噪点表选项}
                                onChange={(value) => updatePlaceholder('NovelAI噪点表', value as 功能模型占位配置结构['NovelAI噪点表'])}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                disabled={!form.功能模型占位.NovelAI启用自定义参数}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-emerald-200">步数</label>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={form.功能模型占位.NovelAI步数}
                                onChange={(e) => updatePlaceholder('NovelAI步数', Math.max(1, Math.min(50, Number(e.target.value) || 28)))}
                                disabled={!form.功能模型占位.NovelAI启用自定义参数}
                                className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-emerald-200">负面提示词</label>
                        <textarea
                            value={form.功能模型占位.NovelAI负面提示词}
                            onChange={(e) => updatePlaceholder('NovelAI负面提示词', e.target.value)}
                            rows={6}
                            disabled={!form.功能模型占位.NovelAI启用自定义参数}
                            placeholder="例如：lowres, bad anatomy, text, watermark"
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-emerald-400 resize-y disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>
            )}

            {当前后端 === 'comfyui' && (
                <div className={卡片样式}>
                    <div className="space-y-2">
                        <label className={标签样式}>ComfyUI Workflow JSON</label>
                        <textarea
                            value={form.功能模型占位.ComfyUI工作流JSON}
                            onChange={(e) => updatePlaceholder('ComfyUI工作流JSON', e.target.value)}
                            rows={14}
                            placeholder={'粘贴从 ComfyUI 导出的 API workflow JSON。\n可用占位符：__PROMPT__、__NEGATIVE_PROMPT__、__WIDTH__、__HEIGHT__'}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 font-mono text-white outline-none transition-all focus:border-fuchsia-400 resize-y"
                        />
                    </div>
                    <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-xs leading-6 text-sky-100">
                        纯原生 ComfyUI 需要 workflow JSON，提交到 <code>/prompt</code> 后再轮询 <code>/history/&#123;prompt_id&#125;</code>。
                        支持占位符：{ComfyUI工作流占位提示}
                    </div>
                </div>
            )}
        </div>
    );

    const renderTransformerPage = () => (
        <div className={页面容器样式}>
            <div className={卡片样式}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-cyan-200">NPC 生图使用词组转化器</div>
                    </div>
                    <ToggleSwitch
                        checked={是否强制启用词组转化器 ? true : form.功能模型占位.NPC生图使用词组转化器}
                        onChange={(next) => updatePlaceholder('NPC生图使用词组转化器', next)}
                        disabled={是否强制启用词组转化器}
                        ariaLabel="切换 NPC 生图词组转化器"
                    />
                </div>
            </div>

            <div className={卡片样式}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-cyan-200">香闺秘档特写强制裸体语义</div>
                        <div className="mt-1 text-xs leading-6 text-cyan-100/70">关闭后不再额外强塞 `nude, naked, unclothed`，仅按原始描述、词组转化器和画师串生成。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.功能模型占位.香闺秘档特写强制裸体语义}
                        onChange={(next) => updatePlaceholder('香闺秘档特写强制裸体语义', next)}
                        ariaLabel="切换香闺秘档特写强制裸体语义"
                    />
                </div>
            </div>

            <div className={卡片样式}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-cyan-200">独立转化器模型</div>
                    </div>
                    <ToggleSwitch
                        checked={form.功能模型占位.词组转化器启用独立模型}
                        onChange={handleToggleTransformerIndependent}
                        ariaLabel="切换词组转化器独立模型"
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-cyan-200">转化器接口地址</label>
                        <input
                            type="text"
                            value={form.功能模型占位.词组转化器API地址}
                            onChange={(e) => updatePlaceholder('词组转化器API地址', e.target.value)}
                            placeholder="留空则沿用主剧情接口"
                            disabled={!form.功能模型占位.词组转化器启用独立模型}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-cyan-200">转化器 API Key</label>
                        <input
                            type="password"
                            value={form.功能模型占位.词组转化器API密钥}
                            onChange={(e) => updatePlaceholder('词组转化器API密钥', e.target.value)}
                            placeholder="留空则沿用主剧情 API Key"
                            disabled={!form.功能模型占位.词组转化器启用独立模型}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-bold text-cyan-200">词组转化器模型</label>
                        <InlineSelect
                            value={form.功能模型占位.词组转化器启用独立模型 ? form.功能模型占位.词组转化器使用模型 : 主剧情解析模型}
                            options={词组转化器模型选项.map((model) => ({ value: model, label: model }))}
                            onChange={(model) => updatePlaceholder('词组转化器使用模型', model)}
                            disabled={!form.功能模型占位.词组转化器启用独立模型}
                            placeholder={form.功能模型占位.词组转化器启用独立模型 ? '请选择或输入模型' : `跟随主剧情模型：${主剧情解析模型 || '未设置'}`}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            panelClassName="max-w-full"
                        />
                    </div>
                    <GameButton
                        onClick={() => handleFetchModels('词组转化器使用模型', '词组转化器模型列表')}
                        variant="secondary"
                        className="px-4 py-2 text-xs md:min-w-[96px]"
                        disabled={modelLoading.词组转化器使用模型}
                    >
                        {modelLoading.词组转化器使用模型 ? '...' : '获取列表'}
                    </GameButton>
                </div>

                {form.功能模型占位.词组转化器启用独立模型 && (
                    <input
                        type="text"
                        value={form.功能模型占位.词组转化器使用模型}
                        onChange={(e) => updatePlaceholder('词组转化器使用模型', e.target.value)}
                        placeholder="例如：gpt-4o-mini / gemini-2.5-flash"
                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-400"
                    />
                )}
            </div>

            <div className={卡片样式}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-violet-200">PNG 画风提炼独立模型</div>
                        <div className="mt-1 text-xs leading-6 text-violet-100/70">用于 PNG 元数据提炼画风，不影响生图模型。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.功能模型占位.PNG提炼启用独立模型}
                        onChange={(next) => updatePlaceholder('PNG提炼启用独立模型', next)}
                        ariaLabel="切换 PNG 提炼独立模型"
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-violet-200">PNG 提炼接口地址</label>
                        <input
                            type="text"
                            value={form.功能模型占位.PNG提炼API地址}
                            onChange={(e) => updatePlaceholder('PNG提炼API地址', e.target.value)}
                            placeholder="例如：https://api.openai.com/v1"
                            disabled={!form.功能模型占位.PNG提炼启用独立模型}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-violet-200">PNG 提炼 API Key</label>
                        <input
                            type="password"
                            value={form.功能模型占位.PNG提炼API密钥}
                            onChange={(e) => updatePlaceholder('PNG提炼API密钥', e.target.value)}
                            placeholder="留空则沿用主剧情 API Key"
                            disabled={!form.功能模型占位.PNG提炼启用独立模型}
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-bold text-violet-200">PNG 提炼模型</label>
                        <InlineSelect
                            value={form.功能模型占位.PNG提炼使用模型}
                            options={PNG提炼模型选项.map((model) => ({ value: model, label: model }))}
                            onChange={(model) => updatePlaceholder('PNG提炼使用模型', model)}
                            disabled={!form.功能模型占位.PNG提炼启用独立模型}
                            placeholder="请选择或输入模型"
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            panelClassName="max-w-full"
                        />
                    </div>
                    <GameButton
                        onClick={() => handleFetchModels('PNG提炼使用模型', 'PNG提炼模型列表')}
                        variant="secondary"
                        className="px-4 py-2 text-xs md:min-w-[96px]"
                        disabled={!form.功能模型占位.PNG提炼启用独立模型 || modelLoading.PNG提炼使用模型}
                    >
                        {modelLoading.PNG提炼使用模型 ? '...' : '获取列表'}
                    </GameButton>
                </div>
                <input
                    type="text"
                    value={form.功能模型占位.PNG提炼使用模型}
                    onChange={(e) => updatePlaceholder('PNG提炼使用模型', e.target.value)}
                    placeholder="例如：gpt-4o-mini / gemini-2.5-flash"
                    disabled={!form.功能模型占位.PNG提炼启用独立模型}
                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>

        </div>
    );

    const renderPresetsPage = () => (
        <div className={页面容器样式}>
            <div className={卡片样式}>
                <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-bold text-fuchsia-200">画师串预设</div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleAddArtistPreset} className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-950/20 px-3 py-2 text-xs text-fuchsia-100">新增</button>
                        <button type="button" onClick={handleDeleteArtistPreset} disabled={!selectedArtistPreset} className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200 disabled:opacity-40">删除</button>
                        <button type="button" onClick={handleExportArtistPresets} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">导出</button>
                        <button type="button" onClick={() => artistImportRef.current?.click()} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">导入</button>
                        <input ref={artistImportRef} type="file" accept="application/json" onChange={handleImportArtistPresets} className="hidden" />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-2">
                        <label className={标签样式}>适用范围</label>
                        <InlineSelect
                            value={artistPresetScope}
                            options={[
                                { value: 'npc', label: 'NPC角色' },
                                { value: 'scene', label: '场景' }
                            ]}
                            onChange={(value) => setArtistPresetScope(value as 画师串适用页签)}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className={标签样式}>当前使用预设</label>
                        <InlineSelect
                            value={currentArtistPresetId}
                            options={scopedArtistPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))}
                            onChange={(value) => 更新当前画师串预设ID(artistPresetScope, value)}
                            placeholder="请选择预设"
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-2">
                        <label className={标签样式}>默认PNG预设</label>
                        <InlineSelect
                            value={currentAutoPngPresetId}
                            options={pngStylePresets.map((preset) => ({ value: preset.id, label: preset.名称 }))}
                            onChange={(value) => 更新当前PNG预设ID(artistPresetScope, value)}
                            placeholder="不启用"
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                </div>

                {selectedArtistPreset ? (
                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <label className={标签样式}>预设名称</label>
                            <input
                                type="text"
                                value={selectedArtistPreset.名称}
                                onChange={(e) => updateArtistPreset(selectedArtistPreset.id, (preset) => ({ ...preset, 名称: e.target.value, updatedAt: Date.now() }))}
                                className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className={标签样式}>正面提示词</label>
                            <textarea
                                value={selectedArtistPreset.正面提示词}
                                onChange={(e) => updateArtistPreset(selectedArtistPreset.id, (preset) => ({ ...preset, 正面提示词: e.target.value, updatedAt: Date.now() }))}
                                rows={5}
                                className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400 resize-y"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className={标签样式}>负面提示词</label>
                            <textarea
                                value={selectedArtistPreset.负面提示词}
                                onChange={(e) => updateArtistPreset(selectedArtistPreset.id, (preset) => ({ ...preset, 负面提示词: e.target.value, updatedAt: Date.now() }))}
                                rows={4}
                                className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-fuchsia-400 resize-y"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-gray-400">当前范围还没有预设。</div>
                )}
            </div>

            <div className={卡片样式}>
                <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-bold text-cyan-200">词组转化器提示词预设</div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleAddTransformerPreset} className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">新增</button>
                        <button type="button" onClick={handleDeleteTransformerPreset} disabled={!selectedTransformerPreset} className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200 disabled:opacity-40">删除</button>
                        <button type="button" onClick={handleExportTransformerPresets} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">导出</button>
                        <button type="button" onClick={() => transformerImportRef.current?.click()} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white">导入</button>
                        <input ref={transformerImportRef} type="file" accept="application/json" onChange={handleImportTransformerPresets} className="hidden" />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-2">
                        <label className={标签样式}>适用类型</label>
                        <InlineSelect
                            value={transformerPresetScope}
                            options={[
                                { value: 'nai', label: 'NAI模式专属' },
                                { value: 'npc', label: 'NPC角色生成' },
                                { value: 'scene', label: '场景专属' }
                            ]}
                            onChange={(value) => setTransformerPresetScope(value as 词组预设页签)}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className={标签样式}>当前使用预设</label>
                        <InlineSelect
                            value={currentTransformerPresetId}
                            options={scopedTransformerPresets.map((preset) => ({ value: preset.id, label: preset.名称 }))}
                            onChange={(value) => 更新当前词组预设ID(transformerPresetScope, value)}
                            placeholder="请选择预设"
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                        />
                    </div>
                </div>

                {selectedTransformerPreset ? (
                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <label className={标签样式}>预设名称</label>
                            <input
                                type="text"
                                value={selectedTransformerPreset.名称}
                                onChange={(e) => updateTransformerPreset(selectedTransformerPreset.id, (preset) => ({ ...preset, 名称: e.target.value, updatedAt: Date.now() }))}
                                className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-400"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className={标签样式}>提示词内容</label>
                            <textarea
                                value={selectedTransformerPreset.提示词}
                                onChange={(e) => updateTransformerPreset(selectedTransformerPreset.id, (preset) => ({ ...preset, 提示词: e.target.value, updatedAt: Date.now() }))}
                                rows={10}
                                className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-cyan-400 resize-y min-h-[220px]"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-gray-400">当前类型还没有预设。</div>
                )}
            </div>
        </div>
    );

    const renderAutomationPage = () => {
        const sceneOrientation = form.功能模型占位.自动场景生图横竖屏 === '竖屏' ? '竖屏' : '横屏';
        const sceneResolutionVerticalOptions = 自动场景竖屏尺寸选项;
        const sceneResolutionHorizontalOptions = 自动场景横屏尺寸选项;
        const sceneResolutionOptions = sceneOrientation === '竖屏'
            ? sceneResolutionVerticalOptions
            : sceneResolutionHorizontalOptions;
        const currentSceneResolution = (form.功能模型占位.自动场景生图分辨率 || '').trim();
        const safeSceneResolution = currentSceneResolution || (sceneOrientation === '竖屏' ? '576x1024' : '1024x576');
        const resolvedSceneResolutionOptions = safeSceneResolution && !sceneResolutionOptions.some((item) => item.value === safeSceneResolution)
            ? [{ value: safeSceneResolution, label: `${safeSceneResolution} (当前)` }, ...sceneResolutionOptions]
            : sceneResolutionOptions;
        const handleSceneOrientationChange = (value: string) => {
            const nextOrientation = value === '竖屏' ? '竖屏' : '横屏';
            updatePlaceholder('自动场景生图横竖屏', nextOrientation);
            const nextOptions = nextOrientation === '竖屏'
                ? sceneResolutionVerticalOptions
                : sceneResolutionHorizontalOptions;
            if (!nextOptions.some((item) => item.value === currentSceneResolution)) {
                updatePlaceholder('自动场景生图分辨率', nextOptions[0]?.value || '');
            }
        };

        return (
            <div className={页面容器样式}>
                <div className={卡片样式}>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/20 bg-sky-950/10 p-4">
                        <div>
                            <div className="text-base font-bold text-sky-200">场景生图模式</div>
                        </div>
                        <ToggleSwitch
                            checked={form.功能模型占位.场景生图启用}
                            onChange={handleToggleSceneMode}
                            ariaLabel="切换场景生图模式"
                        />
                    </div>

                    <div className="rounded-xl border border-sky-900/30 bg-black/20 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-base font-bold text-sky-200">场景独立生图接口</div>
                            </div>
                            <ToggleSwitch
                                checked={form.功能模型占位.场景生图独立接口启用}
                                onChange={handleToggleSceneIndependentImageApi}
                                ariaLabel="切换场景独立生图接口"
                            />
                        </div>

                        {form.功能模型占位.场景生图独立接口启用 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-sky-200">场景后端类型</label>
                                    <InlineSelect
                                        value={form.功能模型占位.场景生图后端类型}
                                        options={文生图后端选项}
                                        onChange={(value) => updatePlaceholder('场景生图后端类型', value as 功能模型占位配置结构['文生图后端类型'])}
                                        buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                    />
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-sky-200">场景 API 地址</label>
                                        <input
                                            type="text"
                                            value={form.功能模型占位.场景生图模型API地址}
                                            onChange={(e) => updatePlaceholder('场景生图模型API地址', e.target.value)}
                                            placeholder={当前场景后端 === 'novelai'
                                                ? 'https://image.novelai.net'
                                                : 当前场景后端 === 'sd_webui'
                                                    ? '例如：http://127.0.0.1:7860'
                                                    : 当前场景后端 === 'comfyui'
                                                        ? '例如：http://127.0.0.1:8188'
                                                        : 'https://api.openai.com/v1'}
                                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-sky-400"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-sky-200">{当前场景后端 === 'novelai' ? '场景 Token' : '场景 API Key'}</label>
                                        <input
                                            type="password"
                                            value={form.功能模型占位.场景生图模型API密钥}
                                            onChange={(e) => updatePlaceholder('场景生图模型API密钥', e.target.value)}
                                            placeholder={当前场景后端 === 'sd_webui' || 当前场景后端 === 'comfyui'
                                                ? '可留空；默认不会发送 Authorization'
                                                : 当前场景后端 === 当前后端
                                                    ? (当前场景后端 === 'novelai' ? '留空则沿用主文生图 Token' : '留空则沿用主文生图 API Key')
                                                    : (当前场景后端 === 'novelai' ? '当前后端不同，建议填写独立 Token' : '当前后端不同，建议填写独立 API Key')}
                                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-sky-400"
                                        />
                                    </div>
                                </div>

                                {图片后端需要模型选择(当前场景后端) ? (
                                    <>
                                        <div className="flex flex-col gap-3 md:flex-row md:items-end">
                                            <div className="flex-1 space-y-2">
                                                <label className="text-sm font-bold text-sky-200">场景模型名称</label>
                                                <InlineSelect
                                                    value={form.功能模型占位.场景生图模型使用模型}
                                                    options={场景文生图模型选项.map((model) => ({ value: model, label: model }))}
                                                    onChange={(model) => updatePlaceholder('场景生图模型使用模型', model)}
                                                    placeholder="请选择或输入场景模型"
                                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                                    panelClassName="max-w-full"
                                                />
                                            </div>
                                            <GameButton
                                                onClick={() => handleFetchModels('场景生图模型使用模型', '场景模型列表')}
                                                variant="secondary"
                                                className="px-4 py-2 text-xs md:min-w-[96px]"
                                                disabled={modelLoading.场景生图模型使用模型}
                                            >
                                                {modelLoading.场景生图模型使用模型 ? '...' : '获取列表'}
                                            </GameButton>
                                        </div>

                                        <input
                                            type="text"
                                            value={form.功能模型占位.场景生图模型使用模型}
                                            onChange={(e) => updatePlaceholder('场景生图模型使用模型', e.target.value)}
                                            placeholder="例如：nai-diffusion-4-5-full / gpt-image-1"
                                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-sky-400"
                                        />
                                    </>
                                ) : (
                                    <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-sm text-sky-100">
                                        当前场景后端直接调用固定生图接口，不需要选择模型名称。
                                    </div>
                                )}

                                {当前场景后端 === 'comfyui' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-sky-200">场景 ComfyUI Workflow JSON</label>
                                        <textarea
                                            value={form.功能模型占位.场景ComfyUI工作流JSON}
                                            onChange={(e) => updatePlaceholder('场景ComfyUI工作流JSON', e.target.value)}
                                            rows={12}
                                            placeholder={'可留空以沿用主文生图 ComfyUI workflow。\n可用占位符：__PROMPT__、__NEGATIVE_PROMPT__、__WIDTH__、__HEIGHT__'}
                                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 font-mono text-white outline-none transition-all focus:border-sky-400 resize-y"
                                        />
                                        <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-xs leading-6 text-sky-100">
                                            场景独立接口使用原生 ComfyUI workflow；留空时，如果与主文生图后端同为 ComfyUI，会自动沿用主 workflow。
                                            支持占位符：{ComfyUI工作流占位提示}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-sky-200">场景默认画风</label>
                                <InlineSelect
                                    value={form.功能模型占位.自动场景生图画风}
                                    options={[
                                        { value: '通用', label: '通用' },
                                        { value: '二次元', label: '二次元' },
                                        { value: '国风', label: '国风' },
                                        { value: '写实', label: '写实' }
                                    ]}
                                    onChange={(value) => updatePlaceholder('自动场景生图画风', value as 功能模型占位配置结构['自动场景生图画风'])}
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-sky-200">场景构图要求</label>
                                <InlineSelect
                                    value={form.功能模型占位.自动场景生图构图要求 || '纯场景'}
                                    options={[
                                        { value: '纯场景', label: '纯场景' },
                                        { value: '故事快照', label: '故事快照' }
                                    ]}
                                    onChange={(value) => updatePlaceholder('自动场景生图构图要求', value as 功能模型占位配置结构['自动场景生图构图要求'])}
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                />
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-sky-200">场景画面方向</label>
                                <InlineSelect
                                    value={sceneOrientation}
                                    options={[
                                        { value: '横屏', label: '横屏' },
                                        { value: '竖屏', label: '竖屏' }
                                    ]}
                                    onChange={handleSceneOrientationChange}
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                />
                            </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-sky-200">场景分辨率</label>
                            <InlineSelect
                                value={safeSceneResolution}
                                options={resolvedSceneResolutionOptions}
                                onChange={(value) => updatePlaceholder('自动场景生图分辨率', value)}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-sky-200">自定义分辨率</label>
                        <input
                            type="text"
                            value={safeSceneResolution}
                            onChange={(e) => updatePlaceholder('自动场景生图分辨率', e.target.value)}
                            placeholder="例如：1280x720"
                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-sky-400"
                        />
                        <div className="text-xs text-sky-200/70">格式：宽x高（如 1280x720）</div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-amber-200">NPC 自动生图</div>
                    </div>
                    <ToggleSwitch
                        checked={form.功能模型占位.NPC生图启用}
                        onChange={(next) => updatePlaceholder('NPC生图启用', next)}
                        ariaLabel="切换 NPC 生图"
                    />
                </div>
<div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-amber-200">性别筛选</label>
                            <InlineSelect
                                value={form.功能模型占位.NPC生图性别筛选}
                                options={[
                                    { value: '全部', label: '全部' },
                                    { value: '男', label: '男' },
                                    { value: '女', label: '女' }
                                ]}
                                onChange={(value) => updatePlaceholder('NPC生图性别筛选', value as 功能模型占位配置结构['NPC生图性别筛选'])}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-amber-200">重要性筛选</label>
                            <InlineSelect
                                value={form.功能模型占位.NPC生图重要性筛选}
                                options={[
                                    { value: '全部', label: '全部 NPC' },
                                    { value: '仅重要', label: '只生成重要 NPC' }
                                ]}
                                onChange={(value) => updatePlaceholder('NPC生图重要性筛选', value as 功能模型占位配置结构['NPC生图重要性筛选'])}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-amber-200">NPC 默认画风</label>
                            <InlineSelect
                                value={form.功能模型占位.自动NPC生图画风}
                                options={[
                                    { value: '通用', label: '通用' },
                                    { value: '二次元', label: '二次元' },
                                    { value: '国风', label: '国风' },
                                    { value: '写实', label: '写实' }
                                ]}
                                onChange={(value) => updatePlaceholder('自动NPC生图画风', value as 功能模型占位配置结构['自动NPC生图画风'])}
                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="rounded-2xl border border-fuchsia-500/30 bg-[radial-gradient(circle_at_top_left,_rgba(217,70,239,0.18),_transparent_42%),linear-gradient(180deg,rgba(16,16,24,0.96),rgba(5,5,10,0.96))] p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <h3 className="text-2xl font-bold font-serif text-fuchsia-200">文生图设置</h3>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
                        <div className="text-sm text-gray-400">当前后端</div>
                        <div className="mt-1 text-base text-white">{文生图后端选项.find((item) => item.value === 当前后端)?.label || '未选择'}</div>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                    {可见页面.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setActivePage(item.value)}
                            className={`rounded-xl border px-4 py-3 text-left transition-all ${activePage === item.value
                                ? 'border-fuchsia-400 bg-fuchsia-500/15 text-white shadow-[0_0_0_1px_rgba(217,70,239,0.25)]'
                                : 'border-white/10 bg-black/20 text-gray-300 hover:border-fuchsia-500/40 hover:text-white'
                                }`}
                        >
                            <div className="text-sm font-semibold">{item.label}</div>
                        </button>
                    ))}
                </div>
            </div>

            {activePage === 'basic' && renderBasicPage()}
            {activePage === 'backend' && renderBackendPage()}
            {activePage === 'provider' && renderProviderPage()}
            {activePage === 'transformer' && renderTransformerPage()}
            {activePage === 'presets' && renderPresetsPage()}
            {activePage === 'automation' && renderAutomationPage()}

            {message && <p className="animate-pulse text-xs text-wuxia-cyan">{message}</p>}

            <div className="border-t border-fuchsia-500/20 pt-6">
                <GameButton onClick={handleSave} variant="primary" className="w-full">
                    {showSuccess ? '✔ 文生图配置已保存' : '保存文生图配置'}
                </GameButton>
            </div>
        </div>
    );
};

export default ImageGenerationSettings;
