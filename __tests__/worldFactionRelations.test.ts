import { describe, expect, it } from 'vitest';
import { 构建世界显示名解析器, 构建势力关系图数据, 构建势力关系边列表 } from '../utils/worldFactionRelations';

describe('world faction relations', () => {
    it('renders faction relation targets as names instead of FCT ids', () => {
        const edges = 构建势力关系边列表([
            { ID: 'FCT-001', 名称: '大乾仙朝', 关系网: { 'FCT-002': '敌对', 'FCT-003': '联盟' } },
            { ID: 'FCT-002', 名称: '九幽魔宗', 关系网: { 'FCT-001': '敌对' } },
            { ID: 'FCT-003', 名称: '万法仙盟', 关系网: {} }
        ]);

        expect(edges).toEqual([
            expect.objectContaining({ sourceName: '大乾仙朝', targetName: '九幽魔宗', relation: '敌对' }),
            expect.objectContaining({ sourceName: '大乾仙朝', targetName: '万法仙盟', relation: '联盟' })
        ]);
        expect(edges.map(edge => edge.targetName)).not.toContain('FCT-002');
    });

    it('deduplicates mirrored relation records', () => {
        const edges = 构建势力关系边列表([
            { ID: 'FCT-001', 名称: '青云门', 关系网: { 'FCT-002': '友好' } },
            { ID: 'FCT-002', 名称: '四海商会', 关系网: { 'FCT-001': '友好' } }
        ]);

        expect(edges).toHaveLength(1);
        expect(edges[0]).toMatchObject({
            sourceName: '青云门',
            targetName: '四海商会',
            relation: '友好'
        });
    });

    it('builds circular graph nodes and red gray green relation colors', () => {
        const graph = 构建势力关系图数据([
            { ID: 'FCT-001', 名称: '大乾王朝', 关系网: { 'FCT-002': '敌对', 'FCT-003': '中立' } },
            { ID: 'FCT-002', 名称: '九幽魔宗', 关系网: { 'FCT-004': '友好' } },
            { ID: 'FCT-003', 名称: '太玄仙宗', 关系网: {} },
            { ID: 'FCT-004', 名称: '多宝商会', 关系网: {} }
        ]);

        expect(graph.nodes).toHaveLength(4);
        expect(graph.nodes.every(node => node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 100)).toBe(true);
        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceName: '大乾王朝', targetName: '九幽魔宗', tone: 'bad' }),
            expect.objectContaining({ sourceName: '大乾王朝', targetName: '太玄仙宗', tone: 'neutral' }),
            expect.objectContaining({ sourceName: '九幽魔宗', targetName: '多宝商会', tone: 'good' })
        ]));
    });

    it('does not invent neutral pairwise graph edges when factions have no relation net yet', () => {
        const graph = 构建势力关系图数据([
            { ID: 'FCT-001', 名称: '云岫剑宗' },
            { ID: 'FCT-002', 名称: '大乾王朝' },
            { ID: 'FCT-003', 名称: '万宝商会' },
            { ID: 'FCT-004', 名称: '黑风寨' },
            { ID: 'FCT-005', 名称: '青石镇赵家' }
        ]);

        expect(graph.nodes).toHaveLength(5);
        expect(graph.edges).toHaveLength(0);
    });

    it('preserves same-name factions for AI-side diagnosis instead of local merging', () => {
        const graph = 构建势力关系图数据([
            { ID: 'FCT-001', 名称: '大乾皇朝', 实力等级: 6, 当前状态: '边境动荡' },
            { ID: 'FCT-002', 名称: '大乾皇朝', 实力等级: 9, 当前状态: '统治凡俗' },
            { ID: 'FCT-003', 名称: '万宝商会', 实力等级: 7 }
        ]);

        expect(graph.nodes.map(node => node.name)).toEqual(['大乾皇朝', '大乾皇朝', '万宝商会']);
        expect(graph.nodes.map(node => node.id)).toEqual(['FCT-001', 'FCT-002', 'FCT-003']);
    });

    it('maps internal faction and sect ids to visible names and hides unknown ids', () => {
        const resolveName = 构建世界显示名解析器(
            [
                { ID: 'FCT-003', 名称: '万宝商会' },
                { ID: 'sect_yunxiu', 名称: '云岫剑宗' }
            ],
            [
                { ID: 'sect_yunxiu', 名称: '云岫剑宗' }
            ]
        );

        expect(resolveName('FCT-003')).toBe('万宝商会');
        expect(resolveName('sect_yunxiu')).toBe('云岫剑宗');
        expect(resolveName('FCT-404')).toBe('');
        expect(resolveName('sect_missing')).toBe('');
    });
});
