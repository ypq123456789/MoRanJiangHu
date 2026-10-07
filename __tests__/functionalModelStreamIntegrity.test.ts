/**
 * 功能模型流式完整性保护的接入回归测试。
 *
 * 背景：2026-10-07 玩家反馈「新版移动端记忆总结一直截断」。根因是中转站中途断流时，
 * `chatCompletionClient` 的 SSE 完成回调把**已累积的半截文本当完整结果返回**。
 * 更危险的是这些功能模型的返回对象里带着从半截文本解析出的**部分合法子集**，
 * 各路径原有的「解析为空则兜底」根本不会触发，于是变量/世界/规划被静默写坏一半。
 *
 * 本测试锁定一件事：这些路径接入 `执行带完整性校验的请求` 后，
 * 收到 `sawDone: false` 就必须自动降级非流式重试一次。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { 执行变量模型校准工作流 } from '../hooks/useGame/variableModelWorkflow';
import * as textAIService from '../services/ai/text';

vi.mock('../services/ai/text', () => ({
    generateVariableCalibrationUpdate: vi.fn(),
    generateWorldEvolutionUpdate: vi.fn(),
    generatePlanningAnalysis: vi.fn()
}));

const 创建功能接口配置 = () => ({
    configs: [
        {
            id: 'main',
            name: '测试接口',
            apiKey: 'test-key',
            model: 'test-model',
            baseUrl: 'https://example.com/v1',
            供应商: 'openai',
            协议覆盖: 'auto'
        }
    ],
    currentConfigId: 'main',
    功能模型占位: {
        变量计算独立模型开关: true,
        变量计算渠道ID: 'main',
        变量计算使用模型: 'test-model'
    }
});

const baseState = {
    角色: {
        姓名: '杨培强',
        物品列表: [
            { ID: 'pill_1', 名称: '回气丹', 堆叠数量: 3, 是否可堆叠: true },
            { ID: 'pill_2', 名称: '止血散', 堆叠数量: 2, 是否可堆叠: true }
        ]
    },
    环境: {},
    世界: {},
    社交: [],
    战斗: {},
    玩家门派: {},
    任务列表: [],
    约定列表: []
} as any;

// 命令路径必须落在「变量路径登记」允许的范围内，否则会被前端守卫拦掉。
const 完整变量结果 = {
    commands: [{ action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 }],
    reports: ['消耗回气丹 1 枚。'],
    rawText: '<命令>sub 角色.物品列表[0].堆叠数量 = 1</命令>'
};

/** 模拟一次「流式收到一半就被上游掐断」的模型调用。 */
const 模拟断流 = (半截结果: any, sawDone: boolean) => (
    async (...args: any[]) => {
        const onStreamEnd = args[6] as ((info: any) => void) | undefined;
        if (onStreamEnd) {
            onStreamEnd({ sawDone, finishReason: sawDone ? 'stop' : undefined, accumulatedLength: 12 });
        }
        return 半截结果;
    }
) as any;

describe('功能模型流式完整性保护接入', () => {
    beforeEach(() => {
        vi.mocked(textAIService.generateVariableCalibrationUpdate).mockReset();
    });

    it('变量生成：流式未收到结束标记时自动降级非流式重试一次', async () => {
        // 第一次（流式）被掐断 → 只解析出 1 条命令；第二次（非流式）返回完整结果。
        vi.mocked(textAIService.generateVariableCalibrationUpdate)
            .mockImplementationOnce(模拟断流(
                {
                    commands: [{ action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 }],
                    reports: [],
                    rawText: '<命令>sub 角色.物品列表[0].堆叠数量 = 1</命令><命'
                },
                false
            ))
            .mockImplementationOnce(async () => ({
                commands: [
                    { action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 },
                    { action: 'sub', key: '角色.物品列表[1].堆叠数量', value: 1 }
                ],
                reports: [],
                rawText: '<命令>sub 角色.物品列表[0].堆叠数量 = 1</命令><命令>sub 角色.物品列表[1].堆叠数量 = 1</命令>'
            }) as any);

        const result = await 执行变量模型校准工作流({
            playerInput: '挥出一剑。',
            parsedResponse: { logs: [{ sender: '旁白', text: '他挥出一剑。' }], tavern_commands: [] } as any,
            baseState,
            promptPool: [],
            worldEvolutionEnabled: false,
            onStreamDelta: () => {}
        } as any, {
            apiConfig: 创建功能接口配置(),
            gameConfig: {}
        });

        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(2);
        // 采用的是非流式重试的完整结果（两条命令），而不是被掐断的半截
        expect(result?.commands).toEqual([
            { action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 },
            { action: 'sub', key: '角色.物品列表[1].堆叠数量', value: 1 }
        ]);
    });

    it('变量生成：流式完整时不做多余的非流式重试', async () => {
        vi.mocked(textAIService.generateVariableCalibrationUpdate)
            .mockImplementationOnce((async (...args: any[]) => {
                const onStreamEnd = args[6] as ((info: any) => void) | undefined;
                onStreamEnd?.({ sawDone: true, finishReason: 'stop', accumulatedLength: 40 });
                return 完整变量结果;
            }) as any);

        await 执行变量模型校准工作流({
            playerInput: '挥出一剑。',
            parsedResponse: { logs: [{ sender: '旁白', text: '他挥出一剑。' }], tavern_commands: [] } as any,
            baseState,
            promptPool: [],
            worldEvolutionEnabled: false,
            onStreamDelta: () => {}
        } as any, {
            apiConfig: 创建功能接口配置(),
            gameConfig: {}
        });

        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(1);
    });

    it('变量生成：降级非流式重试也失败时整体丢弃，不交付疑似截断的可合并命令', async () => {
        // 半截命令块仍能解析出部分合法命令，若照原样返回会被 dedupedCommands 静默合并，
        // 表现为「一半变量命令被写进游戏状态」。这里必须抛错，让上层保留原文并提示重试。
        vi.mocked(textAIService.generateVariableCalibrationUpdate)
            .mockImplementationOnce(模拟断流(完整变量结果, false))
            .mockImplementationOnce(async () => {
                throw new Error('API Error: 524');
            }) as any;

        await expect(执行变量模型校准工作流({
            playerInput: '挥出一剑。',
            parsedResponse: { logs: [{ sender: '旁白', text: '他挥出一剑。' }], tavern_commands: [] } as any,
            baseState,
            promptPool: [],
            worldEvolutionEnabled: false,
            onStreamDelta: () => {}
        } as any, {
            apiConfig: 创建功能接口配置(),
            gameConfig: {}
        })).rejects.toMatchObject({ 降级重试失败: true });
    });

    it('变量生成：未启用流式时完全不走流式通道', async () => {
        vi.mocked(textAIService.generateVariableCalibrationUpdate)
            .mockImplementationOnce((async () => 完整变量结果) as any);

        await 执行变量模型校准工作流({
            playerInput: '挥出一剑。',
            parsedResponse: { logs: [{ sender: '旁白', text: '他挥出一剑。' }], tavern_commands: [] } as any,
            baseState,
            promptPool: [],
            worldEvolutionEnabled: false
        } as any, {
            apiConfig: 创建功能接口配置(),
            gameConfig: {}
        });

        expect(textAIService.generateVariableCalibrationUpdate).toHaveBeenCalledTimes(1);
        const 第五参数 = vi.mocked(textAIService.generateVariableCalibrationUpdate).mock.calls[0]?.[4];
        expect(第五参数).toBeUndefined();
    });
});