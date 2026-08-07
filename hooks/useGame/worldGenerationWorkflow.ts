import * as textAIService from '../../services/ai/text';
import * as dbService from '../../services/dbService';
import type { OpeningConfig, WorldGenConfig, 角色数据结构, 提示词结构, 聊天记录结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取主剧情接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 构建世界观种子提示词, 构建世界生成任务上下文提示词 } from '../../prompts/runtime/worldSetup';
import { 世界观生成COT提示词, 世界观生成COT伪装历史消息提示词 } from '../../prompts/runtime/worldGenerationCot';
import { 构建模式包世界观叙事约束 } from '../../prompts/runtime/worldGenerationRuntimeConstraints';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 核心_境界体系 } from '../../prompts/core/realm';
import { 设置键 } from '../../utils/settingsSchema';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 获取繁体输出指令 } from '../../utils/traditionalChinese';
import { 按功能开关过滤提示词内容 } from '../../utils/promptFeatureToggles';
import { 构建题材默认境界体系提示词, 题材是否使用默认现代境界 } from '../../utils/topicRealmDefaults';
import { 构建开局运行时快照 } from '../../utils/customNewGamePresets';
import { 是否官方题材世界观口径提示词, 是否官方题材境界口径提示词 } from '../../data/workshopThemes/topicModeThemeData';
import { recordDiagnosticLog } from '../../services/diagnosticLog';
import { 合并世界基底到开场状态 } from './storyState';

type 世界生成选项 = {
    清空前端变量?: boolean;
    // 快速重开/重 roll 标记：提示词池基线的恢复在 sessionLifecycle 包装层完成，此处仅透传
    重开恢复基线?: boolean;
};

type 世界生成工作流依赖 = {
    apiConfig: any;
    gameConfig: any;
    prompts: 提示词结构[];
    view: 'home' | 'game' | 'new_game';
    setView: (value: 'home' | 'game' | 'new_game') => void;
    setPrompts: (value: 提示词结构[]) => void;
    setLoading: (value: boolean) => void;
    setShowSettings: (value: boolean) => void;
    设置历史记录: (value: 聊天记录结构[] | ((prev: 聊天记录结构[]) => 聊天记录结构[])) => void;
    设置开局配置: (value: OpeningConfig | undefined) => void;
    设置最近开局配置: (value: any) => void;
    清空重Roll快照: () => void;
    重置自动存档状态: () => void;
    创建开场基础状态: (charData: 角色数据结构, worldConfig: WorldGenConfig, openingConfig?: OpeningConfig) => any;
    构建前端清空开场状态: (baseState: any) => any;
    应用开场基态: (baseState: any) => void;
    创建开场命令基态: (openingBase?: any) => any;
    执行开场剧情生成: (
        contextData: any,
        promptSnapshot: 提示词结构[],
        useStreaming: boolean,
        apiForOpening: 当前可用接口结构,
        options?: { 命令基态?: any; 开局额外要求?: string; 开局配置?: OpeningConfig }
    ) => Promise<void>;
    追加系统消息: (message: string) => void;
    替换流式草稿为失败提示: (history: 聊天记录结构[], errorMessage: string) => 聊天记录结构[];
};

const 世界观阶段超时毫秒 = 300000;
const 境界阶段超时毫秒 = 300000;
const 开局流式预览最小间隔毫秒 = 700;

export const 选择开局境界体系来源 = (params: {
    启用修炼体系: boolean;
    手动境界提示词?: string;
    是仙侠题材: boolean;
    题材模式?: unknown;
    启用同人境界: boolean;
}): 'disabled' | 'manual' | 'xianxia_default' | 'topic_default' | 'fandom' | 'core_default' => {
    if (!params.启用修炼体系) return 'disabled';
    if ((params.手动境界提示词 || '').trim()) return 'manual';
    if (params.是仙侠题材) return 'xianxia_default';
    if (题材是否使用默认现代境界(params.题材模式)) return 'topic_default';
    if (params.启用同人境界) return 'fandom';
    return 'core_default';
};

const 开局阶段是否使用流式请求 = (apiConfig: 当前可用接口结构): boolean => {
    const supplier = (apiConfig.供应商 || '').toLowerCase();
    const baseUrl = (apiConfig.baseUrl || '').toLowerCase();
    const model = (apiConfig.model || '').toLowerCase();
    if (supplier === 'zhipu') return false;
    if (baseUrl.includes('open.bigmodel.cn') || baseUrl.includes('/api/paas/v4')) return false;
    if (model.includes('glm-')) return false;
    return true;
};

const 创建开局流式历史更新器 = (
    设置历史记录: 世界生成工作流依赖['设置历史记录']
) => {
    let lastFlushAt = 0;
    let pendingContent = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const 写入 = (content: string) => {
        设置历史记录(prev => prev.map(item => {
            if (
                item.role === 'assistant'
                && !item.structuredResponse
                && typeof item.content === 'string'
                && item.content.startsWith('【生成中】')
            ) {
                if (item.content === content) return item;
                return {
                    ...item,
                    content
                };
            }
            return item;
        }));
    };

    const 刷新 = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (!pendingContent) return;
        lastFlushAt = Date.now();
        const content = pendingContent;
        pendingContent = '';
        写入(content);
    };

    const 更新 = (content: string, options?: { immediate?: boolean }) => {
        pendingContent = content;
        if (options?.immediate) {
            刷新();
            return;
        }
        const elapsed = Date.now() - lastFlushAt;
        if (elapsed >= 开局流式预览最小间隔毫秒) {
            刷新();
            return;
        }
        if (!timer) {
            timer = setTimeout(刷新, Math.max(80, 开局流式预览最小间隔毫秒 - elapsed));
        }
    };

    const 停止 = () => {
        刷新();
    };

    return { 更新, 停止 };
};

const 创建阶段超时错误 = (stageLabel: string, timeoutMs: number, idleTimeout = false): Error => {
    const timeoutLabel = idleTimeout ? `无新输出超时` : `超时`;
    const error = new Error(`${stageLabel}${timeoutLabel}（${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒），请检查模型服务或稍后重试。`);
    error.name = 'TimeoutError';
    return error;
};

const 是否模式包题材片段 = (text: string): boolean => {
    const source = (text || '').trim();
    if (!source) return false;
    return (
        /【\s*(题材口径|模式专属世界书|世界规则|运行时模式配置)\s*】/.test(source)
        && !/<\s*世界观\s*>/i.test(source)
        && !/"world_prompt"\s*:/.test(source)
        && !/"worldPrompt"\s*:/.test(source)
    ) || 是否官方题材世界观口径提示词(source);
};

const 是否模式包能力片段 = (text: string): boolean => {
    const source = (text || '').trim();
    if (!source) return false;
    return (
        /【\s*(能力体系|运行时模式配置)\s*】/.test(source)
        && !/<\s*境界体系\s*>/i.test(source)
        && !/【\s*境界映射母板\s*】/.test(source)
    ) || 是否官方题材境界口径提示词(source);
};

const 执行带超时 = async <T,>(
    stageLabel: string,
    timeoutMs: number,
    task: (signal: AbortSignal, 标记活动: () => void) => Promise<T>,
    options?: { idleTimeout?: boolean }
): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutError = 创建阶段超时错误(stageLabel, timeoutMs, options?.idleTimeout === true);
    const 启动计时 = (reject: (reason?: any) => void) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            if (!controller.signal.aborted) {
                controller.abort(timeoutError);
            }
            reject(timeoutError);
        }, timeoutMs);
    };
    try {
        let rejectTimeout: ((reason?: any) => void) | null = null;
        const 标记活动 = () => {
            if (options?.idleTimeout && rejectTimeout) {
                启动计时(rejectTimeout);
            }
        };
        return await Promise.race([
            task(controller.signal, 标记活动),
            new Promise<T>((_, reject) => {
                rejectTimeout = reject;
                启动计时(reject);
            })
        ]);
    } catch (error: any) {
        if (controller.signal.aborted && controller.signal.reason === timeoutError) {
            throw timeoutError;
        }
        throw error;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
};

export const 执行世界生成工作流 = async (
    worldConfig: WorldGenConfig,
    charData: 角色数据结构,
    openingConfig: OpeningConfig | undefined,
    mode: 'all' | 'step',
    _openingStreaming: boolean,
    openingExtraPrompt: string,
    options: 世界生成选项 | undefined,
    deps: 世界生成工作流依赖
): Promise<void> => {
    const 写入或插入提示词 = (
        promptPool: 提示词结构[],
        promptId: string,
        fallbackPrompt: 提示词结构,
        content: string
    ): 提示词结构[] => {
        const next = {
            ...(promptPool.find((item) => item.id === promptId) || fallbackPrompt),
            id: promptId,
            内容: content,
            启用: true
        };
        return promptPool.some((item) => item.id === promptId)
            ? promptPool.map((item) => item.id === promptId ? next : item)
            : [...promptPool, next];
    };

    const openingStreaming = _openingStreaming !== false;
    const normalizedGameConfig = 规范化游戏设置(deps.gameConfig);
    const 启用修炼体系 = normalizedGameConfig.启用修炼体系 !== false;
    const currentApi = 获取主剧情接口配置(deps.apiConfig);
    if (!接口配置是否可用(currentApi)) {
        deps.追加系统消息('[开局生成失败] 请先在设置中填写 API 地址/API Key，并选择主剧情使用模型。');
        deps.setShowSettings(true);
        return;
    }
    // [修复] 开局主剧情请求此前只看新游戏面板的“流式开场”开关与供应商判断，
    // 完全忽略设置里的全局“启用非流式输出”与分功能“主剧情非流式输出”。
    // 结果是玩家打开非流式后开局依旧走流式（尤其快速重开会沿用旧快照里的 openingStreaming）。
    // 这里与局内主剧情保持一致：任一非流式开关打开即强制非流式。
    const 开局强制非流式输出 = normalizedGameConfig.启用非流式输出 === true
        || deps.apiConfig?.功能模型占位?.主剧情非流式输出 === true;
    const openingRequestStreaming = openingStreaming
        && !开局强制非流式输出
        && 开局阶段是否使用流式请求(currentApi);

    const normalizedOpeningExtraPrompt = (openingExtraPrompt || '').trim();
    const normalizedOpeningConfig = openingConfig
        ? {
            ...openingConfig,
            runtimeSnapshot: 构建开局运行时快照({
                openingConfig,
                openingStreaming,
                openingExtraPrompt: normalizedOpeningExtraPrompt,
                openingExtraRequirement: openingConfig.runtimeSnapshot?.openingExtraRequirement,
                activeModuleExtraRules: openingConfig.runtimeSnapshot?.activeModuleExtraRules,
                mainStoryDirection: openingConfig.runtimeSnapshot?.mainStoryDirection,
                hiddenPlotPolicy: openingConfig.runtimeSnapshot?.hiddenPlotPolicy,
                modeWorldbooks: openingConfig.runtimeSnapshot?.modeWorldbooks,
                workshopSelection: openingConfig.runtimeSnapshot?.workshopSelection,
                modeBackgrounds: openingConfig.runtimeSnapshot?.modeBackgrounds,
                modeTalents: openingConfig.runtimeSnapshot?.modeTalents
            })
        }
        : undefined;
    deps.设置最近开局配置({
        worldConfig: JSON.parse(JSON.stringify(worldConfig)),
        charData: JSON.parse(JSON.stringify(charData)),
        openingConfig: normalizedOpeningConfig ? JSON.parse(JSON.stringify(normalizedOpeningConfig)) : undefined,
        openingStreaming,
        openingExtraPrompt: normalizedOpeningExtraPrompt
    });
    deps.设置开局配置(normalizedOpeningConfig ? JSON.parse(JSON.stringify(normalizedOpeningConfig)) : undefined);
    deps.清空重Roll快照();
    deps.重置自动存档状态();

    const effectiveOpeningConfig = normalizedOpeningConfig || openingConfig;
    let openingBase = deps.创建开场基础状态(charData, worldConfig, effectiveOpeningConfig);
    let clearedOpeningBase = options?.清空前端变量
        ? deps.构建前端清空开场状态(openingBase)
        : null;

    if (clearedOpeningBase) {
        deps.应用开场基态(clearedOpeningBase);
        if (deps.view !== 'game') {
            deps.setView('game');
        }
    }

    if (openingStreaming) {
        const worldStreamMarker = Date.now();
        deps.setView('game');
        deps.设置历史记录([
            {
                role: 'system',
                content: '系统: 正在生成数据，请稍候...',
                timestamp: worldStreamMarker
            },
            {
                role: 'assistant',
                content: '【生成中】准备连接模型...',
                timestamp: worldStreamMarker + 1
            }
        ]);
    }

    deps.setLoading(true);

    let worldStreamHeartbeat: ReturnType<typeof setInterval> | null = null;
    let worldDeltaReceived = false;
    let realmStreamHeartbeat: ReturnType<typeof setInterval> | null = null;
    let realmDeltaReceived = false;
    const 开局流式历史更新器 = openingStreaming
        ? 创建开局流式历史更新器(deps.设置历史记录)
        : null;
    try {
        const worldPromptSeed = 按功能开关过滤提示词内容(
            构建世界观种子提示词(worldConfig, charData, effectiveOpeningConfig),
            normalizedGameConfig
        );
        const difficulty = worldConfig.difficulty || 'normal';
        const normalizedManualWorldPrompt = typeof worldConfig.manualWorldPrompt === 'string'
            ? worldConfig.manualWorldPrompt.trim()
            : '';
        const manualWorldPromptIsModePackageFragment = 是否模式包题材片段(normalizedManualWorldPrompt);
        const normalizedManualRealmPrompt = typeof worldConfig.manualRealmPrompt === 'string'
            ? worldConfig.manualRealmPrompt.trim()
            : '';
        const manualRealmPromptIsModePackageFragment = 是否模式包能力片段(normalizedManualRealmPrompt);
        const useManualWorldPrompt = normalizedManualWorldPrompt.length > 0 && !manualWorldPromptIsModePackageFragment;
        const isXianxiaOpening = effectiveOpeningConfig?.题材模式 === '仙侠';
        const normalizedWorldExtraRequirement = [
            typeof worldConfig.worldExtraRequirement === 'string' ? worldConfig.worldExtraRequirement.trim() : '',
            manualWorldPromptIsModePackageFragment ? normalizedManualWorldPrompt : '',
            manualRealmPromptIsModePackageFragment ? normalizedManualRealmPrompt : '',
            // 势力数量约束
            typeof worldConfig.factionCount === 'number' && worldConfig.factionCount >= 3 && worldConfig.factionCount <= 15
                ? `【势力数量要求】本次开局必须生成恰好 ${worldConfig.factionCount} 个势力组织，不多不少。`
                : '',
            // 自定义势力预设
            typeof worldConfig.customFactions === 'string' && worldConfig.customFactions.trim()
                ? `【预设势力】以下势力由玩家预设，必须优先使用，不得替换或忽略：\n${worldConfig.customFactions.trim()}`
                : ''
        ].filter(Boolean).join('\n\n');
        const useWorldRefinement = !useManualWorldPrompt && normalizedWorldExtraRequirement.length > 0;
        const manualRealmPromptForFandomBundle = manualRealmPromptIsModePackageFragment ? '' : normalizedManualRealmPrompt;
        const initialFandomBundle = 构建同人运行时提示词包({
            openingConfig: effectiveOpeningConfig,
            realmPrompt: manualRealmPromptForFandomBundle || undefined
        });
        const fandomEnabled = initialFandomBundle.enabled;
        let realmPromptContent = 启用修炼体系
            ? (fandomEnabled ? '' : (initialFandomBundle.境界母板补丁 || 核心_境界体系.内容))
            : '';
        const realmPromptSource = 选择开局境界体系来源({
            启用修炼体系,
            手动境界提示词: manualRealmPromptIsModePackageFragment ? '' : normalizedManualRealmPrompt,
            是仙侠题材: isXianxiaOpening,
            题材模式: effectiveOpeningConfig?.题材模式,
            启用同人境界: fandomEnabled
        });

        const promptPoolWithCoreRealm = 启用修炼体系 && deps.prompts.some((item) => item.id === 核心_境界体系.id)
            ? deps.prompts
            : (启用修炼体系 ? [...deps.prompts, { ...核心_境界体系 }] : deps.prompts);
        const updatedPromptsBase = promptPoolWithCoreRealm.map(prompt => {
            if (prompt.id === 'core_world') {
                return { ...prompt, 内容: worldPromptSeed };
            }
            if (prompt.类型 === '难度设定') {
                return { ...prompt, 启用: prompt.id.endsWith(`_${difficulty}`) };
            }
            return prompt;
        });
        let updatedPrompts = updatedPromptsBase;

        const enabledDifficultyPrompts = updatedPrompts
            .filter(prompt => prompt.类型 === '难度设定' && prompt.启用)
            .map(prompt => 按功能开关过滤提示词内容(`【${prompt.标题}】\n${prompt.内容}`, normalizedGameConfig))
            .join('\n\n');

        const worldGenerationCotPseudoPrompt = 世界观生成COT伪装历史消息提示词;

        if (realmPromptSource === 'manual') {
            if (openingStreaming) {
                开局流式历史更新器?.更新('【生成中】校验手动境界提示词...', { immediate: true });
            }
            realmPromptContent = textAIService.解析境界体系提示词内容(normalizedManualRealmPrompt);
        } else if (realmPromptSource === 'xianxia_default') {
            if (openingStreaming) {
                开局流式历史更新器?.更新('【生成中】加载固定仙侠境界体系...', { immediate: true });
            }
            realmPromptContent = initialFandomBundle.境界母板补丁 || 核心_境界体系.内容;
        } else if (realmPromptSource === 'topic_default') {
            if (openingStreaming) {
                开局流式历史更新器?.更新('【生成中】加载题材专属境界体系...', { immediate: true });
            }
            realmPromptContent = 构建题材默认境界体系提示词(effectiveOpeningConfig?.题材模式) || 核心_境界体系.内容;
        } else if (realmPromptSource === 'fandom') {
            if (openingStreaming) {
                开局流式历史更新器?.更新('【生成中】同人境界体系生成...', { immediate: true });
                let pulse = 0;
                realmStreamHeartbeat = setInterval(() => {
                    if (realmDeltaReceived) return;
                    pulse = (pulse + 1) % 4;
                    const dots = '.'.repeat(pulse) || '.';
                    开局流式历史更新器?.更新(`【生成中】同人境界体系生成${dots}`);
                }, 420);
            }

            realmPromptContent = await 执行带超时('同人境界体系生成', 境界阶段超时毫秒, (signal, 标记活动) => textAIService.generateFandomRealmData(
                {
                    openingConfig: effectiveOpeningConfig
                },
                currentApi,
                openingRequestStreaming
                    ? {
                        stream: true,
                        onDelta: (_delta, accumulated) => {
                            标记活动();
                            realmDeltaReceived = true;
                            const normalized = (accumulated || '').replace(/\r/g, '');
                            const tail = normalized.length > 420
                                ? `...${normalized.slice(-420)}`
                                : normalized;
                            const preview = tail.split('\n').slice(-10).join('\n').trim();
                            开局流式历史更新器?.更新(`【生成中】同人境界体系生成（流式预览）\n${preview || '...'}\n\n已接收 ${normalized.length} 字符`);
                        }
                    }
                    : undefined,
                normalizedWorldExtraRequirement
                    ? `【玩家世界观草稿与细化要求】\n${normalizedWorldExtraRequirement}\n- 必须优先保留玩家已写明的世界事实，并在此基础上细化，不得自顾自另起炉灶。`
                    : '',
                signal
            ), { idleTimeout: openingRequestStreaming });
            if (realmStreamHeartbeat) clearInterval(realmStreamHeartbeat);
            开局流式历史更新器?.停止();
        }

        updatedPrompts = 启用修炼体系
            ? 写入或插入提示词(
                updatedPromptsBase,
                核心_境界体系.id,
                核心_境界体系,
                realmPromptContent
            )
            : updatedPromptsBase.filter((prompt) => prompt.id !== 核心_境界体系.id);
        deps.setPrompts(updatedPrompts);
        await dbService.保存设置(设置键.提示词池, updatedPrompts);

        const worldGenerationContext = 按功能开关过滤提示词内容(构建世界生成任务上下文提示词(
            worldPromptSeed,
            difficulty,
            enabledDifficultyPrompts,
            normalizedWorldExtraRequirement,
            effectiveOpeningConfig
        ), normalizedGameConfig);
        const fandomPromptBundle = 构建同人运行时提示词包({
            openingConfig: effectiveOpeningConfig,
            realmPrompt: realmPromptContent
        });
        const modeNarrativeWorldConstraint = 构建模式包世界观叙事约束(
            effectiveOpeningConfig?.runtimeSnapshot
        );
        const worldGenerationExtraPrompt = 按功能开关过滤提示词内容([
            世界观生成COT提示词,
            fandomPromptBundle.世界观创建补丁,
            modeNarrativeWorldConstraint,
            启用修炼体系 && (fandomEnabled || isXianxiaOpening)
                ? [
                    isXianxiaOpening ? '【已固定仙侠境界体系参考】' : '【已生成同人境界体系参考】',
                    isXianxiaOpening
                        ? '- 仙侠境界体系由项目内置固定映射提供；world_prompt 的力量常识、高手稀缺度、强弱断层与术语口径必须跟随这份体系，不得回退默认武侠术语或自行生成新境界。'
                        : '- 同人境界体系已在本阶段先生成完成；world_prompt 的力量常识、高手稀缺度、强弱断层与术语口径必须跟随这份体系，不得回退默认现体系。',
                    '- 生成 world_prompt 时只提炼概述级境界与力量边界，不得把完整映射、阶段推进表或大境突破表原样抄回世界观正文。',
                    realmPromptContent
                ].join('\n')
                : '',
            isXianxiaOpening
                ? '【仙侠境界污染防护】\n- 当前存档固定使用炼气、筑基、金丹、元婴、化神等修真境界口径；不得使用斗气/斗者/斗师/斗王/斗皇/斗宗/斗尊等斗气体系术语作为境界、势力等级或成长主轴。\n- 如果玩家草稿、模式包片段或外部资料里出现斗气体系词汇，只能视为禁止项或反例，不得混入 world_prompt。'
                : '',
            normalizedWorldExtraRequirement ? `【玩家世界观草稿与细化要求】\n${normalizedWorldExtraRequirement}\n- 必须优先保留玩家已写明的事实、地名、势力、时代、规则和禁忌。\n- 生成时只补全缺口、细化因果、补齐长期运行结构，不得推翻、绕开或替换玩家草稿。` : '',
            获取繁体输出指令(normalizedGameConfig)
        ]
            .filter(Boolean)
            .join('\n\n')
            .trim(), normalizedGameConfig);

        if (openingStreaming) {
            开局流式历史更新器?.更新(
                useManualWorldPrompt ? '【生成中】校验手动世界观提示词...' : useWorldRefinement ? '【生成中】AI 细化世界观...' : '【生成中】AI 生成世界观...',
                { immediate: true }
            );
            if (!useManualWorldPrompt) {
                let pulse = 0;
                worldStreamHeartbeat = setInterval(() => {
                    if (worldDeltaReceived) return;
                    pulse = (pulse + 1) % 4;
                    const dots = '.'.repeat(pulse) || '.';
                    开局流式历史更新器?.更新(`【生成中】${useWorldRefinement ? 'AI 细化世界观' : 'AI 生成世界观'}${dots}`);
                }, 420);
            }
        }

        const generatedWorldResult = useManualWorldPrompt
            ? {
                worldPrompt: textAIService.解析世界观提示词内容(normalizedManualWorldPrompt),
                mapLayers: [],
                factions: [],
                rawText: normalizedManualWorldPrompt
            }
            : await 执行带超时(useWorldRefinement ? 'AI 细化世界观' : 'AI 生成世界观', 世界观阶段超时毫秒, (signal, 标记活动) => textAIService.generateWorldFoundationData(
                worldGenerationContext,
                charData,
                currentApi,
                openingRequestStreaming
                    ? {
                        stream: true,
                        onDelta: (_delta, accumulated) => {
                            标记活动();
                            worldDeltaReceived = true;
                            const normalized = (accumulated || '').replace(/\r/g, '');
                            const tail = normalized.length > 480
                                ? `...${normalized.slice(-480)}`
                                : normalized;
                            const preview = tail.split('\n').slice(-10).join('\n').trim();
                            开局流式历史更新器?.更新(`【生成中】${useWorldRefinement ? 'AI 细化世界观与世界基底' : 'AI 生成世界观与世界基底'}（流式预览）\n${preview || '...'}\n\n已接收 ${normalized.length} 字符`);
                        }
                    }
                    : undefined,
                worldGenerationExtraPrompt,
                worldGenerationCotPseudoPrompt,
                {
                    启用修炼体系,
                    openingConfig: effectiveOpeningConfig,
                    signal
                }
            ), { idleTimeout: openingRequestStreaming });
        if (worldStreamHeartbeat) clearInterval(worldStreamHeartbeat);
        开局流式历史更新器?.停止();

        const worldPromptContent = generatedWorldResult.worldPrompt?.trim() || worldPromptSeed;
        if (generatedWorldResult.mapLayers.length > 0 || generatedWorldResult.factions.length > 0) {
            openingBase = 合并世界基底到开场状态(openingBase, generatedWorldResult);
            if (clearedOpeningBase) {
                clearedOpeningBase = 合并世界基底到开场状态(clearedOpeningBase, generatedWorldResult);
                deps.应用开场基态(clearedOpeningBase);
            }
        }

        let finalPrompts = 写入或插入提示词(
            updatedPrompts,
            'core_world',
            updatedPrompts.find((prompt) => prompt.id === 'core_world') || updatedPrompts[0],
            worldPromptContent
        );
        if (启用修炼体系) {
            finalPrompts = 写入或插入提示词(
                finalPrompts,
                核心_境界体系.id,
                核心_境界体系,
                realmPromptContent
            );
        } else {
            finalPrompts = finalPrompts.filter((prompt) => prompt.id !== 核心_境界体系.id);
        }
        deps.setPrompts(finalPrompts);
        await dbService.保存设置(设置键.提示词池, finalPrompts);

        if (mode === 'step') {
            const frontendBase = options?.清空前端变量
                ? (clearedOpeningBase || deps.构建前端清空开场状态(openingBase))
                : openingBase;
            deps.应用开场基态(frontendBase);
            deps.setView('game');
            deps.setLoading(false);
            deps.追加系统消息(
                启用修炼体系
                    ? '[系统] 世界观与境界体系提示词已写入。请在聊天框输入指令开始初始化。'
                    : '[系统] 世界观提示词已写入。请在聊天框输入指令开始初始化。'
            );
            return;
        }

        await deps.执行开场剧情生成(
            openingBase,
            finalPrompts,
            openingRequestStreaming,
            currentApi,
            {
                命令基态: deps.创建开场命令基态(openingBase),
                开局额外要求: normalizedOpeningExtraPrompt,
                开局配置: effectiveOpeningConfig
            }
        );
        deps.setLoading(false);
    } catch (error: any) {
        if (worldStreamHeartbeat) clearInterval(worldStreamHeartbeat);
        if (realmStreamHeartbeat) clearInterval(realmStreamHeartbeat);
        开局流式历史更新器?.停止();
        recordDiagnosticLog('error', ['世界观生成失败', {
            message: error?.message || '',
            name: error?.name || typeof error,
            stack: typeof error?.stack === 'string' ? error.stack : undefined
        }]);
        console.error(error);
        const errorMessage = error?.message || '未知错误';
        deps.设置历史记录(prev => ([
            ...deps.替换流式草稿为失败提示(prev, errorMessage),
            {
                role: 'system',
                content: `[开局生成失败] ${errorMessage}\n可点击输入栏左侧闪电按钮“快速重开”立即重试，建角参数已保留。`,
                timestamp: Date.now()
            }
        ]));
        deps.setLoading(false);
    }
};
