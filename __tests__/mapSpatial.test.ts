import { describe, expect, it } from 'vitest';
import { 构建已补齐地图空间场景, 补齐世界地图空间字段 } from '../utils/mapSpatial';

const 点在矩形内 = (point: { x: number; y: number }, rect: { minX: number; maxX: number; minY: number; maxY: number }) => (
    point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY
);

const 正交线段穿过矩形 = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    rect: { minX: number; maxX: number; minY: number; maxY: number }
) => {
    if (from.x === to.x) {
        const minY = Math.min(from.y, to.y);
        const maxY = Math.max(from.y, to.y);
        return from.x >= rect.minX && from.x <= rect.maxX && maxY >= rect.minY && minY <= rect.maxY;
    }
    if (from.y === to.y) {
        const minX = Math.min(from.x, to.x);
        const maxX = Math.max(from.x, to.x);
        return from.y >= rect.minY && from.y <= rect.maxY && maxX >= rect.minX && minX <= rect.maxX;
    }
    return true;
};

describe('地图空间道路规划', () => {
    it('会把模型给出的斜线道路改成避让建筑的正交路径', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [{
                ID: 'layer_test',
                名称: '青松门',
                层级: '具体地点',
                网格宽度: 24,
                网格高度: 18,
                锚点坐标: { x: 0, y: 0 }
            }],
            地图建筑: [{
                ID: 'hall',
                名称: '宗门大殿',
                所在层级ID: 'layer_test',
                四角坐标: [
                    { x: 8, y: 5 },
                    { x: 16, y: 5 },
                    { x: 16, y: 12 },
                    { x: 8, y: 12 }
                ]
            }],
            地图道路: [{
                ID: 'bad_road',
                名称: '穿殿斜路',
                所在层级ID: 'layer_test',
                路径点: [
                    { x: 2, y: 2 },
                    { x: 22, y: 16 }
                ]
            }]
        } as any);
        const road = world.地图道路.find((item: any) => item.ID === 'bad_road')!;
        const rect = { minX: 7.9, maxX: 16.1, minY: 4.9, maxY: 12.1 };

        expect(road.路径点.length).toBeGreaterThan(2);
        road.路径点.forEach((point: any, index: number) => {
            expect(点在矩形内(point, rect)).toBe(false);
            const next = road.路径点[index + 1];
            if (!next) return;
            expect(point.x === next.x || point.y === next.y).toBe(true);
            expect(正交线段穿过矩形(point, next, rect)).toBe(false);
        });
    });

    it('会把主角寝居这类室内地点补成室内结构而不是野外空图', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [],
            地图建筑: [],
            地图道路: [],
            地图人物: []
        } as any, {
            env: {
                大地点: '青州',
                中地点: '杨家剑庄',
                小地点: '松风阁',
                具体地点: '主角寝居'
            } as any
        });

        const specificLayer = world.地图层级.find((item: any) => item.名称 === '主角寝居');
        expect(specificLayer).toBeTruthy();
        const buildings = world.地图建筑.filter((item: any) => item.所在层级ID === specificLayer?.ID);
        const categories = new Set(buildings.map((item: any) => item.分类));
        expect(buildings.length).toBeGreaterThanOrEqual(4);
        expect(categories.has('外墙')).toBe(true);
        expect(categories.has('房间')).toBe(true);
        expect(categories.has('门')).toBe(true);
        expect(world.地图道路.some((item: any) => item.所在层级ID === specificLayer?.ID)).toBe(false);
    });

    it('聚落布局参考 v11.0.2 APK 使用卷轴环形节点并丢弃无意义旧道路', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [{
                ID: 'layer_town',
                名称: '杨府',
                层级: '具体地点',
                网格宽度: 40,
                网格高度: 30,
                锚点坐标: { x: 0, y: 0 }
            }],
            地图建筑: Array.from({ length: 8 }).map((_, index) => ({
                ID: `building_${index}`,
                名称: `院落${index + 1}`,
                所在层级ID: 'layer_town',
                四角坐标: [
                    { x: 2 + index * 3, y: 2 },
                    { x: 4 + index * 3, y: 2 },
                    { x: 4 + index * 3, y: 4 },
                    { x: 2 + index * 3, y: 4 }
                ]
            })),
            地图道路: [{
                ID: 'stray_diagonal',
                名称: '莫名斜线',
                所在层级ID: 'layer_town',
                路径点: [
                    { x: 1, y: 1 },
                    { x: 39, y: 29 }
                ]
            }]
        } as any);
        const roads = world.地图道路.filter((item: any) => item.所在层级ID === 'layer_town');
        const buildings = world.地图建筑.filter((item: any) => item.所在层级ID === 'layer_town');

        expect(roads.some((road: any) => road.ID === 'stray_diagonal')).toBe(false);
        expect(roads.some((road: any) => /接入路/u.test(road.名称))).toBe(false);
        expect(roads.length).toBeLessThanOrEqual(6);
        expect(roads.length).toBeGreaterThan(0);
        expect(roads.every((road: any) => /卷轴路线/u.test(road.名称))).toBe(true);
        roads.forEach((road: any) => {
            expect(road.路径点.length).toBe(2);
            expect(road.路径点[0].x).toBeCloseTo(20, 1);
            expect(road.路径点[0].y).toBeCloseTo(15.6, 1);
            road.路径点.forEach((point: any) => {
                expect(point.x).toBeGreaterThanOrEqual(0);
                expect(point.x).toBeLessThanOrEqual(40);
                expect(point.y).toBeGreaterThanOrEqual(0);
                expect(point.y).toBeLessThanOrEqual(30);
            });
        });
        const centers = buildings.map((building: any) => {
            const xs = building.四角坐标.map((point: any) => point.x);
            const ys = building.四角坐标.map((point: any) => point.y);
            return {
                x: (Math.min(...xs) + Math.max(...xs)) / 2,
                y: (Math.min(...ys) + Math.max(...ys)) / 2,
            };
        });
        expect(Math.min(...centers.map((point: any) => point.x))).toBeLessThan(12);
        expect(Math.max(...centers.map((point: any) => point.x))).toBeGreaterThan(28);
        expect(Math.min(...centers.map((point: any) => point.y))).toBeLessThan(11);
        expect(Math.max(...centers.map((point: any) => point.y))).toBeGreaterThan(20);
    });

    it('会把下级地点投影成父层可见入口并保持层级链承接', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [{
                ID: 'big_qingzhou',
                名称: '青州',
                层级: '大地点',
                归属: { 大地点: '青州', 中地点: '', 小地点: '' },
                网格宽度: 48,
                网格高度: 48,
                锚点坐标: { x: 0, y: 0 }
            }, {
                ID: 'mid_yunmeng',
                名称: '云梦城',
                层级: '中地点',
                归属: { 大地点: '青州', 中地点: '云梦城', 小地点: '' },
                锚点坐标: { x: 22, y: 10 }
            }, {
                ID: 'small_qingyun',
                名称: '青云门',
                层级: '小地点',
                归属: { 大地点: '青州', 中地点: '云梦城', 小地点: '青云门' },
                锚点坐标: { x: 28, y: 16 }
            }, {
                ID: 'room_main',
                名称: '青云门大殿内室',
                层级: '具体地点',
                归属: { 大地点: '青州', 中地点: '云梦城', 小地点: '青云门' },
                锚点坐标: { x: 12, y: 12 }
            }],
            地图建筑: [],
            地图道路: [],
            地图人物: []
        } as any);

        const midLayer = world.地图层级.find((item: any) => item.ID === 'mid_yunmeng');
        const smallLayer = world.地图层级.find((item: any) => item.ID === 'small_qingyun');
        const roomLayer = world.地图层级.find((item: any) => item.ID === 'room_main');
        expect(midLayer?.父级ID).toBe('big_qingzhou');
        expect(smallLayer?.父级ID).toBe('mid_yunmeng');
        expect(roomLayer?.父级ID).toBe('small_qingyun');

        const bigEntries = world.地图建筑.filter((item: any) => item.所在层级ID === 'big_qingzhou');
        const midEntries = world.地图建筑.filter((item: any) => item.所在层级ID === 'mid_yunmeng');
        const smallEntries = world.地图建筑.filter((item: any) => item.所在层级ID === 'small_qingyun');
        const roomEntries = world.地图建筑.filter((item: any) => item.所在层级ID === 'room_main');

        expect(bigEntries.some((item: any) => item.名称 === '云梦城' && item.分类 === '城市/区域')).toBe(true);
        expect(midEntries.some((item: any) => item.名称 === '青云门' && item.分类 === '小地点入口')).toBe(true);
        expect(smallEntries.some((item: any) => item.名称 === '青云门大殿内室' && item.分类 === '室内入口')).toBe(true);
        expect(roomEntries.some((item: any) => item.分类 === '外墙')).toBe(true);
        expect(world.地图道路.some((item: any) => item.所在层级ID === 'room_main')).toBe(false);
    });

    it('兼容模型常用别名字段并把建筑内部层命中为当前具体地点', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [{
                id: 'country_daliang',
                名称: '大梁',
                类型: '国家',
                中心坐标: { x: 50, y: 50 },
                范围: { 宽: 100, 高: 100 },
                主要建筑: ['青云城', '黑石岭'],
                道路: [{ 起点: '青云城', 终点: '黑石岭', 类型: '官道' }]
            }, {
                id: 'city_qingyun',
                名称: '青云城',
                类型: '城市',
                父级ID: 'country_daliang',
                中心坐标: { x: 52, y: 44 },
                范围: { 宽: 52, 高: 46 },
                主要建筑: ['青云门', '东市', '城门'],
                道路: [{ 起点: '东市', 终点: '城门', 类型: '街道' }]
            }, {
                id: 'sect_qingyun',
                名称: '青云门',
                类型: '宗门',
                父级ID: 'city_qingyun',
                中心坐标: { x: 54, y: 38 },
                范围: { 宽: 42, 高: 36 },
                主要建筑: ['议事殿', '铸剑房', '藏书阁', '内门居所']
            }, {
                id: 'yard_inner',
                名称: '内门居所',
                类型: '院落',
                父级ID: 'sect_qingyun',
                中心坐标: { x: 60, y: 45 },
                主要建筑: ['弟子居', '练功坪']
            }, {
                id: 'building_disciple',
                名称: '弟子居',
                类型: '街区',
                父级ID: 'yard_inner',
                中心坐标: { x: 55, y: 46 },
                主要建筑: ['主角寝居']
            }, {
                id: 'room_player',
                名称: '主角寝居',
                类型: '室内',
                父级ID: 'building_disciple',
                中心坐标: { x: 50, y: 50 },
                主要建筑: []
            }],
            地图建筑: [],
            地图道路: [],
            地图人物: []
        } as any, {
            env: {
                大地点: '青云门',
                中地点: '内门居所',
                小地点: '弟子居',
                具体地点: '主角寝居'
            } as any
        });

        const country = world.地图层级.find((item: any) => item.ID === 'country_daliang');
        const city = world.地图层级.find((item: any) => item.ID === 'city_qingyun');
        const sect = world.地图层级.find((item: any) => item.ID === 'sect_qingyun');
        const yard = world.地图层级.find((item: any) => item.ID === 'yard_inner');
        const building = world.地图层级.find((item: any) => item.ID === 'building_disciple');
        const room = world.地图层级.find((item: any) => item.ID === 'room_player');

        expect(country?.层级).toBe('大地点');
        expect(city?.层级).toBe('中地点');
        expect(sect?.层级).toBe('中地点');
        expect(yard?.层级).toBe('小地点');
        expect(building?.层级).toBe('小地点');
        expect(room?.层级).toBe('具体地点');
        expect(room?.父级ID).toBe('building_disciple');

        const roomEntries = world.地图建筑.filter((item: any) => item.所在层级ID === 'room_player');
        const roomCategories = new Set(roomEntries.map((item: any) => item.分类));
        expect(roomCategories.has('外墙')).toBe(true);
        expect(roomCategories.has('房间')).toBe(true);
        expect(roomCategories.has('门')).toBe(true);
        expect(world.地图道路.some((item: any) => item.所在层级ID === 'room_player')).toBe(false);
        expect(world.地图建筑.some((item: any) => item.所在层级ID === 'sect_qingyun' && item.名称 === '议事殿')).toBe(true);

        const scene = 构建已补齐地图空间场景(world, {
            大地点: '青云门',
            中地点: '内门居所',
            小地点: '弟子居',
            具体地点: '主角寝居'
        } as any);
        expect(scene.当前层级?.ID).toBe('room_player');
        expect(scene.当前层道路.length).toBe(0);
        expect(scene.当前层建筑物.some((item: any) => item.分类 === '房间')).toBe(true);
    });
});


describe('本批 bugfix 回归 - 地图 NPC 社交一致、建筑内部无道路、野外单主路', () => {
    it('荒庙内部这类"庙"字层级被判为室内，不生成道路，且仅由墙/门/房间构成', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [{
                ID: 'layer_shrine',
                名称: '荒庙内部',
                层级: '具体地点',
                网格宽度: 20,
                网格高度: 16,
                锚点坐标: { x: 0, y: 0 }
            }],
            地图建筑: [],
            地图道路: [{
                ID: 'old_ghost_road',
                名称: '穿殿道',
                所在层级ID: 'layer_shrine',
                路径点: [
                    { x: 1, y: 1 },
                    { x: 18, y: 14 }
                ]
            }],
            地图人物: []
        } as any);

        expect(world.地图道路.some((item: any) => item.所在层级ID === 'layer_shrine')).toBe(false);
        const buildings = world.地图建筑.filter((item: any) => item.所在层级ID === 'layer_shrine');
        const categories = new Set(buildings.map((item: any) => item.分类));
        expect(categories.has('外墙')).toBe(true);
        expect(categories.has('房间')).toBe(true);
        expect(categories.has('门')).toBe(true);
    });

    it('野外层级（郊外荒庙）只保留 1 条主路，聚落网格的"主街/横巷/纵巷"会被清掉', () => {
        const world = 补齐世界地图空间字段({
            地图层级: [{
                ID: 'layer_wild',
                名称: '郊外荒庙旁',
                描述: '城外一段野径，路旁有一座荒废的小庙。',
                层级: '小地点',
                网格宽度: 30,
                网格高度: 22,
                锚点坐标: { x: 0, y: 0 }
            }],
            地图建筑: [{
                ID: 'shrine_body',
                名称: '荒庙',
                所在层级ID: 'layer_wild',
                四角坐标: [
                    { x: 12, y: 9 },
                    { x: 18, y: 9 },
                    { x: 18, y: 13 },
                    { x: 12, y: 13 }
                ]
            }],
            地图道路: [
                { ID: 'w_main', 名称: '主街', 所在层级ID: 'layer_wild', 路径点: [{ x: 2, y: 5 }, { x: 28, y: 5 }] },
                { ID: 'w_h1', 名称: '横巷01', 所在层级ID: 'layer_wild', 路径点: [{ x: 2, y: 10 }, { x: 28, y: 10 }] },
                { ID: 'w_v1', 名称: '纵巷01', 所在层级ID: 'layer_wild', 路径点: [{ x: 8, y: 2 }, { x: 8, y: 20 }] },
                { ID: 'w_ridge', 名称: '山道', 所在层级ID: 'layer_wild', 路径点: [{ x: 1, y: 11 }, { x: 28, y: 11 }] }
            ],
            地图人物: []
        } as any);

        const layerRoads = world.地图道路.filter((item: any) => item.所在层级ID === 'layer_wild');
        expect(layerRoads.length).toBeLessThanOrEqual(1);
        // 主街/横巷/纵巷 应该被野外策略移除
        expect(layerRoads.some((item: any) => /主街|横巷|纵巷/.test(item.名称))).toBe(false);
    });
});
