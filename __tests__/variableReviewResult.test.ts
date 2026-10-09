import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../services/ai/chatCompletionClient';
import { runVariableReview } from '../hooks/useGame/variableReviewWorkflow';
import { reconcileVariableReviewResult } from '../hooks/useGame/variableReviewResult';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import { 规范化世界状态 } from '../hooks/useGame/storyState';
import { createReviewRig, reviewOutput, reviewGold } from './helpers/variableReviewFixture';
vi.mock('../services/ai/chatCompletionClient', async original => ({ ...await original<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));
beforeEach(() => vi.mocked(client.请求模型文本).mockReset());
const output = (commands: any[], reports: string[]) => reviewOutput(commands).replace('正文与变量已对比。', reports.join('\n'));
const finding = (kind: '修复' | '疑点', path: string, description: string, evidence = '', expected?: unknown) => `${kind}：${JSON.stringify({ path, description, evidence, ...(expected === undefined ? {} : { expected }) })}`;
describe('结果收束经过真实validation与simulation', () => {
    it('时间和天气明确修改进入实际修正，不再重复显示为疑点', async () => {
        const body = '翌日清晨六点已到，暴雪已经停止。'; const rig = createReviewRig(body);
        rig.source.currentState.环境.时间 = '1:12:21:22:00'; rig.source.beforeTurn!.state.环境.时间 = '1:12:21:22:00'; rig.source.currentState.环境.天气 = { 天气: '暴雪', 结束日期: '' };
        const commands = [{ action: 'set', key: '环境.时间', value: '1:12:22:06:00' }, { action: 'set', key: '环境.天气.天气', value: '暴雪已停止' }];
        vi.mocked(client.请求模型文本).mockResolvedValue(output(commands, [finding('疑点', '环境.时间', '时间无法确定，应更新为清晨', body, commands[0].value), finding('疑点', '环境.天气.天气', '天气状态不确定', body, commands[1].value)]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.acceptedCommands).toHaveLength(2); expect(result.issues).toEqual([]);
        expect(result.reconciled!.changes.some(change => change.path === '环境.时间' && change.category === 'correction')).toBe(true);
        expect(result.reconciled!.changes.some(change => change.path === '环境.天气.天气' && change.after === '暴雪已停止')).toBe(true);
        expect(result.reconciled!.counts.cleanup).toBe(0);
    });
    it('换装、移动及允许的记忆命令只在真实diff成立时展示；位置冲突仍未处理', async () => {
        const body = '沈清辞更换为米色纯棉居家服，走进卫生间。林开泰的位置线索冲突，无法确认最新位置。';
        const rig = createReviewRig(body);
        rig.source.currentState.社交 = 规范化社交列表([{ id: 'NPC-A', 姓名: '沈清辞', 性别: '女', 衣着风格: '冬装', 当前位置: '客厅', 记忆: [] }, { id: 'NPC-B', 姓名: '林开泰', 性别: '男', 当前位置: '书房' }]);
        const commands = [{ action: 'set', key: '社交[0].衣着风格', value: '米色纯棉居家服' }, { action: 'set', key: '社交[0].当前位置', value: '卫生间' }, { action: 'push', key: '社交[0].记忆', value: { 内容: '更换居家服后进入卫生间', 时间: '1:01:01:08:00' } }];
        vi.mocked(client.请求模型文本).mockResolvedValue(output(commands, [finding('疑点', '社交[0].衣着风格', '衣服不确定，需要更新', body), finding('疑点', '社交[0].当前位置', '地点不确定，应更新', body), finding('疑点', '社交[1].当前位置', '位置冲突，无法确认最新位置', body)]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.reconciled!.changes.some(change => change.path === '社交[0].衣着风格' && change.category === 'correction')).toBe(true);
        expect(result.reconciled!.changes.some(change => change.path === '社交[0].当前位置')).toBe(true);
        expect(result.issues).toHaveLength(1); expect(result.issues[0].description).toContain('林开泰'); expect(result.issues[0].description).toContain('本次未修改');
        expect(result.previewState.社交[1].当前位置).toBe('书房');
        if (result.acceptedCommands.some(command => command.key.includes('记忆'))) expect(result.reconciled!.changes.some(change => change.path.includes('记忆'))).toBe(true);
    });
    it('正文确认过期BUFF删除，数组移动不是一串修正，cleanup计数准确', async () => {
        const body = '强行压制情欲已经过期，状态恢复；清心效果仍然有效。'; const rig = createReviewRig(body);
        rig.source.currentState.角色.玩家BUFF = [{ 索引: 0, 名称: '强行压制情欲', 描述: '暂时压制', 效果: '精神稳定性提高20%', 结束时间: '1:01:01:07:00' }, { 索引: 1, 名称: '清心', 描述: '保持清醒', 效果: '精神稳定性提高20%', 结束时间: '1:01:02:08:00' }] as any;
        vi.mocked(client.请求模型文本).mockResolvedValue(output([{ action: 'delete', key: '角色.玩家BUFF[0]' }], [finding('疑点', '角色.玩家BUFF[0]', '临时状态是否结束无法确定', body)]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.acceptedCommands).toHaveLength(1); expect(result.issues).toEqual([]);
        expect(result.reconciled!.counts.cleanup).toBe(1);
        const cleaned = result.reconciled!.changes.find(change => change.path === '角色.玩家BUFF')!;
        expect(cleaned.reason).toContain('强行压制情欲'); expect(cleaned.after).toHaveLength(1); expect(result.previewState.角色.玩家BUFF![0].名称).toBe('清心');
    });
    it('未提及手机不能删除，拒绝不能伪装cleanup', async () => {
        const rig = createReviewRig('林岳走进大厅。'); rig.source.currentState.角色.物品列表 = [{ ID: 'phone', 名称: '手机', 类型: '工具', 堆叠数量: 1 }] as any;
        vi.mocked(client.请求模型文本).mockResolvedValue(output([{ action: 'delete', key: '角色.物品列表[0]' }], ['修复：已经清理未被提及的手机。']));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.acceptedCommands).toHaveLength(0); expect(result.reconciled!.counts.cleanup).toBe(0); expect(result.reconciled!.changes).toEqual([]);
        expect(result.previewState.角色.物品列表![0].名称).toBe('手机'); expect(result.summary).not.toContain('已经清理');
    });
    it('有可信before和明确消耗数量时，物品删除进入cleanup', async () => {
        const rig = createReviewRig('林岳消耗一枚回气丹。'); const pill = { ID: 'pill', 名称: '回气丹', 类型: '药品', 堆叠数量: 1 };
        rig.source.currentState.角色.物品列表 = [pill] as any; rig.source.beforeTurn!.state.角色.物品列表 = [structuredClone(pill)] as any;
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([{ action: 'delete', key: '角色.物品列表[0]' }]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.reconciled!.counts.cleanup).toBe(1); expect(result.previewState.角色.物品列表).toHaveLength(0);
    });
    it('有证据的重复世界记录可通过原保护清理，统计清理条目', async () => {
        const rig = createReviewRig('势力互动历史中同一条记录被完全重复保存，应保留一份。'); const record = { ID: 'FACT-1', 描述: '两派达成协议' };
        rig.source.currentState.世界 = 规范化世界状态({ 势力互动历史: [record, structuredClone(record)] });
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([{ action: 'set', key: '世界.势力互动历史', value: [record] }]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.acceptedCommands).toHaveLength(1); expect(result.previewState.世界.势力互动历史).toHaveLength(1); expect(result.reconciled!.counts.cleanup).toBe(1);
    });
    it('新实体只计一项补齐，AI摘要不决定分类', async () => {
        const rig = createReviewRig('Alice走进大厅，介绍自己是同行者。');
        vi.mocked(client.请求模型文本).mockResolvedValue(output([{ action: 'push', key: '社交', value: { id: 'A', 姓名: 'Alice', 身份: '同行者' } }], ['摘要：清理99项，删除全部旧NPC。']));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.reconciled!.counts.supplement).toBe(1); expect(result.reconciled!.counts.cleanup).toBe(0); expect(result.summary).not.toContain('99'); expect(result.issues).toEqual([]);
    });
    it('已有正确金额的重复命令不成为未处理疑点', async () => {
        const rig = createReviewRig('林岳获得100金币。');
        Object.assign(rig.source.currentState.角色.金钱, { 金币: 200, 金元宝: 200, 上层货币: 200, baseAmount: 20000000 });
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([reviewGold]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.rejectedCommands.some(command => command.code === 'alreadySettled')).toBe(true);
        expect(result.issues.every(issue => issue.code !== 'alreadySettled')).toBe(true);
    });
    it('混合命令里记忆被规范化丢弃，不能凭accepted宣称修复，保留有证据的未处理项', async () => {
        const body = '沈清辞换上居家服。'; const rig = createReviewRig(body);
        rig.source.currentState.社交 = 规范化社交列表([{ id: 'A', 姓名: '沈清辞', 衣着风格: '冬装', 记忆: [] }]);
        const commands = [{ action: 'set', key: '社交[0].衣着风格', value: '居家服' }, { action: 'push', key: '社交[0].记忆', value: '沈清辞换上居家服' }];
        vi.mocked(client.请求模型文本).mockResolvedValue(output(commands, [finding('修复', '社交[0].记忆', '记忆已补齐', body, ['沈清辞换上居家服'])]));
        const result = await runVariableReview(rig.source, rig.dependencies);
        expect(result.reconciled!.changes.every(change => !change.path.includes('记忆'))).toBe(true);
        expect(result.issues.some(issue => issue.code === 'ineffective' && issue.description.includes('本次未修改'))).toBe(true);
    });
    it('最终空结果状态依据真实未处理问题，不依据AI的状态自述', async () => {
        const rig = createReviewRig('Alice的位置线索冲突，无法确认最新位置。');
        rig.source.currentState.社交 = 规范化社交列表([{ id: 'A', 姓名: 'Alice', 当前位置: '大厅' }]);
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput().replace('正文与变量已对比。', finding('疑点', '社交[0].当前位置', '无法确认最新位置', 'Alice的位置线索冲突，无法确认最新位置。')));
        expect((await runVariableReview(rig.source, rig.dependencies)).status).toBe('insufficientEvidence');
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput([], '证据不足').replace('正文与变量已对比。', '疑点：不存在的路人身份无法确认。'));
        const empty = await runVariableReview(rig.source, rig.dependencies);
        expect(empty.status).toBe('noChanges'); expect(empty.issues).toEqual([]);
    });
});

describe('纯结果边界，不改变原simulation.diff', () => {
    it('AI自报已修复却没有diff，不能展示修改或臆测疑点', () => {
        const before = { 环境: { 天气: '暴雪' }, 社交: [] };
        const result = reconcileVariableReviewResult({ before, after: before, body: '下着暴雪。', changes: [], acceptedCommands: [], rejectedCommands: [], reports: ['已修复天气为晴天。', '疑点：不存在的路人身份无法确认。'] });
        expect(result.changes).toEqual([]); expect(result.issues).toEqual([]); expect(result.counts.cleanup).toBe(0);
    });
    it('其它字段修复不能吞掉同NPC的身份疑点，目标值不一致不能判已解决', () => {
        const before = { 社交: [{ 姓名: 'Alice', 身份: '未知', 衣着风格: '红裙' }], 环境: { 天气: '雪' } }, after = { 社交: [{ 姓名: 'Alice', 身份: '未知', 衣着风格: '蓝裙' }], 环境: { 天气: '雪停' } };
        const result = reconcileVariableReviewResult({ before, after, body: 'Alice换上蓝裙，雪停了。', changes: [{ path: '社交[0].衣着风格', before: '红裙', after: '蓝裙' }, { path: '环境.天气', before: '雪', after: '雪停' }], acceptedCommands: [{ action: 'set', key: '社交[0].衣着风格', value: '蓝裙' }, { action: 'set', key: '环境.天气', value: '雪停' }], rejectedCommands: [], reports: [finding('疑点', '社交[0].身份', '身份无法确认', 'Alice换上蓝裙，雪停了。'), finding('疑点', '环境.天气', '具体天气无法确定', 'Alice换上蓝裙，雪停了。', '晴天')] });
        expect(result.issues).toHaveLength(2);
    });
    it('数字0与false不是空字段，正常修正不误归为补齐', () => {
        const result = reconcileVariableReviewResult({ before: { 角色: { 年龄: 0 }, 战斗: { 是否战斗中: false } }, after: { 角色: { 年龄: 18 }, 战斗: { 是否战斗中: true } }, body: '', changes: [{ path: '角色.年龄', before: 0, after: 18 }, { path: '战斗.是否战斗中', before: false, after: true }], acceptedCommands: [], rejectedCommands: [], reports: [] });
        expect(result.counts.supplement).toBe(0); expect(result.counts.correction).toBe(2);
    });
});
