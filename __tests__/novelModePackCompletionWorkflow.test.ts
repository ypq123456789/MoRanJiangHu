import { describe, expect, it, vi } from 'vitest';
import { 创建空小说拆分数据集 } from '../services/novelDecompositionStore';
import { 执行小说模式包逐段完善 } from '../services/novelModePackCompletionWorkflow';
import { 标准化小说模式包完善记录 } from '../services/novelModePackCompletionStore';

const 创建数据集 = () => {
    const dataset = 创建空小说拆分数据集({ id: 'dataset-flow', 标题: '流程小说' });
    dataset.分段列表 = [
        { id: 'seg-1', 标题: '第一段', 原文内容: '铜钱。' } as any,
        { id: 'seg-2', 标题: '第二段', 原文内容: '武学境界。' } as any,
        { id: 'seg-3', 标题: '第三段', 原文内容: '改称银票。' } as any
    ];
    return dataset;
};

const aiResult = (completion: Record<string, any>, rawText: string) => ({
    completion,
    rawText,
    conflictHints: [],
    inputStats: { 原文总字符数: 3, 实际输入字符数: 3, 是否完整输入: true }
});

describe('小说模式包逐段完善工作流', () => {
    it('依次处理三段并允许后文纠正前文货币', async () => {
        const saved: any[] = [];
        const completeSegment = vi.fn()
            .mockResolvedValueOnce(aiResult({ economy: { primaryCurrency: '铜钱' } }, 'first'))
            .mockResolvedValueOnce(aiResult({ economy: { primaryCurrency: '铜钱' }, ability: { primaryAxis: '武学境界' } }, 'second'))
            .mockResolvedValueOnce(aiResult({ economy: { primaryCurrency: '银票' }, ability: { primaryAxis: '武学境界' } }, 'third'));
        const result = await 执行小说模式包逐段完善({
            dataset: 创建数据集(),
            baseMode: '武侠',
            initialRecord: null,
            signal: new AbortController().signal,
            completeSegment,
            finalize: async ({ currentDraft }) => aiResult(currentDraft, 'final'),
            sanitize: (_dataset, _mode, draft) => draft,
            save: async (record) => { saved.push(structuredClone(record)); },
            wait: async () => undefined
        });
        expect(completeSegment).toHaveBeenCalledTimes(3);
        expect(completeSegment.mock.calls.map((call) => call[0].segmentIndex)).toEqual([0, 1, 2]);
        expect(result.当前草稿.economy?.primaryCurrency).toBe('银票');
        expect(result.状态).toBe('completed');
        expect(saved.some((item) => item.已完成分段数 === 1)).toBe(true);
    });

    it('重试耗尽后暂停，并从失败分段继续', async () => {
        const firstRun = vi.fn()
            .mockResolvedValueOnce(aiResult({ economy: { primaryCurrency: '铜钱' } }, 'first'))
            .mockRejectedValue(new Error('第二段失败'));
        const paused = await 执行小说模式包逐段完善({
            dataset: 创建数据集(),
            baseMode: '武侠',
            initialRecord: null,
            signal: new AbortController().signal,
            completeSegment: firstRun,
            finalize: async ({ currentDraft }) => aiResult(currentDraft, 'final'),
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        expect(paused.状态).toBe('paused');
        expect(paused.下一个分段索引).toBe(1);
        expect(firstRun).toHaveBeenCalledTimes(4);

        const resumedCalls = vi.fn()
            .mockResolvedValueOnce(aiResult({ economy: { primaryCurrency: '铜钱' }, ability: { primaryAxis: '武学境界' } }, 'second'))
            .mockResolvedValueOnce(aiResult({ economy: { primaryCurrency: '银票' } }, 'third'));
        const completed = await 执行小说模式包逐段完善({
            dataset: 创建数据集(),
            baseMode: '武侠',
            initialRecord: paused,
            signal: new AbortController().signal,
            completeSegment: resumedCalls,
            finalize: async ({ currentDraft }) => aiResult(currentDraft, 'final'),
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        expect(resumedCalls.mock.calls.map((call) => call[0].segmentIndex)).toEqual([1, 2]);
        expect(completed.状态).toBe('completed');
    });

    it('续跑和最终整理不会覆盖人工确认字段', async () => {
        const dataset = 创建数据集();
        const record = 标准化小说模式包完善记录({
            id: `${dataset.id}::武侠`,
            数据集ID: dataset.id,
            题材: '武侠',
            数据集指纹: 'fingerprint',
            状态: 'paused',
            当前阶段: 'segment',
            总分段数: 3,
            已完成分段数: 1,
            下一个分段索引: 1,
            当前草稿: { economy: { primaryCurrency: '用户银票' } },
            用户确认字段路径: ['economy.primaryCurrency']
        });
        const completeSegment = vi.fn().mockResolvedValue(aiResult({
            economy: { primaryCurrency: '模型铜钱' }
        }, 'segment'));
        const result = await 执行小说模式包逐段完善({
            dataset,
            baseMode: '武侠',
            initialRecord: record,
            signal: new AbortController().signal,
            completeSegment,
            finalize: async () => aiResult({ economy: { primaryCurrency: '最终金币' } }, 'final'),
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        expect(completeSegment.mock.calls[0][0].confirmedFieldPaths).toEqual(['economy.primaryCurrency']);
        expect(result.当前草稿.economy?.primaryCurrency).toBe('用户银票');
    });

    it('人工删除的确认字段在后续分段和最终整理中保持删除', async () => {
        const dataset = 创建数据集();
        const record = 标准化小说模式包完善记录({
            id: `${dataset.id}::武侠`,
            数据集ID: dataset.id,
            题材: '武侠',
            数据集指纹: 'fingerprint',
            状态: 'paused',
            当前阶段: 'segment',
            总分段数: 3,
            已完成分段数: 1,
            下一个分段索引: 1,
            当前草稿: {},
            用户确认字段路径: ['economy']
        });
        const result = await 执行小说模式包逐段完善({
            dataset,
            baseMode: '武侠',
            initialRecord: record,
            signal: new AbortController().signal,
            completeSegment: async () => aiResult({ economy: { primaryCurrency: '模型铜钱' } }, 'segment'),
            finalize: async () => aiResult({ economy: { primaryCurrency: '最终金币' } }, 'final'),
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        expect(result.当前草稿).not.toHaveProperty('economy');
    });

    it('跳过的分段不再发请求，进度继续并最终完成', async () => {
        const dataset = 创建数据集();
        const record = 标准化小说模式包完善记录({
            id: `${dataset.id}::武侠`,
            数据集ID: dataset.id,
            题材: '武侠',
            数据集指纹: 'fingerprint',
            状态: 'paused',
            当前阶段: 'segment',
            总分段数: 3,
            已完成分段数: 1,
            下一个分段索引: 1,
            最近失败分段索引: 1,
            跳过分段ID列表: ['seg-2'],
            当前草稿: { economy: { primaryCurrency: '铜钱' } }
        });
        const completeSegment = vi.fn().mockResolvedValue(aiResult({ economy: { primaryCurrency: '银票' } }, 'third'));
        const result = await 执行小说模式包逐段完善({
            dataset,
            baseMode: '武侠',
            initialRecord: record,
            signal: new AbortController().signal,
            completeSegment,
            finalize: async ({ currentDraft }) => aiResult(currentDraft, 'final'),
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        // 被跳过的第 2 段不应再触发任何 AI 请求
        expect(completeSegment.mock.calls.map((call) => call[0].segmentIndex)).toEqual([2]);
        expect(result.状态).toBe('completed');
        expect(result.已完成分段数).toBe(3);
        expect(result.跳过分段ID列表).toEqual(['seg-2']);
    });

    it('最终整理失败时只重试最终整理阶段', async () => {
        const dataset = 创建数据集();
        const finalizing = 标准化小说模式包完善记录({
            id: `${dataset.id}::武侠`,
            数据集ID: dataset.id,
            题材: '武侠',
            数据集指纹: 'fingerprint',
            状态: 'finalizing',
            当前阶段: 'finalize',
            总分段数: 3,
            已完成分段数: 3,
            下一个分段索引: 3,
            当前草稿: { economy: { primaryCurrency: '银票' } }
        });
        const completeSegment = vi.fn();
        const failed = await 执行小说模式包逐段完善({
            dataset,
            baseMode: '武侠',
            initialRecord: finalizing,
            signal: new AbortController().signal,
            completeSegment,
            finalize: async () => { throw new Error('整理失败'); },
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        expect(failed.状态).toBe('finalizing');
        expect(completeSegment).not.toHaveBeenCalled();

        const finalize = vi.fn(async ({ currentDraft }) => aiResult(currentDraft, 'final'));
        const completed = await 执行小说模式包逐段完善({
            dataset,
            baseMode: '武侠',
            initialRecord: failed,
            signal: new AbortController().signal,
            completeSegment,
            finalize,
            sanitize: (_dataset, _mode, draft) => draft,
            save: async () => undefined,
            wait: async () => undefined
        });
        expect(completed.状态).toBe('completed');
        expect(finalize).toHaveBeenCalledOnce();
        expect(completeSegment).not.toHaveBeenCalled();
    });
});
