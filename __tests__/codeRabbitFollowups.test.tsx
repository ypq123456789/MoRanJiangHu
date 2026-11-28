// @vitest-environment jsdom
import React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import RegionMap from '../components/features/Map/RegionMap';
import LocationBrowser from '../components/features/Map/LocationBrowser';
import { 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';
import { 规范化世界状态 } from '../hooks/useGame/storyState';
import { 构建地图空间场景 } from '../utils/mapSpatial';

beforeAll(() => {
    (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    // jsdom 没有指针捕获 API，装一层可 spy 的桩，便于验证「点击不捕获、拖动才捕获」。
    (Element.prototype as any).setPointerCapture = function () {};
    (Element.prototype as any).hasPointerCapture = function () { return false; };
    (Element.prototype as any).releasePointerCapture = function () {};
});

// React scheduler 通过 setImmediate 派发收尾工作；本文件多次 render RegionMap，
// 多文件并发时若不等队列排空，回调会在 jsdom 环境销毁后访问 window，触发
// unhandled error 并让整轮 CI 失败。这里在 teardown 前把同一队列刷干净。
afterEach(async () => {
    cleanup();
    await new Promise(resolve => setImmediate(resolve));
});

afterAll(async () => {
    cleanup();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
});

const mk = (id: string, name: string, level: any, parent = '', children: any[] = [], extra: any = {}): any => ({
    ID: id, 名称: name, 层级: level, 父级ID: parent, 描述: '', 子节点: children, ...extra,
});

const simpleTree = mk('n1', '诸天万界', '寰宇', '', [
    mk('n2', '江南水郡', '大地点', 'n1', [
        mk('n3', '临安府', '中地点', 'n2', [
            mk('n4', '扬州', '小地点', 'n3', [
                mk('n5', '悦来客栈', '区地点', 'n4', [
                    mk('n6', '天字一号房', '子地点', 'n5'),
                ]),
            ]),
        ]),
    ]),
]);

const baseProps: any = {
    nodes: [simpleTree.子节点[0]],
    allNodes: [simpleTree],
    currentNodeId: 'n4',
    currentLocationName: '扬州',
    onSelect: vi.fn(),
    onLocateCurrent: vi.fn(),
    playerName: '',
    socialList: [],
};

describe('CodeRabbit 后续意见回归', () => {
    // [2] 同名叶节点要用祖先链消歧：错误分支故意排在前面
    it('NPC 落点按祖先路径消歧，不会落到同名但不同分支的节点', () => {
        const tree = mk('root', '诸天万界', '寰宇', '', [
            mk('b1', '临安府', '中地点', 'root', [
                mk('b2', '水狼帮大营', '区地点', 'b1', [
                    mk('b3', '库房', '子地点', 'b2'),
                ]),
            ]),
            mk('a1', '平江府', '中地点', 'root', [
                mk('a2', '水狼帮大营', '区地点', 'a1', [
                    mk('a3', '库房', '子地点', 'a2'),
                ]),
            ]),
        ]);
        const { container } = render(
            <RegionMap
                {...baseProps}
                allNodes={[tree]}
                nodes={tree.子节点}
                currentNodeId=""
                playerName=""
                socialList={[{ 姓名: '俞月荷', 是否在场: true, 位置路径: '平江府 > 水狼帮大营 > 库房' }]}
            />
        );
        expect(container.querySelector('[data-people-node="a3"]')).not.toBeNull();
        expect(container.querySelector('[data-people-node="b3"]')).toBeNull();
    });

    // [5] 普通点击不捕获指针，超过拖动阈值才捕获
    it('普通按下不捕获指针，超过拖动阈值后才捕获', () => {
        const original = (Element.prototype as any).setPointerCapture;
        const capture = vi.fn();
        (Element.prototype as any).setPointerCapture = capture;
        try {
            const { container } = render(<RegionMap {...baseProps} />);
            const svg = container.querySelector('svg')!;
            fireEvent.pointerDown(svg, { button: 0, pointerId: 9, clientX: 5, clientY: 5 });
            expect(capture).not.toHaveBeenCalled();
            fireEvent.pointerMove(svg, { button: 0, pointerId: 9, clientX: 40, clientY: 40 });
            expect(capture).toHaveBeenCalledTimes(1);
        } finally {
            (Element.prototype as any).setPointerCapture = original;
        }
    });

    // [7] pointercancel 不应留下未消费的 click 抑制标记
    it('被取消的拖动手势不会吞掉下一次有效点击', () => {
        const onSelect = vi.fn();
        const { container } = render(<RegionMap {...baseProps} onSelect={onSelect} />);
        const svg = container.querySelector('svg')!;
        fireEvent.pointerDown(svg, { button: 0, pointerId: 7, clientX: 5, clientY: 5 });
        fireEvent.pointerMove(svg, { button: 0, pointerId: 7, clientX: 60, clientY: 60 });
        fireEvent.pointerCancel(svg, { pointerId: 7 });
        fireEvent.click(container.querySelector('[data-node="n5"]')!);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    // [8] 图例只显示实际绘制出来的人物标记
    it('只有玩家或根本没有 NPC 标记时不显示 NPC 图例', () => {
        const empty = render(<RegionMap {...baseProps} />);
        expect(empty.container.textContent).not.toContain('NPC');
        empty.unmount();

        const withNpc = render(
            <RegionMap
                {...baseProps}
                socialList={[{ 姓名: '俞月荷', 是否在场: true, 位置路径: '临安府 > 扬州 > 悦来客栈' }]}
            />
        );
        expect(withNpc.container.textContent).toContain('NPC');
    });

    // [9] 控制势力副标题字号上限与可读阈值统一后可以渲染
    it('区块足够大时渲染控制势力副标题', () => {
        const tree = mk('r', '诸天万界', '寰宇', '', [
            mk('c', '扬州', '小地点', 'r', [], { 控制势力: '盐铁商盟' }),
        ]);
        const { container } = render(
            <RegionMap {...baseProps} allNodes={[tree]} nodes={tree.子节点} currentNodeId="c" />
        );
        const texts = Array.from(container.querySelectorAll('text')).map(node => node.textContent);
        expect(texts).toContain('盐铁商盟');
    });

    // [10] 密集人物标记聚合且不越出所属区块
    it('密集人物标记会聚合并保持在所属区块内', () => {
        const tree = mk('r', '诸天万界', '寰宇', '', [
            mk('p', '江南水郡', '大地点', 'r', [
                mk('q', '临安府', '中地点', 'p'),
                mk('s', '平江府', '中地点', 'p'),
            ]),
        ]);
        const socialList = Array.from({ length: 60 }, (_, i) => ({ 姓名: `路人${i}`, 是否在场: true }));
        const { container } = render(
            <RegionMap
                {...baseProps}
                allNodes={[tree]}
                nodes={[tree.子节点[0]]}
                currentNodeId="q"
                socialList={socialList}
            />
        );
        const group = container.querySelector('[data-people-node="q"]')!;
        expect(group).not.toBeNull();
        const circles = Array.from(group.querySelectorAll('circle'));
        // 60 人未聚合时会有 120 个圆点（每人白底 + 彩心），聚合后必须更少。
        expect(circles.length).toBeLessThan(120);
        const rect = container.querySelector('[data-node="q"]')!;
        const x = Number(rect.getAttribute('x'));
        const w = Number(rect.getAttribute('width'));
        circles.forEach((circle) => {
            const cx = Number(circle.getAttribute('cx'));
            expect(cx).toBeGreaterThanOrEqual(x - 1);
            expect(cx).toBeLessThanOrEqual(x + w + 1);
        });
    });

    // [1] 折叠面包屑的省略号可点击、可聚焦，展开后祖先仍可选
    it('折叠面包屑的省略号是按钮，展开后显示被折叠的祖先', () => {
        const world = {
            地图层级: [
                { ID: 'L1', 名称: '诸天万界', 层级: '寰宇', 父级ID: '' },
                { ID: 'L2', 名称: '沧溟神州', 层级: '大地点', 父级ID: 'L1' },
                { ID: 'L3', 名称: '临安府', 层级: '中地点', 父级ID: 'L2' },
                { ID: 'L4', 名称: '扬州', 层级: '小地点', 父级ID: 'L3' },
                { ID: 'L5', 名称: '悦来客栈', 层级: '区地点', 父级ID: 'L4' },
            ],
        } as any;
        const env = { 大地点: '沧溟神州', 中地点: '临安府', 小地点: '扬州', 具体地点: '悦来客栈' } as any;
        const { container } = render(<LocationBrowser world={world} env={env} playerName="" socialList={[]} />);
        const toggle = container.querySelector('button[aria-expanded="false"]')!;
        expect(toggle).not.toBeNull();
        expect(toggle.tagName).toBe('BUTTON');
        const bar = toggle.parentElement!;
        expect(bar.textContent).not.toContain('临安府');
        fireEvent.click(toggle);
        expect(bar.textContent).toContain('临安府');
        const ancestor = Array.from(bar.querySelectorAll('button')).find(btn => btn.textContent?.trim() === '临安府');
        expect(ancestor).toBeTruthy();
        expect(() => fireEvent.click(ancestor!)).not.toThrow();
    });
});

const spatialLayer = (id: string, name: string, level: string, parent: string): any => ({
    ID: id, 名称: name, 层级: level, 父级ID: parent, 描述: '', 归属: {},
    锚点坐标: { x: 0, y: 0 }, 网格宽度: 24, 网格高度: 24,
    边界四角坐标: [], 建筑物ID列表: [], 道路ID列表: [], 人物ID列表: [],
});
const spatialWorld = {
    地图层级: [
        spatialLayer('DT-001', '太古界', '寰宇', ''),
        spatialLayer('DT-002', '中州大地', '大地点', 'DT-001'),
        spatialLayer('DT-003', '青云山脉', '中地点', 'DT-002'),
        spatialLayer('DT-004', '青石镇', '小地点', 'DT-003'),
        spatialLayer('DT-005', '望江楼外', '区地点', 'DT-004'),
        spatialLayer('DT-006', '望江楼', '子地点', 'DT-005'),
    ],
    地图建筑: [], 地图道路: [], 地图人物: [], 势力列表: [],
} as any;
const spatialEnv = { 大地点: '中州大地', 中地点: '青云山脉', 小地点: '青石镇', 具体地点: '望江楼外' } as any;
// #17 的路径匹配用例要验证「玩家在房间层时 NPC 不被错挂」，玩家所在层必须由精确名称
// 给出，不能依赖「望江楼外」被模糊命中成「望江楼」这个 bug。
const spatialEnvAtRoom = { ...spatialEnv, 具体地点: '望江楼' } as any;

describe('装备补建与老存档地图回归', () => {
    // [11] 名称迁移后按旧名引用仍能命中原物品
    it('历史补建物品改名后，装备栏按旧名引用不会再造一个重复物品', () => {
        const role = 规范化角色物品容器映射({
            姓名: '杨培强',
            装备: { 主武器: 'Item001' },
            物品列表: [{
                ID: 'itm_1', 名称: 'Item001', 类型: '武器',
                描述: '由「主武器」装备栏引用自动补建（旧档）', 当前装备部位: '主武器',
            }],
        } as any, { 补建缺失装备引用: true });
        expect(role.物品列表.length).toBe(1);
        expect(role.物品列表[0].名称).toBe('主武器');
    });

    // [12] 同一个缺失引用只补建一次，第二个槽位走重复槽位保护
    it('两个槽位引用同一个缺失物品时只补建一次', () => {
        const role = 规范化角色物品容器映射({
            姓名: '杨培强',
            装备: { 主武器: 'Item001', 副武器: 'Item001' },
            物品列表: [],
        } as any, { 补建缺失装备引用: true });
        expect(role.物品列表.length).toBe(1);
        expect((role.装备 as any).副武器).toBe('无');
    });

    // [13] 父节点改名时同步改写按旧名引用的子节点父级ID
    it('清洗父节点地名后，按旧名当父级ID 的子节点会被改指到父节点 ID', () => {
        const normalized = 规范化世界状态({
            地图层级: [
                { ID: 'DT-001', 名称: '诸天万界', 层级: '寰宇', 父级ID: '' },
                { ID: 'DT-002', 名称: '中州大地的', 层级: '大地点', 父级ID: 'DT-001' },
                { ID: 'DT-003', 名称: '临安城', 层级: '小地点', 父级ID: '中州大地的' },
            ],
        } as any);
        expect((normalized.地图层级[1] as any).名称).toBe('中州大地');
        expect((normalized.地图层级[2] as any).父级ID).toBe('DT-002');
    });

    // [17] 精确片段优先 + 子串回退排除被更长命中名称包含的短名称。
    // 当前层级会被「望江楼外」模糊命中到子地点 DT-006；若 NPC 被错挂到房间层，
    // 就会跟着出现在这一层的「当前层人物」里。
    it('路径「青石镇 > 望江楼外」不会被子串「望江楼」抢到更深的房间层', () => {
        const scene = 构建地图空间场景(
            spatialWorld, spatialEnvAtRoom,
            [{ 姓名: '路人甲', 当前位置: '青石镇 > 望江楼外' }],
            '杨培强'
        );
        expect(scene.当前层级?.ID).toBe('DT-006');
        expect((scene.当前层人物 || []).some((person: any) => person.名称 === '路人甲')).toBe(false);
    });

    it('无分隔符的自然语言位置也不会被较短的子地点名称抢走', () => {
        const scene = 构建地图空间场景(
            spatialWorld, spatialEnvAtRoom,
            [{ 姓名: '路人乙', 当前位置: '青石镇望江楼外东侧' }],
            '杨培强'
        );
        expect((scene.当前层人物 || []).some((person: any) => person.名称 === '路人乙')).toBe(false);
    });

    // 玩家自己在「望江楼外」时，判到区地点 DT-005，不能被模糊拖进子地点房间层 DT-006。
    it('当前层级精确落在本节点，不会被更短的子地点名称抢走', () => {
        const scene = 构建地图空间场景(spatialWorld, spatialEnv, [], '杨培强');
        expect(scene.当前层级?.ID).toBe('DT-005');
    });
});
