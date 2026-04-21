import * as textAIService from '../../services/ai/text';
import type { GameResponse, OpeningConfig, 聊天记录结构, 记忆系统结构, 角色数据结构, 剧情系统结构, 剧情规划结构, 女主剧情规划结构, 同人剧情规划结构, 同人女主剧情规划结构, 世界书结构, 内置提示词条目结构 } from '../../types';
import { 获取主剧情接口配置, 获取世界演变接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 规范化记忆配置, 规范化记忆系统, 构建即时记忆条目, 构建短期记忆条目, 写入四段记忆 } from './memoryUtils';
import { 提取剧情回忆标签 } from './memoryRecall';
import { 执行剧情回忆检索 } from './recallWorkflow';
import { 构建主剧情请求参数, type 主剧情系统上下文 } from './mainStoryRequest';
import { 环境时间转标准串 } from './timeUtils';
import { 构建COT伪装提示词 } from './promptRuntime';
import { 分析世界到期触发 } from './worldEvolutionUtils';
import { 按世界演变分流净化响应 } from './storyResponseGuards';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import type { 自动存档快照结构 } from './saveCoordinator';
import type { 世界演变触发参数, 世界演变执行结果 } from './worldEvolutionWorkflow';
import { 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';
import { 同步剧情小说分解时间校准 } from '../../services/novelDecompositionCalibration';

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

const 格式化命令展示路径 = (key: string): string => key.replace(/^gameState\./, '');

const 序列化命令文本 = (cmd: any): string => {
    const action = typeof cmd?.action === 'string' ? cmd.action : 'set';
    const key = 格式化命令展示路径(typeof cmd?.key === 'string' ? cmd.key : '');
    if (action === 'delete') return `${action} ${key}`;
    try {
        return `${action} ${key} = ${JSON.stringify(cmd?.value ?? null)}`;
    } catch {
        return `${action} ${key} = ${String(cmd?.value ?? null)}`;
    }
};

const 构建带索引命令文本 = (commands: any[], startIndex: number): string[] => (
    (Array.isArray(commands) ? commands : [])
        .map((cmd, index) => {
            const body = 序列化命令文本(cmd);
            return body.trim() ? `[#${startIndex + index}] ${body}` : '';
        })
        .filter(Boolean)
);

export type 发送选项 = {
    onRecallProgress?: (progress: 回忆检索进度) => void;
    onPolishProgress?: (progress: 正文润色进度) => void;
    onWorldEvolutionProgress?: (progress: 世界演变进度) => void;
    onPlanningProgress?: (progress: 规划分析进度) => void;
    onVariableGenerationProgress?: (progress: 变量生成进度) => void;
    onStageFailureDecision?: (params: 独立阶段失败决策参数) => Promise<独立阶段失败决策> | 独立阶段失败决策;
};

export type 发送结果 = {
    cancelled?: boolean;
    attachedRecallPreview?: string;
    preparedRecallTag?: string;
    needRecallConfirm?: boolean;
    recallFailed?: boolean;
    needRerollConfirm?: boolean;
    parseErrorMessage?: string;
    parseErrorDetail?: string;
    parseErrorRawText?: string;
    errorDetail?: string;
    errorTitle?: string;
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
        剧情: 剧情系统结构;
        剧情规划: 剧情规划结构;
        女主剧情规划?: 女主剧情规划结构;
        同人剧情规划?: 同人剧情规划结构;
        同人女主剧情规划?: 同人女主剧情规划结构;
        记忆系统: 记忆系统结构;
    };
    回档前持久态: {
        视觉设置: any;
        场景图片档案: any;
    };
    回档前历史: 聊天记录结构[];
};

type 主剧情发送当前状态 = {
    历史记录: 聊天记录结构[];
    记忆系统: 记忆系统结构;
    角色: 角色数据结构;
    环境: any;
    社交: any[];
    世界: any;
    战斗: any;
    玩家门派: any;
    任务列表: any[];
    约定列表: any[];
    剧情: 剧情系统结构;
    剧情规划: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
    开局配置?: OpeningConfig;
    loading: boolean;
    gameConfig: any;
    apiConfig: any;
    memoryConfig: any;
    visualConfig: any;
    sceneImageArchive: any;
    prompts: any[];
    内置提示词列表: 内置提示词条目结构[];
    世界书列表: 世界书结构[];
};

type 主剧情发送依赖 = {
    abortControllerRef: { current: AbortController | null };
    recallAbortControllerRef: { current: AbortController | null };
    setLoading: (value: boolean) => void;
    set后台队列处理中: (value: boolean) => void;
    setShowSettings: (value: boolean) => void;
    设置剧情: (value: 剧情系统结构) => void;
    设置历史记录: (value: 聊天记录结构[] | ((prev: 聊天记录结构[]) => 聊天记录结构[])) => void;
    应用并同步记忆系统: (memory: 记忆系统结构, options?: { 静默总结提示?: boolean }) => void;
    构建系统提示词: (promptPool: any[], memoryData: 记忆系统结构, socialData: any[], statePayload: any, options?: any) => 主剧情系统上下文 & {
        runtimePromptStates: Record<string, any>;
    };
    processResponseCommands: (
        response: GameResponse,
        baseState?: Partial<响应命令处理状态>,
        options?: { applyState?: boolean }
    ) => 响应命令处理状态;
    performAutoSave: (snapshot?: 自动存档快照结构) => Promise<void>;
    执行正文润色: (
        baseResponse: GameResponse,
        rawText: string,
        options?: { manual?: boolean; playerInput?: string }
    ) => Promise<{ response: GameResponse; applied: boolean; error?: string; rawText?: string }>;
    执行世界演变更新: (params?: 世界演变触发参数) => Promise<世界演变执行结果>;
    触发新增NPC自动生图: (npcs: any[]) => void;
    触发场景自动生图: (params: {
        response: GameResponse;
        bodyText?: string;
        env?: any;
        turnNumber?: number;
        playerInput?: string;
        source?: 'auto' | 'manual' | 'retry';
        autoApply?: boolean;
    }) => void;
    应用常驻壁纸为背景: () => Promise<void> | void;
    提取新增NPC列表: (beforeList: any[], afterList: any[]) => any[];
    推入重Roll快照: (snapshot: 回合快照结构) => void;
    弹出重Roll快照: () => 回合快照结构 | undefined;
    回档到快照: (snapshot: 回合快照结构, options?: { 保留图片状态?: boolean }) => void;
    深拷贝: <T>(value: T) => T;
    按回合窗口裁剪历史: (history: 聊天记录结构[], rounds: number) => 聊天记录结构[];
    规范化环境信息: (envLike?: any) => any;
    规范化剧情状态: (raw?: any, envLike?: any) => 剧情系统结构;
    规范化剧情规划状态: (raw?: any) => 剧情规划结构;
    规范化女主剧情规划状态: (raw?: any) => 女主剧情规划结构 | undefined;
    规范化同人剧情规划状态: (raw?: any) => 同人剧情规划结构 | undefined;
    规范化同人女主剧情规划状态: (raw?: any) => 同人女主剧情规划结构 | undefined;
    规范化世界状态: (raw?: any) => any;
    游戏设置启用自动重试: (config?: any) => boolean;
    执行带自动重试的生成请求: <T>(params: {
        enabled: boolean;
        action: () => Promise<T>;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
    }) => Promise<T>;
    更新流式草稿为自动重试提示: (history: 聊天记录结构[], attempt: number, maxAttempts: number, reason?: string) => 聊天记录结构[];
    提取解析失败原始信息: (error: any) => string;
    提取原始报错详情: (error: any) => string;
    格式化错误详情: (error: any) => string;
    获取原始AI消息: (rawText: string) => string;
    估算消息Token: (messages: Array<{ role?: string; content?: string; name?: string }>, model?: string) => number;
    估算AI输出Token: (text: string, model?: string) => number;
    计算回复耗时秒: (startedAt: number, finishedAt?: number) => number;
    文章优化功能已开启: () => boolean;
    后台执行统一规划分析: (params: {
        state: {
            环境: any;
            社交: any[];
            世界: any;
            剧情: 剧情系统结构;
            剧情规划: 剧情规划结构;
            女主剧情规划?: 女主剧情规划结构;
            同人剧情规划?: 同人剧情规划结构;
            同人女主剧情规划?: 同人女主剧情规划结构;
        };
        playerInput: string;
        gameTime: string;
        response: GameResponse;
    }) => Promise<{ updated: boolean; message: string; rawText?: string; commands: any[]; storyPlanCommands?: any[]; heroinePlanCommands?: any[] }>;
    后台执行变量生成: (params: {
        snapshot: 回合快照结构;
        parsedResponse: GameResponse;
        displayResponse?: GameResponse;
        rawText: string;
        playerInput: string;
        inputTokens?: number;
        responseDurationSec?: number;
        worldEvolutionUpdated?: boolean;
        extraPromptAppend?: string;
        onProgress?: (progress: 变量生成进度) => void;
    }) => Promise<void>;
    执行变量生成并合并响应: (params: {
        snapshot: 回合快照结构;
        parsedResponse: GameResponse;
        mergeTargetResponse?: GameResponse;
        displayResponse?: GameResponse;
        rawText: string;
        playerInput: string;
        inputTokens?: number;
        responseDurationSec?: number;
        worldEvolutionUpdated?: boolean;
        extraPromptAppend?: string;
        onProgress?: (progress: 变量生成进度) => void;
    }) => Promise<{
        mergedParsed: GameResponse;
        mergedDisplayResponse: GameResponse;
        variableCalibration: {
            commands: any[];
            reports: string[];
            rawText: string;
            model: string;
        } | null;
    } | null>;
};

export const 执行主剧情发送工作流 = async (
    content: string,
    isStreaming: boolean,
    currentState: 主剧情发送当前状态,
    deps: 主剧情发送依赖,
    options?: 发送选项
): Promise<发送结果> => {
    let historyBeforeSend = [...currentState.历史记录];
    const lastMessage = historyBeforeSend.length > 0 ? historyBeforeSend[historyBeforeSend.length - 1] : null;

    if (
        lastMessage
        && lastMessage.role === 'system'
        && typeof lastMessage.content === 'string'
        && lastMessage.content.startsWith('[系统错误]:')
        && historyBeforeSend.length >= 2
    ) {
        const userMessageCandidate = historyBeforeSend[historyBeforeSend.length - 2];
        if (userMessageCandidate.role === 'user') {
            historyBeforeSend = historyBeforeSend.slice(0, -2);
            deps.设置历史记录(historyBeforeSend);
        }
    }

    if (!content.trim() || currentState.loading) return {};

    const activeApi = 获取主剧情接口配置(currentState.apiConfig);
    if (!接口配置是否可用(activeApi)) {
        alert('请先在设置中填写 API 地址/API Key，并选择主剧情使用模型');
        deps.setShowSettings(true);
        return { cancelled: true };
    }

    const mainRequestStartedAt = Date.now();
    const controller = new AbortController();
    deps.abortControllerRef.current = controller;
    const recallConfig = currentState.apiConfig?.功能模型占位 || ({} as any);
    const recallFeatureEnabled = Boolean(recallConfig.剧情回忆独立模型开关);
    const recallMinRound = Math.max(1, Number(recallConfig.剧情回忆最早触发回合) || 10);
    const normalizedMemBeforeSend = 规范化记忆系统(currentState.记忆系统);
    const nextRound = (Array.isArray(normalizedMemBeforeSend.回忆档案) ? normalizedMemBeforeSend.回忆档案.length : 0) + 1;
    const recallRoundReady = nextRound >= recallMinRound;
    const extracted = 提取剧情回忆标签(content);
    let sendInput = extracted.cleanInput || content.trim();
    let recallTag = extracted.recallTag;
    let attachedRecallPreview = '';
    const recallTimeoutMs = 25000;
    const recallMaxAttempts = 2;

    const createRecallTimeoutError = () => {
        const error = new Error(`剧情回忆检索超时（${Math.max(1, Math.ceil(recallTimeoutMs / 1000))} 秒）`);
        error.name = 'TimeoutError';
        return error;
    };

    const runRecallAttempt = async () => {
        const recallController = new AbortController();
        deps.recallAbortControllerRef.current = recallController;
        const abortRecall = () => recallController.abort();
        controller.signal.addEventListener('abort', abortRecall, { once: true });

        try {
            return await new Promise<Awaited<ReturnType<typeof 执行剧情回忆检索>>>((resolve, reject) => {
                const timeoutId = window.setTimeout(() => {
                    recallController.abort();
                    reject(createRecallTimeoutError());
                }, recallTimeoutMs);

                执行剧情回忆检索(
                    sendInput,
                    normalizedMemBeforeSend,
                    currentState.apiConfig,
                    {
                        signal: recallController.signal,
                        onDelta: (_delta, accumulated) => {
                            options?.onRecallProgress?.({ phase: 'stream', text: accumulated });
                        }
                    }
                ).then(resolve).catch(reject).finally(() => {
                    window.clearTimeout(timeoutId);
                });
            });
        } finally {
            controller.signal.removeEventListener('abort', abortRecall);
            if (deps.recallAbortControllerRef.current === recallController) {
                deps.recallAbortControllerRef.current = null;
            }
        }
    };

    if (recallFeatureEnabled && recallRoundReady && !recallTag) {
        try {
            options?.onRecallProgress?.({ phase: 'start', text: '正在检索剧情回忆...' });
            let recalled = null;
            for (let attempt = 1; attempt <= recallMaxAttempts; attempt += 1) {
                options?.onRecallProgress?.({
                    phase: 'start',
                    text: attempt > 1
                        ? `正在重试剧情回忆检索（${attempt}/${recallMaxAttempts}）...`
                        : '正在检索剧情回忆...'
                });
                try {
                    recalled = await runRecallAttempt();
                    break;
                } catch (error: any) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }
                    if (attempt >= recallMaxAttempts) {
                        throw error;
                    }
                    options?.onRecallProgress?.({
                        phase: 'error',
                        text: `${error?.message || '剧情回忆检索失败'}\n正在自动重试...`
                    });
                }
            }
            if (!recalled) {
                deps.abortControllerRef.current = null;
                deps.recallAbortControllerRef.current = null;
                options?.onRecallProgress?.({ phase: 'error', text: '已开启剧情回忆模型，但未配置可用接口。' });
                deps.setShowSettings(true);
                return {
                    cancelled: true,
                    recallFailed: true,
                    errorTitle: '剧情回忆未配置',
                    errorDetail: '已开启剧情回忆模型，但未配置可用接口。'
                };
            }
            attachedRecallPreview = recalled.previewText;
            options?.onRecallProgress?.({ phase: 'done', text: recalled.previewText });
            const silentConfirm = Boolean(currentState.apiConfig?.功能模型占位?.剧情回忆静默确认);
            if (!silentConfirm) {
                deps.abortControllerRef.current = null;
                deps.recallAbortControllerRef.current = null;
                return {
                    cancelled: true,
                    attachedRecallPreview: recalled.previewText,
                    preparedRecallTag: recalled.tagContent,
                    needRecallConfirm: true
                };
            }
            recallTag = recalled.tagContent;
        } catch (error: any) {
            console.error('剧情回忆检索失败', error);
            options?.onRecallProgress?.({ phase: 'error', text: error?.message || '剧情回忆检索失败' });
            deps.abortControllerRef.current = null;
            deps.recallAbortControllerRef.current = null;
            return {
                cancelled: true,
                recallFailed: true,
                errorTitle: '剧情回忆检索失败',
                errorDetail: error?.message || '未知错误'
            };
        }
    }

    if (!sendInput.trim()) {
        deps.abortControllerRef.current = null;
        deps.recallAbortControllerRef.current = null;
        return { cancelled: true };
    }

    const canonicalTime = 环境时间转标准串(currentState.环境);
    const currentGameTime = canonicalTime || '未知时间';
    const memBeforeSend = normalizedMemBeforeSend;
    deps.推入重Roll快照({
        玩家输入: sendInput,
        游戏时间: currentGameTime,
        回档前状态: {
            角色: deps.深拷贝(currentState.角色),
            环境: deps.规范化环境信息(deps.深拷贝(currentState.环境)),
            社交: deps.深拷贝(currentState.社交),
            世界: deps.深拷贝(currentState.世界),
            战斗: deps.深拷贝(currentState.战斗),
            玩家门派: deps.深拷贝(currentState.玩家门派),
            任务列表: deps.深拷贝(currentState.任务列表),
            约定列表: deps.深拷贝(currentState.约定列表),
            剧情: deps.深拷贝(currentState.剧情),
            剧情规划: deps.深拷贝(currentState.剧情规划),
            女主剧情规划: deps.深拷贝(currentState.女主剧情规划),
            同人剧情规划: deps.深拷贝(currentState.同人剧情规划),
            同人女主剧情规划: deps.深拷贝(currentState.同人女主剧情规划),
            记忆系统: deps.深拷贝(memBeforeSend)
        },
        回档前持久态: {
            视觉设置: deps.深拷贝(currentState.visualConfig),
            场景图片档案: deps.深拷贝(currentState.sceneImageArchive)
        },
        回档前历史: deps.深拷贝(historyBeforeSend)
    });

    const normalizedMemoryConfig = 规范化记忆配置(currentState.memoryConfig);
    const immediateUploadLimit = Math.max(1, Number(normalizedMemoryConfig.即时消息上传条数N) || 10);
    const roundsBeforeCurrentInput = Math.max(0, immediateUploadLimit - 1);
    const contextHistory = deps.按回合窗口裁剪历史(historyBeforeSend, roundsBeforeCurrentInput);
    const updatedMemSys = 规范化记忆系统(memBeforeSend);

    const newUserMsg: 聊天记录结构 = {
        role: 'user',
        content: sendInput,
        timestamp: Date.now(),
        gameTime: currentGameTime
    };
    const updatedContextHistory = [...contextHistory, newUserMsg];
    const updatedDisplayHistory = [...historyBeforeSend, newUserMsg];
    deps.设置历史记录(updatedDisplayHistory);
    deps.setLoading(true);

    const 独立阶段自动重试已启用 = deps.游戏设置启用自动重试(规范化游戏设置(currentState.gameConfig));
    const 请求独立阶段失败决策 = async (params: 独立阶段失败决策参数): Promise<独立阶段失败决策> => {
        const message = [
            `${params.stageLabel}请求失败：`,
            params.errorText || '未知错误',
            '',
            '选择“重试”会重新执行当前阶段；选择“跳过”会保留当前结果并继续后续阶段。'
        ].join('\n');
        if (options?.onStageFailureDecision) {
            const result = await Promise.resolve(options.onStageFailureDecision(params));
            return result === 'retry' ? 'retry' : 'skip';
        }
        if (typeof window !== 'undefined') {
            return window.confirm(`${message}\n\n确定要重试当前阶段吗？`) ? 'retry' : 'skip';
        }
        return 'skip';
    };
    const 执行可重试独立阶段 = async <T,>(params: {
        stageId: 独立阶段标识;
        stageLabel: string;
        run: () => Promise<T>;
        beforeAttempt?: (attempt: number) => void;
        onAutoRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
        onError?: (errorText: string) => void;
        onSkip?: (errorText: string) => void;
        getErrorText?: (error: any) => string;
    }): Promise<{ completed: boolean; result?: T }> => {
        let manualAttempt = 0;
        while (true) {
            manualAttempt += 1;
            params.beforeAttempt?.(manualAttempt);
            try {
                const result = await deps.执行带自动重试的生成请求<T>({
                    enabled: 独立阶段自动重试已启用,
                    action: params.run,
                    onRetry: params.onAutoRetry
                });
                return { completed: true, result };
            } catch (error: any) {
                if (error?.name === 'AbortError') {
                    throw error;
                }
                const errorText = params.getErrorText
                    ? params.getErrorText(error)
                    : (
                        deps.提取原始报错详情(error)
                        || deps.格式化错误详情(error)
                        || error?.message
                        || '未知错误'
                    );
                params.onError?.(errorText);
                const decision = await 请求独立阶段失败决策({
                    stageId: params.stageId,
                    stageLabel: params.stageLabel,
                    errorText
                });
                if (decision === 'retry') {
                    continue;
                }
                params.onSkip?.(errorText);
                return { completed: false };
            }
        }
    };

    try {
        const recallContextActiveForMain = recallFeatureEnabled && Boolean(recallTag);
        const builtContext = deps.构建系统提示词(
            currentState.prompts,
            updatedMemSys,
            currentState.社交,
            {
                角色: currentState.角色,
                环境: deps.规范化环境信息(currentState.环境),
                世界: currentState.世界,
                战斗: currentState.战斗,
                玩家门派: currentState.玩家门派,
                任务列表: currentState.任务列表,
                约定列表: currentState.约定列表,
                剧情: deps.规范化剧情状态(currentState.剧情, currentState.环境),
                女主剧情规划: deps.规范化女主剧情规划状态(currentState.女主剧情规划),
                开局配置: currentState.开局配置
            },
            {
                ...(recallContextActiveForMain
                    ? { 禁用中期长期记忆: true, 禁用短期记忆: true }
                    : {}),
                世界书作用域: 规范化游戏设置(currentState.gameConfig).启用酒馆预设模式 === true ? ['main', 'tavern'] : ['main'],
                世界书附加文本: [sendInput, recallTag || '']
            }
        );

        let streamMarker = 0;
        if (isStreaming) {
            streamMarker = Date.now();
            deps.设置历史记录([
                ...updatedDisplayHistory,
                {
                    role: 'assistant',
                    content: '',
                    timestamp: streamMarker,
                    gameTime: currentGameTime
                }
            ]);
        }

        const {
            runtimeGameConfig,
            runtimeCotPseudoEnabled,
            lengthRequirementPrompt,
            disclaimerRequirementPrompt,
            outputProtocolPrompt,
            styleAssistantPrompt,
            realWorldModePrompt,
            cotPseudoPrompt,
            orderedMessages,
            extraPromptForService
        } = 构建主剧情请求参数({
            gameConfig: currentState.gameConfig,
            apiConfig: currentState.apiConfig,
            builtContext,
            updatedContextHistory,
            updatedMemSys,
            sendInput,
            recallTag,
            novelDecompositionPrompt: await 获取激活小说拆分注入文本(
                currentState.apiConfig,
                'main_story',
                currentState.开局配置,
                deps.规范化剧情状态(currentState.剧情, currentState.环境),
                currentState.角色?.姓名 || ''
            ),
            playerRole: currentState.角色,
            builtinPromptEntries: currentState.内置提示词列表,
            worldbooks: currentState.世界书列表
        });
        const inputTokens = deps.估算消息Token(orderedMessages, activeApi?.model);

        const aiResult = await deps.执行带自动重试的生成请求({
            enabled: deps.游戏设置启用自动重试(runtimeGameConfig),
            onRetry: (attempt, maxAttempts, reason) => {
                if (isStreaming) {
                    deps.设置历史记录(prev => deps.更新流式草稿为自动重试提示(prev, attempt, maxAttempts, reason));
                }
            },
            action: async () => {
                return textAIService.generateStoryResponse(
                    '',
                    '',
                    '',
                    activeApi,
                    controller.signal,
                    isStreaming
                        ? {
                            stream: true,
                            onDelta: (_delta, accumulated) => {
                                deps.设置历史记录(prev => prev.map(item => {
                                    if (
                                        item.timestamp === streamMarker
                                        && item.role === 'assistant'
                                        && !item.structuredResponse
                                    ) {
                                        return { ...item, content: accumulated };
                                    }
                                    return item;
                                }));
                            }
                        }
                        : undefined,
                    extraPromptForService,
                    {
                        orderedMessages,
                        enableCotInjection: runtimeCotPseudoEnabled,
                        leadingSystemPrompt: builtContext.contextPieces.AI角色声明,
                        styleAssistantPrompt: [styleAssistantPrompt, realWorldModePrompt].filter(Boolean).join('\n\n'),
                        outputProtocolPrompt,
                        cotPseudoHistoryPrompt: cotPseudoPrompt,
                        lengthRequirementPrompt,
                        disclaimerRequirementPrompt,
                        validateTagCompleteness: runtimeGameConfig.启用标签检测完整性 === true,
                        enableTagRepair: runtimeGameConfig.启用标签修复 !== false,
                        requireActionOptionsTag: runtimeGameConfig.启用行动选项 !== false,
                        errorDetailLimit: Number.POSITIVE_INFINITY
                    }
                );
            }
        });

        const worldEvolutionSplitEnabled = 接口配置是否可用(获取世界演变接口配置(currentState.apiConfig));
        const mainCommandBaseState = {
            角色: deps.深拷贝(currentState.角色),
            环境: deps.深拷贝(currentState.环境),
            社交: deps.深拷贝(currentState.社交),
            世界: deps.深拷贝(currentState.世界),
            战斗: deps.深拷贝(currentState.战斗),
            玩家门派: deps.深拷贝(currentState.玩家门派),
            任务列表: deps.深拷贝(currentState.任务列表),
            约定列表: deps.深拷贝(currentState.约定列表),
            剧情: deps.深拷贝(currentState.剧情),
            女主剧情规划: deps.深拷贝(currentState.女主剧情规划)
        };
        let aiData = 按世界演变分流净化响应(aiResult.response, worldEvolutionSplitEnabled).response;
        let displayAiData = aiData;

        const socialBeforeMainCommands = deps.深拷贝(currentState.社交);
        const rawAiText = deps.获取原始AI消息(aiResult.rawText);

        if (deps.文章优化功能已开启()) {
            const polishStage = await 执行可重试独立阶段({
                stageId: 'polish',
                stageLabel: '文章优化',
                beforeAttempt: (attempt) => {
                    options?.onPolishProgress?.({
                        phase: 'start',
                        text: attempt > 1
                            ? `正在重新提取并润色<正文>内容...（第 ${attempt} 次手动重试）`
                            : '正在提取并润色<正文>内容...'
                    });
                },
                onAutoRetry: (attempt, maxAttempts, reason) => {
                    options?.onPolishProgress?.({
                        phase: 'start',
                        text: `正文优化请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                    });
                },
                run: () => deps.执行正文润色(
                    aiData,
                    rawAiText,
                    { playerInput: sendInput }
                ),
                onError: (errorText) => {
                    options?.onPolishProgress?.({
                        phase: 'error',
                        text: `${errorText || '正文优化失败，已保留原文。'}\n等待选择：重试当前阶段，或跳过继续。`
                    });
                },
                onSkip: (errorText) => {
                    options?.onPolishProgress?.({
                        phase: 'skipped',
                        text: `正文优化失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ''}`
                    });
                }
            });
            const polished = polishStage.result;
            if (polishStage.completed && polished) {
                if (polished.applied) {
                    displayAiData = polished.response;
                    options?.onPolishProgress?.({
                        phase: 'done',
                        text: `已应用优化结果（模型：${polished.response.body_optimized_model || '未知'}）`,
                        rawText: polished.rawText
                    });
                } else {
                    options?.onPolishProgress?.({
                        phase: 'done',
                        text: polished.error || '优化未生效，已保留原文。',
                        rawText: polished.rawText
                    });
                }
            }
        } else {
            options?.onPolishProgress?.({
                phase: 'skipped',
                text: '正文优化功能未开启，已跳过。'
            });
        }

        let responseForExecution: GameResponse = {
            ...aiData,
            tavern_commands: Array.isArray(aiData.tavern_commands) ? [...aiData.tavern_commands] : []
        };
        let simulatedState = deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false });
        const turnSnapshot: 回合快照结构 = {
            玩家输入: sendInput,
            游戏时间: currentGameTime,
            回档前状态: {
                角色: deps.深拷贝(currentState.角色),
                环境: deps.规范化环境信息(deps.深拷贝(currentState.环境)),
                社交: deps.深拷贝(currentState.社交),
                世界: deps.深拷贝(currentState.世界),
                战斗: deps.深拷贝(currentState.战斗),
                玩家门派: deps.深拷贝(currentState.玩家门派),
                任务列表: deps.深拷贝(currentState.任务列表),
                约定列表: deps.深拷贝(currentState.约定列表),
                剧情: deps.深拷贝(currentState.剧情),
                剧情规划: deps.深拷贝(currentState.剧情规划),
                女主剧情规划: deps.深拷贝(currentState.女主剧情规划),
                同人剧情规划: deps.深拷贝(currentState.同人剧情规划),
                同人女主剧情规划: deps.深拷贝(currentState.同人女主剧情规划),
                记忆系统: deps.深拷贝(memBeforeSend)
            },
            回档前持久态: {
                视觉设置: deps.深拷贝(currentState.visualConfig),
                场景图片档案: deps.深拷贝(currentState.sceneImageArchive)
            },
            回档前历史: deps.深拷贝(historyBeforeSend)
        };

        let finalParsedResponse: GameResponse = responseForExecution;
        let finalDisplayResponse: GameResponse = {
            ...displayAiData,
            tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
        };
        const mainStoryVariableResponse: GameResponse = {
            ...displayAiData,
            tavern_commands: Array.isArray(aiData?.tavern_commands) ? [...aiData.tavern_commands] : []
        };
        const 立即并入变量生成状态 = (nextResponse: GameResponse) => {
            simulatedState = deps.processResponseCommands(nextResponse, mainCommandBaseState);
            return simulatedState;
        };
        const immediateState = deps.processResponseCommands(finalParsedResponse, mainCommandBaseState);
        let finalState = immediateState;
        const nextGameTime = 环境时间转标准串(immediateState.环境) || "未知时间";
        const immediateEntry = 构建即时记忆条目(nextGameTime, sendInput, finalDisplayResponse);
        const shortEntry = 构建短期记忆条目(nextGameTime, finalDisplayResponse);
        const aiTurnTimestamp = Date.now();
        const responseDurationSec = deps.计算回复耗时秒(mainRequestStartedAt, aiTurnTimestamp);
        const nextMemory = 写入四段记忆(
            规范化记忆系统(memBeforeSend),
            immediateEntry,
            shortEntry,
            {
                immediateLimit: normalizedMemoryConfig.即时消息上传条数N,
                shortLimit: normalizedMemoryConfig.短期记忆阈值,
                midLimit: normalizedMemoryConfig.中期记忆阈值,
                recordTime: nextGameTime,
                timestamp: nextGameTime
            }
        );
        deps.应用并同步记忆系统(nextMemory);

        const newAiMsg: 聊天记录结构 = {
            role: "assistant",
            content: "Structured Response",
            structuredResponse: finalDisplayResponse,
            rawJson: rawAiText,
            timestamp: aiTurnTimestamp,
            gameTime: nextGameTime,
            inputTokens,
            responseDurationSec,
            outputTokens: deps.估算AI输出Token(rawAiText, activeApi?.model)
        };
        if (isStreaming) {
            deps.设置历史记录(prev => prev.map(item => {
                if (
                    item.timestamp === streamMarker
                    && item.role === "assistant"
                    && !item.structuredResponse
                ) {
                    return { ...newAiMsg };
                }
                return item;
            }));
        } else {
            deps.设置历史记录([...updatedDisplayHistory, newAiMsg]);
        }

        const pushedNpcList = deps.提取新增NPC列表(socialBeforeMainCommands, finalState.社交);
        if (pushedNpcList.length > 0) {
            deps.触发新增NPC自动生图(pushedNpcList);
        }

        const latestBodyText = (Array.isArray(finalDisplayResponse.logs) ? finalDisplayResponse.logs : [])
            .map((log) => `${log?.sender || "旁白"}：${log?.text || ""}`)
            .filter((line) => line.trim().length > 0)
            .join("\n");
        if (latestBodyText.trim()) {
            await deps.应用常驻壁纸为背景();
            deps.触发场景自动生图({
                response: finalDisplayResponse,
                bodyText: latestBodyText,
                env: finalState.环境,
                turnNumber: nextRound,
                playerInput: sendInput,
                source: "auto",
                autoApply: true
            });
        }

        void deps.performAutoSave({
            history: [...updatedDisplayHistory, newAiMsg],
            role: immediateState.角色,
            env: immediateState.环境,
            social: immediateState.社交,
            world: immediateState.世界,
            battle: immediateState.战斗,
            sect: immediateState.玩家门派,
            tasks: immediateState.任务列表,
            agreements: immediateState.约定列表,
            story: immediateState.剧情,
            storyPlan: immediateState.剧情规划,
            heroinePlan: immediateState.女主剧情规划,
            fandomStoryPlan: immediateState.同人剧情规划,
            fandomHeroinePlan: immediateState.同人女主剧情规划,
            memory: nextMemory,
            force: true
        });

        deps.set后台队列处理中(true);
        void (async () => {
            try {
                let variableGenerationResult: Awaited<ReturnType<typeof deps.执行变量生成并合并响应>> = null;
                const 变量生成前命令数 = Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands.length : 0;
                const variableStage = await 执行可重试独立阶段({
                    stageId: "variable",
                    stageLabel: "变量生成",
                    beforeAttempt: (attempt) => {
                        if (attempt <= 1) return;
                        options?.onVariableGenerationProgress?.({
                            phase: "start",
                            text: `正在重新执行变量生成...（第 ${attempt} 次手动重试）`
                        });
                    },
                    onAutoRetry: (attempt, maxAttempts, reason) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "start",
                            text: `变量生成请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                        });
                    },
                    run: () => deps.执行变量生成并合并响应({
                        snapshot: turnSnapshot,
                        parsedResponse: mainStoryVariableResponse,
                        mergeTargetResponse: responseForExecution,
                        displayResponse: finalDisplayResponse,
                        rawText: rawAiText,
                        playerInput: sendInput,
                        inputTokens,
                        responseDurationSec: deps.计算回复耗时秒(mainRequestStartedAt),
                        worldEvolutionUpdated: false,
                        onProgress: options?.onVariableGenerationProgress
                    }),
                    onError: (errorText) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "error",
                            text: `${errorText || "变量生成失败"}\n等待选择：重试当前阶段，或跳过继续。`
                        });
                    },
                    onSkip: (errorText) => {
                        options?.onVariableGenerationProgress?.({
                            phase: "skipped",
                            text: `变量生成失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                        });
                    },
                    getErrorText: (error: any) => (
                        deps.提取原始报错详情(error)
                        || error?.message
                        || "变量生成失败"
                    )
                });
                variableGenerationResult = variableStage.result ?? null;
                if (variableStage.completed && variableGenerationResult?.mergedParsed) {
                    responseForExecution = variableGenerationResult.mergedParsed;
                    finalParsedResponse = variableGenerationResult.mergedParsed;
                    finalDisplayResponse = variableGenerationResult.mergedDisplayResponse;
                    displayAiData = variableGenerationResult.mergedDisplayResponse;
                    simulatedState = deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false });
                    if (Array.isArray(responseForExecution.tavern_commands) && responseForExecution.tavern_commands.length > 0) {
                        立即并入变量生成状态(responseForExecution);
                    }
                    if (variableGenerationResult.variableCalibration) {
                        options?.onVariableGenerationProgress?.({
                            phase: "done",
                            text: `变量生成完成，新增 ${variableGenerationResult.variableCalibration.commands.length} 条变量命令${variableGenerationResult.variableCalibration.model ? `（${variableGenerationResult.variableCalibration.model}）` : ""}，并已立即并入当前前台状态。`,
                            rawText: variableGenerationResult.variableCalibration.rawText,
                            commandTexts: 构建带索引命令文本(
                                variableGenerationResult.variableCalibration.commands,
                                变量生成前命令数 + 1
                            )
                        });
                    }
                }

                let worldEvolutionResult: 世界演变执行结果 | null = null;
                const 变量生成后命令数 = Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands.length : 0;
                if (worldEvolutionSplitEnabled) {
                    const worldStage = await 执行可重试独立阶段({
                        stageId: "world",
                        stageLabel: "动态世界",
                        beforeAttempt: (attempt) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "start",
                                text: attempt > 1
                                    ? `正在重新执行动态世界更新...（第 ${attempt} 次手动重试）`
                                    : "正在执行动态世界更新..."
                            });
                        },
                        onAutoRetry: (attempt, maxAttempts, reason) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "start",
                                text: `动态世界请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                            });
                        },
                        run: async () => {
                            const worldContextResponse: GameResponse = {
                                ...displayAiData,
                                tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
                            };
                            const result = await deps.执行世界演变更新({
                                来源: "story_dynamic",
                                动态世界线索: [],
                                applyCommands: false,
                                currentResponse: worldContextResponse,
                                stateBase: simulatedState
                            });
                            if (result.phase === "error") {
                                const wrappedError = new Error(result.statusText || "动态世界更新失败");
                                (wrappedError as Error & { stageResult?: 世界演变执行结果 }).stageResult = result;
                                throw wrappedError;
                            }
                            return result;
                        },
                        getErrorText: (error: any) => (
                            error?.stageResult?.statusText
                            || deps.提取原始报错详情(error)
                            || error?.message
                            || "动态世界更新失败"
                        ),
                        onError: (errorText) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "error",
                                text: `${errorText || "动态世界更新失败"}\n等待选择：重试当前阶段，或跳过继续。`
                            });
                        },
                        onSkip: (errorText) => {
                            options?.onWorldEvolutionProgress?.({
                                phase: "skipped",
                                text: `动态世界更新失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                            });
                        }
                    });
                    worldEvolutionResult = worldStage.result || null;
                    if (worldStage.completed && worldEvolutionResult) {
                        options?.onWorldEvolutionProgress?.({
                            phase: worldEvolutionResult.phase,
                            text: worldEvolutionResult.statusText || (worldEvolutionResult.ok ? "动态世界更新完成。" : "动态世界未产生更新。"),
                            rawText: worldEvolutionResult.rawText,
                            commandTexts: 构建带索引命令文本(worldEvolutionResult.commands, 变量生成后命令数 + 1)
                        });
                    }
                } else {
                    options?.onWorldEvolutionProgress?.({
                        phase: "skipped",
                        text: "世界演变独立链路未启用，已跳过。"
                    });
                }
                if (worldEvolutionResult && worldEvolutionResult.commands.length > 0) {
                    responseForExecution = {
                        ...responseForExecution,
                        tavern_commands: [
                            ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                            ...worldEvolutionResult.commands
                        ]
                    };
                    simulatedState = deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false });
                }
                let 当前命令偏移 = 变量生成后命令数 + (worldEvolutionResult ? worldEvolutionResult.commands.length : 0);
                const planningStage = await 执行可重试独立阶段({
                    stageId: "planning",
                    stageLabel: "规划分析",
                    beforeAttempt: (attempt) => {
                        options?.onPlanningProgress?.({
                            phase: "start",
                            text: attempt > 1
                                ? `正在重新分析并修订剧情规划...（第 ${attempt} 次手动重试）`
                                : "正在分析并修订剧情规划..."
                        });
                    },
                    onAutoRetry: (attempt, maxAttempts, reason) => {
                        options?.onPlanningProgress?.({
                            phase: "start",
                            text: `规划分析请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ""}`
                        });
                    },
                    run: () => deps.后台执行统一规划分析({
                        state: {
                            环境: simulatedState.环境,
                            社交: simulatedState.社交,
                            世界: simulatedState.世界,
                            剧情: simulatedState.剧情,
                            剧情规划: simulatedState.剧情规划,
                            女主剧情规划: simulatedState.女主剧情规划,
                            同人剧情规划: simulatedState.同人剧情规划,
                            同人女主剧情规划: simulatedState.同人女主剧情规划
                        },
                        playerInput: sendInput,
                        gameTime: 环境时间转标准串(simulatedState.环境) || "未知时间",
                        response: responseForExecution
                    }),
                    onError: (errorText) => {
                        options?.onPlanningProgress?.({
                            phase: "error",
                            text: `${errorText || "规划分析失败"}\n等待选择：重试当前阶段，或跳过继续。`
                        });
                    },
                    onSkip: (errorText) => {
                        options?.onPlanningProgress?.({
                            phase: "skipped",
                            text: `规划分析失败，已按用户选择跳过。${errorText ? `\n${errorText}` : ""}`
                        });
                    },
                    getErrorText: (error: any) => (
                        deps.提取原始报错详情(error)
                        || error?.message
                        || "规划分析失败"
                    )
                });
                const planningResult = planningStage.result;
                if (planningStage.completed && planningResult) {
                    options?.onPlanningProgress?.({
                        phase: planningResult.updated ? "done" : "skipped",
                        text: planningResult.message,
                        rawText: planningResult.rawText,
                        commandTexts: 构建带索引命令文本(planningResult.commands, 当前命令偏移 + 1)
                    });
                    if (planningResult.commands.length > 0) {
                        responseForExecution = {
                            ...responseForExecution,
                            tavern_commands: [
                                ...(Array.isArray(responseForExecution.tavern_commands) ? responseForExecution.tavern_commands : []),
                                ...planningResult.commands
                            ]
                        };
                        simulatedState = deps.processResponseCommands(responseForExecution, mainCommandBaseState, { applyState: false });
                    }
                }
                finalParsedResponse = responseForExecution;
                finalDisplayResponse = {
                    ...displayAiData,
                    tavern_commands: Array.isArray(responseForExecution.tavern_commands) ? [...responseForExecution.tavern_commands] : []
                };

                finalState = deps.processResponseCommands(finalParsedResponse, mainCommandBaseState);
                const calibratedFinalStory = await 同步剧情小说分解时间校准({
                    previousStory: currentState.剧情,
                    nextStory: finalState.剧情,
                    currentGameTime: 环境时间转标准串(finalState.环境) || currentGameTime,
                    openingConfig: currentState.开局配置
                });
                if (JSON.stringify(calibratedFinalStory) !== JSON.stringify(finalState.剧情 || {})) {
                    finalState = {
                        ...finalState,
                        剧情: deps.规范化剧情状态(calibratedFinalStory, finalState.环境)
                    };
                    deps.设置剧情(finalState.剧情);
                }

                const queuedAiMsg: 聊天记录结构 = {
                    ...newAiMsg,
                    structuredResponse: finalDisplayResponse
                };
                deps.设置历史记录(prev => prev.map(item => {
                    if (item.timestamp !== aiTurnTimestamp || item.role !== "assistant") {
                        return item;
                    }

                    const prevStructured = item.structuredResponse ?? null;
                    const nextStructured = queuedAiMsg.structuredResponse ?? null;
                    const structuredChanged = JSON.stringify(prevStructured) !== JSON.stringify(nextStructured);

                    if (!structuredChanged) {
                        return item;
                    }

                    return {
                        ...item,
                        ...queuedAiMsg,
                        autoScrollToTurnIcon: false
                    };
                }));

                const queuedNpcList = deps.提取新增NPC列表(socialBeforeMainCommands, finalState.社交);
                if (queuedNpcList.length > 0) {
                    deps.触发新增NPC自动生图(queuedNpcList);
                }

                void deps.performAutoSave({
                    history: [...updatedDisplayHistory, queuedAiMsg],
                    role: finalState.角色,
                    env: finalState.环境,
                    social: finalState.社交,
                    world: finalState.世界,
                    battle: finalState.战斗,
                    sect: finalState.玩家门派,
                    tasks: finalState.任务列表,
                    agreements: finalState.约定列表,
                    story: finalState.剧情,
                    storyPlan: finalState.剧情规划,
                    heroinePlan: finalState.女主剧情规划,
                    fandomStoryPlan: finalState.同人剧情规划,
                    fandomHeroinePlan: finalState.同人女主剧情规划,
                    memory: nextMemory,
                    force: true
                });
            } catch (backgroundError: any) {
                if (backgroundError?.name === "AbortError") {
                    options?.onVariableGenerationProgress?.({
                        phase: "cancelled",
                        text: "后台队列已取消，当前正文保留。"
                    });
                    return;
                }
                console.error("后台队列执行失败", backgroundError);
                options?.onPlanningProgress?.({
                    phase: "error",
                    text: backgroundError?.message || "后台队列执行失败"
                });
            } finally {
                deps.set后台队列处理中(false);
            }
        })();
        return { attachedRecallPreview };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            const snapshot = deps.弹出重Roll快照();
            if (snapshot) {
                deps.回档到快照(snapshot);
            } else {
                deps.设置历史记录(historyBeforeSend);
                deps.应用并同步记忆系统(memBeforeSend);
            }
            console.log('Request aborted by user');
            return { cancelled: true };
        }

        if (error instanceof textAIService.StoryResponseParseError || error?.name === 'StoryResponseParseError') {
            deps.设置历史记录(historyBeforeSend);
            deps.应用并同步记忆系统(memBeforeSend);
            const parseErrorRaw = deps.提取解析失败原始信息(error);
            const parseErrorRawText = typeof error?.rawText === 'string' ? error.rawText : '';
            if (deps.游戏设置启用自动重试(规范化游戏设置(currentState.gameConfig))) {
                deps.设置历史记录([...updatedDisplayHistory, {
                    role: 'system',
                    content: `[系统错误]: ${parseErrorRaw}`,
                    timestamp: Date.now()
                }]);
                return {
                    cancelled: true,
                    parseErrorMessage: parseErrorRaw,
                    parseErrorDetail: parseErrorRaw,
                    parseErrorRawText
                };
            }
            return {
                cancelled: true,
                needRerollConfirm: true,
                parseErrorMessage: parseErrorRaw,
                parseErrorDetail: parseErrorRaw,
                parseErrorRawText
            };
        }

        deps.弹出重Roll快照();
        const detail = deps.格式化错误详情(error);
        const summary = typeof error?.message === 'string' && error.message.trim().length > 0
            ? error.message
            : (typeof error === 'string' ? error : '未知错误');
        const errorMsg: 聊天记录结构 = {
            role: 'system',
            content: `[系统错误]: ${summary}`,
            timestamp: Date.now()
        };
        deps.设置历史记录([...updatedDisplayHistory, errorMsg]);
        return {
            cancelled: true,
            errorDetail: detail,
            errorTitle: '请求失败'
        };
    } finally {
        deps.setLoading(false);
        deps.abortControllerRef.current = null;
        deps.recallAbortControllerRef.current = null;
    }
};

