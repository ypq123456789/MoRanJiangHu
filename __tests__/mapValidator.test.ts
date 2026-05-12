import { describe, expect, it } from 'vitest';
import {
    验证建筑空间,
    验证道路空间,
    验证人物空间,
    验证层级一致性,
    验证并修复地图数据,
} from '../utils/mapValidator';
import type {
    地图层级结构,
    地图建筑结构,
    地图道路结构,
    地图人物结构,
} from '../types';

const 创建测试层级 = (overrides?: Partial<地图层级结构>): 地图层级结构 => ({
    ID: 'layer-1',
    名称: '青云镇',
    层级类型: '小地点',
    描述: '一个小镇',
    归属: { 大地点: '中原', 中地点: '洛阳', 小地点: '青云镇' },
    父级ID: '',
    锚点坐标: { x: 14, y: 14 },
    网格宽度: 28,
    网格高度: 28,
    边界四角: [{ x: 0, y: 0 }, { x: 28, y: 0 }, { x: 28, y: 28 }, { x: 0, y: 28 }],
    建筑物ID列表: [],
    道路ID列表: [],
    人物ID列表: [],
    ...overrides,
});

const 创建测试建筑 = (overrides?: Partial<地图建筑结构>): 地图建筑结构 => ({
    ID: 'building-1',
    名称: '客栈',
    描述: '一间客栈',
    归属: { 大地点: '中原', 中地点: '洛阳', 小地点: '青云镇' },
    所在层级ID: 'layer-1',
    分类: '建筑',
    四角坐标: [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }, { x: 5, y: 10 }],
    ...overrides,
});

describe('地图验证器 - 建筑空间验证', () => {
    it('正常建筑不产生问题', () => {
        const layer = 创建测试层级();
        const building = 创建测试建筑();
        const issues = 验证建筑空间(building, layer, [building]);
        expect(issues).toHaveLength(0);
    });

    it('检测坐标越界', () => {
        const layer = 创建测试层级();
        const building = 创建测试建筑({
            四角坐标: [{ x: 25, y: 25 }, { x: 35, y: 25 }, { x: 35, y: 35 }, { x: 25, y: 35 }],
        });
        const issues = 验证建筑空间(building, layer, [building]);
        expect(issues.some((i) => i.类别 === '坐标越界')).toBe(true);
    });

    it('检测面积过小', () => {
        const layer = 创建测试层级();
        const building = 创建测试建筑({
            四角坐标: [{ x: 5, y: 5 }, { x: 5.5, y: 5 }, { x: 5.5, y: 5.5 }, { x: 5, y: 5.5 }],
        });
        const issues = 验证建筑空间(building, layer, [building]);
        expect(issues.some((i) => i.类别 === '面积异常')).toBe(true);
    });

    it('检测面积过大', () => {
        const layer = 创建测试层级();
        const building = 创建测试建筑({
            四角坐标: [{ x: 0, y: 0 }, { x: 26, y: 0 }, { x: 26, y: 26 }, { x: 0, y: 26 }],
        });
        const issues = 验证建筑空间(building, layer, [building]);
        expect(issues.some((i) => i.描述.includes('超过层级面积'))).toBe(true);
    });

    it('检测建筑重叠', () => {
        const layer = 创建测试层级();
        const b1 = 创建测试建筑({ ID: 'b1', 名称: '客栈' });
        const b2 = 创建测试建筑({
            ID: 'b2', 名称: '酒楼',
            四角坐标: [{ x: 6, y: 6 }, { x: 11, y: 6 }, { x: 11, y: 11 }, { x: 6, y: 11 }],
        });
        const issues = 验证建筑空间(b1, layer, [b1, b2]);
        expect(issues.some((i) => i.类别 === '建筑重叠')).toBe(true);
    });
});

describe('地图验证器 - 道路空间验证', () => {
    it('正常道路不产生问题', () => {
        const layer = 创建测试层级();
        const road: 地图道路结构 = {
            ID: 'road-1', 名称: '主街', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1',
            路径点: [{ x: 2, y: 14 }, { x: 26, y: 14 }],
        };
        const issues = 验证道路空间(road, layer);
        expect(issues).toHaveLength(0);
    });

    it('检测路径点不足', () => {
        const layer = 创建测试层级();
        const road: 地图道路结构 = {
            ID: 'road-1', 名称: '断路', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1',
            路径点: [{ x: 2, y: 14 }],
        };
        const issues = 验证道路空间(road, layer);
        expect(issues.some((i) => i.级别 === 'error')).toBe(true);
    });

    it('检测路径点越界', () => {
        const layer = 创建测试层级();
        const road: 地图道路结构 = {
            ID: 'road-1', 名称: '长路', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1',
            路径点: [{ x: -5, y: 14 }, { x: 40, y: 14 }],
        };
        const issues = 验证道路空间(road, layer);
        expect(issues.some((i) => i.类别 === '坐标越界')).toBe(true);
    });

    it('检测路径过短', () => {
        const layer = 创建测试层级();
        const road: 地图道路结构 = {
            ID: 'road-1', 名称: '短路', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1',
            路径点: [{ x: 10, y: 10 }, { x: 10.3, y: 10.3 }],
        };
        const issues = 验证道路空间(road, layer);
        expect(issues.some((i) => i.类别 === '路径过短')).toBe(true);
    });
});

describe('地图验证器 - 人物空间验证', () => {
    it('正常人物不产生问题', () => {
        const layer = 创建测试层级();
        const person: 地图人物结构 = {
            ID: 'p1', 名称: '张三', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1', 坐标: { x: 14, y: 14 },
        };
        const issues = 验证人物空间(person, layer, []);
        expect(issues).toHaveLength(0);
    });

    it('检测坐标为零点', () => {
        const layer = 创建测试层级();
        const person: 地图人物结构 = {
            ID: 'p1', 名称: '张三', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1', 坐标: { x: 0, y: 0 },
        };
        const issues = 验证人物空间(person, layer, []);
        expect(issues.some((i) => i.类别 === '坐标无效')).toBe(true);
    });

    it('检测坐标越界', () => {
        const layer = 创建测试层级();
        const person: 地图人物结构 = {
            ID: 'p1', 名称: '张三', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1', 坐标: { x: 50, y: 50 },
        };
        const issues = 验证人物空间(person, layer, []);
        expect(issues.some((i) => i.类别 === '坐标越界')).toBe(true);
    });
});

describe('地图验证器 - 验证并修复', () => {
    it('自动修复坐标越界', () => {
        const layer = 创建测试层级();
        const building = 创建测试建筑({
            四角坐标: [{ x: 25, y: 25 }, { x: 35, y: 25 }, { x: 35, y: 35 }, { x: 25, y: 35 }],
        });
        const result = 验证并修复地图数据([layer], [building], [], []);
        expect(result.修复计数).toBeGreaterThan(0);
        // 修复后坐标应被限制在层级范围内
        expect(building.四角坐标[1].x).toBeLessThanOrEqual(28);
        expect(building.四角坐标[2].y).toBeLessThanOrEqual(28);
    });

    it('自动修复人物零坐标', () => {
        const layer = 创建测试层级();
        const person: 地图人物结构 = {
            ID: 'p1', 名称: '张三', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1', 坐标: { x: 0, y: 0 },
        };
        const result = 验证并修复地图数据([layer], [], [], [person]);
        expect(result.修复计数).toBeGreaterThan(0);
        expect(person.坐标.x).toBeGreaterThan(0);
        expect(person.坐标.y).toBeGreaterThan(0);
    });

    it('自动修复道路越界', () => {
        const layer = 创建测试层级();
        const road: 地图道路结构 = {
            ID: 'road-1', 名称: '长路', 描述: '', 归属: { 大地点: '', 中地点: '', 小地点: '' },
            所在层级ID: 'layer-1',
            路径点: [{ x: -5, y: 14 }, { x: 40, y: 14 }],
        };
        const result = 验证并修复地图数据([layer], [], [road], []);
        expect(result.修复计数).toBeGreaterThan(0);
        expect(road.路径点[0].x).toBeGreaterThanOrEqual(0);
        expect(road.路径点[1].x).toBeLessThanOrEqual(28);
    });

    it('无问题时验证通过', () => {
        const layer = 创建测试层级();
        const building = 创建测试建筑();
        const result = 验证并修复地图数据([layer], [building], [], []);
        expect(result.通过).toBe(true);
        expect(result.反馈摘要).toContain('验证通过');
    });

    it('生成反馈摘要包含问题描述', () => {
        const layer = 创建测试层级({ 网格宽度: 0, 网格高度: 0 });
        const result = 验证并修复地图数据([layer], [], [], []);
        expect(result.通过).toBe(false);
        expect(result.反馈摘要).toContain('严重问题');
    });
});
