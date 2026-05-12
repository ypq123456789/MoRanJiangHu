import React, { useEffect, useMemo, useState } from 'react';
import {
    接口设置结构,
    功能模型占位配置结构,
    单接口配置结构,
    生图配置档结构,
    生图配置档适用范围,
    画师串预设结构,
    词组转化器提示词预设结构,
    PNG画风预设结构,
    发现图片后端记录结构
} from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';
import InlineSelect from '../../ui/InlineSelect';
import { RELEASE_INFO } from '../../../data/releaseInfo';
import { openExternalUrl } from '../../../services/appUpdate';
import { 规范化接口设置, 获取NSFW文生图接口配置, 接口配置是否可用 } from '../../../utils/apiConfig';
import { 自动场景横屏尺寸选项, 自动场景竖屏尺寸选项 } from '../../../utils/imageSizeOptions';
import {
    buildDiscoveredBackendLabel,
    fetchDiscoveredImageBackends,
    normalizeDiscoveredBackendUrl,
    pickPreferredDiscoveredImageBackend,
    readImageBackendConnectionStats,
    recordImageBackendConnectionSuccess,
    sortDiscoveredImageBackendsByPreference,
    type ImageBackendConnectionStats
} from '../../../services/ai/imageBackendRegistry';
import { 规范化ComfyUI工作流JSON } from '../../../services/ai/comfyWorkflowTools';
import {
    构建ComfyUI精确连接失败提示,
    构建OpenAI图片生成端点,
    翻译连接测试错误,
    规范化OpenAI图片基础地址,
    规范化OpenAI图片模型名称
} from '../../../services/ai/imageGenerationDiagnostics';

interface Props {
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
}

type 生图模型字段 = '文生图模型使用模型' | '场景生图模型使用模型' | '词组转化器使用模型' | 'PNG提炼使用模型';
type 设置分页 = 'basic' | 'backend' | 'nsfw' | 'transformer' | 'presets' | 'profiles' | 'automation';
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
    { value: 'backend', label: '普通接口' },
    { value: 'nsfw', label: 'NSFW接口' },
    { value: 'transformer', label: '转化器' },
    { value: 'profiles', label: '配置档' },
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

const 读取文生图预设路径 = (
    backend: 功能模型占位配置结构['文生图后端类型'],
    preset: 功能模型占位配置结构['文生图预设接口路径']
): string => {
    return 预设路径选项映射[backend]?.find((item) => item.value === preset)?.label
        || 预设路径选项映射[backend]?.[0]?.label
        || '/v1/images/generations';
};

const 读取文生图接口路径 = (
    feature: 功能模型占位配置结构,
    backend: 功能模型占位配置结构['文生图后端类型'] = feature.文生图后端类型
): string => {
    if (feature.文生图接口路径模式 === 'custom') {
        return feature.文生图接口路径 || 读取文生图预设路径(backend, feature.文生图预设接口路径);
    }
    return 读取文生图预设路径(backend, feature.文生图预设接口路径);
};

const 判断OpenAI图片测试参数错误 = (detail: string): boolean => {
    return /prompt|message|messages|required|required parameter|missing|缺少|不能为空|参数|invalid_request/i.test(detail);
};

const 判断OpenAI图片测试模型错误 = (detail: string): boolean => {
    return /invalid model|unknown model|model[^，。]*?(not|invalid|unknown|unsupported|does not exist)|模型[^，。]*?(不存在|无效|未知|不支持)|不支持[^，。]*?模型/i.test(detail);
};

const OPENAI图片测试超时MS = 25_000;

const 测试OpenAI兼容图片接口 = async (params: {
    rawBaseUrl: string;
    apiKey: string;
    model: string;
    path?: string;
    label: string;
}): Promise<string> => {
    const endpoint = 构建OpenAI图片生成端点(params.rawBaseUrl, params.path, { useRuntimeProxy: true });
    if (!endpoint) throw new Error('OpenAI 兼容图片接口缺少 API 地址。');
    const rawModel = (params.model || '').trim();
    const model = 规范化OpenAI图片模型名称(rawModel) || 'gpt-image-2';
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };
    if (params.apiKey) {
        headers.Authorization = `Bearer ${params.apiKey}`;
    }
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), OPENAI图片测试超时MS);
    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, n: 1, response_format: 'b64_json' }),
            signal: abortController.signal
        });
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error(`OpenAI 兼容图片接口测试超时（${Math.round(OPENAI图片测试超时MS / 1000)} 秒）。接口地址可稍后重试；若服务端正在排队生图，测试按钮不会继续无限等待。`);
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
    const detail = await response.text().catch(() => '');
    const normalizedBase = 规范化OpenAI图片基础地址(params.rawBaseUrl);
    const normalizedNote = normalizedBase && normalizedBase !== params.rawBaseUrl.replace(/\/+$/, '')
        ? `已自动把网页地址识别为 API 根地址：${normalizedBase}。`
        : '';
    const modelNote = rawModel && rawModel !== model
        ? `模型名已按 ${model} 测试。`
        : `模型：${model}。`;

    if (response.ok) {
        return `${params.label}连接成功：${endpoint} 可访问。${normalizedNote}${modelNote}本次测试未提交实际 prompt。`;
    }

    if ((response.status === 401 || response.status === 403) && !params.apiKey) {
        return `${params.label}地址可达，但还没有填写 API Key。${normalizedNote}已测试端点：${endpoint}。`;
    }

    if (response.status === 400 && (!detail || 判断OpenAI图片测试参数错误(detail)) && !判断OpenAI图片测试模型错误(detail)) {
        const authNote = params.apiKey ? 'API Key 已通过基础验证。' : '接口已返回参数校验结果。';
        return `${params.label}连接可达，${authNote}${normalizedNote}已测试端点：${endpoint}。${modelNote}本次测试未提交实际 prompt，不会消耗生图次数。`;
    }

    throw new Error(`HTTP ${response.status} ${detail}`.trim());
};

const OpenAI图片模型建议 = ['gpt-image-2', 'gpt-image-1'];
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
const CNB_GUIDE_URL = RELEASE_INFO.cnbGuideUrl || 'https://msjh.bacon.de5.net/cnb-comfyui-guide.html';
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
const 生图配置档范围选项: Array<{ value: 生图配置档适用范围; label: string }> = [
    { value: 'npc', label: '角色 / NPC' },
    { value: 'scene', label: '场景' },
    { value: 'item', label: '物品' }
];

const ImageGenerationSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
    const [modelOptions, setModelOptions] = useState<Record<生图模型字段, string[]>>(初始化模型列表);
    const [modelLoading, setModelLoading] = useState<Record<生图模型字段, boolean>>(初始化加载状态);
    const [activePage, setActivePage] = useState<设置分页>('basic');
    const [artistPresetScope, setArtistPresetScope] = useState<画师串适用页签>('npc');
    const [transformerPresetScope, setTransformerPresetScope] = useState<词组预设页签>('nai');
    const [profileScope, setProfileScope] = useState<生图配置档适用范围>('npc');
    const [message, setMessage] = useState('');
    const [mainConnectionMessage, setMainConnectionMessage] = useState('');
    const [nsfwConnectionMessage, setNsfwConnectionMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [discoveredBackends, setDiscoveredBackends] = useState<发现图片后端记录结构[]>([]);
    const [backendConnectionStats, setBackendConnectionStats] = useState<ImageBackendConnectionStats>(() => readImageBackendConnectionStats());
    const [discoveryLoading, setDiscoveryLoading] = useState(false);
    const [discoveryError, setDiscoveryError] = useState('');
    const [testingImageConnection, setTestingImageConnection] = useState(false);
    const [testingNsfwConnection, setTestingNsfwConnection] = useState(false);
    const artistImportRef = React.useRef<HTMLInputElement | null>(null);
    const transformerImportRef = React.useRef<HTMLInputElement | null>(null);
    const comfyWorkflowImportRef = React.useRef<HTMLInputElement | null>(null);
    const sceneComfyWorkflowImportRef = React.useRef<HTMLInputElement | null>(null);
    const nsfwComfyWorkflowImportRef = React.useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const normalized = 规范化接口设置(settings);
        setForm(normalized);
        setSelectedConfigId(normalized.activeConfigId || normalized.configs[0]?.id || null);
        setModelOptions(初始化模型列表());
        setModelLoading(初始化加载状态());
        setActivePage('basic');
        setArtistPresetScope('npc');
        setTransformerPresetScope('nai');
        setProfileScope('npc');
        setDiscoveredBackends([]);
        setBackendConnectionStats(readImageBackendConnectionStats());
        setDiscoveryError('');
        setMainConnectionMessage('');
        setNsfwConnectionMessage('');
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
    const 当前NSFW后端 = form.功能模型占位.NSFW生图独立接口启用
        ? form.功能模型占位.NSFW生图后端类型
        : 当前后端;
    const 当前预设路径选项 = 预设路径选项映射[当前后端];
    const 当前预设路径值集合 = new Set(当前预设路径选项.map((item) => item.value));
    const 当前预设路径 = 当前预设路径值集合.has(form.功能模型占位.文生图预设接口路径)
        ? form.功能模型占位.文生图预设接口路径
        : 当前预设路径选项[0]?.value || 'openai_images';
    const 文生图模型选项 = Array.from(new Set(
        (当前后端 === 'novelai' ? NovelAI模型建议 : (当前后端 === 'openai' ? OpenAI图片模型建议 : []))
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
        (当前场景后端 === 'novelai' ? NovelAI模型建议 : (当前场景后端 === 'openai' ? OpenAI图片模型建议 : []))
            .concat(modelOptions.场景生图模型使用模型, form.功能模型占位.场景生图模型使用模型, form.功能模型占位.文生图模型使用模型)
            .map((item) => (item || '').trim())
            .filter(Boolean)
    ));
    const 可见页面 = useMemo(() => 基础页面选项, []);
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
    const selectedDiscoveredBackend = useMemo(
        () => discoveredBackends.find((item) => item.id === form.功能模型占位.当前图片后端发现ID) || null,
        [discoveredBackends, form.功能模型占位.当前图片后端发现ID]
    );
    const selectedSceneDiscoveredBackend = useMemo(
        () => discoveredBackends.find((item) => item.id === form.功能模型占位.当前场景图片后端发现ID) || null,
        [discoveredBackends, form.功能模型占位.当前场景图片后端发现ID]
    );
    const selectedNSFWDiscoveredBackend = useMemo(
        () => discoveredBackends.find((item) => item.id === form.功能模型占位.当前NSFW图片后端发现ID) || null,
        [discoveredBackends, form.功能模型占位.当前NSFW图片后端发现ID]
    );
    const imageProfiles = useMemo<生图配置档结构[]>(
        () => Array.isArray((form.功能模型占位 as any).生图配置档列表) ? (form.功能模型占位 as any).生图配置档列表 : [],
        [form.功能模型占位]
    );
    const scopedImageProfiles = useMemo(
        () => imageProfiles.filter((item) => item?.适用范围 === profileScope),
        [imageProfiles, profileScope]
    );
    const currentProfileId = profileScope === 'scene'
        ? ((form.功能模型占位 as any).当前场景生图配置档ID || '')
        : profileScope === 'item'
            ? ((form.功能模型占位 as any).当前物品生图配置档ID || '')
            : ((form.功能模型占位 as any).当前NPC生图配置档ID || '');
    const 主后端发现列表 = useMemo(
        () => sortDiscoveredImageBackendsByPreference(discoveredBackends, 'main', backendConnectionStats),
        [backendConnectionStats, discoveredBackends]
    );
    const 场景后端发现列表 = useMemo(
        () => sortDiscoveredImageBackendsByPreference(discoveredBackends, 'scene', backendConnectionStats),
        [backendConnectionStats, discoveredBackends]
    );
    const NSFW后端发现列表 = useMemo(
        () => sortDiscoveredImageBackendsByPreference(discoveredBackends, 'nsfw', backendConnectionStats),
        [backendConnectionStats, discoveredBackends]
    );

    const refreshDiscoveredBackends = React.useCallback(async () => {
        if (
            当前后端 !== 'comfyui'
            && 当前场景后端 !== 'comfyui'
            && !(form.功能模型占位.NSFW生图独立接口启用 && 当前NSFW后端 === 'comfyui')
        ) {
            setDiscoveredBackends([]);
            setDiscoveryError('');
            return;
        }

        setDiscoveryLoading(true);
        setDiscoveryError('');
        try {
            const items = await fetchDiscoveredImageBackends(form.功能模型占位.图片后端注册表地址, 'comfyui');
            setDiscoveredBackends(items);
        } catch (error: any) {
            setDiscoveredBackends([]);
            setDiscoveryError(error?.message || '图片后端自动发现失败');
        } finally {
            setDiscoveryLoading(false);
        }
    }, [form.功能模型占位.图片后端注册表地址, form.功能模型占位.NSFW生图独立接口启用, 当前后端, 当前场景后端, 当前NSFW后端]);

    useEffect(() => {
        void refreshDiscoveredBackends();
    }, [refreshDiscoveredBackends]);

    useEffect(() => {
        if (!discoveredBackends.length) return;
        setForm((prev) => {
            const feature = prev.功能模型占位;
            let nextFeature: 功能模型占位配置结构 | null = null;
            const withChange = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
                const current = (nextFeature || feature)[key];
                if (current === value) return;
                nextFeature = {
                    ...(nextFeature || feature),
                    [key]: value
                } as 功能模型占位配置结构;
            };
            const applyMainCandidate = () => {
                if (feature.文生图后端类型 !== 'comfyui') return;
                const candidate = pickPreferredDiscoveredImageBackend(
                    主后端发现列表,
                    'main',
                    {
                        id: feature.当前图片后端发现ID,
                        url: feature.文生图模型API地址
                    },
                    backendConnectionStats
                );
                if (!candidate) return;
                withChange('当前图片后端发现ID', candidate.id);
                withChange('文生图模型API地址', normalizeDiscoveredBackendUrl(candidate.url));
            };
            const applySceneCandidate = () => {
                if (!feature.场景生图独立接口启用 || feature.场景生图后端类型 !== 'comfyui') return;
                const candidate = pickPreferredDiscoveredImageBackend(
                    场景后端发现列表,
                    'scene',
                    {
                        id: feature.当前场景图片后端发现ID,
                        url: feature.场景生图模型API地址
                    },
                    backendConnectionStats
                );
                if (!candidate) return;
                withChange('当前场景图片后端发现ID', candidate.id);
                withChange('场景生图模型API地址', normalizeDiscoveredBackendUrl(candidate.url));
            };
            const applyNSFWCandidate = () => {
                if (!feature.NSFW生图独立接口启用 || feature.NSFW生图后端类型 !== 'comfyui') return;
                const candidate = pickPreferredDiscoveredImageBackend(
                    NSFW后端发现列表,
                    'nsfw',
                    {
                        id: feature.当前NSFW图片后端发现ID,
                        url: feature.NSFW生图模型API地址
                    },
                    backendConnectionStats
                );
                if (!candidate) return;
                withChange('当前NSFW图片后端发现ID', candidate.id);
                withChange('NSFW生图模型API地址', normalizeDiscoveredBackendUrl(candidate.url));
            };

            applyMainCandidate();
            applySceneCandidate();
            applyNSFWCandidate();

            return nextFeature ? { ...prev, 功能模型占位: nextFeature } : prev;
        });
    }, [NSFW后端发现列表, backendConnectionStats, discoveredBackends.length, 主后端发现列表, 场景后端发现列表]);

    const updatePlaceholder = <K extends keyof 功能模型占位配置结构>(key: K, value: 功能模型占位配置结构[K]) => {
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                [key]: value
            }
        }));
    };

    const handleApplyDiscoveredBackend = (target: 'main' | 'scene' | 'nsfw', backendId: string) => {
        const matched = discoveredBackends.find((item) => item.id === backendId) || null;
        if (target === 'main') {
            updatePlaceholder('当前图片后端发现ID', backendId);
            if (matched) {
                updatePlaceholder('文生图模型API地址', normalizeDiscoveredBackendUrl(matched.url));
            }
            return;
        }

        if (target === 'scene') {
            updatePlaceholder('当前场景图片后端发现ID', backendId);
            if (matched) {
                updatePlaceholder('场景生图模型API地址', normalizeDiscoveredBackendUrl(matched.url));
            }
            return;
        }

        updatePlaceholder('当前NSFW图片后端发现ID', backendId);
        if (matched) {
            updatePlaceholder('NSFW生图模型API地址', normalizeDiscoveredBackendUrl(matched.url));
        }
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

    const 取当前配置档ID字段 = (scope: 生图配置档适用范围) => (
        scope === 'scene' ? '当前场景生图配置档ID' : scope === 'item' ? '当前物品生图配置档ID' : '当前NPC生图配置档ID'
    );

    const 构建当前生图配置档 = (scope: 生图配置档适用范围): Partial<功能模型占位配置结构> => {
        const feature = form.功能模型占位;
        const sharedKeys: Array<keyof 功能模型占位配置结构> = [
            '文生图功能启用',
            '文生图后端类型',
            '文生图模型使用模型',
            '文生图模型API地址',
            '文生图模型API密钥',
            '文生图接口路径模式',
            '文生图预设接口路径',
            '文生图接口路径',
            '文生图响应格式',
            '文生图OpenAI自定义格式',
            '当前图片后端发现ID',
            'ComfyUI工作流JSON',
            'NovelAI启用自定义参数',
            'NovelAI采样器',
            'NovelAI噪点表',
            'NovelAI步数',
            'NovelAI负面提示词',
            'NPC生图使用词组转化器',
            '词组转化兼容模式',
            '词组转化器启用独立模型',
            '词组转化器使用模型',
            '词组转化器API地址',
            '词组转化器API密钥',
            '当前NAI词组转化器提示词预设ID',
            '自动角色锚点启用',
        ];
        const scopeKeys: Record<生图配置档适用范围, Array<keyof 功能模型占位配置结构>> = {
            npc: ['NPC生图启用', '自动NPC生图画风', '当前NPC画师串预设ID', '当前NPCPNG画风预设ID', '当前NPC词组转化器提示词预设ID', 'NPC生图性别筛选', 'NPC生图重要性筛选'],
            scene: ['场景生图启用', '自动场景生图画风', '自动场景生图构图要求', '自动场景生图横竖屏', '自动场景生图分辨率', '当前场景画师串预设ID', '当前场景PNG画风预设ID', '当前场景词组转化器提示词预设ID', '当前场景判定提示词预设ID', '场景生图独立接口启用', '场景生图后端类型', '场景生图模型使用模型', '场景生图模型API地址', '场景生图模型API密钥', '当前场景图片后端发现ID', '场景ComfyUI工作流JSON'],
            item: ['物品生图启用', '自动物品生图画风', '自动物品生图渲染风格', '自动物品生图分辨率', '当前NPC画师串预设ID', '当前NPCPNG画风预设ID', '当前NPC词组转化器提示词预设ID'],
        };
        const result: Partial<功能模型占位配置结构> = {};
        [...sharedKeys, ...scopeKeys[scope]].forEach((key) => {
            (result as any)[key] = (feature as any)[key];
        });
        return result;
    };

    const handleSaveImageProfile = () => {
        const now = Date.now();
        const scopeLabel = 生图配置档范围选项.find((item) => item.value === profileScope)?.label || '生图';
        const profile: 生图配置档结构 = {
            id: 生成预设ID('image_profile'),
            名称: `${scopeLabel}配置 ${new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
            适用范围: profileScope,
            说明: '从当前文生图设置保存',
            配置: 构建当前生图配置档(profileScope),
            createdAt: now,
            updatedAt: now
        };
        const idKey = 取当前配置档ID字段(profileScope);
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                生图配置档列表: [...(Array.isArray((prev.功能模型占位 as any).生图配置档列表) ? (prev.功能模型占位 as any).生图配置档列表 : []), profile],
                [idKey]: profile.id
            } as 功能模型占位配置结构
        }));
        setMessage(`已保存「${profile.名称}」`);
    };

    const handleApplyImageProfile = (profileId: string) => {
        const profile = imageProfiles.find((item) => item.id === profileId);
        if (!profile) return;
        const idKey = 取当前配置档ID字段(profile.适用范围);
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                ...profile.配置,
                [idKey]: profile.id
            } as 功能模型占位配置结构
        }));
        setProfileScope(profile.适用范围);
        setMessage(`已应用「${profile.名称}」`);
    };

    const handleDuplicateImageProfile = (profile: 生图配置档结构) => {
        const now = Date.now();
        const duplicated: 生图配置档结构 = {
            ...profile,
            id: 生成预设ID('image_profile'),
            名称: `${profile.名称} 副本`,
            createdAt: now,
            updatedAt: now
        };
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                生图配置档列表: [...imageProfiles, duplicated]
            } as 功能模型占位配置结构
        }));
        setMessage(`已复制「${profile.名称}」`);
    };

    const handleDeleteImageProfile = (profileId: string) => {
        const target = imageProfiles.find((item) => item.id === profileId);
        if (!target) return;
        const idKey = 取当前配置档ID字段(target.适用范围);
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                生图配置档列表: imageProfiles.filter((item) => item.id !== profileId),
                [idKey]: currentProfileId === profileId ? '' : (prev.功能模型占位 as any)[idKey]
            } as 功能模型占位配置结构
        }));
        setMessage(`已删除「${target.名称}」`);
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

    const handleImportComfyWorkflow = async (
        event: React.ChangeEvent<HTMLInputElement>,
        target: 'main' | 'scene' | 'nsfw'
    ) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const parsed = await 读取JSON文件(file);
            const normalized = 规范化ComfyUI工作流JSON(parsed);
            updatePlaceholder(
                target === 'scene'
                    ? '场景ComfyUI工作流JSON'
                    : target === 'nsfw'
                        ? 'NSFWComfyUI工作流JSON'
                        : 'ComfyUI工作流JSON',
                normalized
            );
            setMessage(`已导入 ${file.name}，并自动写入 ComfyUI 占位符`);
            setShowSuccess(true);
        } catch (error: any) {
            setMessage(error?.message || 'ComfyUI workflow 导入失败，请确认上传的是 API workflow JSON');
            setShowSuccess(false);
        }
    };

    const 主文生图后端可直接套用到NSFW = 当前后端 === 'novelai' || 当前后端 === 'sd_webui' || 当前后端 === 'comfyui';

    const NSFW独立接口已有专用配置 = (feature: 功能模型占位配置结构): boolean => {
        return [
            feature.NSFW生图模型使用模型,
            feature.NSFW生图模型API地址,
            feature.NSFW生图模型API密钥,
            feature.NSFWComfyUI工作流JSON,
            feature.当前NSFW图片后端发现ID
        ].some((value) => (value || '').trim().length > 0);
    };

    const 构建NSFW沿用主接口配置 = (
        feature: 功能模型占位配置结构,
        options?: { overwrite?: boolean }
    ): Partial<功能模型占位配置结构> => {
        if (!(feature.文生图后端类型 === 'novelai' || feature.文生图后端类型 === 'sd_webui' || feature.文生图后端类型 === 'comfyui')) {
            return {};
        }
        const overwrite = options?.overwrite === true;
        const pick = (current: string, fallback: string) => overwrite ? fallback : ((current || '').trim() || fallback);
        const shouldCopyApiKey = 图片后端需要鉴权(feature.文生图后端类型);
        const nsfwApiKey = shouldCopyApiKey
            ? pick(feature.NSFW生图模型API密钥, feature.文生图模型API密钥)
            : (overwrite ? '' : (feature.NSFW生图模型API密钥 || ''));

        return {
            NSFW生图后端类型: feature.文生图后端类型,
            NSFW生图模型使用模型: pick(feature.NSFW生图模型使用模型, feature.文生图模型使用模型),
            NSFW生图模型API地址: pick(feature.NSFW生图模型API地址, feature.文生图模型API地址),
            NSFW生图模型API密钥: nsfwApiKey,
            当前NSFW图片后端发现ID: overwrite
                ? feature.当前图片后端发现ID
                : ((feature.当前NSFW图片后端发现ID || '').trim() || feature.当前图片后端发现ID),
            NSFWComfyUI工作流JSON: pick(feature.NSFWComfyUI工作流JSON, feature.ComfyUI工作流JSON)
        };
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
        setMainConnectionMessage('');
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

    const handleToggleNSFWIndependentImageApi = (checked: boolean) => {
        setNsfwConnectionMessage('');
        setForm((prev) => {
            const feature = prev.功能模型占位;
            const shouldAutoReuseMain = checked && 主文生图后端可直接套用到NSFW && !NSFW独立接口已有专用配置(feature);
            return {
                ...prev,
                功能模型占位: {
                    ...feature,
                    NSFW生图独立接口启用: checked,
                    ...(shouldAutoReuseMain ? 构建NSFW沿用主接口配置(feature, { overwrite: true }) : {})
                }
            };
        });
    };

    const handleApplyMainImageBackendToNSFW = () => {
        setNsfwConnectionMessage('');
        setForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                NSFW生图独立接口启用: true,
                ...构建NSFW沿用主接口配置(prev.功能模型占位, { overwrite: true })
            }
        }));
        setMessage(`已套用主${文生图后端选项.find((item) => item.value === 当前后端)?.label || '文生图'}接口到 NSFW 生图。`);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    const handleTestImageConnection = async () => {
        if (testingImageConnection) return;
        const feature = form.功能模型占位;
        const backend = feature.文生图后端类型;
        const rawBaseUrl = (feature.文生图模型API地址 || '').trim() || (activeConfig?.baseUrl || '').trim();
        const apiKey = (feature.文生图模型API密钥 || '').trim() || (activeConfig?.apiKey || '').trim();
        if (!rawBaseUrl) {
            setMainConnectionMessage('请先填写文生图 API 地址。');
            return;
        }
        setTestingImageConnection(true);
        setMessage('');
        setMainConnectionMessage('正在测试文生图连接...');
        try {
            const base = rawBaseUrl.replace(/\/+$/, '');
            const headers = apiKey && 图片后端需要鉴权(backend) ? { Authorization: `Bearer ${apiKey}` } : undefined;
            if (backend === 'comfyui') {
                const response = await fetch(`${base}/system_stats`, { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${await response.text().catch(() => '')}`.trim());
                }
                const matchedBackend = discoveredBackends.find((item) => (
                    item.id === feature.当前图片后端发现ID
                    || normalizeDiscoveredBackendUrl(item.url) === base
                ));
                setBackendConnectionStats(recordImageBackendConnectionSuccess('main', matchedBackend || base));
                setMainConnectionMessage('ComfyUI 连接成功：后端在线，可以继续生图。');
                return;
            }
            if (backend === 'sd_webui') {
                const response = await fetch(`${base}/sdapi/v1/options`, { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${await response.text().catch(() => '')}`.trim());
                }
                setMainConnectionMessage('Stable Diffusion WebUI 连接成功：API 已开启。');
                return;
            }
            if (backend === 'novelai') {
                const response = await fetch(`${base}/user/subscription`, { method: 'GET', headers });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${await response.text().catch(() => '')}`.trim());
                }
                setMainConnectionMessage('NovelAI 连接成功：Token 可用。');
                return;
            }
            const rawModel = (feature.文生图模型使用模型 || '').trim() || 'gpt-image-2';
            const normalizedModel = 规范化OpenAI图片模型名称(rawModel);
            if (feature.文生图模型使用模型 !== normalizedModel) {
                updatePlaceholder('文生图模型使用模型', normalizedModel);
            }
            const message = await 测试OpenAI兼容图片接口({
                rawBaseUrl,
                apiKey,
                model: normalizedModel,
                path: 读取文生图接口路径(feature, backend),
                label: 'OpenAI 兼容文生图接口'
            });
            setMainConnectionMessage(message);
        } catch (error: any) {
            setMainConnectionMessage(backend === 'comfyui'
                ? await 构建ComfyUI精确连接失败提示(rawBaseUrl, error)
                : 翻译连接测试错误(error, {
                    baseUrl: rawBaseUrl,
                    backendLabel: 文生图后端选项.find((item) => item.value === backend)?.label || '文生图接口'
                }));
        } finally {
            setTestingImageConnection(false);
        }
    };

    const handleTestNsfwImageConnection = async () => {
        if (testingNsfwConnection) return;
        setTestingNsfwConnection(true);
        setMessage('');
        setNsfwConnectionMessage('正在测试 NSFW 文生图连接...');
        try {
            const nsfwConfig = 获取NSFW文生图接口配置(form);
            if (!nsfwConfig || !接口配置是否可用(nsfwConfig)) {
                const feature = form.功能模型占位;
                const independent = Boolean(feature.NSFW生图独立接口启用);
                const details = [];
                if (!independent) details.push('NSFW 独立接口未启用');
                if (nsfwConfig) {
                    details.push(`推断后端：${nsfwConfig.图片后端类型 || '未识别'}`);
                    details.push(`地址：${nsfwConfig.baseUrl || '未填写'}`);
                }
                throw new Error(`NSFW 生图配置不可用。${details.length ? '\n' + details.join('\n') : ''}\n请确认：1) 主文生图后端不是 OpenAI/Gemini 等不支持成人向的接口；2) 或者开启 NSFW 独立接口并配置 ComfyUI/SD WebUI/NovelAI 后端。`);
            }
            const backend = nsfwConfig.图片后端类型 || 'openai';
            const base = (nsfwConfig.baseUrl || '').replace(/\/+$/, '');
            const apiKey = (nsfwConfig.apiKey || '').trim();
            if (backend === 'comfyui') {
                const response = await fetch(`${base}/system_stats`, { method: 'GET' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const feature = form.功能模型占位;
                const matchedBackend = discoveredBackends.find((item) => (
                    item.id === feature.当前NSFW图片后端发现ID
                    || normalizeDiscoveredBackendUrl(item.url) === base
                ));
                setBackendConnectionStats(recordImageBackendConnectionSuccess('nsfw', matchedBackend || base));
                setNsfwConnectionMessage(`NSFW ComfyUI 连接成功：后端在线（${base}）。`);
                return;
            }
            if (backend === 'sd_webui') {
                const response = await fetch(`${base}/sdapi/v1/options`, { method: 'GET' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                setNsfwConnectionMessage(`NSFW SD WebUI 连接成功：API 已开启（${base}）。`);
                return;
            }
            if (backend === 'novelai') {
                const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
                const response = await fetch(`${base}/user/subscription`, { method: 'GET', headers });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                setNsfwConnectionMessage(`NSFW NovelAI 连接成功：Token 可用（${base}）。`);
                return;
            }
            const message = await 测试OpenAI兼容图片接口({
                rawBaseUrl: base,
                apiKey,
                model: nsfwConfig.model || 'gpt-image-2',
                path: nsfwConfig.图片接口路径 || '/v1/images/generations',
                label: 'NSFW OpenAI 兼容接口'
            });
            setNsfwConnectionMessage(message);
        } catch (error: any) {
            const nsfwConfig = 获取NSFW文生图接口配置(form);
            const base = nsfwConfig?.baseUrl || '';
            const backend = nsfwConfig?.图片后端类型 || 'openai';
            setNsfwConnectionMessage(backend === 'comfyui'
                ? await 构建ComfyUI精确连接失败提示(base, error)
                : 翻译连接测试错误(error, { baseUrl: base, backendLabel: `NSFW ${backend}` }));
        } finally {
            setTestingNsfwConnection(false);
        }
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
            const normalizedModelBase = targetBackend === 'openai'
                ? 规范化OpenAI图片基础地址(resolvedBaseUrl)
                : resolvedBaseUrl;
            if (targetBackend === 'openai') {
                try {
                    const host = new URL(normalizedModelBase).hostname;
                    if (/(^|\.)pucoding\.com$/i.test(host)) return OpenAI图片模型建议;
                } catch {
                    // 继续按通用模型列表探测。
                }
            }
            const base = normalizedModelBase.replace(/\/+$/, '');
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

    const renderNSFWIndependentImageApiCard = () => (
        <div className="rounded-2xl border border-rose-500/25 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.14),_transparent_55%),rgba(20,8,14,0.72)] p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-base font-bold text-rose-200">NSFW 独立生图接口</div>
                    <div className="mt-1 text-xs leading-6 text-rose-100/70">
                        开启后香闺秘档等成人向生图只走这里。OpenAI/GPT、Gemini、Nano Banana 会被自动视为不支持 NSFW，不会用于该类请求。
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {主文生图后端可直接套用到NSFW && (
                        <GameButton
                            onClick={handleApplyMainImageBackendToNSFW}
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                        >
                            套用主接口
                        </GameButton>
                    )}
                    <ToggleSwitch
                        checked={form.功能模型占位.NSFW生图独立接口启用}
                        onChange={handleToggleNSFWIndependentImageApi}
                        ariaLabel="切换 NSFW 独立生图接口"
                    />
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <GameButton
                        onClick={() => void handleTestNsfwImageConnection()}
                        variant="secondary"
                        className="px-4 py-2 text-xs"
                        disabled={testingNsfwConnection}
                    >
                        {testingNsfwConnection ? '测试中...' : '测试 NSFW 连接'}
                    </GameButton>
                    <div className="text-xs text-rose-100/60">
                        检测当前 NSFW 生图后端是否在线，包括兜底推断的场景后端。
                    </div>
                </div>
                {nsfwConnectionMessage && (
                    <div className="whitespace-pre-wrap rounded-xl border border-rose-400/25 bg-rose-950/20 px-4 py-3 text-xs leading-6 text-rose-100">
                        {nsfwConnectionMessage}
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-rose-200">NSFW 后端</label>
                    <InlineSelect
                        value={当前NSFW后端}
                        options={文生图后端选项}
                        onChange={(value) => updatePlaceholder('NSFW生图后端类型', value as 功能模型占位配置结构['NSFW生图后端类型'])}
                        disabled={!form.功能模型占位.NSFW生图独立接口启用}
                        buttonClassName="bg-black/50 border-gray-600 py-2.5"
                    />
                </div>
                <div className="rounded-xl border border-rose-500/20 bg-black/25 px-4 py-3 text-xs leading-6 text-rose-100/80">
                    成人向过滤规则：后端为 OpenAI 兼容，或模型/地址含 gpt、openai、gemini、banana、nano 时，系统会返回不可用，避免误发到不支持的接口。
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-rose-200">NSFW 接口地址</label>
                    <input
                        type="text"
                        value={form.功能模型占位.NSFW生图模型API地址}
                        onChange={(e) => updatePlaceholder('NSFW生图模型API地址', e.target.value)}
                        placeholder={当前NSFW后端 === 'comfyui'
                            ? '留空可沿用主 ComfyUI，或填写专用 8188 地址'
                            : '留空则尝试沿用同类型主文生图接口'}
                        disabled={!form.功能模型占位.NSFW生图独立接口启用}
                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-bold text-rose-200">NSFW API Key / Token</label>
                    <input
                        type="password"
                        value={form.功能模型占位.NSFW生图模型API密钥}
                        onChange={(e) => updatePlaceholder('NSFW生图模型API密钥', e.target.value)}
                        placeholder={当前NSFW后端 === 'sd_webui' || 当前NSFW后端 === 'comfyui' ? '可留空' : '填写专用 Key / Token'}
                        disabled={!form.功能模型占位.NSFW生图独立接口启用}
                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>
            </div>

            {form.功能模型占位.NSFW生图独立接口启用 && 当前NSFW后端 === 'comfyui' && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-bold text-rose-200">NSFW 自动发现后端</div>
                            <div className="mt-1 text-xs leading-6 text-rose-100/70">
                                可以从同一个注册表里挑一个在线 8188 后端；如果主接口本身就是 ComfyUI，也可以直接点上方“套用主接口”。
                            </div>
                        </div>
                        <GameButton
                            onClick={() => void refreshDiscoveredBackends()}
                            variant="secondary"
                            className="px-4 py-2 text-xs"
                            disabled={discoveryLoading}
                        >
                            {discoveryLoading ? '刷新中...' : '刷新列表'}
                        </GameButton>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-rose-200">在线后端</label>
                        <InlineSelect
                            value={form.功能模型占位.当前NSFW图片后端发现ID}
                            options={NSFW后端发现列表.map((item) => ({
                                value: item.id,
                                label: buildDiscoveredBackendLabel(item)
                            }))}
                            onChange={(value) => handleApplyDiscoveredBackend('nsfw', value)}
                            placeholder={discoveryLoading ? '正在拉取在线后端...' : '选择 NSFW 使用的 ComfyUI 后端'}
                            buttonClassName="bg-black/50 border-gray-600 py-2.5"
                            panelClassName="max-w-full"
                        />
                    </div>
                    {selectedNSFWDiscoveredBackend && (
                        <div className="rounded-xl border border-rose-500/20 bg-black/20 px-4 py-3 text-xs leading-6 text-rose-100">
                            当前已选：<code>{selectedNSFWDiscoveredBackend.url}</code>
                            {selectedNSFWDiscoveredBackend.workspace ? <> · 工作区：<code>{selectedNSFWDiscoveredBackend.workspace}</code></> : null}
                            {selectedNSFWDiscoveredBackend.lastHeartbeatAt ? <> · 最近心跳：<code>{selectedNSFWDiscoveredBackend.lastHeartbeatAt}</code></> : null}
                        </div>
                    )}
                    {discoveryError && (
                        <div className="rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs leading-6 text-red-200">
                            {discoveryError}
                        </div>
                    )}
                </div>
            )}

            {图片后端需要模型选择(当前NSFW后端) ? (
                <div className="space-y-2">
                    <label className="text-sm font-bold text-rose-200">NSFW 模型名称</label>
                    <input
                        type="text"
                        value={form.功能模型占位.NSFW生图模型使用模型}
                        onChange={(e) => updatePlaceholder('NSFW生图模型使用模型', e.target.value)}
                        placeholder={当前NSFW后端 === 'novelai' ? '例如：nai-diffusion-4-5-full' : '请选择支持成人向的专用模型'}
                        disabled={!form.功能模型占位.NSFW生图独立接口启用}
                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>
            ) : null}

            {当前NSFW后端 === 'comfyui' ? (
                <div className="space-y-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <label className="text-sm font-bold text-rose-200">NSFW ComfyUI Workflow JSON</label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => { void openExternalUrl(CNB_GUIDE_URL); }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-400/30 bg-black/20 text-sm font-bold text-rose-100 transition-colors hover:border-rose-300 hover:text-white"
                                aria-label="查看 ComfyUI API 文件导出教程"
                                title="查看 ComfyUI API 文件导出教程"
                            >
                                ?
                            </button>
                            <GameButton
                                onClick={() => nsfwComfyWorkflowImportRef.current?.click()}
                                variant="secondary"
                                className="px-4 py-2 text-xs"
                                disabled={!form.功能模型占位.NSFW生图独立接口启用}
                            >
                                上传 API 文件
                            </GameButton>
                            <input
                                ref={nsfwComfyWorkflowImportRef}
                                type="file"
                                accept="application/json,.json"
                                onChange={(event) => void handleImportComfyWorkflow(event, 'nsfw')}
                                className="hidden"
                            />
                        </div>
                    </div>
                    <textarea
                        value={form.功能模型占位.NSFWComfyUI工作流JSON}
                        onChange={(e) => updatePlaceholder('NSFWComfyUI工作流JSON', e.target.value)}
                        rows={10}
                        placeholder={'默认会使用私密部位专用的旧版 mix ComfyUI workflow。\n可用占位符：__PROMPT__、__NEGATIVE_PROMPT__、__WIDTH__、__HEIGHT__'}
                        disabled={!form.功能模型占位.NSFW生图独立接口启用}
                        className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 font-mono text-white outline-none transition-all focus:border-rose-400 resize-y disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="rounded-xl border border-rose-500/20 bg-black/20 px-4 py-3 text-xs leading-6 text-rose-100/80">
                        留空时会自动使用私密部位专用的旧版 mix ComfyUI workflow，不再默认沿用主 workflow。支持占位符：{ComfyUI工作流占位提示}。
                    </div>
                </div>
            ) : null}
        </div>
    );

    const renderNsfwPage = () => (
        <div className={页面容器样式}>
            {renderNSFWIndependentImageApiCard()}
        </div>
    );

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

                <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 p-4 space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-sm font-bold text-sky-200">连接测试</div>
                            <div className="mt-1 text-xs leading-5 text-sky-100/70">测试当前文生图后端是否在线，并把服务器、跨域、鉴权、模型路径等错误翻译成可处理的提示。</div>
                        </div>
                        <GameButton
                            onClick={() => { void handleTestImageConnection(); }}
                            variant="secondary"
                            className="px-4 py-2 text-xs md:min-w-[120px]"
                            disabled={testingImageConnection}
                        >
                            {testingImageConnection ? '测试中...' : '测试连接'}
                        </GameButton>
                    </div>
                    {mainConnectionMessage && (
                        <div className="whitespace-pre-wrap rounded-xl border border-sky-400/25 bg-sky-950/20 px-4 py-3 text-xs leading-6 text-sky-100">
                            {mainConnectionMessage}
                        </div>
                    )}
                </div>

                {当前后端 === 'comfyui' && (
                    <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 text-base font-bold text-emerald-200">
                                    <span>自动发现 ComfyUI 后端</span>
                                    <button
                                        type="button"
                                        onClick={() => { void openExternalUrl(CNB_GUIDE_URL); }}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/30 bg-black/20 text-xs text-emerald-200 transition-colors hover:border-emerald-300 hover:text-white"
                                        aria-label="如何构建属于自己的 CNB ComfyUI 后端"
                                        title="如何构建属于自己的 CNB ComfyUI 后端"
                                    >
                                        ?
                                    </button>
                                </div>
                                <div className="mt-1 text-xs leading-6 text-emerald-100/70">后端启动后向注册表上报 8188 地址，这里会自动拉取在线列表，选择后会直接回填到 API 地址。</div>
                            </div>
                            <GameButton
                                onClick={() => void refreshDiscoveredBackends()}
                                variant="secondary"
                                className="px-4 py-2 text-xs"
                                disabled={discoveryLoading}
                            >
                                {discoveryLoading ? '刷新中...' : '刷新列表'}
                            </GameButton>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-emerald-200">注册表地址</label>
                                <input
                                    type="text"
                                    value={form.功能模型占位.图片后端注册表地址}
                                    onChange={(e) => updatePlaceholder('图片后端注册表地址', e.target.value)}
                                    placeholder="留空则使用当前站点 /api/image-backend/cnb-sync"
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-emerald-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-emerald-200">在线后端</label>
                                <InlineSelect
                                    value={form.功能模型占位.当前图片后端发现ID}
                                    options={主后端发现列表.map((item) => ({
                                        value: item.id,
                                        label: buildDiscoveredBackendLabel(item)
                                    }))}
                                    onChange={(value) => handleApplyDiscoveredBackend('main', value)}
                                    placeholder={discoveryLoading ? '正在拉取在线后端...' : '选择已上报的 ComfyUI 8188 后端'}
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                    panelClassName="max-w-full"
                                />
                            </div>
                        </div>
                        {selectedDiscoveredBackend && (
                            <div className="rounded-xl border border-emerald-500/20 bg-black/20 px-4 py-3 text-xs leading-6 text-emerald-100">
                                当前已选：<code>{selectedDiscoveredBackend.url}</code>
                                {selectedDiscoveredBackend.workspace ? <> · 工作区：<code>{selectedDiscoveredBackend.workspace}</code></> : null}
                                {selectedDiscoveredBackend.lastHeartbeatAt ? <> · 最近心跳：<code>{selectedDiscoveredBackend.lastHeartbeatAt}</code></> : null}
                            </div>
                        )}
                        {discoveryError && (
                            <div className="rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs leading-6 text-red-200">
                                {discoveryError}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {renderMainBackendDetailSettings()}

        </div>
    );

    const renderMainBackendDetailSettings = () => (
        <div className="space-y-5">
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
                            placeholder="例如：gpt-image-2 / nai-diffusion-4-5-full"
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
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <label className={标签样式}>ComfyUI Workflow JSON</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => { void openExternalUrl(CNB_GUIDE_URL); }}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-fuchsia-400/30 bg-black/20 text-sm font-bold text-fuchsia-100 transition-colors hover:border-fuchsia-300 hover:text-white"
                                    aria-label="查看 ComfyUI API 文件导出教程"
                                    title="查看 ComfyUI API 文件导出教程"
                                >
                                    ?
                                </button>
                                <GameButton
                                    onClick={() => comfyWorkflowImportRef.current?.click()}
                                    variant="secondary"
                                    className="px-4 py-2 text-xs"
                                >
                                    上传 API 文件
                                </GameButton>
                                <input
                                    ref={comfyWorkflowImportRef}
                                    type="file"
                                    accept="application/json,.json"
                                    onChange={(event) => void handleImportComfyWorkflow(event, 'main')}
                                    className="hidden"
                                />
                            </div>
                        </div>
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
                        支持占位符：{ComfyUI工作流占位提示}。上传 API 文件会自动替换常见提示词、尺寸和采样参数字段。
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
                        <div className="text-base font-bold text-cyan-200">自动角色锚点</div>
                        <div className="mt-1 text-xs leading-6 text-cyan-100/75">关闭后不再自动提取角色锚点，也不把角色锚点自动注入背景/场景生图；已保存的手动锚点仍可单独管理。</div>
                    </div>
                    <ToggleSwitch
                        checked={form.功能模型占位.自动角色锚点启用 !== false}
                        onChange={(next) => updatePlaceholder('自动角色锚点启用', next)}
                        ariaLabel="切换自动角色锚点"
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

                                {当前场景后端 === 'comfyui' && (
                                    <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 p-4 space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-base font-bold text-sky-200">场景自动发现后端</div>
                                                <div className="mt-1 text-xs leading-6 text-sky-100/70">如果场景生图也走 ComfyUI，可以从同一个注册表里选另一个在线 8188 后端。</div>
                                            </div>
                                            <GameButton
                                                onClick={() => void refreshDiscoveredBackends()}
                                                variant="secondary"
                                                className="px-4 py-2 text-xs"
                                                disabled={discoveryLoading}
                                            >
                                                {discoveryLoading ? '刷新中...' : '刷新列表'}
                                            </GameButton>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-sky-200">在线后端</label>
                                            <InlineSelect
                                                value={form.功能模型占位.当前场景图片后端发现ID}
                                                options={场景后端发现列表.map((item) => ({
                                                    value: item.id,
                                                    label: buildDiscoveredBackendLabel(item)
                                                }))}
                                                onChange={(value) => handleApplyDiscoveredBackend('scene', value)}
                                                placeholder={discoveryLoading ? '正在拉取在线后端...' : '选择场景使用的 ComfyUI 后端'}
                                                buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                                panelClassName="max-w-full"
                                            />
                                        </div>
                                        {selectedSceneDiscoveredBackend && (
                                            <div className="rounded-xl border border-sky-500/20 bg-black/20 px-4 py-3 text-xs leading-6 text-sky-100">
                                                当前已选：<code>{selectedSceneDiscoveredBackend.url}</code>
                                                {selectedSceneDiscoveredBackend.workspace ? <> · 工作区：<code>{selectedSceneDiscoveredBackend.workspace}</code></> : null}
                                            </div>
                                        )}
                                    </div>
                                )}

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
                                            placeholder="例如：nai-diffusion-4-5-full / gpt-image-2"
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
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <label className="text-sm font-bold text-sky-200">场景 ComfyUI Workflow JSON</label>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { void openExternalUrl(CNB_GUIDE_URL); }}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-400/30 bg-black/20 text-sm font-bold text-sky-100 transition-colors hover:border-sky-300 hover:text-white"
                                                    aria-label="查看 ComfyUI API 文件导出教程"
                                                    title="查看 ComfyUI API 文件导出教程"
                                                >
                                                    ?
                                                </button>
                                                <GameButton
                                                    onClick={() => sceneComfyWorkflowImportRef.current?.click()}
                                                    variant="secondary"
                                                    className="px-4 py-2 text-xs"
                                                >
                                                    上传 API 文件
                                                </GameButton>
                                                <input
                                                    ref={sceneComfyWorkflowImportRef}
                                                    type="file"
                                                    accept="application/json,.json"
                                                    onChange={(event) => void handleImportComfyWorkflow(event, 'scene')}
                                                    className="hidden"
                                                />
                                            </div>
                                        </div>
                                        <textarea
                                            value={form.功能模型占位.场景ComfyUI工作流JSON}
                                            onChange={(e) => updatePlaceholder('场景ComfyUI工作流JSON', e.target.value)}
                                            rows={12}
                                            placeholder={'可留空以沿用主文生图 ComfyUI workflow。\n可用占位符：__PROMPT__、__NEGATIVE_PROMPT__、__WIDTH__、__HEIGHT__'}
                                            className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 font-mono text-white outline-none transition-all focus:border-sky-400 resize-y"
                                        />
                                        <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-xs leading-6 text-sky-100">
                                            场景独立接口使用原生 ComfyUI workflow；留空时，如果与主文生图后端同为 ComfyUI，会自动沿用主 workflow。
                                            支持占位符：{ComfyUI工作流占位提示}。上传 API 文件会自动替换常见提示词、尺寸和采样参数字段。
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

                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-base font-bold text-emerald-200">物品自动生图</div>
                                <div className="mt-1 text-xs leading-6 text-emerald-100/70">开启后，背包和拍卖行里没有图标的物品会自动排队生成图标，无需逐个点击。</div>
                            </div>
                            <ToggleSwitch
                                checked={form.功能模型占位.物品生图启用}
                                onChange={(next) => updatePlaceholder('物品生图启用', next)}
                                ariaLabel="切换物品自动生图"
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-emerald-200">物品默认画风</label>
                                <InlineSelect
                                    value={form.功能模型占位.自动物品生图画风}
                                    options={[
                                        { value: '通用', label: '通用' },
                                        { value: '二次元', label: '二次元' },
                                        { value: '国风', label: '国风' },
                                        { value: '写实', label: '写实' }
                                    ]}
                                    onChange={(value) => updatePlaceholder('自动物品生图画风', value as 功能模型占位配置结构['自动物品生图画风'])}
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-emerald-200">渲染风格</label>
                                <InlineSelect
                                    value={form.功能模型占位.自动物品生图渲染风格}
                                    options={[
                                        { value: '国风插画', label: '国风插画' },
                                        { value: '写实道具', label: '写实道具' },
                                        { value: '像素图标', label: '像素图标' },
                                        { value: '3D渲染', label: '3D渲染' }
                                    ]}
                                    onChange={(value) => updatePlaceholder('自动物品生图渲染风格', value as 功能模型占位配置结构['自动物品生图渲染风格'])}
                                    buttonClassName="bg-black/50 border-gray-600 py-2.5"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-emerald-200">物品分辨率</label>
                                <input
                                    type="text"
                                    value={form.功能模型占位.自动物品生图分辨率 || '1024x1024'}
                                    onChange={(e) => updatePlaceholder('自动物品生图分辨率', e.target.value)}
                                    placeholder="例如：1024x1024"
                                    className="w-full rounded-md border-2 border-transparent bg-black/50 p-3 text-white outline-none transition-all focus:border-emerald-400"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderProfilesPage = () => (
        <div className={页面容器样式}>
            <div className={卡片样式}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h4 className={标签样式}>生图配置档</h4>
                        <p className="mt-1 text-xs leading-5 text-gray-400">
                            将角色、场景、物品三类生图常用配置打包保存，可快速切换后端、模型、画师串、PNG 画风和词组转化器预设。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {生图配置档范围选项.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => setProfileScope(item.value)}
                                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${profileScope === item.value ? 'border-fuchsia-400 bg-fuchsia-500/20 text-white' : 'border-white/10 bg-black/30 text-gray-300 hover:border-fuchsia-400/40'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-sm font-semibold text-fuchsia-100">
                                当前页签：{生图配置档范围选项.find((item) => item.value === profileScope)?.label}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                                保存后会记录当前设置中的连接、模型、预设选择；API 密钥也会随现有设置一起保存。
                            </div>
                        </div>
                        <GameButton onClick={handleSaveImageProfile} variant="secondary" className="px-4 py-2 text-sm">
                            保存当前为配置档
                        </GameButton>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {scopedImageProfiles.map((profile) => {
                        const backend = (profile.配置 as any).场景生图后端类型 || (profile.配置 as any).文生图后端类型 || 'openai';
                        const model = (profile.配置 as any).场景生图模型使用模型 || (profile.配置 as any).文生图模型使用模型 || '未指定模型';
                        const isActive = currentProfileId === profile.id;
                        return (
                            <div key={profile.id} className={`rounded-xl border p-4 ${isActive ? 'border-fuchsia-400/60 bg-fuchsia-950/20' : 'border-white/10 bg-black/25'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h5 className="truncate text-sm font-bold text-white">{profile.名称}</h5>
                                            {isActive && <span className="rounded border border-emerald-400/40 bg-emerald-950/30 px-2 py-0.5 text-[10px] text-emerald-200">当前</span>}
                                        </div>
                                        <div className="mt-1 text-[11px] text-gray-500">{profile.说明 || '未填写说明'}</div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">后端：<span className="text-gray-200">{backend}</span></div>
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">模型：<span className="text-gray-200">{model}</span></div>
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">画师串：<span className="text-gray-200">{(profile.配置 as any).当前场景画师串预设ID || (profile.配置 as any).当前NPC画师串预设ID || '未绑定'}</span></div>
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">词组：<span className="text-gray-200">{(profile.配置 as any).当前场景词组转化器提示词预设ID || (profile.配置 as any).当前NPC词组转化器提示词预设ID || (profile.配置 as any).当前NAI词组转化器提示词预设ID || '未绑定'}</span></div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2">
                                    <button type="button" onClick={() => handleApplyImageProfile(profile.id)} className="rounded-lg border border-fuchsia-400/40 bg-fuchsia-950/30 px-3 py-2 text-xs text-fuchsia-100 hover:bg-fuchsia-900/40">应用</button>
                                    <button type="button" onClick={() => handleDuplicateImageProfile(profile)} className="rounded-lg border border-sky-400/30 bg-sky-950/25 px-3 py-2 text-xs text-sky-100 hover:bg-sky-900/35">复制</button>
                                    <button type="button" onClick={() => handleDeleteImageProfile(profile.id)} className="rounded-lg border border-red-400/30 bg-red-950/25 px-3 py-2 text-xs text-red-100 hover:bg-red-900/35">删除</button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {scopedImageProfiles.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-gray-500">
                        当前分类还没有配置档。
                    </div>
                )}
            </div>
        </div>
    );

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

                <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
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
            {activePage === 'nsfw' && renderNsfwPage()}
            {activePage === 'transformer' && renderTransformerPage()}
            {activePage === 'presets' && renderPresetsPage()}
            {activePage === 'profiles' && renderProfilesPage()}
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
