import { describe, expect, it } from 'vitest';

import {
    创建接口配置模板,
    获取文章优化接口配置,
    获取剧情回忆接口配置,
    获取地图自动更新接口配置,
    获取小说拆分接口配置,
    获取规划分析接口配置,
    获取世界演变接口配置,
    获取记忆精炼接口配置,
    获取记忆总结接口配置,
    获取变量计算接口配置,
    规范化接口设置
} from '../utils/apiConfig';
import { 主剧情套用阶段字段表, 套用主剧情模型到生成阶段 } from '../utils/workflowModelFollow';

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
            id: 'old-channel',
            名称: '旧渠道',
            baseUrl: 'https://old.example.test/v1',
            apiKey: 'old-key',
            model: 'old-model'
        }
    ],
    功能模型占位
});

describe('生成流程图一键套用主剧情模型', () => {
    it('把全部生成阶段的渠道与模型对齐到主剧情，并清空独立地址和密钥', () => {
        const result = 套用主剧情模型到生成阶段(构造设置({
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'old-channel',
            剧情回忆使用模型: 'old-model',
            剧情回忆API地址: 'https://old-manual.test/v1',
            剧情回忆API密钥: 'old-manual-key',
            文章优化独立模型开关: true,
            文章优化渠道ID: 'old-channel',
            文章优化使用模型: 'old-model',
            变量计算独立模型开关: true,
            变量计算渠道ID: 'old-channel',
            变量计算使用模型: 'old-model'
        }));

        expect(result.ok).toBe(true);
        expect(result.模型).toBe('main-model');
        expect(result.渠道名称).toBe('主剧情渠道');
        expect(result.阶段).toEqual([
            '剧情回忆', '文章优化', '变量生成', '动态世界', '规划分析', '地图更新', '记忆总结', '记忆精炼', '小说分解'
        ]);

        const feature = result.设置.功能模型占位 as unknown as Record<string, unknown>;
        for (const 字段 of 主剧情套用阶段字段表) {
            expect(feature[字段.渠道键]).toBe('main-channel');
            expect(feature[字段.模型键]).toBe('main-model');
            expect(feature[字段.地址键]).toBe('');
            expect(feature[字段.密钥键]).toBe('');
        }
    });

    it('套用后各阶段实际使用的接口地址与密钥来自主剧情渠道', () => {
        const before = 构造设置({
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'old-channel',
            剧情回忆使用模型: 'old-model',
            剧情回忆API地址: 'https://old-manual.test/v1',
            剧情回忆API密钥: 'old-manual-key',
            // 这些开关同时兼任阶段的功能开关，关掉时 `获取*接口配置` 会返回 null
            // （阶段不执行），因此先按"玩家把各阶段都开着"的常见状态打开。
            文章优化独立模型开关: true,
            变量计算独立模型开关: true,
            记忆总结独立模型开关: true,
            记忆精炼独立模型开关: true,
            地图自动更新独立模型开关: true
        });
        expect(获取剧情回忆接口配置(before)?.baseUrl).toBe('https://old-manual.test/v1');

        const after = 套用主剧情模型到生成阶段(before).设置;
        const 阶段配置 = [
            获取剧情回忆接口配置(after),
            获取文章优化接口配置(after),
            获取变量计算接口配置(after),
            获取世界演变接口配置(after),
            获取规划分析接口配置(after),
            获取地图自动更新接口配置(after),
            获取记忆总结接口配置(after),
            获取记忆精炼接口配置(after),
            获取小说拆分接口配置(after)
        ];

        for (const 配置 of 阶段配置) {
            expect(配置).toBeTruthy();
            expect(配置?.baseUrl).toBe('https://main.example.test/v1');
            expect(配置?.apiKey).toBe('main-key');
            expect(配置?.model).toBe('main-model');
        }
    });

    it('只改模型与渠道，不改动阶段功能开关', () => {
        const result = 套用主剧情模型到生成阶段(构造设置({
            剧情回忆独立模型开关: true,
            文章优化独立模型开关: false,
            变量计算独立模型开关: true,
            世界演变功能启用: false,
            规划分析功能启用: true,
            规划分析独立模型开关: false,
            地图生成功能启用: true,
            地图自动更新独立模型开关: false,
            记忆总结独立模型开关: false
        }));

        expect(result.ok).toBe(true);
        expect(result.设置.功能模型占位.剧情回忆独立模型开关).toBe(true);
        expect(result.设置.功能模型占位.文章优化独立模型开关).toBe(false);
        expect(result.设置.功能模型占位.变量计算独立模型开关).toBe(true);
        expect(result.设置.功能模型占位.世界演变功能启用).toBe(false);
        expect(result.设置.功能模型占位.规划分析独立模型开关).toBe(false);
        expect(result.设置.功能模型占位.地图自动更新独立模型开关).toBe(false);
        expect(result.设置.功能模型占位.记忆总结独立模型开关).toBe(false);
    });

    it('支持显式指定要套用的模型（临时切备用模型时不必先改主剧情）', () => {
        const result = 套用主剧情模型到生成阶段(构造设置({
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'old-channel',
            剧情回忆使用模型: 'old-model'
        }), { 模型: 'backup-model' });

        expect(result.ok).toBe(true);
        expect(result.模型).toBe('backup-model');
        expect(result.设置.功能模型占位.剧情回忆使用模型).toBe('backup-model');
        expect(result.设置.功能模型占位.剧情回忆渠道ID).toBe('main-channel');
    });

    it('没有渠道时拒绝套用并给出引导', () => {
        const result = 套用主剧情模型到生成阶段(规范化接口设置({ configs: [], 功能模型占位: {} }));

        expect(result.ok).toBe(false);
        expect(result.原因).toContain('渠道');
        expect(result.设置.功能模型占位.剧情回忆使用模型).toBe('');
    });
});
