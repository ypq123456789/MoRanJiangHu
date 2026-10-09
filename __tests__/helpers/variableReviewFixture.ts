import { vi } from 'vitest';
import { 规范化角色物品容器映射 } from '../../hooks/useGame/stateTransforms';
import { createVariableReviewActions } from '../../hooks/useGame/variableReviewActions';
import type { VariableReviewInput } from '../../hooks/useGame/variableReviewWorkflow';
export const reviewApi = { configs: [{ id: 'main', name: '测试', baseUrl: 'https://review.test/v1', apiKey: 'test-key', model: 'test-model', 供应商: 'openai' }], currentConfigId: 'main', activeConfigId: 'main', 功能模型占位: { 变量计算独立模型开关: false, 变量计算渠道ID: 'main', 变量计算使用模型: 'test-model' } } as any;
export const reviewOutput = (commands: any[] = [], status = commands.length ? '需要修复' : '无需修改') => `<说明>状态：${status}\n正文与变量已对比。</说明><命令>${commands.map(cmd => `${cmd.action} ${cmd.key}${cmd.action === 'delete' ? '' : ` = ${JSON.stringify(cmd.value)}`}`).join('\n')}</命令>`;
export const reviewGold = { action: 'add', key: '角色.金钱.金币', value: 100 };
export const createReviewRig = (body = '林岳获得100金币。') => {
    const initialState = {
        角色: 规范化角色物品容器映射({ 姓名: '林岳', 年龄: 18, 金钱: { 金币: 100, 金元宝: 100, 上层货币: 100, 中层货币: 0, 底层货币: 0, 银币: 0, 铜币: 0, 银子: 0, 铜钱: 0, baseAmount: 10000000 }, 物品列表: [], 装备: {} } as any, { 题材模式: '西幻' }),
        环境: { 时间: '1:01:01:08:00', 大地点: '城中', 中地点: '广场', 小地点: '客栈', 具体地点: '大厅' },
        社交: [], 世界: { 地图层级: [{ ID: 'DT-001', 名称: '客栈', 性别比例恢复回合: 3 }] }, 战斗: { 是否战斗中: false, 敌方: [] },
        玩家门派: {}, 任务列表: [{ ID: 'TASK-1', 名称: '旧任务', 状态: '已完成', 奖励描述: ['金币 +100'] }], 约定列表: [], 剧情: {}, 剧情规划: {}
    } as any;
    const source: VariableReviewInput = { currentState: initialState, history: [
        { role: 'user', content: '走进大厅', timestamp: 1 },
        { role: 'assistant', content: body, timestamp: 2, structuredResponse: { logs: [{ sender: '旁白', text: body }], tavern_commands: [] } }
    ] as any, beforeTurn: { provenance: 'live-before-turn' as const, sourceTurnId: 'assistant:2:1', state: structuredClone(initialState) } };
    const dependencies = { apiConfig: reviewApi, gameConfig: {}, openingConfig: { 题材模式: '西幻' } as any };
    const commit = vi.fn(next => { source.currentState = next; });
    const save = vi.fn().mockResolvedValue({ id: 1 });
    const actions = createVariableReviewActions({ getInput: () => source, getDependencies: () => dependencies, commitState: commit, saveState: save });
    return { source, dependencies, commit, save, actions };
};
