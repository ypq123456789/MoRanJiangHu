// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import WorldModal from '../components/features/World/WorldModal';
import MobileWorldModal from '../components/features/World/MobileWorldModal';
import { 规范化世界状态 } from '../hooks/useGame/storyState';
import { 校验变量命令是否登记 } from '../utils/variableRegistry';
import { 构建势力关系图数据 } from '../utils/worldFactionRelations';

afterEach(cleanup);
const factions = [
    { ID: 'A', 名称: '西山剑门', 主角声望: 27 }, { ID: 'B', 名称: '东市铁器行', 主角声望: -49 },
    { ID: 'C', 名称: '商盟', 主角声望: 0 }, { ID: 'D', 名称: '江南水陆三十六舵船帮' }
];
const world = 规范化世界状态({ 势力列表: factions });

describe('势力声望', () => {
    it('声望可在旧档已有势力首次写入，读档保持正负、零和未知', () => {
        expect(校验变量命令是否登记({ action: 'set', key: '世界.势力列表[0].主角声望', value: 12 }, { 世界: { 势力列表: [{ ID: 'A' }] } }).allowed).toBe(true);
        expect(world.势力列表.map(f => f.主角声望)).toEqual([27, -49, 0, undefined]);
    });

    it('玩家门派未进世界名册时仍显示所属节点；同名势力按 ID 区分', () => {
        expect(构建势力关系图数据([], 'sect_x', { ID: 'sect_x', 名称: '归云堂' }).nodes)
            .toEqual([expect.objectContaining({ id: 'sect_x', name: '归云堂', isPlayerFaction: true })]);
        const nodes = 构建势力关系图数据([{ ID: 'A', 名称: '同名' }, { ID: 'B', 名称: '同名' }], 'B').nodes;
        expect(nodes.filter(n => n.isPlayerFaction).map(n => n.id)).toEqual(['B']);
        expect(构建势力关系图数据([], 'none', { ID: 'none', 名称: '无门无派' }).nodes).toHaveLength(0);
    });

    it.each([[WorldModal, '势力群英'], [MobileWorldModal, '群英']] as const)('%s 展示数值和两处所属标记', (Modal, tab) => {
        const view = render(<Modal world={world} playerFactionId="A" onClose={() => {}} />);
        fireEvent.click(view.getByText(tab));
        const chart = within(view.getByRole('figure', { name: '主角势力声望' }));
        for (const label of ['+27', '−49', '0', '未记录']) expect(chart.getAllByText(label).length).toBeGreaterThan(0);
        expect(chart.getByText('江南水陆三十六舵船帮')).toBeTruthy();
        expect(view.getAllByText('主角所属')).toHaveLength(2);
    });
});
