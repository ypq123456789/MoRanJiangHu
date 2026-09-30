import { beforeEach, describe, expect, it, vi } from 'vitest';

const rawReplyMock = vi.hoisted(() => vi.fn());
vi.mock('../services/ai/text', async () => {
    const actual = await vi.importActual<typeof import('../services/ai/text')>('../services/ai/text');
    return { ...actual, generateRoleChatRawReply: rawReplyMock };
});

import { 提取群聊流式正文, 解析群聊模型输出, 执行角色群聊 } from '../hooks/useGame/groupRoleChatWorkflow';

const deps = () => ({
    apiConfig: {
        activeConfigId: 'base',
        configs: [{ id: 'base', 名称: '测试', 供应商: 'openai_compatible', baseUrl: 'https://example.test', apiKey: 'test-key', model: 'main' }],
        功能模型占位: {
            角色对话独立模型开关: true,
            角色对话使用模型: 'role-model',
            角色对话API地址: '',
            角色对话API密钥: '',
            角色对话提示词: ''
        }
    } as any,
    社交: [
        { id: 'npc-1', 姓名: '沈听澜', 是否在场: true, 当前位置: '药房', 记忆: [{ 内容: '只属于沈听澜的秘密' }] },
        { id: 'npc-2', 姓名: '老李', 是否在场: true, 当前位置: '药房', 记忆: [{ 内容: '只属于老李的秘密' }] }
    ],
    环境: { 大地点: '临安', 小地点: '仁心堂', 具体地点: '药房' },
    角色: { 姓名: '姜小星' },
    历史记录: [],
    prompts: []
});

beforeEach(() => rawReplyMock.mockReset());

describe('群聊模型输出解析', () => {
    it('正文和下一位调度分开解析', () => {
        const result = 解析群聊模型输出('<正文>先坐下。\n\n茶还热着。</正文>\n<调度>{"action":"continue","nextNpcId":"npc-2"}</调度>');
        expect(result).toEqual({
            正文: '先坐下。\n\n茶还热着。',
            动作: 'continue',
            下一位NPCId: 'npc-2',
            调度有效: true,
            完整: true
        });
    });

    it('调度缺失或损坏时保留正文并安全暂停', () => {
        const result = 解析群聊模型输出('<正文>我先说到这里。</正文><调度>{坏掉了}</调度>');
        expect(result.正文).toBe('我先说到这里。');
        expect(result.动作).toBe('wait');
        expect(result.调度有效).toBe(false);
    });

    it('未知调度动作不能被误当成有效等待', () => {
        const result = 解析群聊模型输出('<正文>先缓一缓。</正文><调度>{"action":"later","nextNpcId":"npc-2"}</调度>');
        expect(result.正文).toBe('先缓一缓。');
        expect(result.动作).toBe('wait');
        expect(result.调度有效).toBe(false);
    });

    it('流式显示永远不泄露调度标签', () => {
        expect(提取群聊流式正文('<正文>轮到老李了。</正文><调度>{"action":"continue"}'))
            .toBe('轮到老李了。');
    });

    it('模型重复打开正文标签时，正文不残留标签', () => {
        const result = 解析群聊模型输出('<正文>（拱手）今夜我值守阁楼，子时换灯。<正文>');
        expect(result.正文).toBe('（拱手）今夜我值守阁楼，子时换灯。');
        expect(result.动作).toBe('wait');
        expect(result.调度有效).toBe(false);
    });
});

describe('群聊自动接话', () => {
    it('同一模型逐人请求，尊重下一位调度和回复上限，并保存听众快照', async () => {
        rawReplyMock
            .mockResolvedValueOnce('<正文>先听老李怎么说。</正文><调度>{"action":"continue","nextNpcId":"npc-2"}</调度>')
            .mockResolvedValueOnce('<正文>我看此事可行。</正文><调度>{"action":"continue","nextNpcId":"npc-1"}</调度>')
            .mockResolvedValueOnce('<正文>那便如此。</正文><调度>{"action":"wait","nextNpcId":""}</调度>');

        const result = await 执行角色群聊(deps() as any, {
            参与者NPCIds: ['npc-1', 'npc-2'], 玩家输入: '你们怎么看？', 首位NPCId: 'npc-1',
            自动回复上限: 3, 已确认全部位置: true
        });

        expect(rawReplyMock).toHaveBeenCalledTimes(3);
        expect(result.发言次数).toBe(3);
        expect(result.结束原因).toBe('model_wait');
        expect(result.新增消息).toHaveLength(4);
        expect(result.新增消息.every(item => item.听众NPCIds?.join(',') === 'npc-1,npc-2')).toBe(true);
        const firstPrompt = rawReplyMock.mock.calls[0][0].map((item: any) => item.content).join('\n');
        expect(firstPrompt).toContain('只属于沈听澜的秘密');
        expect(firstPrompt).not.toContain('只属于老李的秘密');
    });

    it('名单外的下一位不会触发额外请求', async () => {
        rawReplyMock.mockResolvedValue('<正文>我说完了。</正文><调度>{"action":"continue","nextNpcId":"npc-outside"}</调度>');
        const result = await 执行角色群聊(deps() as any, {
            参与者NPCIds: ['npc-1', 'npc-2'], 玩家输入: '开始吧。', 自动回复上限: 6, 已确认全部位置: true
        });
        expect(rawReplyMock).toHaveBeenCalledTimes(1);
        expect(result.结束原因).toBe('invalid_scheduler');
        expect(result.新增消息.at(-1)?.内容).toBe('我说完了。');
    });

    it('后续请求失败时保留已经完成的角色发言', async () => {
        rawReplyMock
            .mockResolvedValueOnce('<正文>第一句已经说完。</正文><调度>{"action":"continue","nextNpcId":"npc-2"}</调度>')
            .mockRejectedValueOnce(new Error('network down'));
        const result = await 执行角色群聊(deps() as any, {
            参与者NPCIds: ['npc-1', 'npc-2'], 玩家输入: '继续。', 自动回复上限: 3, 已确认全部位置: true
        });
        expect(result.结束原因).toBe('request_error');
        expect(result.新增消息.map(item => item.内容)).toContain('第一句已经说完。');
    });

    it('后续角色返回空正文时同样保留已完成发言并安全暂停', async () => {
        rawReplyMock
            .mockResolvedValueOnce('<正文>第一句已经说完。</正文><调度>{"action":"continue","nextNpcId":"npc-2"}</调度>')
            .mockResolvedValueOnce('<调度>{"action":"wait","nextNpcId":""}</调度>');
        const result = await 执行角色群聊(deps() as any, {
            参与者NPCIds: ['npc-1', 'npc-2'], 玩家输入: '继续。', 自动回复上限: 3, 已确认全部位置: true
        });
        expect(result.结束原因).toBe('request_error');
        expect(result.新增消息.map(item => item.内容)).toContain('第一句已经说完。');
    });
});
