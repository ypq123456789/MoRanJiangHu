import { describe, expect, it } from 'vitest';
import { 构建地点树, 补录环境所在房间, 细化环境所在房间 } from '../utils/locationTree';
import { 构建地图人物标记 } from '../utils/mapNpcLocation';
import { 同步在场NPC当前位置 } from '../hooks/useGame/responseCommandProcessor';
import { 合并世界基底到开场状态 } from '../hooks/useGame/storyState';
import { 构建地图地点树文本 } from '../utils/mapPromptText';

const node = (ID: string, 名称: string, 层级: string, 父级ID = '') => ({ ID, 名称, 层级, 父级ID });
const layers = [
    node('realm', '太古界', '寰宇'), node('zhou', '沧澜州', '大地点', 'realm'),
    node('town', '青萍镇', '小地点', 'zhou'), node('inn', '客栈', '区地点', 'town'), node('away', '暗室暗格', '子地点', 'inn'),
    node('hut', '泥鳅巷破屋', '区地点', 'town'), node('home', '暗室暗格', '子地点', 'hut')
];
const env = { 大地点: '太古界', 中地点: '沧澜州', 小地点: '青萍镇', 具体地点: '泥鳅巷破屋' } as any;
const world = { 地图层级: layers } as any;
const oldPath = '太古界 > 沧澜州 > 青萍镇 > 泥鳅巷破屋';
const partner = { 姓名: '俞月荷', 是否在场: true, 是否队友: true, 当前地点: '泥鳅巷破屋', 当前位置: '泥鳅巷破屋', 位置路径: oldPath };

describe('开局和旧档的房间定位', () => {
    it('用归属先解开同名父级，再合并同一建筑的重名房间，模型只看到本场所通路', () => {
        const owned = (ID: string, 名称: string, town: string) => ({ ...node(ID, 名称, '子地点', '客栈'), 归属: { 小地点: town } });
        const mixed = { 地图层级: [...layers, node('north', '北镇', '小地点', 'zhou'), node('other', '客栈', '区地点', 'north'),
            { ...owned('s-front', '前厅', '青萍镇'), 连通房间: ['药房'] }, owned('n-front', '前厅', '北镇'),
            owned('n-med', '药房', '北镇'), { ...owned('n-front-2', '前厅', '北镇'), 描述: '石阶' }] } as any;
        const tree = 构建地点树(mixed);
        expect(tree.节点映射.get('s-front')?.父级ID).toBe('inn');
        expect(tree.节点映射.get('n-front')).toMatchObject({ 父级ID: 'other', 描述: '石阶' });
        expect(tree.节点映射.has('n-front-2')).toBe(false);
        expect(构建地图地点树文本(mixed)).not.toContain('通往:');
        const duplicatedRegions = { 地图层级: [node('r', '寰宇', '寰宇'), node('east', '东境', '大地点', 'r'),
            node('west', '西境', '大地点', 'r'), node('a', '同名郡', '中地点', 'east'), node('b', '同名郡', '中地点', 'west'),
            { ...node('town-b', '新镇', '小地点', '同名郡'), 归属: { 大地点: '西境', 中地点: '同名郡', 小地点: '新镇' } }] } as any;
        expect(构建地点树(duplicatedRegions).节点映射.get('town-b')?.父级ID).toBe('b');
    });
    it('名称指向两座同名客栈时，归属不明的旧房间不会变成第一座客栈的唯一房间', () => {
        const ambiguous = { 地图层级: [
            ...layers.filter(n => n.ID !== 'away'), node('north', '北镇', '小地点', 'zhou'),
            node('north-inn', '客栈', '区地点', 'north'), node('unknown-room', '密室', '子地点', '客栈')
        ] } as any;
        const here = { ...env, 具体地点: '客栈' };
        const tree = 构建地点树(ambiguous, here);
        expect(tree.当前节点?.ID).toBe('inn');
        expect(tree.节点映射.get('inn')?.子节点).toHaveLength(0);
        expect(tree.节点映射.get('north-inn')?.子节点).toHaveLength(0);
        const owned = { ...node('owned', '书库', '子地点', '客栈'), 归属: { 小地点: '北镇' } };
        const known = 构建地点树({ 地图层级: [...ambiguous.地图层级, owned] } as any);
        expect(known.节点映射.get('owned')?.父级ID).toBe('north-inn');
        const legacyId = 'location:' + JSON.stringify(['town', '区地点', '旧宅']);
        const legacy = 构建地点树({ 地图层级: [...layers, { 名称: '旧宅', 层级: '区地点', 父级ID: 'town', 归属: { 小地点: '青萍镇' } },
            node('saved-room', '书斋', '子地点', legacyId)] } as any);
        expect(legacy.节点映射.get(legacyId)?.子节点.map(n => n.ID)).toEqual(['saved-room']);
        const unique = 构建地点树({ 地图层级: [...layers, node('study', '书房', '子地点', '泥鳅巷破屋')] } as any);
        expect(unique.节点映射.get('study')?.父级ID).toBe('hut');
    });
    it('补录只接受已定位场所的直接房间，跳过未确认的中间节点不会串房', () => {
        const ambiguous = { ...env, 具体地点: '泥鳅巷破屋 > 未收录分院 > 柴房' };
        expect(补录环境所在房间(world, ambiguous)).toBe(world);
        expect(构建地点树(world, ambiguous).当前节点?.ID).toBe('hut');
        const direct = { ...env, 具体地点: '泥鳅巷破屋 > 柴房' };
        const updated = 补录环境所在房间(world, direct);
        expect(updated.地图层级.at(-1)).toMatchObject({ 名称: '柴房', 父级ID: 'hut' });
        expect(补录环境所在房间(updated, direct)).toBe(updated);
    });
    it('具体地点含镇名时保留这段消歧路径，再次读取仍定位同镇同名房间', () => {
        const duplicated = { 地图层级: [...layers, node('north', '北镇', '小地点', 'zhou'),
            node('north-inn', '客栈', '区地点', 'north'), node('north-room', '暗室暗格', '子地点', 'north-inn')] } as any;
        const companion = { 是否队友: true, 是否在场: true, 位置路径: '北镇 > 客栈 > 暗室暗格' };
        const refined = 细化环境所在房间(duplicated, { 具体地点: '北镇 > 客栈' }, [companion]);
        expect(refined.具体地点).toBe('北镇 > 客栈 > 暗室暗格');
        expect(构建地点树(duplicated, refined as any).当前节点?.ID).toBe('north-room');
    });
    it('场所的唯一历史房间不能冒充当前房间，保留开局写明的室内位置', () => {
        const base = 合并世界基底到开场状态({ 环境: env }, { mapLayers: layers as any, factions: [] });
        expect(base.环境.具体地点).toBe('泥鳅巷破屋');
        expect(构建地点树(world, base.环境).当前节点?.ID).toBe('hut');
        const onSite = { ...partner, 位置路径: oldPath + ' > 暗室暗格', 当前位置: '暗室暗格' };
        expect(构建地点树(world, env, [onSite]).当前节点?.ID).toBe('home');
        expect(构建地点树(world, env, [{ ...onSite, 是否在场: false }]).当前节点?.ID).toBe('hut');
        expect(构建地点树(world, env, [{ ...onSite, 位置路径: '客栈 > 暗室暗格' }]).当前节点?.ID).toBe('hut');
        const explicit = 合并世界基底到开场状态({ 环境: { ...env, 具体地点: '泥鳅巷破屋 > 暗室暗格' } }, { mapLayers: layers as any, factions: [] });
        expect(构建地点树(world, explicit.环境).当前节点?.ID).toBe('home');
    });
    it('同场祖先位置跟随主角细化；离场或有异地证据的人物仍留在原地', () => {
        const actualEnv = { ...env, 具体地点: '泥鳅巷破屋 > 暗室暗格' };
        const remote = { 姓名: '店主', 是否在场: true, 当前位置: '暗室暗格', 位置路径: '客栈 > 暗室暗格' };
        const departed = { 姓名: '守门人', 是否在场: false, 当前位置: '泥鳅巷破屋' };
        const social = [partner, { 姓名: '阿青', 是否在场: true, 当前位置: '太古界' }, remote, departed];
        const tree = 构建地点树(world, actualEnv);
        const people = 构建地图人物标记([tree.根节点!], tree.当前节点!.ID, social, '杨培强');
        expect(people.get('home')?.map(p => p.name)).toEqual(['杨培强', '俞月荷', '阿青']);
        expect(people.get('away')?.map(p => p.name)).toEqual(['店主']);
        expect(people.get('hut')?.map(p => p.name)).toEqual(['守门人']);
        const synced = 同步在场NPC当前位置(social, actualEnv, world);
        expect(synced[0].当前位置).toBe('暗室暗格');
        expect(synced[0].位置路径).toContain('泥鳅巷破屋 > 暗室暗格');
        expect(synced[1].当前位置).toBe('暗室暗格');
        expect(synced[2]).toBe(remote);
        expect(synced[3]).toBe(departed);
    });
    it('多个真实房间且无定位证据时停在场所，同名房间无上级时不任意选一个', () => {
        const twoRooms = { 地图层级: [...layers, node('work', '柴房', '子地点', 'hut')] } as any;
        expect(构建地点树(twoRooms, env).当前节点?.ID).toBe('hut');
        expect(构建地点树(twoRooms, { ...env, 具体地点: '暗室暗格' }).当前节点?.ID).toBe('town');
    });
});
