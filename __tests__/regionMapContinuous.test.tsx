// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import RegionMap from '../components/features/Map/RegionMap';
import type { 地点树节点 } from '../utils/locationTree';

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
