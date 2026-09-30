import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    构建场外对话记录块,
    构建角色对话消息序列,
    提取亲历回顾,
    序列化NPC档案,
    规范化场外对话列表,
    执行角色对话请求带超时,
    type 角色对话依赖,
    type 角色对话参数
} from '../hooks/useGame/roleChatWorkflow';
import type { 场外对话消息结构 } from '../models/system';

// 「清理角色对话输出」的标签清理用例已由官方 main 合入的
// roleChatTagBoundaryCleanup.test.ts 覆盖（成对/双开/孤立闭合/字面保留）。

const 目标NPC = {
    id: 'npc-1',
    姓名: '沈听澜',
    性别: '女',
    年龄: 19,
    身份: '受伤剑修',
    简介来历: '被追杀',
    核心性格特征: '清冷孤傲',
    好感度: 15,
    是否在场: true,
    记忆: [
        { 内容: '说过很喜欢竹笛', 时间: '0年12月03日:午时' },
        { 内容: '被主角所救', 时间: '1年01月01日:子时' }
    ],
    总结记忆: [{ 内容: '与主角互信渐生', 时间: '1年01月' }]
};

const 其他NPC = {
    id: 'npc-2',
    姓名: '老李',
    是否在场: true,
    记忆: [{ 内容: '偷偷藏了半坛毒酒', 时间: '1年01月01日:丑时' }]
};

const 基础依赖 = (): 角色对话依赖 => ({
    apiConfig: { 功能模型占位: { 角色对话提示词: '' } } as any,
    社交: [目标NPC, 其他NPC] as any[],
    环境: {},
    角色: { 姓名: '姜小星' } as any,
    历史记录: [],
    memoryConfig: { 即时消息上传条数N: 10 },
    prompts: []
});

describe('规范化场外对话列表', () => {
    it('非数组与空内容一律过滤，旧存档缺失字段按空处理', () => {
        expect(规范化场外对话列表(undefined)).toEqual([]);
        expect(规范化场外对话列表(null)).toEqual([]);
        expect(规范化场外对话列表('junk')).toEqual([]);
        expect(规范化场外对话列表([{ 内容: '' }, { role: 'npc', 发言人: '沈听澜', 内容: '嗯。', 时间: 1 }]))
            .toEqual([{ role: 'npc', 发言人: '沈听澜', 内容: '嗯。', 时间: 1 }]);
    });

    it('保留 npcId（按角色隔离回放的依据），无 npcId 的旧记录不补默认值', () => {
        const list = 规范化场外对话列表([
            { npcId: 'npc-1', role: 'npc', 发言人: '沈听澜', 内容: '嗯。', 时间: 1 },
            { role: 'player', 发言人: '姜小星', 内容: '在吗？', 时间: 2 }
        ]);
        expect(list[0].npcId).toBe('npc-1');
        expect(list[1].npcId).toBeUndefined();
    });

    it('保留群聊听众快照，供后续角色知情范围与主剧情注入使用', () => {
        const [message] = 规范化场外对话列表([{
            会话类型: 'group', 群聊ID: 'g-1', npcId: 'npc-1', role: 'npc', 发言人: '沈听澜',
            内容: '此事只在座几人知道。', 时间: 1, 听众NPCIds: ['npc-1', 'npc-2'], 听众: ['沈听澜', '老李']
        }]);
        expect(message).toMatchObject({ 会话类型: 'group', 群聊ID: 'g-1', 听众NPCIds: ['npc-1', 'npc-2'], 听众: ['沈听澜', '老李'] });
    });
});

describe('构建场外对话记录块', () => {
    it('空暂存返回空串（主回合无注入）', () => {
        expect(构建场外对话记录块([])).toBe('');
        expect(构建场外对话记录块(undefined)).toBe('');
    });

    it('逐条带发言人原样列出并附处理指令', () => {
        const block = 构建场外对话记录块([
            { role: 'player', 发言人: '姜小星', 内容: '你在怕什么？', 时间: 1 },
            { role: 'npc', 发言人: '沈听澜', 内容: '……没什么。', 时间: 2 }
        ]);
        expect(block).toContain('【姜小星】你在怕什么？');
        expect(block).toContain('【沈听澜】……没什么。');
        expect(block).toContain('场外对话记录');
        expect(block).toContain('短期记忆');
    });
});

describe('序列化NPC档案（本人认知核心）', () => {
    it('带全量记忆与总结记忆——旧记忆可命中', () => {
        const text = 序列化NPC档案(目标NPC);
        expect(text).toContain('沈听澜');
        expect(text).toContain('说过很喜欢竹笛');
        expect(text).toContain('被主角所救');
        expect(text).toContain('与主角互信渐生');
        expect(text).toContain('好感度：15');
    });
});

describe('提取亲历回顾（不含未来剧本）', () => {
    const mkAssistant = (logs: Array<{ sender: string; text: string }>, gameTime: string) => ({
        role: 'assistant',
        content: 'Structured Response',
        gameTime,
        structuredResponse: { logs }
    });
    const mkUser = (content: string, gameTime: string) => ({
        role: 'user',
        content,
        gameTime
    });

    it('命中含该 NPC 的回合，并明确注明知情边界', () => {
        const history: any[] = [
            mkUser('我走进茶馆。', '1年01月01日:午时'),
            mkAssistant([{ sender: '旁白', text: '沈听澜坐在角落。' }], '1年01月01日:午时'),
            mkUser('我去后山采药。', '1年01月02日:辰时'),
            mkAssistant([{ sender: '旁白', text: '山中无人。' }], '1年01月02日:辰时')
        ];
        const text = 提取亲历回顾(history, '沈听澜', { memoryConfig: { 即时消息上传条数N: 10 } });
        expect(text).toContain('沈听澜坐在角落');
        expect(text).toContain('亲身在场');
        expect(text).not.toContain('采药');
    });

    it('绝不携带主回合的剧情规划（未来剧本）', () => {
        const history: any[] = [
            mkUser('看什么？', '1年01月01日:子时'),
            mkAssistant([{ sender: '沈听澜', text: '看你像麻烦。' }], '1年01月01日:子时')
        ];
        history[1].structuredResponse.剧情规划 = '下一步反派将血洗仁心堂';
        const text = 提取亲历回顾(history, '沈听澜', { memoryConfig: { 即时消息上传条数N: 10 } });
        expect(text).not.toContain('血洗仁心堂');
        expect(text).not.toContain('剧情规划');
    });

    it('无命中时不注入任何主回合原文（不假定他见过镜头外的回合）', () => {
        const history: any[] = [
            mkUser('我去后山了，顺手把那半坛酒埋了。', '1年01月02日:辰时'),
            mkAssistant([{ sender: '旁白', text: '山路安静。' }], '1年01月02日:辰时')
        ];
        const text = 提取亲历回顾(history, '沈听澜', { memoryConfig: { 即时消息上传条数N: 10 } });
        expect(text).toBe('');
        expect(text).not.toContain('山路安静');
        expect(text).not.toContain('埋了');
    });

    it('玩家只在输入中点名 NPC 不能证明该 NPC 亲历了该回合', () => {
        const history: any[] = [
            mkUser('沈听澜现在在哪里？我把密信藏到床下。', '1年01月02日:辰时'),
            mkAssistant([{ sender: '旁白', text: '屋中没有旁人。' }], '1年01月02日:辰时')
        ];
        expect(提取亲历回顾(history, '沈听澜', { memoryConfig: { 即时消息上传条数N: 10 } })).toBe('');
    });
});

describe('构建角色对话消息序列（认知范围白名单）', () => {
    it('只注入本人档案与记忆，绝不注入他人记忆与主剧情记忆块', () => {
        const deps = 基础依赖();
        const params: 角色对话参数 = { npcId: 'npc-1', 玩家输入: '还记得我吗？' };
        const messages = 构建角色对话消息序列(deps, params);
        const all = messages.map((m) => m.content).join('\n');

        expect(messages[0].role).toBe('system');
        expect(all).toContain('角色对话协议');
        expect(all).toContain('说过很喜欢竹笛');
        expect(all).toContain('沈听澜');

        // 他人的秘密不注入
        expect(all).not.toContain('毒酒');
        // 主剧情的全知记忆块不注入
        expect(all).not.toContain('【短期记忆】');
        expect(all).not.toContain('【长期记忆】');
        expect(all).not.toContain('【中期记忆】');
        // 未来剧本不注入
        expect(all).not.toContain('剧情规划');

        // 暂存对话交替 + 本次输入收尾
        expect(messages[messages.length - 1]).toEqual({ role: 'user', content: '还记得我吗？' });
    });

    it('面板暂存的一问一答按 user/assistant 交替回放', () => {
        const deps = 基础依赖();
        const params: 角色对话参数 = {
            npcName: '沈听澜',
            玩家输入: '那笛子送你。',
            暂存对话: [
                { npcId: 'npc-1', role: 'player', 发言人: '姜小星', 内容: '你腹胀好了吗？', 时间: 1 },
                { npcId: 'npc-1', role: 'npc', 发言人: '沈听澜', 内容: '多管闲事。', 时间: 2 }
            ]
        };
        const messages = 构建角色对话消息序列(deps, params);
        const tail = messages.slice(-3);
        expect(tail).toEqual([
            { role: 'user', content: '你腹胀好了吗？' },
            { role: 'assistant', content: '多管闲事。' },
            { role: 'user', content: '那笛子送你。' }
        ]);
    });

    it('切换 NPC 后不回放另一人的私聊，也不回放无法判定归属的旧记录', () => {
        const deps = 基础依赖();
        const 暂存对话: 场外对话消息结构[] = [
            { npcId: 'npc-1', role: 'player', 发言人: '姜小星', 内容: '你和老李说了什么？', 时间: 1 },
            { npcId: 'npc-1', role: 'npc', 发言人: '沈听澜', 内容: '沈家旧事。', 时间: 2 },
            { npcId: 'npc-2', role: 'player', 发言人: '姜小星', 内容: '毒酒埋哪了？', 时间: 3 },
            { npcId: 'npc-2', role: 'npc', 发言人: '老李', 内容: '后厨柴堆下。', 时间: 4 },
            { 会话类型: 'group', 群聊ID: 'g-1', npcId: 'npc-1', role: 'npc', 发言人: '沈听澜', 内容: '群聊里公开说过的话', 时间: 4.5, 听众NPCIds: ['npc-1', 'npc-2'] },
            { role: 'npc', 发言人: '沈听澜', 内容: '无归属的旧记录', 时间: 5 }
        ];

        const 对沈听澜 = 构建角色对话消息序列(deps, { npcId: 'npc-1', 玩家输入: '继续说。', 暂存对话 })
            .map((m) => m.content).join('\n');
        expect(对沈听澜).toContain('沈家旧事');
        expect(对沈听澜).not.toContain('后厨柴堆下');
        expect(对沈听澜).not.toContain('群聊里公开说过的话');
        expect(对沈听澜).not.toContain('无归属的旧记录');

        const 对老李 = 构建角色对话消息序列(deps, { npcId: 'npc-2', 玩家输入: '继续说。', 暂存对话 })
            .map((m) => m.content).join('\n');
        expect(对老李).toContain('后厨柴堆下');
        expect(对老李).not.toContain('沈家旧事');
    });

    it('是否在场为真但明确位于远处的角色不会被写进“眼前的人”', () => {
        const deps = 基础依赖();
        deps.环境 = { 大地点: '临安', 小地点: '仁心堂', 具体地点: '药房' };
        (deps.社交[0] as any).当前位置 = '药房';
        (deps.社交[1] as any).位置路径 = '临安 > 城北 > 渡口';
        const text = 构建角色对话消息序列(deps, { npcId: 'npc-1', 玩家输入: '这里还有谁？' })
            .map(item => item.content).join('\n');
        expect(text).not.toContain('老李');
    });
});

describe('执行角色对话请求带超时', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('正常完成时按返回值结算，且不残留定时器', async () => {
        await expect(执行角色对话请求带超时(async () => '多管闲事。')).resolves.toBe('多管闲事。');
    });

    it('超时且已有部分回复时立即结算为部分文本，不丢已收到的内容', async () => {
        vi.useFakeTimers();
        const promise = 执行角色对话请求带超时((_signal, onDelta) => {
            onDelta('……没什么。', '……没什么。');
            return new Promise<string>(() => { /* 模拟流断开后再无事件、也不抛错 */ });
        });
        const assertion = expect(promise).resolves.toBe('……没什么。');
        await vi.advanceTimersByTimeAsync(90 * 1000);
        await assertion;
    });

    it('超时且一无所得时抛超时错误，不等底层任务自己失败', async () => {
        vi.useFakeTimers();
        const promise = 执行角色对话请求带超时(() => new Promise<string>(() => { /* 永不结算 */ }));
        const assertion = expect(promise).rejects.toThrow('角色对话等待首次响应超时');
        await vi.advanceTimersByTimeAsync(45 * 1000);
        await assertion;
    });

    it('父级中断时立即拒绝，不等底层任务自己失败', async () => {
        const controller = new AbortController();
        const promise = 执行角色对话请求带超时(() => new Promise<string>(() => { /* 永不结算 */ }), controller.signal);
        const assertion = expect(promise).rejects.toThrow();
        controller.abort();
        await assertion;
    });

    it('允许停止按钮保留已经收到的部分正文，同时仍立即结算', async () => {
        const controller = new AbortController();
        const promise = 执行角色对话请求带超时((_signal, onDelta) => {
            onDelta('<正文>先等等。', '<正文>先等等。');
            return new Promise<string>(() => { /* 等待用户停止 */ });
        }, controller.signal, { 中断时保留部分: true });
        const assertion = expect(promise).resolves.toBe('<正文>先等等。');
        controller.abort();
        await assertion;
    });
});
