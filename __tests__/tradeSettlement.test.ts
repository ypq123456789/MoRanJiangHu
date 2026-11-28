import { 变更角色货币BaseAmount } from '../utils/currencyDisplay';
import { describe, expect, it } from 'vitest';
import { 首次登记NPC交易资产, 执行情境交易结算, 提取交易对方库存列表, 检测当前交易场所, type ExecuteTradeParams } from '../engine/plugins/tradePlugin';
import { 规范化世界状态 } from '../hooks/useGame/storyState';
import { 规范化社交列表, 规范化角色物品容器映射, 设置默认技艺运行时配置 } from '../hooks/useGame/stateTransforms';

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
    it('同伴的钱袋只按剧情确证的首次盘点入账，已有余额不重复重置', () => {
        const proof = '顾青点过钱袋，只有十九块下品灵石。';
        const entry = { 依据: proof, 余额Base: 19 };
        expect(首次登记NPC交易资产(npc(), entry, '', config, role()).金钱).toBeUndefined();
        const registered = 首次登记NPC交易资产(npc(), entry, proof, config, role());
        expect(stock(registered).purseBase).toBe(19);
        expect(stock(首次登记NPC交易资产(npc(), entry, '旁白：' + proof, config, role())).purseBase).toBe(19);
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
    it('先选世界设定的记账币，规范键优先于旧别名，重复规范化不改变余额', () => {
        const profile = { economy: { accountingUnit: '银券', currencySystem: { baseUnitId: 'c',
            units: [{ id: 'c', name: '铜币', baseRate: 1, order: 1 }], systems: { 钱庄: { displayName: '钱庄', displayOrder: 0,
                units: { c: { displayName: '铜币', inMarket: true }, voucher: { displayName: '银券', aliases: ['票子'], inMarket: true } }
            } } } } } as any;
        const opening = { 题材模式: '武侠', modeRuntimeProfile: profile } as any;
        const c = npc({ 金钱: { 货币桶: { 钱庄: { c: 0, voucher: 30, 票子: 50 } } } });
        const res = sale({ openingConfig: opening, social: [c] });
        expect(res.ok).toBe(true);
        expect((res.nextSocial?.[0].金钱 as any).货币桶.钱庄).toEqual({ c: 0, voucher: 10 });
        设置默认技艺运行时配置('武侠', profile);
        try {
            const loaded = 规范化角色物品容器映射(role({ 货币桶: { 钱庄: { voucher: 3, 票子: 10 } } }));
            expect((loaded.金钱 as any).货币桶.钱庄).toEqual({ voucher: 3 });
            expect((规范化角色物品容器映射(loaded).金钱 as any).货币桶.钱庄).toEqual({ voucher: 3 });
            expect((规范化角色物品容器映射(role({ 货币桶: { 钱庄: { 票子: 10 } } })).金钱 as any).货币桶.钱庄.voucher).toBe(10);
        } finally { 设置默认技艺运行时配置('武侠'); }
    });
    it('只重算实体币对应的币种，保留独立余额和其他面额', () => {
        const saved = 规范化角色物品容器映射(role({ 荣誉币: 50, 银子: 2, 铜钱: 9 }, [
            { ID:'cash', 名称:'铜钱', 类型:'货币:底层货币', 堆叠数量:3, 是否可堆叠:true }
        ]));
        expect(saved.金钱).toMatchObject({ 荣誉币: 50, 银子: 2, 铜钱: 3, baseAmount: 2003 });
    });
    it('找零后重复结算和读档都不会把中层面额再算一次', () => {
        const player = role({ 中品灵石: 1, 下品灵石: 999 }, [herb,
            { 名称: '中品灵石', 类型: '货币:中层货币', 数量: 1 },
            { 名称: '下品灵石', 类型: '货币:底层货币', 数量: 999 }
        ]);
        const first = sale({ role: player, social: [npc({ 金钱: { baseAmount: 50 } })] });
        const saved = 规范化角色物品容器映射(first.nextRole);
        expect(saved.金钱).toMatchObject({ baseAmount: 2019, 中层货币: 2, 底层货币: 19 });
        expect(saved.物品列表.find((entry) => entry.名称 === '中品灵石')?.堆叠数量).toBe(2);
        const second = sale({ role: saved, social: first.nextSocial! });
        expect(规范化角色物品容器映射(second.nextRole).金钱.baseAmount).toBe(2039);
    });
    it('支付独立记账币时保留原有主币钱袋和实体币', () => {
        const profile = { 题材模式: '武侠', modeRuntimeProfile: { economy: {
            accountingUnit: '银券', currencySystem: { systems: { 钱庄: { displayName: '钱庄', displayOrder: 1,
                units: { voucher: { displayName: '银券', inMarket: true } }
            } } }
        } } } as any;
        const physical = { 名称: '银券', 类型: '货币:银券', 数量: 3 };
        const player = role({ 铜钱: 7, baseAmount: 7, 货币桶: { 钱庄: { voucher: 50 } } }, [physical]);
        const res = sale({ openingConfig: profile, role: player, social: [npc({ 背包: [herb] })], playerItemsOffered: [],
            counterpartyItemsBought: [{ name: '蛇涎草', quantity: 1, unitPriceBase: 29, type: '材料', description: '' }] });
        expect(res.nextRole?.物品列表).toContainEqual(physical);
        expect(规范化角色物品容器映射(res.nextRole).金钱).toMatchObject({ baseAmount: 7, 货币桶: { 钱庄: { voucher: 21 } } });
    });
    it('现金增减从已登记余额开始，非法增量不会改动角色或清空其他币种', () => {
        const player = role({ 中层货币: 1, baseAmount: 100, 荣誉币: 3, 货币桶: { 甲: { 乙: 5 } } });
        expect(变更角色货币BaseAmount(player, 15).金钱).toMatchObject({ baseAmount: 115, 荣誉币: 3, 货币桶: { 甲: { 乙: 5 } } });
        expect(变更角色货币BaseAmount(player, 1.8).金钱.baseAmount).toBe(101);
        for (const delta of [Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER]) expect(变更角色货币BaseAmount(player, delta)).toBe(player);
    });
    it('商品报价、他人钱包和未被引文证实的金额不能登记为自己的钱袋', () => {
        for (const [proof, amount] of [
            ['顾青说：这瓶药售价一百块下品灵石。',100], ['俞月荷点清钱袋，只有十九块下品灵石。',19],
            ['顾青说，俞月荷的钱袋里只有十九块下品灵石。',19], ['顾青点过钱袋，只有十九块下品灵石。',200]
        ] as const) {
            expect(首次登记NPC交易资产(npc(), { 依据: proof, 余额Base: amount }, proof, config, role()).金钱).toBeUndefined();
        }
        const first = (proof: string, amount: number) => 首次登记NPC交易资产(npc(), { 依据: proof, 余额Base: amount }, proof, config).金钱;
        expect(first('顾青的钱袋里只有1块中品灵石和十九块下品灵石。', 1019)?.baseAmount).toBe(1019);
        expect(first('顾青身无分文。', 0)?.baseAmount).toBe(0);
        expect(first('顾青点过钱袋，只有十九块下品灵石。', 0)).toBeUndefined();
    });
    it('NPC 已存数量优先于过期堆叠数，初见矛盾数量拒绝登记，零库存保持零', () => {
        const evidence = '顾青拿出一株蛇涎草。';
        const fromText = 首次登记NPC交易资产(npc({ 背包: undefined }), { 依据: evidence, 背包: [
            { 名称: '蛇涎草', 数量: 1, 堆叠数量: 99 }
        ] }, evidence, config);
        expect(stock(fromText).items).toEqual([]);
        const registered = 首次登记NPC交易资产(npc({ 背包: undefined }), { 依据: evidence, 背包: [
            { 名称: '蛇涎草', 数量: 1 }
        ] }, evidence, config);
        expect(stock(registered).items[0]?.quantity).toBe(1);
        expect(stock(npc({ 背包: [{ 名称: '下品灵石', 数量: 1, 堆叠数量: 99 }] })).purseBase).toBe(1);
        const raw = npc({ 背包: [{ ...herb, 数量: 1, 堆叠数量: 99 }] });
        expect(stock(raw).items[0].quantity).toBe(1);
        const normalized = 规范化社交列表([raw])[0];
        expect(normalized.背包[0]).toMatchObject({ 数量: 1, 堆叠数量: 1 });
        const zero = 规范化社交列表([npc({ 背包: [{ ...herb, 数量: 0, 堆叠数量: 3 }] })])[0];
        expect(stock(zero).items).toEqual([]);
    });
    it('用实际划拨的条目写入物品与记录，拒绝分数件', () => {
        const changed = sale({ playerItemsOffered: [{ id:'herb', name:'旧货名', quantity: 1, unitPriceBase: 29 }] });
        expect(changed.record?.玩家支出物品).toEqual([{ 名称:'蛇涎草', 数量:1 }]);
        expect(changed.record?.成交摘要).not.toContain('旧货名');
        expect(sale({ playerItemsOffered: [{ id:'herb', name:'蛇涎草', quantity: 1.5, unitPriceBase: 29 }] }).ok).toBe(false);
    });
    it('同名异地节点和远方市场的简报不能开放当前柜台；无显式账本键仍用场所名落账', () => {
        const world = 规范化世界状态({});
        const layers = [{ ID: 's', 名称:'南镇', 层级:'小地点' }, { ID:'n', 名称:'北镇', 层级:'小地点' },
            { ID:'s1', 名称:'渡口', 层级:'子地点', 父级ID:'s', 描述:'废弃码头' }, { ID:'n1', 名称:'渡口', 层级:'子地点', 父级ID:'n', 描述:'有一家药堂' }] as any;
        expect(检测当前交易场所({ 小地点:'南镇', 具体地点:'渡口' }, { 地图层级:layers }).available).toBe(false);
        expect(检测当前交易场所({ 小地点:'东镇', 具体地点:'渡口' }, { 地图层级:layers.slice(1).filter((n: any) => n.ID !== 's1') }).available).toBe(false);
        expect(检测当前交易场所({ 具体地点:'渡口' }, { 地图层级:layers }).available).toBe(false);
        expect(检测当前交易场所({ 小地点:'北镇', 具体地点:'渡口' }, { 地图层级:layers }).available).toBe(true);
        expect(检测当前交易场所({ 具体地点:'山洞' }, {}, { 下回合导演简报: { 必须守住的悬念或冲突:'躲避黑市追兵' } } as any).available).toBe(false);
        expect(检测当前交易场所({ 具体地点:'山洞' }, {}, { 下回合导演简报: { 本回合舞台焦点:'山洞内有黑市追兵' } } as any).available).toBe(false);
        expect(检测当前交易场所({ 具体地点:'山洞' }, {}, { 下回合导演简报: { 本回合舞台焦点:'山洞内设有一家药堂' } } as any).available).toBe(true);
        const oldVenue = { ...venue, ledgerKey: undefined };
        const res = sale({ targetType: 'venue', targetName:'西市柜台', venue: oldVenue, world, social: [] });
        expect(提取交易对方库存列表({ targetType:'venue', venue:oldVenue, world:res.nextWorld }).purseBase).toBe(2380);
    });
});
