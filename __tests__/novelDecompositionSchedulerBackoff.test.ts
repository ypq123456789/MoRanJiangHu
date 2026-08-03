import { beforeEach, describe, expect, it, vi } from 'vitest';

const schedulerMocks = vi.hoisted(() => ({
    readTasks: vi.fn(),
    readDatasets: vi.fn(),
    updateStatus: vi.fn()
}));

vi.mock('../services/novelDecompositionStore', () => ({
    读取小说拆分任务列表: schedulerMocks.readTasks,
    读取小说拆分数据集列表: schedulerMocks.readDatasets,
    筛选可后台续跑任务: (tasks: any[]) => tasks.filter((task) => (
        task.后台运行 === true
        && task.自动续跑 === true
        && ['queued', 'running'].includes(task.状态)
    )),
    获取小说拆分任务状态文本: vi.fn().mockReturnValue('执行中'),
    获取小说拆分任务排序分值: vi.fn().mockReturnValue(0),
    更新小说拆分任务状态: schedulerMocks.updateStatus
}));

import { 小说拆分后台调度服务 } from '../services/novelDecompositionScheduler';

describe('小说分解调度退避', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
        小说拆分后台调度服务.stop();
        小说拆分后台调度服务.resetLiveState();
        schedulerMocks.readDatasets.mockResolvedValue([]);
    });

    it('下次补漏时间未到时跳过任务', async () => {
        const executor = vi.fn().mockResolvedValue({ type: 'progress', message: '继续' });
        小说拆分后台调度服务.registerExecutor(executor);
        schedulerMocks.readTasks.mockResolvedValue([{
            id: 'task-future', 名称: '等待退避', 状态: 'running', 后台运行: true, 自动续跑: true,
            下次补漏时间: Date.now() + 10_000, updatedAt: 1
        }]);

        const state = await 小说拆分后台调度服务.tick();

        expect(executor).not.toHaveBeenCalled();
        expect(state.resumableTaskCount).toBe(0);
    });

    it('下次补漏时间已到时执行任务', async () => {
        const executor = vi.fn().mockResolvedValue({ type: 'progress', message: '继续' });
        小说拆分后台调度服务.registerExecutor(executor);
        schedulerMocks.readTasks.mockResolvedValue([{
            id: 'task-ready', 名称: '退避结束', 状态: 'running', 后台运行: true, 自动续跑: true,
            下次补漏时间: Date.now(), updatedAt: 1
        }]);

        await 小说拆分后台调度服务.tick();

        expect(executor).toHaveBeenCalledOnce();
        expect(executor).toHaveBeenCalledWith(expect.objectContaining({
            task: expect.objectContaining({ id: 'task-ready' })
        }));
    });

    it('调度器空闲时立即完成等待', async () => {
        await expect(小说拆分后台调度服务.waitForIdle()).resolves.toBeUndefined();
    });

    it('等待正在执行的任务真正收尾后才完成', async () => {
        let finishExecutor: (() => void) | null = null;
        const executor = vi.fn().mockImplementation(() => new Promise((resolve) => {
            finishExecutor = () => resolve({ type: 'progress', message: '已收尾' });
        }));
        小说拆分后台调度服务.registerExecutor(executor);
        schedulerMocks.readTasks.mockResolvedValue([{
            id: 'task-busy', 名称: '正在处理', 状态: 'running', 后台运行: true, 自动续跑: true,
            updatedAt: 1
        }]);

        const tickPromise = 小说拆分后台调度服务.tick();
        await vi.waitFor(() => expect(executor).toHaveBeenCalledOnce());
        let settled = false;
        const idlePromise = 小说拆分后台调度服务.waitForIdle().then(() => {
            settled = true;
        });

        await Promise.resolve();
        expect(settled).toBe(false);
        finishExecutor?.();
        await tickPromise;
        await idlePromise;
        expect(settled).toBe(true);
    });

    it('等待任务收尾超时时返回明确错误', async () => {
        const executor = vi.fn().mockImplementation(() => new Promise(() => undefined));
        小说拆分后台调度服务.registerExecutor(executor);
        schedulerMocks.readTasks.mockResolvedValue([{
            id: 'task-timeout', 名称: '无法及时收尾', 状态: 'running', 后台运行: true, 自动续跑: true,
            updatedAt: 1
        }]);

        void 小说拆分后台调度服务.tick();
        await vi.waitFor(() => expect(executor).toHaveBeenCalledOnce());
        const idlePromise = 小说拆分后台调度服务.waitForIdle({ timeoutMs: 50 });
        const rejection = expect(idlePromise).rejects.toThrow('等待小说拆分后台任务收尾超时');
        await vi.advanceTimersByTimeAsync(50);
        await rejection;
    });
});
