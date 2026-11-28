import { describe, expect, it } from 'vitest';
import { 执行响应命令处理, 响应命令处理状态 } from '../hooks/useGame/responseCommandProcessor';
import { 规范化社交列表, 提取金钱命令字段, 同步金钱命令写入 } from '../hooks/useGame/stateTransforms';
import { 计算金钱BaseAmount总值 } from '../utils/currencyDisplay';

/**
 * 金钱命令写穿透回归（玩家反馈：AI set 角色.金钱.银子 被吞、只有 baseAmount 生效）：
 * 提示词让 AI 写旧别名（金元宝/银子/铜钱）与 baseAmount，但归一化与面板都优先认
 * 三层货币字段（上层/中层/底层货币）。AI 只写别名时，陈旧三层字段会把新值反向覆盖。
 */

// 测试环境未注入运行时配置，走默认武侠汇率：1 金元宝 = 100 银 = 100000 铜钱价值
const 构建双重字段金钱 = (overrides: Record<string, number>) => ({
    上层货币: 0, 中层货币: 3500, 底层货币: 0,
    金元宝: 0, 银子: 3500, 铜钱: 0,
    baseAmount: 3500000,
    ...overrides
});

describe('提取金钱命令字段', () => {
    it('识别单字段 set/add/sub 命令与 gameState 前缀', () => {
        const touched = 提取金钱命令字段([
            { action: 'set', key: '角色.金钱.银子', value: 6270 },
            { action: 'add', key: 'gameState.角色.金钱.铜钱', value: 5 },
            { action: 'sub', key: '角色.金钱.baseAmount', value: 100 },
            { action: 'set', key: '角色.灵力', value: 10 }
        ]);
        expect(touched.has('银子')).toBe(true);
        expect(touched.has('铜钱')).toBe(true);
        expect(touched.has('baseAmount')).toBe(true);
        expect(touched.has('灵力')).toBe(false);
    });

    it('整对象 set 角色.金钱 时收集 value 内出现过的字段，且跳过货币桶', () => {
        const touched = 提取金钱命令字段([
            { action: 'set', key: '角色.金钱', value: { 金元宝: 1, 银子: 2, 铜钱: 3, baseAmount: 100003, 货币桶: { a: {} } } }
        ]);
        expect(Array.from(touched).sort()).toEqual(['baseAmount', '金元宝', '银子', '铜钱'].sort());
    });
});

describe('同步金钱命令写入（纯函数）', () => {
    it('客户场景：AI 同时写 银子=6270 与 baseAmount=6270000，旧 中层货币=3500 不得反吞', () => {
        const money = 构建双重字段金钱({ 银子: 6270, baseAmount: 6270000 });
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['银子', 'baseAmount'])) as any;
        expect(next.金钱.银子).toBe(6270);
        expect(next.金钱.中层货币).toBe(6270);
        expect(next.金钱.baseAmount).toBe(6270000);
        expect(计算金钱BaseAmount总值(next.金钱)).toBe(6270000);
    });

    it('只写别名：银子=4000 → 中层货币同步，baseAmount 按三层重算', () => {
        const money = 构建双重字段金钱({ 银子: 4000 });
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['银子'])) as any;
        expect(next.金钱.中层货币).toBe(4000);
        expect(next.金钱.银子).toBe(4000);
        expect(next.金钱.baseAmount).toBe(4000000);
    });

    it('只写 baseAmount：分解为三层并同步旧别名', () => {
        const money = 构建双重字段金钱({ baseAmount: 6270000 });
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['baseAmount'])) as any;
        expect(next.金钱.上层货币).toBe(62);
        expect(next.金钱.中层货币).toBe(70);
        expect(next.金钱.底层货币).toBe(0);
        expect(next.金钱.金元宝).toBe(62);
        expect(next.金钱.银子).toBe(70);
        expect(next.金钱.baseAmount).toBe(6270000);
        expect(计算金钱BaseAmount总值(next.金钱)).toBe(6270000);
    });

    it('只写 baseAmount 时，存档中残留的题材别名（灵石）也对齐到分解后的层级值', () => {
        const money = { ...构建双重字段金钱({ baseAmount: 3501234 }), 灵石: 3500 };
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['baseAmount'])) as any;
        // 默认武侠汇率分解 3,501,234 = 35 上层 + 1 中层 + 234 底层
        expect(next.金钱.底层货币).toBe(234);
        expect(next.金钱.灵石).toBe(234);
        expect(next.金钱.铜钱).toBe(234);
        expect(next.金钱.baseAmount).toBe(3501234);
    });

    it('写别名路径同样对齐已存在的题材别名（灵晶 为中层别名）', () => {
        const money = { ...构建双重字段金钱({ 银子: 4000 }), 灵晶: 3500 };
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['银子'])) as any;
        expect(next.金钱.中层货币).toBe(4000);
        expect(next.金钱.灵晶).toBe(4000);
    });

    it('题材别名同步只覆盖已存在字段，不为无关题材新增键', () => {
        const money = 构建双重字段金钱({ 银子: 4000 });
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['银子'])) as any;
        expect(Object.prototype.hasOwnProperty.call(next.金钱, '灵晶')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(next.金钱, '灵石')).toBe(false);
    });

    it('题材别名（灵石）写入 → 底层货币同步', () => {
        const money = 构建双重字段金钱({ 灵石: 500 });
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['灵石'])) as any;
        expect(next.金钱.底层货币).toBe(500);
        expect(next.金钱.铜钱).toBe(500);
    });

    it('整对象 set 旧别名结构（无三层字段）→ 三层与 baseAmount 全部补齐一致', () => {
        const money = { 金元宝: 0, 银子: 6270, 铜钱: 0, baseAmount: 6270000 };
        const next = 同步金钱命令写入({ 金钱: money } as any, new Set(['金元宝', '银子', '铜钱', 'baseAmount'])) as any;
        expect(next.金钱.上层货币).toBe(0);
        expect(next.金钱.中层货币).toBe(6270);
        expect(next.金钱.底层货币).toBe(0);
        expect(next.金钱.baseAmount).toBe(6270000);
    });

    it('AI 未触碰任何金钱字段时原样返回', () => {
        const money = 构建双重字段金钱({});
        const role = { 金钱: money };
        expect(同步金钱命令写入(role, new Set())).toBe(role);
        expect(同步金钱命令写入(null, new Set(['银子']))).toBeNull();
    });
});

// ── 端到端：命令应用 → 写穿透 → 归一化后仍一致 ──────────────────
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

describe('端到端：AI 金钱命令不再被旧三层字段吞掉', () => {
    it('set 银子=6270 + set baseAmount=6270000 后，三层/别名/baseAmount 三者一致', () => {
        const state = 构建基础状态();
        state.角色 = { 姓名: '杨培强', 金钱: 构建双重字段金钱({}) } as any;
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '镖局结了账。' }],
            tavern_commands: [
                { action: 'set', key: '角色.金钱.银子', value: 6270 },
                { action: 'set', key: '角色.金钱.baseAmount', value: 6270000 }
            ]
        } as any, state, deps as any, undefined, { applyState: false }) as any;
        expect(result.角色.金钱.银子).toBe(6270);
        expect(result.角色.金钱.中层货币).toBe(6270);
        expect(result.角色.金钱.baseAmount).toBe(6270000);
    });

    it('AI 只发 set 银子 命令时，面板读取的中层货币同步更新', () => {
        const state = 构建基础状态();
        state.角色 = { 姓名: '杨培强', 金钱: 构建双重字段金钱({}) } as any;
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '当铺掌柜数出银两。' }],
            tavern_commands: [
                { action: 'set', key: '角色.金钱.银子', value: 4000 }
            ]
        } as any, state, deps as any, undefined, { applyState: false }) as any;
        expect(result.角色.金钱.银子).toBe(4000);
        expect(result.角色.金钱.中层货币).toBe(4000);
        expect(result.角色.金钱.baseAmount).toBe(4000000);
    });
});
