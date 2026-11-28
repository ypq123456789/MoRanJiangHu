// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { parseStoryRawText } from '../services/ai/storyResponseParser';
import { 执行响应命令处理, 响应命令处理状态 } from '../hooks/useGame/responseCommandProcessor';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import SocialModal from '../components/features/Social/SocialModal';
import MobileSocial from '../components/features/Social/MobileSocial';

describe.each([['桌面', SocialModal], ['手机', MobileSocial]] as const)('%s局外人物详情', (_, Panel) => {
    it('日间模式隐藏真实姓名，已故角色不能召回，存活角色可以', () => {
        const priorTheme = document.documentElement.dataset.theme;
        document.documentElement.dataset.theme = 'day';
        const npc = { id: 'witness', 姓名: '李青', 叙事名称: '白衣客', 来源: '正文提及', 关系状态: '已闻其名', 是否在场: false };
        const onTogglePresence = vi.fn();
        const props = { onClose: vi.fn(), onTogglePresence, selectedNpcId: npc.id };
        const view = render(<Panel socialList={[{ ...npc, 状态: '死亡' }] as any} {...props} />);
        try {
            const detail = view.getByRole('region', { name: '已知人物线索' });
            const title = within(detail).getByRole('heading');
            expect(title.querySelector('[data-narrative-name]')?.textContent).toBe('白衣客');
            expect(title.querySelector('.npc-real-name-mosaic')).not.toBeNull();
            fireEvent.click(title.querySelector('[data-real-name-toggle]')!);
            expect(title.querySelector('[data-real-name]')?.textContent).toBe('李青');
            expect(within(detail).queryByRole('button', { name: '设为在场' })).toBeNull();
            view.rerender(<Panel socialList={[npc] as any} {...props} />);
            fireEvent.click(within(detail).getByRole('button', { name: '设为在场' }));
            expect(onTogglePresence).toHaveBeenCalledWith(npc.id, true);
        } finally {
            cleanup();
            if (priorTheme === undefined) delete document.documentElement.dataset.theme;
            else document.documentElement.dataset.theme = priorTheme;
        }
    });
});

const 构建基础状态 = (): 响应命令处理状态 => ({
    角色: { 姓名: '杨培强' } as any,
    环境: {} as any,
    社交: [],
    世界: {} as any,
    战斗: {} as any,
    玩家门派: {} as any,
    任务列表: [],
    约定列表: [],
    剧情: {} as any,
    剧情规划: {} as any
});

const deps = {
    规范化环境信息: (value?: any) => value || {},
    规范化社交列表,
    规范化世界状态: (value?: any) => value || {},
    规范化战斗状态: (value?: any) => value || {},
    规范化门派状态: (value?: any) => value || {},
    规范化剧情状态: (value?: any) => value || {},
    规范化剧情规划状态: (value?: any) => value || {},
    规范化女主剧情规划状态: (value?: any) => value,
    规范化同人剧情规划状态: (value?: any) => value,
    规范化同人女主剧情规划状态: (value?: any) => value,
    规范化角色物品容器映射: (value?: any) => value || {},
    战斗结束自动清空: (value?: any) => value || {}
};

const 完整新女性NPC = (姓名: string, 是否主要角色 = true) => ({
    id: 'NPC001',
    姓名,
    性别: '女',
    年龄: 22,
    身份: '客栈掌柜之女',
    境界: '凡人',
    简介: '眉眼清冷，掌事客栈账目。',
    是否主要角色,
    是否在场: true,
    好感度: 10,
    关系状态: '初识',
    关系网变量: [
        { 对象姓名: '杨培强', 关系: '主顾', 备注: '常来投宿' },
        { 对象姓名: '沈万三', 关系: '父女', 备注: '继承客栈' }
    ],
    天赋列表: [{ 名称: '精打细算', 描述: '账目过目不忘', 效果: '经商判定+10' }],
    出身背景: { 名称: '商户之女', 描述: '自幼随父经营客栈', 效果: '经商初始等级提升' },
    记忆: [{ 内容: '接待过主角投宿', 时间: '2026:01:01:08:00' }]
});

describe('新角色进关系网链路（玩家反馈修复回归）', () => {
    describe('数据层：新增社交命令的落地依据', () => {
        it('正文提到真名 → 入库且保留关系网变量', () => {
            const npc = 完整新女性NPC('沈青娥');
            const response = parseStoryRawText(
                `<正文>\n沈青娥拨着算盘，抬眼看向进门的杨培强。\n</正文>\n<命令>\npush 社交 = ${JSON.stringify(npc)}\n</命令>`
            );
            const state = 执行响应命令处理(response, 构建基础状态(), deps, undefined, { applyState: false });
            expect(state.社交).toHaveLength(1);
            expect(state.社交[0].关系网变量).toHaveLength(2);
        });

        it('正文只用代称、真名落在变量规划 → 入库且保留关系网变量（修复点）', () => {
            const npc = 完整新女性NPC('沈青娥');
            const response: any = parseStoryRawText(
                `<正文>\n那青衣女子拨着算盘，抬眼看向进门的杨培强。\n</正文>\n<变量规划>\n社交：新增客栈掌柜之女沈青娥，与主角初识，关系网变量两条。\n</变量规划>\n<命令>\npush 社交 = ${JSON.stringify(npc)}\n</命令>`
            );
            const state = 执行响应命令处理(response, 构建基础状态(), deps, undefined, { applyState: false });
            expect(state.社交).toHaveLength(1);
            expect(state.社交[0].姓名).toBe('沈青娥');
            expect(state.社交[0].关系网变量).toHaveLength(2);
        });

        it('真名在正文与变量规划中都无处出现 → 仍然拒绝（防幻觉不放松）', () => {
            const npc = 完整新女性NPC('沈青娥');
            const response: any = parseStoryRawText(
                `<正文>\n那青衣女子拨着算盘，抬眼看向进门的杨培强。\n</正文>\n<变量规划>\n社交：新增一位客栈女掌柜，与主角初识。\n</变量规划>\n<命令>\npush 社交 = ${JSON.stringify(npc)}\n</命令>`
            );
            const state = 执行响应命令处理(response, 构建基础状态(), deps, undefined, { applyState: false });
            expect(state.社交).toHaveLength(0);
        });
    });

    describe('UI 层：关系网面板可见性', () => {
        const 渲染并查找关系网 = (npc: any) => {
            const social = 规范化社交列表([npc]);
            render(
                <SocialModal
                    socialList={social as any}
                    onClose={vi.fn()}
                    playerName="杨培强"
                />
            );
            return social[0];
        };

        it('非主要角色的女性带关系网变量 → 关系网面板可见（修复点）', () => {
            const npc = 完整新女性NPC('沈青娥', false);
            渲染并查找关系网(npc);
            expect(screen.getByText('关系网变量')).toBeTruthy();
            expect(screen.getByText('杨培强')).toBeTruthy();
            expect(screen.getByText('主顾')).toBeTruthy();
            expect(screen.getByText('沈万三')).toBeTruthy();
            cleanup();
        });

        it('主要角色女性 → 关系网面板与关系驱动字段同时可见（原行为保持）', () => {
            const npc = { ...完整新女性NPC('沈青娥', true), 核心性格特征: '外冷内热', 好感度突破条件: '三次解围', 关系突破条件: '共历生死' };
            渲染并查找关系网(npc);
            expect(screen.getByText('关系网变量')).toBeTruthy();
            expect(screen.getByText('核心性格特征')).toBeTruthy();
            expect(screen.getByText('外冷内热')).toBeTruthy();
            cleanup();
        });

        it('没有关系网变量数据的普通 NPC → 不渲染关系网面板', () => {
            const npc = { ...完整新女性NPC('沈青娥', false) };
            delete (npc as any).关系网变量;
            渲染并查找关系网(npc);
            expect(screen.queryByText('关系网变量')).toBeNull();
            cleanup();
        });
    });
});
