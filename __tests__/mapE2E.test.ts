/**
 * 地图系统端到端集成测试
 * 测试完整的地图生成流程：从 AI 输出的原始世界数据 → 规范化 → 补齐 → 验证
 * 模拟真实场景中 AI 生成的各种数据格式和边界情况
 */
import { describe, expect, it } from 'vitest';
import { 补齐世界地图空间字段, 构建地图空间场景 } from '../utils/mapSpatial';
import { 验证并修复地图数据 } from '../utils/mapValidator';
import type { 世界数据结构 } from '../types';

// 模拟 AI 生成的原始世界数据（包含各种不规范格式）
const 模拟AI生成的世界数据 = (): Partial<世界数据结构> => ({
    名称: '测试世界',
    地图层级: [
        {
            ID: 'layer-zhongyuan',
            名称: '中原',
            层级类型: '大地点',
            描述: '中原大地',
            归属: { 大地点: '中原' },
            网格宽度: 48,
            网格高度: 48,
        } as any,
        {
            ID: 'layer-luoyang',
            名称: '洛阳城',
            层级类型: '中地点',
            描述: '繁华的洛阳城',
            归属: { 大地点: '中原', 中地点: '洛阳城' },
            父级ID: 'layer-zhongyuan',
            网格宽度: 36,
            网格高度: 36,
        } as any,
        {
            ID: 'layer-market',
            名称: '东市坊',
            层级类型: '小地点',
            描述: '洛阳城东市坊，商铺林立',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            父级ID: 'layer-luoyang',
            网格宽度: 28,
            网格高度: 28,
        } as any,
    ],
    地图建筑: [
        {
            ID: 'b-inn',
            名称: '悦来客栈',
            描述: '东市坊最大的客栈',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            分类: '建筑',
            四角坐标: [{ x: 3, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 8 }, { x: 3, y: 8 }],
        } as any,
        {
            ID: 'b-shop',
            名称: '铁匠铺',
            描述: '打造兵器的铁匠铺',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            分类: '建筑',
            四角坐标: [{ x: 12, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 7 }, { x: 12, y: 7 }],
        } as any,
        {
            ID: 'b-teahouse',
            名称: '听雨茶楼',
            描述: '文人雅士聚集之处',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            分类: '建筑',
            四角坐标: [{ x: 3, y: 14 }, { x: 9, y: 14 }, { x: 9, y: 20 }, { x: 3, y: 20 }],
        } as any,
        {
            ID: 'b-medicine',
            名称: '回春堂',
            描述: '百年老字号药铺',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            分类: '建筑',
            四角坐标: [{ x: 14, y: 14 }, { x: 20, y: 14 }, { x: 20, y: 19 }, { x: 14, y: 19 }],
        } as any,
    ],
    地图道路: [
        {
            ID: 'road-main',
            名称: '主街',
            描述: '东市坊主街',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            路径点: [{ x: 1, y: 11 }, { x: 27, y: 11 }],
        } as any,
    ],
    地图人物: [
        {
            ID: 'p-player',
            名称: '玩家',
            描述: '主角',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            坐标: { x: 14, y: 11 },
            是否当前玩家: true,
        } as any,
        {
            ID: 'p-npc1',
            名称: '张铁匠',
            描述: '铁匠铺老板',
            归属: { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' },
            所在层级ID: 'layer-market',
            坐标: { x: 14, y: 5 },
        } as any,
    ],
} as any);

describe('地图系统端到端 - 完整生成流程', () => {
    it('从 AI 原始数据到完整地图的全流程', () => {
        const rawWorld = 模拟AI生成的世界数据();
        const result = 补齐世界地图空间字段(rawWorld);

        // 验证基本结构完整
        expect(result.地图层级).toBeDefined();
        expect(result.地图建筑).toBeDefined();
        expect(result.地图道路).toBeDefined();
        expect(result.地图人物).toBeDefined();

        // 验证层级数量（原始3个 + 可能的补齐）
        expect(result.地图层级.length).toBeGreaterThanOrEqual(3);

        // 验证建筑都有有效坐标
        for (const building of result.地图建筑) {
            expect(building.四角坐标).toHaveLength(4);
            for (const point of building.四角坐标) {
                expect(Number.isFinite(point.x)).toBe(true);
                expect(Number.isFinite(point.y)).toBe(true);
            }
        }

        // 验证道路都有有效路径点
        for (const road of result.地图道路) {
            expect(road.路径点.length).toBeGreaterThanOrEqual(2);
        }

        // 验证人物都有有效坐标
        for (const person of result.地图人物) {
            expect(Number.isFinite(person.坐标.x)).toBe(true);
            expect(Number.isFinite(person.坐标.y)).toBe(true);
        }
    });

    it('验证器对完整流程输出无严重问题', () => {
        const rawWorld = 模拟AI生成的世界数据();
        const result = 补齐世界地图空间字段(rawWorld);

        const validation = 验证并修复地图数据(
            result.地图层级,
            result.地图建筑,
            result.地图道路,
            result.地图人物
        );

        expect(validation.通过).toBe(true);
    });

    it('构建地图场景能正确定位当前层级', () => {
        const rawWorld = 模拟AI生成的世界数据();
        const result = 补齐世界地图空间字段(rawWorld);
        const env = { 大地点: '中原', 中地点: '洛阳城', 小地点: '东市坊' };

        const scene = 构建地图空间场景(result, env, [], '玩家');

        expect(scene.当前层级).not.toBeNull();
        expect(scene.当前层级?.名称).toBe('东市坊');
        expect(scene.当前层建筑物.length).toBeGreaterThanOrEqual(4);
        expect(scene.当前层道路.length).toBeGreaterThanOrEqual(1);
        expect(scene.当前玩家).not.toBeNull();
    });
});

describe('地图系统端到端 - AI 输出异常处理', () => {
    it('处理坐标越界的 AI 输出', () => {
        const rawWorld: Partial<世界数据结构> = {
            地图层级: [{
                ID: 'layer-1', 名称: '小镇', 层级类型: '小地点', 描述: '',
                归属: { 小地点: '小镇' }, 网格宽度: 20, 网格高度: 20,
            } as any],
            地图建筑: [{
                ID: 'b1', 名称: '客栈', 描述: '', 分类: '建筑',
                归属: { 小地点: '小镇' }, 所在层级ID: 'layer-1',
                // AI 生成了越界坐标
                四角坐标: [{ x: 15, y: 15 }, { x: 30, y: 15 }, { x: 30, y: 25 }, { x: 15, y: 25 }],
            } as any],
            地图人物: [{
                ID: 'p1', 名称: '路人', 描述: '', 归属: { 小地点: '小镇' },
                所在层级ID: 'layer-1',
                // AI 生成了越界坐标
                坐标: { x: 50, y: 50 },
            } as any],
        } as any;

        const result = 补齐世界地图空间字段(rawWorld);

        // 验证坐标被修复到合理范围
        const building = result.地图建筑.find((b) => b.ID === 'b1');
        expect(building).toBeDefined();
        for (const point of building!.四角坐标) {
            expect(point.x).toBeLessThanOrEqual(20);
            expect(point.y).toBeLessThanOrEqual(20);
        }

        const person = result.地图人物.find((p) => p.ID === 'p1');
        expect(person).toBeDefined();
        expect(person!.坐标.x).toBeLessThanOrEqual(20);
        expect(person!.坐标.y).toBeLessThanOrEqual(20);
    });

    it('处理零坐标人物的 AI 输出', () => {
        const rawWorld: Partial<世界数据结构> = {
            地图层级: [{
                ID: 'layer-1', 名称: '山谷', 层级类型: '小地点', 描述: '',
                归属: { 小地点: '山谷' }, 网格宽度: 28, 网格高度: 28,
            } as any],
            地图人物: [{
                ID: 'p1', 名称: '隐士', 描述: '', 归属: { 小地点: '山谷' },
                所在层级ID: 'layer-1',
                坐标: { x: 0, y: 0 },
            } as any],
        } as any;

        const result = 补齐世界地图空间字段(rawWorld);
        const person = result.地图人物.find((p) => p.ID === 'p1');
        expect(person).toBeDefined();
        // 零坐标应被修复到层级中心附近
        expect(person!.坐标.x).toBeGreaterThan(0);
        expect(person!.坐标.y).toBeGreaterThan(0);
    });

    it('处理空世界数据不崩溃', () => {
        const result = 补齐世界地图空间字段({});
        expect(result.地图层级).toBeDefined();
        expect(result.地图建筑).toBeDefined();
        expect(result.地图道路).toBeDefined();
        expect(result.地图人物).toBeDefined();
    });

    it('处理 null 输入不崩溃', () => {
        const result = 补齐世界地图空间字段(null);
        expect(result).toBeDefined();
    });
});

describe('地图系统端到端 - 布局优化器集成', () => {
    it('聚落层级自动触发布局优化', () => {
        const rawWorld: Partial<世界数据结构> = {
            地图层级: [{
                ID: 'layer-town', 名称: '青云镇', 层级类型: '小地点', 描述: '一个繁华的小镇',
                归属: { 小地点: '青云镇' }, 网格宽度: 28, 网格高度: 28,
            } as any],
            地图建筑: Array.from({ length: 6 }, (_, i) => ({
                ID: `b${i}`, 名称: `店铺${i + 1}`, 描述: '', 分类: '建筑',
                归属: { 小地点: '青云镇' }, 所在层级ID: 'layer-town',
                四角坐标: [
                    { x: 2 + (i % 3) * 8, y: 2 + Math.floor(i / 3) * 10 },
                    { x: 6 + (i % 3) * 8, y: 2 + Math.floor(i / 3) * 10 },
                    { x: 6 + (i % 3) * 8, y: 7 + Math.floor(i / 3) * 10 },
                    { x: 2 + (i % 3) * 8, y: 7 + Math.floor(i / 3) * 10 },
                ],
            } as any)),
        } as any;

        const result = 补齐世界地图空间字段(rawWorld);

        // 聚落层级应该有道路生成
        const townRoads = result.地图道路.filter((r) => r.所在层级ID === 'layer-town');
        expect(townRoads.length).toBeGreaterThanOrEqual(1);

        // 验证数据通过验证
        const validation = 验证并修复地图数据(
            result.地图层级,
            result.地图建筑,
            result.地图道路,
            result.地图人物
        );
        expect(validation.通过).toBe(true);
    });
});
