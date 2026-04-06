import type { GameResponse } from '../../types';

const 清理思考标签 = (text: unknown): string => (
    typeof text === 'string'
        ? text
            .replace(/<\s*\/?\s*thinking\s*>/gi, '')
            .replace(/<\s*\/?\s*think\s*>/gi, '')
            .trim()
        : ''
);

const 清理剧情规划标签 = (text: unknown): string => (
    typeof text === 'string'
        ? text
            .replace(/<\s*\/?\s*剧情规划\s*>/gi, '')
            .replace(/<\s*\/?\s*story\s*plan(?:ning)?\s*>/gi, '')
            .trim()
        : ''
);

const 清理变量规划标签 = (text: unknown): string => (
    typeof text === 'string'
        ? text
            .replace(/<\s*\/?\s*变量规划\s*>/gi, '')
            .replace(/<\s*\/?\s*var(?:iable)?\s*plan(?:ning)?\s*>/gi, '')
            .trim()
        : ''
);

export const 提取响应规划文本 = (response?: GameResponse): string => 清理剧情规划标签(response?.t_plan);

export const 提取响应变量规划文本 = (response?: GameResponse): string => 清理变量规划标签(response?.t_var_plan);

export const 提取响应思考上下文 = (
    response?: GameResponse,
    fallback?: string
): string => {
    const nativeThinking = 清理思考标签(response?.thinking_native);
    const normalizedThinking = 清理思考标签(response?.thinking_pre);
    const planThinking = 提取响应规划文本(response);
    const varPlanThinking = 提取响应变量规划文本(response);
    const fallbackThinking = 清理思考标签(fallback);

    const blocks = [
        nativeThinking
            ? `【本回合<think>】\n${nativeThinking}`
            : '',
        normalizedThinking && normalizedThinking !== nativeThinking
            ? `【本回合<thinking>】\n${normalizedThinking}`
            : '',
        varPlanThinking
            ? `【本回合<变量规划>】\n${varPlanThinking}`
            : '',
        planThinking
            ? `【本回合<剧情规划>】\n${planThinking}`
            : '',
        fallbackThinking && fallbackThinking !== nativeThinking && fallbackThinking !== normalizedThinking
            ? `【补充思考】\n${fallbackThinking}`
            : ''
    ].filter(Boolean);

    return blocks.join('\n\n').trim();
};
