// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TopBar, { buildVisibleAncestors } from '../components/layout/TopBar';
import { 环境信息结构, 节日结构, 视觉设置结构 } from '../types';

afterEach(cleanup);

const springFestival: 节日结构 = {
    id: 'spring',
    名称: '春节',
    月: 1,
    日: 1,
    描述: '爆竹声中一岁除，春风送暖入屠苏。',
    效果: '城中热闹非凡',
};

const makeEnv = (overrides: Partial<环境信息结构> = {}): 环境信息结构 => ({
    时间: '0001:01:01:12:00',
    大地点: '东江州',
    中地点: '青溪镇',
    小地点: '河埠街早市',
    具体地点: '老槐树下卦摊',
    节日: null,
    天气: { 天气: '晴', 结束日期: '1年01月03日' },
    环境变量: [{ 名称: '微雾', 描述: '晨间薄雾笼罩街巷。', 效果: '视野微降' }],
    ...overrides,
});

describe('桌面顶部状态栏（TopBar）', () => {
    it('中段上级地名按级别优先省略，当前地点始终独立保留', () => {
        const ancestors = ['东江州', '青溪镇', '河埠街早市'];
        expect(buildVisibleAncestors(ancestors, 0)).toEqual([
            { type: 'seg', text: '东江州' },
            { type: 'seg', text: '青溪镇' },
            { type: 'seg', text: '河埠街早市' },
        ]);
        expect(buildVisibleAncestors(ancestors, 1)).toEqual([
            { type: 'seg', text: '东江州' },
            { type: 'ellipsis' },
            { type: 'seg', text: '河埠街早市' },
        ]);
        expect(buildVisibleAncestors(ancestors, 2)).toEqual([
            { type: 'ellipsis' },
            { type: 'seg', text: '河埠街早市' },
        ]);
        expect(buildVisibleAncestors(ancestors, 3)).toEqual([{ type: 'ellipsis' }]);
    });

    it('末级地名与上级同名时仍保留末级作为当前地点', () => {
        const { container } = render(
            <TopBar
                环境={makeEnv({
                    大地点: '甲州',
                    中地点: '青溪',
                    小地点: '河埠街',
                    具体地点: '青溪',
                })}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[springFestival]}
            />
        );

        const currentEl = container.querySelector('.topbar-loc-current');
        expect(currentEl?.textContent).toBe('青溪');
        const locBtn = screen.getByRole('button', { name: /当前地点：甲州 \/ 青溪 \/ 河埠街 \/ 青溪/ });
        expect(locBtn).toBeTruthy();
    });

    it('满态展示天气、环境软囊、传统时辰、四级地点、节日小印与历程，且全部详情可点开并用 Escape 收起', () => {
        render(
            <TopBar
                环境={makeEnv()}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[springFestival]}
            />
        );

        const weatherBtn = screen.getByRole('button', { name: '天气：晴' });
        const envBtn = screen.getByRole('button', { name: '环境：微雾' });
        const dateBtn = screen.getByRole('button', { name: /1年01月01日 午时 · 初刻/ });
        const locBtn = screen.getByRole('button', { name: /当前地点：东江州 \/ 青溪镇 \/ 河埠街早市 \/ 老槐树下卦摊/ });
        const festBtn = screen.getByRole('button', { name: '节日：春节' });
        const journeyBtn = screen.getByRole('button', { name: '历程：第 1 天' });

        expect(dateBtn.textContent).toContain('1年01月01日');
        expect(dateBtn.textContent).toContain('午时 · 初刻');

        for (const [btn, regionName] of [
            [weatherBtn, '天象变更'],
            [envBtn, '周遭环境'],
            [locBtn, '当前地点'],
            [festBtn, '今日时节'],
            [journeyBtn, '行程历程'],
        ] as const) {
            btn.focus();
            fireEvent.click(btn);
            expect(btn.getAttribute('aria-expanded')).toBe('true');
            const regions = screen.getAllByRole('region', { name: regionName });
            expect(regions.length).toBeGreaterThan(0);
            const closeBtn = regions[regions.length - 1].querySelector<HTMLButtonElement>('button[aria-label="关闭详情"]');
            closeBtn?.focus();
            expect(document.activeElement).toBe(closeBtn);
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(btn.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(btn);
        }
    });

    it('空态下桌面不显「无」与空印，且手机空态环境/节日详情不受桌面影响', () => {
        const { container } = render(
            <TopBar
                环境={makeEnv({
                    时间: '0001:01:04:15:48',
                    环境变量: [],
                })}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="传统"
                festivals={[springFestival]}
            />
        );

        const desktopGrid = container.querySelector('.desktop-topbar-grid') as HTMLElement;
        expect(desktopGrid).not.toBeNull();
        expect(desktopGrid.textContent).not.toContain('无');
        expect(desktopGrid.textContent).not.toContain('平常日');
        expect(desktopGrid.querySelector('.topbar-env-pill')).toBeNull();
        expect(desktopGrid.querySelector('.topbar-festival-seal')).toBeNull();
        expect(desktopGrid.textContent).toContain('申时 · 三刻');
        expect(desktopGrid.textContent).toContain('第 4 天');

        // Mobile branch empty state buttons still open and stay open
        const mobileEnvBtn = screen.getByRole('button', { name: '环境' });
        fireEvent.click(mobileEnvBtn);
        expect(screen.getByText('风平浪静，并无特殊环境。')).toBeTruthy();

        const mobileFestBtn = screen.getByRole('button', { name: '节日' });
        fireEvent.click(mobileFestBtn);
        expect(screen.getByText('平常日')).toBeTruthy();

        const mobileLocBtn = screen.getByRole('button', { name: '地点' });
        fireEvent.click(mobileLocBtn);
        const mobileLocCard = screen.getByRole('region', { name: '当前地点' });
        expect(mobileLocCard.querySelector('.desktop-topbar-card-summary')).toBeNull();
    });

    it('鼠标悬停面板按 Escape 不抢夺外部输入框焦点；大面板打开时自动聚焦并可 Escape 收起', () => {
        render(
            <div>
                <TopBar
                    环境={makeEnv()}
                    游戏初始时间="0001:01:01:08:00"
                    timeFormat="传统"
                    festivals={[springFestival]}
                />
                <textarea aria-label="行动输入" />
            </div>
        );

        const input = screen.getByLabelText('行动输入');
        input.focus();
        expect(document.activeElement).toBe(input);

        const weatherBtn = screen.getByRole('button', { name: '天气：晴' });
        fireEvent.mouseEnter(weatherBtn.parentElement as HTMLElement);
        expect(screen.getByRole('region', { name: '天象变更' })).toBeTruthy();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('region', { name: '天象变更' })).toBeNull();
        expect(document.activeElement).toBe(input);

        // Open fullscreen detail modal via keyboard click on 展开
        weatherBtn.focus();
        fireEvent.click(weatherBtn);
        fireEvent.click(screen.getByRole('button', { name: '展开详情' }));
        const dialog = screen.getByRole('dialog', { name: '天象变更' });
        const collapseBtn = screen.getByRole('button', { name: '收起' });
        expect(dialog).toBeTruthy();
        expect(document.activeElement).toBe(collapseBtn);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: '天象变更' })).toBeNull();
    });

    it('支持数字时间、日期全屏切换与自定义顶栏字号/字体缩放', () => {
        const reqFs = vi.fn(async () => {});
        Object.defineProperty(document.documentElement, 'requestFullscreen', {
            configurable: true,
            value: reqFs,
        });

        const customVisual = {
            区域文字样式: {
                顶部栏: {
                    启用自定义: true,
                    字体ID: 'system-kai',
                    字体颜色: '#f1d778',
                    字号: 18,
                    行高: 1.35,
                    字形: 'normal',
                },
            },
        } as unknown as 视觉设置结构;

        const { container } = render(
            <TopBar
                环境={makeEnv()}
                游戏初始时间="0001:01:01:08:00"
                timeFormat="数字"
                festivals={[springFestival]}
                visualConfig={customVisual}
            />
        );

        const desktopGrid = container.querySelector('.desktop-topbar-grid') as HTMLElement;
        expect(desktopGrid.classList.contains('desktop-topbar-grid--custom')).toBe(true);
        expect(desktopGrid.style.getPropertyValue('--topbar-scale')).toBe('1.2');

        const dateBtn = screen.getByRole('button', { name: /1年01月01日 12:00/ });
        expect(dateBtn.textContent).toContain('12:00');
        fireEvent.click(dateBtn);
        expect(reqFs).toHaveBeenCalledTimes(1);
    });
});
