import { describe, expect, it } from 'vitest';
import { 构建世界演变上下文文本, 构建世界结构健康提示 } from '../hooks/useGame/worldEvolutionUtils';

describe('world evolution health hints', () => {
    it('flags empty event pools as backfill candidates for world evolution', () => {
        const hints = 构建世界结构健康提示({
            待执行事件: [],
            进行中事件: [],
            势力列表: [
                { ID: 'FCT-001', 名称: '青云门', 当前状态: '正在扩张商路' },
                { ID: 'FCT-002', 名称: '铁衣帮', 当前状态: '封锁渡口' }
            ]
        });

        expect(hints.join('\n')).toContain('风云变幻断档');
        expect(hints.join('\n')).toContain('势力余波');
        expect(hints.join('\n')).toContain('世界.进行中事件');
    });

    it('injects health hints into the world-evolution context', () => {
        const context = 构建世界演变上下文文本({
            worldData: {
                待执行事件: [],
                进行中事件: [],
                势力列表: [{ ID: 'FCT-001', 名称: '天机阁', 当前状态: '收集各方情报' }]
            }
        });

        expect(context).toContain('【世界结构健康检查】');
        expect(context).toContain('风云变幻断档');
        expect(context).toContain('【本回合可触发演变候选】');
    });
});
