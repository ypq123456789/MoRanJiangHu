// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import RegionMap from '../components/features/Map/RegionMap';
import LocationBrowser from '../components/features/Map/LocationBrowser';
import { 构建地点树, 补录环境所在房间, type 地点树节点 } from '../utils/locationTree';
import { 构建地图人物标记 } from '../utils/mapNpcLocation';
import { 合并世界基底到开场状态 } from '../hooks/useGame/storyState';

beforeAll(() => {
    (globalThis as any).ResizeObserver = class {
        observe() { /* jsdom 无布局，容器尺寸走默认值 */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    };
});

// React 18 的 scheduler 用 setImmediate 派发后续工作；多文件并发时偶发地在 jsdom
// 环境销毁之后才 flush，回调里访问 window 就抛 "window is not defined"。在 teardown
// 前让出两拍，把 pending 工作放完，避免 unhandled error 把 vitest 退出码顶成 1。
afterAll(async () => {
    // React 18 scheduler 走 setImmediate；必须用同一队列排两次才能刷干净，
    // setTimeout(0) 属于另一条队列，早先排入的工作仍会在 teardown 后触发。
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
});

const 建节点 = (id: string, name: string, 层级: 地点树节点['层级'], 父级ID = '', 子节点: 地点树节点[] = []): 地点树节点 => ({
    ID: id, 名称: name, 层级, 父级ID, 描述: '', 子节点,
});

const 树 = 建节点('n1', '沧溟神州', '寰宇', '', [
    建节点('n2', '江南水郡', '大地点', 'n1', [
        建节点('n3', '临安府', '中地点', 'n2', [
            建节点('n4', '钱塘码头区', '小地点', 'n3', [
                建节点('n5', '水狼帮大营', '区地点', 'n4', [
                    建节点('n6', '地下密室', '子地点', 'n5'),
                ]),
            ]),
        ]),
    ]),
]);

describe('连续地图组件', () => {
    it('只把精确记录到直接父场所的在场人物落在玩家房间，补录重复执行保持幂等', () => {
        const world = { 地图层级: [
            { ID: 'root', 名称: '九州', 层级: '寰宇' },
            { ID: 'inn', 名称: '回春灵兽驿', 层级: '区地点', 父级ID: 'root' },
            { ID: 'cellar', 名称: '灵兽地窖病房', 层级: '子地点', 父级ID: 'inn' },
            { ID: 'outside', 名称: '远山客栈', 层级: '区地点', 父级ID: 'root' }
        ] } as any;
        const env = { 小地点: '回春灵兽驿', 具体地点: '后堂药房' } as any;
        const repaired = 补录环境所在房间(world, env);
        expect(repaired.地图层级).toHaveLength(5);
        expect(补录环境所在房间(repaired, env)).toBe(repaired);
        const tree = 构建地点树(repaired, env);
        const people = 构建地图人物标记([tree.根节点!], tree.当前节点!.ID, [
            { 姓名: '俞月荷', 是否在场: true, 位置路径: '九州 > 回春灵兽驿' },
            { 姓名: '驿卒', 是否在场: false, 当前位置: '回春灵兽驿' },
            { 姓名: '医师', 是否在场: true, 当前位置: '灵兽地窖病房' },
            { 姓名: '游商', 是否在场: true, 当前位置: '远山客栈' },
            { 姓名: '药童', 是否在场: true, 位置路径: '回春灵兽驿 > 未收录的庭院' },
            { 姓名: '客卿', 是否在场: true, 位置路径: '远方城隍庙 > 后堂药房' }
        ], '杨培强');
        expect(people.get(tree.当前节点!.ID)?.map(p => p.name)).toEqual(['杨培强', '俞月荷']);
        expect(people.get('inn')?.map(p => p.name)).toContain('驿卒');
        expect(people.get('cellar')?.map(p => p.name)).toContain('医师');
        expect(people.get('outside')?.map(p => p.name)).toContain('游商');
    });

    it('开局具体地点缺失时只在已知上层地点下选房间，未知分支不混入其他地区', () => {
        const layers = [
            { ID: 'r', 名称: '九州', 层级: '寰宇' },
            { ID: 'north', 名称: '北境', 层级: '大地点', 父级ID: 'r' },
            { ID: 'south', 名称: '南境', 层级: '大地点', 父级ID: 'r' },
            ...['north', 'south'].flatMap((region, i) => [
                { ID: 't' + i, 名称: '平安镇', 层级: '小地点', 父级ID: region },
                { ID: 'h' + i, 名称: '医馆', 层级: '区地点', 父级ID: 't' + i },
                { ID: 's' + i, 名称: ['北院药房', '南院药房'][i], 层级: '子地点', 父级ID: 'h' + i }
            ])
        ];
        const merge = (大地点: string) => 合并世界基底到开场状态({
            环境: { 大地点, 小地点: '平安镇', 中地点: '', 具体地点: '' } as any
        }, { mapLayers: layers as any, factions: [] });
        expect(merge('南境').环境.具体地点).toBe('南院药房');
        expect(merge('尚未收录的州府').环境.具体地点).toBe('');
    });
    it('后堂药房与灵兽地窖病房是驿站的不同房间，旧档当前环境可补回缺失的房间', () => {
        const world = { 地图层级: [
            { ID: 'root', 名称: '九州', 层级: '寰宇' },
            { ID: 'inn', 名称: '回春灵兽驿', 层级: '区地点', 父级ID: 'root' },
            { ID: 'cellar', 名称: '灵兽地窖病房', 层级: '子地点', 父级ID: 'inn' },
        ] } as any;
        const env = { 小地点: '回春灵兽驿', 具体地点: '后堂药房' } as any;
        const tree = 构建地点树(world, env);
        expect(tree.当前节点).toMatchObject({ 名称: '后堂药房', 层级: '子地点', 父级ID: 'inn' });
        expect(tree.节点映射.get('inn')!.子节点.map(n => n.名称)).toEqual(['灵兽地窖病房', '后堂药房']);
        expect(构建地点树(world, env).当前节点?.ID).toBe(tree.当前节点?.ID);
        expect(world.地图层级).toHaveLength(3);
        const { container, unmount } = render(<LocationBrowser world={world} env={env} playerName="杨培强"
            socialList={[{ 姓名: '俞月荷', 是否在场: true, 当前位置: '回春灵兽驿 > 后堂药房' },
                { 姓名: '药童', 是否在场: true, 当前位置: '远方树林' }]} />);
        const mapPeople = container.querySelector('[data-people-node]')!;
        expect(mapPeople.getAttribute('data-people-node')).toBe(tree.当前节点?.ID);
        expect(mapPeople.textContent).toContain('俞月荷');
        expect(mapPeople.textContent).not.toContain('药童');
        fireEvent.click(container.querySelector('[data-node="cellar"]')!);
        expect(container.querySelector('.sr-only')?.textContent).not.toContain('在场');
        fireEvent.click(container.querySelector('button[title^="定位到"]')!);
        expect(container.querySelector('.sr-only')?.textContent).toContain('后堂药房');
        unmount();
    });

    it('世界基底中不同场所的同名房间保留独立 ID，按环境的场所选择房间', () => {
        const layers = [
            { ID: 'root', 名称: '九州', 层级: '寰宇' },
            { ID: 'one', 名称: '回春堂', 层级: '区地点', 父级ID: 'root' },
            { ID: 'two', 名称: '灵兽驿', 层级: '区地点', 父级ID: 'root' },
            { ID: 'room1', 名称: '药房', 层级: '子地点', 父级ID: 'one' },
            { ID: 'room2', 名称: '药房', 层级: '子地点', 父级ID: 'two' },
        ];
        const env = { 小地点: '灵兽驿', 具体地点: '药房' } as any;
        const merged = 合并世界基底到开场状态({ 世界: { 地图层级: [] } as any, 环境: env }, { mapLayers: layers as any, factions: [] });
        expect(new Set(merged.世界.地图层级.map((n: 地点树节点) => n.ID)).size).toBe(layers.length);
        expect(构建地点树(merged.世界, env).面包屑.map(n => n.名称)).toEqual(['九州', '灵兽驿', '药房']);
        expect(构建地点树(merged.世界, { ...env, 具体地点: '回春堂／药房', 小地点: '' }).面包屑.map(n => n.名称)).toEqual(['九州', '回春堂', '药房']);
    });

    it('连续双分支不会把最底层房间挤成一线，放大时人物图标保持屏幕尺寸', () => {
        const levels = ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'] as const;
        const branch = (depth: number, id: string, parent: string): 地点树节点 => 建节点(id, id, levels[depth], parent,
            depth === levels.length - 1 ? [] : [branch(depth + 1, id + 'a', id), branch(depth + 1, id + 'b', id)]);
        const root = branch(0, 'r', '');
        const roomId = 'raaaaa';
        const { container, getByTitle, unmount } = render(<RegionMap nodes={[root]} currentNodeId={roomId}
            currentLocationName={roomId} playerName="杨培强" onSelect={vi.fn()} onLocateCurrent={vi.fn()} />);
        const box = container.querySelector(`[data-node="${roomId}"]`)!;
        const width = Number(box.getAttribute('width'));
        const height = Number(box.getAttribute('height'));
        expect(Math.min(width, height) / Math.max(width, height)).toBeGreaterThan(0.35);
        for (let index = 0; index < 40; index++) fireEvent.click(getByTitle('放大'));
        const svg = container.querySelector('svg')!;
        const [, , viewW, viewH] = svg.getAttribute('viewBox')!.split(' ').map(Number);
        const scale = Math.min(240 / viewW, 200 / viewH);
        const dot = container.querySelector(`[data-people-node="${roomId}"] circle:last-of-type`)!;
        expect(Number(dot.getAttribute('r')) * scale).toBeLessThan(6);
        unmount();
    });

    it('把整棵树画在一张图上，并把玩家/NPC 画在最上层', () => {
        const { container } = render(
            <RegionMap
                nodes={[树.子节点[0]]}
                allNodes={[树]}
                currentNodeId="n4"
                currentLocationName="钱塘码头区"
                selectedNodeId="n4"
                playerName="杨培强"
                socialList={[{ 姓名: '俞月荷', 是否在场: true, 位置路径: '临安府 > 钱塘码头区 > 水狼帮大营' }]}
                onSelect={vi.fn()}
                onLocateCurrent={vi.fn()}
            />
        );
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].forEach(id => {
            expect(container.querySelector(`[data-node="${id}"]`)).not.toBeNull();
        });
        // 玩家和 NPC 都在人物图层（所有区块 rect 之后）；名字空间不足时会按规则隐藏，
        // 但圆点必须存在，且人物图层必须排在区块图层之后。
        const 组 = Array.from(container.querySelectorAll('svg > g'));
        const 区块组数 = 组.filter(group => group.querySelector('[data-node]')).length;
        const 人物组 = 组.slice(区块组数);
        expect(人物组.reduce((count, group) => count + group.querySelectorAll('circle').length, 0)).toBeGreaterThanOrEqual(3);
        expect(人物组.some(group => group.textContent?.includes('杨培强'))).toBe(true);
    });

    it('点击区块选中节点并通知外部', () => {
        const onSelect = vi.fn();
        const { container } = render(
            <RegionMap
                nodes={[树.子节点[0]]}
                allNodes={[树]}
                currentNodeId="n4"
                currentLocationName="钱塘码头区"
                playerName="杨培强"
                socialList={[]}
                onSelect={onSelect}
                onLocateCurrent={vi.fn()}
            />
        );
        fireEvent.click(container.querySelector('[data-node="n5"]')!);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].名称).toBe('水狼帮大营');
    });
});

// SVG 的 fill/stroke/stopColor 若写死常量色，html[data-theme="day"] 的 class 覆盖只能
// 改 DOM 背景，改不到 presentation attribute —— 白天就会留下黑底 + 金字。这里锁死
// 「绘图色走 var(--mm-*) + global.css 同时提供夜/日两套色板」这条约束，防回退。
describe('地图双主题色板', () => {
    const 源码 = readFileSync(path.resolve(process.cwd(), 'components/features/Map/RegionMap.tsx'), 'utf8');
    const 样式 = readFileSync(path.resolve(process.cwd(), 'styles/global.css'), 'utf8');

    it('根节点挂 moran-map-surface，背景/边框走 CSS 变量', () => {
        const { container } = render(
            <RegionMap
                nodes={[树.子节点[0]]}
                allNodes={[树]}
                currentNodeId="n4"
                currentLocationName="钱塘码头区"
                onSelect={vi.fn()}
                onLocateCurrent={vi.fn()}
            />
        );
        const 根 = container.querySelector('.moran-map-surface');
        expect(根).not.toBeNull();
        expect(根!.getAttribute('style')).toContain('var(--mm-bg)');
        expect(根!.getAttribute('style')).toContain('var(--mm-border)');
    });

    it('SVG 绘图色不再写死夜间常量', () => {
        ['#0a0d14', '#e9d7af', 'rgba(250, 240, 220', 'rgba(196, 160, 100'].forEach(色 => {
            expect(源码).not.toContain(色);
        });
    });

    it('所有引用到的 --mm-* 变量都有定义，且 day 主题重定义了关键可读性色', () => {
        const 用到 = new Set([...源码.matchAll(/var\((--mm-[a-z0-9-]+)\)/g)].map(m => m[1]));
        const 定义 = new Set([...样式.matchAll(/(--mm-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
        expect(用到.size).toBeGreaterThan(20);
        [...用到].forEach(变量 => expect(定义.has(变量), `缺少定义: ${变量}`).toBe(true));

        const day段 = 样式.slice(样式.indexOf('html[data-theme="day"] .moran-map-surface'));
        expect(day段.length).toBeGreaterThan(0);
        ['--mm-bg', '--mm-canvas', '--mm-label', '--mm-label-stroke', '--mm-fill-3', '--mm-bld-top'].forEach(变量 => {
            expect(day段).toContain(`${变量}:`);
        });
    });
});
