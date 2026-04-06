import * as textAIService from '../../services/ai/text';
import type { GameResponse, OpeningConfig, 接口设置结构, 提示词结构, 剧情系统结构, 女主剧情规划结构, 记忆系统结构, 聊天记录结构, 环境信息结构, 世界数据结构, 世界书结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取世界演变接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 数值_世界演化 } from '../../prompts/stats/world';
import { 规范化记忆系统 } from './memoryUtils';
import { formatHistoryToScript } from './historyUtils';
import { 构建世界演变COT提示词, 世界演变COT伪装历史消息提示词 } from '../../prompts/runtime/worldEvolutionCot';
import { 环境时间转标准串 } from './timeUtils';
import { 构建世界演变上下文文本, 规范化世界演变命令列表 } from './worldEvolutionUtils';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';
import { 提取响应规划文本 } from './thinkingContext';

export type 世界演变触发参数 = {
    来源?: 'manual' | 'auto_due' | 'story_dynamic' | 'story_dynamic_and_due';
    动态世界线索?: string[];
    到期摘要?: string[];
    force?: boolean;
    applyCommands?: boolean;
    currentResponse?: GameResponse;
    stateBase?: Partial<响应命令处理状态>;
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
    剧情: 剧情系统结构;
    记忆系统: 记忆系统结构;
    历史记录: 聊天记录结构[];
    prompts: 提示词结构[];
    开局配置?: OpeningConfig;
    worldbooks: 世界书结构[];
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

export const 执行世界演变更新工作流 = async (
    params: 世界演变触发参数 | undefined,
    deps: 世界演变依赖
): Promise<世界演变执行结果> => {
    const triggerSource = params?.来源 || 'manual';
    const dynamicHints = (Array.isArray(params?.动态世界线索) ? params?.动态世界线索 : [])
        .map(item => (item || '').trim())
        .filter(Boolean);
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

    try {
        deps.世界演变进行中Ref.current = true;
        deps.set世界演变更新中(true);
        deps.set世界演变状态文本('世界演变更新中...');

        const worldStateBase = params?.stateBase;
        const worldEnv = deps.规范化环境信息(worldStateBase?.环境 || deps.环境);
        const worldRuntimeGameConfig = 规范化游戏设置(deps.gameConfig);
        const 启用修炼体系 = worldRuntimeGameConfig.启用修炼体系 !== false;
        const worldState = 裁剪修炼体系上下文数据(
            deps.规范化世界状态(worldStateBase?.世界 || deps.世界),
            worldRuntimeGameConfig
        );
        const rawWorldStory = deps.规范化剧情状态(worldStateBase?.剧情 || deps.剧情, worldEnv);
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
        const fandomPromptBundle = 构建同人运行时提示词包({
            openingConfig: deps.开局配置,
            worldPrompt,
            realmPrompt
        });
        const worldStory = rawWorldStory;
        const worldShortMemoryTexts = (Array.isArray(规范化记忆系统(deps.记忆系统).短期记忆) ? 规范化记忆系统(deps.记忆系统).短期记忆 : [])
            .slice(-8)
            .map(item => (item || '').trim())
            .filter(Boolean);
        const worldScriptText = formatHistoryToScript(deps.按回合窗口裁剪历史(deps.历史记录, 6)) || '暂无';
        const currentTurnBody = (() => {
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
        })();
        const currentTurnPlanText = (() => {
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
        })();
        const currentTurnCommandsText = 序列化上下文命令(params?.currentResponse?.tavern_commands || []);
        const envCanonical = 环境时间转标准串(worldStateBase?.环境 || deps.环境) || '';
        const signature = [
            triggerSource,
            envCanonical,
            dynamicHints.join('|'),
            dueHints.join('|'),
            currentTurnBody,
            currentTurnPlanText,
            currentTurnCommandsText
        ].join('::');
        if (!params?.force && signature === deps.世界演变去重签名Ref.current) {
            return { ok: false, phase: 'skipped', commands: [], updates: [], rawText: '', statusText: '相同世界演变任务已处理，已跳过。' };
        }
        deps.世界演变去重签名Ref.current = signature;

        const worldContext = 构建世界演变上下文文本({
            worldPrompt,
            worldEvolutionPrompt,
            envData: worldEnv,
            worldData: worldState,
            storyData: worldStory,
            shortMemoryTexts: worldShortMemoryTexts,
            scriptText: worldScriptText,
            currentTurnBody,
            currentTurnPlanText,
            currentTurnCommandsText,
            currentGameTime: 环境时间转标准串(worldEnv) || '',
            dynamicHints,
            dueHints
        });
        const worldbookExtraPrompt = 按功能开关过滤提示词内容(构建世界书注入文本({
            books: deps.worldbooks,
            scopes: ['world_evolution'],
            environment: worldEnv,
            world: worldState,
            history: deps.历史记录,
            extraTexts: [currentTurnPlanText, ...dynamicHints, ...dueHints]
        }).combinedText, worldRuntimeGameConfig);
        const novelDecompositionPrompt = 按功能开关过滤提示词内容(await 获取激活小说拆分注入文本(
            deps.apiSettings,
            'world_evolution',
            deps.开局配置,
            worldStory,
            worldStateBase?.角色?.姓名 || deps.角色?.姓名 || ''
        ), worldRuntimeGameConfig);
        const worldExtraPrompt = [
            typeof worldRuntimeGameConfig.额外提示词 === 'string'
                ? 按功能开关过滤提示词内容(worldRuntimeGameConfig.额外提示词.trim(), worldRuntimeGameConfig)
                : '',
            worldbookExtraPrompt,
            novelDecompositionPrompt,
            按功能开关过滤提示词内容(fandomPromptBundle.同人设定摘要, worldRuntimeGameConfig),
            启用修炼体系 ? fandomPromptBundle.境界母板补丁 : ''
        ]
            .filter(Boolean)
            .join('\n\n');
        const worldCotPseudoPrompt = worldRuntimeGameConfig.启用COT伪装注入 !== false
            ? 世界演变COT伪装历史消息提示词
            : '';
        const worldCotPrompt = 构建世界演变COT提示词({
            fandom: fandomPromptBundle.enabled
        });
        const 独立世界演变GPT模式 = worldRuntimeGameConfig.独立APIGPT模式?.世界演变 === true;

        const result = await textAIService.generateWorldEvolutionUpdate(
            worldContext,
            worldApi,
            undefined,
            worldExtraPrompt,
            worldCotPseudoPrompt,
            worldCotPrompt,
            fandomPromptBundle.enabled,
            独立世界演变GPT模式
        );
        const normalizedCommands = 规范化世界演变命令列表(result.commands as any);
        const rawCommandCount = Array.isArray(result.commands) ? result.commands.length : 0;
        const rawText = typeof result.rawText === 'string' ? result.rawText.trim() : '';

        if (normalizedCommands.length > 0) {
            deps.processResponseCommands(
                {
                    logs: [],
                    tavern_commands: normalizedCommands
                },
                params?.stateBase,
                { applyState: params?.applyCommands !== false }
            );
        }

        const updates = (Array.isArray(result.updates) ? result.updates : [])
            .map(item => item.trim())
            .filter(Boolean);
        if (updates.length > 0) {
            deps.setWorldEvents(prev => [...updates, ...(Array.isArray(prev) ? prev : [])].slice(0, 30));
        }

        const updateSummary = updates.length > 0
            ? `世界演变完成：${updates[0]}`
            : rawCommandCount > 0 && normalizedCommands.length === 0
                ? `世界演变完成：命令路径无效（0/${rawCommandCount}）`
                : normalizedCommands.length > 0
                    ? (params?.applyCommands === false
                        ? `世界演变完成：已生成${normalizedCommands.length}条命令`
                        : `世界演变完成：已应用${normalizedCommands.length}条命令`)
                    : '世界演变检查完成：本回合无需更新';

        // 记录“游戏内时间”，而不是现实时间。
        const canonicalGameTime = 环境时间转标准串(worldEnv) || envCanonical || null;
        deps.set世界演变最近更新时间(canonicalGameTime);

        deps.set世界演变最近摘要(updates.slice(0, 8));
        deps.set世界演变最近原始消息(rawText);
        deps.set世界演变状态文本(updateSummary);
        if (
            params?.applyCommands !== false
            && (triggerSource === 'manual' || triggerSource === 'auto_due' || triggerSource === 'story_dynamic' || triggerSource === 'story_dynamic_and_due')
            && (normalizedCommands.length > 0 || updates.length > 0)
        ) {
            // 插入到对应回合下方（最近一个 assistant structuredResponse 之后）。
            deps.追加系统消息(`[世界演变] ${updateSummary}`, { position: 'after_last_turn' });
        }
        return {
            ok: true,
            phase: normalizedCommands.length > 0 || updates.length > 0 ? 'done' : 'skipped',
            commands: normalizedCommands,
            updates,
            rawText,
            statusText: updateSummary
        };
    } catch (error: any) {
        const message = error?.message || '世界演变更新失败';
        deps.set世界演变状态文本(message);
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
        deps.世界演变进行中Ref.current = false;
        deps.set世界演变更新中(false);
    }
};
