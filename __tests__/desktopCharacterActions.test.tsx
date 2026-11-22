// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InputArea from '../components/features/Chat/InputArea';
import LeftPanel from '../components/layout/LeftPanel';
import StatDelta from '../components/layout/StatDelta';
import { 获取题材资源文案 } from '../utils/resourceLabels';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const inputProps = () => ({
    onSend: vi.fn(async () => ({})),
    onStop: vi.fn(),
    onRegenerate: vi.fn(() => '回档草稿'),
    loading: false,
    options: ['问掌柜', '去渡口'],
});

describe('桌面行动区', () => {
    it.each([
        ['', '问掌柜'],
        ['先落座', '先落座；问掌柜'],
        ['先落座。', '先落座。 问掌柜'],
        ['先落座，', '先落座， 问掌柜'],
    ])('建议按原标点追加到草稿 %j，点击不发送', (draft, expected) => {
        const props = inputProps();
        render(<InputArea {...props} />);
        const input = screen.getAllByRole('textbox')[1] as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: draft } });
        fireEvent.click(screen.getByRole('button', { name: '问掌柜' }));
        expect(input.value).toBe(expected);
        expect(props.onSend).not.toHaveBeenCalled();
    });

    it('流式开关、Shift+Enter 与 Enter 发送沿用原处理', async () => {
        const props = inputProps();
        render(<InputArea {...props} />);
        const input = screen.getAllByRole('textbox')[1];
        expect((screen.getByTitle('发送') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByTitle('流式传输开启'));
        fireEvent.change(input, { target: { value: '一行' } });
        expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
        expect(props.onSend).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: '一行\n二行' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''));
        expect(props.onSend).toHaveBeenCalledWith('一行\n二行', false, expect.any(Object));
    });

    it('角色对话、回档、快速重开和变量错误详情保持可用', async () => {
        const props = { ...inputProps(), onOpenRoleChat: vi.fn(), onQuickRestart: vi.fn(),
            requestConfirm: vi.fn(async () => true), onRetryLatestVariableGeneration: vi.fn(() => '夹具变量错误') };
        render(<InputArea {...props} canQuickRestart canRetryLatestVariableGeneration />);
        fireEvent.click(screen.getByTitle(/角色对话/));
        expect(props.onOpenRoleChat).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByTitle(/重ROLL：/));
        await waitFor(() => expect((screen.getAllByRole('textbox')[1] as HTMLTextAreaElement).value).toBe('回档草稿'));
        fireEvent.click(screen.getByTitle('快速重开'));
        fireEvent.click(screen.getByText('仅重生开局剧情'));
        await waitFor(() => expect(props.onQuickRestart).toHaveBeenCalledWith('opening_only'));
        fireEvent.click(screen.getByTitle('基于当前正文继续变量生成'));
        expect(await screen.findByRole('heading', { name: '继续变量生成失败' })).toBeTruthy();
        expect(screen.getAllByText(/夹具变量错误/).length).toBeGreaterThan(0);
    });

    it('队列收起时仍报告运行中、失败阶段并允许强制终止', () => {
        const props = inputProps();
        render(<InputArea {...props} postStoryQueueRunning
            openingVariableGenerationProgress={{ phase: 'error', text: '夹具错误' }}
            openingWorldEvolutionProgress={{ phase: 'stream', text: '夹具进度' }} />);
        const summary = screen.getByTitle('展开独立更新阶段队列');
        expect(summary.textContent).toContain('开局动态世界运行中');
        expect(summary.textContent).toContain('开局变量生成失败');
        fireEvent.click(screen.getByTitle('强制终止AI推演'));
        expect(props.onStop).toHaveBeenCalledOnce();
    });

    it('生成中禁用输入与建议，保留停止和变量取消入口', () => {
        const props = { ...inputProps(), onCancelVariableGeneration: vi.fn() };
        const { rerender } = render(<InputArea {...props} loading />);
        expect((screen.getAllByRole('textbox')[1] as HTMLTextAreaElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: '问掌柜' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByTitle('停止生成'));
        expect(props.onStop).toHaveBeenCalledOnce();
        rerender(<InputArea {...props} variableGenerationRunning />);
        fireEvent.click(screen.getByTitle('取消变量生成'));
        expect(props.onCancelVariableGeneration).toHaveBeenCalledOnce();
    });
});

it('空头像的姓氏章直接打开上传，取消后不提交', () => {
    const upload = vi.fn();
    const { container } = render(<LeftPanel 角色={{ 姓名: '上官晴' } as any} onUploadAvatar={upload} />);
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
    const picker = vi.spyOn(input, 'click');
    const seal = screen.getByRole('button', { name: '上传角色头像' });
    expect(seal.textContent).toBe('上官');
    fireEvent.click(seal);
    expect(picker).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [] } });
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
});

it('角色栏头像失败显示复姓，保留换图、档案、变量、题材资源和系统开关', async () => {
    const props = {
        角色: { 姓名: '上官晴', 称号: '行客', 境界: '筑基', 头像图片URL: '/fixture-avatar.png', 当前精力: 18,
            最大精力: 30, 当前内力: 20, 最大内力: 50, 物品列表: [], 装备: {}, 金钱: {},
            玩家BUFF: [{ 索引: 1, 名称: '凝神', 效果: '提升专注', 结束时间: '午时' }] } as any,
        openingConfig: { 题材模式: '仙侠' } as any,
        latestCommands: [{ action: 'sub', key: '角色.当前精力', value: 2 }],
        onOpenCharacter: vi.fn(), onOpenVariableManager: vi.fn(), onUploadAvatar: vi.fn(),
    };
    const { container, rerender } = render(<LeftPanel {...props} />);
    const labels = 获取题材资源文案('仙侠');
    expect(screen.getByText(labels.能量)).toBeTruthy();
    expect(screen.getByText('-2')).toBeTruthy();
    expect(screen.getByText('凝神')).toBeTruthy();
    const thumbnail = screen.getByAltText('上官晴头像');
    fireEvent.load(thumbnail);
    expect(screen.getByRole('button', { name: '查看完整头像' }).getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.error(thumbnail);
    expect(screen.getByLabelText('上传角色头像').textContent).toBe('上官');
    fireEvent.change(container.querySelector('input[type=file]')!, {
        target: { files: [new File(['fixture'], 'avatar.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(props.onUploadAvatar).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)));
    fireEvent.click(screen.getByRole('button', { name: '上官晴' }));
    fireEvent.click(screen.getByRole('button', { name: '变量管理' }));
    expect(props.onOpenCharacter).toHaveBeenCalledOnce();
    expect(props.onOpenVariableManager).toHaveBeenCalledOnce();
    rerender(<LeftPanel {...props} gameConfig={{ 启用修炼体系: false, 启用饱腹口渴系统: false } as any} />);
    for (const label of [labels.能量, '饱腹', '水分', '筑基']) expect(screen.queryByText(label)).toBeNull();
});

describe('江湖手记', () => {
    const parts = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'];
    const healthy = Object.fromEntries(parts.flatMap(part => [
        [part + '当前血量', 32], [part + '最大血量', 32],
    ]));
    const open = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

    it('损伤跟随实时气血和实际上限，缺值不推断，恢复后清除对应标记', () => {
        const character = { ...healthy, 左手当前血量: 0, 右腿当前血量: '17', 右腿最大血量: 75,
            胸部当前血量: null, 胸部状态: '重伤', 腹部最大血量: 0, 头部最大血量: '', 左腿最大血量: Infinity };
        const { container, rerender } = render(<LeftPanel 角色={character as any} />);
        open('身躯');
        const markers = () => [...container.querySelectorAll('.journal-wound')].map(el => el.parentElement?.getAttribute('data-part'));
        expect(markers()).toEqual(['左手', '右腿']);
        const injuries = container.querySelector('.journal-caption + dl')!;
        expect(injuries.textContent).toContain('左手0 / 32');
        expect(injuries.textContent).toContain('右腿17 / 75');
        const x = (name: string) => Number(container.querySelector(`[data-part="${name}"]`)!.getAttribute('transform')!.match(/translate\((\d+)/)![1]);
        expect(x('左手')).toBeGreaterThan(x('右手'));
        expect(x('左腿')).toBeGreaterThan(x('右腿'));
        expect(container.querySelector('.journal-figure')?.textContent).not.toMatch(/\d/);
        rerender(<LeftPanel 角色={{ ...character, 左手当前血量: 32 } as any} />);
        expect(markers()).toEqual(['右腿']);
        rerender(<LeftPanel 角色={{ ...character, 左手当前血量: 32, 右腿当前血量: 75 } as any} />);
        expect(markers()).toEqual([]);
        expect(screen.getByText('部位气血待确认')).toBeTruthy();
        rerender(<LeftPanel 角色={healthy as any} />);
        expect(screen.getByText('各部位完好')).toBeTruthy();
    });

    it('已知伤势优先，未确认的状态按 85% 判断，恢复到正常区间即清除', () => {
        const character = { ...healthy, 头部当前血量: 18, 头部最大血量: 20, 头部状态: '正常',
            胸部当前血量: 36, 胸部最大血量: 45, 胸部状态: '正常',
            左手当前血量: 18, 左手最大血量: 20, 左手状态: ' 轻伤 ',
            右腿当前血量: 14, 右腿最大血量: 20, 右腿状态: '夹具备注',
            右手当前血量: 17, 右手最大血量: 20, 右手状态: '重伤已愈' };
        const { container, rerender } = render(<LeftPanel 角色={character as any} />);
        open('身躯');
        const injuries = () => [...container.querySelectorAll('.journal-wound')].map(el => el.parentElement?.getAttribute('data-part'));
        expect(injuries()).toEqual(['胸部', '左手', '右腿']);
        const details = container.querySelector('.journal-details dl')!;
        expect(details.textContent).toContain('头部正常18 / 20');
        expect(details.textContent).toContain('右手正常17 / 20');
        expect(details.textContent).toContain('胸部轻伤36 / 45');
        rerender(<LeftPanel 角色={{ ...character, 胸部当前血量: 40, 左手状态: '正常', 右腿当前血量: 17 } as any} />);
        expect(injuries()).toEqual([]);
        expect(screen.getByText('各部位完好')).toBeTruthy();
    });

    it('已穿戴按物品 ID 或名称显示，兼容空位、旧装备名及盔甲内衬', () => {
        const character = { 装备: { 头部: '无', 胸部: ' ', 盔甲: 'armor-1', 内衬: '旧布里衣', 腰部: '玉佩' },
            物品列表: [{ ID: 'armor-1', 名称: '细鳞软甲' }, { ID: 'belt-1', 名称: '玉佩' }] };
        const { container, rerender } = render(<LeftPanel 角色={character as any} />);
        open('行头');
        expect([...container.querySelectorAll('.journal-outfit dd')].map(el => el.textContent))
            .toEqual(['细鳞软甲', '旧布里衣', '玉佩']);
        expect(container.querySelectorAll('.journal-details dt')).toHaveLength(13);
        rerender(<LeftPanel 角色={{} as any} />);
        expect(screen.getByText('暂无穿戴')).toBeTruthy();
        expect(screen.getAllByText('空位')).toHaveLength(13);
    });

    it('数值变化提示在超时后自动清除，读数变为无效值时立即清除旧提示', () => {
        vi.useFakeTimers();
        try {
            const { rerender, container } = render(<StatDelta current={20} />);
            expect(container.textContent).toBe('');
            rerender(<StatDelta current={18} />);
            expect(container.textContent).toBe('-2');
            rerender(<StatDelta current={undefined} />);
            expect(container.textContent).toBe('');

            rerender(<StatDelta current={10} />);
            expect(container.textContent).toBe('');
            rerender(<StatDelta current={15} />);
            expect(container.textContent).toBe('+5');
            vi.advanceTimersByTime(2600);
            rerender(<StatDelta current={15} />);
            expect(container.textContent).toBe('');
        } finally {
            vi.useRealTimers();
        }
    });
});
