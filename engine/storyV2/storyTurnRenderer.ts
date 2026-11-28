import { 构建主剧情请求参数 } from '../../hooks/useGame/mainStoryRequest';
import { 规范化记忆配置 } from '../../hooks/useGame/memoryUtils';
import { 构建COT伪装提示词, 构建酒馆预设消息链, 酒馆预设模式可用 } from '../../hooks/useGame/promptRuntime';
import { 构建系统提示词 } from '../../hooks/useGame/systemPromptBuilder';
import { 环境时间转标准串 } from '../../hooks/useGame/timeUtils';
import { 核心_思维链 } from '../../prompts/core/cot';
import { 核心_开局思维链, 获取开局思维链提示词 } from '../../prompts/core/cotOpening';
import { 核心_境界体系 } from '../../prompts/core/realm';
import { 默认提示词 } from '../../prompts/index';
import { 构建开局配置提示词 } from '../../prompts/runtime/openingConfig';
import { 构建字数要求提示词 } from '../../prompts/runtime/protocolDirectives';
import { 构建真实世界模式提示词 } from '../../prompts/runtime/realWorldMode';
import { 构建剧情风格助手提示词 } from '../../prompts/runtime/storyStyles';
import { 规范化文本补全消息链, 请求模型文本, type 通用消息 } from '../../services/ai/chatCompletionClient';
import { StoryResponseParseError, parseStoryRawText } from '../../services/ai/storyResponseParser';
import type { GameResponse, 提示词结构 } from '../../types';
import { 提取叙事约束块 } from '../../utils/narrativeConstraint';
import { 按功能开关过滤提示词内容 } from '../../utils/promptFeatureToggles';
import { 过滤非场景世界书, 构建2_0写作规则池, 净化2_0酒馆预设 } from './promptFiltering';
import { 构建本回合导演简报, type SceneBriefOutput } from './sceneBriefBuilder';
import type { StoryV2Config, StoryV2EngineState } from './types';

export interface RenderedStoryTurn {
    response: GameResponse;
    rawText: string;
    briefOutput: SceneBriefOutput;
    elapsedMs: number;
    contextChars: number;
}

const V2_STORY_CONTRACT = [
    '【2.0 主剧情导演演出协议 · 必须严格遵守（覆盖任何旧预设习惯）】',
    '1. 你的职责是“严密因果与高张力舞台演出者”，而非散步流水账记叙者或机械降神爽文。',
    '2. 严格服从【2.0 剧情导演简报】与【信息隔离墙】：',
    '   - 严禁上帝视角跨墙/跨街切镜：只写主角当前身处位置、感官与视线可及的画面（例如隔窗传来的低喘或巷口逃客的一句传闻），绝不瞬移到上锁偏房内部或另一条街酒肆里单独写路人戏！',
    '   - 严禁未验证先知与廉价机械降神：主角若刚捡到未拆封信件/密令，在亲手拆看内容前绝不知道里面写了什么，也不能空口瞎编恰巧命中反派绝密（如圣子名称、私吞宗门灵石）；普通底层巡逻兵也不会平白怀揣顶级势力的最高保命密令让大敌一看就跪，凡威胁或交锋必须符合身份与既成事实！',
    '   - 埋伏笔时只展现自然可感的“表面载体细节”，绝对禁止旁白科普底层真相。',
    '3. 不写低价值重复劳动（砍柴/推车/重复擦汗），每次交锋都要推进真实利害、交换筹码或显露新裂痕；同时严禁替玩家主动做重大决定或输出 `<变量规划>`/`<剧情规划>`。',
    '4. 严格标签规范：',
    '   - 顶层标签：`<thinking>...</thinking>` -> `<正文>...</正文>` -> `<短期记忆>...</短期记忆>` -> `<行动选项>...</行动选项>`；',
    '   - `<正文>` 内对白标签必须是纯粹角色名如 `【杨培强】`、`【俞月荷】`，绝不允许写成 `【角色名：杨培强】`；物品/功法/秘籍引用统一用书名号 `《镇岳秘图》`，不要用尖括号 `<镇岳秘图>`；',
    '   - `<行动选项>` 严格输出 4~5 条纯正文内部策略抉择（如 `A.[策略标签] 具体动作`），严禁生成 `10` 条选项，严禁任何 `[视角切换]`、`[双线叙事]`、`[镜头转换]`、`[时间跳转]` 或无铺垫硬塞的 `[NSFW-A/B/C]`！',
    '5. 严禁暴露后台数字时间戳（如 `1:01:01:08:00`），时间一律使用自然描写。'
].join('\n');

export const 过滤并精简V2行动选项 = (options?: string[]): string[] => {
    const raw = Array.isArray(options) ? options.map((x) => (x || '').trim()).filter(Boolean) : [];
    const metaOrForcedNsfw = /^([A-Z]\.\s*)?\[(?:视角切换|双线叙事|镜头转换|时间跳转|NSFW-[A-Z])\]/i;
    const clean = raw.filter((opt) => !metaOrForcedNsfw.test(opt));
    const chosen = clean.length >= 3 ? clean.slice(0, 5) : raw.slice(0, 5);
    return chosen.map((opt, idx) => {
        const letter = String.fromCharCode(65 + idx);
        return /^[A-Z]\s*[\.、]/.test(opt)
            ? opt.replace(/^[A-Z]\s*[\.、]\s*/, `${letter}.`)
            : `${letter}.${opt}`;
    });
};

const 清洗基线冗余提示词池 = (rawPool?: 提示词结构[], coreWorldText?: string): 提示词结构[] => {
    const source = Array.isArray(rawPool) && rawPool.length > 0 ? rawPool : 默认提示词;
    return 构建2_0写作规则池(source, coreWorldText);
};

const 清洗2_0解析后正文日志 = (response: GameResponse): GameResponse => {
    const rawLogs = Array.isArray(response?.logs) ? response.logs : [];
    const cleaned = rawLogs
        .map((log) => {
            if (!log || typeof log.text !== 'string') return log;
            const nextText = log.text
                .replace(/^\s*#{1,4}\s*正文\s*(?:\n+|$)/u, '')
                .replace(/^【判定】\s*(?=\n|$)/u, '')
                .trim();
            return { ...log, text: nextText };
        })
        .filter((log) => Boolean(log && typeof log.text === 'string' && log.text.trim().length > 0));
    return {
        ...response,
        logs: cleaned
    };
};

const 解析V2故事响应 = (
    rawText: string,
    params: {
        validateDialogueFormat: boolean;
        knownSpeakers: string[];
    }
): GameResponse => {
    const normalized = (rawText || '')
        .replace(/<options>([\s\S]*?)<\/options>/gi, (_m, inner) => `<行动选项>\n${inner}\n</行动选项>`);
    const parsed = parseStoryRawText(normalized, {
        validateTagCompleteness: false,
        enableTagRepair: true,
        validateDialogueFormat: params.validateDialogueFormat,
        knownSpeakers: params.knownSpeakers,
        requireActionOptionsTag: true
    });
    return 清洗2_0解析后正文日志(parsed);
};

const 执行带重试故事生成 = async (params: {
    apiConfig: StoryV2Config['apiConfig'];
    messages: 通用消息[];
    validateDialogueFormat: boolean;
    knownSpeakers: string[];
    signal?: AbortSignal;
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
}): Promise<{ response: GameResponse; rawText: string }> => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (params.signal?.aborted) {
            throw params.signal.reason || new DOMException('Aborted', 'AbortError');
        }
        const retryHint = attempt === 1
            ? null
            : {
                role: 'user' as const,
                content: `【格式修复重试(${attempt}/3)】上一版未通过校验（原因：${lastError?.parseDetail || lastError?.message || '标签缺失或对白格式不合'}）。请重新完整输出：<thinking>...</thinking>、<正文>...</正文>（严格【旁白】/【角色名】分行）、<短期记忆>...</短期记忆>、<行动选项>...</行动选项>（选项必须写在标签内部！）。`
            };
        const reqMessages = 规范化文本补全消息链(
            retryHint ? [...params.messages, retryHint] : params.messages,
            { 保留System: true, 合并同角色: false, 尾部System转User: true }
        );
        const rawText = await 请求模型文本(params.apiConfig, reqMessages, {
            temperature: 0.72,
            signal: params.signal,
            streamOptions: {
                stream: params.stream !== false,
                onDelta: (delta, acc) => params.onDelta?.(delta, acc)
            }
        });
        try {
            const response = 解析V2故事响应(rawText, {
                validateDialogueFormat: params.validateDialogueFormat,
                knownSpeakers: params.knownSpeakers
            });
            return { response, rawText };
        } catch (err) {
            lastError = err;
            if (attempt === 3 || !(err instanceof StoryResponseParseError || (err as any)?.name === 'StoryResponseParseError')) {
                // On attempt 3, try relaxing validateDialogueFormat as last safety net
                if (attempt === 3 && params.validateDialogueFormat) {
                    try {
                        const relaxed = 解析V2故事响应(rawText, {
                            validateDialogueFormat: false,
                            knownSpeakers: params.knownSpeakers
                        });
                        return { response: relaxed, rawText };
                    } catch {
                        // Fall through
                    }
                }
                if (attempt === 3) throw err;
            }
        }
    }
    throw lastError;
};

export const 渲染开局回合V2 = async (
    state: StoryV2EngineState,
    config: StoryV2Config,
    options?: {
        signal?: AbortSignal;
        stream?: boolean;
        onDelta?: (delta: string, accumulated: string) => void;
    }
): Promise<RenderedStoryTurn> => {
    const startMs = Date.now();
    const { apiConfig, openingConfig } = config;
    const gameConfig = 净化2_0酒馆预设(config.gameConfig);
    const { directorBible: _omitBible, ...safeState } = state;
    const presentNpcNames = (state.社交 || []).filter((n) => n?.是否在场 !== false).map((n) => n?.姓名).filter(Boolean);
    const briefOutput = 构建本回合导演简报({
        bible: state.directorBible,
        turnIndex: 0,
        playerName: state.角色?.姓名 || '主角',
        partnerName: openingConfig?.初始伙伴?.enabled ? openingConfig.初始伙伴.姓名 : undefined,
        presentNpcNames,
        gameConfig
    });

    const promptPool = 清洗基线冗余提示词池(config.promptPool, state.worldPrompt);
    const openingCot = 获取开局思维链提示词(gameConfig, {
        hasNarrativeConstraint: Boolean(提取叙事约束块(state.角色?.天赋列表))
    });
    const finalPool = promptPool.map((p) => (p.id === 核心_开局思维链.id || p.id === 'core_cot' ? { ...p, 内容: openingCot } : p));
    if (gameConfig.启用修炼体系 !== false && !finalPool.some((p) => p.id === 核心_境界体系.id)) {
        finalPool.push({ ...核心_境界体系 });
    }

    const filteredWorldbooks = 过滤非场景世界书(config.worldbooks || [], false);
    const tavernMode = 酒馆预设模式可用(gameConfig);

    const sysCtx = 构建系统提示词({
        promptPool: finalPool,
        memoryData: state.记忆系统,
        socialData: state.社交 || [],
        statePayload: {
            ...safeState,
            战斗: undefined,
            开局配置: openingConfig
        },
        gameConfig,
        memoryConfig: 规范化记忆配置(),
        fallbackPlayerName: state.角色?.姓名 || '主角',
        builtinPromptEntries: [],
        worldbooks: filteredWorldbooks,
        worldEvolutionEnabled: false,
        options: {
            禁用世界演变分流: true,
            注入剧情推动协议: false,
            注入女主剧情规划协议: false,
            世界书作用域: tavernMode ? ['opening', 'tavern'] : ['opening'],
            世界书附加文本: [
                briefOutput.directorBriefText,
                briefOutput.knowledgeIsolationText,
                构建开局配置提示词(openingConfig, config.worldConfig.openingExtraRequirement || ''),
                V2_STORY_CONTRACT
            ],
            openingConfig,
            强制剧情COT提示词ID: 'core_cot'
        }
    });

    const stylePrompt = 按功能开关过滤提示词内容(
        构建剧情风格助手提示词(gameConfig.剧情风格, gameConfig.NTL后宫档位, gameConfig),
        gameConfig
    );
    const realWorldPrompt = gameConfig.启用真实世界模式 === true ? 构建真实世界模式提示词(gameConfig) : '';
    const wordPrompt = sysCtx.contextPieces.字数要求提示词 || 构建字数要求提示词(gameConfig.字数要求 || 1500);

    const openingTaskInput = [
        '请基于以上【世界观】、【主角与同伴建档】与【2.0 剧情导演开局简报】，生成极具沉浸感与戏剧张力的第 0 回合开场第一幕。',
        briefOutput.directorBriefText,
        briefOutput.knowledgeIsolationText,
        V2_STORY_CONTRACT,
        `目标字数：正文约 ${gameConfig.字数要求 || 1500} 字。`
    ].join('\n\n');

    let orderedMessages: 通用消息[] = [];
    if (tavernMode) {
        orderedMessages = 构建酒馆预设消息链({
            config: gameConfig,
            context: sysCtx as any,
            chatHistory: [],
            latestUserInput: openingTaskInput,
            playerName: state.角色?.姓名 || '',
            playerRole: state.角色,
            overrideCotPrompt: sysCtx.contextPieces.COT提示词,
            worldbookExtraTexts: [
                sysCtx.contextPieces.叙事人称提示词,
                stylePrompt,
                realWorldPrompt,
                wordPrompt
            ]
        }) as 通用消息[];
        // Override trailing tavern 10-option/meta-camera quirk with clean V2 contract
        orderedMessages.push({
            role: 'user',
            content: [
                '【最高优先级·2.0叙事与格式覆盖指令】',
                briefOutput.directorBriefText,
                briefOutput.knowledgeIsolationText,
                V2_STORY_CONTRACT
            ].join('\n\n')
        });
    } else {
        const cotPseudo = 构建COT伪装提示词(gameConfig, sysCtx.contextPieces.AI角色声明);
        const push = (role: 通用消息['role'], content: string) => {
            if (content && content.trim()) orderedMessages.push({ role, content: content.trim() });
        };
        push('system', sysCtx.contextPieces.AI角色声明);
        push('system', sysCtx.contextPieces.worldPrompt);
        push('system', sysCtx.contextPieces.地图建筑状态);
        push('system', sysCtx.contextPieces.境界体系提示词);
        push('system', sysCtx.contextPieces.在场NPC档案);
        push('system', sysCtx.contextPieces.叙事人称提示词);
        push('system', stylePrompt);
        push('system', realWorldPrompt);
        push('system', wordPrompt);
        push('system', sysCtx.contextPieces.格式提示词);
        push('user', openingTaskInput);
        if (gameConfig.启用COT伪装注入 !== false && cotPseudo) {
            push('assistant', cotPseudo);
        }
    }

    const contextChars = orderedMessages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const knownSpeakers = [
        state.角色?.姓名,
        ...(state.社交 || []).map((n) => n?.姓名),
        ...briefOutput.activeCastNames
    ].filter(Boolean) as string[];

    const { response, rawText } = await 执行带重试故事生成({
        apiConfig,
        messages: orderedMessages,
        validateDialogueFormat: gameConfig.启用严格正文对白格式 !== false,
        knownSpeakers,
        signal: options?.signal,
        stream: options?.stream,
        onDelta: options?.onDelta
    });
    response.action_options = 过滤并精简V2行动选项(response.action_options);

    return {
        response,
        rawText,
        briefOutput,
        elapsedMs: Date.now() - startMs,
        contextChars
    };
};

export const 渲染主剧情回合V2 = async (
    state: StoryV2EngineState,
    config: StoryV2Config,
    playerInput: string,
    options?: {
        signal?: AbortSignal;
        stream?: boolean;
        onDelta?: (delta: string, accumulated: string) => void;
    }
): Promise<RenderedStoryTurn> => {
    const startMs = Date.now();
    const { apiConfig, openingConfig } = config;
    const gameConfig = 净化2_0酒馆预设(config.gameConfig);
    const { directorBible: _omitBible, ...safeState } = state;
    const presentNpcNames = (state.社交 || []).filter((n) => n?.是否在场 !== false).map((n) => n?.姓名).filter(Boolean);
    const briefOutput = 构建本回合导演简报({
        bible: state.directorBible,
        turnIndex: state.turnIndex,
        playerName: state.角色?.姓名 || '主角',
        partnerName: openingConfig?.初始伙伴?.enabled ? openingConfig.初始伙伴.姓名 : undefined,
        presentNpcNames,
        gameConfig
    });

    const promptPool = 清洗基线冗余提示词池(config.promptPool, state.worldPrompt);
    const cleanMainCot = 默认提示词.find((p) => p.id === 核心_思维链.id)?.内容 || 核心_思维链.内容;
    const finalPool = promptPool.map((p) => (p.id === 'core_cot' ? { ...p, 内容: cleanMainCot } : p));
    if (gameConfig.启用修炼体系 !== false && !finalPool.some((p) => p.id === 核心_境界体系.id)) {
        finalPool.push({ ...核心_境界体系 });
    }

    const recentText = state.历史记录.slice(-2).map((h) => h.content || '').join('\n');
    const isIntimateScene = /(亲吻|拥抱|脱衣|贴身|情欲|双修|暧昧|调情)/.test(`${playerInput}\n${recentText}`);
    const filteredWorldbooks = 过滤非场景世界书(config.worldbooks || [], isIntimateScene);

    const curGameTime = 环境时间转标准串(state.环境) || state.gameInitialTime;
    const historyWithUser = [
        ...state.历史记录,
        { role: 'user' as const, content: playerInput, gameTime: curGameTime, timestamp: Date.now() }
    ];

    const tavernMode = 酒馆预设模式可用(gameConfig);
    const builtContext = 构建系统提示词({
        promptPool: finalPool,
        memoryData: state.记忆系统,
        socialData: state.社交 || [],
        statePayload: {
            ...safeState,
            战斗: undefined,
            开局配置: openingConfig
        },
        gameConfig,
        memoryConfig: 规范化记忆配置(),
        fallbackPlayerName: state.角色?.姓名 || '主角',
        builtinPromptEntries: [],
        worldbooks: filteredWorldbooks,
        worldEvolutionEnabled: false,
        options: {
            禁用世界演变分流: true,
            世界书作用域: tavernMode ? ['main', 'tavern'] : ['main'],
            世界书附加文本: [briefOutput.directorBriefText, briefOutput.knowledgeIsolationText]
        }
    });

    // Inject our focused 2.0 Director Brief right into 剧情安排 slot & override noisy combat piece
    builtContext.contextPieces.剧情安排 = [
        builtContext.contextPieces.剧情安排,
        briefOutput.directorBriefText,
        briefOutput.knowledgeIsolationText
    ].filter(Boolean).join('\n\n');
    builtContext.contextPieces.战斗状态 = '';

    const req = 构建主剧情请求参数({
        gameConfig,
        apiConfig: { activeConfigId: apiConfig.id, configs: [apiConfig as any] } as any,
        builtContext: builtContext as any,
        updatedContextHistory: historyWithUser,
        updatedMemSys: state.记忆系统,
        sendInput: playerInput,
        playerRole: state.角色,
        builtinPromptEntries: [],
        worldbooks: filteredWorldbooks
    });

    const orderedMessages: 通用消息[] = [
        ...(req.orderedMessages as 通用消息[]),
        {
            role: 'user',
            content: [
                '【最高优先级·2.0导演执行与防重复指令】',
                briefOutput.directorBriefText,
                briefOutput.knowledgeIsolationText,
                V2_STORY_CONTRACT,
                `目标篇幅：正文严格控制在本轮约 ${gameConfig.字数要求 || 1600} 字（误差控制在 ±20% 内）。`
            ].join('\n\n')
        }
    ];

    const contextChars = orderedMessages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const knownSpeakers = [
        state.角色?.姓名,
        ...(state.社交 || []).map((n) => n?.姓名),
        ...briefOutput.activeCastNames
    ].filter(Boolean) as string[];

    const { response, rawText } = await 执行带重试故事生成({
        apiConfig,
        messages: orderedMessages,
        validateDialogueFormat: gameConfig.启用严格正文对白格式 !== false,
        knownSpeakers,
        signal: options?.signal,
        stream: options?.stream,
        onDelta: options?.onDelta
    });
    response.action_options = 过滤并精简V2行动选项(response.action_options);

    return {
        response,
        rawText,
        briefOutput,
        elapsedMs: Date.now() - startMs,
        contextChars
    };
};
