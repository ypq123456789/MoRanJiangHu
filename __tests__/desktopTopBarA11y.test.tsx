// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TopBar from '../components/layout/TopBar';
import { 环境信息结构, 节日结构 } from '../types';

afterEach(cleanup);

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

// 与 TopBar 内 Tab 循环使用的选择器保持一致
const TRAP_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const openFullscreen = (dialogName: string) => {
    render(
        <TopBar
            环境={makeEnv()}
            游戏初始时间="0001:01:01:08:00"
            timeFormat="传统"
            festivals={[春节]}
        />
    );
    const weatherBtn = screen.getByRole('button', { name: '天气：晴' });
    weatherBtn.focus();
    fireEvent.click(weatherBtn);
    fireEvent.click(screen.getByRole('button', { name: '展开详情' }));
    return screen.getByRole('dialog', { name: dialogName });
};

describe('顶栏全屏详情的键盘可达性', () => {
    it('Tab 循环覆盖「收起」按钮与内容滚动区，而不是只困在收起按钮上', () => {
        const dialog = openFullscreen('天象变更');
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(TRAP_SELECTOR));
        const labels = focusables.map((el) => el.getAttribute('aria-label') || el.textContent?.trim());

        expect(labels).toContain('收起');
        expect(labels).toContain('天象变更内容');

        const scroller = dialog.querySelector<HTMLElement>('[aria-label="天象变更内容"]');
        expect(scroller).not.toBeNull();
        expect(scroller?.tagName).toBe('DIV');
        // 可聚焦的滚动区域：显式 tabIndex=0 且带焦点轮廓类
        expect(scroller?.getAttribute('tabindex')).toBe('0');
        expect(scroller?.className).toContain('focus-visible:outline');
        expect(scroller?.className).toContain('overflow-y-auto');
    });

    it('焦点落在最后一个可聚焦元素时按 Tab 回到第一个，落在第一个时 Shift+Tab 回到最后一个', () => {
        const dialog = openFullscreen('天象变更');
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(TRAP_SELECTOR));
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        expect(first.textContent).toContain('收起');
        expect(last.getAttribute('aria-label')).toBe('天象变更内容');

        // 焦点在最后一个元素上按 Tab：应被拦截并回到第一个
        last.focus();
        expect(document.activeElement).toBe(last);
        fireEvent.keyDown(last, { key: 'Tab' });
        expect(document.activeElement).toBe(first);

        // 焦点在第一个元素上按 Shift+Tab：应被拦截并回到最后一个
        fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);
    });

    it('内容滚动区可获得键盘焦点（长环境描述可用键盘滚动）', () => {
        const dialog = openFullscreen('天象变更');
        const scroller = dialog.querySelector<HTMLElement>('[aria-label="天象变更内容"]');
        scroller?.focus();
        expect(document.activeElement).toBe(scroller);
    });
});
