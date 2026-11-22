// @vitest-environment jsdom
//
// 设置页左侧导航分组折叠的行为测试。
//
// 覆盖三件事（对应 PR #127 的设计与修复）：
// 1. 默认五组全收，首屏只看得到五个组标题；
// 2. 点组标题是手风琴式：只展开这一组，其余收起；
// 3. 二级抽屉「各环节独立模型」的折叠状态独立于分组切换——切换分组不能把
//    抽屉的折叠键从 localStorage 里抹掉（否则一展开模型组就把 12 项铺开）。
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SettingsModal from '../components/features/Settings/SettingsModal';
import { 设置导航分组, 默认收起组, 折叠存储键, 展平设置项 } from '../components/features/Settings/settingsNav';

const 构造Props = (activeTab: string) => ({
    activeTab: activeTab as any,
    onTabChange: vi.fn(),
    onClose: vi.fn(),
    apiConfig: {} as any,
    visualConfig: {} as any,
    gameConfig: { 启用研发诊断模式: false } as any,
    memoryConfig: {} as any,
    prompts: [],
    festivals: [],
    currentTheme: 'default' as any,
    history: [],
    socialList: [],
    runtimeState: {} as any,
    onSaveApi: vi.fn(),
    onSaveVisual: vi.fn(),
    onSaveGame: vi.fn(),
    onSaveMemory: vi.fn(),
    onDeleteMemory: vi.fn(),
    onCreateNpc: vi.fn(),
    onSaveNpc: vi.fn(),
    onDeleteNpc: vi.fn(),
    onUploadNpcImage: vi.fn(),
    onReplaceVariableSection: vi.fn(),
    onApplyVariableCommand: vi.fn(),
    onUpdatePrompts: vi.fn(),
    onUpdateFestivals: vi.fn(),
    onThemeChange: vi.fn(),
});

// 侧栏项与手机端胶囊按钮文案相同，只能靠样式类区分：桌面端项行带 border-l-[3px]。
const 侧栏项 = (name: string | RegExp) =>
    screen.queryAllByRole('button', { name }).filter((el) => (el.className || '').includes('border-l-[3px]'));

// 二级抽屉按钮是另一种样式（无左侧竖条），单独查
const 抽屉 = () => screen.queryAllByRole('button', { name: /各环节独立模型/ });

const 读折叠状态 = (): string[] => JSON.parse(window.localStorage.getItem(折叠存储键) || '[]');

describe('设置页左侧导航分组', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });
    afterEach(() => {
        cleanup();
        window.localStorage.clear();
    });

    it('分组数据包含全部 30 项且无重复，默认全收', () => {
        const 全部 = 展平设置项();
        expect(全部).toHaveLength(30);
        expect(new Set(全部.map((项) => 项.id)).size).toBe(30);
        expect(设置导航分组).toHaveLength(5);
        // 默认状态：五组 + 一个抽屉，全部在「收起」列表里
        expect(默认收起组()).toEqual(expect.arrayContaining(设置导航分组.map((组) => 组.id)));
        expect(默认收起组()).toContain('model:sub');
    });

    it('默认五组全收：首屏只有组标题，看不到任何设置项', () => {
        render(<SettingsModal {...构造Props('context')} />);
        for (const 组 of 设置导航分组) {
            expect(screen.getByRole('button', { name: new RegExp(组.title) })).toBeTruthy();
        }
        // 五组都收着，任何一级/二级设置项都不渲染
        expect(侧栏项('接口连接')).toHaveLength(0);
        expect(侧栏项('游戏设定')).toHaveLength(0);
        expect(抽屉()).toHaveLength(0);
    });

    it('点心风琴：展开一组时其余组收起，抽屉默认仍是收起的', () => {
        render(<SettingsModal {...构造Props('context')} />);
        fireEvent.click(screen.getByRole('button', { name: /模型与接口/ }));
        expect(侧栏项('接口连接')).toHaveLength(1);
        expect(侧栏项('生成流程图')).toHaveLength(1);
        // 关键：只有 3 个一级项，12 个模型入口不能跟着铺开
        expect(抽屉()).toHaveLength(1);
        expect(侧栏项('剧情回忆')).toHaveLength(0);

        // 切到另一组：模型组收起
        fireEvent.click(screen.getByRole('button', { name: /玩法与规则/ }));
        expect(侧栏项('游戏设定')).toHaveLength(1);
        expect(侧栏项('接口连接')).toHaveLength(0);
    });

    it('切换分组不会抹掉抽屉的折叠键（PR #127 第二个提交修复的回归点）', () => {
        render(<SettingsModal {...构造Props('context')} />);
        // 展开模型组 → 手动展开抽屉
        fireEvent.click(screen.getByRole('button', { name: /模型与接口/ }));
        fireEvent.click(screen.getByRole('button', { name: /各环节独立模型/ }));
        expect(侧栏项('剧情回忆')).toHaveLength(1);
        expect(读折叠状态()).not.toContain('model:sub');

        // 切到别的组再切回来：抽屉应保持「已展开」
        fireEvent.click(screen.getByRole('button', { name: /玩法与规则/ }));
        fireEvent.click(screen.getByRole('button', { name: /模型与接口/ }));
        expect(侧栏项('剧情回忆')).toHaveLength(1);

        // 手动收起抽屉后再切组：收起状态不能被切组重置
        fireEvent.click(screen.getByRole('button', { name: /各环节独立模型/ }));
        expect(侧栏项('剧情回忆')).toHaveLength(0);
        expect(读折叠状态()).toContain('model:sub');
        fireEvent.click(screen.getByRole('button', { name: /玩法与规则/ }));
        fireEvent.click(screen.getByRole('button', { name: /模型与接口/ }));
        expect(侧栏项('剧情回忆')).toHaveLength(0);
        expect(读折叠状态()).toContain('model:sub');
    });

    it('当前页所在组不会被收起，避免当前页被藏起来', () => {
        render(<SettingsModal {...构造Props('context')} />);
        // activeTab = context，属于「数据与排查」
        const 组标题 = screen.getByRole('button', { name: /数据与排查/ });
        fireEvent.click(组标题);
        expect(侧栏项('上下文')).toHaveLength(1);
        // 再点一次：不允许把它收起来
        fireEvent.click(screen.getByRole('button', { name: /数据与排查/ }));
        expect(侧栏项('上下文')).toHaveLength(1);
        // 但它可以把别的组收起来
        fireEvent.click(screen.getByRole('button', { name: /玩法与规则/ }));
        expect(侧栏项('游戏设定')).toHaveLength(1);
        expect(侧栏项('上下文')).toHaveLength(0);
    });

    it('折叠状态写入 localStorage，重新挂载后保持', () => {
        const 第一次 = render(<SettingsModal {...构造Props('context')} />);
        fireEvent.click(screen.getByRole('button', { name: /界面与声音/ }));
        expect(侧栏项('视觉显示')).toHaveLength(1);
        第一次.unmount();

        render(<SettingsModal {...构造Props('context')} />);
        // 重新打开：界面与声音仍是展开的
        expect(侧栏项('视觉显示')).toHaveLength(1);
        expect(侧栏项('游戏设定')).toHaveLength(0);
    });

    it('localStorage 里存了认不出的键时退回默认全收，而不是放过脏数据', () => {
        window.localStorage.setItem(折叠存储键, JSON.stringify(['play', '不存在的键']));
        render(<SettingsModal {...构造Props('context')} />);
        // 回退为全收：什么都不展开
        expect(侧栏项('游戏设定')).toHaveLength(0);
        expect(侧栏项('接口连接')).toHaveLength(0);
    });

    it('组编号与所有设置项和抽屉编号分开', () => {
        const 独立组 = new Set(设置导航分组.map((组) => 组.id));
        expect(独立组.size).toBe(5);
        expect(展平设置项().some((项) => 独立组.has(项.id))).toBe(false);
        expect(设置导航分组.some((组) => 组.sub && 独立组.has(组.sub.id))).toBe(false);
    });

    it.each([true, false])('升级后保留 706 已打开的模型组及抽屉状态（抽屉收起=%s）', (收起抽屉) => {
        const 旧状态 = ['play', 'world', 'look', 'data', ...(收起抽屉 ? ['model:sub'] : [])];
        window.localStorage.setItem(折叠存储键, JSON.stringify(旧状态));
        render(<SettingsModal {...构造Props('context')} />);
        expect(侧栏项('接口连接')).toHaveLength(1);
        expect(侧栏项('剧情回忆')).toHaveLength(收起抽屉 ? 0 : 1);
        fireEvent.click(screen.getByRole('button', { name: /玩法与规则/ }));
        expect(读折叠状态()).toEqual([
            'group:world', 'group:model', 'group:look', 'group:data', ...(收起抽屉 ? ['model:sub'] : []),
        ]);
    });

    it('保留 706 五组全收时已展开的抽屉记忆', () => {
        window.localStorage.setItem(折叠存储键, JSON.stringify(['play', 'world', 'model', 'look', 'data']));
        render(<SettingsModal {...构造Props('context')} />);
        expect(侧栏项('接口连接')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: /模型与接口/ }));
        expect(侧栏项('剧情回忆')).toHaveLength(1);
    });

    it.each([
        [[]], [['play', 'world']], [['group:play', 'group:world']],
        [['play', 'play', 'world', 'look', 'data']],
        [['play', 'group:play', 'world', 'look', 'data']],
    ])('异常记录恢复为五组全收：%j', (记录) => {
        window.localStorage.setItem(折叠存储键, JSON.stringify(记录));
        render(<SettingsModal {...构造Props('context')} />);
        for (const 组 of 设置导航分组) {
            expect(screen.getByRole('button', { name: new RegExp(组.title) }).getAttribute('aria-expanded')).toBe('false');
        }
    });

    it('研发诊断关闭时不显示「互动历史」，并给出说明文字', () => {
        render(<SettingsModal {...构造Props('context')} />);
        fireEvent.click(screen.getByRole('button', { name: /数据与排查/ }));
        expect(侧栏项('互动历史')).toHaveLength(0);
        expect(screen.getByText('互动历史仅研发模式显示')).toBeTruthy();
        expect(侧栏项('上下文')).toHaveLength(1);
    });
});
