import type {
    GameResponse,
    OpeningConfig,
    WorldGenConfig,
    角色数据结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    提示词结构
} from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取主剧情接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 执行开场剧情生成工作流 } from './openingStoryWorkflow';
import { 执行世界生成工作流 } from './worldGenerationWorkflow';

type 快速重开模式 = 'world_only' | 'opening_only' | 'all';

type 世界生成选项 = {
    清空前端变量?: boolean;
};

type 最近开局配置结构 = {
    worldConfig: WorldGenConfig;
    charData: 角色数据结构;
    openingConfig?: OpeningConfig;
    openingStreaming: boolean;
    openingExtraPrompt: string;
};

type 回合快照结构 = {
    玩家输入: string;
    游戏时间: string;
    回档前状态: {
        角色: any;
        环境: any;
        社交: any[];
        世界: any;
        战斗: any;
        玩家门派: any;
        任务列表: any[];
        约定列表: any[];
        剧情: any;
        剧情规划?: any;
        女主剧情规划?: any;
        同人剧情规划?: any;
        同人女主剧情规划?: any;
        记忆系统: any;
    };
    回档前持久态: {
        视觉设置: any;
        场景图片档案: any;
    };
    回档前历史: any[];
};

type 会话生命周期依赖 = {
    apiConfig: any;
    gameConfig: any;
    memoryConfig: any;
    view: 'home' | 'game' | 'new_game';
    prompts: 提示词结构[];
    历史记录: any[];
    记忆系统: any;
    社交: any[];
    环境: any;
    角色: any;
    世界: any;
    战斗: any;
    玩家门派: any;
    任务列表: any[];
    约定列表: any[];
    剧情: any;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
    开局配置?: OpeningConfig;
    内置提示词列表: any[];
    世界书列表: any[];
    loading: boolean;
    最近开局配置: 最近开局配置结构 | null;
    abortControllerRef: { current: AbortController | null };
    ensurePromptsLoaded: () => Promise<提示词结构[]>;
    setView: (value: 'home' | 'game' | 'new_game') => void;
    setPrompts: (value: 提示词结构[]) => void;
    setLoading: (value: boolean) => void;
    setShowSettings: (value: boolean) => void;
    设置历史记录: (value: any) => void;
    设置最近开局配置: (value: 最近开局配置结构 | null) => void;
    清空重Roll快照: () => void;
    推入重Roll快照: (snapshot: 回合快照结构) => void;
    重置自动存档状态: () => void;
    设置角色: (value: any) => void;
    设置环境: (value: any) => void;
    设置游戏初始时间: (value: string) => void;
    设置社交: (value: any[]) => void;
    设置世界: (value: any) => void;
    设置战斗: (value: any) => void;
    设置玩家门派: (value: any) => void;
    设置任务列表: (value: any[]) => void;
    设置约定列表: (value: any[]) => void;
    设置剧情: (value: any) => void;
    设置剧情规划: (value: any) => void;
    设置女主剧情规划: (value: any) => void;
    设置同人剧情规划: (value: any) => void;
    设置同人女主剧情规划: (value: any) => void;
    设置开局配置: (value: OpeningConfig | undefined) => void;
    设置开局变量生成进度: (value: any) => void;
    设置开局世界演变进度: (value: any) => void;
    设置开局规划进度: (value: any) => void;
    setWorldEvents: (value: any[]) => void;
    应用并同步记忆系统: (memory: any, options?: { 静默总结提示?: boolean }) => void;
    清空变量生成上下文缓存: () => void;
    创建开场基础状态: (charData: 角色数据结构, worldConfig: WorldGenConfig) => any;
    构建前端清空开场状态: (openingBase: any) => any;
    创建开场命令基态: (角色?: any) => any;
    创建开场空白环境: () => any;
    创建开场空白世界: () => any;
    创建开场空白战斗: () => any;
    创建空门派状态: () => any;
    创建开场空白剧情: () => any;
    创建空剧情规划: () => any;
    创建空记忆系统: () => any;
    应用开场基态: (openingBase: any) => void;
    追加系统消息: (content: string, options?: { position?: 'tail' | 'after_last_turn' }) => void;
    替换流式草稿为失败提示: (history: any[], errorMessage: string) => any[];
    记录变量生成上下文: (params: { playerInput: string; response: any }) => void;
    performAutoSave: (snapshot?: any) => Promise<void>;
    构建系统提示词: (...args: any[]) => any;
    深拷贝: <T>(value: T) => T;
    processResponseCommands: (response: GameResponse, baseState?: any, options?: { applyState?: boolean }) => any;
    规范化环境信息: (envLike?: any) => any;
    规范化剧情状态: (raw?: any, envLike?: any) => any;
    规范化剧情规划状态: (raw?: any) => any;
    规范化女主剧情规划状态: (raw?: any) => any;
    规范化同人剧情规划状态: (raw?: any) => any;
    规范化同人女主剧情规划状态: (raw?: any) => any;
    规范化角色物品容器映射: (raw?: any) => any;
    规范化社交列表: (raw?: any[], options?: { 合并同名?: boolean }) => any[];
    规范化世界状态: (raw?: any) => any;
    规范化战斗状态: (raw?: any) => any;
    规范化门派状态: (raw?: any) => any;
    游戏设置启用自动重试: (config?: any) => boolean;
    执行带自动重试的生成请求: <T>(params: {
        enabled: boolean;
        action: () => Promise<T>;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
    }) => Promise<T>;
    更新流式草稿为自动重试提示: (history: any[], attempt: number, maxAttempts: number, reason: string) => any[];
    提取解析失败原始信息: (error: any) => string;
    获取原始AI消息: (rawText: string) => string;
    估算消息Token: (messages: Array<{ role?: string; content?: string; name?: string }>, model?: string) => number;
    估算AI输出Token: (rawText: string, model?: string) => number;
    计算回复耗时秒: (startedAt: number, endedAt?: number) => number;
    触发新增NPC自动生图: (newNpcList: any[]) => void;
    触发场景自动生图: (params: any) => Promise<void> | void;
    提取新增NPC列表: (beforeList: any[], afterList: any[]) => any[];
    获取当前视觉设置快照: () => any;
    获取当前场景图片档案快照: () => any;
};

export const 创建会话生命周期工作流 = (deps: 会话生命周期依赖) => {
    const handleStartNewGameWizard = () => {
        deps.清空重Roll快照();
        deps.重置自动存档状态();
        deps.设置最近开局配置(null);
        deps.setLoading(false);
        deps.设置环境(deps.创建开场空白环境());
        deps.设置游戏初始时间('');
        deps.设置社交([]);
        deps.设置世界(deps.创建开场空白世界());
        deps.设置战斗(deps.创建开场空白战斗());
        deps.设置玩家门派(deps.创建空门派状态());
        deps.设置任务列表([]);
        deps.设置约定列表([]);
        deps.设置剧情(deps.创建开场空白剧情());
        deps.设置剧情规划(deps.创建空剧情规划());
        deps.设置女主剧情规划(undefined);
        deps.设置同人剧情规划(undefined);
        deps.设置同人女主剧情规划(undefined);
        deps.设置开局配置(undefined);
        deps.设置开局变量生成进度(null);
        deps.设置开局世界演变进度(null);
        deps.设置开局规划进度(null);
        deps.应用并同步记忆系统({ 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] }, { 静默总结提示: true });
        deps.设置历史记录([]);
        deps.清空变量生成上下文缓存();
        deps.setWorldEvents([]);
        deps.setView('new_game');
    };

    const generateOpeningStory = async (
        contextData: any,
        promptSnapshot: 提示词结构[],
        useStreaming: boolean,
        apiForOpening: 当前可用接口结构,
        options?: {
            命令基态?: any;
            开局额外要求?: string;
            开局配置?: OpeningConfig;
        }
    ) => {
        deps.设置开局变量生成进度(null);
        deps.设置开局世界演变进度(null);
        deps.设置开局规划进度(null);
        const effectivePromptSnapshot = (Array.isArray(promptSnapshot) && promptSnapshot.length > 0)
            ? promptSnapshot
            : await deps.ensurePromptsLoaded();
        deps.推入重Roll快照({
            玩家输入: '',
            游戏时间: '',
            回档前状态: {
                角色: deps.深拷贝(contextData?.角色 || deps.角色),
                环境: deps.深拷贝(contextData?.环境 || deps.环境),
                社交: deps.深拷贝(Array.isArray(contextData?.社交) ? contextData.社交 : deps.社交),
                世界: deps.深拷贝(contextData?.世界 || deps.世界),
                战斗: deps.深拷贝(contextData?.战斗 || deps.战斗),
                玩家门派: deps.深拷贝(contextData?.玩家门派 || deps.玩家门派),
                任务列表: deps.深拷贝(Array.isArray(contextData?.任务列表) ? contextData.任务列表 : deps.任务列表),
                约定列表: deps.深拷贝(Array.isArray(contextData?.约定列表) ? contextData.约定列表 : deps.约定列表),
                剧情: deps.深拷贝(contextData?.剧情 || deps.剧情),
                剧情规划: deps.深拷贝(contextData?.剧情规划 ?? deps.剧情规划),
                女主剧情规划: deps.深拷贝(contextData?.女主剧情规划 ?? deps.女主剧情规划),
                同人剧情规划: deps.深拷贝(contextData?.同人剧情规划 ?? deps.同人剧情规划),
                同人女主剧情规划: deps.深拷贝(contextData?.同人女主剧情规划 ?? deps.同人女主剧情规划),
                记忆系统: deps.深拷贝(deps.记忆系统)
            },
            回档前持久态: {
                视觉设置: deps.获取当前视觉设置快照(),
                场景图片档案: deps.获取当前场景图片档案快照()
            },
            回档前历史: deps.深拷贝(Array.isArray(deps.历史记录) ? deps.历史记录 : [])
        });
        return 执行开场剧情生成工作流(
            contextData,
            effectivePromptSnapshot,
            useStreaming,
            apiForOpening,
            options,
            {
                apiConfig: deps.apiConfig,
                环境: deps.环境,
                角色: deps.角色,
                世界: deps.世界,
                战斗: deps.战斗,
                玩家门派: deps.玩家门派,
                任务列表: deps.任务列表,
                约定列表: deps.约定列表,
                剧情: deps.剧情,
                剧情规划: deps.剧情规划,
                女主剧情规划: deps.女主剧情规划,
                同人剧情规划: deps.同人剧情规划,
                同人女主剧情规划: deps.同人女主剧情规划,
                gameConfig: deps.gameConfig,
                memoryConfig: deps.memoryConfig,
                builtinPromptEntries: deps.内置提示词列表,
                worldbooks: deps.世界书列表,
                abortControllerRef: deps.abortControllerRef,
                setPrompts: deps.setPrompts,
                设置历史记录: deps.设置历史记录,
                设置角色: deps.设置角色,
                设置环境: deps.设置环境,
                设置社交: deps.设置社交,
                设置世界: deps.设置世界,
                设置战斗: deps.设置战斗,
                设置剧情: deps.设置剧情,
                设置剧情规划: deps.设置剧情规划,
                设置女主剧情规划: deps.设置女主剧情规划,
                设置同人剧情规划: deps.设置同人剧情规划,
                设置同人女主剧情规划: deps.设置同人女主剧情规划,
                设置玩家门派: deps.设置玩家门派,
                设置任务列表: deps.设置任务列表,
                设置约定列表: deps.设置约定列表,
                设置开局变量生成进度: deps.设置开局变量生成进度,
                设置开局世界演变进度: deps.设置开局世界演变进度,
                设置开局规划进度: deps.设置开局规划进度,
                设置游戏初始时间: deps.设置游戏初始时间,
                记录变量生成上下文: deps.记录变量生成上下文,
                setWorldEvents: deps.setWorldEvents,
                应用并同步记忆系统: deps.应用并同步记忆系统,
                performAutoSave: deps.performAutoSave,
                构建系统提示词: deps.构建系统提示词,
                processResponseCommands: deps.processResponseCommands,
                规范化环境信息: deps.规范化环境信息,
                规范化剧情状态: deps.规范化剧情状态,
                规范化女主剧情规划状态: (raw: any) => deps.规范化女主剧情规划状态(raw) || ({} as 女主剧情规划结构),
                规范化角色物品容器映射: deps.规范化角色物品容器映射,
                规范化社交列表: deps.规范化社交列表,
                规范化世界状态: deps.规范化世界状态,
                规范化战斗状态: deps.规范化战斗状态,
                规范化门派状态: deps.规范化门派状态,
                规范化剧情规划状态: deps.规范化剧情规划状态,
                规范化同人剧情规划状态: deps.规范化同人剧情规划状态,
                规范化同人女主剧情规划状态: deps.规范化同人女主剧情规划状态,
                游戏设置启用自动重试: deps.游戏设置启用自动重试,
                执行带自动重试的生成请求: deps.执行带自动重试的生成请求,
                更新流式草稿为自动重试提示: deps.更新流式草稿为自动重试提示,
                替换流式草稿为失败提示: deps.替换流式草稿为失败提示,
                提取解析失败原始信息: deps.提取解析失败原始信息,
                获取原始AI消息: deps.获取原始AI消息,
                估算消息Token: deps.估算消息Token,
                估算AI输出Token: deps.估算AI输出Token,
                计算回复耗时秒: deps.计算回复耗时秒,
                触发新增NPC自动生图: deps.触发新增NPC自动生图,
                触发场景自动生图: deps.触发场景自动生图,
                提取新增NPC列表: deps.提取新增NPC列表
            } as any
        );
    };

    const handleGenerateWorld = async (
        worldConfig: WorldGenConfig,
        charData: 角色数据结构,
        openingConfig: OpeningConfig | undefined,
        mode: 'all' | 'step',
        _openingStreaming: boolean = true,
        openingExtraPrompt: string = '',
        options?: 世界生成选项
    ) => {
        const promptPool = (Array.isArray(deps.prompts) && deps.prompts.length > 0) ? deps.prompts : await deps.ensurePromptsLoaded();
        deps.设置开局变量生成进度(null);
        deps.设置开局世界演变进度(null);
        deps.设置开局规划进度(null);
        return 执行世界生成工作流(
            worldConfig,
            charData,
            openingConfig,
            mode,
            true,
            openingExtraPrompt,
            options,
            {
                apiConfig: deps.apiConfig,
                gameConfig: deps.gameConfig,
                prompts: promptPool,
                view: deps.view,
                setView: deps.setView,
                setPrompts: deps.setPrompts,
                setLoading: deps.setLoading,
                setShowSettings: deps.setShowSettings,
                设置历史记录: deps.设置历史记录,
                设置开局配置: deps.设置开局配置,
                设置最近开局配置: deps.设置最近开局配置,
                清空重Roll快照: deps.清空重Roll快照,
                重置自动存档状态: deps.重置自动存档状态,
                创建开场基础状态: deps.创建开场基础状态,
                构建前端清空开场状态: deps.构建前端清空开场状态,
                应用开场基态: deps.应用开场基态,
                创建开场命令基态: deps.创建开场命令基态,
                执行开场剧情生成: generateOpeningStory,
                追加系统消息: deps.追加系统消息,
                替换流式草稿为失败提示: deps.替换流式草稿为失败提示
            }
        );
    };

    const handleReturnToHome = () => {
        deps.重置自动存档状态();
        deps.设置最近开局配置(null);
        deps.设置开局配置(undefined);
        deps.setView('home');
        return true;
    };

    const handleQuickRestart = async (mode: 快速重开模式 = 'all') => {
        if (deps.loading || !deps.最近开局配置) return;
        deps.清空重Roll快照();
        deps.重置自动存档状态();
        const worldConfig = deps.深拷贝(deps.最近开局配置.worldConfig);
        const charData = deps.深拷贝(deps.最近开局配置.charData);
        const openingConfig = deps.深拷贝(deps.最近开局配置.openingConfig);
        const openingStreaming = deps.最近开局配置.openingStreaming;
        const openingExtraPrompt = deps.最近开局配置.openingExtraPrompt || '';
        const currentApi = 获取主剧情接口配置(deps.apiConfig);
        if (!接口配置是否可用(currentApi)) {
            deps.追加系统消息('[快速重开失败] 请先在设置中填写 API 地址/API Key，并选择主剧情使用模型。');
            deps.setShowSettings(true);
            return;
        }
        const openingBase = deps.创建开场基础状态(charData, worldConfig);
        const clearedOpeningBase = deps.构建前端清空开场状态(openingBase);
        const clearedCommandBase = deps.创建开场命令基态();
        deps.设置开局配置(openingConfig ? deps.深拷贝(openingConfig) : undefined);
        deps.应用开场基态(clearedOpeningBase);
        if (deps.view !== 'game') {
            deps.setView('game');
        }

        if (mode === 'world_only') {
            await handleGenerateWorld(
                worldConfig,
                charData,
                openingConfig,
                'step',
                openingStreaming,
                openingExtraPrompt,
                { 清空前端变量: true }
            );
            return;
        }

        if (mode === 'opening_only') {
            deps.setLoading(true);
            try {
                await generateOpeningStory(
                    openingBase,
                    deps.prompts,
                    openingStreaming,
                    currentApi,
                    { 命令基态: clearedCommandBase, 开局额外要求: openingExtraPrompt, 开局配置: openingConfig }
                );
            } catch (error: any) {
                console.error('开局剧情重生成失败', error);
                const message = error?.message || '未知错误';
                deps.设置历史记录((prev: any) => ([
                    ...deps.替换流式草稿为失败提示(prev, message),
                    {
                        role: 'system',
                        content: `[开局剧情重生成失败] ${message}`,
                        timestamp: Date.now()
                    }
                ]));
            } finally {
                deps.setLoading(false);
            }
            return;
        }

        await handleGenerateWorld(
            worldConfig,
            charData,
            openingConfig,
            'all',
            openingStreaming,
            openingExtraPrompt,
            { 清空前端变量: true }
        );
    };

    return {
        handleStartNewGameWizard,
        generateOpeningStory,
        handleGenerateWorld,
        handleReturnToHome,
        handleQuickRestart
    };
};
