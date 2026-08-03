import { describe, expect, it, vi } from 'vitest';
import { 执行小说拆分EPUB修复工作流 } from '../services/novelDecompositionEpubRepairWorkflow';

const 创建依赖 = (calls: string[], options?: { writeFailure?: boolean }) => {
    let idleReached = false;
    const staleDataset = { id: 'dataset-1', 标题: '旧状态', 章节列表: [] } as any;
    const freshDataset = { id: 'dataset-1', 标题: '收尾后的最新状态', 章节列表: [] } as any;
    const repairedDataset = { ...freshDataset, 标题: '已修复' } as any;
    const repairedTasks = [{ id: 'task-1', 数据集ID: 'dataset-1', 状态: 'queued' }] as any[];
    const repair = vi.fn((params: any) => {
        calls.push('repair');
        return {
            dataset: repairedDataset,
            tasks: repairedTasks,
            summary: { preservedCompletedSegments: 102, requeuedSegments: 108, removedChapters: 249 }
        };
    });
    return {
        staleDataset,
        freshDataset,
        repairedDataset,
        repairedTasks,
        repair,
        dependencies: {
            stop: () => calls.push('stop'),
            interrupt: () => {
                calls.push('interrupt');
                return true;
            },
            waitForIdle: async () => {
                calls.push('waitForIdle');
                idleReached = true;
            },
            readDatasets: async () => {
                calls.push('readDatasets');
                return [idleReached ? freshDataset : staleDataset];
            },
            readTasks: async () => {
                calls.push('readTasks');
                return repairedTasks;
            },
            readSnapshots: async () => {
                calls.push('readSnapshots');
                return [{ id: 'old-snapshot', 数据集ID: 'dataset-1' }] as any[];
            },
            repair,
            aggregate: (dataset: any) => dataset,
            writeDataset: async () => {
                calls.push('writeDataset');
                if (options?.writeFailure) throw new Error('保存失败');
                return [];
            },
            writeTasks: async () => {
                calls.push('writeTasks');
            },
            buildSnapshots: () => [{ id: 'new-snapshot', 数据集ID: 'dataset-1' }] as any[],
            writeSnapshots: async () => {
                calls.push('writeSnapshots');
            },
            restart: () => calls.push('restart')
        }
    };
};

describe('EPUB 修复工作流', () => {
    it('等待旧执行器收尾后重新读取并保存修复结果', async () => {
        const calls: string[] = [];
        const fixture = 创建依赖(calls);

        const result = await 执行小说拆分EPUB修复工作流({
            datasetId: 'dataset-1',
            runningTaskIds: ['task-1'],
            importedChapters: [{ 标题: '第1章', 内容: '正文', 序号: 1 }],
            backgroundEnabled: true,
            dependencies: fixture.dependencies
        });

        expect(calls).toEqual([
            'stop', 'interrupt', 'waitForIdle',
            'readDatasets', 'readTasks', 'readSnapshots', 'repair',
            'writeDataset', 'writeTasks', 'writeSnapshots', 'restart'
        ]);
        expect(fixture.repair).toHaveBeenCalledWith(expect.objectContaining({
            dataset: fixture.freshDataset
        }));
        expect(result.dataset).toBe(fixture.repairedDataset);
    });

    it('保存失败时不会重新启动调度器', async () => {
        const calls: string[] = [];
        const fixture = 创建依赖(calls, { writeFailure: true });

        await expect(执行小说拆分EPUB修复工作流({
            datasetId: 'dataset-1',
            runningTaskIds: ['task-1'],
            importedChapters: [{ 标题: '第1章', 内容: '正文', 序号: 1 }],
            backgroundEnabled: true,
            dependencies: fixture.dependencies
        })).rejects.toThrow('请重新执行一次 EPUB 修复');

        expect(calls).not.toContain('restart');
    });

    it('后台关闭时保存成功也不启动调度器', async () => {
        const calls: string[] = [];
        const fixture = 创建依赖(calls);

        await 执行小说拆分EPUB修复工作流({
            datasetId: 'dataset-1',
            runningTaskIds: [],
            importedChapters: [{ 标题: '第1章', 内容: '正文', 序号: 1 }],
            backgroundEnabled: false,
            dependencies: fixture.dependencies
        });

        expect(calls).not.toContain('restart');
    });

    it('等待收尾失败时恢复后台调度且不执行修复写入', async () => {
        const calls: string[] = [];
        const fixture = 创建依赖(calls);
        fixture.dependencies.waitForIdle = async () => {
            calls.push('waitForIdle');
            throw new Error('等待失败');
        };

        await expect(执行小说拆分EPUB修复工作流({
            datasetId: 'dataset-1',
            runningTaskIds: ['task-1'],
            importedChapters: [{ 标题: '第1章', 内容: '正文', 序号: 1 }],
            backgroundEnabled: true,
            dependencies: fixture.dependencies
        })).rejects.toThrow('等待失败');

        expect(calls).toEqual(['stop', 'interrupt', 'waitForIdle', 'restart']);
        expect(fixture.repair).not.toHaveBeenCalled();
    });

    it('目标数据集缺失时恢复后台调度且不执行写入', async () => {
        const calls: string[] = [];
        const fixture = 创建依赖(calls);
        fixture.dependencies.readDatasets = async () => {
            calls.push('readDatasets');
            return [];
        };

        await expect(执行小说拆分EPUB修复工作流({
            datasetId: 'dataset-missing',
            runningTaskIds: [],
            importedChapters: [{ 标题: '第1章', 内容: '正文', 序号: 1 }],
            backgroundEnabled: true,
            dependencies: fixture.dependencies
        })).rejects.toThrow('目标小说分解数据集已不存在');

        expect(calls).toEqual([
            'stop', 'waitForIdle', 'readDatasets', 'readTasks', 'readSnapshots', 'restart'
        ]);
        expect(fixture.repair).not.toHaveBeenCalled();
    });
});
