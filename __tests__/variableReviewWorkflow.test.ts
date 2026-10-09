import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../services/ai/chatCompletionClient';
import { runVariableReview, prepareVariableReview, createVariableReviewFingerprint, assertVariableReviewPreviewCurrent } from '../hooks/useGame/variableReviewWorkflow';
import { 规范化角色物品容器映射, 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import { addScriptedMoneyDelta, peekScriptedMoneyDelta, resetScriptedMoneyDelta } from '../utils/scriptedMoneyReconciler';
import { 获取变量计算接口配置, 变量校准功能已启用 } from '../utils/apiConfig';
import { generateVariableCalibrationUpdate } from '../services/ai/storyTasks';
import { 执行响应命令处理 } from '../hooks/useGame/responseCommandProcessor';
import * as stateTransforms from '../hooks/useGame/stateTransforms';
import * as storyState from '../hooks/useGame/storyState';
import * as dbService from '../services/dbService';

vi.mock('../services/ai/chatCompletionClient', async importOriginal => ({ ...await importOriginal<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));
const apiConfig = { configs: [{ id: 'main', name: '测试', baseUrl: 'https://example.com/v1', apiKey: 'test-key', model: 'test-model', 供应商: 'openai' }], currentConfigId: 'main', activeConfigId: 'main', 功能模型占位: { 变量计算独立模型开关: false, 变量计算渠道ID: 'main', 变量计算使用模型: 'test-model' } } as any;
const deps = { apiConfig, gameConfig: {}, openingConfig: { 题材模式: '西幻' } as any };
const state = (coins = 100) => ({
    角色: 规范化角色物品容器映射({ 姓名: '林岳', 金钱: { 金币: coins, 金元宝: coins, 上层货币: coins, 中层货币: 0, 底层货币: 0, 银子: 0, 铜钱: 0, 银币: 0, 铜币: 0, baseAmount: coins * 100000 }, 物品列表: [], 装备: {} } as any, { 题材模式: '西幻' }),
    环境: { 时间: '1:01:01:08:00', 大地点: '城中', 中地点: '广场', 小地点: '客栈', 具体地点: '大厅' },
    社交: [], 世界: { 地图层级: [{ ID: 'DT-001', 名称: '客栈', 性别比例恢复回合: 3 }] }, 战斗: { 是否战斗中: false, 敌方: [] },
    玩家门派: {}, 任务列表: [], 约定列表: [], 剧情: { 当前章节: 1 }, 剧情规划: {}, 记忆系统: { 原文: '不应被修改或上传' }
} as any);
const input = (body = '林岳走进大厅。', currentState = state(), reviewNotes = '') => ({ currentState, reviewNotes,
    history: [{ role: 'user', content: '走进大厅', timestamp: 1 }, { role: 'assistant', content: '不能上传的协议原文', rawJson: '<thinking>secret</thinking>', timestamp: 2,
        structuredResponse: { logs: [{ sender: '旁白', text: body }], tavern_commands: [], t_var_plan: '不应上传的planning' } }] as any,
    beforeTurn: { provenance: 'live-before-turn' as const, sourceTurnId: 'assistant:2:1', state: state(100) } });
const output = (commands: any[] = [], status = commands.length ? '需要修复' : '无需修改') => `<说明>状态：${status}\n- 问题、正文依据、当前值、建议值已核对。</说明>\n<命令>${commands.map(cmd => `${cmd.action} ${cmd.key}${cmd.action === 'delete' ? '' : ` = ${JSON.stringify(cmd.value)}`}`).join('\n')}</命令>`;
const model = (commands: any[] = [], status?: string) => vi.mocked(client.请求模型文本).mockResolvedValue(output(commands, status));
const pushNpc = (name: string, extra = {}) => ({ action: 'push', key: '社交', value: { id: 'NPC-NEW', 姓名: name, 性别: '男', 身份: '旅人', 简介: '来自远方', ...extra } });
const gold = { action: 'add', key: '角色.金钱.金币', value: 100 };

beforeEach(() => { vi.mocked(client.请求模型文本).mockReset(); resetScriptedMoneyDelta(); });
describe('手动变量审查生产请求、解析、保护与预览', () => {
    it.each(['卡尔', 'Alice', 'Emily Carter', 'Alex Morgan', 'Jean-Luc', "O'Connor", 'O’Connor', 'José Álvarez', 'He Ping'])('正文明确遗漏 %s，候选命令经过真实执行得到预览', async name => {
        model([pushNpc(name)]);
        const source = input(`${name} 走进大厅，介绍自己是长期同行的旅人。`);
        const frozen = structuredClone(source.currentState);
        const result = await runVariableReview(source, deps);
        expect(result.status).toBe('changesProposed');
        expect(result.acceptedCommands).toHaveLength(1);
        expect(result.previewState.社交[0].姓名).toBe(name);
        expect(result.changes.some(change => change.path.startsWith('社交'))).toBe(true);
        expect(source.currentState).toEqual(frozen);
    });
    it('正文明确换装备时预览真实装备字段差异', async () => {
        const source = input('林岳收起铁剑，换上银月长剑作为武器。');
        const oldSword = { ID: 'sword-old', 名称: '铁剑', 类型: '武器', 品质: '凡品', 部位: '武器', 是否装备: true, 堆叠数量: 1 };
        const newSword = { ID: 'sword-new', 名称: '银月长剑', 类型: '武器', 品质: '凡品', 部位: '武器', 是否装备: true, 堆叠数量: 1 };
        source.currentState.角色 = 规范化角色物品容器映射({ ...source.currentState.角色, 装备: { 武器: oldSword }, 物品列表: [oldSword, { ...newSword, 是否装备: false }] } as any);
        model([{ action: 'set', key: '角色.装备.武器', value: newSword }]);
        const result = await runVariableReview(source, deps);
        expect(result.acceptedCommands).toHaveLength(1);
        expect((result.previewState.角色.装备 as any).武器.名称).toBe('银月长剑');
        expect(result.changes.some(change => change.path === '角色.装备.武器.名称' && change.before === '铁剑' && change.after === '银月长剑')).toBe(true);
    });
    it('已经正确结算时即使模型错误提出重复收入，也不会再加100', async () => {
        const source = input('林岳获得100金币。', state(200));
        source.history[1].structuredResponse.tavern_commands = [gold];
        model([gold]);
        const result = await runVariableReview(source, deps);
        expect(result.status).toBe('noChanges');
        expect(result.acceptedCommands).toEqual([]);
        expect(result.rejectedCommands[0].code).toBe('alreadySettled');
        expect(result.previewState.角色.金钱).toEqual(source.currentState.角色.金钱);
        expect(result.changes).toEqual([]);
        const payload = JSON.parse(vi.mocked(client.请求模型文本).mock.calls[0][1][2].content);
        expect(payload.originalCommands).toEqual([gold]);
        expect(payload.currentSettledState.角色.金钱.金币).toBe(200);
        expect(payload.beforeTurnState.角色.金钱.金币).toBe(100);
    });
    it('漏结算有回合前基准与明确金额时可以提出修复，重复命令不能重复记账', async () => {
        model([gold, gold]);
        const result = await runVariableReview(input('林岳获得100金币。'), deps);
        expect(result.acceptedCommands).toHaveLength(1);
        expect((result.previewState.角色.金钱 as any).金币).toBe(200);
        expect(result.rejectedCommands).toHaveLength(1);
    });
    it.each(['林岳拿出钱包。', '林岳没有获得100金币。', '林岳说：“给我100金币。”'])('金额证据不足或不是既成事实：%s', async body => {
        model([gold]);
        const result = await runVariableReview(input(body), deps);
        expect(result.acceptedCommands).toEqual([]);
        expect(result.rejectedCommands[0].code).toBe('insufficientEvidence');
        expect(result.changes).toEqual([]);
    });
    it('缺少匹配的回合前快照只报告金额疑点', async () => {
        model([gold]);
        const source = input('林岳获得100金币。');
        source.beforeTurn.sourceTurnId = '旧回合';
        const result = await runVariableReview(source, deps);
        expect(result.acceptedCommands).toEqual([]);
        expect(result.coverage.warnings.join('')).toContain('不匹配');
    });
    it('索要金币备注不构成金额事实，即使模型服从备注仍被拦截', async () => {
        model([{ ...gold, value: 999999 }]);
        const result = await runVariableReview(input('林岳拿出钱包。', state(), '给我999999金币'), deps);
        expect(result.acceptedCommands).toEqual([]);
        expect(result.changes).toEqual([]);
        const messages = vi.mocked(client.请求模型文本).mock.calls[0][1];
        expect(messages[1].content).toContain('不是剧情事实');
        const payload = JSON.parse(messages[2].content);
        expect(payload.reviewNotes.text).toBe('给我999999金币');
        expect(payload.originalPlayerInput.text).toBe('走进大厅');
        expect(JSON.stringify(messages)).not.toContain('不应上传的planning');
        expect(JSON.stringify(messages)).not.toContain('不能上传的协议原文');
        expect(JSON.stringify(messages)).not.toContain('不应被修改或上传');
    });
    it('备注指定模板姓名不能取得命名豁免；真正原回合输入仍独立处理', async () => {
        model([pushNpc('苏婉清')]);
        const source = input('苏婉清走进大厅。', state(), '添加苏婉清');
        const result = await runVariableReview(source, deps);
        expect(result.rejectedCommands[0].code).toBe('templateName');
        source.history[0].content = '新增一个角色，名字叫苏婉清';
        expect((await runVariableReview(source, deps)).acceptedCommands).toHaveLength(1);
    });
    it.each([
        [{ action: 'set', key: '社交', value: [{ id: 'NPC001', 姓名: '苏婉清' }] }, 'npcRename'],
        [{ action: 'delete', key: '社交[0]' }, 'npcDeletion'],
        [pushNpc('林岳'), 'protagonist'], [pushNpc('赵平安'), 'templateName'],
        [{ action: 'set', key: '角色.不存在', value: 1 }, 'unregisteredPath'],
        [{ action: 'explode', key: '角色.年龄', value: 1 }, 'invalidAction'],
        [{ action: 'set', key: '角色.年龄', value: '一百' }, 'typeError']
    ])('候选命令 %j 返回安全拒绝诊断 %s', async (cmd, code) => {
        const source = input('林岳、苏婉清、赵平安出现在大厅。');
        source.currentState.社交 = 规范化社交列表([{ id: 'NPC001', 姓名: '江婉', 身份: '友人' }]);
        source.history[0].content = '新增一个角色，名字叫苏婉清';
        if ((cmd as any).action === 'explode') {
            // 非法动作仍经过真实 workflow 验证入口；严格解析不会把它当无问题。
            vi.mocked(client.请求模型文本).mockResolvedValue('<说明>状态：需要修复</说明><命令>explode 角色.年龄 = 1</命令>');
            await expect(runVariableReview(source, deps)).rejects.toThrow('解析失败');
            return;
        }
        model([cmd]);
        const result = await runVariableReview(source, deps);
        expect(result.rejectedCommands.some(item => item.code === code)).toBe(true);
        expect(result.acceptedCommands).toEqual([]);
        expect(result.changes).toEqual([]);
    });
    it.each(['She walks away', '她低声说hello', '缓缓走进', 'A--B'])('非法 NPC %s 不能成为预览 NPC', async name => {
        model([pushNpc(name)]);
        const result = await runVariableReview(input(`${name}出现。`), deps);
        expect(result.acceptedCommands).toEqual([]);
        expect(result.previewState.社交).toEqual([]);
        expect(result.rejectedCommands).toHaveLength(1);
    });
    it('接受命令的预览也不推进时间/地点/孕产/任务，不消费金钱，不触发保存或历史写入', async () => {
        const source = input('卡尔走进大厅。');
        source.currentState.任务列表 = [{ ID: 'TASK-1', 名称: '旧任务', 状态: '已完成', 奖励描述: ['金币 +100'] }];
        source.currentState.社交 = 规范化社交列表([{ id: 'NPC001', 姓名: '江婉', 身份: '友人', 子宫: { 状态: '怀孕', 孕周: 1 } }]);
        const saved = structuredClone(source);
        addScriptedMoneyDelta(55);
        model([pushNpc('卡尔')]);
        const first = await runVariableReview(source, deps);
        const second = await runVariableReview(source, deps);
        expect(source).toEqual(saved);
        expect(first.previewState.环境).toEqual(saved.currentState.环境);
        expect(first.previewState.世界).toEqual(saved.currentState.世界);
        expect(first.previewState.角色).toEqual(saved.currentState.角色);
        expect(first.previewState.任务列表).toEqual(saved.currentState.任务列表);
        expect(first.previewState.社交[0].子宫).toEqual(saved.currentState.社交[0].子宫);
        expect(first.previewState).toEqual(second.previewState);
        expect(peekScriptedMoneyDelta()).toBe(55);
    });
    it('禁止通过命令推进时间', async () => {
        model([{ action: 'set', key: '环境.时间', value: '1:01:02:08:00' }]);
        const source = input();
        const result = await runVariableReview(source, deps);
        expect(result.previewState.环境.时间).toBe(source.currentState.环境.时间);
        expect(result.rejectedCommands[0].reason).toContain('不允许更新时间');
    });
    it.each(['无需修改', '证据不足'])('正常空命令状态 %s 有独立语义且不产生隐式规范化', async status => {
        model([], status);
        const source = input(status === '证据不足' ? '林岳购买了物品，但实际价格未知。' : '林岳走进大厅。');
        if (status === '证据不足') vi.mocked(client.请求模型文本).mockResolvedValue(output([], status).replace('- 问题、正文依据、当前值、建议值已核对。', '疑点：正文提到购买物品，但无法确定实际价格，因此未修改金钱。'));
        const result = await runVariableReview(source, deps);
        expect(result.status).toBe(status === '无需修改' ? 'noChanges' : 'insufficientEvidence');
        expect(result.previewState).toMatchObject({ 角色: source.currentState.角色, 社交: source.currentState.社交, 环境: source.currentState.环境 });
        expect(result.changes).toEqual([]);
    });
    it.each(['', '没有问题', '<说明>状态：无需修改</说明>', '<说明>状态：需要修复</说明><命令>set 角色.年龄 = 20\nBAD</命令>', '<说明>状态：无需修改</说明><命令>set 角色.年龄 = 20</命令>'])('不完整/非法协议不能表示无修改：%s', async raw => {
        vi.mocked(client.请求模型文本).mockResolvedValue(raw);
        await expect(runVariableReview(input(), deps)).rejects.toThrow('解析失败');
    });
    it('API错误向上返回，不能表示无修改', async () => {
        vi.mocked(client.请求模型文本).mockRejectedValue(new Error('API failed'));
        await expect(runVariableReview(input(), deps)).rejects.toThrow('API failed');
    });
    it('截断流严格解析失败后复用非流式降级；降级失败仍报错', async () => {
        vi.mocked(client.请求模型文本).mockImplementationOnce(async (_api, _messages, options) => {
            options.streamOptions?.onStreamEnd?.({ sawDone: false, accumulatedLength: 10 });
            return '<说明>状态：无需修改';
        }).mockResolvedValueOnce(output());
        expect((await runVariableReview(input(), { ...deps, onStreamDelta: vi.fn() })).status).toBe('noChanges');
        expect(client.请求模型文本).toHaveBeenCalledTimes(2);
        expect(vi.mocked(client.请求模型文本).mock.calls[1][2].streamOptions).toBeUndefined();
        vi.mocked(client.请求模型文本).mockImplementationOnce(async (_api, _messages, options) => {
            options.streamOptions?.onStreamEnd?.({ sawDone: false, accumulatedLength: 10 });
            return '<说明>状态：无需修改';
        }).mockRejectedValueOnce(new Error('fallback failed'));
        await expect(runVariableReview(input(), { ...deps, onStreamDelta: vi.fn() })).rejects.toThrow('fallback failed');
    });
    it('指纹稳定，但状态、正文、回合版本或原命令改变后旧预览失效', async () => {
        model();
        const source = input();
        const result = await runVariableReview(source, deps);
        await expect(assertVariableReviewPreviewCurrent(result, source)).resolves.toBeUndefined();
        const reordered = { ...source, currentState: Object.fromEntries(Object.entries(source.currentState).reverse()) as any };
        expect(await createVariableReviewFingerprint(reordered)).toBe(result.stateFingerprint);
        for (const changed of [
            { ...source, currentState: { ...source.currentState, 环境: { ...source.currentState.环境, 时间: '新时间' } } },
            { ...source, stateVersion: 2 },
            { ...source, history: [{ ...source.history[0] }, { ...source.history[1], structuredResponse: { logs: [{ sender: '旁白', text: '正文变了' }] } }] }
        ]) await expect(assertVariableReviewPreviewCurrent(result, changed)).rejects.toThrow('请重新运行');
    });
    it('上下文裁剪有标记，保留原索引，不上传图片缓存；超出总预算明确拒绝', async () => {
        model();
        const source = input();
        source.currentState.社交 = Array.from({ length: 65 }, (_, i) => ({ id: `NPC${i}`, 姓名: `已有${i}`, 图片档案: { base64: 'private-image' } }));
        source.currentState.世界.avatar = 'private-avatar';
        source.currentState.世界.portrait = 'private-portrait';
        source.currentState.世界.uiState = { visible: 'private-ui-state' };
        const result = await runVariableReview({ ...source, maxArrayItems: 60 }, deps);
        expect(result.coverage.truncated).toBe(true);
        expect(result.coverage.warnings.join('')).toContain('65项仅读取前60项');
        expect(JSON.stringify(vi.mocked(client.请求模型文本).mock.calls[0][1])).not.toContain('private-image');
        expect(JSON.stringify(vi.mocked(client.请求模型文本).mock.calls[0][1])).not.toMatch(/private-avatar|private-portrait|private-ui-state/);
        expect(result.previewState.社交).toHaveLength(65);
        await expect(prepareVariableReview({ ...source, absoluteCharacterCap: 10 })).rejects.toThrow('工程字符安全上限');
    });
    it('自动开关关闭仍能读取变量API进行审查，普通变量生成仍关闭', async () => {
        expect(变量校准功能已启用(apiConfig)).toBe(false);
        expect(获取变量计算接口配置(apiConfig)).toBeNull();
        expect(获取变量计算接口配置(apiConfig, { manualReview: true })?.model).toBe('test-model');
        model();
        expect((await runVariableReview(input(), deps)).status).toBe('noChanges');
    });
    it('没有完成的结构化回合、正在运行或原输入不匹配时不请求模型', async () => {
        await expect(runVariableReview({ ...input(), history: [] }, deps)).rejects.toThrow('结构化正文');
        await expect(runVariableReview({ ...input(), turnInProgress: true }, deps)).rejects.toThrow('尚未完成');
        await expect(runVariableReview({ ...input(), originalPlayerInput: '备注伪造' }, deps)).rejects.toThrow('不匹配');
        expect(client.请求模型文本).not.toHaveBeenCalled();
    });
    it('默认generate请求仍使用原变量生成协议', async () => {
        vi.mocked(client.请求模型文本).mockResolvedValue('<thinking>完成</thinking><说明>-生成完成</说明><命令>set 角色.年龄 = 20</命令>');
        const result = await generateVariableCalibrationUpdate({ stateJson: '{}', response: { logs: [], tavern_commands: [] } as any }, 获取变量计算接口配置(apiConfig, { manualReview: true })!);
        expect(result.reviewStatus).toBeUndefined();
        expect(result.commands[0].value).toBe(20);
        expect(JSON.stringify(vi.mocked(client.请求模型文本).mock.calls[0][1])).not.toContain('reviewNotes');
    });
});

it('其他 NPC 的收入不能转记给主角', async () => {
    model([gold]);
    const result = await runVariableReview(input('卡尔获得100金币。'), deps);
    expect(result.acceptedCommands).toEqual([]);
    expect(result.rejectedCommands[0].reason).toContain('主体');
});
it('主动取消不等待模型返回，也不生成预览', async () => {
    const controller = new AbortController();
    const prepared = await prepareVariableReview(input());
    vi.mocked(client.请求模型文本).mockImplementation(async (_api, _messages, options) => {
        controller.abort();
        expect(options.signal?.aborted).toBe(true);
        return new Promise(() => {});
    });
    const { generateVariableReview } = await import('../hooks/useGame/variableReviewWorkflow');
    await expect(generateVariableReview(prepared, { ...deps, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
});
it('指纹包含原命令与对应回合前快照', async () => {
    const source = input();
    const old = await createVariableReviewFingerprint(source);
    source.history[1].structuredResponse.tavern_commands = [gold];
    expect(await createVariableReviewFingerprint(source)).not.toBe(old);
    const second = await createVariableReviewFingerprint(source);
    source.beforeTurn.state.角色.年龄 = 99;
    expect(await createVariableReviewFingerprint(source)).not.toBe(second);
    const third = await createVariableReviewFingerprint(source);
    source.history[0].content = '原回合输入发生变化';
    expect(await createVariableReviewFingerprint(source)).not.toBe(third);
});
it('暴露给后续 UI 的非法动作诊断来自共用校验入口', async () => {
    const { validateVariableReviewCommands } = await import('../hooks/useGame/variableReviewWorkflow');
    const result = await validateVariableReviewCommands(await prepareVariableReview(input()), [{ action: 'explode', key: '角色.年龄', value: 1 } as any], deps);
    expect(result.rejectedCommands[0].code).toBe('invalidAction');
});

it('请求超时即使供应商未响应取消也必须返回错误', async () => {
    const { generateVariableReview } = await import('../hooks/useGame/variableReviewWorkflow');
    const prepared = await prepareVariableReview(input());
    vi.useFakeTimers();
    try {
        vi.mocked(client.请求模型文本).mockImplementation(() => new Promise(() => {}));
        const result = generateVariableReview(prepared, deps);
        const assertion = expect(result).rejects.toThrow('超时');
        await vi.advanceTimersByTimeAsync(120001);
        await assertion;
    } finally { vi.useRealTimers(); }
});
it('完整标签但流未正常结束也必须降级，不能采纳半截结果', async () => {
    vi.mocked(client.请求模型文本).mockImplementationOnce(async (_api, _messages, options) => {
        options.streamOptions?.onStreamEnd?.({ sawDone: false, accumulatedLength: 90 });
        return output([pushNpc('卡尔')]);
    }).mockResolvedValueOnce(output());
    const result = await runVariableReview(input('卡尔出现在大厅。'), { ...deps, onStreamDelta: vi.fn() });
    expect(result.status).toBe('noChanges');
    expect(result.proposedCommands).toEqual([]);
});
it('已有模板名更新/重复出现不被误杀，身份和显示格式保护继续生效', async () => {
    const source = input('苏婉清与江婉继续交谈。');
    source.currentState.社交 = 规范化社交列表([{ id: 'NPC001', 姓名: '苏婉清', 身份: '友人', 好感度: 0 }]);
    model([{ action: 'set', key: '社交[0].好感度', value: 20 }]);
    const result = await runVariableReview(source, deps);
    expect(result.acceptedCommands).toHaveLength(1);
    expect(result.previewState.社交[0].姓名).toBe('苏婉清');
    expect(result.previewState.社交[0].好感度).toBe(20);
});
it('死亡和境界变化继续经过生产依据检查', async () => {
    const source = input('江婉喝茶。');
    source.currentState.社交 = 规范化社交列表([{ id: 'NPC001', 姓名: '江婉', 身份: '友人', 境界: '聚息境四重', 境界层级: 8 }]);
    model([{ action: 'set', key: '社交[0].境界层级', value: 1 }]);
    expect((await runVariableReview(source, deps)).rejectedCommands[0].code).toBe('insufficientEvidence');
    model([{ action: 'set', key: '社交[0].是否已故', value: true }]);
    const result = await runVariableReview(source, deps);
    expect(result.acceptedCommands).toEqual([]);
    expect(result.rejectedCommands.length).toBeGreaterThan(0);
});

it.each(['物品列表', '功法列表'])('已正确记录的%s不因重审而重复push', async root => {
    const source = input('林岳获得一枚回气丹，并学会疾风斩。');
    const object = root === '物品列表' ? { ID: 'pill-1', 名称: '回气丹', 类型: '药品', 堆叠数量: 1 } : { ID: 'skill-1', 名称: '疾风斩', 层级: 1 };
    source.currentState.角色[root] = [object];
    model([{ action: 'push', key: `角色.${root}`, value: object }]);
    const result = await runVariableReview(source, deps);
    expect(result.status).toBe('noChanges');
    expect(result.acceptedCommands).toEqual([]);
    expect(result.previewState.角色[root]).toEqual([object]);
});
it('物品数量已经结算时保守拒绝，不能重放库存增量', async () => {
    const source = input('林岳获得一枚回气丹。');
    source.currentState.角色.物品列表 = [{ ID: 'pill-1', 名称: '回气丹', 堆叠数量: 1 }];
    model([{ action: 'add', key: '角色.物品列表[0].堆叠数量', value: 1 }]);
    const result = await runVariableReview(source, deps);
    expect(result.acceptedCommands).toEqual([]);
    expect(result.rejectedCommands[0].code).toBe('alreadySettled');
    expect(result.previewState.角色.物品列表[0].堆叠数量).toBe(1);
});
it('数值修复继续复用自动校准的范围规则，diff反映规范化后的实际值', async () => {
    const source = input('林岳的精力恢复。');
    source.currentState.角色.最大精力 = 100;
    source.currentState.角色.当前精力 = 10;
    model([{ action: 'set', key: '角色.当前精力', value: 1000 }]);
    const result = await runVariableReview(source, deps);
    expect(result.previewState.角色.当前精力).toBe(100);
    expect(result.changes.find(change => change.path === '角色.当前精力')).toMatchObject({ before: 10, after: 100 });
});

it('即使调用方误传applyState=true，review-preview仍不调用真实写入/回合校准/保存入口', async () => {
    const current = state();
    current.角色.最大精力 = 100;
    current.角色.当前精力 = 10;
    const original = structuredClone(current);
    const setterNames = ['设置角色', '设置环境', '设置社交', '设置世界', '设置战斗', '设置玩家门派', '设置任务列表', '设置约定列表', '设置剧情', '设置剧情规划', '设置女主剧情规划', '设置同人剧情规划', '设置同人女主剧情规划'];
    const setters = Object.fromEntries(setterNames.map(name => [name, vi.fn()]));
    const calibrate = vi.fn();
    const battleCleanup = vi.fn();
    const save = vi.spyOn(dbService, '保存存档').mockResolvedValue(1);
    try {
        const preview = 执行响应命令处理({ logs: [{ sender: '旁白', text: '林岳恢复精力。' }], tavern_commands: [{ action: 'set', key: '角色.当前精力', value: 50 }] } as any,
            current, { ...stateTransforms, ...storyState, ...setters, 命令后校准: calibrate, 战斗结束自动清空: battleCleanup } as any,
            undefined, { executionMode: 'review-preview', applyState: true });
        expect(preview.角色.当前精力).toBe(50);
        expect(current).toEqual(original);
        Object.values(setters).forEach(setter => expect(setter).not.toHaveBeenCalled());
        expect(calibrate).not.toHaveBeenCalled();
        expect(battleCleanup).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        model([pushNpc('卡尔')]);
        await runVariableReview(input('卡尔走进大厅。', current), deps);
        expect(save).not.toHaveBeenCalled();
    } finally { save.mockRestore(); }
});
it('push不能通过非数组路径逃过生产路径登记和类型校验', async () => {
    model([{ action: 'push', key: '角色.年龄', value: 20 }]);
    const result = await runVariableReview(input(), deps);
    expect(result.acceptedCommands).toEqual([]);
    expect(result.rejectedCommands[0].code).toBe('unregisteredPath');
    expect(result.changes).toEqual([]);
});
