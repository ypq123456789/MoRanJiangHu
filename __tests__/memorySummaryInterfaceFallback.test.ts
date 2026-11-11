import { describe, expect, it } from 'vitest';

import {
    创建接口配置模板,
    获取记忆总结接口配置,
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
