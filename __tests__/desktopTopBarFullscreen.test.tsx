// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TopBar from '../components/layout/TopBar';
import { 环境信息结构, 节日结构 } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const 春节: 节日结构 = { id: 'spring', 名称: '春节', 月: 1, 日: 1, 描述: '爆竹声', 效果: '城中热闹非凡' };

const makeEnv = (overrides: Partial<环境信息结构> = {}): 环境信息结构 => ({
    时间: '0001:01:01:12:00',
    大地点: '东江州',
    中地点: '青溪镇',
    小地点: '河埠街早市',
    具体地点: '老槐树下卦摊',
    节日: null,
    天气: { 天气: '晴', 结束日期: '0001:01:03:12:00' },
    环境变量: [{ 名称: '微雾', 描述: '晨间薄雾', 效果: '视野略降' }],
    ...overrides,
});

// 可控的 matchMedia 桩：桌面/移动两种状态可切换，并支持派发 change
const installMatchMedia = (initialDesktop: boolean) => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const state = { desktop: initialDesktop };
    const mql = {
        get matches() {
            return state.desktop;
        },
        media: '(min-width: 768px)',
        onchange: null,
        addEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => {
            listeners.add(handler);
        },
        removeEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => {
            listeners.delete(handler);
        },
        addListener: (handler: (event: { matches: boolean }) => void) => listeners.add(handler),
        removeListener: (handler: (event: { matches: boolean }) => void) => listeners.delete(handler),
        dispatchEvent: () => true,
    };
    vi.stubGlobal('matchMedia', () => mql);
    return {
        mql,
        setDesktop(next: boolean) {
            state.desktop = next;
            listeners.forEach((handler) => handler({ matches: next }));
        },
        listenerCount: () => listeners.size,
    };
};

const openFestivalFullscreen = () => {
    const festBtn = screen.getByRole('button', { name: /节日：/ });
    festBtn.focus();
    fireEvent.click(festBtn);
    fireEvent.click(screen.getByRole('button', { name: '展开详情' }));
    return screen.getByRole('dialog', { name: '今日时节' });
};

describe('顶栏全屏详情的关闭与焦点归还', () => {
    it('节日跨进平常日导致触发按钮卸载后，Escape 关闭详情会把焦点归还到仍可见的顶栏控件', async () => {
        installMatchMedia(true);
        const view = render(
            <TopBar
                环境={makeEnv()}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[春节]}
            />
        );

        const dialog = openFestivalFullscreen();
        expect(dialog).toBeTruthy();

        // 节日失效：顶栏上的节日按钮随之卸载
        view.rerender(
            <TopBar
                环境={makeEnv({ 时间: '0001:01:05:12:00' })}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[春节]}
            />
        );
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /节日：/ })).toBeNull();
        });
        // 详情仍在（桌面宽度下遮罩本身可见）
        expect(screen.getByRole('dialog', { name: '今日时节' })).toBeTruthy();

        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: '今日时节' })).toBeNull();
        });
        // 焦点没有丢在页面上：落到了仍在顶栏的历程按钮上
        await waitFor(() => {
            const active = document.activeElement as HTMLElement | null;
            expect(active).not.toBeNull();
            expect(active?.tagName).toBe('BUTTON');
            expect(active?.getAttribute('aria-label') || '').toContain('历程');
        });
    });

    it('原触发按钮仍可见时，关闭详情优先把焦点归还给它', async () => {
        installMatchMedia(true);
        render(
            <TopBar
                环境={makeEnv()}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[春节]}
            />
        );

        openFestivalFullscreen();
        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: '今日时节' })).toBeNull();
        });
        await waitFor(() => {
            expect((document.activeElement as HTMLElement)?.getAttribute('aria-label') || '').toContain('节日');
        });
    });

    it('视口离开桌面布局（低于 md）时详情立即关闭，窗口拉回桌面宽度也不会自己冒出来', async () => {
        const media = installMatchMedia(true);
        render(
            <TopBar
                环境={makeEnv()}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[春节]}
            />
        );

        openFestivalFullscreen();
        expect(screen.getByRole('dialog', { name: '今日时节' })).toBeTruthy();
        expect(media.listenerCount()).toBeGreaterThan(0);

        // 视口缩到手机宽度：遮罩被 CSS 隐藏，详情状态必须一并清掉
        media.setDesktop(false);
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: '今日时节' })).toBeNull();
        });
        // 清理监听的证据：详情已关，effect 卸载时 removeEventListener 应把监听数降回 0
        await waitFor(() => {
            expect(media.listenerCount()).toBe(0);
        });
        // 这条分支不该把焦点抢到已不可见的桌面顶栏按钮上
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)));
        const activeAfterClose = document.activeElement as HTMLElement | null;
        expect(activeAfterClose?.className || '').not.toContain('topbar-btn');

        // 拉回桌面宽度：不重新出现
        media.setDesktop(true);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByRole('dialog', { name: '今日时节' })).toBeNull();
    });
});
