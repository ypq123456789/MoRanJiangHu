// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VariableManager from '../components/features/Settings/VariableManager';

afterEach(() => cleanup());

const 构建运行时状态 = () => ({
    角色: {
        姓名: '陆凡',
        性别: '男',
        称号: '少侠',
        金钱: {},
        装备: {},
        物品列表: []
    },
    环境: { 时间: '1:01:01:08:00', 大地点: '青云州' },
    社交: [],
    世界: { 地图层级: [] },
    地图系统: {},
    战斗: {},
    剧情: {},
    剧情规划: {},
    女主剧情规划: {},
    玩家门派: {},
    任务列表: [],
    约定列表: [],
    记忆系统: {}
} as any);

const 渲染变量管理 = (onReplaceSection = vi.fn()) => {
    render(<VariableManager runtimeState={构建运行时状态()} onReplaceSection={onReplaceSection} onApplyCommand={vi.fn()} />);
    return onReplaceSection;
};

describe('变量管理 · 主角姓名快捷修改', () => {
    it('只提交姓名，不夹带其他字段', () => {
        const onReplaceSection = 渲染变量管理();
        const input = screen.getByPlaceholderText('输入主角姓名') as HTMLInputElement;
        expect(input.value).toBe('陆凡');

        fireEvent.change(input, { target: { value: '沈青崖' } });
        fireEvent.click(screen.getByRole('button', { name: '保存姓名' }));

        expect(onReplaceSection).toHaveBeenCalledTimes(1);
        const [section, payload] = onReplaceSection.mock.calls[0];
        expect(section).toBe('角色');
        expect(payload.姓名).toBe('沈青崖');
        // 其余字段来自运行时角色，结构树里没有未保存修改时不应丢字段
        expect(payload.称号).toBe('少侠');
    });

    it('结构树有未保存修改时先提示，不写入状态', () => {
        const onReplaceSection = 渲染变量管理();
        const titleInput = screen.getAllByDisplayValue('少侠').find(el => el.tagName === 'INPUT') as HTMLInputElement;
        expect(titleInput).toBeTruthy();
        fireEvent.change(titleInput, { target: { value: '大侠' } });

        const nameInput = screen.getByPlaceholderText('输入主角姓名');
        fireEvent.change(nameInput, { target: { value: '沈青崖' } });
        fireEvent.click(screen.getByRole('button', { name: '保存姓名' }));

        expect(onReplaceSection).not.toHaveBeenCalled();
        expect(screen.getByText(/角色分区还有未保存的修改/)).toBeTruthy();
    });

    it('原始 JSON 草稿未保存时先提示，不覆盖草稿', () => {
        const onReplaceSection = 渲染变量管理();
        // 原始 JSON 草稿是页面中唯一包含完整角色 JSON 的多行 textarea
        const jsonDraft = (Array.from(document.querySelectorAll('textarea')) as HTMLTextAreaElement[])
            .find(item => item.value.includes('"姓名": "陆凡"'));
        expect(jsonDraft).toBeTruthy();
        fireEvent.change(jsonDraft!, { target: { value: '{"姓名":"手改"}' } });

        const nameInput = screen.getByPlaceholderText('输入主角姓名');
        fireEvent.change(nameInput, { target: { value: '沈青崖' } });
        fireEvent.click(screen.getByRole('button', { name: '保存姓名' }));

        expect(onReplaceSection).not.toHaveBeenCalled();
        expect(screen.getByText(/原始 JSON 草稿还有未保存的修改/)).toBeTruthy();
        expect(jsonDraft!.value).toBe('{"姓名":"手改"}');
    });
});
