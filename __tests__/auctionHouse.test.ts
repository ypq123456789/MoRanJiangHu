import { describe, expect, it } from 'vitest';
import { 创建默认拍卖行状态, 清理并补货, 投放事件拍卖品 } from '../services/auctionHouse';

describe('拍卖行默认补货', () => {
    it('新档默认拍卖行状态不自动生成系统拍品', () => {
        const state = 创建默认拍卖行状态();

        // 新档应该没有系统拍品，等待剧情触发
        expect(state.行情列表.length).toBeGreaterThan(0); // 行情仍然生成
        expect(state.拍卖品列表.filter((entry) => entry.状态 === '上架中').length).toBe(0); // 没有拍品
        expect(state.最近补货时间).toBe(0); // 没有补货
    });

    it('剧情触发时允许系统补货', () => {
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

        // 剧情触发后应该有系统补货
        expect(state.拍卖品列表.some((entry) => entry.卖家ID.startsWith('system_'))).toBe(true);
        expect(state.拍卖品列表.filter((entry) => entry.状态 === '上架中').length).toBeGreaterThan(0);
    });
    
    it('系统补货时避免重复物品', () => {
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
        
        // 检查没有完全重复的物品
        const uniqueKeys = new Set(itemKeys);
        expect(uniqueKeys.size).toBe(itemKeys.length);
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
});

