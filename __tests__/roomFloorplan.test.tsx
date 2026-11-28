// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegionMap from '../components/features/Map/RegionMap';
import { 构建地点树 } from '../utils/locationTree';
import { 构建地图地点树文本 } from '../utils/mapPromptText';
import { getRoomPassages } from '../utils/roomConnections';
import { 构建地图层级替换结果, 解析地图自动更新命令 } from '../hooks/useGame/mapUpdateWorkflow';
import { 创建开场空白世界, 合并世界基底到开场状态 } from '../hooks/useGame/storyState';

afterEach(cleanup);

const venue = { ID: 'inn', 名称: '回春驿', 层级: '区地点', 父级ID: '' };
const room = (id: string, name: string, exits: string[] = []) => ({
    ID: id, 名称: name, 层级: '子地点', 父级ID: 'inn', 连通房间: exits
});
const rooms = [room('a', '前厅'), room('b', '药房', ['前厅', '前厅', '隔壁客栈', '药房']), room('c', '后院')];
const view = (layers: object[]) => {
    const tree = 构建地点树({ 地图层级: layers } as any);
    return <RegionMap nodes={[tree.根节点!]} currentNodeId="inn" currentLocationName="回春驿"
        onSelect={vi.fn()} onLocateCurrent={vi.fn()} />;
};
const boxes = (elements: Iterable<Element>) => Array.from(elements, el =>
    ['x', 'y', 'width', 'height'].map(attr => el.getAttribute(attr)).join('/'));

describe('场所中的房间与已探明通路', () => {
    it('空场所也有预分区；新房间揭开迷雾，接连扩建后已发现房间仍在原格', () => {
        const ui = render(view([venue]));
        const fog = () => ui.container.querySelectorAll('[data-room-fog]');
        expect(fog().length).toBeGreaterThan(6);
        const original = new Set(boxes(fog()));
        ui.rerender(view([venue, rooms[0]]));
        const known = () => ui.container.querySelector('[data-node="a"]')!;
        const first = boxes([known()])[0];
        expect(original.has(first)).toBe(true);
        expect(fog().length).toBe(original.size - 1);
        ui.rerender(view([venue, ...rooms, ...Array.from({ length: 50 }, (_, i) => room('new' + i, '房间' + i))]));
        expect(boxes([known()])[0]).toBe(first);
        expect(new Set(boxes(ui.container.querySelectorAll('[data-node]:not([data-node="inn"])'))).size).toBe(53);
        expect(fog().length).toBeGreaterThan(0);
    });

    it('只画剧情记载的通路，忽略重复、自连和异地目标', () => {
        const ui = render(view([venue, ...rooms]));
        const passages = ui.container.querySelectorAll('[data-room-passage]');
        expect(passages).toHaveLength(1);
        expect(passages[0].textContent).toContain('前厅');
        expect(passages[0].textContent).toContain('药房');
        expect(passages[0].textContent).not.toContain('后院');
        const context = 构建地图地点树文本({ 地图层级: [venue, ...rooms] } as any);
        expect(context.split('\n').find(line => line.includes('] 前厅'))).toContain('通往:药房');
        expect(context).not.toContain('隔壁客栈');
    });

    it('整图更新重新排列数据或删除一间房时，保留其余已探索房间的位置', () => {
        const world = { 地图层级: [venue, ...rooms] };
        const ui = render(view(world.地图层级));
        const previous = boxes([ui.container.querySelector('[data-node="c"]')!])[0];
        const raw = 'set 世界.地图层级 = ' + JSON.stringify([venue, room('d', '书库'), rooms[2], rooms[0]]);
        const [update] = 解析地图自动更新命令(raw, world);
        ui.rerender(view(update.value));
        expect(boxes([ui.container.querySelector('[data-node="c"]')!])[0]).toBe(previous);
    });

    it('开局、回忆重建及逐回合新增的房间都保留通道，已知房间后续也能补录通道', () => {
        const base = 合并世界基底到开场状态({ 世界: 创建开场空白世界() }, { mapLayers: [venue, ...rooms] as any, factions: [] });
        const rebuild = 构建地图层级替换结果([venue, ...rooms]);
        for (const layers of [base.世界.地图层级, rebuild]) {
            expect(layers.find(n => n.名称 === '药房')).toMatchObject({ 连通房间: expect.arrayContaining(['前厅']) });
        }
        const newRoom = 解析地图自动更新命令('push 世界.地图层级 = ' + JSON.stringify(rooms[1]), { 地图层级: [venue, rooms[0]] });
        expect(newRoom[0]?.value).toMatchObject({ 连通房间: expect.arrayContaining(['前厅']) });
        const notice = 解析地图自动更新命令('set 世界.地图层级[1].连通房间 = ["后院"]', { 地图层级: [venue, ...rooms] });
        expect(notice).toEqual([{ action: 'set', key: '世界.地图层级[1].连通房间', value: ['后院'] }]);
    });

    it.each(['rebuild', 'set'])('%s 未提及同场所既有房间的出口时保留已知通路，显式空数组可以撤销', mode => {
        const world = { 地图层级: [venue, room('a', '前厅'), room('b', '药房', ['前厅'])] };
        const update = (items: object[]) => mode === 'rebuild' ? 构建地图层级替换结果(items, world)
            : 解析地图自动更新命令('set 世界.地图层级 = ' + JSON.stringify(items), world)[0].value;
        const { 连通房间, ...withoutExits } = world.地图层级[2] as ReturnType<typeof room>;
        const raw = [venue, room('a', '前厅'), withoutExits];
        expect(update(raw).find((item: any) => item.ID === 'b').连通房间).toEqual(连通房间);
        expect(update([...raw.slice(0, 2), { ...withoutExits, 连通房间: [] }]).find((item: any) => item.ID === 'b').连通房间).toEqual([]);
    });
    it('移除已双向登记的通路时，另一端省略的旧记录不会将门重新打开', () => {
        const before = { 地图层级: [venue, room('a', '前厅', ['药房']), room('b', '药房', ['前厅'])] };
        expect(getRoomPassages(before.地图层级)).toHaveLength(1);
        const next = 构建地图层级替换结果([venue, room('a', '前厅'), { ID: 'b', 名称: '药房', 层级: '子地点', 父级ID: 'inn' }], before);
        expect(getRoomPassages(next)).toHaveLength(0);
    });
    it('新房间采用有效输入格序；同一响应较早修改的出口参与后续整图继承', () => {
        const first = 构建地图层级替换结果([venue, { ...rooms[1], 房间格序: 5 }]);
        expect(first.find(n => n.名称 === '药房').房间格序).toBe(5);
        const old = { 地图层级: [venue, room('a', '前厅'), room('b', '药房')] };
        const conflicting = 构建地图层级替换结果([venue, { ...room('new', '书房'), 房间格序: 0 }, ...old.地图层级.slice(1)], old);
        expect(conflicting.find(n => n.ID === 'a').房间格序).toBe(0);
        expect(conflicting.find(n => n.名称 === '书房').房间格序).toBe(2);
        const raw = old.地图层级.map(({ ID, 名称, 父级ID, 层级 }) => ({ ID, 名称, 父级ID, 层级 }));
        for (const command of ['set 世界.地图层级[1].连通房间 = ["药房"]', 'push 世界.地图层级[1].连通房间 = "药房"']) {
            const result = 解析地图自动更新命令(command + '\nset 世界.地图层级 = ' + JSON.stringify(raw), old);
            expect(result.at(-1)?.value.find((n: any) => n.ID === 'a').连通房间).toEqual(['药房']);
        }
    });
    it('索引出口命令引用本批临时 ID 时写入最终房间 ID，同时保留房名引用', () => {
        const original = [venue, room('front', '前厅'), room('yard', '后院')];
        const add = 'push 世界.地图层级 = ' + JSON.stringify(room('temp-room', '药房'));
        for (const [assignment, expected] of [
            ['set 世界.地图层级[1].连通房间 = ["temp-room","后院"]', 'list'],
            ['push 世界.地图层级[1].连通房间 = "temp-room"', 'single'],
            ['set 世界.地图层级.1.连通房间.0 = "temp-room"', 'single']
        ]) {
            const [newRoom, update] = 解析地图自动更新命令(add + '\n' + assignment, { 地图层级: original });
            expect(newRoom.value.ID).toMatch(/^DT-/);
            const refs = expected === 'list' ? update.value : [update.value];
            expect(refs).toEqual(expected === 'list' ? [newRoom.value.ID, '后院'] : [newRoom.value.ID]);
            expect(getRoomPassages([{ ...original[1], 连通房间: refs }, original[2], newRoom.value])
                .map(([, target]) => target.名称)).toContain('药房');
        }
    });
});
