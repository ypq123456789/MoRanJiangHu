import { describe, expect, it } from 'vitest';

import {
    创建接口配置模板,
    获取记忆总结接口配置,
    解析记忆总结生效接口,
    规范化接口设置
} from '../utils/apiConfig';

/**
 * 「记忆总结」面板顶部现在会显示实际生效接口，文案与回退顺序必须锁死：
 * 独立配置 -> 剧情回忆配置 -> 当前启用接口。
 * 这三条一旦被改动，面板就会重新开始骗人（玩家换了主渠道却依旧报旧接口过期）。
 */
const 构造设置 = (功能模型占位: Record<string, unknown> = {}) => 规范化接口设置({
    activeConfigId: 'main-channel',
    configs: [
        {
            ...创建接口配置模板('openai_compatible'),
            id: 'main-channel',
            名称: '主剧情渠道',
            baseUrl: 'https://main.example.test/v1',
            apiKey: 'main-key',
            model: 'main-model'
        },
        {
            ...创建接口配置模板('openai_compatible'),
            id: 'recall-channel',
            名称: '剧情回忆渠道',
            baseUrl: 'https://recall.example.test/v1',
            apiKey: 'recall-key',
            model: 'recall-model'
        },
        {
            ...创建接口配置模板('openai_compatible'),
            id: 'summary-channel',
            名称: '记忆总结渠道',
            baseUrl: 'https://summary.example.test/v1',
            apiKey: 'summary-key',
            model: 'summary-model'
        }
    ],
    功能模型占位
});

describe('记忆总结接口回退顺序', () => {
    it('未开独立模型时跟随剧情回忆配置，而不是主配置', () => {
        const config = 获取记忆总结接口配置(构造设置({
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'recall-channel',
            剧情回忆使用模型: 'recall-model'
        }));

        expect(config?.名称).toBe('剧情回忆渠道');
        expect(config?.baseUrl).toBe('https://recall.example.test/v1');
        expect(config?.model).toBe('recall-model');
    });

    it('未开独立模型且剧情回忆也没开时回退到当前启用接口', () => {
        const config = 获取记忆总结接口配置(构造设置());

        expect(config?.名称).toBe('主剧情渠道');
        expect(config?.baseUrl).toBe('https://main.example.test/v1');
        expect(config?.model).toBe('main-model');
    });

    it('开启独立模型后使用自己的渠道、模型、地址与密钥', () => {
        const config = 获取记忆总结接口配置(构造设置({
            记忆总结独立模型开关: true,
            记忆总结渠道ID: 'summary-channel',
            记忆总结使用模型: 'summary-model',
            记忆总结API地址: 'https://summary-standalone.example.test/v1',
            记忆总结API密钥: 'summary-standalone-key',
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'recall-channel',
            剧情回忆使用模型: 'recall-model'
        }));

        expect(config?.baseUrl).toBe('https://summary-standalone.example.test/v1');
        expect(config?.apiKey).toBe('summary-standalone-key');
        expect(config?.model).toBe('summary-model');
    });

    it('独立模型指向已删除的渠道时回退到当前启用接口，不会返回空配置', () => {
        const config = 获取记忆总结接口配置(构造设置({
            记忆总结独立模型开关: true,
            记忆总结渠道ID: 'deleted-channel',
            记忆总结使用模型: 'summary-model'
        }));

        expect(config?.名称).toBe('主剧情渠道');
        expect(config?.baseUrl).toBe('https://main.example.test/v1');
        expect(config?.model).toBe('summary-model');
    });

    it('规范化会把空模型补成默认模型，独立开关打开后不会出现"有开关没模型"', () => {
        const config = 获取记忆总结接口配置(规范化接口设置({
            activeConfigId: 'empty-channel',
            configs: [
                {
                    ...创建接口配置模板('openai_compatible'),
                    id: 'empty-channel',
                    名称: '空模型渠道',
                    baseUrl: 'https://empty.example.test/v1',
                    apiKey: 'empty-key',
                    model: ''
                }
            ],
            功能模型占位: {
                记忆总结独立模型开关: true,
                记忆总结渠道ID: 'empty-channel',
                记忆总结使用模型: ''
            }
        }));

        expect(config?.model?.trim()).toBeTruthy();
    });
});

/**
 * 报错弹窗的「检查接口设置」必须落到真正能改的那一页。
 * v1.0.703 一律跳「记忆总结」页，玩家在回退到剧情回忆/主配置时对着灰色输入框无从下手。
 */
describe('记忆总结报错跳转目标', () => {
    it('独立模型开启且渠道存在时跳到记忆总结页', () => {
        const resolved = 解析记忆总结生效接口(构造设置({
            记忆总结独立模型开关: true,
            记忆总结渠道ID: 'summary-channel',
            记忆总结使用模型: 'summary-model'
        }));

        expect(resolved.来源).toBe('independent');
        expect(resolved.设置页).toBe('memory_summary_model');
        expect(resolved.配置?.名称).toBe('记忆总结渠道');
    });

    it('未开独立模型且剧情回忆可用时跳到剧情回忆页', () => {
        const resolved = 解析记忆总结生效接口(构造设置({
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'recall-channel',
            剧情回忆使用模型: 'recall-model'
        }));

        expect(resolved.来源).toBe('recall');
        expect(resolved.设置页).toBe('recall');
        expect(resolved.配置?.名称).toBe('剧情回忆渠道');
    });

    it('既没开独立模型也没开剧情回忆时跳到接口连接页', () => {
        const resolved = 解析记忆总结生效接口(构造设置());

        expect(resolved.来源).toBe('primary');
        expect(resolved.设置页).toBe('api');
        expect(resolved.配置?.名称).toBe('主剧情渠道');
    });

    it('独立开关开着但渠道被删且没填独立地址时，按混合配置处理：主入口仍是记忆总结，另给主接口入口', () => {
        const resolved = 解析记忆总结生效接口(构造设置({
            记忆总结独立模型开关: true,
            记忆总结渠道ID: 'deleted-channel',
            记忆总结使用模型: 'summary-model'
        }));

        expect(resolved.来源).toBe('independent-mixed');
        expect(resolved.设置页).toBe('memory_summary_model');
        expect(resolved.次要设置页).toBe('api');
        // 配置必须与真实请求一致：地址来自主配置，模型仍是被独立覆盖的那个
        expect(resolved.配置?.baseUrl).toBe('https://main.example.test/v1');
        expect(resolved.配置?.model).toBe('summary-model');
    });

    it('独立开关与剧情回忆同时开启且独立渠道被删时，不误跳到剧情回忆页', () => {
        const resolved = 解析记忆总结生效接口(构造设置({
            记忆总结独立模型开关: true,
            记忆总结渠道ID: 'deleted-channel',
            记忆总结使用模型: 'summary-model',
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'recall-channel',
            剧情回忆使用模型: 'recall-model'
        }));

        // 独立开关开启时 getter 不会读剧情回忆，跳过去改也不生效
        expect(resolved.来源).toBe('independent-mixed');
        expect(resolved.设置页).toBe('memory_summary_model');
        expect(resolved.配置?.model).toBe('summary-model');
        expect(resolved.配置?.baseUrl).toBe('https://main.example.test/v1');
    });

    it('主模型为空但独立模型有效时，混合配置仍应判定为可用', () => {
        const resolved = 解析记忆总结生效接口(规范化接口设置({
            activeConfigId: 'empty-model-channel',
            configs: [
                {
                    ...创建接口配置模板('openai_compatible'),
                    id: 'empty-model-channel',
                    名称: '空模型主渠道',
                    baseUrl: 'https://empty-model.example.test/v1',
                    apiKey: 'empty-model-key',
                    model: ''
                }
            ],
            功能模型占位: {
                记忆总结独立模型开关: true,
                记忆总结渠道ID: 'deleted-channel',
                记忆总结使用模型: 'summary-model'
            }
        }));

        expect(resolved.来源).toBe('independent-mixed');
        expect(resolved.配置?.model).toBe('summary-model');
        expect(resolved.配置?.baseUrl).toBe('https://empty-model.example.test/v1');
    });

    it('独立渠道被删但填了独立地址时，仍按独立配置处理', () => {
        const resolved = 解析记忆总结生效接口(构造设置({
            记忆总结独立模型开关: true,
            记忆总结渠道ID: 'deleted-channel',
            记忆总结使用模型: 'summary-model',
            记忆总结API地址: 'https://summary-standalone.example.test/v1'
        }));

        expect(resolved.来源).toBe('independent');
        expect(resolved.设置页).toBe('memory_summary_model');
        expect(resolved.配置?.baseUrl).toBe('https://summary-standalone.example.test/v1');
    });
});
