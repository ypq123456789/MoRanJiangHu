import * as textAIService from '../../services/ai/text';
import * as dbService from '../../services/dbService';
import type { OpeningConfig, WorldGenConfig, 角色数据结构, 提示词结构, 聊天记录结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取主剧情接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 构建世界观种子提示词, 构建世界生成任务上下文提示词 } from '../../prompts/runtime/worldSetup';
import { 世界观生成COT提示词, 世界观生成COT伪装历史消息提示词 } from '../../prompts/runtime/worldGenerationCot';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 核心_境界体系 } from '../../prompts/core/realm';
import { 设置键 } from '../../utils/settingsSchema';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 按功能开关过滤提示词内容 } from '../../utils/promptFeatureToggles';

type 世界生成选项 = {
    清空前端变量?: boolean;
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
    创建开场基础状态: (charData: 角色数据结构, worldConfig: WorldGenConfig) => any;
    构建前端清空开场状态: (baseState: any) => any;
    应用开场基态: (baseState: any) => void;
    创建开场命令基态: (charData?: 角色数据结构) => any;
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

    const openingStreaming = true;
    const normalizedGameConfig = 规范化游戏设置(deps.gameConfig);
    const 启用修炼体系 = normalizedGameConfig.启用修炼体系 !== false;
    const currentApi = 获取主剧情接口配置(deps.apiConfig);
    if (!接口配置是否可用(currentApi)) {
        deps.追加系统消息('[开局生成失败] 请先在设置中填写 API 地址/API Key，并选择主剧情使用模型。');
        deps.setShowSettings(true);
        return;
    }

    const normalizedOpeningExtraPrompt = (openingExtraPrompt || '').trim();
    deps.设置最近开局配置({
        worldConfig: JSON.parse(JSON.stringify(worldConfig)),
        charData: JSON.parse(JSON.stringify(charData)),
        openingConfig: openingConfig ? JSON.parse(JSON.stringify(openingConfig)) : undefined,
        openingStreaming,
        openingExtraPrompt: normalizedOpeningExtraPrompt
    });
    deps.设置开局配置(openingConfig ? JSON.parse(JSON.stringify(openingConfig)) : undefined);
    deps.清空重Roll快照();
    deps.重置自动存档状态();

    const openingBase = deps.创建开场基础状态(charData, worldConfig);
    const clearedOpeningBase = options?.清空前端变量
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
    try {
        const worldPromptSeed = 按功能开关过滤提示词内容(
            构建世界观种子提示词(worldConfig, charData),
            normalizedGameConfig
        );
        const difficulty = worldConfig.difficulty || 'normal';
        const normalizedManualWorldPrompt = typeof worldConfig.manualWorldPrompt === 'string'
            ? worldConfig.manualWorldPrompt.trim()
            : '';
        const normalizedManualRealmPrompt = typeof worldConfig.manualRealmPrompt === 'string'
            ? worldConfig.manualRealmPrompt.trim()
            : '';
        const useManualWorldPrompt = normalizedManualWorldPrompt.length > 0;
        const useManualRealmPrompt = 启用修炼体系 && normalizedManualRealmPrompt.length > 0;
        const normalizedWorldExtraRequirement = typeof worldConfig.worldExtraRequirement === 'string'
            ? worldConfig.worldExtraRequirement.trim()
            : '';
        const initialFandomBundle = 构建同人运行时提示词包({ openingConfig });
        const fandomEnabled = initialFandomBundle.enabled;
        let realmPromptContent = 启用修炼体系
            ? (fandomEnabled ? '' : (initialFandomBundle.境界母板补丁 || 核心_境界体系.内容))
            : '';

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

        if (useManualRealmPrompt) {
            if (openingStreaming) {
                deps.设置历史记录(prev => prev.map(item => {
                    if (
                        item.role === 'assistant'
                        && !item.structuredResponse
                        && typeof item.content === 'string'
                        && item.content.startsWith('【生成中】')
                    ) {
                        return {
                            ...item,
                            content: '【生成中】校验手动境界提示词...'
                        };
                    }
                    return item;
                }));
            }
            realmPromptContent = textAIService.解析境界体系提示词内容(normalizedManualRealmPrompt);
        } else if (启用修炼体系 && fandomEnabled) {
            if (openingStreaming) {
                deps.设置历史记录(prev => prev.map(item => {
                    if (
                        item.role === 'assistant'
                        && !item.structuredResponse
                        && typeof item.content === 'string'
                        && item.content.startsWith('【生成中】')
                    ) {
                        return {
                            ...item,
                            content: '【生成中】同人境界体系生成...'
                        };
                    }
                    return item;
                }));
                let pulse = 0;
                realmStreamHeartbeat = setInterval(() => {
                    if (realmDeltaReceived) return;
                    pulse = (pulse + 1) % 4;
                    const dots = '.'.repeat(pulse) || '.';
                    deps.设置历史记录(prev => prev.map(item => {
                        if (
                            item.role === 'assistant'
                            && !item.structuredResponse
                            && typeof item.content === 'string'
                            && item.content.startsWith('【生成中】')
                        ) {
                            return {
                                ...item,
                                content: `【生成中】同人境界体系生成${dots}`
                            };
                        }
                        return item;
                    }));
                }, 420);
            }

            realmPromptContent = await textAIService.generateFandomRealmData(
                {
                    openingConfig
                },
                currentApi,
                openingStreaming
                    ? {
                        stream: true,
                        onDelta: (_delta, accumulated) => {
                            realmDeltaReceived = true;
                            const normalized = (accumulated || '').replace(/\r/g, '');
                            const tail = normalized.length > 420
                                ? `...${normalized.slice(-420)}`
                                : normalized;
                            const preview = tail.split('\n').slice(-10).join('\n').trim();
                            deps.设置历史记录(prev => prev.map(item => {
                                if (
                                    item.role === 'assistant'
                                    && !item.structuredResponse
                                    && typeof item.content === 'string'
                                    && item.content.startsWith('【生成中】')
                                ) {
                                    return {
                                        ...item,
                                        content: `【生成中】同人境界体系生成（流式预览）\n${preview || '...'}\n\n已接收 ${normalized.length} 字符`
                                    };
                                }
                                return item;
                            }));
                        }
                    }
                    : undefined,
                normalizedWorldExtraRequirement
                    ? `【世界观额外要求】\n${normalizedWorldExtraRequirement}`
                    : ''
            );
            if (realmStreamHeartbeat) clearInterval(realmStreamHeartbeat);
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
            normalizedWorldExtraRequirement
        ), normalizedGameConfig);
        const fandomPromptBundle = 构建同人运行时提示词包({
            openingConfig,
            realmPrompt: realmPromptContent
        });
        const worldGenerationExtraPrompt = 按功能开关过滤提示词内容([
            世界观生成COT提示词,
            fandomPromptBundle.世界观创建补丁,
            启用修炼体系 && fandomEnabled
                ? [
                    '【已生成同人境界体系参考】',
                    '- 同人境界体系已在本阶段先生成完成；world_prompt 的力量常识、高手稀缺度、强弱断层与术语口径必须跟随这份体系，不得回退默认现体系。',
                    '- 生成 world_prompt 时只提炼概述级境界与力量边界，不得把完整映射、阶段推进表或大境突破表原样抄回世界观正文。',
                    realmPromptContent
                ].join('\n')
                : '',
            normalizedWorldExtraRequirement ? `【世界观额外要求】\n${normalizedWorldExtraRequirement}` : ''
        ]
            .filter(Boolean)
            .join('\n\n')
            .trim(), normalizedGameConfig);

        if (openingStreaming) {
            deps.设置历史记录(prev => prev.map(item => {
                if (
                    item.role === 'assistant'
                    && !item.structuredResponse
                    && typeof item.content === 'string'
                    && item.content.startsWith('【生成中】')
                ) {
                    return {
                        ...item,
                        content: useManualWorldPrompt ? '【生成中】校验手动世界观提示词...' : '【生成中】世界观生成...'
                    };
                }
                return item;
            }));
            if (!useManualWorldPrompt) {
                let pulse = 0;
                worldStreamHeartbeat = setInterval(() => {
                    if (worldDeltaReceived) return;
                    pulse = (pulse + 1) % 4;
                    const dots = '.'.repeat(pulse) || '.';
                    deps.设置历史记录(prev => prev.map(item => {
                        if (
                            item.role === 'assistant'
                            && !item.structuredResponse
                            && typeof item.content === 'string'
                            && item.content.startsWith('【生成中】')
                        ) {
                            return {
                                ...item,
                                content: `【生成中】世界观生成${dots}`
                            };
                        }
                        return item;
                    }));
                }, 420);
            }
        }

        const generatedWorldPrompt = useManualWorldPrompt
            ? textAIService.解析世界观提示词内容(normalizedManualWorldPrompt)
            : await textAIService.generateWorldData(
                worldGenerationContext,
                charData,
                currentApi,
                openingStreaming
                    ? {
                        stream: true,
                        onDelta: (_delta, accumulated) => {
                            worldDeltaReceived = true;
                            const normalized = (accumulated || '').replace(/\r/g, '');
                            const tail = normalized.length > 480
                                ? `...${normalized.slice(-480)}`
                                : normalized;
                            const preview = tail.split('\n').slice(-10).join('\n').trim();
                            deps.设置历史记录(prev => prev.map(item => {
                                if (
                                    item.role === 'assistant'
                                    && !item.structuredResponse
                                    && typeof item.content === 'string'
                                    && item.content.startsWith('【生成中】')
                                ) {
                                    return {
                                        ...item,
                                        content: `【生成中】世界观生成（流式预览）\n${preview || '...'}\n\n已接收 ${normalized.length} 字符`
                                    };
                                }
                                return item;
                            }));
                        }
                    }
                    : undefined,
                worldGenerationExtraPrompt,
                worldGenerationCotPseudoPrompt,
                {
                    启用修炼体系
                }
            );
        if (worldStreamHeartbeat) clearInterval(worldStreamHeartbeat);

        const worldPromptContent = generatedWorldPrompt?.trim() || worldPromptSeed;

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
            openingStreaming,
            currentApi,
            {
                命令基态: deps.创建开场命令基态(),
                开局额外要求: normalizedOpeningExtraPrompt,
                开局配置: openingConfig
            }
        );
        deps.setLoading(false);
    } catch (error: any) {
        if (worldStreamHeartbeat) clearInterval(worldStreamHeartbeat);
        if (realmStreamHeartbeat) clearInterval(realmStreamHeartbeat);
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
