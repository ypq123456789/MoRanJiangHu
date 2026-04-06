import type { 小说拆分执行器结果 } from './novelDecompositionScheduler';
import { 小说拆分后台调度服务 } from './novelDecompositionScheduler';
import {
    更新小说拆分任务进度,
    规范化小说拆分任务进度,
    保存小说拆分注入快照列表,
    读取小说拆分注入快照列表,
    规范化小说拆分数据集,
    写入小说拆分数据集,
    更新小说拆分任务状态
} from './novelDecompositionStore';
import { 构建全部小说拆分注入快照 } from './novelDecompositionInjection';
import { 从原始文本提取章节, 根据章节生成分段列表, 聚合小说拆分数据集, 解析小说拆分分段 } from './novelDecompositionPipeline';
import * as dbService from './dbService';
import { 设置键 } from '../utils/settingsSchema';
import { 获取小说拆分接口配置, 规范化接口设置, 接口配置是否可用 } from '../utils/apiConfig';
import { 规范化游戏设置 } from '../utils/gameSettings';
import { 构建运行时额外提示词 } from '../prompts/runtime/nsfw';
import { 构建小说拆分AI角色声明提示词 } from '../prompts/runtime/novelDecomposition';

let 已初始化小说拆分运行时 = false;
let 小说拆分限流队列: Promise<void> = Promise.resolve();
let 小说拆分下次允许请求时间 = 0;

type 小说拆分中断模式 = 'paused' | 'cancelled';

const 创建小说拆分中断错误 = (mode: 小说拆分中断模式) => {
    const error = new Error(mode === 'paused' ? '小说拆分任务已暂停' : '小说拆分任务已取消');
    error.name = 'NovelDecompositionAbortError';
    (error as Error & { mode?: 小说拆分中断模式 }).mode = mode;
    return error;
};

const 读取小说拆分中断模式 = (signalOrError?: AbortSignal | unknown): 小说拆分中断模式 => {
    if (signalOrError && typeof signalOrError === 'object' && 'aborted' in signalOrError) {
        const signal = signalOrError as AbortSignal;
        return signal.reason === 'paused' ? 'paused' : 'cancelled';
    }
    if (signalOrError && typeof signalOrError === 'object' && 'mode' in signalOrError) {
        return (signalOrError as { mode?: 小说拆分中断模式 }).mode === 'paused' ? 'paused' : 'cancelled';
    }
    return 'cancelled';
};

const 是小说拆分中断错误 = (error: unknown): boolean => (
    (error instanceof Error && error.name === 'NovelDecompositionAbortError')
    || (error instanceof DOMException && error.name === 'AbortError')
);

const 检查小说拆分中断 = (signal?: AbortSignal) => {
    if (signal?.aborted) {
        throw 创建小说拆分中断错误(读取小说拆分中断模式(signal));
    }
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
        reject(创建小说拆分中断错误(读取小说拆分中断模式(signal)));
        return;
    }

    const timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', handleAbort);
        resolve();
    }, ms);

    const handleAbort = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', handleAbort);
        reject(创建小说拆分中断错误(读取小说拆分中断模式(signal)));
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
});

let 当前运行任务控制器: {
    taskId: string;
    controller: AbortController;
    mode: 小说拆分中断模式 | null;
} | null = null;

const 读取接口设置 = async () => {
    const raw = await dbService.读取设置(设置键.API配置);
    return 规范化接口设置(raw);
};

const 读取游戏设置 = async () => {
    const raw = await dbService.读取设置(设置键.游戏设置);
    return 规范化游戏设置(raw as any);
};

const 等待小说拆分请求额度 = async (rpmLimit: number, signal?: AbortSignal): Promise<void> => {
    const normalizedRpm = Math.max(1, Math.floor(Number(rpmLimit) || 10));
    const intervalMs = Math.max(0, Math.ceil(60000 / normalizedRpm));
    const previousQueue = 小说拆分限流队列;
    let releaseCurrent!: () => void;
    小说拆分限流队列 = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
    });

    await previousQueue;
    try {
        检查小说拆分中断(signal);
        const now = Date.now();
        const waitMs = Math.max(0, 小说拆分下次允许请求时间 - now);
        if (waitMs > 0) {
            await sleep(waitMs, signal);
        }
        检查小说拆分中断(signal);
        小说拆分下次允许请求时间 = Date.now() + intervalMs;
    } finally {
        releaseCurrent();
    }
};

const 刷新数据集快照 = async (dataset: ReturnType<typeof 规范化小说拆分数据集>) => {
    const snapshots = 构建全部小说拆分注入快照(dataset);
    const existingSnapshots = await 读取小说拆分注入快照列表();
    const nextSnapshots = [
        ...existingSnapshots.filter((item) => item.数据集ID !== dataset.id),
        ...snapshots
    ];
    await 保存小说拆分注入快照列表(nextSnapshots);
};

const 计算任务进度 = (dataset: ReturnType<typeof 规范化小说拆分数据集>, task: any) => {
    const allSegments = Array.isArray(dataset.分段列表) ? dataset.分段列表 : [];
    const completedSegments = allSegments.filter((item) => item.处理状态 === '已完成');
    const failedSegments = allSegments.filter((item) => item.处理状态 === '失败');
    const total = allSegments.length;
    const firstIncompleteIndex = allSegments.findIndex((item) => item.处理状态 !== '已完成');
    const currentIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : total;
    return 规范化小说拆分任务进度({
        ...(task?.进度 || {}),
        总分段数: total,
        已完成分段数: completedSegments.length,
        失败分段数: failedSegments.length,
        当前分段索引: currentIndex,
        百分比: total > 0 ? Math.round((completedSegments.length / total) * 100) : 0
    });
};

const 获取上一已完成分段结束时间 = (
    segments: ReturnType<typeof 规范化小说拆分数据集>['分段列表'],
    currentIndex: number
): string => {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const previous = segments[index];
        const timelineEnd = (previous?.时间线终点 || '').trim();
        if (previous?.处理状态 === '已完成' && timelineEnd) {
            return timelineEnd;
        }
    }
    return '';
};

const 构建前一组参考文本 = (
    segments: ReturnType<typeof 规范化小说拆分数据集>['分段列表'],
    currentIndex: number
): string => {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const previous = segments[index];
        if (previous?.处理状态 !== '已完成') continue;
        const lines: string[] = [];
        lines.push(`上一组号：${previous.组号 || index + 1}`);
        if ((previous.章节范围 || '').trim()) {
            lines.push(`上一组章节范围：${previous.章节范围}`);
        }
        if ((previous.时间线终点 || '').trim()) {
            lines.push(`上一组结束时间：${previous.时间线终点}`);
            lines.push(`本组开始时间线参考：${previous.时间线终点}`);
        }
        if (Array.isArray(previous.本组结束状态) && previous.本组结束状态.length > 0) {
            lines.push('上一组结束状态：');
            lines.push(...previous.本组结束状态);
        }
        if (Array.isArray(previous.给下一组参考) && previous.给下一组参考.length > 0) {
            lines.push('上一组给下一组参考：');
            lines.push(...previous.给下一组参考);
        }
        if (Array.isArray(previous.关键事件) && previous.关键事件.length > 0) {
            lines.push('上一组关键事件延续影响：');
            previous.关键事件.forEach((event) => {
                const summary = [event.事件名, ...(event.对下一组影响 || [])].filter(Boolean).join('｜');
                if (summary) lines.push(summary);
            });
        }
        return lines.join('\n').trim();
    }
    return '';
};

const 获取首个未完成分段索引 = (
    segments: ReturnType<typeof 规范化小说拆分数据集>['分段列表']
): number => segments.findIndex((segment) => segment.处理状态 !== '已完成');

const 默认小说拆分执行器 = async (params: {
    task: any;
    dataset?: any;
}): Promise<小说拆分执行器结果> => {
    const task = params.task;
    const dataset = params.dataset ? 规范化小说拆分数据集(params.dataset) : null;

    if (!dataset) {
        return {
            type: 'failed',
            message: `任务“${task?.名称 || '未命名任务'}”未找到对应数据集，已标记为失败。`
        };
    }

    let workingDataset = dataset;
    const apiSettings = await 读取接口设置();
    const gameSettings = await 读取游戏设置();
    const resolvedApiConfig = 获取小说拆分接口配置(apiSettings);
    const novelFeature = apiSettings?.功能模型占位;
    const rpmLimit = Math.max(1, Number(novelFeature?.小说拆分RPM限制) || 10);
    const 小说拆分GPT模式 = gameSettings.独立APIGPT模式?.小说拆分 === true;
    const 小说拆分角色声明提示词 = 构建小说拆分AI角色声明提示词();
    const 小说拆分运行时额外提示词 = 构建运行时额外提示词(gameSettings.额外提示词 || '', gameSettings);

    if (!接口配置是否可用(resolvedApiConfig)) {
        return {
            type: 'failed',
            message: '小说拆分接口未配置可用的 baseUrl / apiKey / model，任务已停止，不再执行本地回退拆解。'
        };
    }

    小说拆分后台调度服务.reportProgress({
        taskId: task?.id,
        taskName: task?.名称,
        stageText: '检查拆分任务上下文',
        message: `已接入任务“${task?.名称 || '未命名任务'}”，准备检查章节与分段。`
    });

    if ((!workingDataset.章节列表 || workingDataset.章节列表.length <= 0) && (workingDataset.原始文本 || '').trim()) {
        小说拆分后台调度服务.reportProgress({
            taskId: task?.id,
            taskName: task?.名称,
            stageText: '自动拆章中',
            message: '检测到当前数据集尚未拆章，正在根据原文生成章节列表。'
        });
        const chapters = 从原始文本提取章节(workingDataset);
        workingDataset = 聚合小说拆分数据集(规范化小说拆分数据集({
            ...workingDataset,
            章节列表: chapters,
            总章节数: chapters.length
        }));
        await 写入小说拆分数据集(workingDataset);
        await 更新小说拆分任务状态(task.id, 'running', { 当前阶段: 'segmenting', lastRunAt: Date.now() });
    }

    if ((!workingDataset.分段列表 || workingDataset.分段列表.length <= 0) && workingDataset.章节列表.length > 0) {
        小说拆分后台调度服务.reportProgress({
            taskId: task?.id,
            taskName: task?.名称,
            stageText: '生成分段中',
            message: `章节已准备完成，正在按每批 ${Math.max(1, Number(workingDataset?.每批章数) || 1)} 章生成分段列表。`
        });
        const segments = 根据章节生成分段列表(workingDataset, workingDataset.章节列表);
        workingDataset = 聚合小说拆分数据集(规范化小说拆分数据集({
            ...workingDataset,
            分段列表: segments
        }));
        await 写入小说拆分数据集(workingDataset);
        await 更新小说拆分任务进度(task.id, {
            当前阶段: 'segmenting',
            进度: 规范化小说拆分任务进度({
                总分段数: segments.length,
                已完成分段数: 0,
                失败分段数: 0,
                当前分段索引: 0,
                百分比: 0
            })
        });
    }

    if (workingDataset.分段列表.length <= 0) {
        if (!(workingDataset.原始文本 || '').trim()) {
            return {
                type: 'failed',
                message: `任务“${task.名称}”没有原始文本，也没有可继续处理的分段。`
            };
        }

        await 刷新数据集快照(workingDataset);
        return {
            type: 'completed',
            message: `任务“${task.名称}”当前没有可处理分段，已刷新注入快照。`
        };
    }

    const batchSize = Math.max(1, Number(task?.单次处理批量) || 1);
    const 自动重试次数 = Math.max(0, Number(task?.自动重试次数) || 0);
    const firstIncompleteIndex = 获取首个未完成分段索引(workingDataset.分段列表);
    const firstIncompleteSegment = firstIncompleteIndex >= 0 ? workingDataset.分段列表[firstIncompleteIndex] : null;
    const 首个阻塞失败分段 = firstIncompleteSegment?.处理状态 === '失败'
        ? firstIncompleteSegment
        : null;

    if (首个阻塞失败分段) {
        const failedDataset = 聚合小说拆分数据集(workingDataset);
        const blockedIndex = 获取首个未完成分段索引(failedDataset.分段列表);
        await 写入小说拆分数据集(failedDataset);
        await 刷新数据集快照(failedDataset);
        await 更新小说拆分任务进度(task.id, {
            当前阶段: 'failed',
            当前游标: blockedIndex >= 0 ? blockedIndex : failedDataset.分段列表.length,
            已完成分段ID列表: failedDataset.分段列表.filter((item) => item.处理状态 === '已完成').map((item) => item.id),
            失败分段ID列表: [首个阻塞失败分段.id],
            最近错误: 首个阻塞失败分段.最近错误 || '存在待人工处理的失败分段',
            进度: 计算任务进度(failedDataset, task)
        });
        return {
            type: 'failed',
            message: `任务“${task.名称}”在分段“${首个阻塞失败分段.标题 || `第 ${firstIncompleteIndex + 1} 段`}”失败后已停止；请人工校对并将该分段打回“待处理”后再继续。`
        };
    }

    if (firstIncompleteIndex < 0) {
        const finalDataset = 聚合小说拆分数据集(workingDataset);
        await 写入小说拆分数据集(finalDataset);
        await 刷新数据集快照(finalDataset);
        await 更新小说拆分任务进度(task.id, {
            当前阶段: 'completed',
            当前游标: finalDataset.分段列表.length,
            已完成分段ID列表: finalDataset.分段列表.filter((item) => item.处理状态 === '已完成').map((item) => item.id),
            失败分段ID列表: finalDataset.分段列表.filter((item) => item.处理状态 === '失败').map((item) => item.id),
            进度: 规范化小说拆分任务进度({
                总分段数: finalDataset.分段列表.length,
                已完成分段数: finalDataset.分段列表.filter((item) => item.处理状态 === '已完成').length,
                失败分段数: finalDataset.分段列表.filter((item) => item.处理状态 === '失败').length,
                当前分段索引: finalDataset.分段列表.length,
                百分比: 100
            })
        });
        return {
            type: 'completed',
            message: `任务“${task.名称}”已完成，树状注入快照已刷新。`
        };
    }

    await 更新小说拆分任务状态(task.id, 'running', { 当前阶段: 'processing', lastRunAt: Date.now() });
    const batch: Array<{
        segment: ReturnType<typeof 规范化小说拆分数据集>['分段列表'][number];
        index: number;
    }> = [];
    for (let index = firstIncompleteIndex; index < workingDataset.分段列表.length; index += 1) {
        const segment = workingDataset.分段列表[index];
        if (!segment || segment.处理状态 === '已完成') {
            if (index === firstIncompleteIndex) continue;
            break;
        }
        if (segment.处理状态 === '失败') {
            break;
        }
        batch.push({ segment, index });
        if (batch.length >= batchSize) break;
    }
    const nextSegments = [...workingDataset.分段列表];
    let batchStoppedByFailure = false;
    let batchInterrupted = false;
    let interruptMode: 小说拆分中断模式 | null = null;
    let failedSegmentTitle = '';
    let processedCount = 0;
    const executionController = new AbortController();

    当前运行任务控制器 = {
        taskId: task.id,
        controller: executionController,
        mode: null
    };

    try {
        for (const { segment, index } of batch) {
            检查小说拆分中断(executionController.signal);
            小说拆分后台调度服务.reportProgress({
                taskId: task?.id,
                taskName: task?.名称,
                stageText: `正在解析分段 ${index + 1}/${workingDataset.分段列表.length}`,
                message: `开始处理分段“${segment.标题 || `第 ${index + 1} 段`}”。`,
                streamText: '',
                resetStream: true
            });
            nextSegments[index] = {
                ...nextSegments[index],
                处理状态: '处理中',
                updatedAt: Date.now()
            };
            workingDataset = 规范化小说拆分数据集({
                ...workingDataset,
                分段列表: [...nextSegments]
            });
            await 写入小说拆分数据集(workingDataset);

            try {
                const 最大尝试次数 = 自动重试次数 + 1;
                let 当前尝试次数 = 0;
                let parsedSegment: Awaited<ReturnType<typeof 解析小说拆分分段>> | null = null;
                let lastProcessingError: any = null;

                while (当前尝试次数 < 最大尝试次数) {
                    当前尝试次数 += 1;
                    if (当前尝试次数 > 1) {
                        小说拆分后台调度服务.reportProgress({
                            taskId: task?.id,
                            taskName: task?.名称,
                            stageText: `分段 ${index + 1}/${workingDataset.分段列表.length} 重试中`,
                            message: `分段“${segment.标题 || `第 ${index + 1} 段`}”第 ${当前尝试次数} 次尝试开始。`,
                            level: 'warning',
                            resetStream: true,
                            streamText: ''
                        });
                    }

                    try {
                        await 等待小说拆分请求额度(rpmLimit, executionController.signal);
                        检查小说拆分中断(executionController.signal);
                        const previousTimelineEnd = 获取上一已完成分段结束时间(nextSegments, index);
                        const previousGroupReference = 构建前一组参考文本(nextSegments, index);
                        const nextChapterTitles = index < nextSegments.length - 1
                            ? (Array.isArray(nextSegments[index + 1]?.章节标题) ? nextSegments[index + 1].章节标题.filter(Boolean) : [])
                            : [];
                        parsedSegment = await 解析小说拆分分段({
                            dataset: workingDataset,
                            segment: {
                                ...nextSegments[index],
                                处理状态: '处理中'
                            },
                            segmentIndex: index,
                            previousTimelineEnd,
                            previousGroupReference,
                            nextChapterTitles,
                            leadingSystemPrompt: 小说拆分角色声明提示词,
                            extraPrompt: 小说拆分运行时额外提示词,
                            apiConfig: resolvedApiConfig,
                            gptMode: 小说拆分GPT模式,
                            signal: executionController.signal,
                            onStreamDelta: (_delta, accumulated) => {
                                小说拆分后台调度服务.reportProgress({
                                    taskId: task?.id,
                                    taskName: task?.名称,
                                    stageText: 当前尝试次数 > 1
                                        ? `正在解析分段 ${index + 1}/${workingDataset.分段列表.length}（第 ${当前尝试次数} 次）`
                                        : `正在解析分段 ${index + 1}/${workingDataset.分段列表.length}`,
                                    streamText: accumulated
                                });
                            }
                        });
                        break;
                    } catch (error: any) {
                        if (是小说拆分中断错误(error)) {
                            throw error;
                        }
                        lastProcessingError = error;
                        if (当前尝试次数 >= 最大尝试次数) {
                            throw error;
                        }
                        小说拆分后台调度服务.reportProgress({
                            taskId: task?.id,
                            taskName: task?.名称,
                            stageText: `分段 ${index + 1}/${workingDataset.分段列表.length} 重试准备`,
                            message: `分段“${segment.标题 || `第 ${index + 1} 段`}”第 ${当前尝试次数} 次尝试失败：${error?.message || '未知错误'}；准备自动重试。`,
                            level: 'warning'
                        });
                    }
                }

                if (!parsedSegment) {
                    throw lastProcessingError || new Error('分段解析失败');
                }
                检查小说拆分中断(executionController.signal);
                nextSegments[index] = {
                    ...parsedSegment,
                    处理状态: '已完成',
                    最近错误: '',
                    updatedAt: Date.now()
                };
                processedCount += 1;
                小说拆分后台调度服务.reportProgress({
                    taskId: task?.id,
                    taskName: task?.名称,
                    stageText: `分段 ${index + 1}/${workingDataset.分段列表.length} 已完成`,
                    message: `分段“${segment.标题 || `第 ${index + 1} 段`}”解析完成。`
                });
            } catch (error: any) {
                if (是小说拆分中断错误(error)) {
                    batchInterrupted = true;
                    interruptMode = 当前运行任务控制器?.mode || 读取小说拆分中断模式(error);
                    nextSegments[index] = {
                        ...nextSegments[index],
                        处理状态: segment.处理状态 === '失败' ? '失败' : '待处理',
                        最近错误: '',
                        updatedAt: Date.now()
                    };
                    小说拆分后台调度服务.reportProgress({
                        taskId: task?.id,
                        taskName: task?.名称,
                        stageText: interruptMode === 'paused' ? '任务暂停中' : '任务取消中',
                        message: interruptMode === 'paused'
                            ? `分段“${segment.标题 || `第 ${index + 1} 段`}”已响应暂停请求，正在回写当前进度。`
                            : `分段“${segment.标题 || `第 ${index + 1} 段`}”已响应取消请求，正在回写当前进度。`,
                        level: 'warning',
                        resetStream: true
                    });
                    break;
                }

                nextSegments[index] = {
                    ...nextSegments[index],
                    处理状态: '失败',
                    最近错误: error?.message || '未知错误',
                    updatedAt: Date.now()
                };
                batchStoppedByFailure = true;
                failedSegmentTitle = segment.标题 || `第 ${index + 1} 段`;
                小说拆分后台调度服务.reportProgress({
                    taskId: task?.id,
                    taskName: task?.名称,
                    stageText: `分段 ${index + 1}/${workingDataset.分段列表.length} 失败`,
                    message: `分段“${failedSegmentTitle}”处理失败：${error?.message || '未知错误'}`,
                    level: 'error'
                });
                break;
            }
        }
    } finally {
        if (当前运行任务控制器?.taskId === task.id) {
            当前运行任务控制器 = null;
        }
    }

    workingDataset = 聚合小说拆分数据集(规范化小说拆分数据集({
        ...workingDataset,
        分段列表: nextSegments
    }));
    await 写入小说拆分数据集(workingDataset);

    小说拆分后台调度服务.reportProgress({
        taskId: task?.id,
        taskName: task?.名称,
        stageText: batchInterrupted ? '处理中断收尾' : '刷新注入快照中',
        message: batchInterrupted ? '已中断当前请求，正在保留已完成进度并刷新注入快照。' : '分段写回完成，正在重建注入快照。'
    });
    if (!batchInterrupted) {
        await 更新小说拆分任务状态(task.id, 'running', { 当前阶段: 'snapshotting', lastRunAt: Date.now() });
    }
    await 刷新数据集快照(workingDataset);

    const progress = 计算任务进度(workingDataset, task);
    const completedIds = workingDataset.分段列表.filter((item) => item.处理状态 === '已完成').map((item) => item.id);
    const failedIds = workingDataset.分段列表.filter((item) => item.处理状态 === '失败').map((item) => item.id);
    const hasPending = workingDataset.分段列表.some((item) => item.处理状态 !== '已完成');

    await 更新小说拆分任务进度(task.id, {
        当前阶段: hasPending ? 'processing' : 'completed',
        当前游标: progress.当前分段索引,
        已完成分段ID列表: completedIds,
        失败分段ID列表: failedIds,
        最近错误: failedIds.length > 0 ? workingDataset.分段列表.find((item) => item.处理状态 === '失败')?.最近错误 || '' : '',
        进度: progress
    });

    if (batchInterrupted) {
        return {
            type: interruptMode === 'paused' ? 'paused' : 'skipped',
            message: interruptMode === 'paused'
                ? `任务“${task.名称}”已暂停，进行中的请求已中断并保留当前进度。当前进度 ${progress.已完成分段数}/${progress.总分段数}。`
                : `任务“${task.名称}”已取消，进行中的请求已中断并保留已完成进度。当前进度 ${progress.已完成分段数}/${progress.总分段数}。`
        };
    }

    if (!hasPending) {
        小说拆分后台调度服务.reportProgress({
            taskId: task?.id,
            taskName: task?.名称,
            stageText: '任务已完成',
            message: `任务“${task.名称}”全部分段已完成并刷新注入快照。`,
            level: 'success'
        });
        return {
            type: 'completed',
            message: `任务“${task.名称}”已完成 ${progress.已完成分段数}/${progress.总分段数} 个分段，并刷新了注入快照。`
        };
    }

    if (batchStoppedByFailure) {
        const latestError = workingDataset.分段列表.find((item) => item.处理状态 === '失败')?.最近错误 || '当前章节处理失败';
        return {
            type: 'failed',
            message: `任务“${task.名称}”在分段“${failedSegmentTitle}”失败后已停止，未继续后续章节；请先人工校对并将该分段打回“待处理”。当前进度 ${progress.已完成分段数}/${progress.总分段数}；最近错误：${latestError}`
        };
    }

    return {
        type: 'progress',
        message: `任务“${task.名称}”本轮处理了 ${processedCount} 个分段，当前进度 ${progress.已完成分段数}/${progress.总分段数}。`
    };
};

export const 初始化小说拆分运行时 = (): void => {
    if (已初始化小说拆分运行时) return;
    小说拆分后台调度服务.registerExecutor(默认小说拆分执行器);
    已初始化小说拆分运行时 = true;
};

export const 请求中断小说拆分任务 = (
    taskId?: string,
    mode: 小说拆分中断模式 = 'cancelled'
): boolean => {
    if (!当前运行任务控制器) return false;
    if (taskId && 当前运行任务控制器.taskId !== taskId) return false;
    当前运行任务控制器.mode = mode;
    if (!当前运行任务控制器.controller.signal.aborted) {
        当前运行任务控制器.controller.abort(mode);
    }
    return true;
};
