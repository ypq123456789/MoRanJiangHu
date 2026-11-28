import type {
    GameResponse,
    女主剧情规划结构,
    详细门派结构,
    世界数据结构,
    剧情系统结构,
    战斗状态结构,
    环境信息结构,
    聊天记录结构,
    角色数据结构,
    记忆系统结构,
    叙事状态结构
} from '../../types';
import { 同步剧情小说分解时间校准 } from '../../services/novelDecompositionCalibration';
import type { 回合快照结构 } from './turnSnapshot';

type 历史回合工作流依赖 = {
    历史记录: 聊天记录结构[];
    记忆系统: 记忆系统结构;
    memoryConfig: any;
    gameConfig: any;
    prompts: any[];
    内置提示词列表: any[];
    世界书列表: any[];
    loading: boolean;
    变量生成中: boolean;
    记忆总结阶段: 'idle' | 'remind' | 'processing' | 'review';
    社交: any[];
    visualConfig: any;
    visualConfigRef: { current: any };
    场景图片档案Ref: { current: any };
    scrollRef: { current: any };
    获取最新快照: () => 回合快照结构 | null;
    回档到快照: (snapshot: 回合快照结构, options?: { 保留图片状态?: boolean }) => void;
    弹出重Roll快照: () => 回合快照结构 | null;
    清理回合自动存档并重置状态: (snapshot: 回合快照结构) => Promise<void>;
    深拷贝: <T>(value: T) => T;
    环境时间转标准串: (env: 环境信息结构) => string;
    获取开局配置: () => any;
    规范化记忆配置: (raw?: any) => any;
    规范化记忆系统: (raw?: any) => 记忆系统结构;
    规范化社交列表: (raw?: any[], options?: { 合并同名?: boolean }) => any[];
    规范化视觉设置: (raw?: any) => any;
    规范化场景图片档案: (raw?: any) => any;
    normalizeCanonicalGameTime: (input?: string) => string;
    构建即时记忆条目: (gameTime: string, playerInput: string, aiData: any, options?: { 省略玩家输入?: boolean }) => any;
    构建短期记忆条目: (gameTime: string, aiData: any) => any;
    写入四段记忆: (memory: 记忆系统结构, immediateEntry: any, shortEntry: any, options: any) => 记忆系统结构;
    估算AI输出Token: (rawText: string) => number;
    提取解析失败原始信息: (error: any) => string;
    提取原始报错详情: (error: any) => string;
    构建标签解析选项: (config: any) => any;
    parseStoryRawText: (rawText: string, options: any) => GameResponse;
    执行正文润色: (response: GameResponse, rawSource: string, options?: { manual?: boolean; playerInput?: string; signal?: AbortSignal; allowExpansionForLength?: boolean; minLength?: number }) => Promise<{ applied: boolean; response: GameResponse; error?: string }>;
    规范化游戏设置: (raw?: any) => any;
    processResponseCommands: (response: GameResponse, baseState?: any, options?: { applyState?: boolean }) => any;
    按世界演变分流净化响应: (response: GameResponse, enabled: boolean) => { response: GameResponse };
    世界演变功能已开启: () => boolean;
    执行世界演变更新?: (params?: {
        来源?: 'manual' | 'auto_due' | 'story_dynamic' | 'story_dynamic_and_due';
        playerInput?: string;
        动态世界线索?: string[];
        到期摘要?: string[];
        force?: boolean;
        applyCommands?: boolean;
        currentResponse?: GameResponse;
        stateBase?: any;
        signal?: AbortSignal;
        onStreamDelta?: (delta: string, accumulated: string) => void;
    }) => Promise<{ ok: boolean; phase: 'done' | 'error' | 'skipped'; commands: any[]; updates: string[]; rawText: string; statusText: string }>;
    后台执行统一规划分析?: (params: {
        state: any;
        playerInput: string;
        gameTime: string;
        response: GameResponse;
        shouldApply?: () => boolean;
        onRetry?: (attempt: number, maxAttempts: number, reason: string) => void;
        onStreamDelta?: (delta: string, accumulated: string) => void;
        signal?: AbortSignal;
    }) => Promise<{ updated: boolean; message: string; rawText?: string; commands: any[] }>;
    执行地图自动更新?: (params: {
        response: GameResponse;
        stateBase: any;
        onProgress?: (progress: {
            phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
            text?: string;
            rawText?: string;
            commandTexts?: string[];
        }) => void;
    }) => Promise<{ ok: boolean; phase: 'done' | 'error' | 'skipped'; commands: any[]; rawText: string; statusText: string }>;
    后台执行变量生成?: (params: {
        snapshot: 回合快照结构;
        parsedResponse: GameResponse;
        displayResponse?: GameResponse;
        rawText: string;
        playerInput: string;
        inputTokens?: number;
        responseDurationSec?: number;
        onProgress?: (progress: {
            phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
            text?: string;
            rawText?: string;
            commandTexts?: string[];
            channelName?: string;
            modelName?: string;
            startedAt?: number;
            finishedAt?: number;
            elapsedMs?: number;
        }) => void;
    }) => Promise<void>;
    执行重解析变量生成: (params: {
        snapshot: 回合快照结构;
        playerInput: string;
        parsedResponse: GameResponse;
    }) => Promise<GameResponse>;
    应用并同步记忆系统: (memory: 记忆系统结构, options?: { 静默总结提示?: boolean }) => void;
    performAutoSave: (snapshot?: any) => Promise<void>;
    设置剧情: (value: 剧情系统结构) => void;
    设置历史记录: (value: 聊天记录结构[]) => void;
    设置玩家门派: (value: 详细门派结构) => void;
    设置任务列表: (value: any[]) => void;
    设置约定列表: (value: any[]) => void;
    设置社交: (value: any[]) => void;
    记录变量生成上下文: (params: { playerInput: string; response: any }) => void;
    set聊天区自动滚动抑制令牌: (value: number) => void;
    获取NPC唯一标识: (npc: any, index?: number) => string;
    合并NPC图片档案: (baseNpc: any, latestNpc: any) => any;
};

export const 创建历史回合工作流 = (deps: 历史回合工作流依赖) => {
    const 创建重建空记忆系统 = (): 记忆系统结构 => ({
        回忆档案: [],
        即时记忆: [],
        短期记忆: [],
        中期记忆: [],
        长期记忆: []
    });

    const 提取回合尾随消息 = (history: 聊天记录结构[], startExclusiveIndex: number): 聊天记录结构[] => (
        (Array.isArray(history) ? history : [])
            .slice(startExclusiveIndex + 1)
            .filter((item) => item && (item.role === 'system' || item.role === 'assistant' || item.role === 'user'))
            .map((item) => deps.深拷贝(item))
    );

    const 按历史重建记忆系统 = (history: 聊天记录结构[]): 记忆系统结构 => {
        const source = Array.isArray(history) ? history : [];
        const normalizedMemoryConfig = deps.规范化记忆配置(deps.memoryConfig);
        let nextMemory = deps.规范化记忆系统(创建重建空记忆系统());
        let latestUserInput = '';

        for (const item of source) {
            if (!item) continue;
            if (item.role === 'user') {
                latestUserInput = typeof item.content === 'string' ? item.content.trim() : '';
                continue;
            }
            if (item.role !== 'assistant' || !item.structuredResponse) {
                continue;
            }
            const aiData = item.structuredResponse;
            const gameTime = deps.normalizeCanonicalGameTime(item.gameTime || '') || item.gameTime || '未知时间';
            const hasUserInput = latestUserInput.length > 0;
            const immediateEntry = hasUserInput
                ? deps.构建即时记忆条目(gameTime, latestUserInput, aiData)
                : deps.构建即时记忆条目(gameTime, '', aiData, { 省略玩家输入: true });
            const shortEntry = deps.构建短期记忆条目(gameTime, aiData);
            nextMemory = deps.写入四段记忆(
                deps.规范化记忆系统(nextMemory),
                immediateEntry,
                shortEntry,
                {
                    immediateLimit: normalizedMemoryConfig.即时消息上传条数N,
                    shortLimit: normalizedMemoryConfig.短期记忆阈值,
                    midLimit: normalizedMemoryConfig.中期记忆阈值,
                    recordTime: gameTime,
                    timestamp: gameTime
                }
            );
            latestUserInput = '';
        }

        return deps.规范化记忆系统(nextMemory);
    };

    const 构建重解析记忆基底 = (snapshot: 回合快照结构): 记忆系统结构 => {
        const snapshotMemory = deps.规范化记忆系统(deps.深拷贝(snapshot.回档前状态.记忆系统));
        const currentMemory = deps.规范化记忆系统(deps.深拷贝(deps.记忆系统));
        return {
            ...snapshotMemory,
            短期记忆: Array.from(new Set(currentMemory.短期记忆.map((item) => (item || '').trim()).filter(Boolean))),
            中期记忆: Array.from(new Set(currentMemory.中期记忆.map((item) => (item || '').trim()).filter(Boolean))),
            长期记忆: Array.from(new Set(currentMemory.长期记忆.map((item) => (item || '').trim()).filter(Boolean)))
        };
    };

    const 使用快照重建解析回合 = async (
        snapshot: 回合快照结构,
        parsed: GameResponse,
        rawText: string,
        options?: {
            playerInput?: string;
            displayResponse?: GameResponse;
            tailMessages?: 聊天记录结构[];
            preserveSnapshot?: boolean;
            inputTokens?: number;
            responseDurationSec?: number;
            skipVariableModelCalibration?: boolean;
            preserveScrollPosition?: boolean;
            forceAutoSave?: boolean;
        }
    ) => {
        const replayPlayerInput = typeof options?.playerInput === 'string' ? options.playerInput : snapshot.玩家输入;
        const hasReplayUserInput = replayPlayerInput.trim().length > 0;
        deps.回档到快照(snapshot, { 保留图片状态: true });

        const worldEvolutionEnabled = deps.世界演变功能已开启();
        const baseState = {
            角色: deps.深拷贝(snapshot.回档前状态.角色),
            环境: deps.深拷贝(snapshot.回档前状态.环境),
            社交: deps.深拷贝(snapshot.回档前状态.社交),
            世界: deps.深拷贝(snapshot.回档前状态.世界),
            战斗: deps.深拷贝(snapshot.回档前状态.战斗),
            玩家门派: deps.深拷贝(snapshot.回档前状态.玩家门派),
            任务列表: deps.深拷贝(snapshot.回档前状态.任务列表),
            约定列表: deps.深拷贝(snapshot.回档前状态.约定列表),
            剧情: deps.深拷贝(snapshot.回档前状态.剧情),
            女主剧情规划: deps.深拷贝(snapshot.回档前状态.女主剧情规划)
        };
        let effectiveParsed = deps.按世界演变分流净化响应(parsed, worldEvolutionEnabled).response;
        if (!options?.skipVariableModelCalibration) {
            try {
                effectiveParsed = await deps.执行重解析变量生成({
                    snapshot,
                    playerInput: replayPlayerInput,
                    parsedResponse: effectiveParsed
                });
            } catch (variableError) {
                console.error('重解析回合的独立变量模型校准失败，已回退为原始解析命令 + 本地校准', variableError);
            }
        }

        const newState = deps.processResponseCommands(effectiveParsed, baseState);
        const nextGameTime = deps.环境时间转标准串(newState.环境) || '未知时间';
        const syncedStory = await 同步剧情小说分解时间校准({
            previousStory: snapshot.回档前状态.剧情,
            nextStory: newState.剧情,
            currentGameTime: nextGameTime,
            openingConfig: deps.获取开局配置(),
            allowBootstrapCurrentGroup: true
        });
        const displayParsed: GameResponse = options?.displayResponse
            ? {
                ...options.displayResponse,
                tavern_commands: Array.isArray(effectiveParsed.tavern_commands) ? effectiveParsed.tavern_commands : [],
                variable_calibration_report: effectiveParsed.variable_calibration_report,
                variable_calibration_commands: effectiveParsed.variable_calibration_commands,
                variable_calibration_model: effectiveParsed.variable_calibration_model
            }
            : effectiveParsed;

        const mergedSocial = (Array.isArray(newState.社交) ? newState.社交 : []).map((npc: any, index: number) => {
            const key = deps.获取NPC唯一标识(npc, index);
            const latestNpc = (Array.isArray(deps.社交) ? deps.社交 : []).find((item: any, idx: number) => deps.获取NPC唯一标识(item, idx) === key);
            if (!latestNpc) return npc;
            const mergedArchive = deps.合并NPC图片档案(npc, latestNpc);
            return {
                ...npc,
                图片档案: mergedArchive,
                最近生图结果: mergedArchive.最近生图结果
            };
        });

        const patchedState = {
            ...newState,
            社交: mergedSocial,
            剧情: syncedStory
        };
        deps.设置剧情(deps.深拷贝(patchedState.剧情));
        deps.设置玩家门派(deps.深拷贝(patchedState.玩家门派));
        deps.设置任务列表(deps.深拷贝(patchedState.任务列表));
        deps.设置约定列表(deps.深拷贝(patchedState.约定列表));
        deps.设置社交(deps.规范化社交列表(deps.深拷贝(patchedState.社交), { 合并同名: false }));

        const recoveredAiTimestamp = Date.now();
        const recoveredAiMsg: 聊天记录结构 = {
            role: 'assistant',
            content: 'Structured Response',
            structuredResponse: displayParsed,
            rawJson: typeof rawText === 'string' ? rawText : '',
            timestamp: recoveredAiTimestamp,
            gameTime: nextGameTime,
            inputTokens: typeof options?.inputTokens === 'number' ? options.inputTokens : undefined,
            responseDurationSec: typeof options?.responseDurationSec === 'number' ? options.responseDurationSec : undefined,
            outputTokens: deps.估算AI输出Token(typeof rawText === 'string' ? rawText : '')
        };
        const previousScrollTop = options?.preserveScrollPosition ? (deps.scrollRef.current?.scrollTop ?? null) : null;
        if (options?.preserveScrollPosition) {
            deps.set聊天区自动滚动抑制令牌(Date.now());
        }
        const recoveredHistory = [
            ...deps.深拷贝(snapshot.回档前历史),
            ...(hasReplayUserInput
                ? [{
                    role: 'user' as const,
                    content: replayPlayerInput,
                    timestamp: Date.now() - 1,
                    gameTime: snapshot.游戏时间
                }]
                : []),
            recoveredAiMsg,
            ...deps.深拷贝(Array.isArray(options?.tailMessages) ? options?.tailMessages : [])
        ];
        deps.设置历史记录(recoveredHistory);
        deps.记录变量生成上下文({ playerInput: replayPlayerInput, response: displayParsed });
        if (options?.preserveScrollPosition && previousScrollTop !== null) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (deps.scrollRef.current) {
                        deps.scrollRef.current.scrollTop = previousScrollTop;
                    }
                });
            });
        }

        const recoveredMemoryConfig = deps.规范化记忆配置(deps.memoryConfig);
        const recoveredMemoryBase = 构建重解析记忆基底(snapshot);
        const recoveredMemory = deps.写入四段记忆(
            recoveredMemoryBase,
            hasReplayUserInput
                ? deps.构建即时记忆条目(nextGameTime, replayPlayerInput, displayParsed)
                : deps.构建即时记忆条目(nextGameTime, '', displayParsed, { 省略玩家输入: true }),
            deps.构建短期记忆条目(nextGameTime, displayParsed),
            {
                immediateLimit: recoveredMemoryConfig.即时消息上传条数N,
                shortLimit: recoveredMemoryConfig.短期记忆阈值,
                midLimit: recoveredMemoryConfig.中期记忆阈值,
                recordTime: nextGameTime,
                timestamp: nextGameTime
            }
        );
        deps.应用并同步记忆系统(recoveredMemory, { 静默总结提示: deps.记忆总结阶段 !== 'remind' });
        void deps.performAutoSave({
            history: recoveredHistory,
            role: patchedState.角色,
            env: patchedState.环境,
            social: patchedState.社交,
            world: patchedState.世界,
            battle: patchedState.战斗,
            sect: patchedState.玩家门派,
            tasks: patchedState.任务列表,
            agreements: patchedState.约定列表,
            story: patchedState.剧情,
            storyPlan: patchedState.剧情规划,
            heroinePlan: patchedState.女主剧情规划,
            fandomStoryPlan: patchedState.同人剧情规划,
            fandomHeroinePlan: patchedState.同人女主剧情规划,
            directorBible: snapshot.回档前状态.导演圣经,
            memory: recoveredMemory,
            visualConfig: deps.规范化视觉设置(deps.深拷贝(deps.visualConfigRef.current || deps.visualConfig)),
            sceneImageArchive: deps.规范化场景图片档案(deps.深拷贝(deps.场景图片档案Ref.current || {})),
            force: options?.forceAutoSave === true
        });

        if (!options?.preserveSnapshot) {
            deps.弹出重Roll快照();
        }
    };

    const updateHistoryItem = async (index: number, newRawText: string): Promise<string | null> => {
        if (!Array.isArray(deps.历史记录) || index < 0 || index >= deps.历史记录.length) {
            return '目标历史记录不存在，无法更新。';
        }
        const target = deps.历史记录[index];
        if (!target || target.role !== 'assistant') {
            return '仅支持编辑 AI 回合原文。';
        }
        const latestAssistantIndex = (() => {
            for (let i = deps.历史记录.length - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'assistant') return i;
            }
            return -1;
        })();
        if (index !== latestAssistantIndex) {
            return '仅最新回合支持编辑原文，较早回合仅支持查看。';
        }
        if (deps.变量生成中) {
            return '变量生成进行中，请等待完成后再编辑并重解析最新回合。';
        }
        const snapshot = deps.获取最新快照();
        if (!snapshot) {
            return '缺少上一轮快照，无法执行编辑后重解析。';
        }
        const latestUserIndex = (() => {
            for (let i = index - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'user') return i;
            }
            return -1;
        })();
        const latestUserMsg = latestUserIndex >= 0 ? deps.历史记录[latestUserIndex] : null;
        const playerInput = latestUserMsg?.role === 'user' ? (latestUserMsg.content || '').trim() : '';
        const snapshotPlayerInput = (snapshot.玩家输入 || '').trim();
        const isOpeningTurn = !playerInput && !snapshotPlayerInput;
        if (!playerInput && !isOpeningTurn) {
            return '未找到对应的玩家输入，无法重新解析该回合。';
        }
        if (!isOpeningTurn && playerInput !== snapshotPlayerInput) {
            return '当前最新回合与上一轮快照不匹配，无法安全重解析。';
        }

        const runtimeGameConfig = deps.规范化游戏设置(deps.gameConfig);
        let parsed: GameResponse;
        try {
            parsed = deps.parseStoryRawText(newRawText, deps.构建标签解析选项(runtimeGameConfig));
        } catch (error: any) {
            const detail = deps.提取解析失败原始信息(error);
            console.error('Failed to update history: raw text parse failed', detail);
            return detail;
        }

        // 两阶段落地：先用本地校准立即把编辑后的回合渲染出来并滚动到位（跳过变量模型网络调用），
        // 再后台异步执行独立变量模型校准并保位刷新，避免“保存后要等很久才显示这一回合”。
        const 尾随消息 = 提取回合尾随消息(deps.历史记录, index);
        await 使用快照重建解析回合(snapshot, parsed, newRawText, {
            playerInput: isOpeningTurn ? '' : playerInput,
            tailMessages: 尾随消息,
            inputTokens: target.inputTokens,
            responseDurationSec: target.responseDurationSec,
            preserveSnapshot: true,
            skipVariableModelCalibration: true
        });
        // 后台执行变量模型校准（不阻塞 UI）；保位刷新，避免二次落地时画面跳动。
        void (async () => {
            try {
                await 使用快照重建解析回合(snapshot, parsed, newRawText, {
                    playerInput: isOpeningTurn ? '' : playerInput,
                    tailMessages: 尾随消息,
                    inputTokens: target.inputTokens,
                    responseDurationSec: target.responseDurationSec,
                    preserveSnapshot: true,
                    skipVariableModelCalibration: false,
                    preserveScrollPosition: true
                });
            } catch (calibrationError) {
                console.error('重解析回合的后台变量模型校准失败，保留本地校准结果', calibrationError);
            }
        })();
        return null;
    };

    const handleRegenerate = async (): Promise<string | null> => {
        if (deps.loading) return null;
        const snapshot = deps.弹出重Roll快照();
        if (!snapshot) return null;
        deps.回档到快照(snapshot);
        void deps.清理回合自动存档并重置状态(snapshot);
        return snapshot.玩家输入;
    };

    const handleRetryLatestVariableGeneration = async (options?: {
        onVariableGenerationProgress?: (progress: {
            phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
            text?: string;
            rawText?: string;
            commandTexts?: string[];
            channelName?: string;
            modelName?: string;
            startedAt?: number;
            finishedAt?: number;
            elapsedMs?: number;
        }) => void;
    }): Promise<string | null> => {
        if (deps.loading) return '当前仍在处理中，请稍后再试。';
        if (deps.变量生成中) return '变量生成进行中，请勿重复触发。';
        const snapshot = deps.获取最新快照();
        if (!snapshot) {
            return '缺少上一轮快照，无法从当前正文继续变量生成。';
        }

        const latestAssistantIndex = (() => {
            for (let i = deps.历史记录.length - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'assistant') return i;
            }
            return -1;
        })();
        if (latestAssistantIndex < 0) {
            return '未找到可继续处理的最新 AI 回合。';
        }

        const target = deps.历史记录[latestAssistantIndex];
        if (!target) {
            return '目标 AI 回合不存在。';
        }

        const latestUserIndex = (() => {
            for (let i = latestAssistantIndex - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'user') return i;
            }
            return -1;
        })();
        const latestUserMsg = latestUserIndex >= 0 ? deps.历史记录[latestUserIndex] : null;
        const playerInput = latestUserMsg?.role === 'user' ? (latestUserMsg.content || '').trim() : '';
        const snapshotPlayerInput = (snapshot.玩家输入 || '').trim();
        const isOpeningTurn = !playerInput && !snapshotPlayerInput;
        if (!isOpeningTurn && playerInput !== snapshotPlayerInput) {
            return '当前最新回合与上一轮快照不匹配，无法安全续跑变量生成。';
        }

        const runtimeGameConfig = deps.规范化游戏设置(deps.gameConfig);
        let parsed: GameResponse;
        if (target.structuredResponse) {
            parsed = target.structuredResponse;
        } else {
            const rawSource = typeof target.rawJson === 'string' ? target.rawJson.trim() : '';
            if (!rawSource) {
                return '当前回合缺少结构化正文和原始响应，无法继续变量生成。';
            }
            try {
                parsed = deps.parseStoryRawText(rawSource, deps.构建标签解析选项(runtimeGameConfig));
            } catch (error: any) {
                return deps.提取解析失败原始信息(error) || '无法从原始响应恢复结构化正文。';
            }
        }

        if (deps.后台执行变量生成) {
            try {
                options?.onVariableGenerationProgress?.({
                    phase: 'start',
                    text: '正在基于当前正文继续变量生成...'
                });
                await deps.后台执行变量生成({
                    snapshot,
                    parsedResponse: parsed,
                    displayResponse: target.structuredResponse || parsed,
                    rawText: typeof target.rawJson === 'string' ? target.rawJson : '',
                    playerInput: isOpeningTurn ? '' : playerInput,
                    inputTokens: target.inputTokens,
                    responseDurationSec: target.responseDurationSec,
                    onProgress: options?.onVariableGenerationProgress
                });
                return null;
            } catch (error: any) {
                const message = deps.提取原始报错详情(error)
                    || error?.message
                    || '变量生成失败';
                options?.onVariableGenerationProgress?.({
                    phase: 'error',
                    text: `${message}\n已保留当前正文，可稍后继续生成。`
                });
                return message;
            }
        }

        await 使用快照重建解析回合(snapshot, parsed, typeof target.rawJson === 'string' ? target.rawJson : '', {
            playerInput: isOpeningTurn ? '' : playerInput,
            displayResponse: target.structuredResponse || parsed,
            tailMessages: 提取回合尾随消息(deps.历史记录, latestAssistantIndex),
            inputTokens: target.inputTokens,
            responseDurationSec: target.responseDurationSec,
            preserveSnapshot: true
        });
        return null;
    };

    const 序列化阶段命令文本 = (commands: any[]): string[] => (
        (Array.isArray(commands) ? commands : [])
            .map((cmd, index) => {
                const action = typeof cmd?.action === 'string' ? cmd.action : 'set';
                const key = typeof cmd?.key === 'string' ? cmd.key.replace(/^gameState\./, '') : '';
                if (!key.trim()) return '';
                if (action === 'delete') return `[#${index + 1}] delete ${key}`;
                try {
                    return `[#${index + 1}] ${action} ${key} = ${JSON.stringify(cmd?.value ?? null)}`;
                } catch {
                    return `[#${index + 1}] ${action} ${key} = ${String(cmd?.value ?? null)}`;
                }
            })
            .filter(Boolean)
    );

    const 获取最新可处理AI回合 = (): {
        snapshot: 回合快照结构;
        target: 聊天记录结构;
        latestAssistantIndex: number;
        playerInput: string;
        isOpeningTurn: boolean;
        parsed: GameResponse;
    } | string => {
        const snapshot = deps.获取最新快照();
        if (!snapshot) return '缺少上一轮快照，无法重新生成该阶段。';
        const latestAssistantIndex = (() => {
            for (let i = deps.历史记录.length - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'assistant') return i;
            }
            return -1;
        })();
        if (latestAssistantIndex < 0) return '未找到可继续处理的最新 AI 回合。';
        const target = deps.历史记录[latestAssistantIndex];
        if (!target) return '目标 AI 回合不存在。';
        const latestUserIndex = (() => {
            for (let i = latestAssistantIndex - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'user') return i;
            }
            return -1;
        })();
        const latestUserMsg = latestUserIndex >= 0 ? deps.历史记录[latestUserIndex] : null;
        const playerInput = latestUserMsg?.role === 'user' ? (latestUserMsg.content || '').trim() : '';
        const snapshotPlayerInput = (snapshot.玩家输入 || '').trim();
        const isOpeningTurn = !playerInput && !snapshotPlayerInput;
        if (!isOpeningTurn && playerInput !== snapshotPlayerInput) {
            return '当前最新回合与上一轮快照不匹配，无法安全重新生成该阶段。';
        }
        let parsed: GameResponse;
        if (target.structuredResponse) {
            parsed = target.structuredResponse;
        } else {
            const rawSource = typeof target.rawJson === 'string' ? target.rawJson.trim() : '';
            if (!rawSource) return '当前回合缺少结构化正文和原始响应，无法重新生成该阶段。';
            try {
                parsed = deps.parseStoryRawText(rawSource, deps.构建标签解析选项(deps.规范化游戏设置(deps.gameConfig)));
            } catch (error: any) {
                return deps.提取解析失败原始信息(error) || '无法从原始响应恢复结构化正文。';
            }
        }
        return {
            snapshot,
            target,
            latestAssistantIndex,
            playerInput,
            isOpeningTurn,
            parsed
        };
    };

    const handleRetryLatestStage = async (
        stageId: 'polish' | 'world' | 'planning' | 'map',
        options?: {
            onPolishProgress?: (progress: { phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled'; text?: string; rawText?: string }) => void;
            onWorldEvolutionProgress?: (progress: { phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled'; text?: string; rawText?: string; commandTexts?: string[] }) => void;
            onPlanningProgress?: (progress: { phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled'; text?: string; rawText?: string; commandTexts?: string[] }) => void;
            onMapUpdateProgress?: (progress: { phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled'; text?: string; rawText?: string; commandTexts?: string[] }) => void;
        }
    ): Promise<string | null> => {
        if (deps.loading) return '当前仍在处理中，请稍后再试。';
        if (deps.变量生成中) return '变量生成进行中，请等待完成后再重试后台阶段。';
        const latest = 获取最新可处理AI回合();
        if (typeof latest === 'string') return latest;
        const snapshotState = deps.深拷贝(latest.snapshot.回档前状态);
        const parsed = latest.parsed;
        const playerInput = latest.isOpeningTurn ? '' : latest.playerInput;
        try {
            if (stageId === 'polish') {
                options?.onPolishProgress?.({ phase: 'start', text: '正在重新执行文章优化...' });
                const polished = await deps.执行正文润色(parsed, typeof latest.target.rawJson === 'string' ? latest.target.rawJson : '', {
                    manual: true,
                    playerInput
                });
                if (!polished.applied) {
                    options?.onPolishProgress?.({ phase: 'skipped', text: polished.error || '文章优化未生效，已保留原文。' });
                    return polished.error || null;
                }
                const nextHistory = [...deps.历史记录];
                nextHistory[latest.latestAssistantIndex] = {
                    ...latest.target,
                    structuredResponse: polished.response,
                    autoScrollToTurnIcon: true
                };
                deps.设置历史记录(nextHistory);
                deps.应用并同步记忆系统(按历史重建记忆系统(nextHistory));
                void deps.performAutoSave({ history: nextHistory });
                options?.onPolishProgress?.({ phase: 'done', text: `文章优化重新生成完成（模型：${(polished.response as any).body_optimized_model || '未知'}）。` });
                return null;
            }

            if (stageId === 'world') {
                if (!deps.执行世界演变更新) return '当前版本未接入动态世界单阶段重试能力。';
                options?.onWorldEvolutionProgress?.({ phase: 'start', text: '正在重新执行动态世界更新...' });
                const result = await deps.执行世界演变更新({
                    来源: 'story_dynamic',
                    playerInput,
                    动态世界线索: [],
                    applyCommands: true,
                    currentResponse: parsed,
                    stateBase: snapshotState,
                    onStreamDelta: (_delta, accumulated) => options?.onWorldEvolutionProgress?.({ phase: 'stream', text: accumulated })
                });
                options?.onWorldEvolutionProgress?.({
                    phase: result.phase,
                    text: result.statusText || (result.ok ? '动态世界更新完成。' : '动态世界未产生更新。'),
                    rawText: result.rawText,
                    commandTexts: 序列化阶段命令文本(result.commands)
                });
                return result.phase === 'error' ? (result.statusText || '动态世界更新失败。') : null;
            }

            if (stageId === 'planning') {
                if (!deps.后台执行统一规划分析) return '当前版本未接入规划分析单阶段重试能力。';
                options?.onPlanningProgress?.({ phase: 'start', text: '正在重新执行规划分析...' });
                const result = await deps.后台执行统一规划分析({
                    state: {
                        环境: snapshotState.环境,
                        社交: snapshotState.社交,
                        世界: snapshotState.世界,
                        剧情: snapshotState.剧情,
                        剧情规划: (snapshotState as any).剧情规划 || {},
                        女主剧情规划: snapshotState.女主剧情规划
                    },
                    playerInput,
                    gameTime: latest.snapshot.游戏时间 || '未知时间',
                    response: parsed,
                    shouldApply: () => true,
                    onRetry: (attempt, maxAttempts, reason) => {
                        options?.onPlanningProgress?.({
                            phase: 'start',
                            text: `规划分析请求失败，正在自动重试（${attempt}/${maxAttempts}）${reason ? `：${reason}` : ''}`
                        });
                    },
                    onStreamDelta: (_delta, accumulated) => options?.onPlanningProgress?.({ phase: 'stream', text: accumulated })
                });
                options?.onPlanningProgress?.({
                    phase: result.updated || result.commands.length > 0 ? 'done' : 'skipped',
                    text: result.message,
                    rawText: result.rawText,
                    commandTexts: 序列化阶段命令文本(result.commands)
                });
                return null;
            }

            if (stageId === 'map') {
                if (!deps.执行地图自动更新) return '当前版本未接入地图更新单阶段重试能力。';
                options?.onMapUpdateProgress?.({ phase: 'start', text: '正在重新执行地图更新...' });
                const result = await deps.执行地图自动更新({
                    response: parsed,
                    stateBase: snapshotState,
                    onProgress: options?.onMapUpdateProgress
                });
                return result.phase === 'error' ? (result.statusText || '地图更新失败。') : null;
            }
        } catch (error: any) {
            const message = deps.提取原始报错详情(error) || error?.message || '重新生成失败。';
            if (stageId === 'polish') options?.onPolishProgress?.({ phase: 'error', text: message });
            if (stageId === 'world') options?.onWorldEvolutionProgress?.({ phase: 'error', text: message });
            if (stageId === 'planning') options?.onPlanningProgress?.({ phase: 'error', text: message });
            if (stageId === 'map') options?.onMapUpdateProgress?.({ phase: 'error', text: message });
            return message;
        }
        return '未知阶段，无法重新生成。';
    };

    const handleRecoverFromParseErrorRaw = async (rawText: string, forceRepair: boolean = false): Promise<string | null> => {
        const snapshot = deps.获取最新快照();
        if (!snapshot) return '没有可恢复的解析失败回合。';

        const runtimeGameConfig = deps.规范化游戏设置(deps.gameConfig);
        let parsed: GameResponse;
        try {
            const parseOptions = deps.构建标签解析选项(runtimeGameConfig);
            parsed = deps.parseStoryRawText(rawText, {
                ...parseOptions,
                enableTagRepair: forceRepair ? true : parseOptions.enableTagRepair
            });
        } catch (error: any) {
            return deps.提取解析失败原始信息(error);
        }

        await 使用快照重建解析回合(snapshot, parsed, rawText);
        return null;
    };

    const handlePolishTurn = async (historyIndex: number): Promise<string | null> => {
        if (deps.loading) return '当前仍在处理中，请稍后再试。';
        if (!Array.isArray(deps.历史记录) || historyIndex < 0 || historyIndex >= deps.历史记录.length) {
            return '目标回合不存在。';
        }
        const latestAssistantIndex = (() => {
            for (let i = deps.历史记录.length - 1; i >= 0; i -= 1) {
                if (deps.历史记录[i]?.role === 'assistant' && deps.历史记录[i]?.structuredResponse) return i;
            }
            return -1;
        })();
        if (deps.变量生成中 && historyIndex === latestAssistantIndex) {
            return '变量生成进行中，请等待完成后再优化最新回合正文。';
        }
        const target = deps.历史记录[historyIndex];
        if (!target || target.role !== 'assistant' || !target.structuredResponse) {
            return '仅支持优化 AI 正文回合。';
        }
        const rawSource = typeof target.rawJson === 'string' ? target.rawJson : '';
        const turnPlayerInput = (() => {
            for (let i = historyIndex - 1; i >= 0; i -= 1) {
                const item = deps.历史记录[i];
                if (!item || item.role !== 'user') continue;
                const content = typeof item.content === 'string' ? item.content.trim() : '';
                if (content) return content;
            }
            return '';
        })();
        let polishedResponse: GameResponse = target.structuredResponse;
        try {
            const polished = await deps.执行正文润色(target.structuredResponse, rawSource, {
                manual: true,
                playerInput: turnPlayerInput
            });
            if (!polished.applied) {
                return polished.error || '未执行优化。';
            }
            polishedResponse = polished.response;
        } catch (error: any) {
            return deps.提取原始报错详情(error) || '正文优化失败。';
        }

        const nextHistory = [...deps.历史记录];
        nextHistory[historyIndex] = {
            ...target,
            structuredResponse: polishedResponse,
            autoScrollToTurnIcon: true
        };
        deps.设置历史记录(nextHistory);
        deps.应用并同步记忆系统(按历史重建记忆系统(nextHistory));
        void deps.performAutoSave({ history: nextHistory });
        return null;
    };

    return {
        使用快照重建解析回合,
        updateHistoryItem,
        handleRegenerate,
        handleRetryLatestVariableGeneration,
        handleRetryLatestStage,
        handleRecoverFromParseErrorRaw,
        handlePolishTurn
    };
};
