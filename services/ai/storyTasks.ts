import { GameResponse, TavernCommand, 内置提示词条目结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import type { 小说拆分数据集结构, 小说拆分角色档案结构, 小说拆分势力档案结构, 小说拆分地图地点档案结构, 小说拆分物品档案结构 } from '../../models/novelDecomposition';
import { 翻译连接测试错误 } from './imageGenerationDiagnostics';
import { parseJsonWithRepair } from '../../utils/jsonRepair';
import { 获取世界观生成系统提示词, 构建世界观生成用户提示词 } from '../../prompts/runtime/worldGeneration';
import { 同人境界体系生成系统提示词, 构建同人境界体系生成用户提示词 } from '../../prompts/runtime/fandomRealmGeneration';
import { 构建世界演变系统提示词, 构建世界演变用户提示词 } from '../../prompts/runtime/worldEvolution';
import {
    构建变量模型身份提示词,
    构建变量模型职责提示词,
    构建变量模型系统提示词,
    构建变量模型任务提示词,
    构建变量模型输出格式提示词,
    构建变量模型用户附加规则提示词,
    构建变量模型COT伪装提示词
} from '../../prompts/runtime/variableModel';
import { 构建统一规划分析系统提示词, 构建统一规划分析用户提示词 } from '../../prompts/runtime/planningAnalysis';
import {
    小说拆分AI身份提示词,
    小说拆分其他要求提示词,
    小说拆分结构要求提示词,
    构建小说拆分当前任务提示词,
    小说拆分COT伪装提示词
} from '../../prompts/runtime/novelDecomposition';
import { 小说拆分COT提示词 } from '../../prompts/runtime/novelDecompositionCot';
import { 小说模式包补全系统提示词, 构建小说模式包补全用户提示词 } from '../../prompts/runtime/novelModePackCompletion';
import { 分段字段补全系统提示词, 构建分段字段补全用户提示词, type 分段字段AI补全结果 } from '../../prompts/runtime/novelSegmentFieldCompletion';
import { 同人规划分析附加系统提示词, 同人规划分析附加COT提示词 } from '../../prompts/runtime/fandomPlanningAnalysis';
import { 同人世界演变附加系统提示词, 同人世界演变附加COT提示词 } from '../../prompts/runtime/fandomWorldEvolution';
import { 归一化或补全境界体系提示词, 校验境界体系提示词完整性 } from '../../prompts/runtime/fandom';
import { 默认COT伪装历史消息提示词 } from '../../prompts/runtime/defaults';
import { 获取变量校准COT提示词 } from '../../prompts/runtime/variableCot';
import { 构建AI角色声明提示词 } from '../../prompts/runtime/roleIdentity';
import {
    构建统一规划分析专用上下文,
    统一规划分析COT提示词
} from '../../prompts/runtime/planUpdateReference';
import { 世界书本体槽位 } from '../../utils/worldbook';
import { 获取内置提示词槽位内容 } from '../../utils/builtinPrompts';
import {
    type 通用消息,
    规范化文本补全消息链,
    请求模型文本,
    替换COT伪装身份占位
} from './chatCompletionClient';
import {
    parseStoryRawText,
    type StoryParseOptions,
    提取首个标签内容,
    提取首尾思考区段,
    解析动态世界块,
    解析命令块
} from './storyResponseParser';

export interface ConnectionTestResult {
    ok: boolean;
    detail: string;
}

export interface StoryResponseResult {
    response: GameResponse;
    rawText: string;
}

export interface WorldEvolutionResult {
    commands: TavernCommand[];
    updates: string[];
    rawText: string;
}

export interface WorldFoundationResult {
    worldPrompt: string;
    mapLayers: any[];
    factions: any[];
    rawText: string;
}

export interface VariableCalibrationResult {
    commands: TavernCommand[];
    reports: string[];
    rawText: string;
}

export interface PlanningAnalysisResult {
    shouldUpdate: boolean;
    reason: string;
    commands: TavernCommand[];
    notes: string[];
    rawText: string;
}

export interface PolishedBodyResult {
    bodyText: string;
    rawText: string;
}

export interface NovelDecompositionEventAnalysisResult {
    事件名: string;
    事件说明: string;
    开始时间: string;
    最早开始时间: string;
    最迟开始时间: string;
    结束时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    事件结果: string[];
    对下一组影响: string[];
    信息可见性: NovelDecompositionVisibilityAnalysisResult;
}

export interface NovelDecompositionVisibilityAnalysisResult {
    谁知道: string[];
    谁不知道: string[];
    是否仅读者视角可见: boolean;
}

export interface NovelDecompositionVisibleInfoItemAnalysisResult {
    内容: string;
    信息可见性: NovelDecompositionVisibilityAnalysisResult;
}

export interface NovelDecompositionCharacterProgressAnalysisResult {
    角色名: string;
    本组前状态: string[];
    本组变化: string[];
    本组后状态: string[];
    对下一组影响: string[];
}

export interface NovelDecompositionCharacterProfileAnalysisResult {
    名称: string;
    身份: string;
    所属势力: string;
    初始立场: string;
    关系摘要: string[];
    状态摘要: string[];
    首次出现: string;
    重要性: '核心' | '重要' | '一般';
}

export interface NovelDecompositionFactionProfileAnalysisResult {
    名称: string;
    类型: string;
    地盘: string;
    代表人物: string[];
    立场目标: string;
    当前状态: string;
    关系摘要: string[];
    首次出现: string;
}

export interface NovelDecompositionLocationProfileAnalysisResult {
    名称: string;
    层级: '寰宇' | '大地点' | '中地点' | '小地点' | '区地点' | '子地点' | '未知';
    上级地点: string;
    所属势力: string;
    地貌功能: string;
    关键设施: string[];
    首次出现: string;
}

export interface NovelDecompositionItemProfileAnalysisResult {
    名称: string;
    类型: string;
    用途: string;
    所属人物: string;
    所属势力: string;
    首次出现: string;
}

export interface NovelDecompositionAnalysisResult {
    groupNumber: number;
    chapterRange: string;
    chapterTitles: string[];
    isOpeningGroup: boolean;
    summary: string;
    openingFacts: string[];
    continuationFacts: string[];
    endStates: string[];
    nextGroupReferences: string[];
    hardConstraints: NovelDecompositionVisibleInfoItemAnalysisResult[];
    foreshadowing: NovelDecompositionVisibleInfoItemAnalysisResult[];
    appearingCharacters: string[];
    timelineStart: string;
    timelineEnd: string;
    keyEvents: NovelDecompositionEventAnalysisResult[];
    characterProgressions: NovelDecompositionCharacterProgressAnalysisResult[];
    characterProfiles: NovelDecompositionCharacterProfileAnalysisResult[];
    factionProfiles: NovelDecompositionFactionProfileAnalysisResult[];
    locationProfiles: NovelDecompositionLocationProfileAnalysisResult[];
    itemProfiles: NovelDecompositionItemProfileAnalysisResult[];
    worldRules: string[];
    worldBoundaryRules: string[];
    characterRelations: string[];
    factionRelations: string[];
    foreshadowingThreads: string[];
    payoffPoints: string[];
    chapterRhythm: string[];
    rawText: string;
}

export interface StoryStreamOptions {
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
}

export interface StoryRequestOptions {
    enableCotInjection?: boolean;
    cotPseudoHistoryPrompt?: string;
    orderedMessages?: 通用消息[];
    leadingSystemPrompt?: string;
    styleAssistantPrompt?: string;
    outputProtocolPrompt?: string;
    lengthRequirementPrompt?: string;
    disclaimerRequirementPrompt?: string;
    validateTagCompleteness?: boolean;
    enableTagRepair?: boolean;
    requireActionOptionsTag?: boolean;
    requireDynamicWorldTag?: boolean;
    validateDialogueFormat?: boolean;
    knownSpeakers?: string[];
    errorDetailLimit?: number;
    includeReasoning?: boolean;
    disableThinking?: boolean;
    stripReasoning?: boolean;
    prefixMode?: boolean;
}

export interface WorldStreamOptions {
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
}

interface RecallStreamOptions {
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
}

const 构建独立任务触发消息 = (
    taskPrompt: string,
    gptMode?: boolean,
    fallback = '开始任务'
): 通用消息 => ({
    role: 'user',
    content: gptMode ? taskPrompt : fallback
});

export const generateMemoryRecall = async (
    systemPrompt: string,
    userPrompt: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    streamOptions?: RecallStreamOptions,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string
): Promise<string> => {
    const normalizedExtraPrompt = (extraPrompt || '').trim();
    const normalizedCotPseudoPrompt = (cotPseudoHistoryPrompt || '').trim();
    const messagesRaw: 通用消息[] = [
        { role: 'system', content: systemPrompt }
    ];
    if (normalizedExtraPrompt) {
        messagesRaw.push({ role: 'user', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
    }
    messagesRaw.push({ role: 'user', content: userPrompt });
    if (normalizedCotPseudoPrompt) {
        messagesRaw.push({ role: 'assistant', content: normalizedCotPseudoPrompt });
    }
    const messages = 规范化文本补全消息链(messagesRaw, { 保留System: true, 合并同角色: false });
    return 请求模型文本(apiConfig, messages, {
        temperature: 0.2,
        signal,
        streamOptions
    });
};

export const 清理润色正文输出 = (rawText: string): string => {
    let text = (rawText || '').trim();
    if (!text) return '';

    text = text
        .replace(/^```(?:text|markdown)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();

    const thinkingSegment = 提取首尾思考区段(text);
    const textWithoutThinking = (
        thinkingSegment.matched
            ? thinkingSegment.textWithoutThinking
            : text
    ).trim();
    const bodyOpenRegex = /<\s*正文\s*>/gi;
    let bodyOpenMatch: RegExpExecArray | null = null;
    let lastBodyOpenMatch: RegExpExecArray | null = null;
    while ((bodyOpenMatch = bodyOpenRegex.exec(textWithoutThinking)) !== null) {
        lastBodyOpenMatch = bodyOpenMatch;
    }
    if (!lastBodyOpenMatch || typeof lastBodyOpenMatch.index !== 'number') {
        return '';
    }
    const bodyStart = lastBodyOpenMatch.index + lastBodyOpenMatch[0].length;
    const afterBodyOpen = textWithoutThinking.slice(bodyStart);
    const bodyCloseMatch = afterBodyOpen.match(/<\s*\/\s*正文\s*>/i);
    const bodyPayload = bodyCloseMatch && typeof bodyCloseMatch.index === 'number'
        ? afterBodyOpen.slice(0, bodyCloseMatch.index)
        : afterBodyOpen;
    const payload = bodyPayload
        .replace(/^[\t ]+|[\t ]+$/gm, '')
        .trim();
    return payload;
};

export const generatePolishedBody = async (
    bodyText: string,
    polishPrompt: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    streamOptions?: WorldStreamOptions
): Promise<PolishedBodyResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');
    const normalizedBody = (bodyText || '').trim();
    if (!normalizedBody) {
        return {
            bodyText: '',
            rawText: ''
        };
    }

    const normalizedPrompt = (polishPrompt || '').trim();
    const fallbackPrompt = [
        '请在不改变事实前提下润色正文，并仅输出正文。',
        '【输出结构硬约束】',
        '1) 你必须输出 <thinking>...</thinking> 与 <正文>...</正文> 两个标签块，顺序固定为 thinking 在前、正文在后。',
        '2) 除这两个标签外，禁止输出其他内容（解释、命令、免责声明、代码块等）。',
        '3) 系统只会提取 <正文> 内容用于最终渲染。'
    ].join('\n');
    const systemPrompt = normalizedPrompt || fallbackPrompt;
    const normalizedExtraPrompt = (extraPrompt || '').trim();
    const normalizedCotPseudoPrompt = (cotPseudoHistoryPrompt || '').trim();
    const userPrompt = [
        '【待润色正文】',
        normalizedBody,
        normalizedExtraPrompt ? `\n【最终输出附加要求】\n${normalizedExtraPrompt}` : ''
    ].filter(Boolean).join('\n');

    const messagesRaw: 通用消息[] = [
        { role: 'system', content: systemPrompt }
    ];
    if (normalizedExtraPrompt) {
        messagesRaw.push({ role: 'user', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
    }
    messagesRaw.push({ role: 'user', content: userPrompt });
    if (normalizedCotPseudoPrompt) {
        messagesRaw.push({ role: 'assistant', content: normalizedCotPseudoPrompt });
    }
    const messages = 规范化文本补全消息链(messagesRaw, { 保留System: true, 合并同角色: false });

    const raw = await 请求模型文本(apiConfig, messages, {
        temperature: 0.6,
        signal,
        streamOptions,
        errorDetailLimit: Number.POSITIVE_INFINITY
    });

    return {
        bodyText: 清理润色正文输出(raw),
        rawText: raw
    };
};

export const generateWorldData = async (
    worldContext: string,
    charData: any,
    apiConfig: 当前可用接口结构,
    streamOptions?: WorldStreamOptions,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    config?: { 启用修炼体系?: boolean; signal?: AbortSignal; openingConfig?: any }
): Promise<string> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const normalizedExtraPrompt = (extraPrompt || '').trim();
    const normalizedCotPseudoPrompt = (cotPseudoHistoryPrompt || '').trim();
    const genSystemPrompt = 获取世界观生成系统提示词(config, config?.openingConfig);
    const genUserPrompt = [
        构建世界观生成用户提示词(worldContext, charData, config, config?.openingConfig),
        normalizedExtraPrompt ? `【最终输出附加要求】\n${normalizedExtraPrompt}` : ''
    ].filter(Boolean).join('\n\n');

    const messagesRaw: 通用消息[] = [
        { role: 'system', content: genSystemPrompt }
    ];
    if (normalizedExtraPrompt) {
        messagesRaw.push({ role: 'user', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
    }
    messagesRaw.push({ role: 'user', content: genUserPrompt });
    if (normalizedCotPseudoPrompt) {
        messagesRaw.push({ role: 'assistant', content: normalizedCotPseudoPrompt });
    }
    const messages = 规范化文本补全消息链(messagesRaw, { 保留System: true, 合并同角色: false });

    const rawText = await 请求模型文本(apiConfig, messages, {
        temperature: 0.8,
        streamOptions,
        signal: config?.signal
    });

    return 解析世界观提示词内容(rawText);
};

export const generateWorldFoundationData = async (
    worldContext: string,
    charData: any,
    apiConfig: 当前可用接口结构,
    streamOptions?: WorldStreamOptions,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    config?: { 启用修炼体系?: boolean; signal?: AbortSignal; openingConfig?: any }
): Promise<WorldFoundationResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const normalizedExtraPrompt = (extraPrompt || '').trim();
    const normalizedCotPseudoPrompt = (cotPseudoHistoryPrompt || '').trim();
    const foundationConfig = {
        ...config,
        生成世界基底: true
    };
    const genSystemPrompt = 获取世界观生成系统提示词(foundationConfig, config?.openingConfig);
    const genUserPrompt = [
        构建世界观生成用户提示词(worldContext, charData, foundationConfig, config?.openingConfig),
        normalizedExtraPrompt ? `【最终输出附加要求】\n${normalizedExtraPrompt}` : ''
    ].filter(Boolean).join('\n\n');

    const messagesRaw: 通用消息[] = [
        { role: 'system', content: genSystemPrompt }
    ];
    if (normalizedExtraPrompt) {
        messagesRaw.push({ role: 'user', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
    }
    messagesRaw.push({ role: 'user', content: genUserPrompt });
    if (normalizedCotPseudoPrompt) {
        messagesRaw.push({ role: 'assistant', content: normalizedCotPseudoPrompt });
    }
    const messages = 规范化文本补全消息链(messagesRaw, { 保留System: true, 合并同角色: false });

    const rawText = await 请求模型文本(apiConfig, messages, {
        temperature: 0.8,
        streamOptions,
        signal: config?.signal
    });

    return 解析世界观生成结果(rawText);
};

export const 解析世界观生成结果 = (content: string): WorldFoundationResult => {
    const source = (content || '').trim();
    if (!source) {
        throw new Error('世界观生成解析失败: 输出为空');
    }

    const 清理世界观候选文本 = (value: unknown): string => {
        if (typeof value !== 'string') return '';
        return value
            .replace(/^```(?:json|JSON)?\s*/g, '')
            .replace(/\s*```$/g, '')
            .replace(/^\s*(?:以下是|下面是|这是)?\s*(?:生成的|整理后的)?\s*世界观(?:设定|母本|提示词)?\s*[:：]\s*/i, '')
            .trim();
    };

    const 提取无标签世界观候选 = (text: string): string => {
        const withoutThinking = text
            .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, '')
            .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, '')
            .trim();
        const markerMatch = withoutThinking.match(/(?:【\s*世界观(?:设定|母本|提示词)?\s*】|#+\s*世界观(?:设定|母本|提示词)?|世界观(?:设定|母本|提示词)?\s*[:：])([\s\S]*)/i);
        const candidateSource = markerMatch?.[1] || withoutThinking;
        const [candidate] = candidateSource.split(/(?:<\s*世界基底\s*>|【\s*世界基底\s*】|#+\s*世界基底|\n\s*(?:world_foundation|mapLayers|map_layers|factions|faction_list)\s*[:：])/i);
        const cleaned = 清理世界观候选文本(candidate);
        if (!cleaned) return '';
        const hasEnoughWorldText = cleaned.length >= 80 || /世界|大陆|王国|宗门|公会|魔法|灵气|势力|地理|历史|规则|货币|地图|冒险/i.test(cleaned);
        if (!hasEnoughWorldText) return '';
        if (/^(抱歉|对不起|无法|不能|I\s+can't|I cannot)/i.test(cleaned)) return '';
        return cleaned;
    };

    const findLastMatch = (text: string, regex: RegExp): { index: number; length: number } | null => {
        const re = new RegExp(regex.source, regex.flags);
        let match: RegExpExecArray | null = null;
        let last: { index: number; length: number } | null = null;
        while ((match = re.exec(text)) !== null) {
            last = { index: match.index, length: match[0].length };
        }
        return last;
    };

    const lastWorldOpen = findLastMatch(source, /<\s*世界观\s*>/gi);
    const lastThinkingClose = (() => {
        const thinking = findLastMatch(source, /<\s*\/\s*thinking\s*>/gi);
        const think = findLastMatch(source, /<\s*\/\s*think\s*>/gi);
        if (!thinking && !think) return null;
        if (thinking && think) {
            return thinking.index >= think.index ? thinking : think;
        }
        return thinking || think;
    })();

    const worldIndex = lastWorldOpen?.index ?? -1;
    const thinkingIndex = lastThinkingClose ? lastThinkingClose.index + lastThinkingClose.length : -1;
    const sliceStart = Math.max(worldIndex, thinkingIndex);
    const textForParsing = (sliceStart > 0 ? source.slice(sliceStart) : source).trim();

    const worldMatches = Array.from(textForParsing.matchAll(/<\s*世界观\s*>([\s\S]*?)(?:<\s*\/\s*世界观\s*>|$)/gi));
    const worldTagBlock = worldMatches.length > 0
        ? (worldMatches[worldMatches.length - 1]?.[1] || '').trim()
        : '';

    const parsed = parseJsonWithRepair<Record<string, unknown>>(textForParsing);
    const jsonPrompt = parsed.value && typeof parsed.value === 'object'
        ? [
            parsed.value.world_prompt,
            parsed.value.worldPrompt,
            (parsed.value as any).世界观,
            (parsed.value as any).世界观提示词,
            (parsed.value as any).世界观母本
        ].map(清理世界观候选文本).find(Boolean) || ''
        : '';
    const fallbackPrompt = 提取无标签世界观候选(textForParsing);
    if (!worldTagBlock && !jsonPrompt && !fallbackPrompt && (!parsed.value || typeof parsed.value !== 'object')) {
        throw new Error(`世界观生成解析失败: 未找到<世界观>标签，且JSON解析失败: ${parsed.error || '未获得有效 JSON'}`);
    }
    const prompt = worldTagBlock || jsonPrompt || fallbackPrompt;
    if (!prompt) throw new Error('世界观生成解析失败: 未找到<世界观>标签且world_prompt为空');

    const foundationMatches = Array.from(source.matchAll(/<\s*世界基底\s*>([\s\S]*?)(?:<\s*\/\s*世界基底\s*>|$)/gi));
    const foundationBlock = foundationMatches.length > 0
        ? (foundationMatches[foundationMatches.length - 1]?.[1] || '').trim()
        : '';
    const foundationParsed = foundationBlock
        ? parseJsonWithRepair<Record<string, any>>(foundationBlock).value
        : undefined;
    const foundation = foundationParsed && typeof foundationParsed === 'object'
        ? foundationParsed
        : (parsed.value && typeof parsed.value === 'object' ? parsed.value as Record<string, any> : {});
    const worldLike = foundation?.世界 && typeof foundation.世界 === 'object' ? foundation.世界 : foundation;
    const mapLayers = [
        worldLike?.地图层级,
        worldLike?.地点树,
        worldLike?.mapLayers,
        worldLike?.map_layers
    ].find(Array.isArray) || [];
    const factions = [
        worldLike?.势力列表,
        worldLike?.factions,
        worldLike?.factionList,
        worldLike?.faction_list
    ].find(Array.isArray) || [];

    return {
        worldPrompt: prompt,
        mapLayers,
        factions,
        rawText: source
    };
};

export const 解析世界观提示词内容 = (content: string): string => 解析世界观生成结果(content).worldPrompt;

export const 解析境界体系提示词内容 = (content: string): string => {
    const source = (content || '').trim();
    if (!source) throw new Error('同人境界体系生成解析失败: 输出为空');

    const tagMatches = Array.from(source.matchAll(/<\s*境界体系\s*>([\s\S]*?)(?:<\s*\/\s*境界体系\s*>|$)/gi));
    const tagged = tagMatches.length > 0
        ? (tagMatches[tagMatches.length - 1]?.[1] || '').trim()
        : source;
    if (!tagged) throw new Error('同人境界体系生成解析失败: 未找到<境界体系>标签');

    const repaired = 归一化或补全境界体系提示词(tagged);
    const validation = 校验境界体系提示词完整性(repaired);
    if (!validation.ok) {
        const detail = [
            validation.missingSections.length > 0 ? `缺少区块: ${validation.missingSections.join('、')}` : '',
            validation.missingMappings.length > 0 ? `缺少映射值: ${validation.missingMappings.join('、')}` : '',
            validation.missingSubMarkers.length > 0 ? `缺少子标记: ${validation.missingSubMarkers.join('、')}` : '',
            validation.missingStageJumps.length > 0 ? `缺少阶段推进: ${validation.missingStageJumps.join('、')}` : '',
            validation.missingBreakthroughJumps.length > 0 ? `缺少大境突破: ${validation.missingBreakthroughJumps.join('、')}` : ''
        ].filter(Boolean).join('；');
        throw new Error(`同人境界体系生成解析失败: ${detail || '输出不完整'}`);
    }

    return validation.normalizedText;
};

export const generateFandomRealmData = async (
    params: {
        openingConfig?: any;
    },
    apiConfig: 当前可用接口结构,
    streamOptions?: WorldStreamOptions,
    extraPrompt?: string,
    signal?: AbortSignal
): Promise<string> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const systemPrompt = 同人境界体系生成系统提示词;
    const userPrompt = 构建同人境界体系生成用户提示词({
        openingConfig: params.openingConfig
    });
    const normalizedExtraPrompt = (extraPrompt || '').trim();

    const 请求并解析 = async (
        messages: 通用消息[],
        currentStreamOptions?: WorldStreamOptions
    ): Promise<string> => {
        const rawText = await 请求模型文本(
            apiConfig,
            规范化文本补全消息链(messages, { 保留System: true, 合并同角色: false }),
            {
                temperature: 0.5,
                streamOptions: currentStreamOptions,
                signal
            }
        );
        return 解析境界体系提示词内容(rawText);
    };

    const baseMessages: 通用消息[] = [
        { role: 'system', content: systemPrompt }
    ];
    if (normalizedExtraPrompt) {
        baseMessages.push({ role: 'user', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
    }
    baseMessages.push({ role: 'user', content: userPrompt });

    try {
        return await 请求并解析(baseMessages, streamOptions);
    } catch (error) {
        const repairMessages: 通用消息[] = [
            { role: 'system', content: systemPrompt }
        ];
        if (normalizedExtraPrompt) {
            repairMessages.push({ role: 'user', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
        }
        repairMessages.push(
            { role: 'user', content: userPrompt },
            {
                role: 'user',
                content: `上一次输出未通过校验，原因如下：${error instanceof Error ? error.message : '输出不完整'}。\n请完整重写，并确保 <境界体系> 中覆盖所有 required 区块、全部映射值、全部阶段推进跳转和全部大境突破跳转。`
            }
        );
        return 请求并解析(repairMessages, undefined);
    }
};

const 提取世界演变标题区块 = (text: string): { updateBlock: string; commandBlock: string } => {
    const sections: Record<'说明' | '命令', string[]> = {
        说明: [],
        命令: []
    };
    const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
    let current: '说明' | '命令' | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (current) sections[current].push('');
            continue;
        }

        if (/^(?:【\s*)?(?:说明|世界更新|动态世界)(?:\s*】)?\s*[:：]?\s*(.*)$/i.test(line)) {
            current = '说明';
            const matched = line.match(/^(?:【\s*)?(?:说明|世界更新|动态世界)(?:\s*】)?\s*[:：]?\s*(.*)$/i);
            const firstLine = (matched?.[1] || '').trim();
            if (firstLine) sections[current].push(firstLine);
            continue;
        }
        if (/^(?:【\s*)?(?:命令|commands?|cmd)(?:\s*】)?\s*[:：]?\s*(.*)$/i.test(line)) {
            current = '命令';
            const matched = line.match(/^(?:【\s*)?(?:命令|commands?|cmd)(?:\s*】)?\s*[:：]?\s*(.*)$/i);
            const firstLine = (matched?.[1] || '').trim();
            if (firstLine) sections[current].push(firstLine);
            continue;
        }

        if (current) {
            sections[current].push(rawLine.trimEnd());
        }
    }

    return {
        updateBlock: sections.说明.join('\n').trim(),
        commandBlock: sections.命令.join('\n').trim()
    };
};

const 解析世界演变候选文本 = (text: string): { commands: TavernCommand[]; updates: string[] } => {
    const candidate = (text || '').trim();
    if (!candidate) return { commands: [], updates: [] };

    const updateBlock = 提取首个标签内容(candidate, '说明')
        || 提取首个标签内容(candidate, '世界更新')
        || 提取首个标签内容(candidate, '动态世界');
    const commandBlock = 提取首个标签内容(candidate, '命令');
    const titleBlocks = (!updateBlock && !commandBlock) ? 提取世界演变标题区块(candidate) : { updateBlock: '', commandBlock: '' };

    const updates = 解析动态世界块(updateBlock || titleBlocks.updateBlock);
    const primaryCommands = 解析命令块(commandBlock || titleBlocks.commandBlock);
    const fallbackCommands = primaryCommands.length === 0
        ? 解析命令块(candidate)
        : [];
    const commands = (primaryCommands.length > 0 ? primaryCommands : fallbackCommands)
        .map((cmd) => ({
            action: cmd.action,
            key: cmd.key,
            value: cmd.value
        })) as TavernCommand[];

    if (commands.length > 0 || updates.length > 0) {
        return { commands, updates };
    }

    return {
        commands: 解析命令块(candidate) as TavernCommand[],
        updates: []
    };
};

export const 解析世界演变响应 = (rawText: string): { commands: TavernCommand[]; updates: string[] } => {
    const source = (rawText || '').trim();
    if (!source) return { commands: [], updates: [] };

    const thinkingSegment = 提取首尾思考区段(source);
    const candidates = [
        (thinkingSegment.matched ? thinkingSegment.textWithoutThinking : source).trim(),
        thinkingSegment.matched
            ? source
                .replace(/<\s*\/\s*(thinking|think)\s*>/gi, '')
                .replace(/<\s*(thinking|think)\s*>/gi, '')
                .trim()
            : '',
        source
    ].filter((item, index, list) => Boolean(item) && list.indexOf(item) === index);

    for (const candidate of candidates) {
        const parsed = 解析世界演变候选文本(candidate);
        if (parsed.commands.length > 0 || parsed.updates.length > 0) {
            return parsed;
        }
    }

    return { commands: [], updates: [] };
};

const 解析变量校准响应 = (rawText: string): { commands: TavernCommand[]; reports: string[] } => {
    const source = (rawText || '').trim();
    if (!source) return { commands: [], reports: [] };

    const thinkingSegment = 提取首尾思考区段(source);
    let textWithoutThinking = (thinkingSegment.matched ? thinkingSegment.textWithoutThinking : source).trim();
    if (thinkingSegment.matched && !textWithoutThinking) {
        textWithoutThinking = source
            .replace(/<\s*\/\s*(thinking|think)\s*>/gi, '')
            .replace(/<\s*(thinking|think)\s*>/gi, '')
            .trim();
    }
    const reportBlock = 提取首个标签内容(textWithoutThinking, '说明')
        || 提取首个标签内容(textWithoutThinking, '校准说明')
        || 提取首个标签内容(textWithoutThinking, '校准报告')
        || 提取首个标签内容(textWithoutThinking, '说明');
    const commandBlock = 提取首个标签内容(textWithoutThinking, '命令');
    const reports = 解析动态世界块(reportBlock);

    const commands = 解析命令块((commandBlock || textWithoutThinking).trim())
        .map((cmd) => ({
            action: cmd.action,
            key: cmd.key,
            value: cmd.value
        })) as TavernCommand[];

    return { commands, reports };
};

export const generateWorldEvolutionUpdate = async (
    worldContext: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    extraPrompt?: string,
    cotPseudoHistoryPrompt?: string,
    cotPrompt?: string,
    fandomEnabled?: boolean,
    gptMode?: boolean,
    streamOptions?: WorldStreamOptions
): Promise<WorldEvolutionResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const normalizedExtraPrompt = (extraPrompt || '').trim();
    const normalizedCotPseudoPrompt = (cotPseudoHistoryPrompt || '').trim();
    const normalizedCotPrompt = (cotPrompt || '').trim();
    const systemPrompt = 构建世界演变系统提示词({ fandom: fandomEnabled === true });
    const userPrompt = [
        构建世界演变用户提示词(worldContext, { fandom: fandomEnabled === true }),
        normalizedExtraPrompt ? `【最终输出附加要求】\n${normalizedExtraPrompt}` : ''
    ].filter(Boolean).join('\n\n');
    const fandomSystemPrompt = fandomEnabled ? 同人世界演变附加系统提示词 : '';
    const fandomCotPrompt = fandomEnabled ? 同人世界演变附加COT提示词 : '';
    const messagesRaw: 通用消息[] = [
        { role: 'system', content: systemPrompt }
    ];
    if (fandomSystemPrompt) {
        messagesRaw.push({ role: 'system', content: fandomSystemPrompt });
    }
    if (normalizedExtraPrompt) {
        messagesRaw.push({ role: 'system', content: `【额外要求提示词】\n${normalizedExtraPrompt}` });
    }
    if (gptMode) {
        messagesRaw.push({ role: 'user', content: userPrompt });
    } else {
        messagesRaw.push({ role: 'system', content: userPrompt });
    }
    if (normalizedCotPrompt) {
        messagesRaw.push({ role: 'system', content: normalizedCotPrompt });
        if (fandomCotPrompt) {
            messagesRaw.push({ role: 'system', content: fandomCotPrompt });
        }
        if (!gptMode) {
            messagesRaw.push(构建独立任务触发消息(userPrompt, false));
        }
    } else if (fandomCotPrompt) {
        messagesRaw.push({ role: 'system', content: fandomCotPrompt });
    }
    if (normalizedCotPseudoPrompt) {
        messagesRaw.push({ role: 'assistant', content: normalizedCotPseudoPrompt });
    }
    const messages = 规范化文本补全消息链(messagesRaw, { 保留System: true, 合并同角色: false });

    const rawText = await 请求模型文本(apiConfig, messages, {
        temperature: 0.4,
        signal,
        errorDetailLimit: Number.POSITIVE_INFINITY,
        streamOptions
    });
    const parsed = 解析世界演变响应(rawText);
    return {
        commands: parsed.commands,
        updates: parsed.updates,
        rawText
    };
};

export const generateVariableCalibrationUpdate = async (
    params: {
        stateJson: string;
        response: GameResponse;
        /**
         * Variable rules / formulas / structure prompt set for the variable-generation model.
         */
        calibrationRulesContext?: string;
        worldEvolutionEnabled?: boolean;
        worldEvolutionUpdated?: boolean;
        builtinPromptEntries?: 内置提示词条目结构[];
        survivalNeedsEnabled?: boolean;
        cultivationSystemEnabled?: boolean;
        recentRounds?: Array<{
            回合: number;
            玩家输入: string;
            正文: string;
            本回合命令: string[];
            校准说明: string[];
            校准命令: string[];
        }>;
        isOpeningRound?: boolean;
        openingTaskContext?: {
            currentGameTime?: string;
            openingRoleSetupText?: string;
            openingConfigText?: string;
        };
    },
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    extraPrompt?: string,
    onStreamDelta?: (delta: string, accumulated: string) => void,
    gptMode?: boolean
): Promise<VariableCalibrationResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const systemPrompt = 获取内置提示词槽位内容({
        entries: params.builtinPromptEntries,
        slotId: params.worldEvolutionUpdated === true
            ? 世界书本体槽位.变量模型系统_世界演变已更新
            : 世界书本体槽位.变量模型系统_常规,
        fallback: ''
    });
    const 默认系统补充提示词 = 构建变量模型系统提示词({
        worldEvolutionEnabled: params.worldEvolutionUpdated === true,
        worldEvolutionUpdated: params.worldEvolutionUpdated === true,
        survivalNeedsEnabled: params.survivalNeedsEnabled !== false,
        cultivationSystemEnabled: params.cultivationSystemEnabled !== false
    }).trim();
    const 去重后的系统补充提示词 = (() => {
        const source = (systemPrompt || '').trim();
        if (!source) return '';
        if (source === 默认系统补充提示词) return '';
        if (source.startsWith(默认系统补充提示词)) {
            return source.slice(默认系统补充提示词.length).trim();
        }
        return source;
    })();
    const userPromptExtraRules = 获取内置提示词槽位内容({
        entries: params.builtinPromptEntries,
        slotId: params.worldEvolutionUpdated === true
            ? 世界书本体槽位.变量模型用户_世界演变已更新
            : 世界书本体槽位.变量模型用户_常规,
        fallback: 构建变量模型用户附加规则提示词()
    });
    const normalizedVariableExtraPrompt = (extraPrompt || '').trim();
    const taskPrompt = [
        构建变量模型任务提示词({
            stateJson: params.stateJson,
            response: params.response,
            extraPrompt,
            isOpeningRound: params.isOpeningRound === true,
            openingTaskContext: params.openingTaskContext
        }),
        normalizedVariableExtraPrompt ? `【最终输出附加要求】\n${normalizedVariableExtraPrompt}` : ''
    ].filter(Boolean).join('\n\n');
    const variableCotPrompt = 获取内置提示词槽位内容({
        entries: params.builtinPromptEntries,
        slotId: 世界书本体槽位.变量模型COT,
        fallback: 获取变量校准COT提示词({
            启用修炼体系: params.cultivationSystemEnabled
        })
    });
    const rulesContext = (params.calibrationRulesContext || '').trim();
    const messages = 规范化文本补全消息链([
        { role: 'system', content: `【AI身份提示词】\n${构建变量模型身份提示词()}` },
        {
            role: 'system',
            content: `【职责】\n${构建变量模型职责提示词({
                survivalNeedsEnabled: params.survivalNeedsEnabled !== false,
                cultivationSystemEnabled: params.cultivationSystemEnabled !== false
            })}`
        },
        ...(去重后的系统补充提示词
            ? [{ role: 'system' as const, content: `【系统补充】\n${去重后的系统补充提示词}` }]
            : []),
        ...(rulesContext
            ? [{ role: 'system' as const, content: `【变量相关提示词】\n${rulesContext}` }]
            : []),
        ...(userPromptExtraRules
            ? [{ role: 'system' as const, content: `【附加变量规则】\n${userPromptExtraRules}` }]
            : []),
        { role: 'system', content: `【变量生成COT】\n${variableCotPrompt}` },
        { role: 'system', content: 构建变量模型输出格式提示词() },
        { role: gptMode ? 'user' : 'assistant', content: taskPrompt },
        ...(!gptMode ? [构建独立任务触发消息('开始任务', false)] : []),
        { role: 'assistant', content: 构建变量模型COT伪装提示词() || 默认COT伪装历史消息提示词.trim() }
    ], { 保留System: true, 合并同角色: false });

    const rawText = await 请求模型文本(apiConfig, messages, {
        temperature: 0.2,
        signal,
        errorDetailLimit: Number.POSITIVE_INFINITY,
        streamOptions: onStreamDelta
            ? {
                stream: true,
                onDelta: onStreamDelta
            }
            : undefined
    });
    const parsed = 解析变量校准响应(rawText);

    return {
        commands: parsed.commands,
        reports: parsed.reports,
        rawText
    };
};

const 解析说明块 = (text: string): string[] => 解析动态世界块(text);

const 统计括号差值 = (value: string): number => {
    let balance = 0;
    for (const char of (value || '')) {
        if (char === '(' || char === '（') balance += 1;
        if (char === ')' || char === '）') balance -= 1;
    }
    return balance;
};

const 存在未闭合括号 = (value: string): boolean => 统计括号差值(value) > 0;

const 新小说拆分标题别名映射 = {
    组号: ['组号'],
    章节范围: ['章节范围'],
    章节标题: ['章节标题'],
    是否开局组: ['是否开局组'],
    本组概括: ['本组概括'],
    开局已成立事实: ['开局已成立事实'],
    前组延续事实: ['前组延续事实'],
    本组结束状态: ['本组结束状态'],
    给下一组参考: ['给下一组参考'],
    原著硬约束: ['原著硬约束'],
    可提前铺垫: ['可提前铺垫'],
    登场角色: ['登场角色'],
    角色档案: ['角色档案', '人物档案'],
    势力档案: ['势力档案', '组织档案'],
    地图地点档案: ['地图地点档案', '地点档案', '地图档案'],
    物品档案: ['物品档案', '道具档案', '物件档案'],
    世界观规则: ['世界观规则', '世界规则'],
    世界边界规则: ['世界边界规则', '禁忌规则', '边界规则'],
    人物关系: ['人物关系', '角色关系'],
    势力关系: ['势力关系', '组织关系'],
    伏笔线索: ['伏笔线索', '伏笔'],
    回收点: ['回收点', '收束点', '回扣点'],
    章节节奏: ['章节节奏', '节奏节拍', '章节节拍'],
    时间线起点: ['时间线起点', '本组开始时间', '本组开始时间线'],
    时间线终点: ['时间线终点', '本组结束时间', '本组结束时间线'],
    关键事件: ['关键事件'],
    角色推进: ['角色推进']
} as const;

type 新小说拆分标题键 = keyof typeof 新小说拆分标题别名映射;

const 新小说拆分标题别名到键映射 = new Map<string, 新小说拆分标题键>(
    Object.entries(新小说拆分标题别名映射).flatMap(([key, aliases]) => (
        aliases.map((alias) => [alias, key as 新小说拆分标题键] as const)
    ))
);

const 新小说拆分标题别名模式 = Array.from(新小说拆分标题别名到键映射.keys())
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

const 新小说拆分去重文本列表 = (items: string[], maxCount?: number): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
        const normalized = String(raw || '').trim();
        if (!normalized || normalized === '无') continue;
        const key = normalized.replace(/\s+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
        if (typeof maxCount === 'number' && result.length >= maxCount) break;
    }
    return result;
};

const 获取新小说拆分结果候选文本列表 = (rawText: string): string[] => {
    const source = (rawText || '').trim();
    if (!source) return [];

    const thinkingSegment = 提取首尾思考区段(source);
    let textWithoutThinking = (thinkingSegment.matched ? thinkingSegment.textWithoutThinking : source).trim();
    if (thinkingSegment.matched && !textWithoutThinking) {
        textWithoutThinking = source
            .replace(/<\s*\/\s*(thinking|think)\s*>/gi, '')
            .replace(/<\s*(thinking|think)\s*>/gi, '')
            .trim();
    }

    return 新小说拆分去重文本列表([
        提取首个标签内容(textWithoutThinking, '结果') || '',
        textWithoutThinking,
        提取首个标签内容(source, '结果') || '',
        source
    ]);
};

const 规范化新小说拆分标题文本 = (text: string): string => {
    const source = (text || '').replace(/\r\n/g, '\n');
    if (!source.trim()) return '';
    const wrappedHeadingPattern = new RegExp(
        `([^\\n])((?:【\\s*|\\[\\s*|<\\s*|\\*\\*\\s*)(${新小说拆分标题别名模式})(?:\\s*】|\\s*\\]|\\s*>|\\s*\\*\\*))`,
        'g'
    );
    return source.replace(wrappedHeadingPattern, '$1\n$2');
};

const 匹配新小说拆分标题行 = (line: string): { key: 新小说拆分标题键; content: string } | null => {
    const matched = line.trim().match(
        new RegExp(
            `^(?:#+\\s*)?(?:[-*•]\\s*)?(?:【\\s*|\\[\\s*|<\\s*|\\*\\*\\s*)?(${新小说拆分标题别名模式})(?:\\s*】|\\s*\\]|\\s*>|\\s*\\*\\*)?\\s*[:：-]?\\s*(.*)$`
        )
    );
    if (!matched) return null;
    const key = 新小说拆分标题别名到键映射.get((matched[1] || '').trim());
    if (!key) return null;
    return {
        key,
        content: (matched[2] || '').trim()
    };
};

const 提取新小说拆分标题区块 = (text: string): Record<新小说拆分标题键, string> => {
    const sections: Record<新小说拆分标题键, string[]> = {
        组号: [],
        章节范围: [],
        章节标题: [],
        是否开局组: [],
        本组概括: [],
        开局已成立事实: [],
        前组延续事实: [],
        本组结束状态: [],
        给下一组参考: [],
        原著硬约束: [],
        可提前铺垫: [],
        登场角色: [],
        角色档案: [],
        势力档案: [],
        地图地点档案: [],
        物品档案: [],
        世界观规则: [],
        世界边界规则: [],
        人物关系: [],
        势力关系: [],
        伏笔线索: [],
        回收点: [],
        章节节奏: [],
        时间线起点: [],
        时间线终点: [],
        关键事件: [],
        角色推进: []
    };
    const lines = 规范化新小说拆分标题文本(text).split('\n');
    let current: 新小说拆分标题键 | null = null;

    for (const rawLine of lines) {
        const matched = 匹配新小说拆分标题行(rawLine);
        if (matched) {
            current = matched.key;
            if (matched.content) sections[current].push(matched.content);
            continue;
        }
        if (current) {
            sections[current].push(rawLine.trimEnd());
        }
    }

    return Object.fromEntries(
        Object.entries(sections).map(([key, values]) => [key, values.join('\n').trim()])
    ) as Record<新小说拆分标题键, string>;
};

const 解析新小说拆分列表区块 = (text: string): string[] => {
    const result: string[] = [];
    let current = '';
    const lines = (text || '').replace(/\r\n/g, '\n').split('\n');

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || /^无$/i.test(line)) continue;
        const itemMatch = line.match(/^(?:[-*•]\s*|\d+[.)、]\s*|\[\d+\]\s*)(.+)$/);
        if (itemMatch) {
            const nextItem = (itemMatch[1] || '').trim();
            if (current && nextItem && 存在未闭合括号(current)) {
                current = `${current} ${nextItem}`.trim();
                continue;
            }
            if (current) result.push(current.trim());
            current = nextItem;
            continue;
        }
        if (current) {
            current = `${current} ${line}`.trim();
            continue;
        }
        result.push(line);
    }

    if (current) result.push(current.trim());
    return result.filter(Boolean);
};

const 解析新小说拆分单段区块 = (text: string): string => 规范化新小说拆分概括文本(text);

const 解析新小说拆分条目块 = (text: string): Array<Record<string, string>> => {
    const source = (text || '').replace(/\r\n/g, '\n').trim();
    if (!source || /^无$/i.test(source)) return [];

    const lines = source.split('\n');
    const entries: Array<Record<string, string>> = [];
    let current: Record<string, string> | null = null;
    let lastKey = '';

    const pushCurrent = () => {
        if (current && Object.keys(current).length > 0) entries.push(current);
        current = null;
        lastKey = '';
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const entryMatch = line.match(/^\[(\d+)\]\s*(.*)$/);
        if (entryMatch) {
            pushCurrent();
            current = {};
            const inline = (entryMatch[2] || '').trim();
            if (inline) {
                const kvInline = inline.match(/^([^:：]+)\s*[:：]\s*(.*)$/);
                if (kvInline) {
                    const key = (kvInline[1] || '').trim();
                    current[key] = (kvInline[2] || '').trim();
                    lastKey = key;
                }
            }
            continue;
        }
        if (!current) current = {};
        const kvMatch = line.match(/^(?:[-*•]\s*)?([^:：]+)\s*[:：]\s*(.*)$/);
        if (kvMatch) {
            const key = (kvMatch[1] || '').trim();
            current[key] = (kvMatch[2] || '').trim();
            lastKey = key;
            continue;
        }
        if (lastKey) {
            current[lastKey] = `${current[lastKey] || ''}\n${line}`.trim();
        }
    }

    pushCurrent();
    return entries;
};

const 解析新小说拆分分隔列表 = (value: string): string[] => (value || '')
    .split(/[、,，/｜|；;]/)
    .map((item) => item.trim())
    .filter((item) => item && item !== '无');

const 解析新小说拆分重要性 = (value: unknown): '核心' | '重要' | '一般' => {
    const text = String(value || '').trim();
    if (text === '核心' || /core|主角|核心/.test(text)) return '核心';
    if (text === '重要' || /important|关键|主要/.test(text)) return '重要';
    return '一般';
};

const 解析新小说拆分地点层级 = (value: unknown): '寰宇' | '大地点' | '中地点' | '小地点' | '区地点' | '子地点' | '未知' => {
    const text = String(value || '').trim();
    if (text === '具体地点') return '区地点';
    return text === '寰宇' || text === '大地点' || text === '中地点' || text === '小地点' || text === '区地点' || text === '子地点'
        ? text
        : '未知';
};

const 解析新小说拆分数字 = (value: string, fallback = 1): number => {
    const numeric = Number((value || '').trim());
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
};

const 解析新小说拆分布尔 = (value: string): boolean => /^(?:是|true|yes|y|1)$/i.test((value || '').trim());

const 规范化新小说拆分信息可见性 = (raw: any): NovelDecompositionVisibilityAnalysisResult => ({
    谁知道: 新小说拆分去重文本列表(Array.isArray(raw?.谁知道) ? raw.谁知道 : [], 12),
    谁不知道: 新小说拆分去重文本列表(Array.isArray(raw?.谁不知道) ? raw.谁不知道 : [], 12),
    是否仅读者视角可见: raw?.是否仅读者视角可见 === true
});

const 合并新小说拆分信息可见性 = (
    left: NovelDecompositionVisibilityAnalysisResult,
    right: NovelDecompositionVisibilityAnalysisResult
): NovelDecompositionVisibilityAnalysisResult => ({
    谁知道: 新小说拆分去重文本列表([...(left?.谁知道 || []), ...(right?.谁知道 || [])], 12),
    谁不知道: 新小说拆分去重文本列表([...(left?.谁不知道 || []), ...(right?.谁不知道 || [])], 12),
    是否仅读者视角可见: left?.是否仅读者视角可见 === true || right?.是否仅读者视角可见 === true
});

const 规范化新小说拆分可见信息条目 = (raw: any): NovelDecompositionVisibleInfoItemAnalysisResult => ({
    内容: typeof raw?.内容 === 'string'
        ? raw.内容.trim()
        : typeof raw?.content === 'string'
            ? raw.content.trim()
            : '',
    信息可见性: 规范化新小说拆分信息可见性(raw?.信息可见性)
});

const 新小说拆分去重可见信息条目 = (
    items: NovelDecompositionVisibleInfoItemAnalysisResult[],
    maxCount?: number
): NovelDecompositionVisibleInfoItemAnalysisResult[] => {
    const ordered: NovelDecompositionVisibleInfoItemAnalysisResult[] = [];
    const indexMap = new Map<string, number>();

    for (const raw of Array.isArray(items) ? items : []) {
        const item = 规范化新小说拆分可见信息条目(raw);
        if (!item.内容 || item.内容 === '无') continue;
        const key = item.内容.replace(/\s+/g, '');
        const existingIndex = indexMap.get(key);
        if (typeof existingIndex === 'number') {
            ordered[existingIndex] = {
                ...ordered[existingIndex],
                信息可见性: 合并新小说拆分信息可见性(ordered[existingIndex].信息可见性, item.信息可见性)
            };
            continue;
        }
        indexMap.set(key, ordered.length);
        ordered.push(item);
        if (typeof maxCount === 'number' && ordered.length >= maxCount) break;
    }

    return ordered;
};

const 解析新小说拆分信息可见性 = (entry: Record<string, string>): NovelDecompositionVisibilityAnalysisResult => (
    规范化新小说拆分信息可见性({
        谁知道: 解析新小说拆分分隔列表(entry.谁知道 || ''),
        谁不知道: 解析新小说拆分分隔列表(entry.谁不知道 || ''),
        是否仅读者视角可见: 解析新小说拆分布尔(entry.是否仅读者视角可见 || '')
    })
);

const 解析新小说拆分JSON信息可见性 = (raw: any): NovelDecompositionVisibilityAnalysisResult => {
    const source = raw?.信息可见性 && typeof raw.信息可见性 === 'object'
        ? raw.信息可见性
        : raw?.visibility && typeof raw.visibility === 'object'
            ? raw.visibility
            : raw;
    const 转列表 = (value: unknown): string[] => Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : typeof value === 'string'
            ? 解析新小说拆分分隔列表(value)
            : [];
    return 规范化新小说拆分信息可见性({
        谁知道: 转列表(source?.谁知道 ?? source?.knownBy),
        谁不知道: 转列表(source?.谁不知道 ?? source?.unknownTo),
        是否仅读者视角可见: source?.是否仅读者视角可见 === true
            || source?.readerOnly === true
    });
};

const 解析新小说拆分可见信息条目 = (entry: Record<string, string>): NovelDecompositionVisibleInfoItemAnalysisResult => ({
    内容: (entry.内容 || '').trim(),
    信息可见性: 解析新小说拆分信息可见性(entry)
});

const 解析新小说拆分JSON可见信息条目 = (raw: any): NovelDecompositionVisibleInfoItemAnalysisResult => ({
    内容: typeof raw?.内容 === 'string'
        ? raw.内容.trim()
        : typeof raw?.content === 'string'
            ? raw.content.trim()
            : '',
    信息可见性: 解析新小说拆分JSON信息可见性(raw)
});

const 规范化新小说拆分概括文本 = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const source = value.replace(/\r\n/g, '\n').trim();
    if (!source || /^无$/i.test(source)) return '';
    return source
        .split('\n')
        .map((line) => line.trim().replace(/[^\S\r\n]+/g, ' '))
        .filter(Boolean)
        .join('\n')
        .trim();
};

const 规范化新小说拆分结果 = (base: Omit<NovelDecompositionAnalysisResult, 'rawText'>): Omit<NovelDecompositionAnalysisResult, 'rawText'> => ({
    groupNumber: Math.max(1, Number(base.groupNumber) || 1),
    chapterRange: typeof base.chapterRange === 'string' ? base.chapterRange.trim() : '',
    chapterTitles: 新小说拆分去重文本列表(base.chapterTitles || [], 24),
    isOpeningGroup: base.isOpeningGroup === true,
    summary: 规范化新小说拆分概括文本(base.summary),
    openingFacts: 新小说拆分去重文本列表(base.openingFacts || [], 12),
    continuationFacts: 新小说拆分去重文本列表(base.continuationFacts || [], 12),
    endStates: 新小说拆分去重文本列表(base.endStates || [], 12),
    nextGroupReferences: 新小说拆分去重文本列表(base.nextGroupReferences || [], 12),
    hardConstraints: 新小说拆分去重可见信息条目(base.hardConstraints || [], 12),
    foreshadowing: 新小说拆分去重可见信息条目(base.foreshadowing || [], 12),
    appearingCharacters: 新小说拆分去重文本列表(base.appearingCharacters || [], 24),
    timelineStart: typeof base.timelineStart === 'string' ? base.timelineStart.trim() : '',
    timelineEnd: typeof base.timelineEnd === 'string' ? base.timelineEnd.trim() : '',
    keyEvents: Array.isArray(base.keyEvents)
        ? base.keyEvents
            .map((event) => ({
                事件名: typeof event?.事件名 === 'string' ? event.事件名.trim() : '',
                事件说明: typeof event?.事件说明 === 'string' ? event.事件说明.trim() : '',
                开始时间: typeof event?.开始时间 === 'string' ? event.开始时间.trim() : '',
                最早开始时间: typeof event?.最早开始时间 === 'string' ? event.最早开始时间.trim() : '',
                最迟开始时间: typeof event?.最迟开始时间 === 'string' ? event.最迟开始时间.trim() : '',
                结束时间: typeof event?.结束时间 === 'string' ? event.结束时间.trim() : '',
                前置条件: 新小说拆分去重文本列表(event?.前置条件 || [], 12),
                触发条件: 新小说拆分去重文本列表(event?.触发条件 || [], 12),
                阻断条件: 新小说拆分去重文本列表(event?.阻断条件 || [], 12),
                事件结果: 新小说拆分去重文本列表(event?.事件结果 || [], 12),
                对下一组影响: 新小说拆分去重文本列表(event?.对下一组影响 || [], 12),
                信息可见性: 规范化新小说拆分信息可见性(event?.信息可见性)
            }))
            .filter((event) => event.事件名 || event.事件说明)
        : [],
    characterProgressions: Array.isArray(base.characterProgressions)
        ? base.characterProgressions
            .map((item) => ({
                角色名: typeof item?.角色名 === 'string' ? item.角色名.trim() : '',
                本组前状态: 新小说拆分去重文本列表(item?.本组前状态 || [], 12),
                本组变化: 新小说拆分去重文本列表(item?.本组变化 || [], 12),
                本组后状态: 新小说拆分去重文本列表(item?.本组后状态 || [], 12),
                对下一组影响: 新小说拆分去重文本列表(item?.对下一组影响 || [], 12)
            }))
            .filter((item) => item.角色名)
        : [],
    characterProfiles: Array.isArray(base.characterProfiles)
        ? base.characterProfiles
            .map((item) => 规范化新小说拆分角色档案(item))
            .filter((item) => item.名称)
        : [],
    factionProfiles: Array.isArray(base.factionProfiles)
        ? base.factionProfiles
            .map((item) => 规范化新小说拆分势力档案(item))
            .filter((item) => item.名称)
        : [],
    locationProfiles: Array.isArray(base.locationProfiles)
        ? base.locationProfiles
            .map((item) => 规范化新小说拆分地点档案(item))
            .filter((item) => item.名称)
        : [],
    itemProfiles: Array.isArray(base.itemProfiles)
        ? base.itemProfiles
            .map((item) => 规范化新小说拆分物品档案(item))
            .filter((item) => item.名称)
        : [],
    worldRules: 新小说拆分去重文本列表(base.worldRules || [], 24),
    worldBoundaryRules: 新小说拆分去重文本列表(base.worldBoundaryRules || [], 24),
    characterRelations: 新小说拆分去重文本列表(base.characterRelations || [], 24),
    factionRelations: 新小说拆分去重文本列表(base.factionRelations || [], 24),
    foreshadowingThreads: 新小说拆分去重文本列表(base.foreshadowingThreads || [], 24),
    payoffPoints: 新小说拆分去重文本列表(base.payoffPoints || [], 24),
    chapterRhythm: 新小说拆分去重文本列表(base.chapterRhythm || [], 24)
});

const 提取新小说拆分结果JSON = (rawText: string): any => {
    const candidates = 获取新小说拆分结果候选文本列表(rawText);
    let latestError = '未获得有效 JSON';

    for (const candidate of candidates) {
        const parsed = parseJsonWithRepair<any>(candidate);
        if (parsed.value && typeof parsed.value === 'object') return parsed.value;
        latestError = parsed.error || latestError;
    }

    throw new Error(`小说拆分解析失败: 未匹配到有效的 <结果> 标签结构，且 JSON 解析失败（${latestError}）`);
};

const 解析新小说拆分标签结果 = (rawText: string): NovelDecompositionAnalysisResult | null => {
    const candidates = 获取新小说拆分结果候选文本列表(rawText);
    if (candidates.length <= 0) return null;

    for (const candidate of candidates) {
        const sections = 提取新小说拆分标题区块(candidate);
        const hasStructuredContent = Object.values(sections).some((item) => Boolean(item));
        if (!hasStructuredContent) continue;

        return {
            ...规范化新小说拆分结果({
                groupNumber: 解析新小说拆分数字(sections.组号, 1),
                chapterRange: sections.章节范围,
                chapterTitles: 解析新小说拆分列表区块(sections.章节标题),
                isOpeningGroup: 解析新小说拆分布尔(sections.是否开局组),
                summary: 解析新小说拆分单段区块(sections.本组概括),
                openingFacts: 解析新小说拆分列表区块(sections.开局已成立事实),
                continuationFacts: 解析新小说拆分列表区块(sections.前组延续事实),
                endStates: 解析新小说拆分列表区块(sections.本组结束状态),
                nextGroupReferences: 解析新小说拆分列表区块(sections.给下一组参考),
                hardConstraints: 解析新小说拆分条目块(sections.原著硬约束)
                    .map((entry) => 解析新小说拆分可见信息条目(entry))
                    .filter((item) => item.内容),
                foreshadowing: 解析新小说拆分条目块(sections.可提前铺垫)
                    .map((entry) => 解析新小说拆分可见信息条目(entry))
                    .filter((item) => item.内容),
                appearingCharacters: 解析新小说拆分列表区块(sections.登场角色),
                characterProfiles: 解析新小说拆分条目块(sections.角色档案).map((entry) => 规范化新小说拆分角色档案({
                    ...entry,
                    关系摘要: 解析新小说拆分分隔列表(entry.关系摘要 || ''),
                    状态摘要: 解析新小说拆分分隔列表(entry.状态摘要 || '')
                })),
                factionProfiles: 解析新小说拆分条目块(sections.势力档案).map((entry) => 规范化新小说拆分势力档案({
                    ...entry,
                    代表人物: 解析新小说拆分分隔列表(entry.代表人物 || ''),
                    关系摘要: 解析新小说拆分分隔列表(entry.关系摘要 || '')
                })),
                locationProfiles: 解析新小说拆分条目块(sections.地图地点档案).map((entry) => 规范化新小说拆分地点档案({
                    ...entry,
                    关键设施: 解析新小说拆分分隔列表(entry.关键设施 || '')
                })),
                itemProfiles: 解析新小说拆分条目块(sections.物品档案).map((entry) => 规范化新小说拆分物品档案(entry)),
                worldRules: 解析新小说拆分列表区块(sections.世界观规则),
                worldBoundaryRules: 解析新小说拆分列表区块(sections.世界边界规则),
                characterRelations: 解析新小说拆分列表区块(sections.人物关系),
                factionRelations: 解析新小说拆分列表区块(sections.势力关系),
                foreshadowingThreads: 解析新小说拆分列表区块(sections.伏笔线索),
                payoffPoints: 解析新小说拆分列表区块(sections.回收点),
                chapterRhythm: 解析新小说拆分列表区块(sections.章节节奏),
                timelineStart: (sections.时间线起点 || '').trim(),
                timelineEnd: (sections.时间线终点 || '').trim(),
                keyEvents: 解析新小说拆分条目块(sections.关键事件).map((entry) => ({
                    事件名: (entry.事件名 || '').trim(),
                    事件说明: (entry.事件说明 || '').trim(),
                    开始时间: (entry.开始时间 || '').trim(),
                    最早开始时间: (entry.最早开始时间 || '').trim(),
                    最迟开始时间: (entry.最迟开始时间 || '').trim(),
                    结束时间: (entry.结束时间 || '').trim(),
                    前置条件: 解析新小说拆分分隔列表(entry.前置条件 || ''),
                    触发条件: 解析新小说拆分分隔列表(entry.触发条件 || ''),
                    阻断条件: 解析新小说拆分分隔列表(entry.阻断条件 || ''),
                    事件结果: 解析新小说拆分分隔列表(entry.事件结果 || ''),
                    对下一组影响: 解析新小说拆分分隔列表(entry.对下一组影响 || ''),
                    信息可见性: 解析新小说拆分信息可见性(entry)
                })).filter((item) => item.事件名 || item.事件说明),
                characterProgressions: 解析新小说拆分条目块(sections.角色推进).map((entry) => ({
                    角色名: (entry.角色名 || '').trim(),
                    本组前状态: 解析新小说拆分分隔列表(entry.本组前状态 || ''),
                    本组变化: 解析新小说拆分分隔列表(entry.本组变化 || ''),
                    本组后状态: 解析新小说拆分分隔列表(entry.本组后状态 || ''),
                    对下一组影响: 解析新小说拆分分隔列表(entry.对下一组影响 || '')
                })).filter((item) => item.角色名)
            }),
            rawText
        };
    }

    return null;
};

const 解析新小说拆分结果 = (rawText: string): NovelDecompositionAnalysisResult => {
    const taggedResult = 解析新小说拆分标签结果(rawText);
    if (taggedResult) return taggedResult;

    const data = 提取新小说拆分结果JSON(rawText);
    return {
        ...规范化新小说拆分结果({
            groupNumber: 解析新小说拆分数字(String(data?.groupNumber ?? data?.组号 ?? ''), 1),
            chapterRange: typeof data?.chapterRange === 'string' ? data.chapterRange.trim() : typeof data?.章节范围 === 'string' ? data.章节范围.trim() : '',
            chapterTitles: Array.isArray(data?.chapterTitles)
                ? data.chapterTitles.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.章节标题)
                    ? data.章节标题.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            isOpeningGroup: typeof data?.isOpeningGroup === 'boolean'
                ? data.isOpeningGroup
                : typeof data?.是否开局组 === 'boolean'
                    ? data.是否开局组
                    : 解析新小说拆分布尔(String(data?.是否开局组 ?? '')),
            summary: typeof data?.summary === 'string'
                ? data.summary.trim()
                : typeof data?.本组概括 === 'string'
                    ? data.本组概括.trim()
                    : '',
            openingFacts: Array.isArray(data?.openingFacts)
                ? data.openingFacts.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.开局已成立事实)
                    ? data.开局已成立事实.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            continuationFacts: Array.isArray(data?.continuationFacts)
                ? data.continuationFacts.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.前组延续事实)
                    ? data.前组延续事实.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            endStates: Array.isArray(data?.endStates)
                ? data.endStates.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.本组结束状态)
                    ? data.本组结束状态.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            nextGroupReferences: Array.isArray(data?.nextGroupReferences)
                ? data.nextGroupReferences.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.给下一组参考)
                    ? data.给下一组参考.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            hardConstraints: Array.isArray(data?.hardConstraints)
                ? data.hardConstraints
                    .map((item: any) => 解析新小说拆分JSON可见信息条目(item))
                    .filter((item: any) => item.内容)
                : Array.isArray(data?.原著硬约束)
                    ? data.原著硬约束
                        .map((item: any) => 解析新小说拆分JSON可见信息条目(item))
                        .filter((item: any) => item.内容)
                    : [],
            foreshadowing: Array.isArray(data?.foreshadowing)
                ? data.foreshadowing
                    .map((item: any) => 解析新小说拆分JSON可见信息条目(item))
                    .filter((item: any) => item.内容)
                : Array.isArray(data?.可提前铺垫)
                    ? data.可提前铺垫
                        .map((item: any) => 解析新小说拆分JSON可见信息条目(item))
                        .filter((item: any) => item.内容)
                    : [],
            appearingCharacters: Array.isArray(data?.appearingCharacters)
                ? data.appearingCharacters.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.登场角色)
                    ? data.登场角色.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            characterProfiles: Array.isArray(data?.characterProfiles)
                ? data.characterProfiles.map((item: any) => 规范化新小说拆分角色档案(item)).filter((item: any) => item.名称)
                : Array.isArray(data?.角色档案)
                    ? data.角色档案.map((item: any) => 规范化新小说拆分角色档案(item)).filter((item: any) => item.名称)
                    : [],
            factionProfiles: Array.isArray(data?.factionProfiles)
                ? data.factionProfiles.map((item: any) => 规范化新小说拆分势力档案(item)).filter((item: any) => item.名称)
                : Array.isArray(data?.势力档案)
                    ? data.势力档案.map((item: any) => 规范化新小说拆分势力档案(item)).filter((item: any) => item.名称)
                    : [],
            locationProfiles: Array.isArray(data?.locationProfiles)
                ? data.locationProfiles.map((item: any) => 规范化新小说拆分地点档案(item)).filter((item: any) => item.名称)
                : Array.isArray(data?.地图地点档案)
                    ? data.地图地点档案.map((item: any) => 规范化新小说拆分地点档案(item)).filter((item: any) => item.名称)
                    : [],
            itemProfiles: Array.isArray(data?.itemProfiles)
                ? data.itemProfiles.map((item: any) => 规范化新小说拆分物品档案(item)).filter((item: any) => item.名称)
                : Array.isArray(data?.物品档案)
                    ? data.物品档案.map((item: any) => 规范化新小说拆分物品档案(item)).filter((item: any) => item.名称)
                    : [],
            worldRules: Array.isArray(data?.worldRules)
                ? data.worldRules.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.世界观规则)
                    ? data.世界观规则.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            worldBoundaryRules: Array.isArray(data?.worldBoundaryRules)
                ? data.worldBoundaryRules.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.世界边界规则)
                    ? data.世界边界规则.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            characterRelations: Array.isArray(data?.characterRelations)
                ? data.characterRelations.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.人物关系)
                    ? data.人物关系.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            factionRelations: Array.isArray(data?.factionRelations)
                ? data.factionRelations.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.势力关系)
                    ? data.势力关系.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            foreshadowingThreads: Array.isArray(data?.foreshadowingThreads)
                ? data.foreshadowingThreads.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.伏笔线索)
                    ? data.伏笔线索.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            payoffPoints: Array.isArray(data?.payoffPoints)
                ? data.payoffPoints.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.回收点)
                    ? data.回收点.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            chapterRhythm: Array.isArray(data?.chapterRhythm)
                ? data.chapterRhythm.map((item: any) => String(item || '').trim()).filter(Boolean)
                : Array.isArray(data?.章节节奏)
                    ? data.章节节奏.map((item: any) => String(item || '').trim()).filter(Boolean)
                    : [],
            timelineStart: typeof data?.timelineStart === 'string'
                ? data.timelineStart.trim()
                : typeof data?.时间线起点 === 'string'
                    ? data.时间线起点.trim()
                    : typeof data?.本组开始时间 === 'string'
                        ? data.本组开始时间.trim()
                        : '',
            timelineEnd: typeof data?.timelineEnd === 'string'
                ? data.timelineEnd.trim()
                : typeof data?.时间线终点 === 'string'
                    ? data.时间线终点.trim()
                    : typeof data?.本组结束时间 === 'string'
                        ? data.本组结束时间.trim()
                        : '',
            keyEvents: Array.isArray(data?.keyEvents)
                ? data.keyEvents.map((item: any) => ({
                    事件名: typeof item?.事件名 === 'string' ? item.事件名.trim() : typeof item?.name === 'string' ? item.name.trim() : '',
                    事件说明: typeof item?.事件说明 === 'string' ? item.事件说明.trim() : typeof item?.description === 'string' ? item.description.trim() : '',
                    开始时间: typeof item?.开始时间 === 'string' ? item.开始时间.trim() : typeof item?.startTime === 'string' ? item.startTime.trim() : '',
                    最早开始时间: typeof item?.最早开始时间 === 'string' ? item.最早开始时间.trim() : typeof item?.earliestStartTime === 'string' ? item.earliestStartTime.trim() : '',
                    最迟开始时间: typeof item?.最迟开始时间 === 'string' ? item.最迟开始时间.trim() : typeof item?.latestStartTime === 'string' ? item.latestStartTime.trim() : '',
                    结束时间: typeof item?.结束时间 === 'string' ? item.结束时间.trim() : typeof item?.endTime === 'string' ? item.endTime.trim() : '',
                    前置条件: Array.isArray(item?.前置条件) ? item.前置条件.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    触发条件: Array.isArray(item?.触发条件) ? item.触发条件.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    阻断条件: Array.isArray(item?.阻断条件) ? item.阻断条件.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    事件结果: Array.isArray(item?.事件结果) ? item.事件结果.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    对下一组影响: Array.isArray(item?.对下一组影响) ? item.对下一组影响.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    信息可见性: 解析新小说拆分JSON信息可见性(item)
                })).filter((item: any) => item.事件名 || item.事件说明)
                : [],
            characterProgressions: Array.isArray(data?.characterProgressions)
                ? data.characterProgressions.map((item: any) => ({
                    角色名: typeof item?.角色名 === 'string' ? item.角色名.trim() : typeof item?.name === 'string' ? item.name.trim() : '',
                    本组前状态: Array.isArray(item?.本组前状态) ? item.本组前状态.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    本组变化: Array.isArray(item?.本组变化) ? item.本组变化.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    本组后状态: Array.isArray(item?.本组后状态) ? item.本组后状态.map((value: any) => String(value || '').trim()).filter(Boolean) : [],
                    对下一组影响: Array.isArray(item?.对下一组影响) ? item.对下一组影响.map((value: any) => String(value || '').trim()).filter(Boolean) : []
                })).filter((item: any) => item.角色名)
                : []
        }),
        rawText
    };
};

const 解析小说拆分结果 = (rawText: string): NovelDecompositionAnalysisResult => {
    return 解析新小说拆分结果(rawText);
};

const 解析规划补丁结果 = (
    rawText: string,
    _label: string
): {
    shouldUpdate: boolean;
    reason: string;
    commands: TavernCommand[];
    notes: string[];
} => {
    const source = (rawText || '').trim();
    if (!source) {
        return { shouldUpdate: false, reason: '', commands: [], notes: [] };
    }
    const thinkingSegment = 提取首尾思考区段(source);
    let textWithoutThinking = (thinkingSegment.matched ? thinkingSegment.textWithoutThinking : source).trim();
    if (thinkingSegment.matched && !textWithoutThinking) {
        textWithoutThinking = source
            .replace(/<\s*\/\s*(thinking|think)\s*>/gi, '')
            .replace(/<\s*(thinking|think)\s*>/gi, '')
            .trim();
    }
    const noteBlock = 提取首个标签内容(textWithoutThinking, '说明');
    const commandBlock = 提取首个标签内容(textWithoutThinking, '命令');
    const notes = 解析说明块(noteBlock);
    const commands = 解析命令块(commandBlock || textWithoutThinking)
        .map((cmd) => ({
            action: cmd.action === 'add' ? 'set' : cmd.action,
            key: cmd.key,
            value: cmd.value
        }))
        .filter((cmd) => cmd.action === 'set' || cmd.action === 'push' || cmd.action === 'delete') as TavernCommand[];
    const reason = notes[0] || '';
    const noUpdate = notes.some((item) => /无需更新|无需修补|无须更新|无可更新/.test(item));
    return {
        shouldUpdate: !noUpdate && commands.length > 0,
        reason,
        commands,
        notes
    };
};

const 规范化新小说拆分角色档案 = (raw: any): NovelDecompositionCharacterProfileAnalysisResult => ({
    名称: typeof raw?.名称 === 'string' ? raw.名称.trim() : typeof raw?.name === 'string' ? raw.name.trim() : '',
    身份: typeof raw?.身份 === 'string' ? raw.身份.trim() : typeof raw?.identity === 'string' ? raw.identity.trim() : '',
    所属势力: typeof raw?.所属势力 === 'string' ? raw.所属势力.trim() : typeof raw?.faction === 'string' ? raw.faction.trim() : '',
    初始立场: typeof raw?.初始立场 === 'string' ? raw.初始立场.trim() : typeof raw?.stance === 'string' ? raw.stance.trim() : '',
    关系摘要: 新小说拆分去重文本列表(Array.isArray(raw?.关系摘要) ? raw.关系摘要 : Array.isArray(raw?.relationships) ? raw.relationships : [], 12),
    状态摘要: 新小说拆分去重文本列表(Array.isArray(raw?.状态摘要) ? raw.状态摘要 : Array.isArray(raw?.states) ? raw.states : [], 12),
    首次出现: typeof raw?.首次出现 === 'string' ? raw.首次出现.trim() : typeof raw?.firstSeen === 'string' ? raw.firstSeen.trim() : '',
    重要性: 解析新小说拆分重要性(raw?.重要性 ?? raw?.importance)
});

const 规范化新小说拆分势力档案 = (raw: any): NovelDecompositionFactionProfileAnalysisResult => ({
    名称: typeof raw?.名称 === 'string' ? raw.名称.trim() : typeof raw?.name === 'string' ? raw.name.trim() : '',
    类型: typeof raw?.类型 === 'string' ? raw.类型.trim() : typeof raw?.type === 'string' ? raw.type.trim() : '',
    地盘: typeof raw?.地盘 === 'string' ? raw.地盘.trim() : typeof raw?.territory === 'string' ? raw.territory.trim() : '',
    代表人物: 新小说拆分去重文本列表(Array.isArray(raw?.代表人物) ? raw.代表人物 : Array.isArray(raw?.representatives) ? raw.representatives : [], 12),
    立场目标: typeof raw?.立场目标 === 'string' ? raw.立场目标.trim() : typeof raw?.goal === 'string' ? raw.goal.trim() : '',
    当前状态: typeof raw?.当前状态 === 'string' ? raw.当前状态.trim() : typeof raw?.status === 'string' ? raw.status.trim() : '',
    关系摘要: 新小说拆分去重文本列表(Array.isArray(raw?.关系摘要) ? raw.关系摘要 : Array.isArray(raw?.relationships) ? raw.relationships : [], 12),
    首次出现: typeof raw?.首次出现 === 'string' ? raw.首次出现.trim() : typeof raw?.firstSeen === 'string' ? raw.firstSeen.trim() : ''
});

const 规范化新小说拆分地点档案 = (raw: any): NovelDecompositionLocationProfileAnalysisResult => ({
    名称: typeof raw?.名称 === 'string' ? raw.名称.trim() : typeof raw?.name === 'string' ? raw.name.trim() : '',
    层级: 解析新小说拆分地点层级(raw?.层级 ?? raw?.level),
    上级地点: typeof raw?.上级地点 === 'string' ? raw.上级地点.trim() : typeof raw?.parent === 'string' ? raw.parent.trim() : '',
    所属势力: typeof raw?.所属势力 === 'string' ? raw.所属势力.trim() : typeof raw?.faction === 'string' ? raw.faction.trim() : '',
    地貌功能: typeof raw?.地貌功能 === 'string' ? raw.地貌功能.trim() : typeof raw?.function === 'string' ? raw.function.trim() : '',
    关键设施: 新小说拆分去重文本列表(Array.isArray(raw?.关键设施) ? raw.关键设施 : Array.isArray(raw?.facilities) ? raw.facilities : [], 12),
    首次出现: typeof raw?.首次出现 === 'string' ? raw.首次出现.trim() : typeof raw?.firstSeen === 'string' ? raw.firstSeen.trim() : ''
});

const 规范化新小说拆分物品档案 = (raw: any): NovelDecompositionItemProfileAnalysisResult => ({
    名称: typeof raw?.名称 === 'string' ? raw.名称.trim() : typeof raw?.name === 'string' ? raw.name.trim() : '',
    类型: typeof raw?.类型 === 'string' ? raw.类型.trim() : typeof raw?.type === 'string' ? raw.type.trim() : '',
    用途: typeof raw?.用途 === 'string' ? raw.用途.trim() : typeof raw?.usage === 'string' ? raw.usage.trim() : '',
    所属人物: typeof raw?.所属人物 === 'string' ? raw.所属人物.trim() : typeof raw?.owner === 'string' ? raw.owner.trim() : '',
    所属势力: typeof raw?.所属势力 === 'string' ? raw.所属势力.trim() : typeof raw?.faction === 'string' ? raw.faction.trim() : '',
    首次出现: typeof raw?.首次出现 === 'string' ? raw.首次出现.trim() : typeof raw?.firstSeen === 'string' ? raw.firstSeen.trim() : ''
});

const 构建规划分析消息链 = (
    params: {
        playerName: string;
        currentStoryJson: string;
        currentHeroinePlanJson: string;
        worldJson: string;
        socialJson: string;
        envJson: string;
        recentBodiesText: string;
        currentPlanText?: string;
        auditFocusText: string;
        heroineEnabled?: boolean;
        ntlEnabled?: boolean;
        fandomEnabled?: boolean;
        extraPrompt?: string;
        gptMode?: boolean;
    },
    options?: { forceUserTrigger?: boolean }
): 通用消息[] => {
    const aiRolePrompt = 构建AI角色声明提示词(params.playerName);
    const cotPseudoPrompt = 替换COT伪装身份占位(默认COT伪装历史消息提示词.trim(), aiRolePrompt);
    const normalizedExtraPrompt = typeof params.extraPrompt === 'string' ? params.extraPrompt.trim() : '';
    const fandomSystemPrompt = params.fandomEnabled ? 同人规划分析附加系统提示词 : '';
    const fandomCotPrompt = params.fandomEnabled ? 同人规划分析附加COT提示词 : '';
    const taskPrompt = [
        `【本次任务】\n${构建统一规划分析用户提示词({
            currentStoryJson: params.currentStoryJson,
            currentHeroinePlanJson: params.currentHeroinePlanJson,
            worldJson: params.worldJson,
            socialJson: params.socialJson,
            envJson: params.envJson,
            recentBodiesText: params.recentBodiesText,
            currentPlanText: params.currentPlanText,
            auditFocusText: params.auditFocusText,
            genderRatioConstraintText: params.genderRatioConstraintText,
            heroineEnabled: params.heroineEnabled === true
        })}`,
        normalizedExtraPrompt ? `【最终输出附加要求】\n${normalizedExtraPrompt}` : ''
    ].filter(Boolean).join('\n\n');
    const useUserTrigger = params.gptMode === true || options?.forceUserTrigger === true;
    return 规范化文本补全消息链([
        { role: 'system', content: `【AI角色】\n${aiRolePrompt}` },
        {
            role: 'system',
            content: `【系统提示词】\n${构建统一规划分析系统提示词({
                heroineEnabled: params.heroineEnabled === true,
                ntl: params.ntlEnabled === true,
                fandom: params.fandomEnabled === true
            })}`
        },
        ...(fandomSystemPrompt ? [{ role: 'system' as const, content: `【同人规划补充】\n${fandomSystemPrompt}` }] : []),
        { role: 'system', content: `【结构参考与更新规则】\n${构建统一规划分析专用上下文()}` },
        ...(normalizedExtraPrompt ? [{ role: 'system' as const, content: `【附加世界书】\n${normalizedExtraPrompt}` }] : []),
        { role: 'system', content: `【统一COT】\n${统一规划分析COT提示词}` },
        ...(fandomCotPrompt ? [{ role: 'system' as const, content: `【同人规划COT】\n${fandomCotPrompt}` }] : []),
        ...(useUserTrigger ? [{ role: 'system' as const, content: '请在内部完成规划分析思考，最终只输出 <thinking>、<说明>、<命令> 三段；不要输出额外解释。' }] : []),
        { role: useUserTrigger ? 'user' as const : 'assistant' as const, content: taskPrompt },
        ...(!useUserTrigger ? [{ role: 'user' as const, content: '开始任务' }] : []),
        ...(!useUserTrigger ? [{ role: 'assistant' as const, content: cotPseudoPrompt }] : [])
    ], { 保留System: true, 合并同角色: false });
};

export const generatePlanningAnalysis = async (
    params: {
        playerName: string;
        currentStoryJson: string;
        currentHeroinePlanJson: string;
        worldJson: string;
        socialJson: string;
        envJson: string;
        recentBodiesText: string;
        currentPlanText?: string;
        auditFocusText: string;
        genderRatioConstraintText?: string;
        heroineEnabled?: boolean;
        ntlEnabled?: boolean;
        fandomEnabled?: boolean;
        extraPrompt?: string;
        gptMode?: boolean;
    },
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    streamOptions?: WorldStreamOptions
): Promise<PlanningAnalysisResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');
    const request = (forceUserTrigger = false) => 请求模型文本(apiConfig, 构建规划分析消息链(params, { forceUserTrigger }), {
        temperature: 0.3,
        signal,
        errorDetailLimit: Number.POSITIVE_INFINITY,
        streamOptions
    });
    let rawText = '';
    try {
        rawText = await request(false);
    } catch (error: any) {
        const message = String(error?.message || error || '');
        const shouldRetryWithUserTrigger = params.gptMode !== true && /(messages?|role|assistant|last message|final message|pre[- ]?fill|tool|400|invalid_request)/i.test(message);
        if (!shouldRetryWithUserTrigger || signal?.aborted) throw error;
        rawText = await request(true);
    }
    return { ...解析规划补丁结果(rawText, '统一规划分析'), rawText };
};

export const generateNovelDecomposition = async (
    params: {
        text: string;
        groupIndex?: number;
        chapterRange?: string;
        chapterTitles?: string[];
        previousGroupReference?: string;
        previousTimelineEnd?: string;
        nextChapterTitles?: string[];
        leadingSystemPrompt?: string;
        extraPrompt?: string;
        gptMode?: boolean;
    },
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    streamOptions?: WorldStreamOptions
): Promise<NovelDecompositionAnalysisResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const taskPrompt = 构建小说拆分当前任务提示词(params);
    const normalizedLeadingSystemPrompt = typeof params.leadingSystemPrompt === 'string'
        ? params.leadingSystemPrompt.trim()
        : '';
    const normalizedExtraPrompt = typeof params.extraPrompt === 'string'
        ? params.extraPrompt.trim()
        : '';

    const rawText = await 请求模型文本(apiConfig, 规范化文本补全消息链([
        ...(normalizedLeadingSystemPrompt
            ? [{ role: 'system' as const, content: `【AI角色】\n${normalizedLeadingSystemPrompt}` }]
            : []),
        { role: 'system', content: `【AI身份提示词】\n${小说拆分AI身份提示词}` },
        { role: 'system', content: `【其他要求】\n${小说拆分其他要求提示词}` },
        { role: 'system', content: `【结构要求】\n${小说拆分结构要求提示词}` },
        { role: 'system', content: `【COT提示词】\n${小说拆分COT提示词}` },
        ...(normalizedExtraPrompt
            ? [{ role: 'user' as const, content: `【额外要求提示词】\n${normalizedExtraPrompt}` }]
            : []),
        { role: params.gptMode ? 'user' : 'assistant', content: taskPrompt },
        ...(!params.gptMode ? [{ role: 'user' as const, content: '开始任务' }] : []),
        { role: 'assistant', content: 小说拆分COT伪装提示词 }
    ], { 保留System: true, 合并同角色: false }), {
        temperature: 0.3,
        signal,
        errorDetailLimit: Number.POSITIVE_INFINITY,
        streamOptions
    });

    return 解析小说拆分结果(rawText);
};

const 解析故事响应 = (
    rawText: string,
    requestOptions?: StoryRequestOptions
): StoryResponseResult => ({
    response: parseStoryRawText(rawText, {
        validateTagCompleteness: requestOptions?.validateTagCompleteness,
        enableTagRepair: requestOptions?.enableTagRepair,
        requireActionOptionsTag: requestOptions?.requireActionOptionsTag,
        requireDynamicWorldTag: requestOptions?.requireDynamicWorldTag,
        validateDialogueFormat: requestOptions?.validateDialogueFormat,
        knownSpeakers: requestOptions?.knownSpeakers
    }),
    rawText
});

const 是否正文对白格式错误 = (error: any): boolean => {
    const text = `${error?.parseDetail || ''}\n${error?.message || ''}`;
    return /疑似角色|对白.*(?:标签|格式)|冒号格式|旁白.*说|无标签|正文协议|裸文|裸引号|引号.*跨行|引号内.*换行|孤立标点|标点单独成行|高频套话|指节|指关节|手指.*泛白|拳头.*发白|异常英文片段|英文夹杂|改回自然中文/.test(text);
};

const 构建正文协议修复消息 = (rawText: string, reason: string): 通用消息[] => 规范化文本补全消息链([
    {
        role: 'system',
        content: [
            '你是《墨色江湖》的响应协议修复器。',
            '任务不是重新创作剧情，而是在不改变事实、不新增事件、不改写变量命令含义的前提下，修复上一版模型输出的格式。',
            '必须保留原文中已经成立的剧情、短期记忆、命令、行动选项、动态世界等信息；只允许调整正文分段、对白标签和必要的协议标签闭合。',
            '输出必须是完整可解析的协议文本，不要解释。'
        ].join('\n')
    },
    {
        role: 'user',
        content: [
            '【修复原因】',
            reason || '正文对白格式不合规。',
            '',
            '【硬性修复要求】',
            '1. <正文> 内所有角色说出口的台词必须单独成行，并以【角色名】开头。',
            '2. 没有【角色名】的行只能是旁白、动作、环境或判定。',
            '3. 如果原文出现“某人动作后一整行明显是他说的话”，把那一行改为【某人】开头，不要凭空改名。',
            '4. 保留 <短期记忆>、<命令>、<行动选项>、<动态世界> 等块的原意；缺失必要块时按原文可见信息补齐最小可用内容。',
            '5. 不要新增剧情，不要重写成另一版故事。',
            '',
            '【待修复原始输出】',
            rawText || ''
        ].join('\n')
    }
], { 保留System: true, 合并同角色: false });

const 构建正文对白格式修复消息 = (bodyText: string, reason: string): 通用消息[] => 规范化文本补全消息链([
    {
        role: 'system',
        content: [
            '你是《墨色江湖》的正文局部修复器。',
            '任务不是重新创作剧情，而是在不改变事实、不新增事件、不改写判定结果的前提下，只修复正文里的对白标签、行文格式和指定低质量句子。',
            '你只处理用户给出的 <正文> 内容，不要输出命令、记忆、行动选项、解释或代码块。'
        ].join('\n')
    },
    {
        role: 'user',
        content: [
            '【修复原因】',
            reason || '正文对白格式不合规。',
            '',
            '【硬性规则】',
            '1. 所有角色说出口的台词必须单独成行，并以【角色名】开头。',
            '2. 【角色名】行只能放该角色说出口的台词，不要放动作、心理、旁白说明或括号补描写。',
            '3. 旁白、动作、环境、心理、第三人称叙述必须使用【旁白】开头，或保持为无角色标签的旁白行。',
            '4. 遇到“角色名：台词”“角色说道：‘台词’”“动作行后紧跟明显口语台词”等格式，要改成【角色名】台词。',
            '5. 不能凭空改名；说话人不确定时保留为【旁白】，不要强行猜。',
            '6. 保留原正文事实、顺序、判定结果、地点、物品、人物关系和台词含义。',
            '7. 正文一句话一行；每一行必须是完整的【旁白】、【角色名】或【判定】正文单位。',
            '8. 引号内文字绝对不能换行；如果原文把“……”、「……」、『……』或“‘……’”拆成多行，必须合并回同一行。',
            '9. 如果出现单独一行只有“。”、“！”、“？”、“，”、“；”、省略号等标点，必须局部重写相邻句子，让标点回到自然完整的正文句中；不要只删除标点。',
            '10. 【严禁高频套话】正文绝对禁止出现“指节泛白”“指关节泛白”“指尖泛白”“拳头攥到发白”等描写。若原文包含，必须整句重写，用具体的压力、动作或环境细节替代（如“握紧拳头，骨节咯咯作响”“指甲深深掐进掌心”）。不得保留任何“泛白/发白/苍白”与“指节/指关节/指尖/拳头”的组合。',
            '11. 如果正文里混入无关英文词、拼写残片或中英夹杂短词，例如“千 young 百孔”，必须把整句改回自然中文，不能原样保留。',
            '12. 只输出一个 <正文>...</正文> 块，不要输出其他内容。',
            '',
            '【待修复正文】',
            '<正文>',
            bodyText || '',
            '</正文>'
        ].join('\n')
    }
], { 保留System: true, 合并同角色: false });

const 替换首个正文块 = (rawText: string, bodyText: string): string => {
    const source = rawText || '';
    const body = (bodyText || '').trim();
    const replacement = `<正文>\n${body}\n</正文>`;
    if (/<\s*正文\s*>[\s\S]*?<\s*\/\s*正文\s*>/i.test(source)) {
        return source.replace(/<\s*正文\s*>[\s\S]*?<\s*\/\s*正文\s*>/i, replacement);
    }
    return `${replacement}\n${source}`.trim();
};

const 修复故事响应正文对白格式 = async (
    rawText: string,
    reason: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    requestOptions?: StoryRequestOptions
): Promise<StoryResponseResult> => {
    const sourceBody = 提取首个标签内容(rawText, '正文', { 兼容错误闭合: true }) || rawText;
    const repairedText = await 请求模型文本(apiConfig, 构建正文对白格式修复消息(sourceBody, reason), {
        temperature: 0.2,
        signal,
        errorDetailLimit: requestOptions?.errorDetailLimit,
        includeReasoning: requestOptions?.includeReasoning,
        disableThinking: requestOptions?.disableThinking,
        stripReasoning: requestOptions?.stripReasoning,
        prefixMode: requestOptions?.prefixMode
    });
    const repairedBody = 清理润色正文输出(repairedText);
    if (!repairedBody.trim()) {
        throw new Error('正文对白格式局部修复未返回有效正文');
    }
    const repairedRawText = 替换首个正文块(rawText, repairedBody);
    return 解析故事响应(repairedRawText, requestOptions);
};

const 修复故事响应协议 = async (
    rawText: string,
    reason: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    requestOptions?: StoryRequestOptions
): Promise<StoryResponseResult> => {
    const repairedText = await 请求模型文本(apiConfig, 构建正文协议修复消息(rawText, reason), {
        temperature: 0.2,
        signal,
        errorDetailLimit: requestOptions?.errorDetailLimit,
        includeReasoning: requestOptions?.includeReasoning,
        disableThinking: requestOptions?.disableThinking,
        stripReasoning: requestOptions?.stripReasoning,
        prefixMode: requestOptions?.prefixMode
    });
    return 解析故事响应(repairedText, requestOptions);
};

export const generateStoryResponse = async (
    systemPrompt: string,
    userContext: string,
    playerInput: string,
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal,
    streamOptions?: StoryStreamOptions,
    extraPrompt?: string,
    requestOptions?: StoryRequestOptions
): Promise<StoryResponseResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const orderedMessagesRaw = Array.isArray(requestOptions?.orderedMessages)
        ? requestOptions.orderedMessages
            .map((item) => {
                const isPrefix = item?.prefix === true;
                return {
                    role: item?.role,
                    content: typeof item?.content === 'string'
                        ? (isPrefix ? item.content : item.content.trim())
                        : '',
                    ...(isPrefix ? { prefix: true } : {})
                };
            })
            .filter((item): item is 通用消息 =>
                (item.role === 'system' || item.role === 'user' || item.role === 'assistant') && item.content.length > 0
            )
        : [];
    const orderedMessages = 规范化文本补全消息链(orderedMessagesRaw, {
        保留System: true,
        合并同角色: false
    });

    if (orderedMessages.length > 0) {
        const lengthRequirementPrompt = typeof requestOptions?.lengthRequirementPrompt === 'string'
            ? requestOptions.lengthRequirementPrompt.trim()
            : '';
        const messagesWithRuntimeRequirements = (() => {
            if (!lengthRequirementPrompt) return orderedMessages;
            if (orderedMessages.some((message) => message.content.includes(lengthRequirementPrompt))) {
                return orderedMessages;
            }
            const lengthMessage = {
                role: 'user' as const,
                content: lengthRequirementPrompt
            };
            const tail = orderedMessages[orderedMessages.length - 1];
            if (tail?.role === 'assistant' && tail.prefix === true) {
                return [
                    ...orderedMessages.slice(0, -1),
                    lengthMessage,
                    tail
                ];
            }
            return [
                ...orderedMessages,
                lengthMessage
            ];
        })();

        const rawText = await 请求模型文本(apiConfig, messagesWithRuntimeRequirements, {
            temperature: 0.7,
            signal,
            streamOptions,
            errorDetailLimit: requestOptions?.errorDetailLimit,
            includeReasoning: requestOptions?.includeReasoning,
            disableThinking: requestOptions?.disableThinking,
            stripReasoning: requestOptions?.stripReasoning,
            prefixMode: requestOptions?.prefixMode
        });
        try {
            return 解析故事响应(rawText, requestOptions);
        } catch (error: any) {
            if (requestOptions?.validateDialogueFormat === true && error?.name === 'StoryResponseParseError') {
                if (是否正文对白格式错误(error)) {
                    try {
                        return await 修复故事响应正文对白格式(rawText, error?.parseDetail || error?.message || '正文对白格式不合规', apiConfig, signal, requestOptions);
                    } catch {
                        return 修复故事响应协议(rawText, error?.parseDetail || error?.message || '正文对白格式不合规', apiConfig, signal, requestOptions);
                    }
                }
                return 修复故事响应协议(rawText, error?.parseDetail || error?.message || '正文对白格式不合规', apiConfig, signal, requestOptions);
            }
            throw error;
        }
    }

    const normalizedSystemPrompt = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
    const normalizedContext = typeof userContext === 'string' ? userContext.trim() : '';
    const normalizedExtraPrompt = typeof extraPrompt === 'string' ? extraPrompt.trim() : '';
    const enableCotInjection = requestOptions?.enableCotInjection !== false;
    const leadingSystemPrompt = typeof requestOptions?.leadingSystemPrompt === 'string'
        ? requestOptions.leadingSystemPrompt.trim()
        : '';
    const cotPseudoHistoryPromptRaw = typeof requestOptions?.cotPseudoHistoryPrompt === 'string'
        ? requestOptions.cotPseudoHistoryPrompt.trim()
        : 默认COT伪装历史消息提示词.trim();
    const cotPseudoHistoryPrompt = 替换COT伪装身份占位(cotPseudoHistoryPromptRaw, leadingSystemPrompt);
    const styleAssistantPrompt = typeof requestOptions?.styleAssistantPrompt === 'string'
        ? requestOptions.styleAssistantPrompt.trim()
        : '';
    const outputProtocolPrompt = typeof requestOptions?.outputProtocolPrompt === 'string'
        ? requestOptions.outputProtocolPrompt.trim()
        : '';
    const lengthRequirementPrompt = typeof requestOptions?.lengthRequirementPrompt === 'string'
        ? requestOptions.lengthRequirementPrompt.trim()
        : '';
    const disclaimerRequirementPrompt = typeof requestOptions?.disclaimerRequirementPrompt === 'string'
        ? requestOptions.disclaimerRequirementPrompt.trim()
        : '';

    const apiMessages: 通用消息[] = [];
    if (normalizedSystemPrompt) {
        apiMessages.push({ role: 'system', content: normalizedSystemPrompt });
    }
    if (normalizedContext) {
        apiMessages.push({ role: 'system', content: normalizedContext });
    }
    if (leadingSystemPrompt) {
        apiMessages.push({ role: 'system', content: leadingSystemPrompt });
    }
    if (lengthRequirementPrompt) {
        apiMessages.push({ role: 'system', content: lengthRequirementPrompt });
    }
    if (styleAssistantPrompt) {
        apiMessages.push({ role: 'system', content: styleAssistantPrompt });
    }
    if (outputProtocolPrompt) {
        apiMessages.push({ role: 'system', content: outputProtocolPrompt });
    }
    if (disclaimerRequirementPrompt) {
        apiMessages.push({ role: 'user', content: disclaimerRequirementPrompt });
    }
    if (normalizedExtraPrompt) {
        apiMessages.push({ role: 'user', content: normalizedExtraPrompt });
    }

    const normalizedPlayerInput = typeof playerInput === 'string' && playerInput.trim().length > 0
        ? playerInput
        : '开始任务。';
    if (enableCotInjection && cotPseudoHistoryPrompt) {
        apiMessages.push({ role: 'user', content: '开始任务。' });
        apiMessages.push({ role: 'assistant', content: cotPseudoHistoryPrompt });
    }
    apiMessages.push({
        role: 'user',
        content: normalizedPlayerInput
    });

    const normalizedApiMessages = 规范化文本补全消息链(apiMessages, {
        保留System: true,
        合并同角色: false
    });

    const rawText = await 请求模型文本(apiConfig, normalizedApiMessages, {
        temperature: 0.7,
        signal,
        streamOptions,
        errorDetailLimit: requestOptions?.errorDetailLimit,
        includeReasoning: requestOptions?.includeReasoning,
        disableThinking: requestOptions?.disableThinking,
        stripReasoning: requestOptions?.stripReasoning,
        prefixMode: requestOptions?.prefixMode
    });

    try {
        return 解析故事响应(rawText, requestOptions);
    } catch (error: any) {
        if (requestOptions?.validateDialogueFormat === true && error?.name === 'StoryResponseParseError') {
            if (是否正文对白格式错误(error)) {
                try {
                    return await 修复故事响应正文对白格式(rawText, error?.parseDetail || error?.message || '正文对白格式不合规', apiConfig, signal, requestOptions);
                } catch {
                    return 修复故事响应协议(rawText, error?.parseDetail || error?.message || '正文对白格式不合规', apiConfig, signal, requestOptions);
                }
            }
            return 修复故事响应协议(rawText, error?.parseDetail || error?.message || '正文对白格式不合规', apiConfig, signal, requestOptions);
        }
        throw error;
    }
};

export const testConnection = async (
    apiConfig: 当前可用接口结构
): Promise<ConnectionTestResult> => {
    if (!apiConfig.apiKey) {
        return { ok: false, detail: '缺少 API Key' };
    }
    if (!apiConfig.baseUrl) {
        return { ok: false, detail: '缺少 Base URL' };
    }
    if (!apiConfig.model) {
        return { ok: false, detail: '缺少模型名称' };
    }

    const messages = 规范化文本补全消息链([
        { role: 'user', content: '你是连接测试。请只回答 OK。' },
        { role: 'user', content: 'ping' }
    ], { 保留System: true, 合并同角色: true });

    const startedAt = Date.now();
    try {
        const text = await 请求模型文本(apiConfig, messages, {
            temperature: 0,
            errorDetailLimit: Number.POSITIVE_INFINITY
        });
        const elapsed = Date.now() - startedAt;
        const body = typeof text === 'string' ? text : '';
        const content = body.length > 0 ? body : '无响应内容';
        return { ok: true, detail: `耗时: ${elapsed}ms\n\n${content}` };
    } catch (error: any) {
        const raw = error?.detail ?? error?.message ?? error ?? '未知错误';
        const detail = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
        return {
            ok: false,
            detail: 翻译连接测试错误(detail, {
                baseUrl: apiConfig.baseUrl,
                backendLabel: '主接口'
            })
        };
    }
};

export interface NovelModePackCompletionResult {
    completion: Record<string, any>;
    rawText: string;
}

const 解析AI补全JSON候选 = (text: string, errorMessage: string): any => {
    const parsed = parseJsonWithRepair(text);
    if (parsed.value !== null) return parsed.value;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        const matched = parseJsonWithRepair(jsonMatch[0]);
        if (matched.value !== null) return matched.value;
    }

    throw new Error(errorMessage);
};

export interface NpcSecretPartDescriptionPatchResult {
    patch: Record<string, string>;
    rawText: string;
}

const 读取NPC私密部位描述字段 = (part: string): string => {
    if (part === '胸部') return '胸部描述';
    if (part === '小穴') return '小穴描述';
    if (part === '肉棒') return '肉棒描述';
    return '屁穴描述';
};

export const generateNpcSecretPartDescriptionPatch = async (
    params: {
        npc: any;
        part: string;
        baseData?: any;
    },
    apiConfig: 当前可用接口结构,
    signal?: AbortSignal
): Promise<NpcSecretPartDescriptionPatchResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const field = 读取NPC私密部位描述字段(params.part);
    const npcSummary = JSON.stringify({
        姓名: params.npc?.姓名,
        性别: params.npc?.性别,
        年龄: params.npc?.年龄,
        身份: params.npc?.身份,
        是否主要角色: params.npc?.是否主要角色,
        简介: params.npc?.简介,
        外貌描写: params.npc?.外貌描写 || params.npc?.外貌,
        身材描写: params.npc?.身材描写 || params.npc?.身材,
        衣着风格: params.npc?.衣着风格 || params.npc?.衣着,
        性格: params.npc?.核心性格特征 || params.npc?.性格,
        既有私密字段: {
            胸部描述: params.npc?.胸部描述,
            小穴描述: params.npc?.小穴描述,
            屁穴描述: params.npc?.屁穴描述,
            肉棒描述: params.npc?.肉棒描述,
            性癖: params.npc?.性癖,
            敏感点: params.npc?.敏感点
        },
        生图基础数据: params.baseData
    }, null, 2);
    const systemPrompt = [
        '你是游戏运行时的角色档案补全器，只补齐缺失的私密部位稳定描述字段。',
        '必须依据已有角色资料生成长期可复用的档案描述，避免空泛词，避免与角色性别/年龄/身份冲突。',
        '只返回严格 JSON，不要 Markdown，不要解释。'
    ].join('\n');
    const userPrompt = [
        `请为目标 NPC 补齐字段：${field}`,
        `目标部位：${params.part}`,
        '要求：',
        '- 返回对象只能包含目标字段；',
        '- 字段值用中文，1 到 2 句，包含可供后续生图使用的稳定视觉特征；',
        '- 如需提到名器/无名器结论，可自然写入，但不要凭空拔高为稀有名器；',
        '- 不要返回空字符串、未知、待定、暂无、无法判断。',
        'NPC资料：',
        npcSummary,
        `输出示例：{"${field}":"稳定描述文本"}`
    ].join('\n');
    const messages = 规范化文本补全消息链([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], { 保留System: true, 合并同角色: false });

    const rawText = await 请求模型文本(apiConfig, messages, {
        temperature: 0.35,
        signal,
        errorDetailLimit: Number.POSITIVE_INFINITY
    });
    const parsed = 解析AI补全JSON候选(rawText, 'NPC 私密部位描述补齐响应无法解析为 JSON。');
    const value = typeof parsed?.[field] === 'string' ? parsed[field].trim() : '';
    if (!value) throw new Error(`NPC 私密部位描述补齐未返回有效的 ${field}。`);
    return {
        patch: { [field]: value },
        rawText
    };
};

/**
 * Generates a runtime-profile completion patch for a novel decomposition mode pack
 * by sending the novel dataset summary to AI and parsing the JSON response.
 */
export const generateNovelModePackCompletion = async (
    dataset: 小说拆分数据集结构,
    apiConfig: 当前可用接口结构,
    streamOptions?: WorldStreamOptions,
    signal?: AbortSignal
): Promise<NovelModePackCompletionResult> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const systemPrompt = 小说模式包补全系统提示词;
    const userPrompt = 构建小说模式包补全用户提示词(dataset);

    const messages: 通用消息[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const rawText = await 请求模型文本(
        apiConfig,
        规范化文本补全消息链(messages, { 保留System: true, 合并同角色: false }),
        {
            temperature: 0.4,
            streamOptions,
            signal
        }
    );

    const completion = 解析小说模式包补全JSON(rawText);
    return { completion, rawText };
};

const 解析小说模式包补全JSON = (rawText: string): Record<string, any> => {
    const cleaned = (rawText || '')
        .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, '')
        .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, '')
        .trim();

    // Strip markdown code block markers
    const withoutCodeBlock = cleaned
        .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
        .replace(/\n?\s*```$/gm, '')
        .trim();

    const parsed = 解析AI补全JSON候选(withoutCodeBlock, 'AI 输出无法解析为 JSON 对象');

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI 输出不是有效的 JSON 对象');
    }

    const knownSections = ['economy', 'ability', 'opening', 'organization', 'map', 'npc', 'image', 'time', 'items', 'task', 'validation'];
    const hasUsableValue = (value: unknown): boolean => {
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value === 'boolean') return true;
        if (Array.isArray(value)) return value.some(hasUsableValue);
        if (value && typeof value === 'object') {
            return Object.values(value as Record<string, unknown>).some(hasUsableValue);
        }
        return false;
    };
    const hasUsableSection = knownSections.some((section) => (
        parsed[section] && typeof parsed[section] === 'object' && hasUsableValue(parsed[section])
    ));

    if (!hasUsableSection) {
        throw new Error('AI 补全没有返回可用的模式包配置字段，请重试。');
    }

    return parsed;
};

/**
 * AI-powered segment field completion.
 * Reads the segment's original text and existing structured fields,
 * returns a JSON patch with corrected/supplemented fields.
 */
export const generateNovelSegmentFieldCompletion = async (
    params: {
        segmentOriginalText: string;
        segmentTitle: string;
        existing角色档案?: 小说拆分角色档案结构[];
        existing势力档案?: 小说拆分势力档案结构[];
        existing地图地点档案?: 小说拆分地图地点档案结构[];
        existing物品档案?: 小说拆分物品档案结构[];
        existing世界观规则?: string[];
        existing世界边界规则?: string[];
        existing人物关系?: string[];
        existing势力关系?: string[];
        existing伏笔线索?: string[];
        existing回收点?: string[];
        existing章节节奏?: string[];
    },
    apiConfig: 当前可用接口结构,
    streamOptions?: WorldStreamOptions,
    signal?: AbortSignal
): Promise<{ completion: 分段字段AI补全结果; rawText: string }> => {
    if (!apiConfig.apiKey) throw new Error('Missing API Key');

    const systemPrompt = 分段字段补全系统提示词;
    const userPrompt = 构建分段字段补全用户提示词(params);

    const messages: 通用消息[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const rawText = await 请求模型文本(
        apiConfig,
        规范化文本补全消息链(messages, { 保留System: true, 合并同角色: false }),
        {
            temperature: 0.3,
            streamOptions,
            signal
        }
    );

    const completion = 解析分段字段补全JSON(rawText);
    return { completion, rawText };
};

const 解析分段字段补全JSON = (rawText: string): 分段字段AI补全结果 => {
    const cleaned = (rawText || '')
        .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, '')
        .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, '')
        .trim();

    const withoutCodeBlock = cleaned
        .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
        .replace(/\n?\s*```$/gm, '')
        .trim();

    const parsed = 解析AI补全JSON候选(withoutCodeBlock, 'AI 输出无法解析为 JSON 对象');

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI 输出不是有效的 JSON 对象');
    }

    // Validate and normalize the result
    const result: 分段字段AI补全结果 = {};

    if (Array.isArray(parsed.角色档案)) {
        result.角色档案 = parsed.角色档案.filter((c: any) => c && typeof c === 'object' && c.名称);
    }
    if (Array.isArray(parsed.势力档案)) {
        result.势力档案 = parsed.势力档案.filter((f: any) => f && typeof f === 'object' && f.名称);
    }
    if (Array.isArray(parsed.地图地点档案)) {
        result.地图地点档案 = parsed.地图地点档案.filter((l: any) => l && typeof l === 'object' && l.名称);
    }
    if (Array.isArray(parsed.物品档案)) {
        result.物品档案 = parsed.物品档案.filter((i: any) => i && typeof i === 'object' && i.名称);
    }
    if (Array.isArray(parsed.世界观规则)) {
        result.世界观规则 = parsed.世界观规则.filter((s: any) => typeof s === 'string' && s.trim());
    }
    if (Array.isArray(parsed.世界边界规则)) {
        result.世界边界规则 = parsed.世界边界规则.filter((s: any) => typeof s === 'string' && s.trim());
    }
    if (Array.isArray(parsed.人物关系)) {
        result.人物关系 = parsed.人物关系.filter((s: any) => typeof s === 'string' && s.trim());
    }
    if (Array.isArray(parsed.势力关系)) {
        result.势力关系 = parsed.势力关系.filter((s: any) => typeof s === 'string' && s.trim());
    }
    if (Array.isArray(parsed.伏笔线索)) {
        result.伏笔线索 = parsed.伏笔线索.filter((s: any) => typeof s === 'string' && s.trim());
    }
    if (Array.isArray(parsed.回收点)) {
        result.回收点 = parsed.回收点.filter((s: any) => typeof s === 'string' && s.trim());
    }
    if (Array.isArray(parsed.章节节奏)) {
        result.章节节奏 = parsed.章节节奏.filter((s: any) => typeof s === 'string' && s.trim());
    }

    const hasAnyField = Object.keys(result).length > 0;
    if (!hasAnyField) {
        throw new Error('AI 补全未返回任何有效字段，请重试或手动填写。');
    }

    return result;
};
