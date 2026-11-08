import { describe, expect, it } from 'vitest';
import { __测试__构建NovelAI请求体 } from '../services/ai/imageTasks';
import {
    NovelAI模型建议,
    是否NovelAI结构化提示模型,
    是否NovelAIV5中等强度模型,
    是否NovelAIV5模型,
    获取NovelAI默认引导系数
} from '../utils/novelAiModels';

const 构建配置 = (model: string, overrides: Record<string, unknown> = {}) => ({
    id: 'novelai-test',
    名称: 'NovelAI',
    baseUrl: 'https://image.novelai.net',
    apiKey: 'pst-test',
    model,
    ...overrides
} as any);

const 读取参数 = (body: Record<string, any>) => body.parameters as Record<string, any>;

describe('NovelAI 模型族判断', () => {
    it('把 V4 / V4.5 / V5 都识别为结构化提示模型', () => {
        for (const model of ['nai-diffusion-4', 'nai-diffusion-4-5-full', 'nai-diffusion-5-full', 'nai-diffusion-5-curated']) {
            expect(是否NovelAI结构化提示模型(model)).toBe(true);
        }
        for (const model of ['nai-diffusion-3', 'nai-diffusion-3-furry', '']) {
            expect(是否NovelAI结构化提示模型(model)).toBe(false);
        }
    });

    it('只把 5 系识别为 V5，并识别出 Full Medium', () => {
        expect(是否NovelAIV5模型('nai-diffusion-5-full')).toBe(true);
        expect(是否NovelAIV5模型('nai-diffusion-4-5-full')).toBe(false);
        expect(是否NovelAIV5中等强度模型('nai-diffusion-5-full-medium')).toBe(true);
        expect(是否NovelAIV5中等强度模型('nai-diffusion-5-full')).toBe(false);
        expect(获取NovelAI默认引导系数('nai-diffusion-5-full')).toBe(4);
        expect(获取NovelAI默认引导系数('nai-diffusion-4-5-full')).toBe(5);
    });

    it('内置模型建议包含 V5 全系，并且排在 V4 之前', () => {
        expect(NovelAI模型建议).toEqual(expect.arrayContaining([
            'nai-diffusion-5-full',
            'nai-diffusion-5-curated',
            'nai-diffusion-5-full-medium',
            'nai-diffusion-4-5-full',
            'nai-diffusion-4-5-curated',
            'nai-diffusion-4-full'
        ]));
        expect(NovelAI模型建议[0]).toBe('nai-diffusion-5-full');
    });
});

describe('NovelAI 请求体：V5 支持', () => {
    it('V5 Full 必须带 v4_prompt / v4_negative_prompt，且不再发顶层 negative_prompt', () => {
        const body = __测试__构建NovelAI请求体('1girl, solo', 构建配置('nai-diffusion-5-full'), '832x1216');
        const parameters = 读取参数(body);

        expect(body.model).toBe('nai-diffusion-5-full');
        expect(parameters.v4_prompt?.caption?.base_caption).toBe('1girl, solo');
        expect(typeof parameters.v4_negative_prompt?.caption?.base_caption).toBe('string');
        expect(parameters.negative_prompt).toBeUndefined();
        expect(parameters.scale).toBe(4);
        expect(parameters.steps).toBe(28);
    });

    it('V4 / V4.5 保持原有结构化请求与 5.0 引导系数', () => {
        const body = __测试__构建NovelAI请求体('1girl', 构建配置('nai-diffusion-4-5-full'), '832x1216');
        const parameters = 读取参数(body);

        expect(parameters.v4_prompt?.caption?.base_caption).toBe('1girl');
        expect(parameters.negative_prompt).toBeUndefined();
        expect(parameters.scale).toBe(5);
    });

    it('V5 Full Medium 锁定 14 步 / Euler Ancestral，并忽略 cfg_rescale', () => {
        const body = __测试__构建NovelAI请求体(
            '1girl',
            构建配置('nai-diffusion-5-full-medium', {
                NovelAI启用自定义参数: true,
                NovelAI采样器: 'k_dpmpp_2m',
                NovelAI步数: 28
            }),
            '832x1216',
            undefined,
            { PNG参数: { CFG重缩放: 0.7 } as any }
        );
        const parameters = 读取参数(body);

        expect(parameters.steps).toBe(14);
        expect(parameters.sampler).toBe('k_euler_ancestral');
        expect(parameters.cfg_rescale).toBeUndefined();
        expect(parameters.v4_prompt?.caption?.base_caption).toBe('1girl');
    });

    it('V3 仍走顶层 negative_prompt，不生成 v4_prompt', () => {
        const body = __测试__构建NovelAI请求体('1girl', 构建配置('nai-diffusion-3'), '832x1216');
        const parameters = 读取参数(body);

        expect(parameters.v4_prompt).toBeUndefined();
        expect(typeof parameters.negative_prompt).toBe('string');
        expect(parameters.scale).toBe(5);
    });
});
