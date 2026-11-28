// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TradePluginModal from '../components/features/Chat/TradePluginModal';
import { 创建开场空白角色 } from '../hooks/useGame/storyState';
import type { NPC结构, 角色数据结构 } from '../types';

afterEach(cleanup);

const openSale = (changeTarget?: (replace: (social: NPC结构[]) => void) => void) => {
    const onApplyTrade = vi.fn();
    const role: 角色数据结构 = { ...创建开场空白角色(), 姓名: '玩家', 金钱: { 上层货币: 0, 中层货币: 0, 底层货币: 5, baseAmount: 5 }, 物品列表: [
        { 名称: '绷带', ID: 'bandage', 价值: 29, 描述: '包扎用', 类型: '材料', 品质: '凡品', 重量: 1,
            堆叠数量: 3, 是否可堆叠: true, 当前耐久: 0, 最大耐久: 0, 词条列表: [] }
    ] };
    const social = [{ id: 'friend', 姓名: '俞月荷', 好感度: 10, 金钱: { baseAmount: 30 }, 背包: [],
        是否在场: true, 当前位置: '内室' }] as NPC结构[];
    const modal = (people: NPC结构[]) => <TradePluginModal open loading={false} role={role} env={{ 具体地点: '内室' }} social={people}
        pendingTrades={[]} onApplyTrade={onApplyTrade} onClearTrades={() => {}} onClose={() => {}} />;
    const { rerender } = render(modal(social));
    changeTarget?.((people) => rerender(modal(people)));
    const confirmLocation = screen.queryByRole('button', { name: /确认对方此刻/ });
    if (confirmLocation) fireEvent.click(confirmLocation);
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    return onApplyTrade;
};

describe('同伴交易实际提交入口', () => {
    it('同一份未重绘报价连续提交两次只入账一次，新选货后可正常成交', () => {
        const apply = openSale();
        const submit = screen.getByRole('button', { name: '确认落账成交' });
        act(() => { submit.click(); submit.click(); });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply.mock.calls[0][0].record.玩家获得金钱Base).toBe(20);
        fireEvent.click(screen.getByRole('button', { name: '+' }));
        fireEvent.click(submit);
        expect(apply).toHaveBeenCalledTimes(2);
    });
    it('手输零收款先禁止成交，只有再明确选择赠物才转交并记为赠与', () => {
        const apply = openSale();
        const receipt = screen.getByRole('spinbutton', { name: '我方收取' });
        fireEvent.change(receipt, { target: { value: '0' } });
        expect((screen.getByRole('button', { name: '确认落账成交' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: '免费赠予俞月荷' }));
        fireEvent.click(screen.getByRole('button', { name: '确认赠予' }));
        const { nextRole, nextSocial, record } = apply.mock.calls[0][0];
        expect(nextRole.金钱.baseAmount).toBe(5);
        expect(nextSocial[0].金钱.baseAmount).toBe(30);
        expect(nextRole.物品列表[0].数量).toBe(2);
        expect(nextSocial[0].背包[0]).toMatchObject({ 名称: '绷带', 数量: 1 });
        expect(nextSocial[0].好感度).toBe(11);
        expect(record.成交摘要).toContain('赠予');
        expect(record.成交摘要).not.toContain('换得[无]');
    });
    it('原对象离开时，已批准的赠物不能转给列表中另一个人', () => {
        let replace!: (social: NPC结构[]) => void;
        const apply = openSale((setPeople) => { replace = setPeople; });
        fireEvent.change(screen.getByRole('spinbutton', { name: '我方收取' }), { target: { value: '0' } });
        fireEvent.click(screen.getByRole('checkbox', { name: '免费赠予俞月荷' }));
        replace([{ id: 'other', 姓名: '行商', 是否在场: true, 当前位置: '内室', 是否队友: true } as NPC结构]);
        const check = screen.queryByRole('button', { name: /确认对方此刻/ });
        if (check) fireEvent.click(check);
        expect(screen.queryByRole('button', { name: '确认赠予' })).toBeNull();
        expect(apply).not.toHaveBeenCalled();
    });
});
