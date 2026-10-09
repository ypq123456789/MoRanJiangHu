import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../services/ai/chatCompletionClient';
import { createReviewRig, reviewOutput } from './helpers/variableReviewFixture';
import { hasExplicitReviewTimeEvidence } from '../hooks/useGame/variableReviewTimeEvidence';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';
vi.mock('../services/ai/chatCompletionClient', async original => ({ ...await original<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));
beforeEach(() => vi.mocked(client.请求模型文本).mockReset());
const timeCommand = (value: string) => ({ action: 'set', key: '环境.时间', value });
describe('时间陈旧值窄例外：生产preview和apply重新校验', () => {
    it.each([
        ['第二天清晨六点已到。', '1:12:21:22:00', '1:12:22:06:00'],
        ['晚上十点众人回房。次日清晨六点已到。', '1:12:21:22:00', '1:12:22:06:00'],
        ['晚上八点，众人已经抵达大厅。', '1:12:21:18:00', '1:12:21:20:00'],
        ['三小时后，众人抵达大厅。', '1:12:21:22:00', '1:12:22:01:00'],
        ['2026年12月22日清晨六点，众人起身。', '2026:12:21:22:00', '2026:12:22:06:00']
    ])('%s只纠正最终时间，所有回合副作用保持关闭', async (body, beforeTime, nextTime) => {
        const rig = createReviewRig(body);
        rig.source.currentState.环境.时间 = beforeTime; rig.source.beforeTurn!.state.环境.时间 = beforeTime;
        rig.source.currentState.角色.玩家BUFF = [{ 索引: 0, 名称: '清心', 描述: '短暂状态', 效果: '精神稳定性提高20%', 结束时间: beforeTime.replace(/:\d{2}:\d{2}$/, ':23:00') }] as any;
        rig.source.currentState.社交 = 规范化社交列表([{ id: 'N1', 姓名: '江婉', 性别: '女', 是否怀孕: true, 怀孕天数: 10 }]);
        const before = structuredClone(rig.source.currentState);
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([timeCommand(nextTime), { action: 'set', key: '角色.年龄', value: 19 }]));
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toHaveLength(2); expect(result.previewState.环境.时间).toBe(nextTime);
        expect(rig.source.currentState).toEqual(before); expect(rig.commit).not.toHaveBeenCalled();
        expect(result.reconciled!.changes.find(change => change.path === '环境.时间')?.category).toBe('correction');
        await rig.actions.applyVariableReview(result);
        expect(rig.source.currentState.环境.时间).toBe(nextTime);
        expect(rig.source.currentState.角色.金钱).toEqual(before.角色.金钱);
        expect(rig.source.currentState.角色.玩家BUFF).toEqual(before.角色.玩家BUFF);
        for (const root of ['社交', '世界', '任务列表', '约定列表', '战斗']) expect((rig.source.currentState as any)[root]).toEqual((before as any)[root]);
        expect(rig.source.history).toHaveLength(2); expect(rig.commit).toHaveBeenCalledTimes(1); expect(rig.save).toHaveBeenCalledTimes(1);
    });
    it.each([
        ['天亮了。', '1:01:02:06:00'], ['大概三小时后会抵达。', '1:01:01:11:00'],
        ['如果第二天清晨六点出发。', '1:01:02:06:00'], ['他说明天晚上八点见。', '1:01:02:20:00'],
        ['晚上八点还没到。', '1:01:01:20:00'], ['上午八点出发，下午两点抵达。', '1:01:01:14:00'],
        ['第二天上午八点已到。第二天清晨六点已到。', '1:01:02:06:00'],
        ['晚上八点已经到达。', '1:01:01:21:00'], ['他低声说：“晚上八点。”', '1:01:01:20:00']
    ])('%s不能支持候选时间，仅保留疑点', async (body, nextTime) => {
        const rig = createReviewRig(body);
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([timeCommand(nextTime)]));
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toHaveLength(0); expect(result.changes).toEqual([]);
        expect(result.previewState.环境.时间).toBe('1:01:01:08:00'); expect(result.issues[0].description).toContain('本次未修改');
    });
    it('相对时长不以current叠加，没有可信before时不放行；已结算也不重复推进', async () => {
        const rig = createReviewRig('三小时后，抵达大厅。');
        rig.source.currentState.环境.时间 = '1:01:01:11:00';
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([timeCommand('1:01:01:14:00')]));
        expect((await rig.actions.reviewVariables()).acceptedCommands).toHaveLength(0);
        rig.source.beforeTurn = undefined;
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([timeCommand('1:01:01:14:00')]));
        expect((await rig.actions.reviewVariables()).acceptedCommands).toHaveLength(0);
    });
    it('apply重验篡改的时间命令，不使用previewState', async () => {
        const rig = createReviewRig('三小时后，抵达大厅。');
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([timeCommand('1:01:01:11:00')]));
        const result = await rig.actions.reviewVariables(); result.acceptedCommands[0].value = '1:01:01:12:00';
        await rig.actions.applyVariableReview(result);
        expect(rig.source.currentState.环境.时间).toBe('1:01:01:11:00'); // apply只使用已签发的命令副本并重新执行
        expect(rig.commit).toHaveBeenCalledTimes(1);
    });
});
describe('证据格式边界', () => {
    it('明确完整日期无需before，非法时分与初始时间不构成证据', () => {
        expect(hasExplicitReviewTimeEvidence('2026:12:22:06:00', '2026年12月22日清晨六点已到。')).toBe(true);
        expect(hasExplicitReviewTimeEvidence('2026:12:22:26:00', '2026年12月22日26:00已到。')).toBe(false);
        expect(hasExplicitReviewTimeEvidence('1:01:02:06:00', '第二天清晨六点已到。')).toBe(false);
    });
});
