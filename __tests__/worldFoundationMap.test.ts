import { describe, expect, it } from 'vitest';
import { 合并世界基底到开场状态 } from '../hooks/useGame/storyState';

const 基底 = {
    mapLayers: [
        { 名称: '玄天大陆', 层级: '寰宇', 父级ID: '', 描述: '整个世界' },
        { 名称: '北境帝国', 层级: '大地点', 父级ID: '玄天大陆', 描述: '北方帝国' },
        { 名称: '南疆联邦', 层级: '大地点', 父级ID: '玄天大陆', 描述: '南方联盟' },
        { 名称: '霜城', 层级: '中地点', 父级ID: '北境帝国', 描述: '北境首府' },
        { 名称: '赤水城', 层级: '中地点', 父级ID: '南疆联邦', 描述: '水运枢纽' },
        { 名称: '城南坊市', 层级: '小地点', 父级ID: '霜城', 描述: '市集' },
        { 名称: '旧船坞', 层级: '区地点', 父级ID: '城南坊市', 描述: '码头' },
        { 名称: '货仓', 层级: '子地点', 父级ID: '旧船坞', 描述: '仓房' }
    ],
    factions: [
        { ID: 'F1', 名称: '霜城守军', 类型: '官府', 实力等级: 6, 地盘归属: '霜城', 描述: '', 代表性物品风格: '', 关系网: {}, 库藏物品池: [], 当前状态: '' },
        { ID: 'F2', 名称: '乱石帮', 类型: '帮派', 实力等级: 3, 地盘归属: '乱石岗', 描述: '', 代表性物品风格: '', 关系网: {}, 库藏物品池: [], 当前状态: '' }
    ]
};

describe('世界基底落盘：多层次地图与势力对齐', () => {
    it('保留全部层级节点，并把父级名称转换成内部 ID', () => {
        const result = 合并世界基底到开场状态({ 世界: {} as any } as any, 基底 as any);
        const layers = (result.世界 as any).地图层级 as any[];

        expect(layers).toHaveLength(8);
        expect(layers.every((layer) => /^DT-\d{3}$/.test(String(layer.ID)))).toBe(true);

        const idByName = new Map(layers.map((layer) => [layer.名称, layer.ID]));
        const 霜城 = layers.find((layer) => layer.名称 === '霜城');
        const 货仓 = layers.find((layer) => layer.名称 === '货仓');

        expect(霜城?.父级ID).toBe(idByName.get('北境帝国'));
        expect(货仓?.父级ID).toBe(idByName.get('旧船坞'));
        // 顶层保持无父级
        expect(layers.find((layer) => layer.名称 === '玄天大陆')?.父级ID).toBe('');
    });

    it('势力地盘不在图上时回落到寰宇，不留下漂浮地名', () => {
        const result = 合并世界基底到开场状态({ 世界: {} as any } as any, 基底 as any);
        const factions = (result.世界 as any).势力列表 as any[];
        const 守军 = factions.find((faction) => faction.名称 === '霜城守军');
        const 乱石帮 = factions.find((faction) => faction.名称 === '乱石帮');

        expect(守军?.地盘归属).toBe('霜城');
        expect(乱石帮?.地盘归属).toBe('玄天大陆');
    });

    it('模型只给一条链时仍保留（不凭空造节点），但节点数如实反映', () => {
        const result = 合并世界基底到开场状态({ 世界: {} as any } as any, {
            mapLayers: [
                { 名称: '神州', 层级: '寰宇', 父级ID: '' },
                { 名称: '中原', 层级: '大地点', 父级ID: '神州' }
            ],
            factions: []
        } as any);
        const layers = (result.世界 as any).地图层级 as any[];
        expect(layers).toHaveLength(2);
        expect(layers.map((layer) => layer.层级)).toEqual(['寰宇', '大地点']);
    });
});
