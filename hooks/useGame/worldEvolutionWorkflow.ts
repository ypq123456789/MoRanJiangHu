import * as textAIService from '../../services/ai/text';
import type { GameResponse, OpeningConfig, 接口设置结构, 提示词结构, 剧情系统结构, 女主剧情规划结构, 记忆系统结构, 聊天记录结构, 环境信息结构, 世界数据结构, 世界书结构, 叙事状态结构, 叙事平静值配置结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取世界演变接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 规范化游戏设置, 计算远处联动阈值 } from '../../utils/gameSettings';
import { 获取游玩请求超时毫秒 } from '../../utils/gameRequestTimeouts';
import { 获取繁体输出指令 } from '../../utils/traditionalChinese';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 数值_世界演化 } from '../../prompts/stats/world';
import { 规范化记忆系统 } from './memoryUtils';
import { formatHistoryToScript } from './historyUtils';
import { 构建世界演变COT提示词, 世界演变COT伪装历史消息提示词 } from '../../prompts/runtime/worldEvolutionCot';
import { 环境时间转标准串 } from './timeUtils';
import { 构建世界演变上下文文本, 规范化世界演变命令列表, 整理客户可见世界大事 } from './worldEvolutionUtils';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';
import { 提取响应规划文本 } from './thinkingContext';
import { 创建工作流性能诊断 } from '../../utils/performanceDebug';
import { 后台分段执行, 后台让出主线程 } from '../../utils/backgroundScheduling';
import { 执行游戏后台重计算 } from '../../utils/gameHeavyWorkerClient';
import { buildNpcSettlementCommands, findNpcIndex, mergeNpcSettlementCandidates } from './npcEvolutionSettlement';
import { 执行带完整性校验的请求 } from './streamIntegrity';

export type 世界演变触发参数 = {
    来源?: 'manual' | 'auto_due' | 'story_dynamic' | 'story_dynamic_and_due';
    playerInput?: string;
    动态世界线索?: string[];
    到期摘要?: string[];
    force?: boolean;
    applyCommands?: boolean;
    currentResponse?: GameResponse;
    stateBase?: Partial<响应命令处理状态>;
    signal?: AbortSignal;
    onStreamDelta?: (delta: string, accumulated: string) => void;
};

export type 世界演变执行结果 = {
    ok: boolean;
    phase: 'done' | 'error' | 'skipped';
    commands: any[];
    updates: string[];
    rawText: string;
    statusText: string;
};

type 世界演变依赖 = {
    apiSettings: 接口设置结构;
    gameConfig: any;
    角色: any;
    环境: 环境信息结构;
    世界: 世界数据结构;
    社交: any[];
    剧情: 剧情系统结构;
    记忆系统: 记忆系统结构;
    历史记录: 聊天记录结构[];
    prompts: 提示词结构[];
    开局配置?: OpeningConfig;
    worldbooks: 世界书结构[];
    叙事平静值?: 叙事状态结构;
    叙事平静值配置?: 叙事平静值配置结构;
    世界演变进行中Ref: { current: boolean };
    世界演变去重签名Ref: { current: string };
    已进入主剧情回合: () => boolean;
    按回合窗口裁剪历史: (history: 聊天记录结构[], rounds: number) => 聊天记录结构[];
    规范化环境信息: (envLike?: any) => 环境信息结构;
    规范化世界状态: (raw?: any) => 世界数据结构;
    规范化剧情状态: (raw?: any, envLike?: any) => 剧情系统结构;
    processResponseCommands: (
        response: any,
        baseState?: Partial<响应命令处理状态>,
        options?: { applyState?: boolean }
    ) => 响应命令处理状态;
    setWorldEvents: (value: string[] | ((prev: string[]) => string[])) => void;
    set世界演变更新中: (value: boolean) => void;
    set世界演变状态文本: (value: string) => void;
    // 注意：最近更新时间使用“游戏内时间戳（canonical string）”，不使用 Date.now()。
    set世界演变最近更新时间: (value: string | null) => void;
    set世界演变最近摘要: (value: string[]) => void;
    set世界演变最近原始消息: (value: string) => void;
    追加系统消息: (message: string, options?: { position?: 'tail' | 'after_last_turn' }) => void;
};

const 提取响应完整正文文本 = (response?: GameResponse): string => {
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    return logs
        .map((item) => `${item?.sender || '旁白'}：${item?.text || ''}`.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
};

const 序列化上下文命令 = (commands: any[]): string => (
    (Array.isArray(commands) ? commands : [])
        .map((cmd, index) => {
            const action = typeof cmd?.action === 'string' ? cmd.action : 'set';
            const key = typeof cmd?.key === 'string' ? cmd.key : '';
            if (!key.trim()) return '';
            if (action === 'delete') return `#${index + 1} delete ${key}`;
            try {
                return `#${index + 1} ${action} ${key} = ${JSON.stringify(cmd?.value ?? null)}`;
            } catch {
                return `#${index + 1} ${action} ${key} = ${String(cmd?.value ?? null)}`;
            }
        })
        .filter(Boolean)
        .join('\n')
);

const 世界演变请求超时毫秒 = 90000;

const 创建世界演变超时错误 = (timeoutMs = 世界演变请求超时毫秒): Error => {
    const error = new Error(`世界演变请求超时（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒）`);
    error.name = 'TimeoutError';
    return error;
};

const 创建世界演变中断错误 = (): DOMException => new DOMException('世界演变请求已取消', 'AbortError');

const 检查世界演变中断 = (signal?: AbortSignal): void => {
    if (signal?.aborted) {
        const reason = signal.reason;
        if (reason instanceof Error || reason instanceof DOMException) throw reason;
        throw 创建世界演变中断错误();
    }
};

const 执行世界演变带超时 = async <T,>(
    task: (signal: AbortSignal, 重置为完整预算: () => void) => Promise<T>,
    parentSignal?: AbortSignal,
    timeoutMs = 世界演变请求超时毫秒
): Promise<T> => {
    检查世界演变中断(parentSignal);
    const controller = new AbortController();
    let timer: number | undefined;
    const startedAt = Date.now();
    let rejectAbort: ((reason?: any) => void) | null = null;
    let rejectTimeout: ((reason?: any) => void) | null = null;
    const 重置为完整预算 = () => {
        // 降级非流式重试前重新计满：计时器从流式请求发起就开始走，
        // 流式阶段耗掉的预算会让重试几乎必然超时。
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            controller.abort();
            rejectTimeout?.(创建世界演变超时错误(timeoutMs));
        }, timeoutMs);
    };
    const abortFromParent = () => {
        const reason = parentSignal?.reason || 创建世界演变中断错误();
        if (!controller.signal.aborted) controller.abort(reason);
        rejectAbort?.(reason);
    };
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    console.info('[性能诊断][世界演变] 模型请求开始', {
        timeoutMs
    });
    try {
        const value = await Promise.race([
            task(controller.signal, 重置为完整预算),
            new Promise<T>((_, reject) => {
                rejectTimeout = reject;
                重置为完整预算();
            }),
            new Promise<T>((_, reject) => {
                rejectAbort = reject;
            })
        ]);
        console.info('[性能诊断][世界演变] 模型请求完成', {
            elapsedMs: Date.now() - startedAt
        });
        return value;
    } catch (error: any) {
        console.warn('[性能诊断][世界演变] 模型请求失败', {
            elapsedMs: Date.now() - startedAt,
            name: error?.name || 'Error',
            message: error?.message || String(error || '')
        });
        throw error;
    } finally {
        if (timer !== undefined) {
            window.clearTimeout(timer);
        }
        parentSignal?.removeEventListener('abort', abortFromParent);
    }
};

export const 执行世界演变更新工作流 = async (
    params: 世界演变触发参数 | undefined,
    deps: 世界演变依赖
): Promise<世界演变执行结果> => {
    const triggerSource = params?.来源 || 'manual';
    const dynamicHints = (Array.isArray(params?.动态世界线索) ? params?.动态世界线索 : [])
        .map(item => (item || '').trim())
        .filter(Boolean);
    const 叙事平静值配置 = deps.叙事平静值配置;
    if (叙事平静值配置?.启用 && (deps.叙事平静值?.平静计数 ?? 0) >= 计算远处联动阈值(叙事平静值配置)) {
        const worldForHints = deps.规范化世界状态(deps.世界);
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数组 = (value: any) => (Array.isArray(value) ? value : []);
        const 远处候选 = [
            ...取数组(worldForHints?.待执行事件).filter((e: any) => (Number(e?.主角参与度) || 0) <= 0.2),
            ...取数组(worldForHints?.进行中事件).filter((e: any) => (Number(e?.主角参与度) || 0) <= 0.2)
        ].slice(0, 2);
        for (const e of 远处候选) {
            const 名 = 取文本(e?.事件名);
            const 展 = 取文本(e?.当前进展) || 取文本(e?.事件说明);
            if (名) dynamicHints.push(`叙事平静值较高，优先推进远处事件（不强拉主角）：${名}${展 ? `——${展}` : ''}`);
        }
    }
    const dueHints = (Array.isArray(params?.到期摘要) ? params?.到期摘要 : [])
        .map(item => (item || '').trim())
        .filter(Boolean);
    const worldApi = 获取世界演变接口配置(deps.apiSettings);
    if (!接口配置是否可用(worldApi)) {
        if (params?.force) {
            deps.set世界演变状态文本('世界演变模型未配置可用接口');
        }
        return { ok: false, phase: 'skipped', commands: [], updates: [], rawText: '', statusText: '世界演变模型未配置可用接口' };
    }

    if (deps.世界演变进行中Ref.current) {
        return { ok: false, phase: 'skipped', commands: [], updates: [], rawText: '', statusText: '世界演变更新中...' };
    }

    const worldRuntimeGameConfig = 规范化游戏设置(deps.gameConfig);
    const worldEvolutionTimeoutMs = 获取游玩请求超时毫秒(worldRuntimeGameConfig.游玩请求超时设置).firstResponseMs;

    const probe = 创建工作流性能诊断('世界演变', {
        timeoutMs: worldEvolutionTimeoutMs,
        triggerSource,
        dynamicHints: dynamicHints.length,
        dueHints: dueHints.length,
        historyCount: Array.isArray(deps.历史记录) ? deps.历史记录.length : 0,
        applyCommands: params?.applyCommands !== false
    });

    try {
        检查世界演变中断(params?.signal);
        deps.世界演变进行中Ref.current = true;
        deps.set世界演变更新中(true);
        deps.set世界演变状态文本('世界演变更新中...');

        const worldStateBase = params?.stateBase;
        const worldEnv = probe.time('规范化世界演变环境', () => deps.规范化环境信息(worldStateBase?.环境 || deps.环境));
        probe.mark('规范化游戏设置完成');
        const 启用修炼体系 = worldRuntimeGameConfig.启用修炼体系 !== false;
        const worldState = probe.time('规范化并裁剪世界状态', () => 裁剪修炼体系上下文数据(
            deps.规范化世界状态(worldStateBase?.世界 || deps.世界),
            worldRuntimeGameConfig
        ));
        const rawWorldStory = probe.time('规范化世界演变剧情状态', () => deps.规范化剧情状态(worldStateBase?.剧情 || deps.剧情, worldEnv));
        const worldPrompt = (() => {
            const hit = deps.prompts.find(item => item.id === 'core_world');
            return 按功能开关过滤提示词内容(typeof hit?.内容 === 'string' ? hit.内容.trim() : '', worldRuntimeGameConfig);
        })();
        const realmPrompt = (() => {
            if (!启用修炼体系) return '';
            const hit = deps.prompts.find(item => item.id === 'core_realm');
            const raw = typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
            return raw.includes('开局后此处会被完整替换') ? '' : raw;
        })();
        const worldEvolutionPrompt = (() => {
            const hit = deps.prompts.find(item => item.id === 'stat_world_evo');
            const fromPromptPool = typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
            if (fromPromptPool) return 按功能开关过滤提示词内容(fromPromptPool, worldRuntimeGameConfig);
            return 按功能开关过滤提示词内容(
                typeof 数值_世界演化.内容 === 'string' ? 数值_世界演化.内容.trim() : '',
                worldRuntimeGameConfig
            );
        })();
        const fandomPromptBundle = probe.time('构建同人运行时提示词包', () => 构建同人运行时提示词包({
            openingConfig: deps.开局配置,
            worldPrompt,
            realmPrompt
        }));
        const worldStory = rawWorldStory;
        const worldShortMemoryTexts = probe.time('提取短期记忆', () => (Array.isArray(规范化记忆系统(deps.记忆系统).短期记忆) ? 规范化记忆系统(deps.记忆系统).短期记忆 : [])
            .slice(-8)
            .map(item => (item || '').trim())
            .filter(Boolean));
        const worldHistory = deps.按回合窗口裁剪历史(deps.历史记录, 6);
        const worldScriptText = probe.time('构建世界演变历史剧本文本', () => formatHistoryToScript(worldHistory) || '暂无', {
            historyCount: Array.isArray(deps.历史记录) ? deps.历史记录.length : 0
        });
        const currentTurnBody = probe.time('提取当前回合正文', () => {
            const currentResponseBody = 提取响应完整正文文本(params?.currentResponse);
            if (currentResponseBody) return currentResponseBody;
            const history = Array.isArray(deps.历史记录) ? deps.历史记录 : [];
            for (let i = history.length - 1; i >= 0; i -= 1) {
                const item = history[i];
                if (item?.role !== 'assistant' || !item?.structuredResponse) continue;
                const body = 提取响应完整正文文本(item.structuredResponse);
                if (body) return body;
            }
            return '';
        });
        const currentTurnPlanText = probe.time('提取当前回合规划文本', () => {
            const currentResponsePlan = 提取响应规划文本(params?.currentResponse);
            if (currentResponsePlan) return currentResponsePlan;
            const history = Array.isArray(deps.历史记录) ? deps.历史记录 : [];
            for (let i = history.length - 1; i >= 0; i -= 1) {
                const item = history[i];
                if (item?.role !== 'assistant' || !item?.structuredResponse) continue;
                const plan = 提取响应规划文本(item.structuredResponse);
                if (plan) return plan;
            }
            return '';
        });
        const currentTurnCommandsText = probe.time('序列化当前回合命令', () => 序列化上下文命令(params?.currentResponse?.tavern_commands || []), {
            commandCount: Array.isArray(params?.currentResponse?.tavern_commands) ? params.currentResponse.tavern_commands.length : 0
        });
        const playerInput = typeof params?.playerInput === 'string' ? params.playerInput.trim() : '';
        const envCanonical = 环境时间转标准串(worldStateBase?.环境 || deps.环境) || '';
        probe.mark('世界演变基础上下文准备完成', {
            playerInputLength: playerInput.length,
            scriptLength: worldScriptText.length,
            currentBodyLength: currentTurnBody.length,
            currentPlanLength: currentTurnPlanText.length,
            currentCommandsLength: currentTurnCommandsText.length,
            memoryCount: worldShortMemoryTexts.length
        });
        const signature = [
            triggerSource,
            envCanonical,
            playerInput,
            dynamicHints.join('|'),
            dueHints.join('|'),
            currentTurnBody,
            currentTurnPlanText,
            currentTurnCommandsText
        ].join('::');
        if (!params?.force && signature === deps.世界演变去重签名Ref.current) {
            probe.mark('跳过：重复世界演变任务');
            return { ok: false, phase: 'skipped', commands: [], updates: [], rawText: '', statusText: '相同世界演变任务已处理，已跳过。' };
        }
        deps.世界演变去重签名Ref.current = signature;

        await 后台让出主线程();
        检查世界演变中断(params?.signal);
        const genderEvolutionEnabled = (deps.开局配置?.modeRuntimeProfile?.性别比例演变预设 ?? worldRuntimeGameConfig.性别比例自动演变 ?? false) === true;
        const worldContextPayload = {
            worldPrompt,
            worldEvolutionPrompt,
            envData: worldEnv,
            worldData: worldState,
            npcData: (() => {
                const active = Array.isArray(worldState?.活跃NPC列表) ? worldState.活跃NPC列表 : [];
                const social = Array.isArray(worldStateBase?.社交) ? worldStateBase.社交 : deps.社交;
                return active.map((item: any) => {
                    const npcId = typeof item?.npcId === 'string' ? item.npcId.trim() : '';
                    const name = typeof item?.姓名 === 'string' ? item.姓名.replace(/^\[女主\]/, '').trim() : '';
                    const match = findNpcIndex(social, { npcId, 姓名: name });
                    const npc = match.index >= 0 ? social[match.index] : undefined;
                    if (!npc) return { npcId, 姓名: name, 档案状态: '未唯一匹配' };
                    return {
                        npcId: npc?.id || npcId,
                        姓名: npc?.姓名 || name,
                        境界: npc?.境界,
                        境界层级: npc?.境界层级,
                        能力体系: npc?.能力体系,
                        当前装备: npc?.当前装备,
                        背包: npc?.背包
                    };
                });
            })(),
            storyData: worldStory,
            shortMemoryTexts: worldShortMemoryTexts,
            scriptText: worldScriptText,
            playerInput,
            currentTurnBody,
            currentTurnPlanText,
            currentTurnCommandsText,
            currentGameTime: 环境时间转标准串(worldEnv) || '',
            dynamicHints,
            dueHints,
            genderEvolutionEnabled
        };
        const worldContext = await probe.timeAsync('构建世界演变上下文文本(worker)', () => 执行游戏后台重计算<string>(
            'buildWorldEvolutionContext',
            worldContextPayload,
            () => 后台分段执行(() => 构建世界演变上下文文本(worldContextPayload))
        ), {
            dynamicHints: dynamicHints.length,
            dueHints: dueHints.length
        });
        检查世界演变中断(params?.signal);
        const worldEvolutionWorldbookParams = {
            books: deps.worldbooks,
            scopes: ['world_evolution'],
            environment: worldEnv,
            world: worldState,
            history: worldHistory,
            extraTexts: [playerInput, currentTurnBody, currentTurnPlanText, currentTurnCommandsText, ...dynamicHints, ...dueHints]
        };
        const worldbookExtraPrompt = await probe.timeAsync('构建世界演变世界书注入(worker)', () => 执行游戏后台重计算<string>(
            'buildWorldbookText',
            {
                worldbookParams: worldEvolutionWorldbookParams,
                gameConfig: worldRuntimeGameConfig
            },
            () => 后台分段执行(() => 按功能开关过滤提示词内容(
                构建世界书注入文本(worldEvolutionWorldbookParams).combinedText,
                worldRuntimeGameConfig
            ))
        ), {
            worldbookCount: Array.isArray(deps.worldbooks) ? deps.worldbooks.length : 0
        });
        const novelDecompositionPrompt = await probe.timeAsync('构建世界演变小说拆分注入', async () => 按功能开关过滤提示词内容(await 获取激活小说拆分注入文本(
            deps.apiSettings,
            'world_evolution',
            deps.开局配置,
            worldStory,
            worldStateBase?.角色?.姓名 || deps.角色?.姓名 || ''
        ), worldRuntimeGameConfig));
        const worldExtraPrompt = [
            typeof worldRuntimeGameConfig.额外提示词 === 'string'
                ? 按功能开关过滤提示词内容(worldRuntimeGameConfig.额外提示词.trim(), worldRuntimeGameConfig)
                : '',
            worldbookExtraPrompt,
            novelDecompositionPrompt,
            按功能开关过滤提示词内容(fandomPromptBundle.同人设定摘要, worldRuntimeGameConfig),
            启用修炼体系 ? fandomPromptBundle.境界母板补丁 : '',
            获取繁体输出指令(worldRuntimeGameConfig)
        ]
            .filter(Boolean)
            .join('\n\n');
        const worldCotPseudoPrompt = worldRuntimeGameConfig.启用COT伪装注入 !== false
            ? 世界演变COT伪装历史消息提示词
            : '';
        const worldCotPrompt = 构建世界演变COT提示词({
            fandom: fandomPromptBundle.enabled,
            genderEvolution: genderEvolutionEnabled
        });
        const 独立世界演变GPT模式 = worldRuntimeGameConfig.独立APIGPT模式?.世界演变 === true;
        probe.mark('世界演变请求载荷准备完成', {
            worldContextLength: worldContext.length,
            extraPromptLength: worldExtraPrompt.length,
            cotPseudoLength: worldCotPseudoPrompt.length,
            cotPromptLength: worldCotPrompt.length,
            fandomEnabled: fandomPromptBundle.enabled
        });

        const 世界演变非流式输出 = worldRuntimeGameConfig.启用非流式输出
            || deps.apiSettings.功能模型占位?.世界演变非流式输出 === true;
        const 发起世界演变请求 = (signal: AbortSignal, streamOptions?: { stream?: boolean; onDelta?: (delta: string, accumulated: string) => void; onStreamEnd?: (info: any) => void }) => (
            textAIService.generateWorldEvolutionUpdate(
                worldContext,
                worldApi,
                signal,
                worldExtraPrompt,
                worldCotPseudoPrompt,
                worldCotPrompt,
                fandomPromptBundle.enabled,
                独立世界演变GPT模式,
                streamOptions
            )
        );
        /**
         * 世界演变的命令块被截断后往往仍能解析出部分合法命令，
         * 于是「世界只演变了一半」会被静默接受。走流式时校验结束标记，
         * 疑似被上游掐断就降级非流式重试一次（世界演变输出量小，重试成本可接受）。
         */
        const result = await probe.timeAsync('世界演变模型请求总耗时', () => 执行世界演变带超时(async (signal, 重置为完整预算) => {
            const 完整性结果 = await 执行带完整性校验的请求({
                功能名: '世界演变',
                强制非流式: 世界演变非流式输出 || !params.onStreamDelta,
                // 截断的命令块仍能解析出部分合法命令，直接合并就是「世界只演变了一半」。
                // 重试也失败时必须整体丢弃，走外层既有的失败态提示。
                重试失败处置: '抛出错误',
                重试前重置超时: 重置为完整预算,
                发起流式请求: (streamOptions) => 发起世界演变请求(signal, {
                    stream: true,
                    onDelta: params.onStreamDelta,
                    onStreamEnd: streamOptions.onStreamEnd
                }),
                发起非流式请求: () => 发起世界演变请求(signal),
                onFallback: (info) => {
                    if (info.重试失败) {
                        console.warn('[世界演变] 降级非流式重试仍失败，丢弃本次不完整结果', info);
                        return;
                    }
                    console.warn('[世界演变] 流式输出疑似被上游中断，降级为非流式重新生成', info);
                }
            });
            return 完整性结果.结果;
        }, params?.signal, worldEvolutionTimeoutMs), { timeoutMs: worldEvolutionTimeoutMs });
        检查世界演变中断(params?.signal);
        probe.mark('世界演变模型返回', {
            rawCommandCount: Array.isArray(result.commands) ? result.commands.length : 0,
            updatesCount: Array.isArray(result.updates) ? result.updates.length : 0,
            rawTextLength: typeof result.rawText === 'string' ? result.rawText.length : 0
        });
        await 后台让出主线程();
        检查世界演变中断(params?.signal);
        const normalizedCommands = await probe.timeAsync('规范化世界演变命令(worker)', () => 执行游戏后台重计算<any[]>(
            'normalizeWorldEvolutionCommands',
            { commands: result.commands as any },
            () => 后台分段执行(() => 规范化世界演变命令列表(result.commands as any))
        ));
        const rawCommandCount = Array.isArray(result.commands) ? result.commands.length : 0;
        const rawText = typeof result.rawText === 'string' ? result.rawText.trim() : '';

        const commandBaseState = params?.stateBase || {
            角色: deps.角色,
            环境: worldEnv,
            社交: deps.社交,
            世界: worldState,
            剧情: worldStory
        };
        const activeNpcDeletePattern = /^世界\.活跃NPC列表(?:\[\d+\]|\.)/;
        const commandsBeforeActiveNpcPruning = normalizedCommands.filter((command) => !(
            command.action === 'delete' && activeNpcDeletePattern.test(command.key)
        ));
        const stateBeforeActiveNpcPruning = commandsBeforeActiveNpcPruning.length > 0
            ? deps.processResponseCommands({ logs: [], tavern_commands: commandsBeforeActiveNpcPruning }, commandBaseState, { applyState: false })
            : commandBaseState;
        const simulatedWorldState = normalizedCommands.length > 0
            ? deps.processResponseCommands({ logs: [], tavern_commands: normalizedCommands }, commandBaseState, { applyState: false })
            : commandBaseState;
        const activeNpcsBeforePruning = Array.isArray((stateBeforeActiveNpcPruning as any)?.世界?.活跃NPC列表)
            ? (stateBeforeActiveNpcPruning as any).世界.活跃NPC列表
            : worldState.活跃NPC列表;
        const finalActiveNpcs = Array.isArray((simulatedWorldState as any)?.世界?.活跃NPC列表)
            ? (simulatedWorldState as any).世界.活跃NPC列表
            : worldState.活跃NPC列表;
        const settlementResult = buildNpcSettlementCommands({
            social: Array.isArray((simulatedWorldState as any)?.社交) ? (simulatedWorldState as any).社交 : deps.社交,
            activeNpcs: mergeNpcSettlementCandidates(activeNpcsBeforePruning, finalActiveNpcs)
        });
        const executableCommands = [...normalizedCommands, ...settlementResult.commands];
        if (settlementResult.rejections.length > 0) {
            probe.mark('NPC后台结算被拒绝', {
                count: settlementResult.rejections.length,
                reasons: settlementResult.rejections.slice(0, 6)
            });
        }

        if (executableCommands.length > 0) {
            await 后台让出主线程();
            检查世界演变中断(params?.signal);
            await 后台分段执行(() => probe.time('应用世界演变命令', () => deps.processResponseCommands(
                {
                    logs: [],
                    tavern_commands: executableCommands
                },
                commandBaseState,
                { applyState: params?.applyCommands !== false }
            ), {
                commandCount: executableCommands.length,
                applyState: params?.applyCommands !== false
            }));
        }

        const rawUpdates = probe.time('整理世界演变原始摘要', () => (Array.isArray(result.updates) ? result.updates : [])
            .map(item => item.trim())
            .filter(Boolean));
        const updates = probe.time('净化客户可见世界大事', () => 整理客户可见世界大事(rawUpdates, normalizedCommands), {
            rawUpdates: rawUpdates.length,
            commands: normalizedCommands.length
        });
        if (updates.length > 0) {
            await 后台让出主线程();
            probe.time('写入世界事件列表', () => deps.setWorldEvents(prev => [...updates, ...(Array.isArray(prev) ? prev : [])].slice(0, 30)), {
                updates: updates.length
            });
        }

        const updateSummary = updates.length > 0
            ? `世界演变完成：${updates[0]}`
            : rawCommandCount > 0 && normalizedCommands.length === 0
                ? `世界演变完成：命令路径无效（0/${rawCommandCount}）`
                : executableCommands.length > 0
                    ? (params?.applyCommands === false
                        ? `世界演变完成：已生成${executableCommands.length}条命令`
                        : `世界演变完成：已应用${executableCommands.length}条命令`)
                    : '世界演变检查完成：本回合无需更新';

        // 记录“游戏内时间”，而不是现实时间。
        const canonicalGameTime = 环境时间转标准串(worldEnv) || envCanonical || null;
        deps.set世界演变最近更新时间(canonicalGameTime);

        deps.set世界演变最近摘要(updates.slice(0, 8));
        deps.set世界演变最近原始消息(rawText);
        deps.set世界演变状态文本(updateSummary);
        probe.mark('世界演变状态写入完成', {
            normalizedCommands: normalizedCommands.length,
            updates: updates.length,
            statusTextLength: updateSummary.length
        });
        if (
            params?.applyCommands !== false
            && (triggerSource === 'manual' || triggerSource === 'auto_due' || triggerSource === 'story_dynamic' || triggerSource === 'story_dynamic_and_due')
            && (executableCommands.length > 0 || updates.length > 0)
        ) {
            // 插入到对应回合下方（最近一个 assistant structuredResponse 之后）。
            probe.time('追加世界演变系统消息', () => deps.追加系统消息(`[世界演变] ${updateSummary}`, { position: 'after_last_turn' }));
        }
        probe.mark('世界演变更新完成', {
            phase: executableCommands.length > 0 || updates.length > 0 ? 'done' : 'skipped'
        });
        return {
            ok: true,
            phase: executableCommands.length > 0 || updates.length > 0 ? 'done' : 'skipped',
            commands: executableCommands,
            updates,
            rawText,
            statusText: updateSummary
        };
    } catch (error: any) {
        const message = error?.name === 'AbortError'
            ? '世界演变请求已取消'
            : (error?.message || '世界演变更新失败');
        console.error('[世界演变] 更新失败', {
            name: error?.name || 'Error',
            message,
            status: error?.status
        });
        deps.set世界演变状态文本(message);
        if (error?.name === 'AbortError') {
            throw error;
        }
        if (params?.force || triggerSource === 'manual') {
            deps.追加系统消息(`[世界演变失败] ${message}`, { position: 'after_last_turn' });
        }
        return {
            ok: false,
            phase: 'error',
            commands: [],
            updates: [],
            rawText: '',
            statusText: message
        };
    } finally {
        probe.end('释放世界演变进行中标记');
        deps.世界演变进行中Ref.current = false;
        deps.set世界演变更新中(false);
    }
};
