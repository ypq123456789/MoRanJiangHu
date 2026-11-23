import { describe, expect, it } from 'vitest';
import { 创建空记忆系统, 规范化世界状态 } from '../hooks/useGame/storyState';
import { 构建系统提示词 } from '../hooks/useGame/systemPromptBuilder';

describe('地图层级空值防御', () => {
    it('在世界状态入口删除非法地图节点并原样保留合法节点', () => {
        const rootLayer = {
            ID: 'DT-001',
            名称: '诸天万界',
            层级: '寰宇',
            父级ID: '',
            扩展字段: { 来源: '旧存档' }
        };
        const cityLayer = {
            ID: 'DT-002',
            名称: '临安城',
            层级: '小地点',
            父级ID: 'DT-001'
        };

        const normalized = 规范化世界状态({
            地图层级: [
                rootLayer,
                null,
                undefined,
                '损坏节点',
                42,
                false,
                [],
                {},
                { ID: '   ', 名称: '', 层级: '' },
                cityLayer
            ]
        });

        expect(normalized.地图层级).toEqual([rootLayer, cityLayer]);
        expect(normalized.地图层级[0]).toBe(rootLayer);
        expect((normalized.地图层级[0] as any).扩展字段).toEqual({ 来源: '旧存档' });
    });

    it('系统提示词忽略未归一化数组中的空节点并按有效节点计数', () => {
        const result = 构建系统提示词({
            promptPool: [],
            memoryData: 创建空记忆系统(),
            socialData: [],
            statePayload: {
                角色: {},
                环境: { 大地点: '九州' },
                世界: {
                    地图层级: [
                        null,
                        { ID: 'DT-001', 名称: '九州', 层级: '大地点' },
                        '损坏节点',
                        { ID: 'DT-002', 名称: '临安城', 层级: '小地点', 父级ID: 'DT-001' }
                    ]
                }
            },
            gameConfig: {} as any,
            memoryConfig: {} as any,
            worldbooks: [],
            worldEvolutionEnabled: false
        });

        expect(result.systemPrompt).toContain('[大地点·大陆] 九州');
        expect(result.systemPrompt).toContain('[小地点·城镇] 临安城');
        expect(result.systemPrompt).toContain('地图节点总数: 2');
        expect(result.systemPrompt).not.toContain('损坏节点');
    });
});
