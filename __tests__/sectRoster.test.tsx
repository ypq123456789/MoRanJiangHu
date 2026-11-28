// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SectModal from '../components/features/Sect/SectModal';
import MobileSect from '../components/features/Sect/MobileSect';
import { 规范化门派状态, 同步角色与门派状态 } from '../hooks/useGame/storyState';
import { 查找记录对应NPC } from '../utils/npcNarrativeName';
import { 提取人物头像地址 } from '../utils/personAvatar';

afterEach(cleanup);

it('打开记录优先精确匹配所有人物，再回退到旧档的模糊文本', () => {
    const npcs = [{ id: 'npc_1', 姓名: '林风' }, { id: 'npc_10', 姓名: '林风远' }];
    expect(查找记录对应NPC(['npc_10'], npcs)).toBe(npcs[1]);
    expect(查找记录对应NPC(['林风远'], npcs)).toBe(npcs[1]);
    expect(查找记录对应NPC(['旧档人物：林风'], npcs)).toBe(npcs[0]);
});

describe.each([['桌面', SectModal], ['手机', MobileSect]] as const)('%s同门名录', (_, Component) => {
    it('只有主角时说明已知成员登记范围', () => {
        const sect = 同步角色与门派状态({
            角色: { 姓名: '杨培强', 所属门派ID: 'sect001', 门派职位: '杂役弟子' },
            玩家门派: 规范化门派状态({ ID: 'sect001', 名称: '青崖真宫', 玩家职位: '杂役弟子', 弟子总数: 150 })
        }).玩家门派;
        render(<Component sectData={sect} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /同门名录|^同门$|^成员$/ }));
        expect(screen.getByText('名录只收录已知成员，目前仅登记了主角。')).toBeTruthy();
    });
    it('没有导演存档也保留世界势力已公开的具名领袖和核心成员', () => {
        const sect = 规范化门派状态({ ID: 'sect001', 名称: '青崖真宫', 玩家职位: '杂役弟子' });
        render(<Component sectData={sect} onClose={() => {}} world={{ 势力列表: [
            { ID: 'F-1', 名称: '青崖真宫', 描述: '领袖：Mira Vale；驻守山门。', 代表性物品风格: '核心成员：俞月荷、Mira Vale' }
        ] } as any} />);
        fireEvent.click(screen.getByRole('button', { name: /同门名录|^同门$|^成员$/ }));
        expect(screen.getAllByText('Mira Vale')).toHaveLength(1);
        expect(screen.getByText('俞月荷')).toBeTruthy();
    });
    it('同门使用叙事称呼时仍显示社交档案的头像', () => {
        const sect = 规范化门派状态({ ID: 'sect001', 名称: '青崖真宫', 玩家职位: '杂役弟子' });
        const npc = { id: 'n1', 姓名: '俞月荷', 叙事名称: '蒙面师姐', 所属门派: '青崖真宫', 头像图片URL: 'https://example.org/avatar.jpg' };
        render(<Component sectData={sect} onClose={() => {}} socialList={[npc]} />);
        fireEvent.click(screen.getByRole('button', { name: /同门名录|^同门$|^成员$/ }));
        expect(screen.getByRole('img', { name: '蒙面师姐头像' }).getAttribute('src')).toBe(提取人物头像地址(npc));
    });
    it('归并已记录的同门、社交与势力成员，并排除无依据的人物', () => {
        const sect = 同步角色与门派状态({
            角色: { 姓名: '杨培强', 所属门派ID: 'sect001', 门派职位: '杂役弟子' },
            玩家门派: 规范化门派状态({ ID: 'sect001', 名称: '青崖真宫', 玩家职位: '杂役弟子',
                重要成员: [{ id: 'm1', 姓名: '赵安', 身份: '掌院' }] })
        }).玩家门派;
        render(<Component sectData={sect} onClose={() => {}} socialList={[
            { id: 'n1', 姓名: '俞月荷', 所属门派: '青崖真宫', 身份: '内门弟子' },
            { id: 'n2', 姓名: '程雨', 身份: '青崖真宫外门弟子' },
            { id: 'n3', 姓名: '赵安', 所属势力: 'sect001' },
            { id: 'n4', 姓名: '沈天彪', 所属势力: '铁骨帮', 简介: '在青崖真宫门前守候' },
            { id: 'n5', 姓名: '郑通', 身份: '青崖真宫的仇人' },
            { id: 'n7', 姓名: '贺远', 身份: '青崖真宫掌门的仇人' },
        ]} world={{ 活跃NPC列表: [{ npcId: 'n6', 姓名: '陈山', 所属势力: 'FAC-2' }] } as any}
        factionLedgers={[{ id: 'FAC-2', 名称: '青崖真宫', 领袖: '顾宁', 核心人物: ['赵安', '顾宁'] }, { id: 'FAC-3', 名称: '铁骨帮', 领袖: '沈天彪' }] as any} />);
        fireEvent.click(screen.getByRole('button', { name: /同门名录|^同门$|^成员$/ }));
        for (const name of ['杨培强', '俞月荷', '程雨', '赵安', '陈山', '顾宁']) expect(screen.getAllByText(name)).toHaveLength(1);
        expect(screen.queryByText('沈天彪')).toBeNull();
        expect(screen.queryByText('郑通')).toBeNull();
        expect(screen.queryByText('贺远')).toBeNull();
    });
});
