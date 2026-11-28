import { describe, expect, it, vi } from 'vitest';
import type { GameResponse } from '../types';
import { 执行变量模型校准工作流 } from '../hooks/useGame/variableModelWorkflow';
import { 执行响应命令处理 } from '../hooks/useGame/responseCommandProcessor';
import { 规范化环境信息, 规范化社交列表, 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';
import * as storyState from '../hooks/useGame/storyState';

const 正文: GameResponse = {
    logs: [
        { sender: '旁白', text: '柴房里只有杨培强和俞月荷。' },
        { sender: '杨培强', text: '那沈天彪不是为了债，是为了杨老泉留下的东西。' },
        { sender: '俞月荷', text: '那钱掌柜想借沈天彪的刀，沈天彪想借钱掌柜的势。' },
        { sender: '旁白', text: '俞凌风先前留在她体内的那股气息仍在扰乱她的心神。' }
    ]
};
const 局外人物 = ['沈天彪', '钱掌柜', '俞凌风'];

type 模型配置 = { baseUrl: string; apiKey: string; model: string };
const 读取模型配置 = (): 模型配置 | undefined => {
    const baseUrl = process.env.MORAN_E2E_AI_BASE_URL?.trim();
    const apiKey = process.env.MORAN_E2E_AI_API_KEY?.trim();
    const model = process.env.MORAN_E2E_AI_MODEL?.trim();
    return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : undefined;
};

const 验证变量建档 = async (config: 模型配置) => {
    const state = {
        角色: 规范化角色物品容器映射({ 姓名: '杨培强' }),
        环境: 规范化环境信息({ 时间: '1:01:01:08:00', 具体地点: '柴房' }),
        社交: [{ id: 'npc-yuehe', 姓名: '俞月荷', 是否在场: true }],
        世界: storyState.规范化世界状态(),
        战斗: storyState.规范化战斗状态(),
        玩家门派: storyState.规范化门派状态(),
        任务列表: [],
        约定列表: [],
        剧情: storyState.规范化剧情状态(),
        剧情规划: storyState.规范化剧情规划状态()
    };
    const result = await 执行变量模型校准工作流({
        playerInput: '听俞月荷说完。',
        parsedResponse: 正文,
        baseState: state,
        promptPool: [],
        worldEvolutionEnabled: false,
        signal: AbortSignal.timeout(150_000)
    }, {
        apiConfig: {
            configs: [{ ...config, id: 'e2e', 名称: '变量端测', 供应商: 'openai', 协议覆盖: 'auto', maxTokens: 8192 }],
            activeConfigId: 'e2e',
            功能模型占位: { 变量计算独立模型开关: true, 变量计算渠道ID: 'e2e', 变量计算使用模型: config.model }
        },
        gameConfig: { 启用NSFW模式: false, 启用饱腹口渴系统: false, 启用修炼体系: false }
    });
    if (!result) throw new Error('变量工作流未返回校准结果');
    const 写入社交 = vi.fn<(list: { id: string; 姓名: string; 是否在场?: boolean; 是否队友?: boolean }[]) => void>();
    执行响应命令处理({ ...正文, tavern_commands: result.commands }, state, {
        ...storyState, 规范化环境信息, 规范化社交列表, 规范化角色物品容器映射, 设置社交: 写入社交
    });
    expect(写入社交).toHaveBeenCalledTimes(1);
    const [社交] = 写入社交.mock.calls[0];
    for (const 姓名 of 局外人物) {
        const 匹配 = 社交.filter(npc => npc.姓名 === 姓名);
        expect(匹配, `${姓名}应有一个独立档案，实际名单：${社交.map(npc => npc.姓名).join('、')}`).toHaveLength(1);
        expect(匹配[0], 姓名).toMatchObject({ 来源: '正文提及', 关系状态: '已闻其名', 是否在场: false, 是否队友: false });
        expect(匹配[0]).not.toHaveProperty('年龄');
        expect(匹配[0]).not.toHaveProperty('境界');
    }
    expect(社交).toContainEqual(expect.objectContaining({ id: 'npc-yuehe', 姓名: '俞月荷', 是否在场: true }));
    expect(社交.map(npc => npc.姓名)).not.toContain('杨老泉');
};

describe('变量模型 Step4 公开局外人物端到端', () => {
    it.each([
        { label: '只更新在场人物', command: 'set 社交[0].是否在场 = true' },
        { label: '命令为空', command: '无' },
        { label: '新人物缺少来源和关系标识', command: 'push 社交 = {"id":"npc-shentianbiao","姓名":"沈天彪","身份":"讨债者","年龄":38,"境界":"二品","是否在场":false}' }
    ])('模型漏报或误填时从正式工作流恢复：$label', async ({ command }) => {
        const raw = `<说明>本回合社交更新完毕。</说明>\n<命令>${command}</命令>`;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            Response.json({ choices: [{ message: { content: raw } }] })
        );
        try {
            await 验证变量建档({ baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'fixture', model: 'fixture-model' });
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
            const messages = request.messages as { content: string }[];
            const cot = messages.find(({ content }) => content.includes('【变量生成COT】'))?.content ?? '';
            const step4 = cot.split('Step4: 新角色与社交建档')[1]?.split('Step5:')[0];
            expect(step4).toContain('逐句复核旁白和台词中被点名的局外人物');
            const audit = messages.find(({ content }) => content.includes('【本回合已具公开依据的局外人】'))?.content;
            for (const 姓名 of 局外人物) expect(audit).toContain(`- ${姓名}：`);
            for (const { text } of 正文.logs) expect(messages.some(({ content }) => content.includes(text))).toBe(true);
        } finally {
            fetchMock.mockRestore();
        }
    });

    const config = 读取模型配置();
    it.skipIf(!config)('真实变量模型根据公开正文建档并保持局外人物离场', async () => {
        if (config) await 验证变量建档(config);
    }, 160_000);
});
