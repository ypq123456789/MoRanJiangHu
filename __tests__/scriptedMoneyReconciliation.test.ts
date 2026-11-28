import { describe, expect, it, beforeEach } from 'vitest';
import { 执行响应命令处理, 响应命令处理状态 } from '../hooks/useGame/responseCommandProcessor';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import { 计算金钱BaseAmount总值 } from '../utils/currencyDisplay';
import {
    addScriptedMoneyDelta,
    consumeScriptedMoneyDelta,
    peekScriptedMoneyDelta,
    resetScriptedMoneyDelta
} from '../utils/scriptedMoneyReconciler';

// ── 累加器单元测试 ──────────────────────────────────────────────
describe('scriptedMoneyReconciler accumulator', () => {
    beforeEach(() => resetScriptedMoneyDelta());

    it('累加正数增量，consume 后清零', () => {
        addScriptedMoneyDelta(30);
        addScriptedMoneyDelta(20);
        expect(peekScriptedMoneyDelta()).toBe(50);
        expect(consumeScriptedMoneyDelta()).toBe(50);
        expect(peekScriptedMoneyDelta()).toBe(0);
    });

    it('忽略负数与非法值，避免脚本误登记导致金额异常', () => {
        addScriptedMoneyDelta(-100);
        addScriptedMoneyDelta(NaN);
        addScriptedMoneyDelta(0);
        expect(peekScriptedMoneyDelta()).toBe(0);
    });

    it('reset 可清除未消费的残留增量（应对上一轮中断）', () => {
        addScriptedMoneyDelta(999);
        resetScriptedMoneyDelta();
        expect(peekScriptedMoneyDelta()).toBe(0);
    });
});

// ── 端到端：脚本化金钱对账 ──────────────────────────────────────
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

describe('scripted money reconciliation vs variable model', () => {
    beforeEach(() => resetScriptedMoneyDelta());

    it('AI 绝对 set 角色.金钱 之后仍保留脚本登记的拍卖收入（修复：下回合脚本加的钱被变量更新吞了）', () => {
        const state = 构建基础状态();
        state.角色 = { 姓名: '杨培强', 金钱: { 底层货币: 100 } } as any;
        // 模拟拍卖行结算脚本在变量模型启用路径下登记的增量
        addScriptedMoneyDelta(50);
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '夜深，账房结算。' }],
            tavern_commands: [
                // AI 变量模型基于旧快照给出绝对金额（未包含本回合拍卖收入）
                { action: 'set', key: '角色.金钱', value: { 底层货币: 100 } }
            ]
        } as any, state, deps as any, undefined, { applyState: false }) as any;
        expect(计算金钱BaseAmount总值(result.角色.金钱)).toBe(150);
    });

    it('未登记脚本增量时，AI 的绝对 set 金额不被篡改', () => {
        const state = 构建基础状态();
        state.角色 = { 姓名: '杨培强', 金钱: { 底层货币: 100 } } as any;
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '无事发生。' }],
            tavern_commands: [
                { action: 'set', key: '角色.金钱', value: { 底层货币: 100 } }
            ]
        } as any, state, deps as any, undefined, { applyState: false }) as any;
        expect(计算金钱BaseAmount总值(result.角色.金钱)).toBe(100);
    });

    it('变量模型未下发金钱命令时，脚本增量也正确叠加到当前金额上', () => {
        const state = 构建基础状态();
        state.角色 = { 姓名: '杨培强', 金钱: { 底层货币: 80 } } as any;
        addScriptedMoneyDelta(70);
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '江湖买家取走了寄售的货物。' }],
            tavern_commands: []
        } as any, state, deps as any, undefined, { applyState: false }) as any;
        expect(计算金钱BaseAmount总值(result.角色.金钱)).toBe(150);
    });

    it('模拟(applyState:false)只预览不消费增量，真实落地(applyState:true)才消费——修复 CodeRabbit 指出的 High 风险', () => {
        addScriptedMoneyDelta(50);
        const resp = {
            logs: [{ sender: '旁白', text: '账房结算寄售。' }],
            tavern_commands: [
                // AI 变量模型基于旧快照给出绝对金额（未包含本回合拍卖收入）
                { action: 'set', key: '角色.金钱', value: { 底层货币: 100 } }
            ]
        } as any;
        const 造状态 = () => {
            const s = 构建基础状态();
            s.角色 = { 姓名: '杨培强', 金钱: { 底层货币: 100 } } as any;
            return s;
        };
        // 模拟/预览阶段：结果应叠加增量，但累加器不被消费，供后续真实落地使用
        const simResult = 执行响应命令处理(resp, 造状态(), deps as any, undefined, { applyState: false }) as any;
        expect(计算金钱BaseAmount总值(simResult.角色.金钱)).toBe(150);
        expect(peekScriptedMoneyDelta()).toBe(50);
        // 真实落地阶段：再次叠加并消费累加器
        const realResult = 执行响应命令处理(resp, 造状态(), deps as any, undefined, { applyState: true }) as any;
        expect(计算金钱BaseAmount总值(realResult.角色.金钱)).toBe(150);
        expect(peekScriptedMoneyDelta()).toBe(0);
    });
});
