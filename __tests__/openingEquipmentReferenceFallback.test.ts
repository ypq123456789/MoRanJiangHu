import { describe, expect, it } from 'vitest';
import { 执行响应命令处理, 响应命令处理状态 } from '../hooks/useGame/responseCommandProcessor';
import { 规范化社交列表, 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';

/**
 * 开局装备引用兜底回归。
 *
 * 玩家反馈：开局「变量变化」面板里装备明明生成了，但背包和身上都是空的，钱也是 0。
 * 根因：装备栏存的是物品引用，AI 在开局常只写 `角色.装备.<槽位>` 而漏写 `角色.物品列表`
 * 条目，旧逻辑会把引用不到的槽位一律清成「无」，于是装备在面板上有、实际状态全空。
 *
 * 处理分两条路径：
 * - 默认路径保持原契约：缺失物品对象的装备引用**不补建**（见 __tests__/equipmentFallback.test.ts）；
 * - 仅开局首轮初始化传 `补建缺失装备引用: true`，按槽位推断类型补一条最小可用物品，
 *   保证玩家初始装备不凭空消失。模型仍应在同一次输出里主动写全物品条目（提示词已强制要求）。
 */

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

/** 模拟开局首轮：命令应用时允许补建缺失的装备引用物品。 */
const 开局deps = {
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
    规范化角色物品容器映射: (value?: any, options?: any) =>
        规范化角色物品容器映射(value, { ...options, 补建缺失装备引用: true }),
    战斗结束自动清空: (value?: any) => value || {}
};

/** 模拟普通回合：沿用默认契约，不补建占位装备。 */
const 普通回合deps = {
    ...开局deps,
    规范化角色物品容器映射: (value?: any, options?: any) => 规范化角色物品容器映射(value, options)
};

describe('开局装备引用兜底补建', () => {
    it('只写装备槽位、不写物品列表时，自动补建物品而不是清成「无」', () => {
        const state = 构建基础状态();
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '你腰间挂着一柄青锋剑，身上穿着粗布衣衫。' }],
            tavern_commands: [
                { action: 'set', key: '角色.装备.主武器', value: '青锋剑' },
                { action: 'set', key: '角色.装备.胸部', value: '粗布衣衫' }
            ]
        } as any, state, 开局deps as any, undefined, { applyState: false }) as any;

        expect(result.角色.装备.主武器).not.toBe('无');
        expect(result.角色.装备.胸部).not.toBe('无');

        const 名称 = result.角色.物品列表.map((item: any) => item.名称);
        expect(名称).toContain('青锋剑');
        expect(名称).toContain('粗布衣衫');

        const 剑 = result.角色.物品列表.find((item: any) => item.名称 === '青锋剑');
        expect(剑.类型).toBe('武器');
        expect(剑.当前装备部位).toBe('主武器');
    });

    it('模型已写完整物品条目时，不重复补建', () => {
        const state = 构建基础状态();
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '你把青锋剑握在手里。' }],
            tavern_commands: [
                {
                    action: 'set',
                    key: '角色.物品列表',
                    value: [{ ID: 'Item001', 名称: '青锋剑', 类型: '武器', 品质: '良品', 描述: '一柄长剑。', 堆叠数量: 1 }]
                },
                { action: 'set', key: '角色.装备.主武器', value: '青锋剑' }
            ]
        } as any, state, 开局deps as any, undefined, { applyState: false }) as any;

        expect(result.角色.物品列表).toHaveLength(1);
        expect(result.角色.物品列表[0].ID).toBe('Item001');
        expect(result.角色.物品列表[0].当前装备部位).toBe('主武器');
        expect(result.角色.装备.主武器).toBe('Item001');
    });

    it('普通回合不传开关时保持原契约：缺失引用的装备不补建', () => {
        const state = 构建基础状态();
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '你披上一件来历不明的斗篷。' }],
            tavern_commands: [
                { action: 'set', key: '角色.装备.背部', value: '来历不明的斗篷' }
            ]
        } as any, state, 普通回合deps as any, undefined, { applyState: false }) as any;

        expect(result.角色.装备.背部).toBe('无');
        expect(result.角色.物品列表.some((item: any) => item?.名称 === '来历不明的斗篷')).toBe(false);
    });

    it('同一引用名多次补建得到同一个 ID（稳定，不会每回合新建物品）', () => {
        const 一次 = 规范化角色物品容器映射({ 姓名: '杨培强', 装备: { 主武器: '青锋剑' } } as any, { 补建缺失装备引用: true });
        const 二次 = 规范化角色物品容器映射({ 姓名: '杨培强', 装备: { 主武器: '青锋剑' } } as any, { 补建缺失装备引用: true });
        const 取剑 = (role: any) => role.物品列表.find((item: any) => item.名称 === '青锋剑');
        expect(取剑(一次)?.ID).toBeTruthy();
        expect(取剑(一次)?.ID).toBe(取剑(二次)?.ID);
    });

    it('金钱命令与装备补建互不影响', () => {
        const state = 构建基础状态();
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '你把青锋剑挂在腰间，怀里揣着一百两银子。' }],
            tavern_commands: [
                { action: 'set', key: '角色.装备.主武器', value: '青锋剑' },
                { action: 'set', key: '角色.金钱.银子', value: 100 }
            ]
        } as any, state, 开局deps as any, undefined, { applyState: false }) as any;

        expect(result.角色.装备.主武器).not.toBe('无');
        expect(Number(result.角色.金钱.银子)).toBe(100);
        expect(Number(result.角色.金钱.中层货币)).toBe(100);
    });
});
