// 当前聊天补全路径支持 top_p；Gemini Deep Research 使用独立 Interactions 协议。
export const supportsVariableReviewTopP = (config: { baseUrl?: string; model?: string }): boolean =>
    !(/deep-research/i.test(config.model || '') && /googleapis\.com/i.test(config.baseUrl || ''));

export const variableReviewSamplingLimits = (config: { baseUrl?: string; 供应商?: string }) => {
    const mimo = /^mimo_/i.test(config.供应商 || '') || /xiaomimimo\.com/i.test(config.baseUrl || '');
    return { temperatureMax: mimo ? 1.5 : 2, topPMin: mimo ? 0.01 : 0 };
};
