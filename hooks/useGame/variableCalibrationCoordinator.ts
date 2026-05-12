import type {
    GameResponse,
    女主剧情规划结构,
    OpeningConfig,
    详细门派结构,
    世界数据结构,
    剧情系统结构,
    战斗状态结构,
    环境信息结构,
    聊天记录结构,
    角色数据结构
} from '../../types';
import { recordDiagnosticLog, type DiagnosticLogLevel } from '../../services/diagnosticLog';

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
        女主剧情规划?: 女主剧情规划结构;
        记忆系统?: any;
    };
    回档前持久态?: {
        视觉设置?: any;
        场景图片档案?: any;
    };
    回档前历史: 聊天记录结构[];
};

type 变量生成进度 = {
    phase: 'start' | 'done' | 'error' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type 变量生成工作流依赖 = {
    apiConfig: any;
    gameConfig: any;
    prompts: any[];
    开局配置?: OpeningConfig;
    内置提示词列表: any[];
    世界书列表: any[];
    世界演变进行中Ref: { current: boolean };
    variableGenerationAbortControllerRef: { current: AbortController | null };
    set变量生成中: (value: boolean) => void;
    深拷贝: <T>(value: T) => T;
    世界演变功能已开启: () => boolean;
    等待世界演变空闲: (signal?: AbortSignal, timeoutMs?: number) => Promise<void>;
    收集最近变量生成上下文: (history: any[], limit?: number) => any[];
    执行变量模型校准工作流: (params: any, options: { apiConfig: any; gameConfig: any }) => Promise<any>;
    合并变量生成结果到响应: (response: GameResponse, calibration: any) => GameResponse;
    变量生成功能已启用: (apiConfig: any) => boolean;
    获取变量计算接口配置: (apiConfig: any) => any;
    接口配置是否可用: (api: any) => boolean;
    序列化变量生成命令: (cmd: any) => string;
    使用快照重建解析回合: (snapshot: any, parsed: GameResponse, rawText: string, options?: any) => Promise<void>;
};

const 构建基础状态 = (snapshot: 回合快照结构, 深拷贝: <T>(value: T) => T) => ({
    角色: 深拷贝(snapshot.回档前状态.角色),
    环境: 深拷贝(snapshot.回档前状态.环境),
    社交: 深拷贝(snapshot.回档前状态.社交),
    世界: 深拷贝(snapshot.回档前状态.世界),
    战斗: 深拷贝(snapshot.回档前状态.战斗),
    玩家门派: 深拷贝(snapshot.回档前状态.玩家门派),
    任务列表: 深拷贝(snapshot.回档前状态.任务列表),
    约定列表: 深拷贝(snapshot.回档前状态.约定列表),
    剧情: 深拷贝(snapshot.回档前状态.剧情),
    女主剧情规划: 深拷贝(snapshot.回档前状态.女主剧情规划)
});

const 等待世界演变超时毫秒 = 20000;
const 变量流式空闲超时毫秒 = 45000; // 流式输出空闲超时：45秒内无新数据则判定超时
const 变量首次响应超时毫秒 = 90000; // 首次响应超时：90秒内未收到任何流式数据则判定超时
const 变量流式进度间隔毫秒 = 700;
const 变量流式预览字符上限 = 12000;

const 记录变量生成诊断 = (level: DiagnosticLogLevel, label: string, detail: Record<string, unknown> = {}) => {
    recordDiagnosticLog(level, ['变量生成阶段', {
        label,
        at: new Date().toISOString(),
        ...detail
    }]);
};

const 截断变量流式预览 = (value: string): string => {
    if (!value || value.length <= 变量流式预览字符上限) return value;
    const headLength = Math.floor(变量流式预览字符上限 * 0.6);
    const tailLength = 变量流式预览字符上限 - headLength;
    return [
        value.slice(0, headLength),
        '',
        `[变量生成] 流式预览过长，已截断：原始 ${value.length} 字符，仅保留前后 ${变量流式预览字符上限} 字符。`,
        '',
        value.slice(value.length - tailLength)
    ].join('\n');
};

const 创建超时错误 = (message: string): Error => {
    const error = new Error(message);
    error.name = 'TimeoutError';
    return error;
};

export const 创建变量校准协调器 = (deps: 变量生成工作流依赖) => {
    const 构建带索引命令文本 = (commands: any[], startIndex: number): string[] => (
        (Array.isArray(commands) ? commands : [])
            .map((cmd, index) => {
                const body = deps.序列化变量生成命令(cmd);
                return body.trim() ? `[#${startIndex + index}] ${body}` : '';
            })
            .filter(Boolean)
    );

    const 执行变量校准并合并响应 = async (params: {
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
    }) => {
        if (!deps.变量生成功能已启用(deps.apiConfig)) {
            return null;
        }
        const variableApi = deps.获取变量计算接口配置(deps.apiConfig);
        if (!deps.接口配置是否可用(variableApi)) {
            return null;
        }
        if (deps.variableGenerationAbortControllerRef.current) {
            deps.variableGenerationAbortControllerRef.current.abort();
        }
        const controller = new AbortController();
        deps.variableGenerationAbortControllerRef.current = controller;
        deps.set变量生成中(true);
        params.onProgress?.({ phase: 'start', text: '正在执行独立变量生成...' });
        记录变量生成诊断('info', 'start', {
            playerInputLength: params.playerInput?.length || 0,
            rawTextLength: params.rawText?.length || 0,
            parsedCommandCount: Array.isArray(params.parsedResponse?.tavern_commands) ? params.parsedResponse.tavern_commands.length : 0,
            mergeTargetCommandCount: Array.isArray(params.mergeTargetResponse?.tavern_commands) ? params.mergeTargetResponse.tavern_commands.length : undefined,
            worldEvolutionUpdated: params.worldEvolutionUpdated === true
        });
        try {
            let 最近流式文本 = '';
            let 最近流式进度时间 = 0;
            const 推送流式进度 = (force = false) => {
                const now = Date.now();
                if (!force && now - 最近流式进度时间 < 变量流式进度间隔毫秒) return;
                最近流式进度时间 = now;
                const preview = 截断变量流式预览(最近流式文本);
                params.onProgress?.({ phase: 'start', text: preview, rawText: preview });
            };
            const 执行带超时 = async <T,>(label: string, timeoutMs: number, task: () => Promise<T>): Promise<T> => {
                let timer = 0;
                try {
                    return await Promise.race([
                        task(),
                        new Promise<T>((_, reject) => {
                            timer = window.setTimeout(() => {
                                if (!controller.signal.aborted) {
                                    controller.abort();
                                }
                                记录变量生成诊断('error', 'timeout', {
                                    label,
                                    timeoutMs,
                                    latestStreamLength: 最近流式文本.length
                                });
                                reject(创建超时错误(`${label}超时（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒）`));
                            }, timeoutMs);
                        })
                    ]);
                } finally {
                    if (timer) {
                        window.clearTimeout(timer);
                    }
                }
            };

            // 流式空闲超时：每次收到新数据时重置计时器，只有持续无数据时才超时
            let 流式空闲计时器 = 0;
            let 已收到首次流式数据 = false;
            const 重置流式空闲计时器 = () => {
                if (流式空闲计时器) window.clearTimeout(流式空闲计时器);
            };
            const 执行变量模型带流式空闲超时 = async <T,>(task: () => Promise<T>): Promise<T> => {
                const firstResponseTimeout = 变量首次响应超时毫秒;
                const idleTimeout = 变量流式空闲超时毫秒;
                let rejectFn: ((reason: Error) => void) | null = null;
                const startIdleTimer = (ms: number, label: string) => {
                    重置流式空闲计时器();
                    流式空闲计时器 = window.setTimeout(() => {
                        if (!controller.signal.aborted) controller.abort();
                        const elapsed = 已收到首次流式数据 ? idleTimeout : firstResponseTimeout;
                        记录变量生成诊断('error', 'stream-idle-timeout', {
                            label,
                            idleMs: ms,
                            receivedFirstChunk: 已收到首次流式数据,
                            latestStreamLength: 最近流式文本.length
                        });
                        rejectFn?.(创建超时错误(`变量模型${label}（${Math.max(1, Math.ceil(ms / 1000))} 秒无新数据）`));
                    }, ms);
                };
                // 初始：等待首次响应
                startIdleTimer(firstResponseTimeout, '等待首次响应超时');
                // 暴露重置方法给 onStreamDelta
                流式空闲重置回调 = () => {
                    已收到首次流式数据 = true;
                    startIdleTimer(idleTimeout, '流式输出空闲超时');
                };
                try {
                    return await Promise.race([
                        task(),
                        new Promise<T>((_, reject) => { rejectFn = reject; })
                    ]);
                } finally {
                    重置流式空闲计时器();
                    流式空闲重置回调 = null;
                }
            };
            let 流式空闲重置回调: (() => void) | null = null;

            if (deps.世界演变进行中Ref.current) {
                params.onProgress?.({ phase: 'start', text: '等待世界演变完成后再开始变量生成...' });
                记录变量生成诊断('info', 'wait-world-evolution');
                await 执行带超时('等待世界演变完成', 等待世界演变超时毫秒, () => deps.等待世界演变空闲(controller.signal, 等待世界演变超时毫秒));
            }
            const worldEvolutionEnabled = deps.世界演变功能已开启();
            const calibrationResponse = params.parsedResponse;
            const mergeTargetResponse = params.mergeTargetResponse || params.parsedResponse;
            const displayResponse = params.displayResponse || mergeTargetResponse;
            const recentRounds = deps.收集最近变量生成上下文(
                Array.isArray(params.snapshot?.回档前历史) ? params.snapshot.回档前历史 : [],
                2
            );
            const isOpeningRound = (Array.isArray(params.snapshot?.回档前历史) ? params.snapshot.回档前历史.length : 0) <= 1;
            params.onProgress?.({ phase: 'start', text: '正在请求变量模型...' });
            const variableApi = deps.获取变量计算接口配置(deps.apiConfig);
            记录变量生成诊断('info', 'request-model', {
                apiName: variableApi?.名称 || '',
                supplier: variableApi?.供应商 || '',
                model: variableApi?.模型 || '',
                recentRoundCount: recentRounds.length,
                isOpeningRound,
                worldEvolutionEnabled
            });
            const variableCalibration = await 执行变量模型带流式空闲超时(() => deps.执行变量模型校准工作流(
                {
                    playerInput: params.playerInput,
                    parsedResponse: calibrationResponse,
                    baseState: 构建基础状态(params.snapshot, deps.深拷贝),
                    promptPool: deps.prompts,
                    worldEvolutionEnabled,
                    builtinPromptEntries: deps.内置提示词列表,
                    worldEvolutionUpdated: params.worldEvolutionUpdated === true,
                    worldbooks: deps.世界书列表,
                    openingConfig: deps.开局配置,
                    signal: controller.signal,
                    extraPromptAppend: params.extraPromptAppend,
                    recentRounds,
                    isOpeningRound,
                    onStreamDelta: (_delta: string, accumulated: string) => {
                        if (controller.signal.aborted) return;
                        最近流式文本 = accumulated;
                        流式空闲重置回调?.();
                        推送流式进度();
                    }
                },
                {
                    apiConfig: deps.apiConfig,
                    gameConfig: deps.gameConfig
                }
            ));
            推送流式进度(true);
            记录变量生成诊断('info', 'model-response', {
                rawTextLength: typeof variableCalibration?.rawText === 'string' ? variableCalibration.rawText.length : 0,
                commandCount: Array.isArray(variableCalibration?.commands) ? variableCalibration.commands.length : 0,
                reportCount: Array.isArray(variableCalibration?.reports) ? variableCalibration.reports.length : 0
            });
            if (controller.signal.aborted) {
                params.onProgress?.({ phase: 'cancelled', text: '已取消本次变量生成。你可以基于当前正文稍后继续生成。', rawText: 最近流式文本 });
                记录变量生成诊断('warn', 'cancelled-after-response', {
                    latestStreamLength: 最近流式文本.length
                });
                return null;
            }
            if (!variableCalibration || (
                variableCalibration.commands.length === 0
                && variableCalibration.reports.length === 0
            )) {
                params.onProgress?.({ phase: 'done', text: '当前回合未产出额外变量命令，沿用现有变量结果。', rawText: variableCalibration?.rawText });
                记录变量生成诊断('info', 'empty-result');
                return {
                    mergedParsed: mergeTargetResponse,
                    mergedDisplayResponse: displayResponse,
                    variableCalibration: null
                };
            }

            const mergedParsed = deps.合并变量生成结果到响应(mergeTargetResponse, variableCalibration);
            const mergedDisplayResponse: GameResponse = {
                ...displayResponse,
                tavern_commands: Array.isArray(mergedParsed.tavern_commands) ? mergedParsed.tavern_commands : [],
                variable_calibration_report: mergedParsed.variable_calibration_report,
                variable_calibration_commands: mergedParsed.variable_calibration_commands,
                variable_calibration_model: mergedParsed.variable_calibration_model
            };
            if (controller.signal.aborted) {
                params.onProgress?.({ phase: 'cancelled', text: '已取消本次变量生成。' });
                记录变量生成诊断('warn', 'cancelled-after-merge', {
                    latestStreamLength: 最近流式文本.length
                });
                return null;
            }
            记录变量生成诊断('info', 'merged', {
                commandCount: Array.isArray(variableCalibration.commands) ? variableCalibration.commands.length : 0,
                mergedCommandCount: Array.isArray(mergedParsed.tavern_commands) ? mergedParsed.tavern_commands.length : 0
            });
            return {
                mergedParsed,
                mergedDisplayResponse,
                variableCalibration
            };
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                params.onProgress?.({ phase: 'cancelled', text: '已取消本次变量生成。你可以基于当前正文稍后继续生成。' });
                记录变量生成诊断('warn', 'abort', {
                    message: error?.message || ''
                });
                return null;
            }
            记录变量生成诊断('error', 'failed', {
                name: error?.name || '',
                message: error?.message || String(error || ''),
                stack: error?.stack || ''
            });
            if (error?.name === 'TimeoutError') {
                params.onProgress?.({
                    phase: 'error',
                    text: `${error.message}\n已保留当前正文，可点击“继续生成”从当前回合重新执行变量生成。`
                });
                throw error;
            }
            params.onProgress?.({
                phase: 'error',
                text: `${error?.message || '变量生成失败'}\n已保留当前正文，可点击“继续生成”重试。`
            });
            throw error;
        } finally {
            if (deps.variableGenerationAbortControllerRef.current === controller) {
                deps.variableGenerationAbortControllerRef.current = null;
            }
            deps.set变量生成中(false);
        }
    };

    const 后台执行变量校准 = async (params: {
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
    }) => {
        const calibration = await 执行变量校准并合并响应(params);
        if (!calibration?.mergedParsed || !calibration.variableCalibration) {
            return;
        }
        await deps.使用快照重建解析回合(params.snapshot, calibration.mergedParsed, params.rawText, {
            playerInput: params.playerInput,
            displayResponse: calibration.mergedDisplayResponse,
            preserveSnapshot: true,
            inputTokens: params.inputTokens,
            responseDurationSec: params.responseDurationSec,
            skipVariableModelCalibration: true,
            preserveScrollPosition: true,
            forceAutoSave: true
        });
        params.onProgress?.({
            phase: 'done',
            text: `已补充 ${calibration.variableCalibration.commands.length} 条变量命令${calibration.variableCalibration.model ? `（${calibration.variableCalibration.model}）` : ''}`,
            rawText: calibration.variableCalibration.rawText,
            commandTexts: 构建带索引命令文本(
                calibration.variableCalibration.commands,
                (Array.isArray((params.mergeTargetResponse || params.parsedResponse)?.tavern_commands)
                    ? (params.mergeTargetResponse || params.parsedResponse).tavern_commands.length
                    : 0) + 1
            )
        });
    };

    const 执行重解析变量校准 = async (params: {
        snapshot: 回合快照结构;
        playerInput: string;
        parsedResponse: GameResponse;
    }): Promise<GameResponse> => {
        const worldEvolutionEnabled = deps.世界演变功能已开启();
        const recentRounds = deps.收集最近变量生成上下文(
            Array.isArray(params.snapshot?.回档前历史) ? params.snapshot.回档前历史 : [],
            2
        );
        const isOpeningRound = (Array.isArray(params.snapshot?.回档前历史) ? params.snapshot.回档前历史.length : 0) <= 1;
        const variableCalibration = await deps.执行变量模型校准工作流(
            {
                playerInput: params.playerInput,
                parsedResponse: params.parsedResponse,
                baseState: 构建基础状态(params.snapshot, deps.深拷贝),
                promptPool: deps.prompts,
                worldEvolutionEnabled,
                builtinPromptEntries: deps.内置提示词列表,
                worldbooks: deps.世界书列表,
                openingConfig: deps.开局配置,
                recentRounds,
                isOpeningRound
            },
            {
                apiConfig: deps.apiConfig,
                gameConfig: deps.gameConfig
            }
        );
        if (variableCalibration && (
            variableCalibration.commands.length > 0
            || variableCalibration.reports.length > 0
        )) {
            return deps.合并变量生成结果到响应(params.parsedResponse, variableCalibration);
        }
        return params.parsedResponse;
    };

    return {
        后台执行变量校准,
        执行变量校准并合并响应,
        执行重解析变量校准
    };
};
