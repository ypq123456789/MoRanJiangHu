import type {
    小说拆分数据集结构,
    小说拆分任务结构,
    小说拆分注入快照结构
} from '../models/novelDecomposition';
import type { EPUB导入章节结构 } from './epubImport';

type EPUB修复结果 = {
    dataset: 小说拆分数据集结构;
    tasks: 小说拆分任务结构[];
    summary: {
        preservedCompletedSegments: number;
        requeuedSegments: number;
        removedChapters: number;
    };
};

export type EPUB修复阶段 = 'waiting' | 'saving';

export interface EPUB修复工作流依赖 {
    stop: () => void;
    interrupt: (taskId: string, mode: 'paused') => boolean;
    waitForIdle: (options?: { timeoutMs?: number }) => Promise<void>;
    readDatasets: () => Promise<小说拆分数据集结构[]>;
    readTasks: () => Promise<小说拆分任务结构[]>;
    readSnapshots: () => Promise<小说拆分注入快照结构[]>;
    repair: (params: {
        dataset: 小说拆分数据集结构;
        tasks: 小说拆分任务结构[];
        importedChapters: EPUB导入章节结构[];
    }) => EPUB修复结果;
    aggregate: (dataset: 小说拆分数据集结构) => 小说拆分数据集结构;
    writeDataset: (dataset: 小说拆分数据集结构) => Promise<unknown>;
    writeTasks: (tasks: 小说拆分任务结构[]) => Promise<unknown>;
    buildSnapshots: (dataset: 小说拆分数据集结构) => 小说拆分注入快照结构[];
    writeSnapshots: (snapshots: 小说拆分注入快照结构[]) => Promise<unknown>;
    restart: () => void;
}

export const 执行小说拆分EPUB修复工作流 = async (params: {
    datasetId: string;
    runningTaskIds: string[];
    importedChapters: EPUB导入章节结构[];
    backgroundEnabled: boolean;
    waitTimeoutMs?: number;
    onPhaseChange?: (phase: EPUB修复阶段) => void;
    dependencies: EPUB修复工作流依赖;
}): Promise<EPUB修复结果> => {
    const { dependencies } = params;
    dependencies.stop();
    params.runningTaskIds.forEach((taskId) => dependencies.interrupt(taskId, 'paused'));
    params.onPhaseChange?.('waiting');
    await dependencies.waitForIdle({ timeoutMs: params.waitTimeoutMs ?? 120_000 });

    const datasets = await dependencies.readDatasets();
    const tasks = await dependencies.readTasks();
    const snapshots = await dependencies.readSnapshots();
    const dataset = datasets.find((item) => item.id === params.datasetId);
    if (!dataset) throw new Error('目标小说分解数据集已不存在');

    const result = dependencies.repair({
        dataset,
        tasks,
        importedChapters: params.importedChapters
    });
    const repairedDataset = dependencies.aggregate(result.dataset);
    const rebuiltSnapshots = dependencies.buildSnapshots(repairedDataset);

    params.onPhaseChange?.('saving');
    await dependencies.writeDataset(repairedDataset);
    await dependencies.writeTasks(result.tasks);
    await dependencies.writeSnapshots([
        ...snapshots.filter((item) => item.数据集ID !== repairedDataset.id),
        ...rebuiltSnapshots
    ]);

    if (params.backgroundEnabled && result.summary.requeuedSegments > 0) {
        dependencies.restart();
    }

    return {
        ...result,
        dataset: repairedDataset
    };
};
