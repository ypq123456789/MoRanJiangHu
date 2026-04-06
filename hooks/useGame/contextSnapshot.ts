import type { OpeningConfig, 聊天记录结构, 记忆系统结构, 角色数据结构, 提示词结构, 内置提示词条目结构, 世界书结构 } from '../../types';
import { 获取剧情回忆接口配置, 获取主剧情接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 规范化记忆配置, 规范化记忆系统 } from './memoryUtils';
import { 构建主剧情请求参数, type 主剧情系统上下文 } from './mainStoryRequest';
import { 剧情回忆检索COT提示词, 剧情回忆检索输出格式提示词, 构建剧情回忆检索用户提示词 } from '../../prompts/runtime/recall';
import { 构建剧情回忆检索上下文 } from './memoryRecall';
import { 构建COT伪装提示词 } from './promptRuntime';
import { countOpenAIChatMessagesTokensWithBreakdown } from '../../utils/tokenEstimate';
import { 获取激活小说拆分注入文本 } from '../../services/novelDecompositionInjection';

export type 运行时提示词状态 = {
    当前启用: boolean;
    原始启用: boolean;
    受运行时接管: boolean;
    运行时注入: boolean;
};

export type 上下文段 = {
    id: string;
    title: string;
    category: string;
    order: number;
    content: string;
    uploadTokens: number;
};

export type 上下文快照 = {
    sections: 上下文段[];
    fullText: string;
    uploadTokens: number;
    runtimePromptStates: Record<string, 运行时提示词状态>;
};

type 构建上下文快照参数 = {
    apiConfig: any;
    gameConfig: any;
    memoryConfig: any;
    prompts: 提示词结构[];
    内置提示词列表: 内置提示词条目结构[];
    世界书列表: 世界书结构[];
    记忆系统: 记忆系统结构;
    历史记录: 聊天记录结构[];
    社交: any[];
    角色: 角色数据结构;
    环境: any;
    世界: any;
    战斗: any;
    玩家门派: any;
    任务列表: any[];
    约定列表: any[];
    剧情: any;
    剧情规划: any;
    女主剧情规划?: any;
    同人剧情规划?: any;
    同人女主剧情规划?: any;
    开局配置?: OpeningConfig;
    规范化环境信息: (envLike?: any) => any;
    规范化剧情状态: (raw?: any) => any;
    规范化剧情规划状态: (raw?: any) => any;
    规范化女主剧情规划状态: (raw?: any) => any;
    规范化同人剧情规划状态: (raw?: any) => any;
    规范化同人女主剧情规划状态: (raw?: any) => any;
    按回合窗口裁剪历史: (history: 聊天记录结构[], rounds: number) => 聊天记录结构[];
    构建系统提示词: (promptPool: 提示词结构[], memoryData: 记忆系统结构, socialData: any[], statePayload: any, options?: any) => 主剧情系统上下文 & {
        runtimePromptStates: Record<string, 运行时提示词状态>;
    };
};

export const 构建上下文快照数据 = async (params: 构建上下文快照参数): Promise<上下文快照> => {
    const normalizedMem = 规范化记忆系统(params.记忆系统);
    const recallConfig = params.apiConfig?.功能模型占位 || ({} as any);
    const recallFeatureEnabled = Boolean(recallConfig.剧情回忆独立模型开关);
    const recallMinRound = Math.max(1, Number(recallConfig.剧情回忆最早触发回合) || 10);
    const nextRound = (Array.isArray(normalizedMem.回忆档案) ? normalizedMem.回忆档案.length : 0) + 1;
    const recallRoundReady = nextRound >= recallMinRound;
    const recallApi = 获取剧情回忆接口配置(params.apiConfig);
    const recallApiUsable = recallFeatureEnabled && 接口配置是否可用(recallApi);
    const recallContextMode = recallFeatureEnabled && recallRoundReady && recallApiUsable;
    const normalizedStory = params.规范化剧情状态(params.剧情);
    const normalizedStoryPlan = params.规范化剧情规划状态(params.剧情规划);
    const normalizedHeroinePlan = params.规范化女主剧情规划状态(params.女主剧情规划);
    const normalizedFandomStoryPlan = params.规范化同人剧情规划状态(params.同人剧情规划);
    const normalizedFandomHeroinePlan = params.规范化同人女主剧情规划状态(params.同人女主剧情规划);
    const builtContext = params.构建系统提示词(
        params.prompts,
        normalizedMem,
        params.社交,
        {
            角色: params.角色,
            环境: params.规范化环境信息(params.环境),
            世界: params.世界,
            战斗: params.战斗,
            玩家门派: params.玩家门派,
            任务列表: params.任务列表,
            约定列表: params.约定列表,
            剧情: normalizedStory,
            剧情规划: normalizedStoryPlan,
            女主剧情规划: normalizedHeroinePlan,
            同人剧情规划: normalizedFandomStoryPlan,
            同人女主剧情规划: normalizedFandomHeroinePlan,
            开局配置: params.开局配置
        },
        recallContextMode
            ? { 禁用中期长期记忆: true, 禁用短期记忆: true }
            : undefined
    );

    const normalizedSnapshotMemoryConfig = 规范化记忆配置(params.memoryConfig);
    const scriptRoundLimit = Math.max(1, Number(normalizedSnapshotMemoryConfig.即时消息上传条数N) || 10);
    const snapshotScriptHistory = params.按回合窗口裁剪历史(params.历史记录, scriptRoundLimit);
    const latestUserInput = [...params.历史记录]
        .reverse()
        .find(item => item.role === 'user' && typeof item.content === 'string' && item.content.trim().length > 0)
        ?.content
        ?.trim() || '暂无';

    const novelDecompositionPrompt = await 获取激活小说拆分注入文本(
        params.apiConfig,
        'main_story',
        params.开局配置,
        normalizedStory,
        params.角色?.姓名 || ''
    );

    const { messageEntries } = 构建主剧情请求参数({
        gameConfig: params.gameConfig,
        apiConfig: params.apiConfig,
        builtContext,
        updatedContextHistory: snapshotScriptHistory,
        updatedMemSys: normalizedMem,
        sendInput: latestUserInput,
        novelDecompositionPrompt,
        playerRole: params.角色,
        builtinPromptEntries: params.内置提示词列表,
        worldbooks: params.世界书列表
    });
    const mainModel = 获取主剧情接口配置(params.apiConfig)?.model || '';
    const mainBreakdown = countOpenAIChatMessagesTokensWithBreakdown(
        messageEntries.map((entry) => ({ role: entry.role, content: entry.content })),
        mainModel
    );

    const sections: 上下文段[] = messageEntries.map((entry, index) => ({
            id: entry.id,
            title: entry.title,
            category: entry.category,
            order: index + 1,
            content: entry.content,
            uploadTokens: mainBreakdown.items[index]?.totalTokens || 0
        }));
    if (recallFeatureEnabled && recallApiUsable) {
        const runtimeGameConfig = 规范化游戏设置(params.gameConfig);
        const fullN = Math.max(1, Number(recallConfig.剧情回忆完整原文条数N) || 20);
        const memoryCorpus = 构建剧情回忆检索上下文(normalizedMem, fullN);
        const recallSystemPrompt = `${剧情回忆检索COT提示词}\n\n${剧情回忆检索输出格式提示词}`;
        const recallUserPrompt = 构建剧情回忆检索用户提示词(latestUserInput, memoryCorpus);
        const recallExtraPrompt = typeof runtimeGameConfig.额外提示词 === 'string'
            ? runtimeGameConfig.额外提示词.trim()
            : '';
        const recallCotPseudoPrompt = runtimeGameConfig.启用COT伪装注入 !== false
            ? 构建COT伪装提示词(runtimeGameConfig)
            : '';
        const recallMessages = [
            {
                id: 'recall_system',
                title: '剧情回忆系统提示词',
                category: '回忆API',
                role: 'system' as const,
                content: recallSystemPrompt
            },
            ...(recallExtraPrompt
                ? [{
                    id: 'recall_extra_prompt',
                    title: '剧情回忆额外要求',
                    category: '回忆API',
                    role: 'user' as const,
                    content: `【额外要求提示词】\n${recallExtraPrompt}`
                }]
                : []),
            {
                id: 'recall_user_prompt',
                title: '剧情回忆用户提示词',
                category: '回忆API',
                role: 'user' as const,
                content: recallUserPrompt
            },
            ...(recallCotPseudoPrompt
                ? [{
                    id: 'recall_cot_pseudo',
                    title: '剧情回忆COT伪装历史消息',
                    category: '回忆API',
                    role: 'assistant' as const,
                    content: recallCotPseudoPrompt
                }]
                : [])
        ];
        const recallBreakdown = countOpenAIChatMessagesTokensWithBreakdown(
            recallMessages.map((item) => ({ role: item.role, content: item.content })),
            recallApi?.model || ''
        );
        const recallSections: 上下文段[] = recallMessages.map((item, index) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            order: sections.length + index + 1,
            content: item.content,
            uploadTokens: recallBreakdown.items[index]?.totalTokens || 0
        }));
        sections.push(...recallSections);
    }
    const fullText = sections.map(section => section.content).join('\n\n');
    const uploadTokens = sections.reduce((sum, section) => sum + (Number(section.uploadTokens) || 0), 0);

    return {
        sections,
        fullText,
        uploadTokens,
        runtimePromptStates: builtContext.runtimePromptStates
    };
};
