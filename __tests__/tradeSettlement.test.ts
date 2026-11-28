import { describe, expect, it } from 'vitest';
import { 执行情境交易结算, 提取交易对方库存列表, 检测当前交易场所, type ExecuteTradeParams } from '../engine/plugins/tradePlugin';
import { 规范化世界状态 } from '../hooks/useGame/storyState';
import { 规范化社交列表, 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';

const herb = { ID: 'herb', 名称: '蛇涎草', 数量: 2, 价值: 29, 类型: '材料', 品质: '良品', 描述: '解毒药材' };
const venue = 检测当前交易场所({ 大地点: '中州', 小地点: '云城', 具体地点: '西市坊市' });
const config = { 题材模式: '仙侠' } as any;
const npc = (assets: object = {}) => ({ id: 'gu', 姓名: '顾青', 好感度: 20, 是否在场: true, 背包: [], ...assets } as any);
const role = (money: object = { baseAmount: 3 }, items: unknown[] = [herb]) => ({
    姓名: '杨培强', 金钱: money, 物品列表: items, 装备: {}, 已补齐系统丹药预设: true, 已落地背景开局资产: true
} as any);
const sale = (overrides: Partial<ExecuteTradeParams> = {}) => 执行情境交易结算({
    targetType: 'npc', targetName: '顾青', npcId: 'gu', locationLabel: '西市坊市',
    role: role(), social: [npc({ 金钱: { 下品灵石: 25 } })], openingConfig: config,
    playerItemsOffered: [{ name: '蛇涎草', quantity: 1, unitPriceBase: 29 }],
    counterpartyItemsBought: [], priceMultiplier: 1, ...overrides
});
const stock = (target: any) => 提取交易对方库存列表({ targetType: 'npc', npc: target, openingConfig: config });

describe('情境交易双向账本', () => {
    it('默认售价20实际到账，双方库存和钱袋经读档保持一致', () => {
        const result = sale();
        expect(result.ok).toBe(true);
        expect(result.record?.玩家获得金钱Base).toBe(20);
        expect(result.nextRole?.金钱.baseAmount).toBe(23);
        const savedRole = 规范化角色物品容器映射(JSON.parse(JSON.stringify(result.nextRole)));
        const savedNpc = 规范化社交列表(JSON.parse(JSON.stringify(result.nextSocial)))[0];
        expect(savedRole.金钱.baseAmount).toBe(23);
        expect(savedRole.物品列表.find((entry) => entry.名称 === '蛇涎草')?.堆叠数量).toBe(1);
        expect(stock(savedNpc).purseBase).toBe(5);
        expect(stock(savedNpc).items[0]).toMatchObject({ name: '蛇涎草', quantity: 1, unitPriceBase: 29 });
        expect(savedNpc.好感度).toBe(20);
    });
    it('市场可卖20，指定收19只转19且好感+1，收0不能意外送出', () => {
        const discounted = sale({ playerCashReceivedBase: 19 });
        expect(discounted.nextRole?.金钱.baseAmount).toBe(22);
        expect(stock(discounted.nextSocial?.[0]).purseBase).toBe(6);
        expect(discounted.nextSocial?.[0].好感度).toBe(21);
        expect(discounted.record?.成交摘要).toContain('好感 +1');
        expect(discounted.record?.成交摘要).toContain('下品灵石');
        expect(sale({ playerCashReceivedBase: 0 }).ok).toBe(false);
    });
    it('区分旧档未记账与明确零；余额不足时报差额且保留物品', () => {
        const oldNpc = npc();
        const poorNpc = npc({ 金钱: { baseAmount: 0 } });
        expect(stock(oldNpc)).toMatchObject({ items: [], purseBase: 0, purseKnown: false });
        expect(stock(poorNpc)).toMatchObject({ items: [], purseBase: 0, purseKnown: true });
        const player = role();
        const result = sale({ role: player, social: [poorNpc] });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('20 下品灵石');
        expect(result.nextRole).toBeUndefined();
        expect(player.物品列表[0].数量).toBe(2);
        expect(poorNpc.背包).toEqual([]);
    });
    it('旧 NPC 背包中的真实面额可折算，高面额找零，支付后不会重现余额', () => {
        const source = npc({ 背包: [{ 名称: '中品灵石', 数量: 1 }, { 名称: '下品灵石', 数量: 2 }] });
        expect(stock(source)).toMatchObject({ items: [], purseBase: 1002, purseKnown: true });
        const result = sale({ social: [source] });
        expect(stock(result.nextSocial?.[0]).purseBase).toBe(982);
        expect(result.nextSocial?.[0].背包?.some((entry) => entry.名称 === '中品灵石')).toBe(false);
    });
    it('购买自动补款、打空的库存保持空，库存不足或目标消失拒绝结算', () => {
        const source = npc({ 金钱: { baseAmount: 0 }, 背包: [herb] });
        const buy = { name: '蛇涎草', type: '材料', description: '', quantity: 2, unitPriceBase: 29 };
        const params = { role: role({ baseAmount: 60 }, []), social: [source], playerItemsOffered: [], counterpartyItemsBought: [buy] };
        const result = sale(params);
        expect(result.record?.玩家支出金钱Base).toBe(58);
        expect(result.nextRole?.金钱.baseAmount).toBe(2);
        expect(stock(result.nextSocial?.[0])).toMatchObject({ purseBase: 58, items: [] });
        expect(sale({ ...params, counterpartyItemsBought: [{ ...buy, quantity: 3 }] }).ok).toBe(false);
        expect(sale({ ...params, social: [] }).ok).toBe(false);
    });
    it('已有钱袋的 NPC 收款时，保留未参与结算的实体钱币', () => {
        const cashItem = { 名称: '下品灵石', 数量: 2 };
        const source = npc({ 金钱: { baseAmount: 0 }, 背包: [herb, cashItem] });
        const result = sale({ role: role({ baseAmount: 29 }, []), social: [source], playerItemsOffered: [],
            counterpartyItemsBought: [{ name: '蛇涎草', type: '材料', description: '', quantity: 1, unitPriceBase: 29 }] });
        expect(result.ok).toBe(true);
        expect(result.nextSocial?.[0].背包).toContainEqual(cashItem);
        expect(stock(result.nextSocial?.[0]).purseBase).toBe(29);
    });
    it('场所钱袋与货物独立保存，重开同一柜台不重置', () => {
        const world = 规范化世界状态({});
        const result = sale({ targetType: 'venue', targetName: venue.venueName, venue, world, social: [] });
        expect(result.record?.玩家获得金钱Base).toBe(20);
        const saved = 规范化世界状态(JSON.parse(JSON.stringify(result.nextWorld)));
        const counter = 提取交易对方库存列表({ targetType: 'venue', venue, world: saved, openingConfig: config });
        expect(counter.purseBase).toBe(2380);
        expect(counter.items.find((entry) => entry.name === '蛇涎草')?.quantity).toBe(1);
    });
    it('同伴的钱袋只按剧情确证的首次盘点入账，已有余额不重复重置', async () => {
        const { 首次登记NPC交易资产 } = await import('../engine/plugins/tradePlugin');
        const proof = '俞月荷点过钱袋，只有十九块下品灵石。';
        const entry = { 依据: proof, 余额Base: 19 };
        expect(首次登记NPC交易资产(npc(), entry, '', config, role()).金钱).toBeUndefined();
        const registered = 首次登记NPC交易资产(npc(), entry, proof, config, role());
        expect(stock(registered).purseBase).toBe(19);
        const empty = npc({ 金钱: { baseAmount: 0 } });
        expect(stock(首次登记NPC交易资产(empty, entry, proof, config, role())).purseBase).toBe(0);
    });
    it('物理钱币镜像及多货币桶跨存档保留，其他独立币种不动', () => {
        const mirrored = sale({ role: role({ 下品灵石: 3 }, [herb, { 名称: '下品灵石', 类型: '货币:底层货币', 数量: 3 }]) });
        expect(规范化角色物品容器映射(mirrored.nextRole).金钱.baseAmount).toBe(23);
        const multi = { 题材模式: '仙侠', modeRuntimeProfile: { economy: {
            accountingUnit: '下品灵石', currencySystem: { systems: { 灵石: { displayName: '灵石', displayOrder: 1,
                units: { 低: { displayName: '下品灵石', inMarket: true }, 高: { displayName: '上品灵石', inMarket: true } } } } }
        } } } as any;
        const result = sale({ openingConfig: multi,
            role: role({ 货币桶: { 灵石: { 低: 3, 高: 2 } } }),
            social: [npc({ 金钱: { 货币桶: { 灵石: { 低: 22, 高: 1 } } } })] });
        expect(result.ok).toBe(true);
        expect((规范化角色物品容器映射(result.nextRole).金钱 as any).货币桶).toEqual({ 灵石: { 低: 23, 高: 2 } });
        expect((result.nextSocial?.[0].金钱 as any).货币桶).toEqual({ 灵石: { 低: 2, 高: 1 } });
    });
    it('旧档仅以仙侠币名记账，读档保留主角余额；自定义货币使用设定汇率', () => {
        const imported = 规范化角色物品容器映射(role({ 下品灵石: 17 }));
        expect(imported.金钱.baseAmount).toBe(17);
        expect(stock(npc({ 金钱: { 灵玉: 1, 下品灵石: 8 } })).purseBase).toBe(100008);
        const custom = { 题材模式: '武侠', modeRuntimeProfile: { economy: {
            currencySystem: { id: 'coin', baseUnitId: 'c', units: [
                { id: 's', name: '银币', baseRate: 10, order: 2 }, { id: 'c', name: '铜币', baseRate: 1, order: 1 }
            ] }
        } } } as any;
        const counter = npc({ 金钱: { 银币: 2 } });
        expect(提取交易对方库存列表({ targetType: 'npc', npc: counter, openingConfig: custom }).purseBase).toBe(20);
    });
});
