import { describe, expect, it } from 'vitest';
import { 构建势力关系图数据, 构建势力关系边列表 } from '../utils/worldFactionRelations';

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
});
