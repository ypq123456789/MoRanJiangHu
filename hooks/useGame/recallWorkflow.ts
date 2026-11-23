import * as textAIService from '../../services/ai/text';
import { 接口设置结构, 记忆系统结构, 游戏设置结构 } from '../../types';
import { 获取剧情回忆接口配置, 接口配置是否可用, 省次数模式已启用 } from '../../utils/apiConfig';
import {
    剧情回忆检索COT提示词,
    剧情回忆检索输出格式提示词,
    构建剧情回忆检索用户提示词
} from '../../prompts/runtime/recall';
import { 规范化记忆系统 } from './memoryUtils';
import {
    构建剧情回忆检索上下文,
    基于候选生成回忆回退结果,
    预筛剧情回忆候选,
    解析剧情回忆输出,
    根据检索结果构建剧情回忆标签
} from './memoryRecall';

export type 剧情回忆检索结果 = {
    tagContent: string;
    previewText: string;
} | null;

export const 执行剧情回忆检索 = async (
    playerInput: string,
    mem: 记忆系统结构,
    apiConfig: 接口设置结构,
    options?: {
        signal?: AbortSignal;
        onDelta?: (delta: string, accumulated: string) => void;
        extraPrompt?: string;
        cotPseudoHistoryPrompt?: string;
    },
    gameConfig?: Partial<游戏设置结构>,
): Promise<剧情回忆检索结果> => {
    const recallApi = 获取剧情回忆接口配置(apiConfig);
    if (!接口配置是否可用(recallApi)) {
        return null;
    }

    const recallConfig = apiConfig.功能模型占位 || ({} as any);
    const fullN = Math.max(1, Number(recallConfig.剧情回忆完整原文条数N) || 20);
    const localCandidates = 预筛剧情回忆候选(playerInput, mem, fullN);
    const memoryCorpus = 构建剧情回忆检索上下文(mem, fullN, {
        candidateIds: localCandidates.map(item => item.id)
    });
    const localFallback = 基于候选生成回忆回退结果(localCandidates);

    const systemPrompt = `${剧情回忆检索COT提示词}\n\n${剧情回忆检索输出格式提示词}`;
    const userPrompt = 构建剧情回忆检索用户提示词(playerInput, memoryCorpus);
    let parsed = localFallback;
    // 省次数模式：剧情回忆在本回合主剧情之前运行，无法并入那一次请求，
    // 因此这里直接跳过模型检索，用本地预筛候选生成回忆标签（不消耗调用次数）。
    // 开关默认跟随总开关开启；用户关掉后仍走原来的模型检索。
    const 使用省次数模式 = 省次数模式已启用(apiConfig)
        && recallConfig.省次数模式包含剧情回忆 !== false;
    if (!使用省次数模式) {
        try {
            const shouldNonStream = gameConfig?.启用非流式输出 || recallConfig.剧情回忆非流式输出 === true;
            const raw = await textAIService.generateMemoryRecall(
                systemPrompt,
                userPrompt,
                recallApi,
                options?.signal,
                !shouldNonStream && options?.onDelta
                    ? {
                        stream: true,
                        onDelta: options.onDelta
                    }
                    : undefined,
                options?.extraPrompt,
                options?.cotPseudoHistoryPrompt
            );
            const modelParsed = 解析剧情回忆输出(raw);
            parsed = (modelParsed.strongIds.length > 0 || modelParsed.weakIds.length > 0)
                ? modelParsed
                : localFallback;
        } catch {
            parsed = localFallback;
        }
    }
    const normalizedMem = 规范化记忆系统(mem);
    const tagContent = 根据检索结果构建剧情回忆标签(normalizedMem, parsed);

    return {
        tagContent,
        previewText: 使用省次数模式
            ? `${parsed.normalizedText || '强回忆:无\n弱回忆:无'}\n（省次数模式：已用本地预筛，未调用检索模型）`
            : (parsed.normalizedText || '强回忆:无\n弱回忆:无')
    };
};
