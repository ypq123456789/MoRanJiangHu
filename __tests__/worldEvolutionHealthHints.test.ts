import { describe, expect, it } from 'vitest';
import { 整理世界状态客户可见大事, 构建世界演变上下文文本, 构建世界结构健康提示 } from '../hooks/useGame/worldEvolutionUtils';

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

    it('asks world evolution AI to resolve duplicated faction names and leaked internal ids', () => {
        const hints = 构建世界结构健康提示({
            势力列表: [
                { ID: 'FCT-001', 名称: '大乾皇朝', 当前状态: '边境动荡' },
                { ID: 'FCT-002', 名称: '大乾皇朝', 当前状态: '统治凡俗' },
                { ID: 'FCT-003', 名称: 'FCT-003' }
            ],
            活跃NPC列表: [
                { 姓名: '俞月荷', 所属势力: 'sect_yunxiu' }
            ],
            势力互动历史: [
                { 参与势力: ['FCT-003', 'sect_yunxiu'], 事件摘要: '开始接触' }
            ]
        });

        const text = hints.join('\n');
        expect(text).toContain('同名势力');
        expect(text).toContain('大乾皇朝');
        expect(text).toContain('不要由本地显示层合并');
        expect(text).toContain('内部ID外露');
        expect(text).toContain('sect_yunxiu');
    });

    it('does not leak internal faction ids in visible world news summaries', () => {
        const news = 整理世界状态客户可见大事({
            势力列表: [
                { ID: 'FCT-003', 名称: '万宝商会' },
                { ID: 'sect_yunxiu', 名称: '云岫剑宗' }
            ],
            势力互动历史: [
                { 参与势力: ['FCT-003', 'sect_yunxiu'], 类型: '交易', 事件摘要: '试探山门商路。' }
            ]
        });

        expect(news.join('\n')).toContain('万宝商会、云岫剑宗发生交易');
        expect(news.join('\n')).not.toContain('FCT-003');
        expect(news.join('\n')).not.toContain('sect_yunxiu');
    });
});
