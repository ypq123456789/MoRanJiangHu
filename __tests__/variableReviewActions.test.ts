import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../services/ai/chatCompletionClient';
import * as workflow from '../hooks/useGame/variableReviewWorkflow';
import { findVariableReviewBeforeTurn } from '../hooks/useGame/variableReviewActions';
import { addScriptedMoneyDelta, peekScriptedMoneyDelta, resetScriptedMoneyDelta } from '../utils/scriptedMoneyReconciler';
import { createReviewRig, reviewOutput, reviewGold } from './helpers/variableReviewFixture';
import { 执行响应命令处理 } from '../hooks/useGame/responseCommandProcessor';
import * as stateTransforms from '../hooks/useGame/stateTransforms';
import * as storyState from '../hooks/useGame/storyState';
vi.mock('../services/ai/chatCompletionClient', async importOriginal => ({ ...await importOriginal<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));
beforeEach(() => { vi.mocked(client.请求模型文本).mockReset(); resetScriptedMoneyDelta(); });
describe('确认应用的真实审查/解析/保护/执行链路', () => {
    it('不读取UI的previewState或可变命令，重新执行后仅写入/保存一次且不重放回合', async () => {
        const rig = createReviewRig();
        const originalHistory = structuredClone(rig.source.history);
        const originalTime = rig.source.currentState.环境.时间;
        addScriptedMoneyDelta(55);
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await rig.actions.reviewVariables();
        result.previewState.角色.金钱 = { 金元宝: 999999 } as any;
        result.acceptedCommands[0].value = 999999;
        const applied = await rig.actions.applyVariableReview(result);
        expect((rig.source.currentState.角色.金钱 as any).金币).toBe(200);
        expect(rig.source.currentState.环境.时间).toBe(originalTime);
        expect(rig.source.currentState.任务列表[0].状态).toBe('已完成');
        expect(peekScriptedMoneyDelta()).toBe(55);
        expect(rig.source.history).toEqual(originalHistory);
        expect(rig.commit).toHaveBeenCalledTimes(1);
        expect(rig.save).toHaveBeenCalledTimes(1);
        expect(rig.save.mock.calls[0][0]).toEqual(rig.source.currentState);
        expect(applied.saved).toBe(true);
        await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'consumed' });
        expect(rig.commit).toHaveBeenCalledTimes(1);
    });
    it('第一await前互斥，双击与保存延迟不会重复执行', async () => {
        const rig = createReviewRig();
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await rig.actions.reviewVariables();
        let finish!: () => void;
        rig.save.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ id: 1 }); }));
        const first = rig.actions.applyVariableReview(result);
        await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'busy' });
        await vi.waitFor(() => expect(rig.save).toHaveBeenCalledTimes(1));
        await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'busy' });
        finish(); await first;
        expect(rig.commit).toHaveBeenCalledTimes(1);
    });
    it.each(['state', 'body', 'turn', 'commands', 'input', 'snapshot'])('确认前%s变化后预览失效且不保存', async kind => {
        const rig = createReviewRig();
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await rig.actions.reviewVariables();
        const assistant = rig.source.history[1];
        if (kind === 'state') rig.source.currentState.角色.年龄++;
        if (kind === 'body') assistant.structuredResponse!.logs[0].text = '正文已修改';
        if (kind === 'turn') assistant.timestamp++;
        if (kind === 'commands') assistant.structuredResponse!.tavern_commands = [reviewGold as any];
        if (kind === 'input') rig.source.history[0].content = '改过的输入';
        if (kind === 'snapshot') rig.source.beforeTurn!.state.角色.年龄++;
        await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'stale' });
        expect(rig.commit).not.toHaveBeenCalled(); expect(rig.save).not.toHaveBeenCalled();
    });
    it('apply再次调用共用验证；新增拒绝不会写入部分结果', async () => {
        const rig = createReviewRig();
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await rig.actions.reviewVariables();
        const validate = vi.spyOn(workflow, 'validateVariableReviewCommands').mockResolvedValueOnce({ acceptedCommands: [], rejectedCommands: [{ command: reviewGold as any, code: 'insufficientEvidence', reason: '正文证据不再可用' }], nameContext: {} });
        try {
            await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'applyValidation' });
            expect(validate).toHaveBeenCalled(); expect(rig.commit).not.toHaveBeenCalled(); expect(rig.save).not.toHaveBeenCalled();
        } finally { validate.mockRestore(); }
    });
    it('保存失败报告已应用并消费结果，重试apply不重复增加金额', async () => {
        const rig = createReviewRig();
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await rig.actions.reviewVariables(); rig.save.mockRejectedValue(new Error('磁盘不可写'));
        await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'saveFailed', applied: true });
        await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'consumed' });
        expect((rig.source.currentState.角色.金钱 as any).金币).toBe(200); expect(rig.commit).toHaveBeenCalledTimes(1);
    });
    it('取消审查会中断AI，未发布结果也不会写入', async () => {
        const rig = createReviewRig();
        vi.mocked(client.请求模型文本).mockImplementation(() => new Promise(() => {}));
        const running = rig.actions.reviewVariables();
        const assertion = expect(running).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(client.请求模型文本).toHaveBeenCalled()); rig.actions.cancelVariableReview(); await assertion;
        expect(vi.mocked(client.请求模型文本).mock.calls[0][2].signal?.aborted).toBe(true); expect(rig.commit).not.toHaveBeenCalled();
    });
    it('普通回合正在运行不能审查；外来结果不能应用', async () => {
        const rig = createReviewRig(); rig.source.turnInProgress = true;
        await expect(rig.actions.reviewVariables()).rejects.toThrow('尚未完成');
        await expect(rig.actions.applyVariableReview({} as any)).rejects.toMatchObject({ code: 'applyValidation' });
    });
    it('回合前快照必须匹配真实输入与历史前缀，不按栈位置猜测', () => {
        const rig = createReviewRig();
        const snapshot = { 审查基准来源: '真实回合前', 玩家输入: '走进大厅', 回档前历史: [], 回档前状态: rig.source.beforeTurn!.state } as any;
        expect(findVariableReviewBeforeTurn(rig.source.history, [snapshot])?.sourceTurnId).toBe('assistant:2:1');
        expect(findVariableReviewBeforeTurn(rig.source.history, [{ ...snapshot, 玩家输入: '别的回合' }])).toBeUndefined();
        expect(findVariableReviewBeforeTurn(rig.source.history, [{ ...snapshot, 回档前历史: [rig.source.history[0]] }])).toBeUndefined();
    });
    it('review-apply执行器允许写入目标域，跳过普通回合校准和脚本对账', () => {
        const rig = createReviewRig(); const setter = vi.fn(); const calibrate = vi.fn(); const cleanup = vi.fn();
        addScriptedMoneyDelta(55);
        const next = 执行响应命令处理({ logs: [{ sender: '旁白', text: '林岳今年20岁。' }], tavern_commands: [{ action: 'set', key: '角色.年龄', value: 20 }] } as any,
            rig.source.currentState, { ...stateTransforms, ...storyState, 设置角色: setter, 命令后校准: calibrate, 战斗结束自动清空: cleanup } as any, undefined, { executionMode: 'review-apply' });
        expect(next.角色.年龄).toBe(20); expect(setter).toHaveBeenCalledTimes(1);
        expect(calibrate).not.toHaveBeenCalled(); expect(cleanup).not.toHaveBeenCalled(); expect(peekScriptedMoneyDelta()).toBe(55);
        expect(rig.source.currentState.角色.年龄).toBe(18);
    });
    it('应用重校验等待期间状态变化，也会在最终写回前再次拦截', async () => {
        const rig = createReviewRig(); vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await rig.actions.reviewVariables();
        const originalValidate = workflow.validateVariableReviewCommands;
        const validate = vi.spyOn(workflow, 'validateVariableReviewCommands').mockImplementationOnce(async (...args) => {
            const validation = await originalValidate(...args); rig.source.currentState.角色.年龄++; return validation;
        });
        try { await expect(rig.actions.applyVariableReview(result)).rejects.toMatchObject({ code: 'stale' }); expect(rig.commit).not.toHaveBeenCalled(); }
        finally { validate.mockRestore(); }
    });
});
