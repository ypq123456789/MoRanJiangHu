
import {
    角色数据结构,
    环境信息结构,
    聊天记录结构,
    接口设置结构,
    提示词结构,
    视觉设置结构,
    节日结构,
    GameResponse,
    游戏设置结构,
    记忆配置结构,
    记忆系统结构,
    WorldGenConfig,
    世界数据结构,
    战斗状态结构,
    详细门派结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    OpeningConfig,
    NPC结构,
    场景图片档案,
    场景生图任务记录,
    NPC生图任务记录,
    生图任务来源类型,
    香闺秘档部位类型,
    图片管理设置结构,
    内置提示词条目结构,
    世界书结构,
    世界书预设组结构,
    世界书作用域,
    TavernCommand
} from '../types';
import { useEffect, useRef, useState } from 'react';
import * as dbService from '../services/dbService';
import * as textAIService from '../services/ai/text';
import { useGameState } from './useGameState';
import { 规范化接口设置, 获取当前接口配置, 获取主剧情接口配置, 获取剧情回忆接口配置, 获取记忆总结接口配置, 获取文章优化接口配置, 获取变量计算接口配置, 获取世界演变接口配置, 获取文生图接口配置, 获取场景文生图接口配置, 获取生图词组转化器接口配置, 获取生图画师串预设, 获取词组转化器预设提示词, 接口配置是否可用, 变量校准功能已启用 as 变量生成功能已启用 } from '../utils/apiConfig';
import type { 当前可用接口结构 } from '../utils/apiConfig';
import {
    规范化记忆系统,
    规范化记忆配置,
    构建即时记忆条目,
    构建短期记忆条目,
    写入四段记忆,
    构建待处理记忆压缩任务,
    构建手动记忆压缩任务,
    应用记忆压缩结果,
    记忆压缩任务结构
} from './useGame/memoryUtils';
import { 执行主剧情发送工作流 } from './useGame/sendWorkflow';
import { 执行正文润色 as 执行正文润色工作流 } from './useGame/bodyPolish';
import { 构建上下文快照数据 } from './useGame/contextSnapshot';
import { 执行响应命令处理 } from './useGame/responseCommandProcessor';
import { 创建会话生命周期工作流 } from './useGame/sessionLifecycleWorkflow';
import {
    构建系统提示词 as 构建系统提示词工作流,
    type 运行时提示词状态
} from './useGame/systemPromptBuilder';
import {
    创建开场基础状态,
    创建开场命令基态,
    构建前端清空开场状态,
    创建开场空白剧情,
    创建开场空白环境,
    创建开场空白世界,
    创建开场空白战斗,
    创建空剧情规划,
    创建空门派状态,
    创建空记忆系统,
    规范化世界状态,
    规范化战斗状态,
    规范化门派状态,
    规范化剧情状态,
    规范化剧情规划状态 as 基础规范化剧情规划状态,
    规范化女主剧情规划状态 as 基础规范化女主剧情规划状态,
    规范化同人剧情规划状态 as 基础规范化同人剧情规划状态,
    规范化同人女主剧情规划状态 as 基础规范化同人女主剧情规划状态,
    战斗结束自动清空,
    按回合窗口裁剪历史
} from './useGame/storyState';
import type { 开场命令基态 } from './useGame/storyState';
import { 执行世界演变更新工作流 } from './useGame/worldEvolutionWorkflow';
import { 主角角色锚点标识, 创建图片预设工作流, 提取NPC生图基础数据附带私密描述 } from './useGame/imagePresetWorkflow';
import { 创建设置持久化工作流 } from './useGame/config/settingsPersistenceWorkflow';
import { 创建历史回合工作流 } from './useGame/historyTurnWorkflow';
import { 创建存读档工作流 } from './useGame/saveLoad/saveLoadWorkflow';
import { 创建规划更新工作流 } from './useGame/planningUpdateWorkflow';
import { 创建NPC图片状态工作流, 合并NPC图片档案, 生成NPC生图记录ID } from './useGame/npcImageStateWorkflow';
import { 创建场景图片档案工作流, 按场景图上限裁剪档案, 生成场景生图记录ID, 规范化场景图片档案 } from './useGame/sceneImageArchiveWorkflow';
import { 创建场景生图触发工作流 } from './useGame/sceneImageTriggerWorkflow';
import { 创建手动图片动作工作流 } from './useGame/image/manualImageActionsWorkflow';
import { 创建手动NPC工作流 } from './useGame/manualNpcWorkflow';
import { 创建主角图片工作流 } from './useGame/playerImageWorkflow';
import { 创建运行时变量工作流 } from './useGame/runtimeVariableWorkflow';
import { 创建变量校准协调器 as 创建变量生成协调器 } from './useGame/variableCalibrationCoordinator';
import { use世界演变控制 } from './useGame/worldEvolutionControl';
import { normalizeCanonicalGameTime, 环境时间转标准串, 提取环境月日, 结构化时间转标准串 } from './useGame/timeUtils';
import { 构建NPC上下文, 提取NPC生图基础数据, 提取NPC香闺秘档部位生图数据, 提取主角生图基础数据 } from './useGame/npcContext';
import { 应用NPC记忆总结, 构建手动NPC记忆总结候选, 构建自动NPC记忆总结候选, 构建NPC记忆总结回退文案 } from './useGame/npcMemorySummary';
import { 规范化游戏设置 } from '../utils/gameSettings';
import { 规范化视觉设置 } from '../utils/visualSettings';
import { 默认图片管理设置, 规范化图片管理设置 } from '../utils/imageManagerSettings';
import { 规范化可选开局配置 } from '../utils/openingConfig';
import {
    构建COT伪装提示词,
    构建酒馆预设消息链,
    构建运行时提示词池,
    规范化比较文本,
    酒馆预设模式可用
} from './useGame/promptRuntime';
import { 构建世界观种子提示词, 构建世界生成任务上下文提示词 } from '../prompts/runtime/worldSetup';
import { 世界观生成COT提示词, 世界观生成COT伪装历史消息提示词 } from '../prompts/runtime/worldGenerationCot';
import {
    默认文章优化提示词
} from '../prompts/runtime/defaults';
import { 构建文生图运行时额外提示词 } from '../prompts/runtime/nsfw';
import { 构建AI角色声明提示词 } from '../prompts/runtime/roleIdentity';
import {
    构建字数要求提示词,
    构建免责声明输出要求提示词,
    获取输出协议提示词,
    获取行动选项提示词
} from '../prompts/runtime/protocolDirectives';
import { 构建剧情风格助手提示词 } from '../prompts/runtime/storyStyles';
import { 构建真实世界模式提示词 } from '../prompts/runtime/realWorldMode';
import { 核心_文章优化思维链 } from '../prompts/core/cotPolish';
import { 核心_开局思维链 } from '../prompts/core/cotOpening';
import { 数值_世界演化 } from '../prompts/stats/world';
import {
    规范化环境信息,
    构建完整地点文本,
    规范化角色物品容器映射,
    规范化社交列表
} from './useGame/stateTransforms';
import { 按世界演变分流净化响应 } from './useGame/storyResponseGuards';
import { 执行变量自动校准 } from './useGame/variableCalibration';
import { 执行变量模型校准工作流 } from './useGame/variableModelWorkflow';
import { 合并变量校准结果到响应 as 合并变量生成结果到响应 } from './useGame/variableCalibrationMerge';
import { 获取图片展示地址, 压缩图片资源字段 } from '../utils/imageAssets';
import { 设置键 } from '../utils/settingsSchema';
import { countOpenAIChatMessagesTokens, countOpenAITextTokens } from '../utils/tokenEstimate';

const 加载图片AI服务 = () => import('../services/ai/image/runtime');
const 加载NPC生图工作流 = () => import('./useGame/npcImageWorkflow');
const 加载NPC香闺秘档生图工作流 = () => import('./useGame/npcSecretImageWorkflow');
const 加载场景生图工作流 = () => import('./useGame/sceneImageWorkflow');

type 回合快照结构 = {
    玩家输入: string;
    游戏时间: string;
    回档前状态: {
        角色: 角色数据结构;
        环境: 环境信息结构;
        社交: any[];
        世界: 世界数据结构;
        战斗: 战斗状态结构;
        玩家门派: 详细门派结构;
        任务列表: any[];
        约定列表: any[];
        剧情: 剧情系统结构;
        剧情规划: 剧情规划结构;
        女主剧情规划?: 女主剧情规划结构;
        同人剧情规划?: 同人剧情规划结构;
        同人女主剧情规划?: 同人女主剧情规划结构;
        记忆系统: 记忆系统结构;
    };
    回档前持久态: {
        视觉设置: 视觉设置结构;
        场景图片档案: 场景图片档案;
    };
    回档前历史: 聊天记录结构[];
};

type 最近开局配置结构 = {
    worldConfig: WorldGenConfig;
    charData: 角色数据结构;
    openingConfig?: OpeningConfig;
    openingStreaming: boolean;
    openingExtraPrompt: string;
};

type 快速重开模式 = 'world_only' | 'opening_only' | 'all';

type 开局独立阶段进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type 世界生成选项 = {
    清空前端变量?: boolean;
};

type 上下文段 = {
    id: string;
    title: string;
    category: string;
    order: number;
    content: string;
    uploadTokens: number;
};

type 上下文快照 = {
    sections: 上下文段[];
    fullText: string;
    uploadTokens: number;
    runtimePromptStates: Record<string, 运行时提示词状态>;
};

type 发送结果 = {
    cancelled?: boolean;
    attachedRecallPreview?: string;
    preparedRecallTag?: string;
    needRecallConfirm?: boolean;
    needRerollConfirm?: boolean;
    parseErrorMessage?: string;
    parseErrorDetail?: string;
    parseErrorRawText?: string;
    errorDetail?: string;
    errorTitle?: string;
};

const 自动重试最大次数 = 3;

type 回忆检索进度 = {
    phase: 'start' | 'stream' | 'done' | 'error';
    text?: string;
};

type 正文润色进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type 变量生成进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type 独立阶段标识 = 'polish' | 'world' | 'planning' | 'variable';
type 独立阶段失败决策 = 'retry' | 'skip';
type 独立阶段失败决策参数 = {
    stageId: 独立阶段标识;
    stageLabel: string;
    errorText: string;
};

type 规划分析进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type 世界演变进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type 变量生成上下文缓存项 = {
    回合: number;
    玩家输入: string;
    正文: string;
    本回合命令: string[];
    校准说明: string[];
    校准命令: string[];
};

type 发送选项 = {
    onRecallProgress?: (progress: 回忆检索进度) => void;
    onPolishProgress?: (progress: 正文润色进度) => void;
    onWorldEvolutionProgress?: (progress: 世界演变进度) => void;
    onPlanningProgress?: (progress: 规划分析进度) => void;
    onVariableGenerationProgress?: (progress: 变量生成进度) => void;
    onStageFailureDecision?: (params: 独立阶段失败决策参数) => Promise<独立阶段失败决策> | 独立阶段失败决策;
};

type 记忆总结阶段类型 = 'idle' | 'remind' | 'processing' | 'review';
type NPC记忆总结任务结构 = {
    id: string;
    类型: 'npc_memory';
    npcId: string;
    npcName: string;
    批次: string[];
    批次条数: number;
    起始索引: number;
    结束索引: number;
    起始时间: string;
    结束时间: string;
    提示词模板: string;
    触发方式: 'auto' | 'manual';
    预留原始条数: number;
};
type 右下角提示结构 = {
    id: string;
    title: string;
    message: string;
    tone?: 'info' | 'success' | 'error';
};

export const useGame = () => {
    const gameState = useGameState();
    const {
        view, setView,
        hasSave, setHasSave,
        角色, 设置角色,
        环境, 设置环境,
        社交, 设置社交,
        世界, 设置世界,
        战斗, 设置战斗,
        玩家门派, 设置玩家门派,
        任务列表, 设置任务列表,
        约定列表, 设置约定列表,
        剧情, 设置剧情,
        剧情规划, 设置剧情规划,
        女主剧情规划, 设置女主剧情规划,
        同人剧情规划, 设置同人剧情规划,
        同人女主剧情规划, 设置同人女主剧情规划,
        开局配置, 设置开局配置,
        游戏初始时间, 设置游戏初始时间,
        历史记录, 设置历史记录,
        记忆系统, 设置记忆系统,
        loading, setLoading,
        worldEvents, setWorldEvents,
        showSettings, setShowSettings,
        showInventory, setShowInventory,
        showEquipment, setShowEquipment,
        showBattle, setShowBattle,
        showSocial, setShowSocial,
        showTeam, setShowTeam,
        showKungfu, setShowKungfu,
        showWorld, setShowWorld,
        showMap, setShowMap,
        showSect, setShowSect,
        showTask, setShowTask,
        showAgreement, setShowAgreement,
        showStory, setShowStory,
        showHeroinePlan, setShowHeroinePlan,
        showMemory, setShowMemory,
        showSaveLoad, setShowSaveLoad,
        activeTab, setActiveTab,
        
        apiConfig, setApiConfig,
        visualConfig, setVisualConfig,
        imageManagerConfig, setImageManagerConfig,
        gameConfig, setGameConfig,
        memoryConfig, setMemoryConfig,
        prompts, setPrompts,
        ensurePromptsLoaded,
        festivals, setFestivals,
        currentTheme, setCurrentTheme,
        scrollRef, abortControllerRef, variableGenerationAbortControllerRef
    } = gameState;
    const 回合快照栈Ref = useRef<回合快照结构[]>([]);
    const 最近自动存档时间戳Ref = useRef<number>(0);
    const 最近自动存档签名Ref = useRef<string>('');
    const [可重Roll计数, set可重Roll计数] = useState(0);
    const [最近开局配置, 设置最近开局配置] = useState<最近开局配置结构 | null>(null);
    const apiConfigRef = useRef(apiConfig);
    const visualConfigRef = useRef(visualConfig);
    const imageManagerConfigRef = useRef<图片管理设置结构>(imageManagerConfig || 默认图片管理设置);
    const [世界演变更新中, set世界演变更新中] = useState(false);
    const [世界演变状态文本, set世界演变状态文本] = useState('世界演变待命');
    // 世界演变“最近更新时间”应使用游戏内时间戳（用于展示/归档），而非现实时间。
    const [世界演变最近更新时间, set世界演变最近更新时间State] = useState<string | null>(null);
    // 仍然需要一个现实时间戳用于前端去抖/冷启动保护（避免依赖抖动导致 auto_due 连续触发）。
    const 世界演变最近现实更新时间戳Ref = useRef<number>(0);
    const set世界演变最近更新时间 = (value: string | null) => {
        set世界演变最近更新时间State(value);
        世界演变最近现实更新时间戳Ref.current = Date.now();
    };
    const [世界演变最近摘要, set世界演变最近摘要] = useState<string[]>([]);
    const [世界演变最近原始消息, set世界演变最近原始消息] = useState('');
    const [待处理记忆总结任务, set待处理记忆总结任务] = useState<记忆压缩任务结构 | null>(null);
    const [记忆总结阶段, set记忆总结阶段] = useState<记忆总结阶段类型>('idle');
    const [记忆总结草稿, set记忆总结草稿] = useState('');
    const [记忆总结错误, set记忆总结错误] = useState('');
    const [待处理NPC记忆总结队列, set待处理NPC记忆总结队列] = useState<NPC记忆总结任务结构[]>([]);
    const [NPC记忆总结阶段, setNPC记忆总结阶段] = useState<记忆总结阶段类型>('idle');
    const [NPC记忆总结草稿, setNPC记忆总结草稿] = useState('');
    const [NPC记忆总结错误, setNPC记忆总结错误] = useState('');
    const 上下文快照缓存Ref = useRef<{
        value: 上下文快照;
        refs: unknown[];
    } | null>(null);
    const 世界演变进行中Ref = useRef(false);
    const 世界演变去重签名Ref = useRef('');
    const 最近变量生成上下文Ref = useRef<变量生成上下文缓存项[]>([]);
    const NPC生图进行中Ref = useRef<Set<string>>(new Set());
    const 主角生图进行中Ref = useRef<Set<string>>(new Set());
    const NPC香闺秘档生图进行中Ref = useRef<Set<string>>(new Set());
    const [NPC生图任务队列, setNPC生图任务队列] = useState<NPC生图任务记录[]>([]);
    const 场景生图自动应用任务Ref = useRef('');
    const 场景图片档案Ref = useRef<场景图片档案>({});
    const [场景图片档案, set场景图片档案] = useState<场景图片档案>({});
    const [场景生图任务队列, set场景生图任务队列] = useState<场景生图任务记录[]>([]);
    const 后台手动生图监控Ref = useRef<Array<{ npcId: string; since: number; npcName: string; 构图: '头像' | '半身' | '立绘' }>>([]);
    const 已提示后台生图任务Ref = useRef<Set<string>>(new Set());
    const 后台私密生图监控Ref = useRef<Array<{ npcId: string; since: number; npcName: string; 部位: 香闺秘档部位类型 }>>([]);
    const 已提示后台私密生图任务Ref = useRef<Set<string>>(new Set());
    const 后台场景生图监控Ref = useRef<Array<{ since: number; 摘要: string }>>([]);
    const 已提示后台场景生图任务Ref = useRef<Set<string>>(new Set());
    const [右下角提示列表, set右下角提示列表] = useState<右下角提示结构[]>([]);
    const [聊天区自动滚动抑制令牌, set聊天区自动滚动抑制令牌] = useState(0);
    const [聊天区强制置底令牌, set聊天区强制置底令牌] = useState(0);
    const [变量生成中, set变量生成中] = useState(false);
    const [后台队列处理中, set后台队列处理中] = useState(false);
    const [开局变量生成进度, set开局变量生成进度] = useState<开局独立阶段进度 | null>(null);
    const [开局世界演变进度, set开局世界演变进度] = useState<开局独立阶段进度 | null>(null);
    const [开局规划进度, set开局规划进度] = useState<开局独立阶段进度 | null>(null);
    const [内置提示词列表, set内置提示词列表] = useState<内置提示词条目结构[]>([]);
    const [世界书列表, set世界书列表] = useState<世界书结构[]>([]);
    const [世界书预设组列表, set世界书预设组列表] = useState<世界书预设组结构[]>([]);

    useEffect(() => {
        apiConfigRef.current = apiConfig;
    }, [apiConfig]);

    useEffect(() => {
        visualConfigRef.current = visualConfig;
    }, [visualConfig]);

    useEffect(() => {
        imageManagerConfigRef.current = 规范化图片管理设置(imageManagerConfig);
    }, [imageManagerConfig]);

    useEffect(() => {
        刷新NPC记忆总结队列(Array.isArray(社交) ? 社交 : [], { 静默: NPC记忆总结阶段 === 'processing' || NPC记忆总结阶段 === 'review' });
    }, [社交, memoryConfig]);

    // --- Actions ---
    const 深拷贝 = <T,>(data: T): T => {
        if (data === undefined || data === null) {
            return data;
        }
        if (typeof structuredClone === 'function') {
            return structuredClone(data);
        }
        return JSON.parse(JSON.stringify(data)) as T;
    };
    const 重置自动存档状态 = () => {
        最近自动存档时间戳Ref.current = 0;
        最近自动存档签名Ref.current = '';
    };
    const 删除最近自动存档并重置状态 = async (): Promise<void> => {
        try {
            await dbService.删除最近自动存档();
        } catch (error) {
            console.error('删除最近自动存档失败', error);
        } finally {
            重置自动存档状态();
        }
    };
    const 推送右下角提示 = (toast: Omit<右下角提示结构, 'id'>) => {
        const nextId = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        set右下角提示列表(prev => [...prev, { id: nextId, ...toast }].slice(-4));
        window.setTimeout(() => {
            set右下角提示列表(prev => prev.filter(item => item.id !== nextId));
        }, 4200);
    };
    const 应用视觉设置到状态 = (value: Partial<视觉设置结构> | null | undefined) => {
        const normalized = 规范化视觉设置(value || {});
        visualConfigRef.current = normalized;
        setVisualConfig(normalized);
        void dbService.保存设置(设置键.视觉设置, normalized);
    };
    const 应用图片管理设置到状态 = (value: Partial<图片管理设置结构> | null | undefined) => {
        const normalized = 规范化图片管理设置(value || 默认图片管理设置);
        imageManagerConfigRef.current = normalized;
        setImageManagerConfig(normalized);
        void dbService.保存设置(设置键.图片管理设置, normalized);
    };
    const 应用场景图片档案到状态 = (value: 场景图片档案 | null | undefined) => {
        const normalized = 按场景图上限裁剪档案(value || {}, 获取场景图历史上限()).档案;
        场景图片档案Ref.current = normalized;
        set场景图片档案(normalized);
        void dbService.保存设置(设置键.场景图片档案, normalized);
    };
    const 关闭右下角提示 = (toastId: string) => {
        if (!toastId) return;
        set右下角提示列表(prev => prev.filter(item => item.id !== toastId));
    };

    const 构建NPC记忆总结任务 = (
        npc: NPC结构,
        trigger: 'auto' | 'manual'
    ): NPC记忆总结任务结构 | null => {
        const candidate = trigger === 'manual'
            ? 构建手动NPC记忆总结候选(npc?.记忆, memoryConfig)
            : 构建自动NPC记忆总结候选(npc?.记忆, memoryConfig);
        if (!candidate || !npc?.id) return null;
        const promptTemplate = (规范化记忆配置(memoryConfig).NPC记忆总结提示词 || '').trim();
        return {
            id: `npc_memory_${npc.id}_${candidate.起始原始索引}_${candidate.结束原始索引}_${candidate.批次条数}_${trigger}`,
            类型: 'npc_memory',
            npcId: npc.id,
            npcName: npc.姓名 || npc.id,
            批次: candidate.批次.map((item, index) => `[${index}] [${item.时间 || '未知时间'}] ${item.内容}`),
            批次条数: candidate.批次条数,
            起始索引: candidate.起始原始索引,
            结束索引: candidate.结束原始索引,
            起始时间: candidate.起始时间,
            结束时间: candidate.结束时间,
            提示词模板: promptTemplate,
            触发方式: trigger,
            预留原始条数: candidate.预留原始条数
        };
    };

    const 构建NPC记忆总结用户提示词 = (task: NPC记忆总结任务结构): string => {
        const lines = [
            `请将以下 NPC 原始记忆压缩为一条总结记忆。`,
            `NPC：${task.npcName}`,
            `索引范围：${task.起始索引} - ${task.结束索引}`,
            `时间范围：${task.起始时间} - ${task.结束时间}`,
            `条目数量：${task.批次条数}`,
            `总结后仍保留的较新原始记忆条数：${task.预留原始条数}`,
            '输入条目如下：',
            ...task.批次
        ];
        return lines.join('\n');
    };

    const 清空NPC记忆总结流程 = (options?: { 保留队列?: boolean }) => {
        if (!options?.保留队列) {
            set待处理NPC记忆总结队列([]);
        }
        setNPC记忆总结阶段('idle');
        setNPC记忆总结草稿('');
        setNPC记忆总结错误('');
    };

    const 刷新NPC记忆总结队列 = (
        socialData: NPC结构[],
        options?: { 静默?: boolean }
    ) => {
        const normalizedList = 规范化社交列表安全(socialData, { 合并同名: false });
        const rebuiltQueue = normalizedList
            .map((npc) => 构建NPC记忆总结任务(npc, 'auto'))
            .filter((item): item is NPC记忆总结任务结构 => Boolean(item));

        set待处理NPC记忆总结队列((prev) => {
            const activeId = prev[0]?.id;
            if (!activeId) return rebuiltQueue;
            const activeTask = rebuiltQueue.find((item) => item.id === activeId);
            const rest = rebuiltQueue.filter((item) => item.id !== activeId);
            return activeTask ? [activeTask, ...rest] : rebuiltQueue;
        });

        if (rebuiltQueue.length === 0) {
            清空NPC记忆总结流程();
            return;
        }
        if (!options?.静默 && NPC记忆总结阶段 === 'idle') {
            setNPC记忆总结阶段('remind');
        }
    };

    const 应用并同步社交列表 = (
        nextSocial: NPC结构[],
        options?: { 静默NPC总结提示?: boolean }
    ): NPC结构[] => {
        const normalized = 规范化社交列表安全(nextSocial, { 合并同名: false });
        设置社交(normalized);
        刷新NPC记忆总结队列(normalized, { 静默: options?.静默NPC总结提示 === true });
        void performAutoSave({ social: normalized, history: 历史记录, force: true });
        return normalized;
    };

    const 清空记忆总结流程 = (options?: { 保留任务?: boolean }) => {
        if (!options?.保留任务) {
            set待处理记忆总结任务(null);
        }
        set记忆总结阶段('idle');
        set记忆总结草稿('');
        set记忆总结错误('');
    };

    const 刷新记忆总结任务 = (
        memoryData: 记忆系统结构,
        options?: { 静默?: boolean }
    ) => {
        const nextTask = 构建待处理记忆压缩任务(
            规范化记忆系统(memoryData),
            规范化记忆配置(memoryConfig)
        );
        if (!nextTask) {
            清空记忆总结流程();
            return;
        }
        const sameTask = 待处理记忆总结任务?.id === nextTask.id;
        set待处理记忆总结任务(nextTask);
        if (sameTask && (记忆总结阶段 === 'processing' || 记忆总结阶段 === 'review')) {
            return;
        }
        if (!sameTask) {
            set记忆总结草稿('');
            set记忆总结错误('');
        }
        if (!options?.静默) {
            set记忆总结阶段('remind');
        }
    };

    const 应用并同步记忆系统 = (
        nextMemory: 记忆系统结构,
        options?: { 静默总结提示?: boolean }
    ): 记忆系统结构 => {
        const normalized = 规范化记忆系统(nextMemory);
        设置记忆系统(normalized);
        刷新记忆总结任务(normalized, { 静默: options?.静默总结提示 === true });
        return normalized;
    };

    const 同步重Roll计数 = () => {
        set可重Roll计数(回合快照栈Ref.current.length);
    };

    const 清空重Roll快照 = () => {
        回合快照栈Ref.current = [];
        同步重Roll计数();
    };

    const 推入重Roll快照 = (snapshot: 回合快照结构) => {
        回合快照栈Ref.current.push(snapshot);
        同步重Roll计数();
    };

    const 弹出重Roll快照 = (): 回合快照结构 | null => {
        const snapshot = 回合快照栈Ref.current.pop() || null;
        同步重Roll计数();
        return snapshot;
    };

    const 回档到快照 = (
        snapshot: 回合快照结构,
        options?: { 保留图片状态?: boolean }
    ) => {
        设置角色(规范化角色物品容器映射(深拷贝(snapshot.回档前状态.角色)));
        设置环境(规范化环境信息(深拷贝(snapshot.回档前状态.环境)));
        设置社交(规范化社交列表(深拷贝(snapshot.回档前状态.社交)));
        设置世界(规范化世界状态(深拷贝(snapshot.回档前状态.世界)));
        设置战斗(深拷贝(snapshot.回档前状态.战斗));
        设置玩家门派(深拷贝(snapshot.回档前状态.玩家门派));
        设置任务列表(深拷贝(snapshot.回档前状态.任务列表));
        设置约定列表(深拷贝(snapshot.回档前状态.约定列表));
        设置剧情(规范化剧情状态(深拷贝(snapshot.回档前状态.剧情)));
        设置剧情规划(规范化剧情规划状态(深拷贝(snapshot.回档前状态.剧情规划)));
        设置女主剧情规划(规范化女主剧情规划状态(深拷贝(snapshot.回档前状态.女主剧情规划)));
        设置同人剧情规划(规范化同人剧情规划状态(深拷贝(snapshot.回档前状态.同人剧情规划)));
        设置同人女主剧情规划(规范化同人女主剧情规划状态(深拷贝(snapshot.回档前状态.同人女主剧情规划)));
        应用并同步记忆系统(深拷贝(snapshot.回档前状态.记忆系统));
        设置历史记录(深拷贝(snapshot.回档前历史));
        if (options?.保留图片状态 !== true) {
            应用视觉设置到状态(深拷贝(snapshot.回档前持久态?.视觉设置 || {}));
            应用场景图片档案到状态(深拷贝(snapshot.回档前持久态?.场景图片档案 || {}));
        }
    };

    // Frontend联动：当游戏时间命中节日设定时，自动同步“名称/简介/效果”到环境
    useEffect(() => {
        const md = 提取环境月日(环境);
        const matched = md ? festivals.find(f => f.月 === md.month && f.日 === md.day) : undefined;
        const nextFestival = matched
            ? {
                名称: matched.名称?.trim() || '',
                简介: matched.描述?.trim() || '',
                效果: matched.效果?.trim() || ''
            }
            : null;

        const currentFestival = 环境?.节日 || null;
        const sameFestival = !!(
            (!currentFestival && !nextFestival) ||
            (
                currentFestival &&
                nextFestival &&
                (currentFestival.名称 || '') === (nextFestival.名称 || '') &&
                (currentFestival.简介 || '') === (nextFestival.简介 || '') &&
                (currentFestival.效果 || '') === (nextFestival.效果 || '')
            )
        );

        if (sameFestival) return;
        设置环境(prev => ({
            ...prev,
            节日: nextFestival
        }));
    }, [环境?.时间, 环境?.节日, festivals, 设置环境]);

    useEffect(() => {
        if (游戏初始时间) return;
        const 占位开局时间 = '1:01:01:00:00';
        const 规范化可用起始时间 = (value?: string | null): string | null => {
            const canonical = normalizeCanonicalGameTime((value || '').trim());
            if (!canonical || canonical === 占位开局时间) return null;
            return canonical;
        };

        const currentTime = 规范化可用起始时间(环境时间转标准串(环境));
        if (currentTime) {
            设置游戏初始时间(currentTime);
            return;
        }

        const 回忆档案 = Array.isArray(记忆系统?.回忆档案) ? 记忆系统.回忆档案 : [];
        const 开局回忆 = 回忆档案.find((item) => item?.回合 === 1 || item?.名称 === '【回忆001】') || 回忆档案[0];
        const 回忆开局时间 = 规范化可用起始时间(开局回忆?.记录时间)
            || 规范化可用起始时间(开局回忆?.时间戳);
        if (!回忆开局时间) return;
        设置游戏初始时间(回忆开局时间);
    }, [环境, 游戏初始时间, 记忆系统, 设置游戏初始时间]);

    const 获取原始AI消息 = (rawText: string): string => (typeof rawText === 'string' ? rawText : '');
    const 计算回复耗时秒 = (startedAt: number, endedAt: number = Date.now()): number => {
        if (!Number.isFinite(startedAt) || startedAt <= 0) return 0;
        const elapsed = endedAt - startedAt;
        if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
        return Math.max(1, Math.round(elapsed / 1000));
    };
    const 估算消息Token = (
        messages: Array<{ role?: string; content?: string; name?: string }>,
        model?: string
    ): number => countOpenAIChatMessagesTokens(messages, model);
    const 估算AI输出Token = (rawText: string, model?: string): number => (
        countOpenAITextTokens(typeof rawText === 'string' ? rawText : '', model)
    );
    const 游戏时间转排序值 = (input?: string): number | null => {
        const canonical = normalizeCanonicalGameTime(input);
        if (!canonical) return null;
        const matched = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
        if (!matched) return null;
        return (
            Number(matched[1]) * 100000000 +
            Number(matched[2]) * 1000000 +
            Number(matched[3]) * 10000 +
            Number(matched[4]) * 100 +
            Number(matched[5])
        );
    };
    const 提取文本中的游戏时间列表 = (text?: string): string[] => {
        if (!text || typeof text !== 'string') return [];
        const matched = text.match(/\d{1,6}:\d{1,2}:\d{1,2}:\d{1,2}:\d{1,2}/g) || [];
        const deduped: string[] = [];
        matched.forEach((item) => {
            const canonical = normalizeCanonicalGameTime(item);
            if (canonical && !deduped.includes(canonical)) deduped.push(canonical);
        });
        return deduped;
    };
    const 当前时间已达到 = (currentTime?: string, targetTime?: string): boolean => {
        const currentSort = 游戏时间转排序值(currentTime);
        const targetSort = 游戏时间转排序值(targetTime);
        if (currentSort === null || targetSort === null) return false;
        return currentSort >= targetSort;
    };
    const 提取响应完整正文文本 = (response?: GameResponse): string => {
        const logs = Array.isArray(response?.logs) ? response.logs : [];
        return logs
            .map((item) => `${item?.sender || '旁白'}：${item?.text || ''}`.trim())
            .filter(Boolean)
            .join('\n')
            .trim();
    };
    type 最近正文回合结构 = {
        玩家输入: string;
        游戏时间: string;
        正文: string;
    };
    const 收集最近完整正文回合 = (params: {
        history: 聊天记录结构[];
        currentPlayerInput?: string;
        currentGameTime?: string;
        currentResponse?: GameResponse;
        maxTurns?: number;
    }): 最近正文回合结构[] => {
        const maxTurns = Math.max(1, Number(params.maxTurns) || 3);
        const collected: 最近正文回合结构[] = [];
        const pushTurn = (item: 最近正文回合结构) => {
            if (!item.正文.trim()) return;
            const signature = `${item.游戏时间}__${item.玩家输入}__${item.正文}`;
            if (collected.some((existing) => `${existing.游戏时间}__${existing.玩家输入}__${existing.正文}` === signature)) {
                return;
            }
            collected.push(item);
        };

        const currentBody = 提取响应完整正文文本(params.currentResponse);
        if (currentBody) {
            pushTurn({
                玩家输入: params.currentPlayerInput || '',
                游戏时间: params.currentGameTime || '',
                正文: currentBody
            });
        }

        const history = Array.isArray(params.history) ? params.history : [];
        for (let i = history.length - 1; i >= 0 && collected.length < maxTurns; i -= 1) {
            const item = history[i];
            if (item?.role !== 'assistant' || !item?.structuredResponse) continue;
            const body = 提取响应完整正文文本(item.structuredResponse);
            if (!body) continue;
            let playerInput = '';
            for (let j = i - 1; j >= 0; j -= 1) {
                if (history[j]?.role === 'user') {
                    playerInput = typeof history[j]?.content === 'string' ? history[j].content : '';
                    break;
                }
            }
            pushTurn({
                玩家输入: playerInput,
                游戏时间: item.gameTime || '',
                正文: body
            });
        }

        return collected.slice(0, maxTurns).reverse();
    };
    const 构建最近完整正文上下文 = (rounds: 最近正文回合结构[]): string => (
        (Array.isArray(rounds) ? rounds : [])
            .map((item, index) => [
                `【正文片段${index + 1}】`,
                item.游戏时间 ? `游戏时间：${item.游戏时间}` : '游戏时间：未知',
                item.玩家输入 ? `玩家输入：${item.玩家输入}` : '玩家输入：',
                '完整正文：',
                item.正文
            ].join('\n'))
            .join('\n\n')
            .trim()
    );
    const 去重文本数组 = (items: string[]): string[] => {
        const result: string[] = [];
        (Array.isArray(items) ? items : []).forEach((item) => {
            const text = typeof item === 'string' ? item.trim() : '';
            if (text && !result.includes(text)) result.push(text);
        });
        return result;
    };
    const 收集剧情规划时间触发原因 = (planLike?: 剧情规划结构, envLike?: 环境信息结构): string[] => {
        const currentTime = 环境时间转标准串(envLike);
        if (!currentTime) return [];
        const normalizedPlan = 规范化剧情规划状态(planLike);
        const reasons: string[] = [];
        (Array.isArray(normalizedPlan?.待触发事件) ? normalizedPlan.待触发事件 : []).forEach((item: any) => {
            const name = typeof item?.事件名 === 'string' ? item.事件名.trim() : '未命名事件';
            [item?.计划触发时间, item?.最早触发时间, item?.最晚触发时间].forEach((time) => {
                if (当前时间已达到(currentTime, time)) {
                    reasons.push(`剧情待触发事件「${name}」已到时间点 ${time}`);
                }
            });
        });
        (Array.isArray(normalizedPlan?.当前章任务) ? normalizedPlan.当前章任务 : []).forEach((item: any) => {
            const name = typeof item?.标题 === 'string' ? item.标题.trim() : '未命名任务';
            [item?.计划执行时间, item?.最早执行时间, item?.最晚执行时间].forEach((time) => {
                if (当前时间已达到(currentTime, time)) {
                    reasons.push(`剧情任务「${name}」已到执行时间 ${time}`);
                }
            });
        });
        return 去重文本数组(reasons);
    };
    const 收集女主规划时间触发原因 = (planLike?: 女主剧情规划结构, envLike?: 环境信息结构): string[] => {
        const currentTime = 环境时间转标准串(envLike);
        if (!currentTime) return [];
        const normalizedPlan = 规范化女主剧情规划状态(planLike);
        if (!normalizedPlan) return [];
        const reasons: string[] = [];
        (Array.isArray(normalizedPlan?.女主互动事件) ? normalizedPlan.女主互动事件 : []).forEach((item: any) => {
            const eventId = typeof item?.事件名 === 'string' ? item.事件名.trim() : '未知排期';
            const heroineName = typeof item?.女主姓名 === 'string' ? item.女主姓名.trim() : '未知女主';
            [item?.计划触发时间, item?.最早触发时间, item?.最晚触发时间].forEach((time) => {
                if (当前时间已达到(currentTime, time)) {
                    reasons.push(`女主互动事件「${heroineName}/${eventId}」已到时间点 ${time}`);
                }
            });
        });
        return 去重文本数组(reasons);
    };
    const 收集剧情正文命中原因 = (
        storyLike?: 剧情系统结构,
        planLike?: 剧情规划结构,
        latestBodyText?: string
    ): string[] => {
        const body = typeof latestBodyText === 'string' ? latestBodyText.trim() : '';
        if (!body) return [];
        const normalizedStory = 规范化剧情状态(storyLike);
        const normalizedPlan = 规范化剧情规划状态(planLike);
        const keywords = 去重文本数组([
            normalizedStory?.当前章节?.标题 || '',
            ...(Array.isArray(normalizedPlan?.待触发事件) ? normalizedPlan.待触发事件.map((item: any) => item?.事件名 || '') : []),
            ...(Array.isArray(normalizedPlan?.当前章任务) ? normalizedPlan.当前章任务.map((item: any) => item?.标题 || '') : [])
        ]).filter((item) => item.length >= 2);
        return keywords
            .filter((keyword) => body.includes(keyword))
            .map((keyword) => `最近正文命中剧情线索「${keyword}」`);
    };
    const 收集女主正文命中原因 = (planLike?: 女主剧情规划结构, latestBodyText?: string): string[] => {
        const body = typeof latestBodyText === 'string' ? latestBodyText.trim() : '';
        if (!body) return [];
        const normalizedPlan = 规范化女主剧情规划状态(planLike);
        if (!normalizedPlan) return [];
        const keywords = 去重文本数组([
            ...(Array.isArray(normalizedPlan?.女主条目) ? normalizedPlan.女主条目.map((item: any) => item?.女主姓名 || '') : [])
        ]).filter((item) => item.length >= 2);
        return keywords
            .filter((keyword) => body.includes(keyword))
            .map((keyword) => `最近正文命中女主线索「${keyword}」`);
    };
    const 过滤规划补丁命令 = (
        commands: TavernCommand[],
        allowedPrefixes: string[]
    ): TavernCommand[] => (
        (Array.isArray(commands) ? commands : [])
            .filter((cmd) => cmd && typeof cmd.key === 'string' && typeof cmd.action === 'string')
            .filter((cmd) => allowedPrefixes.some((prefix) => cmd.key === prefix || cmd.key.startsWith(`${prefix}.`) || cmd.key.startsWith(`${prefix}[`)))
    );
    const 提取原始报错详情 = (error: any): string => {
        const raw = error?.detail ?? error?.message ?? error ?? '未知错误';
        if (typeof raw === 'string') return raw;
        try {
            return JSON.stringify(raw, null, 2);
        } catch {
            return String(raw);
        }
    };
    const 格式化错误详情 = (error: any): string => {
        if (!error) return '未知错误';
        if (typeof error === 'string') return error;
        const lines: string[] = [];
        if (error?.name) lines.push(`Name: ${error.name}`);
        if (typeof error?.status === 'number') lines.push(`Status: ${error.status}`);
        if (typeof error?.message === 'string' && error.message.trim()) {
            lines.push(`Message: ${error.message}`);
        }
        const detail = error?.detail ?? error?.parseDetail;
        if (detail) {
            const detailText = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
            lines.push('Detail:');
            lines.push(detailText);
        }
        if (lines.length > 0) return lines.join('\n');
        try {
            return JSON.stringify(error, null, 2);
        } catch {
            return String(error);
        }
    };
    const 提取解析失败原始信息 = (error: any): string => {
        if (!error) return '返回内容不符合标签协议';
        if (typeof error === 'string' && error.trim().length > 0) return error.trim();
        if (typeof error?.parseDetail === 'string' && error.parseDetail.trim().length > 0) {
            return error.parseDetail.trim();
        }
        if (typeof error?.message === 'string' && error.message.trim().length > 0) {
            return error.message.trim();
        }
        return '返回内容不符合标签协议';
    };

    const 构建记忆总结用户提示词 = (task: 记忆压缩任务结构): string => {
        const sourceLabel = task.来源层 === '短期' ? '短期记忆' : '中期记忆';
        const targetLabel = task.目标层 === '中期' ? '中期记忆' : '长期记忆';
        const lines = [
            `请将以下${sourceLabel}压缩为${targetLabel}。`,
            `时间范围：${task.起始时间} - ${task.结束时间}`,
            `条目数量：${task.批次条数}`,
            '输入条目如下：',
            ...task.批次.map((item, index) => `[${index + 1}] ${item}`),
            '再次强调：若无重要内容，输出空字符串。'
        ];
        return lines.join('\n');
    };

    const 清理记忆总结输出 = (rawText: string): string => {
        let text = (rawText || '').trim();
        if (!text) return '';
        text = text
            .replace(/^```(?:text|markdown)?\s*/i, '')
            .replace(/```$/i, '')
            .trim();
        if (!text) return '';
        if (/^(?:无|暂无|无重要内容|无需输出|空|空字符串|无重要事件)[。！!？?]*$/i.test(text)) {
            return '';
        }
        return text;
    };

    const handleStartMemorySummary = async (): Promise<void> => {
        if (!待处理记忆总结任务) return;
        const summaryApi = 获取记忆总结接口配置(apiConfig);
        if (!接口配置是否可用(summaryApi)) {
            set记忆总结错误('未配置可用接口，无法执行记忆总结。');
            set记忆总结阶段('review');
            return;
        }
        const task = 待处理记忆总结任务;
        set记忆总结阶段('processing');
        set记忆总结错误('');
        try {
            const raw = await textAIService.generateMemoryRecall(
                task.提示词模板,
                构建记忆总结用户提示词(task),
                summaryApi
            );
            set记忆总结草稿(清理记忆总结输出(raw));
            set记忆总结阶段('review');
        } catch (error: any) {
            set记忆总结草稿('');
            set记忆总结错误(提取原始报错详情(error) || '记忆总结失败。');
            set记忆总结阶段('review');
        }
    };

    const handleCancelMemorySummary = () => {
        清空记忆总结流程({ 保留任务: true });
    };

    const handleBackToMemorySummaryRemind = () => {
        if (!待处理记忆总结任务) return;
        set记忆总结阶段('remind');
        set记忆总结错误('');
    };

    const handleUpdateMemorySummaryDraft = (nextDraft: string) => {
        set记忆总结草稿(nextDraft);
    };

    const handleStartManualMemorySummary = (
        来源层: '短期' | '中期',
        起始索引: number,
        结束索引: number
    ) => {
        const task = 构建手动记忆压缩任务(
            规范化记忆系统(记忆系统),
            规范化记忆配置(memoryConfig),
            来源层,
            起始索引,
            结束索引
        );
        if (!task) {
            return;
        }
        set待处理记忆总结任务(task);
        set记忆总结草稿('');
        set记忆总结错误('');
        set记忆总结阶段('remind');
    };

    const handleApplyMemorySummary = () => {
        if (!待处理记忆总结任务) return;
        const nextMemory = 应用记忆压缩结果(
            规范化记忆系统(记忆系统),
            待处理记忆总结任务,
            记忆总结草稿
        );
        set记忆总结阶段('idle');
        set记忆总结草稿('');
        set记忆总结错误('');
        const appliedMemory = 应用并同步记忆系统(nextMemory);
        void performAutoSave({ memory: appliedMemory });
    };

    const handleStartNpcMemorySummary = async (): Promise<void> => {
        const currentTask = 待处理NPC记忆总结队列[0];
        if (!currentTask) return;
        const summaryApi = 获取记忆总结接口配置(apiConfig);
        if (!接口配置是否可用(summaryApi)) {
            setNPC记忆总结错误('未配置可用接口，无法执行 NPC 记忆总结。');
            setNPC记忆总结阶段('review');
            return;
        }
        setNPC记忆总结阶段('processing');
        setNPC记忆总结错误('');
        try {
            const raw = await textAIService.generateMemoryRecall(
                currentTask.提示词模板,
                构建NPC记忆总结用户提示词(currentTask),
                summaryApi
            );
            const cleaned = 清理记忆总结输出(raw);
            setNPC记忆总结草稿(cleaned || 构建NPC记忆总结回退文案(
                currentTask.批次.map((item) => {
                    const match = item.match(/^\[\d+\]\s+\[(.*?)\]\s+(.*)$/);
                    return {
                        时间: match?.[1] || '未知时间',
                        内容: match?.[2] || item
                    };
                })
            ));
            setNPC记忆总结阶段('review');
        } catch (error: any) {
            setNPC记忆总结草稿('');
            setNPC记忆总结错误(提取原始报错详情(error) || 'NPC 记忆总结失败。');
            setNPC记忆总结阶段('review');
        }
    };

    const handleCancelNpcMemorySummary = () => {
        清空NPC记忆总结流程({ 保留队列: true });
    };

    const handleBackToNpcMemorySummaryRemind = () => {
        if (!待处理NPC记忆总结队列[0]) return;
        setNPC记忆总结阶段('remind');
        setNPC记忆总结错误('');
    };

    const handleUpdateNpcMemorySummaryDraft = (nextDraft: string) => {
        setNPC记忆总结草稿(nextDraft);
    };

    const handleQueueManualNpcMemorySummary = (npcId: string) => {
        const targetNpc = (Array.isArray(社交) ? 社交 : []).find((npc) => npc?.id === npcId);
        if (!targetNpc) return;
        const manualTask = 构建NPC记忆总结任务(targetNpc, 'manual');
        if (!manualTask) return;
        set待处理NPC记忆总结队列((prev) => {
            const rest = prev.filter((item) => item.id !== manualTask.id);
            return [manualTask, ...rest];
        });
        setNPC记忆总结草稿('');
        setNPC记忆总结错误('');
        setNPC记忆总结阶段('remind');
    };

    const handleApplyNpcMemorySummary = () => {
        const currentTask = 待处理NPC记忆总结队列[0];
        if (!currentTask) return;
        const targetNpc = (Array.isArray(社交) ? 社交 : []).find((npc) => npc?.id === currentTask.npcId);
        if (!targetNpc) {
            刷新NPC记忆总结队列(Array.isArray(社交) ? 社交 : [], { 静默: true });
            清空NPC记忆总结流程({ 保留队列: true });
            return;
        }
        const candidate = currentTask.触发方式 === 'manual'
            ? 构建手动NPC记忆总结候选(targetNpc.记忆, memoryConfig)
            : 构建自动NPC记忆总结候选(targetNpc.记忆, memoryConfig);
        if (!candidate) {
            刷新NPC记忆总结队列(Array.isArray(社交) ? 社交 : [], { 静默: true });
            setNPC记忆总结阶段('idle');
            setNPC记忆总结草稿('');
            setNPC记忆总结错误('');
            return;
        }
        const nextNpc = 应用NPC记忆总结(targetNpc, candidate, NPC记忆总结草稿);
        const nextSocial = (Array.isArray(社交) ? 社交 : []).map((npc) => npc?.id === targetNpc.id ? nextNpc : npc);
        应用并同步社交列表(nextSocial);
        setNPC记忆总结阶段('idle');
        setNPC记忆总结草稿('');
        setNPC记忆总结错误('');
    };
    const 构建标签解析选项 = (config: 游戏设置结构) => ({
        validateTagCompleteness: config?.启用标签检测完整性 === true,
        enableTagRepair: config?.启用标签修复 !== false,
        requireActionOptionsTag: config?.启用行动选项 !== false
    });

    const 追加系统消息 = (content: string, options?: { position?: 'tail' | 'after_last_turn' }) => {
        const text = (content || '').trim();
        if (!text) return;
        const position = options?.position || 'tail';
        const now = Date.now();
        const systemMsg: 聊天记录结构 = {
            role: 'system',
            content: text,
            timestamp: now
        };

        设置历史记录((prev) => {
            const history = Array.isArray(prev) ? [...prev] : [];
            if (position !== 'after_last_turn') {
                return [...history, systemMsg];
            }

            // 插入到“最近一个已完成回合（assistant structuredResponse）”的下方，避免落在玩家输入下方。
            let lastTurnIndex = -1;
            for (let i = history.length - 1; i >= 0; i -= 1) {
                const item = history[i];
                if (item?.role === 'assistant' && item?.structuredResponse) {
                    lastTurnIndex = i;
                    break;
                }
            }
            if (lastTurnIndex < 0) {
                return [...history, systemMsg];
            }

            // 放在该回合之后、下一条 user 消息之前。
            let insertAt = lastTurnIndex + 1;
            while (insertAt < history.length && history[insertAt]?.role !== 'user') {
                insertAt += 1;
            }
            history.splice(insertAt, 0, systemMsg);
            return history;
        });
    };

    const 获取场景图历史上限 = (): number => (
        规范化图片管理设置(imageManagerConfigRef.current || imageManagerConfig || 默认图片管理设置).场景图历史上限
    );

    const {
        加载场景图片档案,
        写入场景图片档案,
        应用场景图片为壁纸,
        清除场景壁纸,
        设置常驻壁纸,
        清除常驻壁纸,
        应用常驻壁纸为背景,
        删除场景图片记录,
        清空场景图片历史,
        保存场景图片本地副本
    } = 创建场景图片档案工作流({
        获取场景图历史上限,
        读取场景图片档案设置: () => dbService.读取设置(设置键.场景图片档案),
        保存场景图片档案设置: (archive) => dbService.保存设置(设置键.场景图片档案, archive),
        同步场景图片档案: (archive) => {
            场景图片档案Ref.current = archive;
            set场景图片档案(archive);
        },
        获取当前场景图片档案: () => 场景图片档案Ref.current || {},
        清理未引用图片资源: dbService.清理未引用图片资源,
        获取当前视觉设置: () => visualConfigRef.current || visualConfig,
        应用视觉设置到状态,
        深拷贝,
        加载图片AI服务
    });

    const {
        loadBuiltinPromptEntries,
        loadWorldbooks,
        loadWorldbookPresetGroups,
        saveSettings,
        saveBuiltinPromptEntries,
        saveWorldbooks,
        saveWorldbookPresetGroups,
        saveVisualSettings,
        saveImageManagerSettings,
        updateApiConfig,
        saveArtistPreset,
        deleteArtistPreset,
        saveModelConverterPreset,
        deleteModelConverterPreset,
        setModelConverterPresetEnabled,
        savePromptConverterPreset,
        deletePromptConverterPreset,
        exportPresets,
        importPresets,
        saveGameSettings,
        saveMemorySettings,
        updatePrompts,
        updateFestivals
    } = 创建设置持久化工作流({
        获取接口配置: () => apiConfigRef.current,
        同步接口配置: (config) => {
            apiConfigRef.current = config;
            setApiConfig(config);
        },
        设置内置提示词列表: set内置提示词列表,
        设置世界书列表: set世界书列表,
        设置世界书预设组列表: set世界书预设组列表,
        应用视觉设置到状态,
        应用图片管理设置到状态,
        获取当前场景图片档案: () => 场景图片档案Ref.current || {},
        同步场景图片档案: (archive) => {
            场景图片档案Ref.current = archive;
            set场景图片档案(archive);
        },
        获取场景图历史上限,
        设置游戏设置: setGameConfig,
        设置记忆配置: setMemoryConfig,
        设置提示词池: setPrompts,
        设置节日列表: setFestivals
    });

    useEffect(() => {
        void 加载场景图片档案();
    }, []);

    useEffect(() => {
        void loadBuiltinPromptEntries();
    }, []);

    useEffect(() => {
        void loadWorldbooks();
    }, []);

    useEffect(() => {
        void loadWorldbookPresetGroups();
    }, []);

    const 场景模式已开启 = (): boolean => {
        const feature = apiConfig?.功能模型占位 as any;
        return Boolean(
            feature?.文生图功能启用
            && feature?.场景生图启用
        );
    };

    const 创建场景生图任务 = (params: {
        source: 生图任务来源类型;
        modelName: string;
        画风?: 当前可用接口结构['画风'];
        画师串?: string;
        来源回合?: number;
        摘要?: string;
    }): 场景生图任务记录 => ({
        id: `scene_image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        目标类型: 'scene',
        来源: params.source,
        状态: 'queued',
        创建时间: Date.now(),
        使用模型: params.modelName,
        构图: '场景',
        画风: params.画风,
        画师串: params.画师串,
        进度阶段: 'queued',
        进度文本: '任务已入队，等待生成场景壁纸。',
        来源回合: params.来源回合,
        摘要: params.摘要,
        已应用为壁纸: false
    });

    const 追加场景生图任务 = (task: 场景生图任务记录) => {
        set场景生图任务队列(prev => [task, ...(Array.isArray(prev) ? prev : [])].slice(0, 100));
    };

    const 更新场景生图任务 = (taskId: string, updater: (task: 场景生图任务记录) => 场景生图任务记录) => {
        set场景生图任务队列(prev => (Array.isArray(prev) ? prev : []).map((task) => (
            task.id === taskId ? updater(task) : task
        )));
    };

    const 删除场景生图任务 = (taskId: string) => {
        if (!taskId) return;
        set场景生图任务队列(prev => (Array.isArray(prev) ? prev : []).filter((task) => task?.id !== taskId));
    };

    const 清空场景生图任务队列 = (mode: 'all' | 'completed' = 'all') => {
        set场景生图任务队列(prev => {
            const baseList = Array.isArray(prev) ? prev : [];
            if (mode === 'all') return [];
            return baseList.filter((task) => task?.状态 === 'queued' || task?.状态 === 'running');
        });
    };

    const 获取NPC唯一标识 = (npc: any, index?: number): string => {
        const id = typeof npc?.id === 'string' ? npc.id.trim() : '';
        if (id) return `id:${id}`;
        const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
        if (name) return `name:${name}`;
        return `index:${index ?? -1}`;
    };

    const {
        更新NPC最近生图结果,
        写入NPC图片历史记录,
        更新NPC香闺秘档部位结果,
        获取生图阶段中文,
        创建NPC生图任务,
        追加NPC生图任务,
        更新NPC生图任务,
        删除NPC生图任务,
        清空NPC生图任务队列,
        删除NPC图片记录,
        清空NPC图片历史,
        选择NPC头像图片,
        清除NPC头像图片,
        选择NPC立绘图片,
        清除NPC立绘图片,
        选择NPC背景图片,
        清除NPC背景图片,
        保存NPC图片本地副本
    } = 创建NPC图片状态工作流({
        设置社交,
        规范化社交列表: 规范化社交列表安全,
        执行社交自动存档: (socialSnapshot) => {
            void performAutoSave({ social: socialSnapshot, history: 历史记录, force: true });
        },
        获取社交列表: () => 社交,
        获取NPC唯一标识,
        设置NPC生图任务队列: setNPC生图任务队列,
        加载图片AI服务
    });

    const 读取文生图功能配置 = () => {
        const feature = apiConfig?.功能模型占位 as any;
        const 当前后端 = feature?.文生图后端类型 === 'novelai' ? 'novelai' : 'other';
        const 场景横竖屏 = feature?.自动场景生图横竖屏 === '竖屏' ? '竖屏' : '横屏';
        const 场景尺寸 = typeof feature?.自动场景生图分辨率 === 'string' && feature.自动场景生图分辨率.trim()
            ? feature.自动场景生图分辨率.trim()
            : (场景横竖屏 === '竖屏' ? '576x1024' : '1024x576');
        return {
            总开关: Boolean(feature?.文生图功能启用),
            NPC开关: Boolean(feature?.NPC生图启用),
            使用词组转化器: 当前后端 === 'novelai' ? true : feature?.NPC生图使用词组转化器 !== false,
            性别筛选: feature?.NPC生图性别筛选 === '男' || feature?.NPC生图性别筛选 === '女' || feature?.NPC生图性别筛选 === '全部'
                ? feature.NPC生图性别筛选
                : '全部',
            重要性筛选: feature?.NPC生图重要性筛选 === '仅重要' || feature?.NPC生图重要性筛选 === '全部'
                ? feature.NPC生图重要性筛选
                : '全部',
            NPC画风: feature?.自动NPC生图画风 === '二次元' || feature?.自动NPC生图画风 === '写实' || feature?.自动NPC生图画风 === '国风'
                ? feature.自动NPC生图画风
                : '通用',
            场景画风: feature?.自动场景生图画风 === '二次元' || feature?.自动场景生图画风 === '写实' || feature?.自动场景生图画风 === '国风'
                ? feature.自动场景生图画风
                : '通用',
            场景构图要求: feature?.自动场景生图构图要求 === '故事快照' ? '故事快照' : '纯场景',
            场景横竖屏,
            场景尺寸
        } as const;
    };

    const NPC符合自动生图条件 = (npc: any): boolean => {
        const config = 读取文生图功能配置();
        if (!config.总开关 || !config.NPC开关) return false;
        if (config.性别筛选 !== '全部') {
            const gender = typeof npc?.性别 === 'string' ? npc.性别.trim() : '';
            if (gender !== config.性别筛选) return false;
        }
        if (config.重要性筛选 === '仅重要' && npc?.是否主要角色 !== true) {
            return false;
        }
        return true;
    };

    const 提取新增NPC列表 = (beforeList: any[], afterList: any[]): any[] => {
        const beforeIdentitySet = new Set(
            (Array.isArray(beforeList) ? beforeList : []).map((npc) => {
                const id = typeof npc?.id === 'string' ? npc.id.trim() : '';
                const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
                return `${id}::${name}`;
            })
        );
        return (Array.isArray(afterList) ? afterList : []).filter((npc, index) => {
            const id = typeof npc?.id === 'string' ? npc.id.trim() : '';
            const name = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '';
            const identity = `${id}::${name}`;
            if (id || name) {
                return !beforeIdentitySet.has(identity);
            }
            return !Array.isArray(beforeList) || index >= beforeList.length;
        });
    };

    useEffect(() => {
        if (!后台手动生图监控Ref.current.length) return;
        const pendingMonitors = 后台手动生图监控Ref.current.filter((monitor) => {
            const matchedTask = (Array.isArray(NPC生图任务队列) ? NPC生图任务队列 : []).find((task) => (
                (task?.NPC标识 === monitor.npcId || task?.NPC标识 === `id:${monitor.npcId}`)
                && (task?.来源 === 'manual' || task?.来源 === 'retry')
                && (task?.创建时间 || 0) >= monitor.since
            ));
            if (!matchedTask || (matchedTask.状态 !== 'success' && matchedTask.状态 !== 'failed')) {
                return true;
            }
            if (已提示后台生图任务Ref.current.has(matchedTask.id)) {
                return false;
            }
            已提示后台生图任务Ref.current.add(matchedTask.id);
            推送右下角提示({
                title: matchedTask.状态 === 'success' ? '手动生图完成' : '手动生图失败',
                message: matchedTask.状态 === 'success'
                    ? `${monitor.npcName}的${monitor.构图}已生成完成。`
                    : `${monitor.npcName}的${monitor.构图}生成失败：${matchedTask.错误信息 || '未知错误'}`,
                tone: matchedTask.状态 === 'success' ? 'success' : 'error'
            });
            return false;
        });
        后台手动生图监控Ref.current = pendingMonitors;
    }, [NPC生图任务队列]);

    useEffect(() => {
        if (!后台私密生图监控Ref.current.length) return;
        const pendingMonitors = 后台私密生图监控Ref.current.filter((monitor) => {
            const matchedTask = (Array.isArray(NPC生图任务队列) ? NPC生图任务队列 : []).find((task) => (
                (task?.NPC标识 === monitor.npcId || task?.NPC标识 === `id:${monitor.npcId}`)
                && task?.来源 === 'manual'
                && task?.构图 === '部位特写'
                && task?.部位 === monitor.部位
                && (task?.创建时间 || 0) >= monitor.since
            ));
            if (!matchedTask || (matchedTask.状态 !== 'success' && matchedTask.状态 !== 'failed')) {
                return true;
            }
            if (已提示后台私密生图任务Ref.current.has(matchedTask.id)) {
                return false;
            }
            已提示后台私密生图任务Ref.current.add(matchedTask.id);
            推送右下角提示({
                title: matchedTask.状态 === 'success' ? '私密特写完成' : '私密特写失败',
                message: matchedTask.状态 === 'success'
                    ? `${monitor.npcName}的${monitor.部位}特写已生成完成。`
                    : `${monitor.npcName}的${monitor.部位}特写生成失败：${matchedTask.错误信息 || '未知错误'}`,
                tone: matchedTask.状态 === 'success' ? 'success' : 'error'
            });
            return false;
        });
        后台私密生图监控Ref.current = pendingMonitors;
    }, [NPC生图任务队列]);

    useEffect(() => {
        if (!后台场景生图监控Ref.current.length) return;
        const pendingMonitors = 后台场景生图监控Ref.current.filter((monitor) => {
            const matchedTask = (Array.isArray(场景生图任务队列) ? 场景生图任务队列 : []).find((task) => (
                task?.来源 === 'manual'
                && (task?.创建时间 || 0) >= monitor.since
            ));
            if (!matchedTask || (matchedTask.状态 !== 'success' && matchedTask.状态 !== 'failed')) {
                return true;
            }
            if (已提示后台场景生图任务Ref.current.has(matchedTask.id)) {
                return false;
            }
            已提示后台场景生图任务Ref.current.add(matchedTask.id);
            推送右下角提示({
                title: matchedTask.状态 === 'success' ? '场景生图完成' : '场景生图失败',
                message: matchedTask.状态 === 'success'
                    ? `${monitor.摘要 || '当前正文场景'}已生成完成。`
                    : `${monitor.摘要 || '当前正文场景'}生成失败：${matchedTask.错误信息 || '未知错误'}`,
                tone: matchedTask.状态 === 'success' ? 'success' : 'error'
            });
            return false;
        });
        后台场景生图监控Ref.current = pendingMonitors;
    }, [场景生图任务队列]);

    const 读取修炼体系开关 = (): boolean => gameConfig?.启用修炼体系 !== false;

    const 构建文生图额外要求 = (extra?: string): string => {
        const runtimeGameConfig = 规范化游戏设置(gameConfig);
        const runtimeImageExtraPrompt = 构建文生图运行时额外提示词(runtimeGameConfig.额外提示词 || '', runtimeGameConfig);
        return [(extra || '').trim(), runtimeImageExtraPrompt].filter(Boolean).join('\n\n').trim();
    };
    const {
        触发场景自动生图,
        生成场景壁纸
    } = 创建场景生图触发工作流({
        获取环境: () => 环境,
        获取角色: () => 角色,
        获取社交列表: () => 社交,
        获取历史记录: () => 历史记录,
        获取接口配置: () => apiConfig,
        规范化环境信息,
        深拷贝,
        环境时间转标准串,
        构建完整地点文本,
        修炼体系已启用: 读取修炼体系开关,
        提取NPC生图基础数据: (npc) => 提取NPC生图基础数据(npc, {
            cultivationSystemEnabled: 读取修炼体系开关()
        }),
        读取文生图功能配置,
        场景模式已开启,
        构建文生图额外要求,
        加载场景生图工作流,
        获取场景文生图接口配置,
        获取生图词组转化器接口配置,
        获取生图画师串预设,
        获取当前PNG画风预设: (presetId?: string) => 获取当前PNG画风预设摘要(presetId, 'scene'),
        获取场景角色锚点: (...args) => 提取场景角色锚点(...args),
        获取词组转化器预设提示词,
        接口配置是否可用,
        创建场景生图任务,
        生成场景生图记录ID,
        追加场景生图任务,
        更新场景生图任务,
        更新场景图片档案: 写入场景图片档案,
        应用场景图片为壁纸,
        获取当前自动应用任务ID: () => 场景生图自动应用任务Ref.current,
        设置当前自动应用任务ID: (requestId) => {
            场景生图自动应用任务Ref.current = requestId;
        },
        记录后台场景监控: (item) => {
            后台场景生图监控Ref.current.push(item);
        },
        推送右下角提示
    });

    const 序列化变量校准命令 = (cmd: any): string => {
        const action = typeof cmd?.action === 'string' ? cmd.action : 'set';
        const key = typeof cmd?.key === 'string' ? cmd.key : '';
        if (action === 'delete') return `delete ${key}`;
        try {
            return `${action} ${key} = ${JSON.stringify(cmd?.value ?? null)}`;
        } catch {
            return `${action} ${key} = ${String(cmd?.value ?? null)}`;
        }
    };

    const 提取响应正文文本 = (response: any): string => {
        const logs = Array.isArray(response?.logs) ? response.logs : [];
        const lines = logs
            .map((log: any) => {
                const sender = typeof log?.sender === 'string' ? log.sender.trim() : '旁白';
                const text = typeof log?.text === 'string' ? log.text.trim() : '';
                return text ? `【${sender}】${text}` : '';
            })
            .filter(Boolean);
        return lines.join('\n');
    };

    const 清空变量生成上下文缓存 = () => {
        最近变量生成上下文Ref.current = [];
    };

    const 记录变量生成上下文 = (params: { playerInput: string; response: any }) => {
        const response = params.response;
        if (!response || typeof response !== 'object') return;
        const 正文 = 提取响应正文文本(response);
        const 本回合命令 = Array.isArray(response?.tavern_commands)
            ? response.tavern_commands.map(序列化变量校准命令).filter(Boolean)
            : [];
        const 校准说明 = Array.isArray(response?.variable_calibration_report)
            ? response.variable_calibration_report.map((entry: any) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
            : [];
        const 校准补充命令 = Array.isArray(response?.variable_calibration_commands)
            ? response.variable_calibration_commands.map(序列化变量校准命令).filter(Boolean)
            : [];
        const 校准命令 = [...校准补充命令].filter(Boolean);
        if (!(params.playerInput || '').trim() && !正文 && 本回合命令.length <= 0 && 校准说明.length <= 0 && 校准命令.length <= 0) {
            return;
        }
        const entry: 变量生成上下文缓存项 = {
            回合: 最近变量生成上下文Ref.current.length + 1,
            玩家输入: (params.playerInput || '').trim(),
            正文,
            本回合命令,
            校准说明,
            校准命令
        };
        最近变量生成上下文Ref.current = [...最近变量生成上下文Ref.current, entry].slice(-2);
    };

    const 收集最近变量生成上下文 = (history: any[], limit = 2) => {
        if (最近变量生成上下文Ref.current.length > 0) {
            const safeLimit = Math.max(0, Math.min(3, limit));
            return 最近变量生成上下文Ref.current.slice(-safeLimit).map((item) => 深拷贝(item));
        }
        const safeLimit = Math.max(0, Math.min(3, limit));
        if (safeLimit <= 0 || !Array.isArray(history)) return [];
        let assistantTurn = 0;
        let latestUserInput = '';
        const records: Array<{
            回合: number;
            玩家输入: string;
            正文: string;
            本回合命令: string[];
            校准说明: string[];
            校准命令: string[];
        }> = [];
        history.forEach((item) => {
            if (item?.role === 'user') {
                latestUserInput = typeof item?.content === 'string' ? item.content.trim() : '';
                return;
            }
            if (item?.role !== 'assistant' || !item?.structuredResponse) return;
            assistantTurn += 1;
            const response = item.structuredResponse;
            const 校准说明 = Array.isArray(response?.variable_calibration_report)
                ? response.variable_calibration_report.map((entry: any) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
                : [];
            const 校准补充命令 = Array.isArray(response?.variable_calibration_commands)
                ? response.variable_calibration_commands.map(序列化变量校准命令).filter(Boolean)
                : [];
            const 校准命令 = [...校准补充命令].filter(Boolean);
            const 本回合命令 = Array.isArray(response?.tavern_commands)
                ? response.tavern_commands.map(序列化变量校准命令).filter(Boolean)
                : [];
            const 正文 = 提取响应正文文本(response);
            if (!latestUserInput && !正文 && 本回合命令.length <= 0 && 校准说明.length <= 0 && 校准命令.length <= 0) return;
            records.push({
                回合: assistantTurn,
                玩家输入: latestUserInput,
                正文,
                本回合命令,
                校准说明,
                校准命令
            });
        });
        return records.slice(-safeLimit);
    };

    const 执行单个NPC生图 = async (npc: any, options?: { force?: boolean; source?: 生图任务来源类型; 构图?: '头像' | '半身' | '立绘'; 画风?: 当前可用接口结构['画风']; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string }) => {
        const { 执行NPC生图工作流 } = await 加载NPC生图工作流();
        return 执行NPC生图工作流(npc, {
            ...options,
            额外要求: 构建文生图额外要求(options?.额外要求)
        }, {
            apiConfig,
            获取NPC唯一标识,
            获取文生图接口配置,
            获取生图词组转化器接口配置,
            获取生图画师串预设,
            获取当前PNG画风预设: (presetId?: string) => 获取当前PNG画风预设摘要(presetId, 'npc'),
            获取NPC角色锚点: (npcId: string) => {
                const anchor = 按NPC读取角色锚点(npcId);
                // “生成时默认附加”关闭时：NPC 单图（含自动/手动）不应自动注入锚点。
                if (!anchor || anchor.生成时默认附加 !== true) return null;
                return anchor;
            },
            获取词组转化器预设提示词,
            接口配置是否可用,
            读取文生图功能配置,
            NPC符合自动生图条件,
            NPC生图进行中集合: NPC生图进行中Ref.current,
            提取NPC生图基础数据: (targetNpc) => 提取NPC生图基础数据附带私密描述(targetNpc, {
                cultivationSystemEnabled: 读取修炼体系开关()
            }),
            创建NPC生图任务,
            生成NPC生图记录ID,
            追加NPC生图任务,
            更新NPC生图任务,
            更新NPC最近生图结果
        });
    };

    const 执行NPC香闺秘档部位生图 = async (
        npc: any,
        part: 香闺秘档部位类型,
        options?: { 画风?: 当前可用接口结构['画风']; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string }
    ) => {
        const { 执行NPC香闺秘档部位生图工作流 } = await 加载NPC香闺秘档生图工作流();
        return 执行NPC香闺秘档部位生图工作流(npc, part, {
            ...options,
            额外要求: 构建文生图额外要求(options?.额外要求)
        }, {
            apiConfig,
            获取NPC唯一标识,
            获取文生图接口配置,
            获取生图词组转化器接口配置,
            获取生图画师串预设,
            获取当前PNG画风预设: (presetId?: string) => 获取当前PNG画风预设摘要(presetId, 'npc'),
            获取NPC角色锚点: 按NPC读取角色锚点,
            获取词组转化器预设提示词,
            接口配置是否可用,
            读取文生图功能配置,
            NPC私密部位生图进行中集合: NPC香闺秘档生图进行中Ref.current,
            提取NPC香闺秘档部位生图数据: (targetNpc, targetPart) => 提取NPC香闺秘档部位生图数据(targetNpc, targetPart, {
                cultivationSystemEnabled: 读取修炼体系开关()
            }),
            创建NPC生图任务,
            生成NPC生图记录ID,
            追加NPC生图任务,
            更新NPC生图任务,
            写入NPC图片历史记录,
            更新NPC香闺秘档部位结果
        });
    };

    const 触发新增NPC自动生图 = (newNpcList: any[]) => {
        const npcList = Array.isArray(newNpcList) ? newNpcList : [];
        if (npcList.length === 0) return;
        npcList.forEach((npc) => {
            void 执行单个NPC生图(npc).catch(() => undefined);
        });
    };

    const 世界演变功能已开启 = (): boolean => {
        const feature = apiConfig?.功能模型占位 as any;
        return Boolean(
            feature?.世界演变独立模型开关
            && typeof feature?.世界演变使用模型 === 'string'
            && feature.世界演变使用模型.trim().length > 0
        );
    };

    const 文章优化功能已开启 = (): boolean => {
        const feature = apiConfig?.功能模型占位 as any;
        return Boolean(
            feature?.文章优化独立模型开关
            && typeof feature?.文章优化使用模型 === 'string'
            && feature.文章优化使用模型.trim().length > 0
        );
    };

    const 已进入主剧情回合 = (): boolean => {
        return Array.isArray(历史记录)
            && 历史记录.some(item => item?.role === 'user' && typeof item?.content === 'string' && item.content.trim().length > 0);
    };

    const 替换流式草稿为失败提示 = (history: 聊天记录结构[], errorMessage: string): 聊天记录结构[] => {
        const next = Array.isArray(history) ? [...history] : [];
        const failureText = `【生成失败】${errorMessage || '未知错误'}`;
        for (let i = next.length - 1; i >= 0; i -= 1) {
            const item = next[i];
            if (item?.role === 'assistant' && !item?.structuredResponse) {
                next[i] = {
                    ...item,
                    content: failureText
                };
                return next;
            }
        }
        return [
            ...next,
            {
                role: 'assistant',
                content: failureText,
                timestamp: Date.now()
            }
        ];
    };

    const 更新流式草稿为自动重试提示 = (
        history: 聊天记录结构[],
        attempt: number,
        maxAttempts: number,
        reason?: string
    ): 聊天记录结构[] => {
        const next = Array.isArray(history) ? [...history] : [];
        const retryText = `【自动重试中】第 ${attempt} / ${maxAttempts} 次${reason ? `：${reason}` : ''}`;
        for (let i = next.length - 1; i >= 0; i -= 1) {
            const item = next[i];
            if (item?.role === 'assistant' && !item?.structuredResponse) {
                next[i] = {
                    ...item,
                    content: retryText
                };
                return next;
            }
        }
        return [
            ...next,
            {
                role: 'assistant',
                content: retryText,
                timestamp: Date.now()
            }
        ];
    };

    const 游戏设置启用自动重试 = (config?: Partial<游戏设置结构> | null): boolean => {
        return config?.启用自动重试 === true;
    };

    const 提取自动重试原因 = (error: any): string => {
        if (error instanceof textAIService.StoryResponseParseError || error?.name === 'StoryResponseParseError') {
            return '解析失败，正在重新生成';
        }
        if (typeof error?.message === 'string' && error.message.trim()) {
            return error.message.trim();
        }
        if (typeof error === 'string' && error.trim()) {
            return error.trim();
        }
        return '请求失败，正在重试';
    };

    const 是否可自动重试错误 = (error: any): boolean => {
        if (!error) return false;
        if (error?.name === 'AbortError') return false;
        return error instanceof textAIService.StoryResponseParseError
            || error?.name === 'StoryResponseParseError'
            || true;
    };

    const 执行带自动重试的生成请求 = async <T,>(params: {
        enabled: boolean;
        action: () => Promise<T>;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
    }): Promise<T> => {
        const maxAttempts = params.enabled ? 自动重试最大次数 : 1;
        let lastError: any = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await params.action();
            } catch (error: any) {
                lastError = error;
                if (!params.enabled || attempt >= maxAttempts || !是否可自动重试错误(error)) {
                    throw error;
                }
                const reason = 提取自动重试原因(error);
                params.onRetry?.(attempt + 1, maxAttempts, reason);
            }
        }
        throw lastError;
    };
    const 执行正文润色 = async (
        baseResponse: GameResponse,
        rawText: string,
        options?: { manual?: boolean; playerInput?: string }
    ): Promise<{ response: GameResponse; applied: boolean; error?: string; rawText?: string }> => 执行正文润色工作流(
        baseResponse,
        rawText,
        {
            apiConfig,
            gameConfig,
            prompts,
            环境,
            剧情,
            社交,
            战斗,
            角色,
            文章优化已开启: 文章优化功能已开启(),
            深拷贝
        },
        options
    );

    const 规范化剧情规划状态 = (raw?: any): 剧情规划结构 => 基础规范化剧情规划状态(raw);
    const 规范化女主剧情规划状态 = (raw?: any): 女主剧情规划结构 | undefined => 基础规范化女主剧情规划状态(raw);
    const 规范化同人剧情规划状态 = (raw?: any): 同人剧情规划结构 | undefined => 基础规范化同人剧情规划状态(raw);
    const 规范化同人女主剧情规划状态 = (raw?: any): 同人女主剧情规划结构 | undefined => 基础规范化同人女主剧情规划状态(raw);

    function 规范化社交列表安全(raw?: any[], options?: { 合并同名?: boolean }) {
        const list = Array.isArray(raw) ? raw : [];
        return 规范化社交列表(list, options);
    }

    const 应用开场基态 = (openingBase: ReturnType<typeof 创建开场基础状态>) => {
        设置角色(规范化角色物品容器映射(openingBase.角色));
        设置环境(规范化环境信息(openingBase.环境));
        设置游戏初始时间(openingBase.游戏初始时间 || '');
        设置社交(规范化社交列表(openingBase.社交));
        设置世界(openingBase.世界);
        设置战斗(openingBase.战斗);
        设置玩家门派(openingBase.玩家门派);
        设置任务列表(openingBase.任务列表 || []);
        设置约定列表(openingBase.约定列表 || []);
        设置剧情(规范化剧情状态(openingBase.剧情));
        设置剧情规划(规范化剧情规划状态(openingBase.剧情规划 || 创建空剧情规划()));
        设置女主剧情规划(openingBase.女主剧情规划);
        设置同人剧情规划(openingBase.同人剧情规划);
        设置同人女主剧情规划(openingBase.同人女主剧情规划);
        应用并同步记忆系统(创建空记忆系统(), { 静默总结提示: true });
        设置历史记录([]);
        清空变量生成上下文缓存();
        setWorldEvents([]);
    };

    const 构建系统提示词 = (
        promptPool: 提示词结构[],
        memoryData: 记忆系统结构,
        socialData: any[],
        statePayload: any,
        options?: {
            禁用中期长期记忆?: boolean;
            禁用短期记忆?: boolean;
            禁用世界演变分流?: boolean;
            禁用行动选项提示词?: boolean;
            注入剧情推动协议?: boolean;
            注入女主剧情规划协议?: boolean;
            世界书作用域?: 世界书作用域[];
            世界书附加文本?: string[];
            openingConfig?: OpeningConfig;
        }
    ) => 构建系统提示词工作流({
        promptPool,
        memoryData,
        socialData,
        statePayload,
        gameConfig,
        memoryConfig,
        fallbackPlayerName: 角色?.姓名,
        builtinPromptEntries: 内置提示词列表,
        worldbooks: 世界书列表,
        worldEvolutionEnabled: 世界演变功能已开启(),
        options
    });

    const processResponseCommands = (
        response: GameResponse,
        baseState?: {
            角色: typeof 角色;
            环境: typeof 环境;
            社交: typeof 社交;
            世界: typeof 世界;
            战斗: typeof 战斗;
            玩家门派?: 详细门派结构;
            任务列表?: any[];
            约定列表?: any[];
            剧情: typeof 剧情;
            剧情规划: typeof 剧情规划;
            女主剧情规划?: 女主剧情规划结构;
            同人剧情规划?: 同人剧情规划结构;
            同人女主剧情规划?: 同人女主剧情规划结构;
        },
        options?: {
            applyState?: boolean;
        }
    ) => 执行响应命令处理(
        response,
        {
            角色,
            环境,
            社交,
            世界,
            战斗,
            玩家门派,
            任务列表,
            约定列表,
            剧情,
            剧情规划,
            女主剧情规划,
            同人剧情规划,
            同人女主剧情规划
        },
        {
            规范化环境信息,
            规范化社交列表: 规范化社交列表安全,
            规范化世界状态,
            规范化战斗状态,
            规范化门派状态,
            规范化剧情状态,
            规范化剧情规划状态,
            规范化女主剧情规划状态,
            规范化同人剧情规划状态,
            规范化同人女主剧情规划状态,
            规范化角色物品容器映射,
            战斗结束自动清空,
            设置角色,
            设置环境,
            设置社交,
            设置世界,
            设置战斗,
            设置玩家门派,
            设置任务列表,
            设置约定列表,
            设置剧情,
            设置剧情规划,
            设置女主剧情规划,
            设置同人剧情规划,
            设置同人女主剧情规划,
            命令后校准: (nextState) => {
                if (!变量生成功能已启用(apiConfig)) {
                    return nextState;
                }
                return 执行变量自动校准(nextState, {
                    规范化环境信息,
                    规范化社交列表: 规范化社交列表安全,
                    规范化世界状态,
                    规范化战斗状态,
                    规范化门派状态,
                    规范化剧情状态,
                    规范化剧情规划状态,
                    规范化女主剧情规划状态,
                    规范化同人剧情规划状态,
                    规范化同人女主剧情规划状态,
                    规范化角色物品容器映射
                });
            }
        },
        baseState,
        options
    );

    const 执行世界演变更新 = async (params?: {
        来源?: 'manual' | 'auto_due' | 'story_dynamic' | 'story_dynamic_and_due';
        动态世界线索?: string[];
        到期摘要?: string[];
        force?: boolean;
        currentResponse?: GameResponse;
        stateBase?: {
            角色: typeof 角色;
            环境: typeof 环境;
            社交: typeof 社交;
            世界: typeof 世界;
            战斗: typeof 战斗;
            剧情: typeof 剧情;
            剧情规划: typeof 剧情规划;
            女主剧情规划?: 女主剧情规划结构;
            同人剧情规划?: 同人剧情规划结构;
            同人女主剧情规划?: 同人女主剧情规划结构;
        };
    }) => 执行世界演变更新工作流(
        params,
        {
            apiSettings: apiConfig,
            gameConfig,
            角色,
            环境,
            世界,
            剧情,
            记忆系统,
            历史记录,
            prompts,
            开局配置,
            worldbooks: 世界书列表,
            世界演变进行中Ref,
            世界演变去重签名Ref,
            已进入主剧情回合,
            按回合窗口裁剪历史,
            规范化环境信息,
            规范化世界状态,
            规范化剧情状态,
            processResponseCommands,
            setWorldEvents,
            set世界演变更新中,
            set世界演变状态文本,
            set世界演变最近更新时间,
            set世界演变最近摘要,
            set世界演变最近原始消息,
            追加系统消息
        }
    );

    const {
        后台执行统一规划分析
    } = 创建规划更新工作流({
        apiConfig,
        gameConfig,
        角色,
        环境,
        世界,
        战斗,
        玩家门派,
        任务列表,
        约定列表,
        历史记录,
        开局配置,
        prompts,
        worldbooks: 世界书列表,
        规范化环境信息,
        规范化社交列表: 规范化社交列表安全,
        规范化世界状态,
        规范化战斗状态,
        规范化门派状态,
        规范化剧情状态,
        规范化剧情规划状态,
        规范化女主剧情规划状态,
        规范化同人剧情规划状态,
        规范化同人女主剧情规划状态,
        深拷贝,
        收集最近完整正文回合,
        构建最近完整正文上下文,
        去重文本数组,
        收集女主规划时间触发原因,
        收集女主正文命中原因,
        收集剧情规划时间触发原因,
        收集剧情正文命中原因,
        提取响应完整正文文本,
        设置剧情,
        设置剧情规划,
        设置女主剧情规划,
        设置同人剧情规划,
        设置同人女主剧情规划,
        performAutoSave: (...args) => performAutoSave(...args)
    });

    const { handleForceWorldEvolutionUpdate } = use世界演变控制({
        view,
        loading,
        apiConfig,
        环境,
        世界,
        世界演变更新中,
        变量生成中: 变量生成中,
        世界演变状态文本,
        世界演变最近更新时间,
        世界演变最近现实更新时间戳Ref,
        世界演变去重签名Ref,
        世界演变功能已开启,
        已进入主剧情回合,
        set世界演变状态文本,
        规范化世界状态,
        执行世界演变更新
    });

    const 等待世界演变空闲 = async (signal?: AbortSignal, timeoutMs = 20000): Promise<void> => {
        const startedAt = Date.now();
        while (世界演变进行中Ref.current) {
            if (signal?.aborted) {
                throw new DOMException('变量生成已取消', 'AbortError');
            }
            if (Date.now() - startedAt >= timeoutMs) {
                const timeoutError = new Error(`等待世界演变完成超时（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒）`);
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 80);
            });
        }
    };

    let 执行重解析变量生成委托 = async (params: {
        snapshot: any;
        playerInput: string;
        parsedResponse: GameResponse;
    }): Promise<GameResponse> => params.parsedResponse;

    const {
        使用快照重建解析回合,
        updateHistoryItem,
        handleRegenerate,
        handleRetryLatestVariableGeneration,
        handleRecoverFromParseErrorRaw,
        handlePolishTurn
    } = 创建历史回合工作流({
        历史记录,
        记忆系统,
        memoryConfig,
        gameConfig,
        prompts,
        内置提示词列表,
        世界书列表,
        loading,
        变量生成中: 变量生成中,
        记忆总结阶段,
        社交,
        visualConfig,
        visualConfigRef,
        场景图片档案Ref,
        scrollRef,
        获取最新快照: () => 回合快照栈Ref.current[回合快照栈Ref.current.length - 1] || null,
        回档到快照,
        弹出重Roll快照,
        删除最近自动存档并重置状态,
        深拷贝,
        环境时间转标准串,
        获取开局配置: () => 开局配置,
        规范化记忆配置,
        规范化记忆系统,
        规范化社交列表: 规范化社交列表安全,
        规范化视觉设置,
        规范化场景图片档案,
        normalizeCanonicalGameTime,
        构建即时记忆条目,
        构建短期记忆条目,
        写入四段记忆,
        估算AI输出Token,
        提取解析失败原始信息,
        提取原始报错详情,
        构建标签解析选项,
        parseStoryRawText: textAIService.parseStoryRawText,
        执行正文润色,
        规范化游戏设置,
        processResponseCommands,
        按世界演变分流净化响应,
        世界演变功能已开启,
        执行重解析变量生成: (params) => 执行重解析变量生成委托(params),
        应用并同步记忆系统,
        performAutoSave: (...args) => performAutoSave(...args),
        设置剧情,
        设置历史记录,
        设置玩家门派,
        设置任务列表,
        设置约定列表,
        设置社交,
        记录变量生成上下文,
        set聊天区自动滚动抑制令牌,
        获取NPC唯一标识,
        合并NPC图片档案
    });

    const {
        后台执行变量校准: 后台执行变量生成,
        执行变量校准并合并响应: 执行变量生成并合并响应,
        执行重解析变量校准: 执行重解析变量生成
    } = 创建变量生成协调器({
        apiConfig,
        gameConfig,
        prompts,
        开局配置,
        内置提示词列表,
        世界书列表,
        世界演变进行中Ref,
        variableGenerationAbortControllerRef,
        set变量生成中: set变量生成中,
        深拷贝,
        世界演变功能已开启,
        等待世界演变空闲,
        收集最近变量生成上下文,
        执行变量模型校准工作流,
        合并变量生成结果到响应,
        变量生成功能已启用,
        获取变量计算接口配置,
        接口配置是否可用,
        序列化变量生成命令: 序列化变量校准命令,
        使用快照重建解析回合
    });
    执行重解析变量生成委托 = 执行重解析变量生成;

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (variableGenerationAbortControllerRef.current) {
            variableGenerationAbortControllerRef.current.abort();
        }
    };

    const handleCancelVariableGeneration = () => {
        if (variableGenerationAbortControllerRef.current) {
            variableGenerationAbortControllerRef.current.abort();
        }
    };

    const buildContextSnapshot = async (): Promise<上下文快照> => {
        const currentRefs = [
            apiConfig,
            gameConfig,
            memoryConfig,
            prompts,
            内置提示词列表,
            世界书列表,
            记忆系统,
            历史记录,
            社交,
            角色,
            环境,
            世界,
            战斗,
            玩家门派,
            任务列表,
            约定列表,
            剧情,
            剧情规划,
            女主剧情规划,
            同人剧情规划,
            同人女主剧情规划,
            开局配置
        ];
        const cached = 上下文快照缓存Ref.current;
        if (
            cached
            && cached.refs.length === currentRefs.length
            && cached.refs.every((item, index) => item === currentRefs[index])
        ) {
            return cached.value;
        }

        const nextSnapshot = await 构建上下文快照数据({
            apiConfig,
            gameConfig,
            memoryConfig,
            prompts,
            内置提示词列表,
            世界书列表,
            记忆系统,
            历史记录,
            社交,
            角色,
            环境,
            世界,
            战斗,
            玩家门派,
            任务列表,
            约定列表,
            剧情,
            剧情规划,
            女主剧情规划,
            同人剧情规划,
            同人女主剧情规划,
            开局配置,
            规范化环境信息,
            规范化剧情状态,
            规范化剧情规划状态,
            规范化女主剧情规划状态,
            规范化同人剧情规划状态,
            规范化同人女主剧情规划状态,
            按回合窗口裁剪历史,
            构建系统提示词
        });
        上下文快照缓存Ref.current = {
            value: nextSnapshot,
            refs: currentRefs
        };
        return nextSnapshot;
    };

    // --- Core Send Logic ---
    const handleSend = async (
        content: string,
        isStreaming: boolean = true,
        options?: 发送选项
    ): Promise<发送结果> => {
        if (后台队列处理中) {
            return {
                cancelled: true,
                errorTitle: '后台队列仍在处理',
                errorDetail: '上一轮的变量、世界演变或规划分析还没完成，暂时不能继续下一次正文生成。'
            };
        }
        set开局变量生成进度(null);
        set开局世界演变进度(null);
        set开局规划进度(null);
        if (variableGenerationAbortControllerRef.current) {
            variableGenerationAbortControllerRef.current.abort();
        }
        const promptPool = (Array.isArray(prompts) && prompts.length > 0) ? prompts : await ensurePromptsLoaded();
        return 执行主剧情发送工作流(
            content,
            isStreaming,
            {
                历史记录,
                记忆系统,
                角色,
                环境,
                社交,
                世界,
                战斗,
                玩家门派,
                任务列表,
                约定列表,
                剧情,
                剧情规划,
                女主剧情规划,
                同人剧情规划,
                同人女主剧情规划,
                开局配置,
                loading,
                gameConfig,
                apiConfig,
                memoryConfig,
                visualConfig,
                sceneImageArchive: 场景图片档案,
                prompts: promptPool,
                内置提示词列表,
                世界书列表
            },
            {
                abortControllerRef,
                setLoading,
                set后台队列处理中,
                setShowSettings,
                设置剧情,
                设置历史记录,
                应用并同步记忆系统,
                构建系统提示词,
                processResponseCommands,
                performAutoSave,
                执行正文润色,
                执行世界演变更新,
                触发新增NPC自动生图,
                触发场景自动生图,
                应用常驻壁纸为背景,
                提取新增NPC列表,
                推入重Roll快照,
                弹出重Roll快照: () => 弹出重Roll快照() || undefined,
                回档到快照,
                深拷贝,
                按回合窗口裁剪历史,
                规范化环境信息,
                规范化剧情状态,
                规范化剧情规划状态,
                规范化女主剧情规划状态,
                规范化同人剧情规划状态,
                规范化同人女主剧情规划状态,
                规范化世界状态,
                游戏设置启用自动重试,
                执行带自动重试的生成请求,
                更新流式草稿为自动重试提示,
                提取解析失败原始信息,
                提取原始报错详情,
                格式化错误详情,
                获取原始AI消息,
                估算消息Token,
                估算AI输出Token,
                计算回复耗时秒,
                文章优化功能已开启,
                后台执行统一规划分析,
                后台执行变量生成,
                执行变量生成并合并响应
            },
            options
        );
    };

    const {
        savePngStylePreset: 保存PNG画风预设,
        deletePngStylePreset: 删除PNG画风预设,
        setCurrentPngStylePreset: 设置当前PNG画风预设,
        getCurrentPngStylePreset: 获取当前PNG画风预设摘要,
        parsePngStylePreset,
        exportPngStylePresets: 导出PNG画风预设,
        importPngStylePresets: 导入PNG画风预设,
        saveCharacterAnchor: 保存角色锚点,
        deleteCharacterAnchor: 删除角色锚点,
        setCurrentCharacterAnchor: 设置当前角色锚点,
        getCharacterAnchor: 读取角色锚点,
        getCharacterAnchorByNpcId: 按NPC读取角色锚点,
        getPlayerCharacterAnchor: 读取主角角色锚点,
        getSceneCharacterAnchors: 提取场景角色锚点,
        extractCharacterAnchor: 提取角色锚点,
        extractPlayerCharacterAnchor: 提取主角角色锚点
    } = 创建图片预设工作流({
        获取接口配置: () => apiConfigRef.current,
        更新接口配置: updateApiConfig,
        加载图片AI服务,
        推送右下角提示,
        保存图片资源: dbService.保存图片资源,
        获取社交列表: () => 社交,
        获取角色: () => 角色,
        isCultivationSystemEnabled: 读取修炼体系开关
    });

    const updateMemorySystem = (nextMemory: 记忆系统结构) => {
        const normalized = 规范化记忆系统(nextMemory);
        应用并同步记忆系统(normalized);
    };

    const 存档格式版本 = 3;
    const 自动存档最小间隔毫秒 = 30000;
    const 重置读档瞬态状态 = () => {
        清空变量生成上下文缓存();
        世界演变进行中Ref.current = false;
        世界演变去重签名Ref.current = '';
        set世界演变更新中(false);
        set世界演变状态文本('世界演变待命');
        set世界演变最近更新时间(null);
        世界演变最近现实更新时间戳Ref.current = 0;
        set世界演变最近摘要([]);
        set世界演变最近原始消息('');
    };

    const {
        handleSaveGame,
        performAutoSave,
        handleLoadGame
    } = 创建存读档工作流({
        存档格式版本,
        自动存档最小间隔毫秒,
        深拷贝,
        历史记录,
        角色,
        环境,
        社交,
        世界,
        战斗,
        玩家门派,
        任务列表,
        约定列表,
        剧情,
        剧情规划,
        女主剧情规划,
        同人剧情规划,
        同人女主剧情规划,
        记忆系统,
        openingConfig: 开局配置,
        提示词池: prompts,
        游戏初始时间,
        gameConfig,
        memoryConfig,
        获取当前视觉设置快照: () => 规范化视觉设置(深拷贝(visualConfigRef.current || visualConfig)),
        获取当前场景图片档案快照: () => 规范化场景图片档案(深拷贝(场景图片档案Ref.current || 场景图片档案)),
        获取角色锚点列表: () => 规范化接口设置(apiConfigRef.current).功能模型占位.角色锚点列表,
        获取当前角色锚点ID: () => 规范化接口设置(apiConfigRef.current).功能模型占位.当前角色锚点ID,
        构建完整地点文本,
        规范化环境信息,
        规范化世界状态,
        规范化战斗状态,
        规范化剧情状态,
        规范化剧情规划状态,
        规范化女主剧情规划状态,
        规范化同人剧情规划状态,
        规范化同人女主剧情规划状态,
        规范化记忆系统,
        规范化可选开局配置,
        规范化记忆配置,
        规范化游戏设置,
        规范化视觉设置,
        规范化场景图片档案,
        规范化角色物品容器映射,
        规范化社交列表: 规范化社交列表安全,
        获取当前提示词池: () => prompts,
        创建开场空白环境,
        创建开场空白世界,
        创建开场空白战斗,
        创建空门派状态,
        创建开场空白剧情,
        应用并同步记忆系统,
        setHasSave,
        setGameConfig,
        setMemoryConfig,
        设置视觉设置: 应用视觉设置到状态,
        设置场景图片档案: 应用场景图片档案到状态,
        设置游戏初始时间,
        设置角色锚点列表: (value) => {
            void updateApiConfig(config => ({
                ...config,
                功能模型占位: {
                    ...config.功能模型占位,
                    角色锚点列表: Array.isArray(value) ? value : []
                }
            }));
        },
        设置当前角色锚点ID: (value) => {
            void updateApiConfig(config => ({
                ...config,
                功能模型占位: {
                    ...config.功能模型占位,
                    当前角色锚点ID: typeof value === 'string' ? value : ''
                }
            }));
        },
        setView,
        setShowSaveLoad,
        设置最近开局配置,
        设置角色,
        设置环境,
        设置社交,
        设置世界,
        设置战斗,
        设置玩家门派,
        设置任务列表,
        设置约定列表,
        设置剧情,
        设置剧情规划,
        设置女主剧情规划,
        设置同人剧情规划,
        设置同人女主剧情规划,
        设置开局配置,
        设置提示词池: setPrompts,
        设置历史记录,
        清空重Roll快照,
        重置自动存档状态,
        最近自动存档时间戳Ref,
        最近自动存档签名Ref,
        读档前重置瞬态状态: 重置读档瞬态状态,
        读档后重置上下文: 清空变量生成上下文缓存,
        读档后定位到最新回合: () => set聊天区强制置底令牌(prev => prev + 1)
    });

    const {
        handleStartNewGameWizard,
        generateOpeningStory,
        handleGenerateWorld,
        handleReturnToHome,
        handleQuickRestart
    } = 创建会话生命周期工作流({
        apiConfig,
        gameConfig,
        memoryConfig,
        view,
        prompts,
        历史记录,
        记忆系统,
        社交,
        环境,
        角色,
        世界,
        战斗,
        玩家门派,
        任务列表,
        约定列表,
        剧情,
        剧情规划,
        女主剧情规划,
        同人剧情规划,
        同人女主剧情规划,
        开局配置,
        内置提示词列表,
        世界书列表,
        loading,
        最近开局配置,
        abortControllerRef,
        ensurePromptsLoaded,
        setView,
        setPrompts,
        setLoading,
        setShowSettings,
        设置历史记录,
        设置最近开局配置,
        清空重Roll快照,
        推入重Roll快照,
        重置自动存档状态,
        设置角色,
        设置环境,
        设置游戏初始时间,
        设置社交,
        设置世界,
        设置战斗,
        设置玩家门派,
        设置任务列表,
        设置约定列表,
        设置剧情,
        设置剧情规划,
        设置女主剧情规划,
        设置同人剧情规划,
        设置同人女主剧情规划,
        设置开局配置,
        设置开局变量生成进度: set开局变量生成进度,
        设置开局世界演变进度: set开局世界演变进度,
        设置开局规划进度: set开局规划进度,
        setWorldEvents,
        应用并同步记忆系统,
        清空变量生成上下文缓存,
        创建开场基础状态,
        构建前端清空开场状态,
        创建开场命令基态,
        创建开场空白环境,
        创建开场空白世界,
        创建开场空白战斗,
        创建空门派状态,
        创建开场空白剧情,
        创建空剧情规划,
        创建空记忆系统,
        应用开场基态,
        追加系统消息,
        替换流式草稿为失败提示,
        记录变量生成上下文,
        深拷贝,
        performAutoSave,
        构建系统提示词,
        processResponseCommands,
        规范化环境信息,
        规范化剧情状态,
        规范化剧情规划状态,
        规范化女主剧情规划状态,
        规范化同人剧情规划状态,
        规范化同人女主剧情规划状态,
        规范化角色物品容器映射,
        规范化社交列表: 规范化社交列表安全,
        规范化世界状态,
        规范化战斗状态,
        规范化门派状态,
        游戏设置启用自动重试,
        执行带自动重试的生成请求,
        更新流式草稿为自动重试提示,
        提取解析失败原始信息,
        获取原始AI消息,
        估算消息Token,
        估算AI输出Token,
        计算回复耗时秒,
        触发新增NPC自动生图,
        触发场景自动生图,
        提取新增NPC列表,
        获取当前视觉设置快照: () => 规范化视觉设置(深拷贝(visualConfigRef.current || visualConfig)),
        获取当前场景图片档案快照: () => 规范化场景图片档案(深拷贝(场景图片档案Ref.current || 场景图片档案))
    });

    const {
        createNpcManually,
        updateNpcManually,
        deleteNpcManually,
        uploadNpcImageToSlot,
        updateNpcMajorRole,
        updateNpcPresence,
        removeNpc
    } = 创建手动NPC工作流({
        获取环境: () => 环境,
        环境时间转标准串,
        规范化社交列表: 规范化社交列表安全,
        设置社交,
        执行社交自动存档: (socialSnapshot) => {
            void performAutoSave({ social: socialSnapshot, history: 历史记录, force: true });
        },
        保存图片资源: dbService.保存图片资源
    });

    const {
        updateRuntimeVariableSection,
        applyRuntimeVariableCommand,
        removeTask,
        removeAgreement
    } = 创建运行时变量工作流({
        获取历史记录: () => 历史记录,
        深拷贝,
        获取当前状态: () => ({
            角色,
            环境,
            社交,
            世界,
            战斗,
            剧情,
            剧情规划,
            女主剧情规划,
            同人剧情规划,
            同人女主剧情规划,
            玩家门派,
            任务列表,
            约定列表,
            记忆系统
        }),
        规范化角色物品容器映射,
        规范化环境信息,
        规范化社交列表: 规范化社交列表安全,
        规范化世界状态,
        规范化战斗状态,
        规范化剧情状态,
        规范化剧情规划状态,
        规范化女主剧情规划状态,
        规范化同人剧情规划状态,
        规范化同人女主剧情规划状态,
        规范化门派状态,
        规范化记忆系统,
        环境时间转标准串,
        获取开局配置: () => 开局配置,
        设置角色,
        设置环境,
        设置社交,
        设置世界,
        设置战斗,
        设置剧情,
        设置剧情规划,
        设置女主剧情规划,
        设置同人剧情规划,
        设置同人女主剧情规划,
        设置玩家门派,
        设置任务列表,
        设置约定列表,
        应用并同步记忆系统,
        performAutoSave
    });

    const {
        generateNpcImageManually,
        generateNpcSecretPartImage,
        retryNpcImageGeneration
    } = 创建手动图片动作工作流({
        获取社交列表: () => 社交,
        记录后台手动生图监控: (payload) => {
            后台手动生图监控Ref.current.push(payload);
        },
        记录后台私密生图监控: (payload) => {
            后台私密生图监控Ref.current.push(payload);
        },
        推送右下角提示,
        执行单个NPC生图,
        执行NPC香闺秘档部位生图
    });

    const {
        updatePlayerAvatar: 更新玩家头像,
        selectPlayerAvatarImage: 选择主角头像图片,
        clearPlayerAvatarImage: 清除主角头像图片,
        selectPlayerPortraitImage: 选择主角立绘图片,
        clearPlayerPortraitImage: 清除主角立绘图片,
        removePlayerImageRecord: 删除主角图片记录,
        generatePlayerImageManually: 生成主角图片
    } = 创建主角图片工作流({
        获取角色: () => 角色,
        设置角色,
        规范化角色物品容器映射,
        执行自动存档: performAutoSave,
        获取历史记录: () => 历史记录,
        推送右下角提示,
        加载NPC生图工作流,
        apiConfig,
        获取文生图接口配置,
        获取生图词组转化器接口配置,
        获取生图画师串预设,
        获取当前PNG画风预设: (presetId?: string) => 获取当前PNG画风预设摘要(presetId, 'npc'),
        读取主角角色锚点,
        获取词组转化器预设提示词,
        接口配置是否可用,
        读取文生图功能配置,
        主角生图进行中集合: 主角生图进行中Ref.current,
        提取主角生图基础数据: (character) => 提取主角生图基础数据(character, {
            cultivationSystemEnabled: 读取修炼体系开关()
        }),
        创建NPC生图任务,
        生成NPC生图记录ID,
        构建文生图额外要求
    });

    return {
        state: gameState,
        meta: {
            canRerollLatest: 可重Roll计数 > 0,
            canRetryLatestVariableGeneration: 可重Roll计数 > 0 && 历史记录.some(item => item?.role === 'assistant'),
            canQuickRestart: Boolean(最近开局配置),
            worldEvolutionEnabled: 已进入主剧情回合() && 接口配置是否可用(获取世界演变接口配置(apiConfig)),
            worldEvolutionUpdating: 世界演变更新中,
            worldEvolutionStatus: 世界演变状态文本,
            worldEvolutionLastUpdatedAt: 世界演变最近更新时间,
            worldEvolutionLastSummary: 世界演变最近摘要,
            worldEvolutionLastRawText: 世界演变最近原始消息,
            memorySummaryOpen: Boolean(待处理记忆总结任务) && 记忆总结阶段 !== 'idle',
            memorySummaryStage: 记忆总结阶段,
            memorySummaryTask: 待处理记忆总结任务,
            memorySummaryDraft: 记忆总结草稿,
            memorySummaryError: 记忆总结错误,
            npcMemorySummaryOpen: !Boolean(待处理记忆总结任务) && Boolean(待处理NPC记忆总结队列[0]) && NPC记忆总结阶段 !== 'idle',
            npcMemorySummaryStage: NPC记忆总结阶段,
            npcMemorySummaryTask: 待处理NPC记忆总结队列[0] || null,
            npcMemorySummaryDraft: NPC记忆总结草稿,
            npcMemorySummaryError: NPC记忆总结错误,
            npcMemorySummaryQueueLength: 待处理NPC记忆总结队列.length,
            imageGenerationQueue: NPC生图任务队列,
            sceneImageArchive: 场景图片档案,
            sceneImageQueue: 场景生图任务队列,
            variableGenerationRunning: 变量生成中,
            postStoryQueueRunning: 后台队列处理中,
            openingWorldEvolutionProgress: 开局世界演变进度,
            openingPlanningProgress: 开局规划进度,
            openingVariableGenerationProgress: 开局变量生成进度,
            builtinPromptEntries: 内置提示词列表,
            worldbooks: 世界书列表,
            worldbookPresetGroups: 世界书预设组列表,
            notifications: 右下角提示列表,
            chatScrollSuppressToken: 聊天区自动滚动抑制令牌,
            chatForceScrollToken: 聊天区强制置底令牌
        },
        setters: {
            setShowSettings, setShowInventory, setShowEquipment, setShowBattle, setShowSocial, setShowTeam, setShowKungfu, setShowWorld, setShowMap, setShowSect, setShowTask, setShowAgreement, setShowStory, setShowHeroinePlan, setShowMemory, setShowSaveLoad,
            setActiveTab, setCurrentTheme,
            setApiConfig, setVisualConfig, setImageManagerConfig, setPrompts
        },
        actions: {
            handleSend,
            handleStop,
            handleCancelVariableGeneration,
            handleRegenerate,
            handleRetryLatestVariableGeneration,
            handlePolishTurn,
            handleRecoverFromParseErrorRaw,
            saveSettings, saveVisualSettings, saveImageManagerSettings, saveGameSettings, saveMemorySettings,
            saveBuiltinPromptEntries,
            saveWorldbooks, saveWorldbookPresetGroups,
            updatePrompts, updateFestivals,
            handleSaveGame, handleLoadGame,
            updateHistoryItem,
            updateMemorySystem,
            createNpcManually,
            updateNpcManually,
            deleteNpcManually,
            uploadNpcImageToSlot,
            updateRuntimeVariableSection,
            applyRuntimeVariableCommand,
            handleStartNewGameWizard,
            handleGenerateWorld,
            handleQuickRestart,
            handleReturnToHome,
            updateNpcMajorRole,
            updateNpcPresence,
            removeNpc,
            removeTask,
            removeAgreement,
            generateNpcImageManually,
            generateNpcSecretPartImage,
            retryNpcImageGeneration,
            updatePlayerAvatar: 更新玩家头像,
            generatePlayerImageManually: 生成主角图片,
            selectPlayerAvatarImage: 选择主角头像图片,
            clearPlayerAvatarImage: 清除主角头像图片,
            selectPlayerPortraitImage: 选择主角立绘图片,
            clearPlayerPortraitImage: 清除主角立绘图片,
            removePlayerImageRecord: 删除主角图片记录,
            generateSceneImageManually: 生成场景壁纸,
            selectNpcAvatarImage: 选择NPC头像图片,
            selectNpcPortraitImage: 选择NPC立绘图片,
            selectNpcBackgroundImage: 选择NPC背景图片,
            clearNpcAvatarImage: 清除NPC头像图片,
            clearNpcPortraitImage: 清除NPC立绘图片,
            clearNpcBackgroundImage: 清除NPC背景图片,
            removeNpcImageRecord: 删除NPC图片记录,
            clearNpcImageHistory: 清空NPC图片历史,
            removeNpcImageQueueTask: 删除NPC生图任务,
            clearNpcImageQueue: 清空NPC生图任务队列,
            saveNpcImageLocally: 保存NPC图片本地副本,
            applySceneImageWallpaper: 应用场景图片为壁纸,
            clearSceneWallpaper: 清除场景壁纸,
            removeSceneImageRecord: 删除场景图片记录,
            clearSceneImageHistory: 清空场景图片历史,
            removeSceneImageQueueTask: 删除场景生图任务,
            clearSceneImageQueue: 清空场景生图任务队列,
            saveSceneImageLocally: 保存场景图片本地副本,
            dismissNotification: 关闭右下角提示,
            handleForceWorldEvolutionUpdate,
            getContextSnapshot: buildContextSnapshot,
            handleStartMemorySummary,
            handleCancelMemorySummary,
            handleBackToMemorySummaryRemind,
            handleUpdateMemorySummaryDraft,
            handleStartManualMemorySummary,
            handleApplyMemorySummary,
            handleStartNpcMemorySummary,
            handleCancelNpcMemorySummary,
            handleBackToNpcMemorySummaryRemind,
            handleUpdateNpcMemorySummaryDraft,
            handleQueueManualNpcMemorySummary,
            handleApplyNpcMemorySummary,
            saveArtistPreset,
            deleteArtistPreset,
            saveModelConverterPreset,
            deleteModelConverterPreset,
            setModelConverterPresetEnabled,
            savePromptConverterPreset,
            deletePromptConverterPreset,
            saveCharacterAnchor: 保存角色锚点,
            deleteCharacterAnchor: 删除角色锚点,
            setCurrentCharacterAnchor: 设置当前角色锚点,
            getCharacterAnchor: 读取角色锚点,
            getCharacterAnchorByNpcId: 按NPC读取角色锚点,
            getPlayerCharacterAnchor: 读取主角角色锚点,
            extractCharacterAnchor: 提取角色锚点,
            extractPlayerCharacterAnchor: 提取主角角色锚点,
            importPresets,
            exportPresets,
            savePngStylePreset: 保存PNG画风预设,
            deletePngStylePreset: 删除PNG画风预设,
            setCurrentPngStylePreset: 设置当前PNG画风预设,
            parsePngStylePreset,
            exportPngStylePresets: 导出PNG画风预设,
            importPngStylePresets: 导入PNG画风预设,
            setPersistentWallpaper: 设置常驻壁纸,
            clearPersistentWallpaper: 清除常驻壁纸,
            pushNotification: 推送右下角提示
        }
    };
};
