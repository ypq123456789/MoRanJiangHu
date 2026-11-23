// @vitest-environment jsdom
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
