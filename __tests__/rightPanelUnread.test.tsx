// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { 计算回合键, 计算变化区域签名, 判断是否有未读, 合并已读键 } from '../utils/rightPanelUnread';

afterEach(cleanup);

describe('右侧菜单未读状态：回合身份与已读集合', () => {
    it('同一时间戳视为同一回合，不同时间戳即新回合（变化区域相同也要重新提示）', () => {
        const 第一轮 = 计算回合键(1700000000000, '社交');
        const 第二轮 = 计算回合键(1700000009000, '社交');
        expect(第一轮).toBe('turn:1700000000000');
        expect(第二轮).toBe('turn:1700000009000');
        expect(第一轮).not.toBe(第二轮);
    });

    it('历史消息没有时间戳时退回区域签名，保持与改动前一致的行为', () => {
        expect(计算回合键(undefined, '社交|装备')).toBe('sections:社交|装备');
        expect(计算回合键(0, '社交')).toBe('sections:社交');
        expect(计算回合键('abc', '社交')).toBe('sections:社交');
    });

    it('变化区域签名与顺序无关', () => {
        expect(计算变化区域签名(['社交', '装备'])).toBe(计算变化区域签名(['装备', '社交']));
        expect(计算变化区域签名([])).toBe('');
    });

    it('已读后不再提示；未读的区域才提示', () => {
        const tracked = new Set(['社交', '装备', '任务列表']);
        expect(判断是否有未读(['社交'], tracked, [])).toBe(true);
        expect(判断是否有未读(['社交'], tracked, ['社交'])).toBe(false);
        expect(判断是否有未读(['社交'], tracked, ['装备'])).toBe(true);
        // 不在追踪范围内的区域不触发提示
        expect(判断是否有未读(['某某未追踪'], tracked, [])).toBe(false);
        expect(判断是否有未读([], tracked, [])).toBe(false);
    });

    it('合并已读键保持去重与稳定顺序，不覆盖已有记录', () => {
        expect(合并已读键([], ['社交'])).toEqual(['社交']);
        expect(合并已读键(['社交'], ['装备'])).toEqual(['社交', '装备']);
        expect(合并已读键(['社交'], ['社交'])).toEqual(['社交']);
        expect(合并已读键(['社交'], [])).toEqual(['社交']);
    });
});

describe('右侧菜单未读状态：点击 -> 已读 -> 卸载重挂 -> 新回合', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    const baseProps = (overrides: Record<string, unknown> = {}) => ({
        onOpenSettings: () => {},
        onOpenInventory: () => {},
        onOpenEquipment: () => {},
        onOpenBattle: () => {},
        onOpenTeam: () => {},
        onOpenSocial: () => {},
        onOpenKungfu: () => {},
        onOpenWorld: () => {},
        onOpenMap: () => {},
        onOpenSect: () => {},
        onOpenTask: () => {},
        onOpenAgreement: () => {},
        onOpenStory: () => {},
        onOpenHeroinePlan: () => {},
        onOpenMemory: () => {},
        onSave: () => {},
        onLoad: () => {},
        ...overrides,
    });

    it('点击有未读的项会回报已读；卸载重挂后仍然不再提示', async () => {
        const { default: RightPanel } = await import('../components/layout/RightPanel');
        const onDismiss = vi.fn();

        const first = render(<RightPanel {...baseProps({
            latestChangedSections: ['社交'],
            dismissedChangeKeys: [],
            onDismissChangeKeys: onDismiss,
        })} />);
        const socialTile = first.container.querySelector<HTMLButtonElement>('.rp-quick-tile[title="社交"]');
        expect(socialTile).not.toBeNull();
        expect(first.container.querySelectorAll('.rp-dot').length).toBeGreaterThan(0);
        socialTile?.click();
        expect(onDismiss).toHaveBeenCalledWith(['社交']);

        // 模拟 App 保存已读后卸载并重新挂载菜单
        first.unmount();
        const second = render(<RightPanel {...baseProps({
            latestChangedSections: ['社交'],
            dismissedChangeKeys: ['社交'],
            onDismissChangeKeys: onDismiss,
        })} />);
        expect(second.container.querySelectorAll('.rp-dot').length).toBe(0);
    });

    it('没有未读的项被点击时不写已读，同回合后处理补上的变化仍会提示', async () => {
        const { default: RightPanel } = await import('../components/layout/RightPanel');
        const onDismiss = vi.fn();

        // 主剧情已落地，但本回合还没有「装备」变化
        const view = render(<RightPanel {...baseProps({
            latestChangedSections: ['社交'],
            dismissedChangeKeys: ['社交'],
            onDismissChangeKeys: onDismiss,
        })} />);
        const equipmentTile = view.container.querySelector<HTMLButtonElement>('.rp-quick-tile[title="装备"]');
        expect(equipmentTile).not.toBeNull();
        equipmentTile?.click();
        // 关键：不能把「装备」预先登记成已读，否则后处理稍后补上的装备变化会被吞掉
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('新回合即使变化区域完全相同，也会重新提示', async () => {
        const { default: RightPanel } = await import('../components/layout/RightPanel');
        const renderWith = (dismissed: string[]) => render(<RightPanel {...baseProps({
            latestChangedSections: ['社交'],
            dismissedChangeKeys: dismissed,
            onDismissChangeKeys: () => {},
        })} />);

        const 已读 = renderWith(['社交']);
        expect(已读.container.querySelectorAll('.rp-dot').length).toBe(0);
        已读.unmount();

        // 新回合开始时 App 会清空已读（回合键变化），这里模拟清空后的重挂
        const 新回合 = renderWith([]);
        expect(新回合.container.querySelectorAll('.rp-dot').length).toBeGreaterThan(0);
    });
});

describe('App 侧未读链路（与 App.tsx 使用同一组函数）', () => {
    const tracked = new Set(['社交', '地图']);

    // 模拟 App 的 state：当前回合键 + 当前变化区域 + 已读集合
    const 造App状态 = () => {
        let dismissed: string[] = [];
        let turnKey = '';
        let changed: string[] = [];
        const 记回合 = (timestamp: number | undefined, sections: string[]) => {
            changed = sections;
            const nextKey = 计算回合键(timestamp, 计算变化区域签名(sections));
            if (nextKey !== turnKey) {
                turnKey = nextKey;
                dismissed = []; // App 里是 useEffect 清空
            }
        };
        return {
            进入回合(timestamp: number | undefined, sections: string[]) {
                if (!turnKey) {
                    记回合(timestamp, sections);
                    return;
                }
                // 回合键变化才算新回合；同回合只更新变化区域（含后处理补上的）
                const nextKey = 计算回合键(timestamp, 计算变化区域签名(sections));
                if (nextKey === turnKey) {
                    changed = sections;
                    return;
                }
                记回合(timestamp, sections);
            },
            收起书签有点() {
                return 判断是否有未读(changed, tracked, dismissed);
            },
            // 与 RightPanel.wrapChangedAction 一致：只登记此刻真的有未读的键
            点开项(keys: string[]) {
                const unreadKeys = keys.filter((key) => 判断是否有未读([key], tracked, dismissed)
                    && changed.includes(key));
                if (unreadKeys.length > 0) dismissed = 合并已读键(dismissed, unreadKeys);
            },
            get 已读() {
                return dismissed;
            },
        };
    };

    it('第一轮亮 -> 点开消点 -> 收起/展开书签都无点 -> 第二轮仍只有社交变化 -> 重新亮点', () => {
        const app = 造App状态();

        // 第一轮：只有「社交」变化
        app.进入回合(1700000000000, ['社交']);
        expect(app.收起书签有点()).toBe(true);

        // 点开「社交」消点
        app.点开项(['社交']);
        expect(app.收起书签有点()).toBe(false);
        expect(app.已读).toEqual(['社交']);

        // 收起/展开菜单不会重置已读（回合键没变）
        app.进入回合(1700000000000, ['社交']);
        expect(app.收起书签有点()).toBe(false);

        // 第二轮：变化区域还是一模一样，但这是新回合 -> 必须重新提示
        app.进入回合(1700000009000, ['社交']);
        expect(app.收起书签有点()).toBe(true);
    });

    it('同一回合内后处理补上的变化不会被提前登记成已读', () => {
        const app = 造App状态();
        app.进入回合(1700000000000, ['社交']);

        // 玩家点开「地图」，但此刻地图并没有变化 —— 不应写已读
        app.点开项(['地图']);
        expect(app.已读).toEqual([]);

        // 后处理把地图变化回填到同一条助手消息，回合键不变
        app.进入回合(1700000000000, ['社交', '地图']);
        expect(app.收起书签有点()).toBe(true);
    });
});
