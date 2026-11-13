import type { ModeRuntimeProfile, 题材模式类型 } from '../models/system';
import type { 小说拆分数据集结构 } from '../models/novelDecomposition';
import type { 小说模式包完善记录 } from '../models/novelModePackCompletion';
import type { NovelModePackCompletionResult } from './ai/storyTasks';
import { 构建小说模式包数据集指纹, 标准化小说模式包完善记录 } from './novelModePackCompletionStore';
import type { 清洗小说模式包累积草稿 } from './novelDecompositionWorkshopBridge';
import { 模式包单段原文最大字符数 } from '../prompts/runtime/novelModePackCompletion';

type 逐段完善依赖 = {
    dataset: 小说拆分数据集结构;
    baseMode: 题材模式类型;
    initialRecord: 小说模式包完善记录 | null;
    signal: AbortSignal;
    completeSegment: (params: {
        dataset: 小说拆分数据集结构;
        segmentIndex: number;
        baseMode: 题材模式类型;
        currentDraft: Partial<ModeRuntimeProfile>;
        confirmedFieldPaths: string[];
        signal: AbortSignal;
    }) => Promise<NovelModePackCompletionResult>;
    finalize: (params: {
        dataset: 小说拆分数据集结构;
        baseMode: 题材模式类型;
        currentDraft: Partial<ModeRuntimeProfile>;
        conflictHints: string[];
        confirmedFieldPaths: string[];
        signal: AbortSignal;
    }) => Promise<NovelModePackCompletionResult>;
    sanitize: typeof 清洗小说模式包累积草稿;
    save: (record: 小说模式包完善记录) => Promise<void>;
    wait?: (delayMs: number) => Promise<void>;
};

const 默认等待 = (delayMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delayMs));

const 是取消错误 = (error: unknown, signal: AbortSignal): boolean => (
    signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
);

const 带重试执行 = async <T>(
    operation: () => Promise<T>,
    signal: AbortSignal,
    wait: (delayMs: number) => Promise<void>
): Promise<T> => {
    const delays = [500, 1500];
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError');
        try {
            return await operation();
        } catch (error) {
            if (是取消错误(error, signal)) throw error;
            lastError = error;
            if (attempt < delays.length) await wait(delays[attempt]);
        }
    }
    throw lastError;
};

const 读取路径值 = (source: any, path: string): unknown => (
    path.split('.').reduce((value, key) => value?.[key], source)
);

const 写入路径值 = (target: any, path: string, value: unknown): void => {
    const keys = path.split('.').filter(Boolean);
    if (keys.length === 0) return;
    let cursor = target;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = structuredClone(value);
};

const 删除路径值 = (target: any, path: string): void => {
    const keys = path.split('.').filter(Boolean);
    if (keys.length === 0) return;
    let cursor = target;
    for (let index = 0; index < keys.length - 1; index += 1) {
        if (!cursor || typeof cursor !== 'object') return;
        cursor = cursor[keys[index]];
    }
    if (cursor && typeof cursor === 'object') delete cursor[keys[keys.length - 1]];
};

const 恢复用户确认字段 = (
    previousDraft: Partial<ModeRuntimeProfile>,
    nextDraft: Partial<ModeRuntimeProfile>,
    confirmedFieldPaths: string[]
): Partial<ModeRuntimeProfile> => {
    const protectedDraft = structuredClone(nextDraft);
    confirmedFieldPaths.forEach((path) => {
        const value = 读取路径值(previousDraft, path);
        if (value === undefined) 删除路径值(protectedDraft, path);
        else 写入路径值(protectedDraft, path, value);
    });
    return protectedDraft;
};

const 错误文本 = (error: unknown): string => (
    error instanceof Error ? error.message : String(error || '未知错误')
);

export const 执行小说模式包逐段完善 = async (
    dependencies: 逐段完善依赖
): Promise<小说模式包完善记录> => {
    const { dataset, baseMode, signal } = dependencies;
    const wait = dependencies.wait || 默认等待;
    const now = Date.now();
    let record = dependencies.initialRecord
        ? 标准化小说模式包完善记录(dependencies.initialRecord)
        : 标准化小说模式包完善记录({
            id: `${dataset.id}::${baseMode}`,
            数据集ID: dataset.id,
            题材: baseMode,
            数据集指纹: await 构建小说模式包数据集指纹(dataset),
            状态: 'idle',
            当前阶段: 'skeleton',
            总分段数: dataset.分段列表.length,
            已完成分段数: 0,
            下一个分段索引: 0,
            当前草稿: {},
            createdAt: now,
            updatedAt: now
        });

    for (let index = record.下一个分段索引; index < dataset.分段列表.length; index += 1) {
        const segment = dataset.分段列表[index];
        // 玩家主动跳过的分段：不再发起请求（避免同一段反复消耗额度），直接记为已处理。
        if (record.跳过分段ID列表.includes(segment.id)) {
            record = {
                ...record,
                已完成分段数: index + 1,
                下一个分段索引: index + 1,
                最近失败分段索引: undefined,
                updatedAt: Date.now()
            };
            continue;
        }
        const inputRecord = {
            分段ID: segment.id,
            原文总字符数: segment.原文内容?.length || 0,
            实际输入字符数: Math.min(segment.原文内容?.length || 0, 模式包单段原文最大字符数),
            是否完整输入: (segment.原文内容?.length || 0) <= 模式包单段原文最大字符数
        };
        record = {
            ...record,
            状态: 'running',
            当前阶段: index === 0 ? 'skeleton' : 'segment',
            当前分段ID: segment.id,
            当前分段标题: segment.标题,
            分段输入记录: [...record.分段输入记录.filter((item) => item.分段ID !== segment.id), inputRecord],
            最近错误: undefined,
            updatedAt: Date.now()
        };
        await dependencies.save(record);
        try {
            const result = await 带重试执行(() => dependencies.completeSegment({
                dataset,
                segmentIndex: index,
                baseMode,
                currentDraft: record.当前草稿,
                confirmedFieldPaths: record.用户确认字段路径,
                signal
            }), signal, wait);
            const sanitized = dependencies.sanitize(dataset, baseMode, result.completion);
            record = {
                ...record,
                当前草稿: 恢复用户确认字段(record.当前草稿, sanitized, record.用户确认字段路径),
                分段输入记录: [...record.分段输入记录.filter((item) => item.分段ID !== segment.id), {
                    分段ID: segment.id,
                    原文总字符数: result.inputStats?.原文总字符数 ?? segment.原文内容.length,
                    实际输入字符数: result.inputStats?.实际输入字符数 ?? segment.原文内容.length,
                    是否完整输入: result.inputStats?.是否完整输入 ?? true
                }],
                待整理冲突提示: [...record.待整理冲突提示, ...(result.conflictHints || [])],
                最近原始输出: result.rawText,
                已完成分段数: index + 1,
                下一个分段索引: index + 1,
                最近失败分段索引: undefined,
                最近错误: undefined,
                updatedAt: Date.now()
            };
            await dependencies.save(record);
        } catch (error) {
            record = {
                ...record,
                状态: 'paused',
                最近失败分段索引: index,
                最近错误: 是取消错误(error, signal) ? '用户已取消，可稍后继续。' : 错误文本(error),
                updatedAt: Date.now()
            };
            await dependencies.save(record);
            return record;
        }
    }

    record = {
        ...record,
        状态: 'finalizing',
        当前阶段: 'finalize',
        当前分段ID: undefined,
        当前分段标题: undefined,
        最近错误: undefined,
        updatedAt: Date.now()
    };
    await dependencies.save(record);
    try {
        const result = await 带重试执行(() => dependencies.finalize({
            dataset,
            baseMode,
            currentDraft: record.当前草稿,
            conflictHints: record.待整理冲突提示,
            confirmedFieldPaths: record.用户确认字段路径,
            signal
        }), signal, wait);
        const sanitized = dependencies.sanitize(dataset, baseMode, result.completion);
        record = {
            ...record,
            状态: 'completed',
            当前草稿: 恢复用户确认字段(record.当前草稿, sanitized, record.用户确认字段路径),
            最近原始输出: result.rawText,
            最近错误: undefined,
            updatedAt: Date.now()
        };
    } catch (error) {
        record = {
            ...record,
            状态: 是取消错误(error, signal) ? 'paused' : 'finalizing',
            最近错误: 是取消错误(error, signal) ? '用户已取消，可稍后继续。' : 错误文本(error),
            updatedAt: Date.now()
        };
    }
    await dependencies.save(record);
    return record;
};
