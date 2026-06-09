import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    baseAmount转角色金钱,
    创建默认拍卖行状态,
    创建玩家拍卖品,
    格式化BaseAmount总值,
    格式化铜钱总值,
    购买拍卖品,
    结算玩家寄售,
    计算金钱BaseAmount总值,
    计算金钱铜钱总值,
    计算物品市场BaseAmount,
    计算物品市场铜钱,
    清理并补货,
    上架背包物品,
    投放事件拍卖品,
    铜钱转角色金钱,
    执行货币换兑,
    执行自动货币整理,
    拍卖BaseAmount货币列表,
    拍卖货币列表,
    保存拍卖行状态,
    自动扣除BaseAmount,
    自动扣除铜钱,
    自动增加BaseAmount,
    自动增加铜钱
} from '../services/auctionHouse';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('拍卖行默认补货', () => {
    it('新档默认拍卖行状态会生成少量题材基础拍品', () => {
        const state = 创建默认拍卖行状态();

        expect(state.行情列表.length).toBeGreaterThan(0);
        expect(state.拍卖品列表.filter((entry) => entry.状态 === '上架中').length).toBeGreaterThan(0);
        expect(state.最近补货时间).toBeGreaterThan(0);
    });

    it('剧情触发时只投放AI/世界事件给出的物品，不再附带系统补货', () => {
        const emptyState = {
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        };
        
        // 模拟剧情触发投放
        const state = 投放事件拍卖品(emptyState, {
            事件名称: '测试事件',
            来源描述: '测试来源',
            物品: {
                名称: '测试物品',
                类型: '武器',
                品质: '上品',
                价值: 1000
            }
        });

        expect(state.拍卖品列表.some((entry) => entry.卖家ID.startsWith('market_'))).toBe(false);
        expect(state.拍卖品列表.filter((entry) => entry.状态 === '上架中')).toHaveLength(1);
        expect(state.拍卖品列表[0].物品.名称).toBe('测试物品');
    });

    it('系统补货入口被调用时会补足基础拍品', () => {
        const state = 清理并补货({
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        }, { 允许系统补货: true, 最大系统补货数量: 2 });

        expect(state.拍卖品列表.filter((entry) => entry.状态 === '上架中')).toHaveLength(2);
        expect(state.最近补货时间).toBeGreaterThan(0);
    });
    
    it('系统补货不再生成重复物品', () => {
        const state = 清理并补货({
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        }, { 允许系统补货: true });

        const itemKeys = state.拍卖品列表
            .filter((entry) => entry.状态 === '上架中')
            .map((entry) => `${entry.物品.名称}|${entry.物品.类型}|${entry.物品.品质}`);
        
        expect(itemKeys.length).toBeGreaterThan(0);
        expect(new Set(itemKeys).size).toBe(itemKeys.length);
    });

    it('系统补货不再生成杂物拍品', () => {
        const state = 清理并补货({
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        }, { 允许系统补货: true });

        expect(state.拍卖品列表.filter((entry) => entry.状态 === '上架中').every((entry) => entry.物品.类型 !== '杂物' && entry.物品.类型 !== '杂项')).toBe(true);
    });

    it('武侠模式会按武侠补货并过滤事件投放中的仙侠拍品', () => {
        const state = 清理并补货({
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        }, { 允许系统补货: true, 最大系统补货数量: 20, 目标在售数量: 20, 题材模式: '武侠' });

        const names = state.拍卖品列表.map((entry) => entry.物品.名称).join('|');
        expect(names).toMatch(/金疮药|精铁短刀|软皮护腕|基础吐纳手札/);
        expect(names).not.toMatch(/储物戒|飞剑|灵晶/);

        const blocked = 投放事件拍卖品(state, {
            事件名称: '武侠市集',
            题材模式: '武侠',
            物品: {
                名称: '储物戒',
                类型: '饰品',
                品质: '极品',
                价值: 42000
            }
        });
        expect(blocked.拍卖品列表.some((entry) => entry.物品.名称 === '储物戒')).toBe(false);
    });

    it('现代和末日模式使用题材市场物品池，并仍过滤古风仙侠事件拍品', () => {
        const modern = 清理并补货({
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        }, { 允许系统补货: true, 最大系统补货数量: 8, 目标在售数量: 8, 题材模式: '现代都市' });

        expect(modern.拍卖品列表.length).toBeGreaterThan(0);
        expect(JSON.stringify(modern.拍卖品列表)).toMatch(/急救包|工具钳|防割手套|录音笔/);

        const apocalypse = 清理并补货({
            拍卖品列表: [],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        }, { 允许系统补货: true, 最大系统补货数量: 8, 目标在售数量: 8, 题材模式: '末日丧尸' });

        expect(apocalypse.拍卖品列表.length).toBeGreaterThan(0);
        expect(JSON.stringify(apocalypse.拍卖品列表)).toMatch(/净水片|防刺背心|手摇电筒|罐头补给包/);

        const blocked = 投放事件拍卖品(apocalypse, {
            事件名称: '营地黑市',
            题材模式: '末日丧尸',
            物品: {
                名称: '储物戒',
                类型: '饰品',
                品质: '极品',
                价值: 42000
            }
        });
        expect(blocked.拍卖品列表.some((entry) => entry.物品.名称 === '储物戒')).toBe(false);
    });

    it('localStorage 配额不足时不会打断应用加载', () => {
        const setItem = vi
            .fn()
            .mockImplementationOnce(() => {
                throw new DOMException('quota exceeded', 'QuotaExceededError');
            })
            .mockImplementationOnce(() => undefined);
        const removeItem = vi.fn();
        const localStorageMock = {
            length: 2,
            key: vi.fn((index: number) => [
                'moranjianghu_auction_house_v2:old',
                'moranjianghu_auction_house_v2:current',
            ][index] || null),
            setItem,
            removeItem,
        };
        vi.stubGlobal('window', { localStorage: localStorageMock });

        expect(() => 保存拍卖行状态({
            拍卖品列表: Array.from({ length: 120 }, (_, index) => ({
                ID: `auction_${index}`,
                物品: { ID: `item_${index}`, 名称: `测试物品${index}`, 类型: '武器', 品质: '上品', 价值: 1000 },
                卖家名称: '测试卖家',
                卖家ID: 'seller',
                起拍价: 100,
                一口价: 200,
                当前价格: 100,
                标价货币: '铜钱',
                状态: index % 2 === 0 ? '上架中' : '已下架',
                上架时间: index,
                过期时间: Date.now() + 1000,
                市场标签: ['测试'],
                来源描述: '测试',
            })),
            交易记录: Array.from({ length: 120 }, (_, index) => ({
                ID: `record_${index}`,
                类型: '事件投放',
                标题: `记录${index}`,
                描述: '测试',
                时间: index,
            })),
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0,
        }, 'current')).not.toThrow();

        expect(removeItem).toHaveBeenCalledWith('moranjianghu_auction_house_v2:old');
        expect(setItem).toHaveBeenCalledTimes(2);
    });
});

describe('拍卖行 baseAmount 兼容结算', () => {
    const 创建测试角色 = () => ({
        姓名: '测试侠客',
        金钱: {
            金元宝: 1,
            银子: 2,
            铜钱: 345
        },
        物品列表: [
            {
                ID: 'item_sword',
                名称: '测试短剑',
                描述: '用于测试寄售。',
                类型: '武器',
                品质: '良品',
                重量: 1,
                堆叠数量: 1,
                是否可堆叠: false,
                价值: 100,
                当前耐久: 100,
                最大耐久: 100,
                词条列表: []
            },
            {
                ID: 'item_herb',
                名称: '测试药材',
                描述: '用于测试批量寄售。',
                类型: '材料',
                品质: '凡品',
                重量: 0.1,
                堆叠数量: 3,
                是否可堆叠: true,
                价值: 20,
                当前耐久: 1,
                最大耐久: 1,
                词条列表: []
            }
        ],
        装备: {},
        当前负重: 0,
        最大负重: 999
    } as any);

    it('旧铜钱命名函数保留为 baseAmount alias，结果不变', () => {
        const character = 创建测试角色();

        expect(计算金钱BaseAmount总值(character.金钱)).toBe(102345);
        expect(计算金钱铜钱总值(character.金钱)).toBe(102345);
        expect(baseAmount转角色金钱(102345)).toEqual(铜钱转角色金钱(102345));
        expect(格式化BaseAmount总值(12345)).toBe(格式化铜钱总值(12345));

        const baseDeduct = 自动扣除BaseAmount(character, 2345);
        const copperDeduct = 自动扣除铜钱(character, 2345);
        expect(baseDeduct.ok).toBe(true);
        expect(copperDeduct.ok).toBe(true);
        if (baseDeduct.ok && copperDeduct.ok) {
            expect(baseDeduct.nextCharacter.金钱).toEqual(copperDeduct.nextCharacter.金钱);
            expect(baseDeduct.paidBaseAmount).toBe(2345);
            expect(baseDeduct.paidCopper).toBe(2345);
        }

        expect(自动增加BaseAmount(character, 200).金钱).toEqual(自动增加铜钱(character, 200).金钱);
        expect(拍卖BaseAmount货币列表).toBe(拍卖货币列表);
    });

    it('物品市场估价 baseAmount alias 与旧铜钱估价一致', () => {
        const item = {
            名称: '测试长剑',
            类型: '武器',
            品质: '上品',
            价值: 1000
        };
        const market = [{ ID: 'm1', 标题: '武备热', 描述: '武器涨价', 影响类型: '武器' as const, 价格倍率: 1.2, 热点标签: '测试', 过期时间: Date.now() + 1000 }];

        expect(计算物品市场BaseAmount(item, market)).toBe(计算物品市场铜钱(item, market));
        expect(计算物品市场BaseAmount(item, market)).toBe(1392);
    });

    it('购买拍卖品仍按原三层余额扣款并返回兼容字段', () => {
        const character = 创建测试角色();
        const auction = 创建玩家拍卖品({ 姓名: '卖家' } as any, character.物品列表[0], 1200, '铜钱');

        const result = 购买拍卖品(character, { ...auction, 卖家ID: 'seller' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.paidBaseAmount).toBe(1200);
            expect(result.paidCopper).toBe(1200);
            expect(result.nextCharacter.金钱).toEqual({
                上层货币: 1,
                中层货币: 1,
                底层货币: 145,
                金元宝: 1,
                银子: 1,
                铜钱: 145
            });
            expect(result.nextCharacter.物品列表.some((item: any) => item.名称 === '测试短剑')).toBe(true);
            expect(result.nextAuction.状态).toBe('已成交');
        }
    });

    it('上架背包物品和寄售结算保留旧 marketPrice/totalCopper，并新增 baseAmount 字段', () => {
        const character = 创建测试角色();
        const listed = 上架背包物品(character, 'item_sword');

        expect(listed.ok).toBe(true);
        if (!listed.ok) return;
        expect(listed.marketBaseAmount).toBe(listed.marketPrice);
        expect(listed.auction.一口价).toBe(listed.marketPrice);
        expect(listed.nextCharacter.物品列表.some((item: any) => item.ID === 'item_sword')).toBe(false);

        const state = {
            拍卖品列表: [{ ...listed.auction, 上架时间: 1 }],
            交易记录: [],
            最近补货时间: 0,
            行情列表: [],
            最近行情时间: 0
        };
        const settled = 结算玩家寄售(state, listed.nextCharacter, Date.now() + 1000);

        expect(settled.settledCount).toBe(1);
        expect(settled.totalBaseAmount).toBe(settled.totalCopper);
        expect(settled.totalCopper).toBe(listed.marketPrice);
        expect(计算金钱BaseAmount总值(settled.nextCharacter.金钱)).toBe(102345 + listed.marketPrice);
        expect(settled.nextState.拍卖品列表[0].状态).toBe('已成交');
    });

    it('货币换兑和自动整理结果保持旧三层结构', () => {
        const character = 创建测试角色();

        const exchanged = 执行货币换兑(character, '银子', '铜钱', 1);
        expect(exchanged.ok).toBe(true);
        if (exchanged.ok) {
            expect(exchanged.received).toBe(970);
            expect(exchanged.nextCharacter.金钱).toEqual({
                上层货币: 1,
                中层货币: 1,
                底层货币: 1315,
                金元宝: 1,
                银子: 1,
                铜钱: 1315
            });
        }

        const organized = 执行自动货币整理(character);
        expect(organized.totalBaseAmount).toBe(organized.totalCopper);
        expect(organized.totalCopper).toBe(102345);
        expect(organized.nextCharacter.金钱).toEqual({
            上层货币: 1,
            中层货币: 2,
            底层货币: 345,
            金元宝: 1,
            银子: 2,
            铜钱: 345
        });
    });
});
