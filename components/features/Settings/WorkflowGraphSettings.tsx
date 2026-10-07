import React, { useEffect, useMemo, useState } from 'react';
import { 功能模型占位配置结构, 接口设置结构, 单接口配置结构 } from '../../../types';
import InlineSelect from '../../ui/InlineSelect';
import {
    获取主剧情接口配置,
    获取剧情回忆接口配置,
    获取文章优化接口配置,
    获取变量计算接口配置,
    获取世界演变接口配置,
    获取规划分析接口配置,
    获取地图自动更新接口配置,
    获取记忆总结接口配置,
    获取记忆精炼接口配置,
    获取小说拆分接口配置,
    构建OpenAI兼容模型列表候选地址,
    接口配置是否可用,
    规范化接口设置
} from '../../../utils/apiConfig';
import type { 当前可用接口结构 } from '../../../utils/apiConfig';
import { 协议请求错误, 请求模型文本, type 通用消息 } from '../../../services/ai/chatCompletionClient';
import { 功能模型建议说明 } from './FunctionModelAdviceTip';

type StageStatus = 'enabled' | 'disabled' | 'fallback' | 'blocked';

type FlowStage = {
    id: string;
    title: string;
    subtitle: string;
    row: number;
    order: number;
    status: StageStatus;
    channel: string;
    channelId: string;
    model: string;
    note: string;
    localOnly?: boolean;
    configTab?: string;
    modelConfig?: StageModelConfig;
};

type PlaceholderKey = keyof 功能模型占位配置结构;

type StageModelConfig = {
    kind: 'main' | 'placeholder';
    title: string;
    modelKey?: PlaceholderKey;
    channelKey?: PlaceholderKey;
    baseUrlKey?: PlaceholderKey;
    apiKeyKey?: PlaceholderKey;
    enableKeys?: PlaceholderKey[];
    fallbackModel?: string;
};

const trim = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const statusText: Record<StageStatus, string> = {
    enabled: '已启用',
    disabled: '未启用',
    fallback: '跟随',
    blocked: '未就绪'
};

type StageToggleConfig = {
    enableKey: PlaceholderKey;
    tipText: string;
};

const stageToggleTips: Record<string, StageToggleConfig> = {
    recall: {
        enableKey: '剧情回忆独立模型开关',
        tipText: '剧情回忆会在指定回合后检索历史事件并注入上下文。关闭后主剧情不会参考之前的关键剧情回忆，推荐保持开启。'
    },
    polish: {
        enableKey: '文章优化独立模型开关',
        tipText: '文章优化会对主剧情正文做润色扩写。关闭后正文保持原始输出，可以减少格式类 bug 出现几率，但文笔可能会略粗糙。可开可不开。'
    },
    variable: {
        enableKey: '变量计算独立模型开关',
        tipText: '强烈建议开启！变量生成负责产出角色状态、物品、装备、技能等结构化命令。关闭后游戏基本只剩下纯文字，角色面板、背包、战斗系统等都不会正常更新。'
    },
    world: {
        enableKey: '世界演变功能启用',
        tipText: '动态世界会模拟势力消长、NPC 行动、商路变化等宏观演变。关闭后江湖不会再自行演化，世界会相对静止。按需开启。'
    },
    planning: {
        enableKey: '规划分析功能启用',
        tipText: '规划分析会在每回合后检查剧情连贯性、女主塑造和长期走向，并输出修正建议。关闭后剧情完全靠主剧情模型自由发挥。按需开启。'
    },
    map: {
        enableKey: '地图生成功能启用',
        tipText: '地图更新会在每回合后增量维护地点树。目前地图系统仍有已知 bug，如果遇到显示异常或卡顿，可以考虑关闭。受不了 bug 就关掉。'
    },
    summary: {
        enableKey: '记忆总结独立模型开关',
        tipText: '记忆总结会在短期记忆累积到阈值后自动合并为长期记忆。关闭后短期记忆不会自动精简，上下文窗口可能会更快占满。推荐开启。'
    },
    refine: {
        enableKey: '记忆精炼独立模型开关',
        tipText: '记忆精炼由玩家手动触发，可将多条历史回忆合并为一条纪要。关闭后无法使用回忆整理功能。按需开启。'
    },
    novel: {
        enableKey: '小说拆分功能启用',
        tipText: '小说分解是离线数据处理阶段，用于构建同人小说的结构化数据集。不玩同人模式可以关闭。按需开启。'
    }
};

const stageNonStreamKeys: Record<string, keyof 功能模型占位配置结构> = {
    main: '主剧情非流式输出',
    recall: '剧情回忆非流式输出',
    polish: '文章优化非流式输出',
    variable: '变量计算非流式输出',
    world: '世界演变非流式输出',
    planning: '规划分析非流式输出',
    map: '地图自动更新非流式输出',
    summary: '记忆总结非流式输出',
    refine: '记忆精炼非流式输出',
    novel: '小说拆分非流式输出'
};

const statusClass: Record<StageStatus, string> = {
    enabled: 'border-emerald-400/45 bg-emerald-950/25 text-emerald-100',
    disabled: 'border-gray-700 bg-black/25 text-gray-400',
    fallback: 'border-sky-400/35 bg-sky-950/20 text-sky-100',
    blocked: 'border-amber-400/45 bg-amber-950/25 text-amber-100'
};

const resolveChannelId = (settings: 接口设置结构, channelName: string): string => {
    return settings.configs.find((cfg) => cfg.名称 === channelName)?.id || '';
};

const buildStage = (
    settings: 接口设置结构,
    params: {
        id: string;
        title: string;
        subtitle: string;
        row: number;
        order: number;
        enabled: boolean;
        fallback?: boolean;
        api: ReturnType<typeof 获取主剧情接口配置>;
        note: string;
        localOnly?: boolean;
        showNoteWhenDisabled?: boolean;
        configTab?: string;
        modelConfig?: StageModelConfig;
    }
): FlowStage => {
    const available = params.localOnly || 接口配置是否可用(params.api);
    const channel = trim(params.api?.名称) || '未配置渠道';
    return {
        id: params.id,
        title: params.title,
        subtitle: params.subtitle,
        row: params.row,
        order: params.order,
        status: params.enabled
            ? (available ? (params.fallback ? 'fallback' : 'enabled') : 'blocked')
            : 'disabled',
        channel: params.localOnly ? '本地状态处理' : channel,
        channelId: resolveChannelId(settings, channel),
        model: params.localOnly ? '不调用 AI' : (trim(params.api?.model) || '未选择模型'),
        note: params.enabled || params.showNoteWhenDisabled ? params.note : '当前开关关闭，本阶段不会执行。',
        localOnly: params.localOnly,
        configTab: params.configTab,
        modelConfig: params.modelConfig
    };
};

const WorkflowGraphSettings: React.FC<{
    settings: 接口设置结构;
    onSave?: (settings: 接口设置结构) => void;
    onNavigate?: (tab: string) => void;
}> = ({ settings, onSave, onNavigate }) => {
    const [form, setForm] = useState<接口设置结构>(() => 规范化接口设置(settings));
    const [modelOptionsByStage, setModelOptionsByStage] = useState<Record<string, string[]>>({});
    const [loadingStageId, setLoadingStageId] = useState('');
    const [testingStageId, setTestingStageId] = useState('');
    const [stageMessages, setStageMessages] = useState<Record<string, string>>({});

    useEffect(() => {
        setForm(规范化接口设置(settings));
    }, [settings]);

    const normalized = useMemo(() => 规范化接口设置(form), [form]);
    const feature = normalized.功能模型占位;
    const mainApi = 获取主剧情接口配置(normalized);

    const persistForm = (updater: (prev: 接口设置结构) => 接口设置结构) => {
        setForm((prev) => {
            const next = 规范化接口设置(updater(规范化接口设置(prev)));
            onSave?.(next);
            return next;
        });
    };

    const setStageMessage = (stageId: string, message: string) => {
        setStageMessages((prev) => ({ ...prev, [stageId]: message }));
    };

    const stages = useMemo<FlowStage[]>(() => {
        const recallApi = 获取剧情回忆接口配置(normalized);
        const polishApi = 获取文章优化接口配置(normalized);
        const variableApi = 获取变量计算接口配置(normalized);
        const worldApi = 获取世界演变接口配置(normalized);
        const planningApi = 获取规划分析接口配置(normalized);
        const mapApi = 获取地图自动更新接口配置(normalized);
        const memorySummaryApi = 获取记忆总结接口配置(normalized);
        const memoryRefineApi = 获取记忆精炼接口配置(normalized);
        const novelApi = 获取小说拆分接口配置(normalized);

        return [
            buildStage(normalized, {
                id: 'input',
                title: '玩家输入',
                subtitle: '本回合选择与上下文',
                row: 0,
                order: 0,
                enabled: true,
                fallback: true,
                api: mainApi,
                note: '收集当前存档、记忆、世界书、变量和玩家输入。'
            }),
            buildStage(normalized, {
                id: 'recall',
                title: '剧情回忆',
                subtitle: '正文前检索',
                row: 1,
                order: 0,
                enabled: Boolean(feature.剧情回忆独立模型开关),
                api: recallApi,
                configTab: 'recall',
                modelConfig: {
                    kind: 'placeholder',
                    title: '剧情回忆',
                    modelKey: '剧情回忆使用模型',
                    channelKey: '剧情回忆渠道ID',
                    baseUrlKey: '剧情回忆API地址',
                    apiKeyKey: '剧情回忆API密钥',
                    enableKeys: ['剧情回忆独立模型开关']
                },
                showNoteWhenDisabled: true,
                note: `第 ${Math.max(1, Number(feature.剧情回忆最早触发回合) || 10)} 回合起可触发；${Boolean(feature.剧情回忆独立模型开关) ? '结果会注入主剧情上下文。' : '当前开关关闭，本阶段不会执行。'}`
            }),
            buildStage(normalized, {
                id: 'main',
                title: '主剧情',
                subtitle: '生成正文和基础命令',
                row: 2,
                order: 0,
                enabled: true,
                api: mainApi,
                configTab: 'api',
                modelConfig: { kind: 'main', title: '主剧情' },
                note: '核心正文阶段，后续阶段主要依赖它的正文、命令和模拟状态。'
            }),
            buildStage(normalized, {
                id: 'polish',
                title: '文章优化',
                subtitle: '正文润色',
                row: 3,
                order: 0,
                enabled: Boolean(feature.文章优化独立模型开关),
                api: polishApi,
                configTab: 'polish',
                modelConfig: {
                    kind: 'placeholder',
                    title: '文章优化',
                    modelKey: '文章优化使用模型',
                    channelKey: '文章优化渠道ID',
                    baseUrlKey: '文章优化API地址',
                    apiKeyKey: '文章优化API密钥',
                    enableKeys: ['文章优化独立模型开关']
                },
                note: '依赖主剧情原始正文；与变量生成渠道分离时可并行，合并时只影响展示正文。'
            }),
            buildStage(normalized, {
                id: 'variable',
                title: '变量生成',
                subtitle: '补全状态命令',
                row: 3,
                order: 1,
                enabled: Boolean(feature.变量计算独立模型开关),
                api: variableApi,
                configTab: 'variable_model',
                modelConfig: {
                    kind: 'placeholder',
                    title: '变量生成',
                    modelKey: '变量计算使用模型',
                    channelKey: '变量计算渠道ID',
                    baseUrlKey: '变量计算API地址',
                    apiKeyKey: '变量计算API密钥',
                    enableKeys: ['变量计算独立模型开关']
                },
                note: '依赖主剧情原始响应，产出的命令会进入后续模拟状态；与文章优化可并行。'
            }),
            buildStage(normalized, {
                id: 'world',
                title: '动态世界',
                subtitle: '世界演变',
                row: 4,
                order: 0,
                enabled: feature.世界演变功能启用 !== false && 接口配置是否可用(worldApi),
                api: worldApi,
                configTab: 'world_evolution',
                modelConfig: {
                    kind: 'placeholder',
                    title: '动态世界',
                    modelKey: '世界演变使用模型',
                    channelKey: '世界演变渠道ID',
                    baseUrlKey: '世界演变API地址',
                    apiKeyKey: '世界演变API密钥',
                    enableKeys: ['世界演变功能启用', '世界演变独立模型开关']
                },
                note: '依赖变量生成后的快照；独立模型关闭时复用主剧情接口，与规划、地图渠道分离时可并行。'
            }),
            buildStage(normalized, {
                id: 'planning',
                title: '规划分析',
                subtitle: '剧情规划修订',
                row: 4,
                order: 1,
                enabled: feature.规划分析功能启用 !== false && (
                    Boolean(feature.规划分析独立模型开关)
                    || Boolean(feature.剧情规划独立模型开关)
                    || Boolean(feature.女主规划独立模型开关)
                ),
                api: planningApi,
                configTab: 'planning_model',
                modelConfig: {
                    kind: 'placeholder',
                    title: '规划分析',
                    modelKey: '规划分析使用模型',
                    channelKey: '规划分析渠道ID',
                    baseUrlKey: '规划分析API地址',
                    apiKeyKey: '规划分析API密钥',
                    enableKeys: ['规划分析功能启用', '规划分析独立模型开关']
                },
                note: '依赖变量生成后的快照；并行后按固定顺序合并命令。'
            }),
            buildStage(normalized, {
                id: 'map',
                title: '地图更新',
                subtitle: '地点树增量',
                row: 4,
                order: 2,
                enabled: feature.地图生成功能启用 !== false,
                fallback: !feature.地图自动更新独立模型开关,
                api: mapApi,
                configTab: 'map_model',
                modelConfig: {
                    kind: 'placeholder',
                    title: '地图更新',
                    modelKey: '地图自动更新使用模型',
                    channelKey: '地图自动更新渠道ID',
                    baseUrlKey: '地图自动更新API地址',
                    apiKeyKey: '地图自动更新API密钥',
                    enableKeys: ['地图生成功能启用', '地图自动更新独立模型开关']
                },
                note: '依赖变量生成后的快照；最后只应用地图层级命令。'
            }),
            buildStage(normalized, {
                id: 'apply',
                title: '最终落盘',
                subtitle: '合并命令并存档',
                row: 5,
                order: 0,
                enabled: true,
                fallback: true,
                api: mainApi,
                localOnly: true,
                note: '不调用 AI；汇总正文、变量、世界、规划、地图命令后写入本地状态。'
            }),
            buildStage(normalized, {
                id: 'summary',
                title: '记忆总结',
                subtitle: '阈值触发',
                row: 9,
                order: 0,
                enabled: Boolean(feature.记忆总结独立模型开关),
                fallback: !feature.记忆总结独立模型开关,
                api: memorySummaryApi,
                configTab: 'memory_summary_model',
                modelConfig: {
                    kind: 'placeholder',
                    title: '记忆总结',
                    modelKey: '记忆总结使用模型',
                    channelKey: '记忆总结渠道ID',
                    baseUrlKey: '记忆总结API地址',
                    apiKeyKey: '记忆总结API密钥',
                    enableKeys: ['记忆总结独立模型开关']
                },
                note: '达到记忆阈值后触发，不属于每回合主队列。'
            }),
            buildStage(normalized, {
                id: 'refine',
                title: '记忆精炼',
                subtitle: '手动整理',
                row: 9,
                order: 1,
                enabled: Boolean(feature.记忆精炼独立模型开关),
                fallback: !feature.记忆精炼独立模型开关,
                api: memoryRefineApi,
                configTab: 'memory_refine_model',
                modelConfig: {
                    kind: 'placeholder',
                    title: '记忆精炼',
                    modelKey: '记忆精炼使用模型',
                    channelKey: '记忆精炼渠道ID',
                    baseUrlKey: '记忆精炼API地址',
                    apiKeyKey: '记忆精炼API密钥',
                    enableKeys: ['记忆精炼独立模型开关']
                },
                note: '由回忆整理入口触发，可复用记忆总结或独立渠道。'
            }),
            buildStage(normalized, {
                id: 'novel',
                title: '小说分解',
                subtitle: '数据集构建',
                row: 9,
                order: 2,
                enabled: Boolean(feature.小说拆分功能启用),
                fallback: !feature.小说拆分独立模型开关,
                api: novelApi,
                configTab: 'novel_decomposition',
                modelConfig: {
                    kind: 'placeholder',
                    title: '小说分解',
                    modelKey: '小说拆分使用模型',
                    channelKey: '小说拆分渠道ID',
                    baseUrlKey: '小说拆分API地址',
                    apiKeyKey: '小说拆分API密钥',
                    enableKeys: ['小说拆分功能启用', '小说拆分独立模型开关']
                },
                note: '离线/后台数据处理阶段，不会自动等同于注入世界观。'
            })
        ];
    }, [feature, mainApi, normalized]);

    const mainPipeline = stages.filter((stage) => stage.row <= 6);
    const sidePipeline = stages.filter((stage) => stage.row === 9);
    const rows = Array.from(new Set(mainPipeline.map((stage) => stage.row))).map((row) => (
        mainPipeline.filter((stage) => stage.row === row).sort((a, b) => a.order - b.order)
    ));

    const parallelCandidates = [
        {
            titles: '动态世界 / 规划分析 / 地图更新',
            possible: true,
            reason: '代码已解耦为同一份变量后快照；三者渠道都不同且接口可用时会并行，否则按左到右顺序串行。',
            channels: ['world', 'planning', 'map']
        },
        {
            titles: '文章优化 / 变量生成',
            possible: true,
            reason: '代码已改为同读主剧情原始快照；两者渠道不同且接口可用时并行，否则按左到右顺序串行。',
            channels: ['polish', 'variable']
        }
    ].map((item) => {
        const related = item.channels
            .map((id) => stages.find((stage) => stage.id === id))
            .filter((stage): stage is FlowStage => Boolean(stage));
        const enabled = related.filter((stage) => stage.status === 'enabled' || stage.status === 'fallback');
        const channelIds = enabled.map((stage) => stage.channelId || stage.channel).filter(Boolean);
        const hasSeparateChannels = enabled.length > 1 && new Set(channelIds).size === enabled.length;
        return {
            ...item,
            hasSeparateChannels,
            channelsText: enabled.map((stage) => `${stage.title}:${stage.channel}`).join('，') || '暂无启用阶段'
        };
    });

    const getSelectedConfig = (channelId?: string): 单接口配置结构 | null => (
        normalized.configs.find((cfg) => cfg.id === channelId) || normalized.configs[0] || null
    );

    const updatePlaceholderStage = (stage: FlowStage, patch: Partial<功能模型占位配置结构>) => {
        const cfg = stage.modelConfig;
        if (!cfg || cfg.kind !== 'placeholder') return;
        persistForm((prev) => ({
            ...prev,
            功能模型占位: {
                ...prev.功能模型占位,
                ...((cfg.enableKeys || []).reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<string, unknown>) as Partial<功能模型占位配置结构>),
                ...patch
            }
        }));
    };

    const updateMainChannel = (channelId: string) => {
        const nextConfig = normalized.configs.find((cfg) => cfg.id === channelId) || normalized.configs[0] || null;
        persistForm((prev) => ({
            ...prev,
            activeConfigId: channelId || prev.activeConfigId,
            功能模型占位: {
                ...prev.功能模型占位,
                主剧情使用模型: trim(nextConfig?.model)
            }
        }));
    };

    const updateMainModel = (model: string) => {
        const activeId = normalized.activeConfigId || normalized.configs[0]?.id || '';
        persistForm((prev) => ({
            ...prev,
            configs: prev.configs.map((cfg) => cfg.id === activeId ? { ...cfg, model, updatedAt: Date.now() } : cfg),
            功能模型占位: { ...prev.功能模型占位, 主剧情使用模型: model }
        }));
    };

    const resolveStageApi = (stage: FlowStage): 当前可用接口结构 | null => {
        const cfg = stage.modelConfig;
        if (!cfg || stage.localOnly) return null;
        const selectedChannelId = cfg.kind === 'main'
            ? (normalized.activeConfigId || normalized.configs[0]?.id || '')
            : trim(normalized.功能模型占位[cfg.channelKey!]) || normalized.activeConfigId || normalized.configs[0]?.id || '';
        const selectedConfig = getSelectedConfig(selectedChannelId) || {
            id: selectedChannelId || `${stage.id}_dedicated`,
            名称: `${stage.title}独立接口`,
            供应商: 'openai_custom' as const,
            协议覆盖: 'auto' as const,
            baseUrl: '',
            apiKey: '',
            model: '',
            maxTokens: undefined,
            temperature: undefined
        };
        const baseUrl = cfg.kind === 'placeholder'
            ? trim(normalized.功能模型占位[cfg.baseUrlKey!]) || trim(selectedConfig.baseUrl)
            : trim(selectedConfig.baseUrl);
        const apiKey = cfg.kind === 'placeholder'
            ? trim(normalized.功能模型占位[cfg.apiKeyKey!]) || trim(selectedConfig.apiKey)
            : trim(selectedConfig.apiKey);
        const model = cfg.kind === 'main'
            ? trim(selectedConfig.model || normalized.功能模型占位.主剧情使用模型)
            : trim(normalized.功能模型占位[cfg.modelKey!]);
        return {
            id: selectedConfig.id,
            名称: selectedConfig.名称,
            供应商: selectedConfig.供应商,
            协议覆盖: selectedConfig.协议覆盖,
            baseUrl,
            apiKey,
            model,
            maxTokens: selectedConfig.maxTokens,
            temperature: selectedConfig.temperature
        };
    };

    const fetchModelsForStage = async (stage: FlowStage) => {
        const cfg = stage.modelConfig;
        if (!cfg) return;
        const api = resolveStageApi(stage);
        if (!api?.baseUrl || !api?.apiKey) {
            setStageMessage(stage.id, '请先选择有 Base URL 和 API Key 的渠道。');
            return;
        }
        setLoadingStageId(stage.id);
        setStageMessage(stage.id, '');
        try {
            const candidateUrls = 构建OpenAI兼容模型列表候选地址(api.baseUrl);
            for (const url of candidateUrls) {
                const res = await fetch(url, { headers: { Authorization: `Bearer ${api.apiKey}` } });
                if (!res.ok) continue;
                const data = await res.json();
                if (Array.isArray(data?.data)) {
                    const models = data.data.map((m: any) => trim(m?.id)).filter(Boolean);
                    setModelOptionsByStage((prev) => ({ ...prev, [stage.id]: models }));
                    setStageMessage(stage.id, '模型列表已刷新。');
                    return;
                }
            }
            setStageMessage(stage.id, '获取失败：返回格式错误。');
        } catch (error: any) {
            setStageMessage(stage.id, `获取失败：${error?.message || '网络异常'}`);
        } finally {
            setLoadingStageId('');
        }
    };

    const testStageConnection = async (stage: FlowStage) => {
        const api = resolveStageApi(stage);
        if (!api?.baseUrl) {
            setStageMessage(stage.id, '测试失败：缺少 Base URL。');
            return;
        }
        if (!api.apiKey) {
            setStageMessage(stage.id, '测试失败：缺少 API Key。');
            return;
        }
        if (!api.model) {
            setStageMessage(stage.id, '测试失败：请先为该阶段选择模型。');
            return;
        }
        const messages: 通用消息[] = [
            { role: 'user', content: '你好，请只回复 OK。' }
        ];
        const startedAt = Date.now();
        setTestingStageId(stage.id);
        setStageMessage(stage.id, '正在发送测试消息...');
        try {
            const text = await 请求模型文本(api, messages, {
                temperature: 0,
                streamOptions: { stream: false },
                errorDetailLimit: 1200,
                disableThinking: true,
                stripReasoning: true
            });
            const elapsed = Date.now() - startedAt;
            const reply = trim(text).replace(/\s+/g, ' ').slice(0, 80) || '无文本回复';
            setStageMessage(stage.id, `测试成功：${elapsed}ms，回复：${reply}`);
        } catch (error: any) {
            // 协议请求错误的 message 是已翻译的中文处置建议（如 401/404），原始详情留在
            // detail 仅作诊断，因此优先展示 message；其他错误维持原有展示顺序。
            const raw = error instanceof 协议请求错误
                ? error.message
                : error?.detail ?? error?.message ?? error ?? '未知错误';
            const detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
            setStageMessage(stage.id, `测试失败：${detail.slice(0, 240)}`);
        } finally {
            setTestingStageId('');
        }
    };

    const stageInlineSelector = (stage: FlowStage) => {
        const cfg = stage.modelConfig;
        if (!cfg || stage.localOnly) return null;
        const selectedChannelId = cfg.kind === 'main'
            ? (normalized.activeConfigId || normalized.configs[0]?.id || '')
            : trim(normalized.功能模型占位[cfg.channelKey!]) || normalized.activeConfigId || normalized.configs[0]?.id || '';
        const selectedConfig = getSelectedConfig(selectedChannelId);
        const modelValue = cfg.kind === 'main'
            ? trim(selectedConfig?.model || normalized.功能模型占位.主剧情使用模型)
            : trim(normalized.功能模型占位[cfg.modelKey!]);
        const modelOptions = cfg.kind === 'main'
            ? Array.from(new Set([
                ...(modelOptionsByStage[stage.id] || []),
                modelValue,
                trim(selectedConfig?.model),
                trim(mainApi?.model)
            ].filter(Boolean)))
            : Array.from(new Set([
                ...(modelOptionsByStage[stage.id] || []),
                modelValue
            ].filter(Boolean)));
        return (
            <div className="mt-2 space-y-1.5" onClick={(event) => event.stopPropagation()}>
                <InlineSelect
                    value={selectedChannelId}
                    options={normalized.configs.map((cfgItem) => ({
                        value: cfgItem.id,
                        label: `${cfgItem.名称 || '未命名渠道'}${trim(cfgItem.model) ? ` · ${trim(cfgItem.model)}` : ''}`
                    }))}
                    onChange={(channelId) => {
                        const nextConfig = getSelectedConfig(channelId);
                        if (cfg.kind === 'main') {
                            updateMainChannel(channelId);
                        } else {
                            updatePlaceholderStage(stage, {
                                [cfg.channelKey!]: channelId,
                                [cfg.modelKey!]: trim(nextConfig?.model),
                                [cfg.baseUrlKey!]: '',
                                [cfg.apiKeyKey!]: ''
                            } as Partial<功能模型占位配置结构>);
                        }
                        setModelOptionsByStage((prev) => ({ ...prev, [stage.id]: [] }));
                    }}
                    disabled={normalized.configs.length === 0 || !onSave}
                    placeholder="选择渠道"
                    wrapLabel
                    buttonClassName="min-h-7 rounded-sm border-gray-700 bg-black/35 px-2 py-1 text-[9px] leading-4"
                    panelClassName="text-[10px]"
                    optionClassName="px-2 py-1.5 text-[10px] leading-4"
                />
                <div className="relative z-20 space-y-1.5">
                    <InlineSelect
                        value={modelValue}
                        options={modelOptions.map((model) => ({ value: model, label: model }))}
                        onChange={(model) => {
                            if (cfg.kind === 'main') {
                                updateMainModel(model);
                            } else {
                                updatePlaceholderStage(stage, { [cfg.modelKey!]: model } as Partial<功能模型占位配置结构>);
                            }
                        }}
                        disabled={modelOptions.length === 0 || !onSave}
                        placeholder="选择模型"
                        wrapLabel
                        buttonClassName="min-h-7 rounded-sm border-gray-700 bg-black/35 px-2 py-1 text-[9px] leading-4"
                        panelClassName="text-[10px]"
                        optionClassName="px-2 py-1.5 text-[10px] leading-4"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                    <button
                        type="button"
                        onClick={() => fetchModelsForStage(stage)}
                        className="h-[28px] min-w-0 rounded-sm border border-wuxia-cyan/45 bg-wuxia-cyan/10 px-1.5 text-center text-[10px] font-bold leading-none text-wuxia-cyan shadow-sm transition hover:border-wuxia-cyan hover:bg-wuxia-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!onSave || loadingStageId === stage.id}
                    >
                        {loadingStageId === stage.id ? '...' : '刷新模型'}
                    </button>
                    <button
                        type="button"
                        onClick={() => testStageConnection(stage)}
                        className="h-[28px] min-w-0 rounded-sm border border-emerald-400/45 bg-emerald-500/10 px-1.5 text-center text-[10px] font-bold leading-none text-emerald-200 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={testingStageId === stage.id || !modelValue}
                    >
                        {testingStageId === stage.id ? '...' : '测试连接'}
                    </button>
                    </div>
                </div>
                {stageMessages[stage.id] && <div className="text-[10px] leading-4 text-wuxia-cyan">{stageMessages[stage.id]}</div>}
            </div>
        );
    };

    const StageTipTooltip: React.FC<{ tipText: string }> = ({ tipText }) => {
        const [showTip, setShowTip] = useState(false);
        return (
            <div className="relative" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 bg-black/30 text-[10px] text-gray-400 cursor-help">?</span>
                {showTip && (
                    <div className="workflow-stage-tip absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-md border border-wuxia-gold/30 bg-gray-950 px-3 py-2 text-[10px] leading-5 text-gray-200 shadow-lg">
                        {tipText}
                        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-950" />
                    </div>
                )}
            </div>
        );
    };

    const stageCard = (stage: FlowStage) => {
        const clickable = Boolean(stage.configTab && onNavigate);
        const hasInlineControls = Boolean(stage.modelConfig && !stage.localOnly);
        const toggleConfig = stageToggleTips[stage.id];
        const isToggleOn = toggleConfig ? (normalized.功能模型占位[toggleConfig.enableKey] !== false) : undefined;
        const className = `${hasInlineControls ? 'min-h-[214px]' : 'min-h-[132px]'} w-[210px] shrink-0 rounded border px-3 py-2 text-left shadow-inner transition ${statusClass[stage.status]} ${
            clickable ? 'hover:-translate-y-0.5 hover:border-wuxia-gold/70' : ''
        }`;
        const content = (
            <>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold tracking-[0.12em] text-white">{stage.title}</span>
                        {/* 「模型配置建议」问号：与下方开关注解（做什么）互补，这里回答该配什么模型 */}
                        <功能模型建议说明 stageId={stage.id} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-400">{stage.subtitle}</div>
                </div>
                <span className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 text-[10px] text-current">
                    {statusText[stage.status]}
                </span>
            </div>
            {toggleConfig && (
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            if (!onSave) return;
                            const currentValue = normalized.功能模型占位[toggleConfig.enableKey];
                            const nextValue = currentValue === false;
                            persistForm((prev) => ({
                                ...prev,
                                功能模型占位: {
                                    ...prev.功能模型占位,
                                    [toggleConfig.enableKey]: nextValue
                                }
                            }));
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            isToggleOn !== false
                                ? 'bg-emerald-500/80'
                                : 'bg-gray-600/80'
                        } ${onSave ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                        <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                                isToggleOn !== false ? 'translate-x-[18px]' : 'translate-x-[3px]'
                            }`}
                        />
                    </button>
                    <span className="text-[10px] text-gray-300">{isToggleOn !== false ? '开启' : '关闭'}</span>
                    <StageTipTooltip tipText={toggleConfig.tipText} />
                </div>
            )}
            {stageNonStreamKeys[stage.id] && (
                <div className="mt-1.5 flex items-center gap-2">
                    <button
                        type="button"
                        aria-label={`${stage.title}输出模式：${normalized.功能模型占位[stageNonStreamKeys[stage.id]!] === true ? '非流式' : '流式'}`}
                        aria-pressed={normalized.功能模型占位[stageNonStreamKeys[stage.id]!] === true}
                        onClick={() => {
                            if (!onSave) return;
                            const key = stageNonStreamKeys[stage.id]!;
                            const next = normalized.功能模型占位[key] !== true;
                            persistForm((prev) => ({
                                ...prev,
                                功能模型占位: { ...prev.功能模型占位, [key]: next }
                            }));
                        }}
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                            normalized.功能模型占位[stageNonStreamKeys[stage.id]!] === true
                                ? 'bg-amber-500/70 [html[data-theme="day"]_&]:bg-amber-600'
                                : 'bg-gray-600/60 [html[data-theme="day"]_&]:bg-gray-300'
                        } ${onSave ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                        <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${
                            normalized.功能模型占位[stageNonStreamKeys[stage.id]!] === true
                                ? 'translate-x-[14px]' : 'translate-x-[2px]'
                        }`} />
                    </button>
                    <span className={`text-[9px] ${
                        normalized.功能模型占位[stageNonStreamKeys[stage.id]!] === true
                            ? 'text-amber-300/90 [html[data-theme="day"]_&]:text-amber-800'
                            : 'text-gray-500 [html[data-theme="day"]_&]:text-gray-700'
                    }`}>
                        {normalized.功能模型占位[stageNonStreamKeys[stage.id]!] === true ? '非流式' : '流式'}
                    </span>
                </div>
            )}
            <div className="mt-1 space-y-0.5 text-[10px] leading-4">
                <div className="break-all text-gray-300">渠道：<span className="text-wuxia-cyan">{stage.channel}</span></div>
                <div className="break-all text-gray-300">模型：<span className="text-wuxia-gold">{stage.model}</span></div>
                {stageInlineSelector(stage)}
                <div className="text-gray-500">{stage.note}</div>
                {clickable && (
                    <button
                        type="button"
                        className="mt-1 inline-flex h-6 items-center rounded-sm border border-wuxia-gold/35 bg-wuxia-gold/10 px-2 text-[10px] font-bold text-wuxia-gold transition hover:border-wuxia-gold hover:bg-wuxia-gold/20"
                        onClick={() => stage.configTab && onNavigate?.(stage.configTab)}
                    >
                        完整配置
                    </button>
                )}
            </div>
            </>
        );
        return <div key={stage.id} className={className}>{content}</div>;
    };

    return (
        <div className="space-y-6 text-sm animate-fadeIn">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-wuxia-gold/30 pb-3">
                <div>
                    <h3 className="text-wuxia-gold font-serif font-bold text-xl">生成流程图</h3>
                    <p className="mt-2 text-xs text-gray-400">
                        展示当前配置下每个生成阶段的启用状态、渠道和模型；同一排代表已支持并行判定的阶段。
                    </p>
                </div>
                <div className="rounded border border-wuxia-cyan/30 bg-wuxia-cyan/10 px-3 py-2 text-[11px] text-wuxia-cyan">
                    想真正并行，请给同排阶段配置不同渠道；同渠道会被视为排队链路。
                </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-wuxia-gold/20 bg-black/25 p-3 custom-scrollbar">
                <div className="min-w-[760px] space-y-2">
                    {rows.map((row, index) => {
                        const enabledRow = row.filter((stage) => stage.status === 'enabled' || stage.status === 'fallback');
                        const rowChannels = enabledRow.map((stage) => stage.channelId || stage.channel).filter(Boolean);
                        const canParallel = row.length > 1 && enabledRow.length > 1 && new Set(rowChannels).size === rowChannels.length;
                        return (
                            <React.Fragment key={`row-${index}`}>
                                <div className="flex items-stretch justify-center gap-2">
                                    {row.map((stage, stageIndex) => (
                                        <React.Fragment key={stage.id}>
                                            {stageIndex > 0 && (
                                                <div className={`flex w-8 items-center justify-center text-2xl font-black ${canParallel ? 'text-emerald-500' : 'text-amber-600'}`}>
                                                    →
                                                </div>
                                            )}
                                            {stageCard(stage)}
                                        </React.Fragment>
                                    ))}
                                </div>
                                {index < rows.length - 1 && (
                                    <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
                                        <span className="h-px w-20 bg-gray-700" />
                                        <span className="text-2xl leading-none">↓</span>
                                        <span>{row.length > 1 ? (canParallel ? '并行汇合后继续' : '同渠道或未启用，左到右排队') : '继续'}</span>
                                        <span className="h-px w-20 bg-gray-700" />
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-wuxia-cyan/20 bg-black/20 p-4">
                    <div className="text-xs font-bold text-wuxia-cyan">并行判定</div>
                    <div className="mt-3 space-y-2">
                        {parallelCandidates.map((hint) => (
                            <div key={hint.titles} className="rounded border border-gray-800 bg-black/25 p-3 text-[11px]">
                                <div className="text-gray-200">{hint.titles}</div>
                                <div className={hint.possible && hint.hasSeparateChannels ? 'mt-1 text-emerald-300' : 'mt-1 text-amber-300'}>
                                    {hint.possible && hint.hasSeparateChannels
                                        ? '当前可并行：阶段依赖已解耦，且启用阶段使用了不同渠道。'
                                        : '当前仍按单向链路排队。'}
                                </div>
                                <div className="mt-1 text-gray-500">{hint.reason}</div>
                                <div className="mt-1 text-gray-500">{hint.channelsText}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-md border border-wuxia-gold/20 bg-black/20 p-4">
                    <div className="text-xs font-bold text-wuxia-gold">旁路流程</div>
                    <div className="mt-3 flex min-w-0 flex-wrap justify-center gap-2">
                        {sidePipeline.map(stageCard)}
                    </div>
                </div>
            </div>

            <div className="rounded-md border border-gray-800 bg-black/20 p-4 text-[11px] leading-6 text-gray-400">
                当前主链路为：剧情回忆、主剧情，然后文章优化/变量生成进入并行判定，再由变量生成后的状态进入动态世界/规划分析/地图更新并行判定。
                同排阶段都启用且使用不同渠道时会并行；否则仍按拓扑图中左到右、上到下的单向顺序执行。最终落盘是本地状态合并，不调用 AI。
            </div>
        </div>
    );
};

export default WorkflowGraphSettings;
