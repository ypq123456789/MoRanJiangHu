import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../services/ai/chatCompletionClient';
import * as workflow from '../hooks/useGame/variableReviewWorkflow';
import { findVariableReviewBeforeTurn, variableReviewErrorMessage } from '../hooks/useGame/variableReviewActions';
import { variableReviewBusinessSeal, mergeVariableReviewBusinessState } from '../hooks/useGame/variableReviewSnapshot';
import { extractReviewEconomicSnapshot } from '../hooks/useGame/variableReviewEconomy';
import { 获取变量计算接口配置 } from '../utils/apiConfig';
import { 规范化角色物品容器映射, 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import { createReviewRig, reviewOutput, reviewGold, reviewApi } from './helpers/variableReviewFixture';
vi.mock('../services/ai/chatCompletionClient', async original => ({ ...await original<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));
beforeEach(() => vi.mocked(client.请求模型文本).mockReset());
afterEach(() => vi.restoreAllMocks());
const coin = (n: number) => ({ ID: 'gold', 名称: '金元宝', 类型: '货币', 数量: n, 堆叠数量: n });
const setInventory = (items: any[]) => ({ action: 'set', key: '角色.物品列表', value: items });
const physicalRig = (current = 100, before = 100) => {
    const rig = createReviewRig('林岳获得100金元宝。');
    rig.dependencies.openingConfig = { 题材模式: '武侠' } as any;
    const role = (n: number) => 规范化角色物品容器映射({ ...rig.source.currentState.角色, 物品列表: [coin(n)], 已补齐系统丹药预设: true } as any, { 题材模式: '西幻' });
    rig.source.currentState.角色 = role(current);
    rig.source.beforeTurn!.state.角色 = role(before);
    return rig;
};
const propose = (commands: any[]) => vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput(commands));
describe('变量审查修复：真实请求/模拟/确认写回', () => {
    it.each([200, 100])('读档合成快照(%s)不能补发收入；无来源快照也不可信', async current => {
        const rig = createReviewRig();
        rig.source.currentState.角色.金钱 = { ...rig.source.currentState.角色.金钱, 金币: current, 金元宝: current, 上层货币: current, baseAmount: current * 100000 } as any;
        const snapshot = { 审查基准来源: '读档重建', 玩家输入: rig.source.history[0].content, 回档前历史: [], 回档前状态: rig.source.currentState } as any;
        expect(findVariableReviewBeforeTurn(rig.source.history, [snapshot])).toBeUndefined();
        expect(findVariableReviewBeforeTurn(rig.source.history, [{ ...snapshot, 审查基准来源: undefined }])).toBeUndefined();
        rig.source.beforeTurn = findVariableReviewBeforeTurn(rig.source.history, [snapshot]);
        propose([reviewGold]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toEqual([]);
        expect(result.rejectedCommands[0].code).toBe('insufficientEvidence');
        expect(result.changes).toEqual([]);
        expect((result.previewState.角色.金钱 as any).金币).toBe(current);
        expect(JSON.parse(vi.mocked(client.请求模型文本).mock.calls[0][1][2].content).beforeTurnState).toBeNull();
        expect(rig.commit).not.toHaveBeenCalled();
    });
    it('即使sourceTurnId匹配，直接传入未证明来源的before也不用于修复', async () => {
        const rig = createReviewRig(); delete rig.source.beforeTurn!.provenance;
        propose([reviewGold]); const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toHaveLength(0);
        expect(result.coverage.warnings.join('')).toContain('不可信');
    });
    it('实体货币整数组不能把正确结算200变成300，独立NPC修复仍可进行', async () => {
        const rig = physicalRig(200, 100);
        rig.source.history[1].structuredResponse!.logs.push({ sender: '旁白', text: 'Alice走进大厅，自我介绍。' });
        propose([setInventory([coin(300)]), { action: 'push', key: '社交', value: { id: 'NPC001', 姓名: 'Alice', 身份: '旅人' } }]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toHaveLength(1);
        expect(result.rejectedCommands.some(c => c.code === 'alreadySettled')).toBe(true);
        expect(result.previewState.角色.金钱.金元宝).toBe(200);
        // 直接重走生产review-apply分支，证明不是仅在preview时丢弃数组命令。
        const prepared = await workflow.prepareVariableReview(rig.source);
        const validation = await workflow.validateVariableReviewCommands(prepared, [setInventory([coin(300)])] as any, rig.dependencies);
        const execution = workflow.executeVariableReviewCommands(prepared, validation, rig.dependencies, 'review-apply');
        expect(execution.acceptedCommands).toEqual([]);
        expect(execution.rejectedCommands[0].code).toBe('alreadySettled');
        expect(execution.previewState.角色.金钱.金元宝).toBe(200);
        await rig.actions.applyVariableReview(result);
        expect(rig.source.currentState.角色.金钱.金元宝).toBe(200);
        expect(rig.source.currentState.社交[0].姓名).toBe('Alice');
    });
    it('有真实基准的实体货币漏结算100→200，preview/apply重执行各自验证实际总额', async () => {
        const rig = physicalRig(); propose([setInventory([coin(200)])]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toHaveLength(1);
        expect(result.previewState.角色.金钱.金元宝).toBe(200);
        expect(extractReviewEconomicSnapshot(result.previewState, rig.dependencies.openingConfig).total).toBe(20000000);
        expect(rig.source.currentState.角色.金钱.金元宝).toBe(100);
        result.previewState.角色.金钱.金元宝 = 999999; // 确认不信任旧预览
        await rig.actions.applyVariableReview(result);
        expect(rig.commit).toHaveBeenCalledTimes(1); expect(rig.save).toHaveBeenCalledTimes(1);
        expect(rig.source.currentState.角色.物品列表[0].堆叠数量).toBe(200);
        expect(rig.source.currentState.角色.金钱.金元宝).toBe(200);
        expect(rig.source.currentState.环境.时间).toBe('1:01:01:08:00');
    });
    it('直接钱包增量被实体货币normalize吞回，必须为ineffective，不能是假noChanges', async () => {
        const rig = physicalRig(); propose([{ ...reviewGold, key: '角色.金钱.金元宝' }]); const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toEqual([]); expect(result.changes).toEqual([]);
        expect(result.rejectedCommands[0].code).toBe('ineffective'); expect(result.status).toBe('blocked');
        expect(result.previewState.角色.金钱.金元宝).toBe(100);
    });
    it('混合修复也不能将被同步吞回的钱包命令标为accepted', async () => {
        const rig = physicalRig();
        rig.source.history[1].structuredResponse!.logs.push({ sender: '旁白', text: 'Alice走进大厅。' });
        propose([{ ...reviewGold, key: '角色.金钱.金元宝' }, { action: 'push', key: '社交', value: { id: 'NPC001', 姓名: 'Alice', 身份: '旅人' } }]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toHaveLength(1);
        expect(result.rejectedCommands[0].code).toBe('ineffective');
        await rig.actions.applyVariableReview(result);
        expect(rig.source.currentState.角色.金钱.金元宝).toBe(100);
        expect(rig.source.currentState.社交[0].姓名).toBe('Alice');
    });
    it('实体货币数组删除被旧钱包吞回时，库存diff不能冒充有效收支修复', async () => {
        const rig = physicalRig();
        rig.source.history[1].structuredResponse!.logs[0].text = '林岳支付100金元宝，消耗全部货币。';
        propose([setInventory([])]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toEqual([]);
        expect(result.rejectedCommands[0].code).toBe('ineffective');
        expect(result.changes).toEqual([]);
        expect(result.previewState.角色.物品列表[0].堆叠数量).toBe(100);
    });
    it('同币种多个收支加另一币种事实时仍保守拒绝，不能忽略部分事实', async () => {
        const rig = physicalRig();
        rig.source.history[1].structuredResponse!.logs[0].text = '林岳获得100金元宝。林岳支付20金元宝。林岳获得10银子。';
        propose([setInventory([coin(101)])]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toEqual([]);
        expect(result.rejectedCommands[0].code).toBe('insufficientEvidence');
        expect(result.changes).toEqual([]);
    });
    it.each([['new', 2], ['delete', 0], ['count', 3]])('没有可信基准时库存整数组%s数量不可变化', async (_kind, count) => {
        const rig = createReviewRig('林岳获得两枚回气丹。');
        const pill: any = { ID: 'pill', 名称: '回气丹', 类型: '药品', 堆叠数量: 1 };
        rig.source.currentState.角色.物品列表 = [pill]; rig.source.beforeTurn = undefined;
        propose([setInventory(count ? [{ ...pill, 堆叠数量: count }] : [])]);
        const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toEqual([]); expect(result.changes).toEqual([]);
        expect(['insufficientEvidence', 'safety']).toContain(result.rejectedCommands[0].code);
    });
    it.each([['林岳获得一枚回气丹。', 2], ['林岳消耗一枚回气丹。', 0]])('有基准的明确获得/消耗%s可安全修复整数组', async (body, count) => {
        const rig = createReviewRig(body); const pill: any = { ID: 'pill', 名称: '回气丹', 类型: '药品', 堆叠数量: 1 };
        rig.source.currentState.角色.物品列表 = [pill]; rig.source.beforeTurn!.state.角色.物品列表 = [structuredClone(pill)];
        propose([setInventory(count ? [{ ...pill, 堆叠数量: count }] : [])]);
        const result = await rig.actions.reviewVariables(); expect(result.acceptedCommands).toHaveLength(1);
        await rig.actions.applyVariableReview(result);
        expect(rig.source.currentState.角色.物品列表).toHaveLength(count ? 1 : 0);
        if (count) expect(rig.source.currentState.角色.物品列表[0].堆叠数量).toBe(count);
    });
    it('库存已经结算，整数组重复增量仍拒绝', async () => {
        const rig = createReviewRig('林岳获得一枚回气丹。'); const pill: any = { ID: 'pill', 名称: '回气丹', 类型: '药品', 堆叠数量: 1 };
        rig.source.currentState.角色.物品列表 = [{ ...pill, 堆叠数量: 2 }]; rig.source.beforeTurn!.state.角色.物品列表 = [pill];
        propose([setInventory([{ ...pill, 堆叠数量: 3 }])]); const result = await rig.actions.reviewVariables();
        expect(result.acceptedCommands).toEqual([]); expect(result.rejectedCommands[0].code).toBe('alreadySettled');
    });
    it('缺少图片ID/时间的NPC在不同时间preview/apply一致，最新头像不丢失', async () => {
        const rig = createReviewRig('江婉向林岳表达好感。');
        rig.source.currentState.社交 = 规范化社交列表([{ id: 'NPC001', 姓名: '江婉', 好感度: 0 }]);
        const images = { 香闺秘档部位档案: { 胸部: { 图片URL: 'https://image.test/old.png' } } };
        rig.source.currentState.社交[0].图片档案 = images;
        propose([{ action: 'set', key: '社交[0].好感度', value: 20 }]);
        vi.spyOn(Date, 'now').mockReturnValue(1000);
        const result = await rig.actions.reviewVariables();
        expect(result.changes.some(change => /图片|生成时间/.test(change.path))).toBe(false);
        const prepared = await workflow.prepareVariableReview(rig.source);
        const validation = await workflow.validateVariableReviewCommands(prepared, result.acceptedCommands, rig.dependencies);
        vi.mocked(Date.now).mockReturnValue(2000);
        expect(workflow.executeVariableReviewCommands(prepared, validation, rig.dependencies, 'review-apply').changes).toEqual(result.changes);
        images.香闺秘档部位档案.胸部.图片URL = 'https://image.test/new.png';
        await rig.actions.checkVariableReviewCurrent(result);
        await rig.actions.applyVariableReview(result);
        expect(rig.source.currentState.社交[0].图片档案).toBe(images);
        expect(images.香闺秘档部位档案.胸部).toEqual({ 图片URL: 'https://image.test/new.png' });
        expect(rig.source.currentState.社交[0].好感度).toBe(20);
        expect(rig.save.mock.calls[0][0].社交[0].图片档案).toBe(images);
    });
    it('审查命令不能通过直接图片字段触发随机metadata', async () => {
        const rig = createReviewRig(); rig.source.currentState.社交 = [{ id: 'NPC001', 姓名: '江婉', 图片档案: {} }];
        propose([{ action: 'set', key: '社交[0].图片档案', value: { 图片URL: 'test' } }]);
        const result = await rig.actions.reviewVariables(); expect(result.acceptedCommands).toEqual([]);
        expect(result.rejectedCommands[0].reason).toContain('图片');
    });
});

describe('手动审查严格配置，普通调用保持fallback', () => {
    const config = (feature: any) => ({ ...reviewApi, configs: [{ ...reviewApi.configs[0], id: 'main', baseUrl: 'https://story.test/v1' }, { ...reviewApi.configs[0], id: 'variable', baseUrl: 'https://variable.test/v1' }], 功能模型占位: feature });
    it('指定变量渠道仅请求变量provider，自动关闭仍可手动调用', async () => {
        const rig = createReviewRig(); rig.dependencies.apiConfig = config({ 变量计算渠道ID: 'variable', 变量计算使用模型: 'review-model', 变量计算独立模型开关: false });
        propose([]); await rig.actions.reviewVariables();
        expect(vi.mocked(client.请求模型文本).mock.calls[0][0].baseUrl).toBe('https://variable.test/v1');
        expect(获取变量计算接口配置(rig.dependencies.apiConfig)).toBeNull();
    });
    it('显式配置继承(空渠道ID+变量模型)使用当前渠道', () => {
        expect(获取变量计算接口配置(config({ 变量计算渠道ID: '', 变量计算使用模型: 'review-model' }), { manualReview: true })?.baseUrl).toBe('https://story.test/v1');
    });
    it.each([
        [{ 变量计算渠道ID: 'deleted', 变量计算使用模型: 'review' }, '已失效'],
        [{}, '请先配置变量计算 API'],
        [{ 变量计算API密钥: 'test-key' }, '配置不完整'],
        [{ 变量计算渠道ID: 'variable', 变量计算API地址: 'https://custom.test/v1', 变量计算使用模型: 'review' }, '缺少 API key'],
        [{ 变量计算渠道ID: 'variable', 变量计算API地址: 'https://custom.test/v1', 变量计算API密钥: 'test-key' }, '缺少 model']
    ])('失效或不完整配置%j从真实workflow报错，不向正文API发送', async (feature, message) => {
        const rig = createReviewRig(); rig.dependencies.apiConfig = config(feature);
        const error = await rig.actions.reviewVariables().catch(error => error);
        expect(error.message).toContain(message);
        expect(variableReviewErrorMessage(error).code).toBe('apiConfig');
        expect(client.请求模型文本).not.toHaveBeenCalled();
    });
    it.each(['baseUrl', 'apiKey', 'model'])('选定渠道缺%s时明确报错', field => {
        const settings = config({ 变量计算渠道ID: 'variable' }); settings.configs[1][field] = '';
        expect(() => 获取变量计算接口配置(settings, { manualReview: true })).toThrow('配置不完整');
    });
    it('普通自动变量旧失效渠道fallback不变', () => {
        expect(获取变量计算接口配置(config({ 变量计算渠道ID: 'deleted', 变量计算使用模型: 'review', 变量计算独立模型开关: true }))?.baseUrl).toBe('https://story.test/v1');
    });
    it('继承目标失效也不得静默选择另一个主渠道', async () => {
        const rig = createReviewRig();
        rig.dependencies.apiConfig = { ...config({ 变量计算渠道ID: '', 变量计算使用模型: 'review' }), activeConfigId: 'deleted' };
        const error = await rig.actions.reviewVariables().catch(error => error);
        expect(error.message).toContain('继承渠道已失效');
        expect(variableReviewErrorMessage(error).code).toBe('apiConfig');
        expect(client.请求模型文本).not.toHaveBeenCalled();
    });
    it('只有独立URL/key/model的完整变量连接无需借用正文provider', async () => {
        const rig = createReviewRig();
        rig.dependencies.apiConfig = { configs: [], 功能模型占位: { 变量计算API地址: 'https://variable.test/v1', 变量计算API密钥: 'variable-key', 变量计算使用模型: 'review' } };
        propose([]); await rig.actions.reviewVariables();
        const api = vi.mocked(client.请求模型文本).mock.calls[0][0];
        expect(api.baseUrl).toBe('https://variable.test/v1');
        expect(api.apiKey).toBe('variable-key');
        expect(api.model).toBe('review');
    });
});

describe('完整业务指纹、同步seal和大对象边界', () => {
    it.each(['money', 'item', 'equipment', 'skill', 'npc', 'npcId', 'task', 'battle', 'sect', 'environment', 'world', 'body', 'command', 'input', 'turn', 'before'])('%s变化必须使fingerprint与同步seal同时改变', async kind => {
        const rig = createReviewRig(); const input: any = rig.source;
        input.currentState.社交 = [{ id: 'NPC001', 姓名: 'Alice', 好感度: 0 }];
        const fingerprint = await workflow.createVariableReviewFingerprint(input); const seal = variableReviewBusinessSeal(input);
        if (kind === 'money') input.currentState.角色.金钱.金币++;
        if (kind === 'item') input.currentState.角色.物品列表.push({ ID: 'new', 名称: '铁剑' });
        if (kind === 'equipment') input.currentState.角色.装备.武器 = { ID: 'new', 名称: '铁剑' };
        if (kind === 'skill') input.currentState.角色.功法列表 = [{ 名称: '疾风斩' }];
        if (kind === 'npc') input.currentState.社交[0].好感度++;
        if (kind === 'npcId') input.currentState.社交[0].id = 'NPC002';
        if (kind === 'task') input.currentState.任务列表[0].状态 = '进行中';
        if (kind === 'battle') input.currentState.战斗.是否战斗中 = true;
        if (kind === 'sect') input.currentState.玩家门派.名称 = '青城';
        if (kind === 'environment') input.currentState.环境.时间 = '1:01:01:09:00';
        if (kind === 'world') input.currentState.世界.地图层级[0].名称 = '酒馆';
        if (kind === 'body') input.history[1].structuredResponse!.logs[0].text += '你走出门。';
        if (kind === 'command') input.history[1].structuredResponse!.tavern_commands.push(reviewGold as any);
        if (kind === 'input') input.history[0].content += '然后休息';
        if (kind === 'turn') input.history[1].timestamp++;
        if (kind === 'before') input.beforeTurn!.state.角色.年龄++;
        expect(await workflow.createVariableReviewFingerprint(input)).not.toBe(fingerprint);
        expect(variableReviewBusinessSeal(input)).not.toBe(seal);
    });
    it('AI裁剪之外的数组尾部仍参与完整业务fingerprint', async () => {
        const rig = createReviewRig(); rig.source.maxArrayItems = 2;
        rig.source.currentState.社交 = Array.from({ length: 501 }, (_, i) => ({ id: `NPC${i}`, 姓名: `已有${i}`, 好感度: 0 }));
        const first = await workflow.prepareVariableReview(rig.source);
        expect(first.coverage.truncated).toBe(true);
        rig.source.currentState.社交[500].好感度++;
        expect(await workflow.createVariableReviewFingerprint(rig.source)).not.toBe(first.stateFingerprint);
    });
    it('不读取大型图片/cache和非目标回合原文；指纹和AI上下文独立于图片大小', async () => {
        const rig = createReviewRig(); const baseline = await workflow.createVariableReviewFingerprint(rig.source);
        Object.defineProperty(rig.source.currentState.角色, '头像', { enumerable: true, get: () => { throw new Error('不应读取图片'); } });
        Object.defineProperty(rig.source.currentState.角色, 'cache', { enumerable: true, get: () => { throw new Error('不应读取cache'); } });
        Object.defineProperty(rig.source.history[1], 'rawJson', { enumerable: true, get: () => { throw new Error('不应读取完整协议'); } });
        Object.defineProperty(rig.source.currentState, '记忆系统', { enumerable: true, get: () => { throw new Error('不应复制全记忆'); } });
        expect(await workflow.createVariableReviewFingerprint(rig.source)).toBe(baseline);
        const prepared = await workflow.prepareVariableReview(rig.source);
        expect(prepared.stateJson).not.toMatch(/头像|cache|rawJson/);
        const other = createReviewRig(); (other.source.currentState.角色 as any).头像 = 'data:image/png;base64,' + 'A'.repeat(2000000);
        expect(await workflow.createVariableReviewFingerprint(other.source)).toBe(baseline);
        expect(variableReviewBusinessSeal(other.source)).toBe(variableReviewBusinessSeal(rig.source));
    });
    it('按稳定身份保留非业务图片，装备换ID不继承旧物品头像', () => {
        const rig = createReviewRig(); const image = { 图片URL: 'old' };
        (rig.source.currentState.角色.装备 as any).武器 = { ID: 'old', 名称: '铁剑', 图片档案: image };
        const business = structuredClone(rig.source.currentState); (business.角色.装备 as any).武器 = { ID: 'new', 名称: '长剑' };
        expect((mergeVariableReviewBusinessState(rig.source.currentState, business).角色.装备 as any).武器.图片档案).toBeUndefined();
    });
});
