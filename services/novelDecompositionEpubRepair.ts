import type {
    小说拆分章节结构,
    小说拆分数据集结构,
    小说拆分分段结构,
    小说拆分任务结构
} from '../models/novelDecomposition';
import type { EPUB导入章节结构 } from './epubImport';
import { 根据章节生成分段列表 } from './novelDecompositionPipeline';

const 生成ID = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 规范化匹配文本 = (value: string): string => String(value || '')
    .replace(/\s+/gu, '')
    .replace(/[※◆◇●○□■]+/gu, '')
    .trim();

const 计算内容匹配分数 = (oldContent: string, nextContent: string): number => {
    const oldText = 规范化匹配文本(oldContent);
    const nextText = 规范化匹配文本(nextContent);
    if (oldText.length < 8 || nextText.length < 8) return 0;
    if (oldText === nextText) return 1;
    if (nextText.includes(oldText) || oldText.includes(nextText)) {
        return Math.min(oldText.length, nextText.length) / Math.max(oldText.length, nextText.length);
    }
    const anchorLength = Math.min(80, oldText.length, nextText.length);
    if (anchorLength >= 20 && nextText.includes(oldText.slice(0, anchorLength))) {
        return Math.min(0.8, oldText.length / nextText.length);
    }
    return 0;
};

export const 将EPUB导入章节转换为小说拆分章节 = (
    datasetId: string,
    importedChapters: EPUB导入章节结构[],
    now = Date.now()
): 小说拆分章节结构[] => importedChapters.map((chapter, index) => ({
    id: 生成ID('novel_chapter'),
    数据集ID: datasetId,
    序号: index + 1,
    标题: chapter.标题,
    内容: chapter.内容,
    字数: chapter.内容.length,
    createdAt: now,
    updatedAt: now
}));

const 清空分段结果 = (segment: 小说拆分分段结构): 小说拆分分段结构 => ({
    ...segment,
    原文摘要: '',
    本组概括: '',
    开局已成立事实: [],
    前组延续事实: [],
    本组结束状态: [],
    给下一组参考: [],
    原著硬约束: [],
    可提前铺垫: [],
    关键事件: [],
    角色推进: [],
    登场角色: [],
    角色档案: [],
    势力档案: [],
    地图地点档案: [],
    物品档案: [],
    世界观规则: [],
    世界边界规则: [],
    人物关系: [],
    势力关系: [],
    伏笔线索: [],
    回收点: [],
    章节节奏: [],
    时间线: [],
    时间线起点: '',
    时间线终点: '',
    处理状态: '待处理',
    最近错误: ''
});

export const 修复小说拆分数据集EPUB章节 = (params: {
    dataset: 小说拆分数据集结构;
    tasks: 小说拆分任务结构[];
    importedChapters: EPUB导入章节结构[];
}): {
    dataset: 小说拆分数据集结构;
    tasks: 小说拆分任务结构[];
    summary: { preservedCompletedSegments: number; requeuedSegments: number; removedChapters: number };
} => {
    const now = Date.now();
    const oldChapters = params.dataset.章节列表 || [];
    const oldToNewIndex = new Map<string, number>();

    oldChapters.forEach((oldChapter) => {
        let bestIndex = -1;
        let bestScore = 0;
        params.importedChapters.forEach((chapter, index) => {
            const score = 计算内容匹配分数(oldChapter.内容, chapter.内容);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });
        if (bestIndex >= 0 && bestScore >= 0.08) oldToNewIndex.set(oldChapter.id, bestIndex);
    });

    const firstOldChapterByNewIndex = new Map<number, 小说拆分章节结构>();
    oldChapters.forEach((chapter) => {
        const index = oldToNewIndex.get(chapter.id);
        if (index !== undefined && !firstOldChapterByNewIndex.has(index)) firstOldChapterByNewIndex.set(index, chapter);
    });

    const chapters = params.importedChapters.map((chapter, index): 小说拆分章节结构 => {
        const oldChapter = firstOldChapterByNewIndex.get(index);
        return {
            id: oldChapter?.id || 生成ID('novel_chapter'),
            数据集ID: params.dataset.id,
            序号: index + 1,
            标题: chapter.标题,
            内容: chapter.内容,
            字数: chapter.内容.length,
            createdAt: oldChapter?.createdAt || now,
            updatedAt: now
        };
    });

    const segmentMappings = (params.dataset.分段列表 || []).map((oldSegment) => {
        const sourceChapters = oldChapters.filter((chapter) => (
            chapter.序号 >= oldSegment.起始章序号 && chapter.序号 <= oldSegment.结束章序号
        ));
        const mappedIndexes = Array.from(new Set(sourceChapters
            .map((chapter) => oldToNewIndex.get(chapter.id))
            .filter((index): index is number => index !== undefined)))
            .sort((a, b) => a - b);
        return { oldSegment, sourceChapters, mappedIndexes };
    });
    const mappedIndexUsage = new Map<number, number>();
    segmentMappings.forEach(({ mappedIndexes }) => {
        mappedIndexes.forEach((index) => mappedIndexUsage.set(index, (mappedIndexUsage.get(index) || 0) + 1));
    });

    const claimedChapterIndexes = new Set<number>();
    let preservedCompletedSegments = 0;
    const repairedSegments: 小说拆分分段结构[] = [];

    segmentMappings.forEach(({ oldSegment, sourceChapters, mappedIndexes }) => {
        if (mappedIndexes.length <= 0 || mappedIndexes.some((index) => claimedChapterIndexes.has(index))) return;
        if (mappedIndexes.some((index) => (mappedIndexUsage.get(index) || 0) > 1)) return;

        const significantSource = sourceChapters.filter((chapter) => 规范化匹配文本(chapter.内容).length >= 8);
        const allSignificantMatched = significantSource.every((chapter) => oldToNewIndex.has(chapter.id));
        const group = mappedIndexes.map((index) => chapters[index]);
        const generated = 根据章节生成分段列表({
            ...params.dataset,
            分段模式: 'custom_ranges',
            每批章数: Math.max(1, group.length),
            章节列表: group
        }, group)[0];
        if (!generated) return;
        mappedIndexes.forEach((index) => claimedChapterIndexes.add(index));

        const canPreserve = oldSegment.处理状态 === '已完成' && allSignificantMatched;
        const repaired: 小说拆分分段结构 = {
            ...(canPreserve ? oldSegment : 清空分段结果(oldSegment)),
            id: oldSegment.id,
            数据集ID: params.dataset.id,
            标题: generated.标题,
            章节范围: generated.章节范围,
            章节标题: generated.章节标题,
            是否开局组: false,
            起始章序号: generated.起始章序号,
            结束章序号: generated.结束章序号,
            原文内容: generated.原文内容,
            字数: generated.字数,
            updatedAt: now
        };
        if (canPreserve) preservedCompletedSegments += 1;
        repairedSegments.push(repaired);
    });

    const unmatchedChapterRuns: 小说拆分章节结构[][] = [];
    chapters.forEach((chapter, index) => {
        if (claimedChapterIndexes.has(index)) return;
        const currentRun = unmatchedChapterRuns[unmatchedChapterRuns.length - 1];
        if (!currentRun || currentRun[currentRun.length - 1].序号 + 1 !== chapter.序号) {
            unmatchedChapterRuns.push([chapter]);
            return;
        }
        currentRun.push(chapter);
    });
    unmatchedChapterRuns.forEach((run) => {
        repairedSegments.push(...根据章节生成分段列表({
            ...params.dataset,
            章节列表: run
        }, run));
    });
    repairedSegments.sort((a, b) => a.起始章序号 - b.起始章序号);
    repairedSegments.forEach((segment, index) => {
        segment.组号 = index + 1;
        segment.是否开局组 = index === 0;
    });

    const 原始文本 = chapters.map((chapter) => `${chapter.标题}\n${chapter.内容}`).join('\n\n');
    const dataset: 小说拆分数据集结构 = {
        ...params.dataset,
        原始文本,
        原始文本长度: 原始文本.length,
        原始文本摘要: 原始文本.slice(0, 240),
        总章节数: chapters.length,
        章节列表: chapters,
        分段列表: repairedSegments,
        updatedAt: now
    };
    const completedSegmentIds = new Set(repairedSegments.filter((segment) => segment.处理状态 === '已完成').map((segment) => segment.id));
    const pendingSegments = repairedSegments.filter((segment) => segment.处理状态 !== '已完成');
    const tasks = params.tasks.map((task) => {
        if (task.数据集ID !== params.dataset.id) return task;
        const completedIds = task.已完成分段ID列表.filter((id) => completedSegmentIds.has(id));
        const completedCount = completedIds.length;
        const total = repairedSegments.length;
        const currentIndex = pendingSegments.length > 0
            ? Math.max(0, repairedSegments.findIndex((segment) => segment.处理状态 !== '已完成'))
            : total;
        return {
            ...task,
            状态: pendingSegments.length > 0 ? 'queued' as const : 'completed' as const,
            当前阶段: pendingSegments.length > 0 ? 'processing' as const : 'completed' as const,
            当前游标: currentIndex,
            已完成分段ID列表: completedIds,
            失败分段ID列表: [],
            最近错误: '',
            下次补漏时间: undefined,
            completedAt: pendingSegments.length > 0 ? undefined : now,
            updatedAt: now,
            进度: {
                总分段数: total,
                已完成分段数: completedCount,
                失败分段数: 0,
                当前分段索引: currentIndex,
                百分比: total > 0 ? Math.floor((completedCount / total) * 100) : 0
            }
        };
    });

    return {
        dataset,
        tasks,
        summary: {
            preservedCompletedSegments,
            requeuedSegments: pendingSegments.length,
            removedChapters: Math.max(0, oldChapters.length - chapters.length)
        }
    };
};
