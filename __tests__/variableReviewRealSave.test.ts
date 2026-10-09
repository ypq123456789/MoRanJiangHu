import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../services/ai/chatCompletionClient';
import { prepareVariableReview, generateVariableReview } from '../hooks/useGame/variableReviewWorkflow';
import { 规范化环境信息, 规范化角色物品容器映射, 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import { 规范化世界状态, 规范化战斗状态, 规范化门派状态, 同步角色与门派状态 } from '../hooks/useGame/storyState';
import { 规范化任务列表自动结算 } from '../utils/taskCompat';
import { 规范化游戏设置 } from '../utils/gameSettings';
import { normalizeVariableReviewSettings } from '../utils/variableReviewSettings';
import { buildVariableReviewTaskPrompt } from '../prompts/runtime/variableReview';
import { reviewApi, reviewOutput } from './helpers/variableReviewFixture';
vi.mock('../services/ai/chatCompletionClient', async original => ({ ...await original<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));

// 真实用户档案只通过环境变量读取，绝不提交原存档、正文或私密数据。
const fixturePath = process.env.VARIABLE_REVIEW_SAVE_FIXTURE;
const load = () => {
    const zip = unzipSync(new Uint8Array(readFileSync(fixturePath!)));
    const save = JSON.parse(strFromU8(zip[Object.keys(zip).find(key => key.startsWith('游戏数据/'))!]));
    const history = JSON.parse(strFromU8(zip[Object.keys(zip).find(key => key.startsWith('聊天记录/'))!])).records;
    const config = 规范化游戏设置(save.游戏设置);
    const env = 规范化环境信息(save.环境信息);
    const world = { ...save.世界 };
    for (const key of ['地图', '建筑', '地图建筑', '地图道路', '地图人物']) world[key] = [];
    if (!world.地图层级.some((node: any) => node.层级 === '寰宇')) world.地图层级 = [];
    const synced = 同步角色与门派状态({ 角色: 规范化角色物品容器映射(save.角色数据, { 当前时间: env, 启用饱腹口渴系统: config.启用饱腹口渴系统 }), 玩家门派: 规范化门派状态(save.玩家门派) });
    const state = { 角色: synced.角色, 环境: env, 社交: 规范化社交列表(save.社交, { 合并同名: false }), 世界: 规范化世界状态(world), 战斗: 规范化战斗状态(save.战斗), 玩家门派: synced.玩家门派, 任务列表: 规范化任务列表自动结算(save.任务列表), 约定列表: save.约定列表 };
    return { input: { currentState: state, history }, config };
};
describe.skipIf(!fixturePath)('真实规模存档的审查容量（不发付费请求）', () => {
    beforeEach(() => { vi.mocked(client.请求模型文本).mockReset(); vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput()); });
    it.each([128000, 200000, 400000, 1000000])('上下文%d可构造请求，地图/NPC/库存/任务完整保留', async window => {
        const { input, config } = load();
        const prepared = await prepareVariableReview(input as any);
        const settings = { ...normalizeVariableReviewSettings(undefined, reviewApi), contextWindowMode: 'manual' as const, contextWindowTokens: window, maxOutputTokens: 16384 };
        const result = await generateVariableReview(prepared, { apiConfig: reviewApi, gameConfig: config, reviewSettings: settings });
        expect(result.capacity.withinBudget).toBe(true); expect(result.capacity.estimatedInputTokens).toBeGreaterThan(30000);
        expect(client.请求模型文本).toHaveBeenCalledOnce();
        const messages = vi.mocked(client.请求模型文本).mock.calls[0][1]; const payload = JSON.parse(messages[2].content);
        if (window === 128000) console.info('真实规模预算统计（仅数字）', JSON.stringify({ inputTokens: result.capacity.estimatedInputTokens, contextWindow: window,
            maxOutput: result.capacity.maxOutputTokens, safetyReserve: result.capacity.safetyReserveTokens, inputBudget: result.capacity.inputBudgetTokens,
            remaining: result.capacity.remainingTokens, characters: result.capacity.characters, compactStateCharacters: prepared.stateJson.length,
            ruleCharacters: messages[0].content.length, npcs: payload.currentSettledState.社交.length, maps: payload.currentSettledState.世界.地图层级.length }));
        expect(payload.currentSettledState.世界.地图层级).toHaveLength(input.currentState.世界.地图层级.length);
        expect(payload.currentSettledState.社交).toHaveLength(input.currentState.社交.length);
        expect(payload.currentSettledState.角色.物品列表).toHaveLength(input.currentState.角色.物品列表.length);
        expect(payload.currentSettledState.任务列表).toHaveLength(input.currentState.任务列表.length);
        expect(prepared.coverage.truncated).toBe(false);
        expect(messages[2].content).not.toContain('\n  "');
        expect(payload.beforeTurnState).toBeNull();
    });
    it('32K在本地拒绝，有诊断且不调用客户端', async () => {
        const { input, config } = load(); const prepared = await prepareVariableReview(input as any);
        const settings = { ...normalizeVariableReviewSettings(undefined, reviewApi), contextWindowMode: 'manual' as const, contextWindowTokens: 32000, maxOutputTokens: 8192 };
        await expect(generateVariableReview(prepared, { apiConfig: reviewApi, gameConfig: config, reviewSettings: settings })).rejects.toMatchObject({ name: 'VariableReviewCapacityError', capacity: { withinBudget: false, contextWindowTokens: 32000 } });
        expect(client.请求模型文本).not.toHaveBeenCalled();
    });
    it('由真实记录扩展到30万字符以上仍通过生产workflow，大窗口保留全部数组', async () => {
        const { input, config } = load();
        const records = input.currentState.世界.势力互动历史;
        input.currentState.世界.势力互动历史 = Array.from({ length: 1300 }, (_, i) => structuredClone(records[i % records.length]));
        const prepared = await prepareVariableReview(input as any);
        const settings = { ...normalizeVariableReviewSettings(undefined, reviewApi), contextWindowMode: 'manual' as const, contextWindowTokens: 1000000, maxOutputTokens: 16384 };
        const result = await generateVariableReview(prepared, { apiConfig: reviewApi, gameConfig: config, reviewSettings: settings });
        expect(result.capacity.characters).toBeGreaterThan(300000); expect(result.capacity.withinBudget).toBe(true);
        expect(client.请求模型文本).toHaveBeenCalledOnce();
        const payload = JSON.parse(vi.mocked(client.请求模型文本).mock.calls[0][1][2].content);
        expect(payload.currentSettledState.世界.势力互动历史).toHaveLength(1300);
        expect(prepared.coverage.truncated).toBe(false);
    });
    it('before仍完整但只序列化一次；长自定义策略增加输入估算', async () => {
        const { input, config } = load(); const base = await prepareVariableReview(input as any);
        const withBefore = await prepareVariableReview({ ...input, beforeTurn: { provenance: 'live-before-turn', sourceTurnId: base.sourceTurnId, state: input.currentState } } as any);
        const settings = { ...normalizeVariableReviewSettings(undefined, reviewApi), contextWindowMode: 'manual' as const, contextWindowTokens: 1000000, maxOutputTokens: 8192 };
        const a = await generateVariableReview(base, { apiConfig: reviewApi, gameConfig: config, reviewSettings: settings });
        const b = await generateVariableReview(base, { apiConfig: reviewApi, gameConfig: config, reviewSettings: { ...settings, customPrompt: '追加审查重点'.repeat(10000) } });
        expect(b.capacity.estimatedInputTokens).toBeGreaterThan(a.capacity.estimatedInputTokens);
        const payload = JSON.parse(buildVariableReviewTaskPrompt(withBefore.stateJson, withBefore.response, withBefore.reviewContext));
        expect(payload.beforeTurnState.世界.地图层级).toHaveLength(input.currentState.世界.地图层级.length);
        expect(payload).not.toHaveProperty('beforeStateJson');
    });
});
