/**
 * NovelAI 生图模型与请求族判断。
 *
 * 背景：NovelAI 官方没有提供 /models 列表接口，文生图设置里的「获取模型列表」只能给出内置建议，
 * 所以模型 ID 必须随官方版本更新（当前为 V5 系列）。
 *
 * 请求体差异（见官方文档与 2026-09 的 V5 API 实测）：
 * - V4 / V4.5 / V5 都必须带 `v4_prompt` 与 `v4_negative_prompt`，缺一个直接 500；
 *   不能像 V3 那样只发顶层 `negative_prompt`。
 * - V5 的默认引导系数为 4.0（V4.5 为 5.0）。
 * - `nai-diffusion-5-full-medium` 是蒸馏版：步数锁 14、采样器锁 Euler Ancestral、
 *   不支持自定义 UC 负面提示词，也不支持 CFG 重缩放。
 */

export const NovelAI模型建议 = [
    'nai-diffusion-5-full',
    'nai-diffusion-5-curated',
    'nai-diffusion-5-full-medium',
    'nai-diffusion-4-5-full',
    'nai-diffusion-4-5-curated',
    'nai-diffusion-4-full'
];

const 读取模型ID = (model: unknown): string => (typeof model === 'string' ? model.trim() : '');

/** V4 / V4.5 / V5 都使用结构化 v4_prompt 请求体。 */
export const 是否NovelAI结构化提示模型 = (model: unknown): boolean =>
    /^nai-diffusion-(?:4|5)(?:-|$)/i.test(读取模型ID(model));

/** V5 系模型（含 Full / Curated / Full Medium）。 */
export const 是否NovelAIV5模型 = (model: unknown): boolean =>
    /^nai-diffusion-5(?:-|$)/i.test(读取模型ID(model));

/** V5 Full Medium：蒸馏版，步数/采样器/负面提示词均受限。 */
export const 是否NovelAIV5中等强度模型 = (model: unknown): boolean =>
    /^nai-diffusion-5-full-medium$/i.test(读取模型ID(model));

/** 当前模型的默认引导系数（Prompt Guidance）。 */
export const 获取NovelAI默认引导系数 = (model: unknown): number =>
    是否NovelAIV5模型(model) ? 4 : 5;
