import type { 小说拆分任务结构, 小说拆分数据集结构 } from '../types';
import {
    读取小说拆分任务列表,
    读取小说拆分数据集列表,
    筛选可后台续跑任务,
    获取小说拆分任务状态文本,
    获取小说拆分任务排序分值,
    更新小说拆分任务状态
} from './novelDecompositionStore';

export type 小说拆分调度结果类型 = 'idle' | 'progress' | 'completed' | 'paused' | 'failed' | 'skipped';

export interface 小说拆分调度状态结构 {
    running: boolean;
    busy: boolean;
    executorReady: boolean;
    intervalMs: number;
    lastTickAt: number | null;
    lastResultText: string;
    currentTaskId: string | null;
    currentTaskName: string;
    resumableTaskCount: number;
    currentStageText: string;
    liveStreamText: string;
    recentLogs: 小说拆分调度日志结构[];
}

export interface 小说拆分调度日志结构 {
    id: string;
    timestamp: number;
    level: 'info' | 'success' | 'warning' | 'error';
    text: string;
    taskId?: string | null;
    taskName?: string;
}

export interface 小说拆分执行器上下文 {
    task: 小说拆分任务结构;
    dataset?: 小说拆分数据集结构;
}

export interface 小说拆分执行器结果 {
    type: 小说拆分调度结果类型;
    message: string;
}

type 小说拆分执行器 = (context: 小说拆分执行器上下文) => Promise<小说拆分执行器结果>;
type 调度订阅者 = (state: 小说拆分调度状态结构) => void;

const 默认间隔 = 6000;

class 小说拆分后台调度器 {
    private timer: ReturnType<typeof setInterval> | null = null;
    private subscribers = new Set<调度订阅者>();
    private executor: 小说拆分执行器 | null = null;
    private state: 小说拆分调度状态结构 = {
        running: false,
        busy: false,
        executorReady: false,
        intervalMs: 默认间隔,
        lastTickAt: null,
        lastResultText: '调度器待命',
        currentTaskId: null,
        currentTaskName: '',
        resumableTaskCount: 0,
        currentStageText: '等待任务',
        liveStreamText: '',
        recentLogs: []
    };

    subscribe(listener: 调度订阅者): () => void {
        this.subscribers.add(listener);
        listener(this.getState());
        return () => {
            this.subscribers.delete(listener);
        };
    }

    getState(): 小说拆分调度状态结构 {
        return { ...this.state };
    }

    registerExecutor(executor: 小说拆分执行器 | null): void {
        this.executor = executor;
        this.state.executorReady = Boolean(executor);
        this.emit();
    }

    start(intervalMs = 默认间隔): void {
        const normalizedInterval = Math.max(1000, Math.floor(intervalMs));
        const wasRunning = this.state.running;
        const previousInterval = this.state.intervalMs;
        const hadTimer = Boolean(this.timer);
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.state.running = true;
        this.state.intervalMs = normalizedInterval;
        this.state.lastResultText = this.executor
            ? (wasRunning ? '后台调度器已重置扫描周期' : '后台调度器已启动')
            : (wasRunning ? '后台调度器已重置扫描周期，等待拆分执行器接入' : '后台调度器已启动，等待拆分执行器接入');
        if (!this.state.busy) {
            this.state.currentStageText = wasRunning ? '后台轮询运行中' : '后台轮询已启动';
        }
        if (!wasRunning || !hadTimer || previousInterval !== normalizedInterval) {
            this.pushLog({
                level: 'info',
                text: this.state.lastResultText
            });
        }
        this.emit();
        this.timer = setInterval(() => {
            void this.tick();
        }, this.state.intervalMs);
        if (!this.state.busy) {
            void this.tick();
        }
    }

    stop(): void {
        const wasRunning = this.state.running;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.state.running = false;
        if (!this.state.busy) {
            this.state.currentTaskId = null;
            this.state.currentTaskName = '';
        }
        this.state.currentStageText = this.state.busy
            ? '后台轮询停止中，等待当前任务收尾'
            : '后台轮询已停止';
        if (!this.state.lastResultText || this.state.lastResultText === '后台调度器已启动') {
            this.state.lastResultText = '后台调度器已停止';
        }
        if (wasRunning) {
            this.pushLog({
                level: 'warning',
                text: this.state.lastResultText
            });
        }
        this.emit();
    }

    async tick(): Promise<小说拆分调度状态结构> {
        if (this.state.busy) return this.getState();
        this.state.busy = true;
        this.state.lastTickAt = Date.now();
        this.state.currentStageText = '扫描任务队列中';
        this.emit();

        try {
            const [tasks, datasets] = await Promise.all([
                读取小说拆分任务列表(),
                读取小说拆分数据集列表()
            ]);
            const resumableTasks = 筛选可后台续跑任务(tasks)
                .sort((a, b) => {
                    const priorityDiff = 获取小说拆分任务排序分值(b) - 获取小说拆分任务排序分值(a);
                    if (priorityDiff !== 0) return priorityDiff;
                    return (a.updatedAt || 0) - (b.updatedAt || 0);
                });
            this.state.resumableTaskCount = resumableTasks.length;

            if (resumableTasks.length === 0) {
                this.state.currentTaskId = null;
                this.state.currentTaskName = '';
                this.state.lastResultText = '暂无可自动续跑的后台任务';
                this.state.currentStageText = '暂无待处理任务';
                return this.getState();
            }

            const task = resumableTasks[0];
            const dataset = datasets.find((item) => item.id === task.数据集ID);
            this.state.currentTaskId = task.id;
            this.state.currentTaskName = task.名称;

            if (!this.executor) {
                this.state.lastResultText = `已扫描到任务“${task.名称}”，等待拆分执行器接入`;
                this.state.currentStageText = '等待拆分执行器接入';
                return this.getState();
            }

            if (task.状态 !== 'running') {
                await 更新小说拆分任务状态(task.id, 'running', { lastRunAt: Date.now() });
            }

            const result = await this.executor({
                task,
                dataset
            });

            if (result.type === 'completed') {
                await 更新小说拆分任务状态(task.id, 'completed', { completedAt: Date.now() });
            } else if (result.type === 'paused') {
                await 更新小说拆分任务状态(task.id, 'paused', {
                    当前阶段: /失败|错误/.test(result.message || '') ? 'failed' : 'processing'
                });
            } else if (result.type === 'failed') {
                await 更新小说拆分任务状态(task.id, 'failed', { 最近错误: result.message });
            }

            this.state.lastResultText = result.message || `${获取小说拆分任务状态文本(task.状态)}：${task.名称}`;
            this.pushLog({
                level: result.type === 'failed'
                    ? 'error'
                    : (result.type === 'completed' ? 'success' : 'info'),
                text: this.state.lastResultText,
                taskId: task.id,
                taskName: task.名称
            });
            return this.getState();
        } catch (error: any) {
            this.state.lastResultText = `后台调度异常：${error?.message || '未知错误'}`;
            this.state.currentStageText = '后台调度异常';
            this.pushLog({
                level: 'error',
                text: this.state.lastResultText
            });
            return this.getState();
        } finally {
            this.state.busy = false;
            this.emit();
        }
    }

    reportProgress(payload: {
        taskId?: string | null;
        taskName?: string;
        stageText?: string;
        message?: string;
        level?: 小说拆分调度日志结构['level'];
        streamText?: string;
        resetStream?: boolean;
    }): void {
        if (typeof payload.taskId !== 'undefined') {
            this.state.currentTaskId = payload.taskId;
        }
        if (typeof payload.taskName === 'string') {
            this.state.currentTaskName = payload.taskName;
        }
        if (typeof payload.stageText === 'string') {
            this.state.currentStageText = payload.stageText;
        }
        if (payload.resetStream) {
            this.state.liveStreamText = '';
        }
        if (typeof payload.streamText === 'string') {
            this.state.liveStreamText = payload.streamText;
        }
        if (typeof payload.message === 'string' && payload.message.trim()) {
            this.pushLog({
                level: payload.level || 'info',
                text: payload.message,
                taskId: payload.taskId,
                taskName: payload.taskName
            });
        }
        this.emit();
    }

    resetLiveState(options?: {
        stageText?: string;
        keepTask?: boolean;
        keepLastResult?: boolean;
    }): void {
        this.state.liveStreamText = '';
        this.state.recentLogs = [];
        this.state.currentStageText = options?.stageText || '等待任务';
        if (!options?.keepTask) {
            this.state.currentTaskId = null;
            this.state.currentTaskName = '';
        }
        if (!options?.keepLastResult) {
            this.state.lastResultText = '等待新的任务结果';
        }
        this.emit();
    }

    private pushLog(payload: {
        level: 小说拆分调度日志结构['level'];
        text: string;
        taskId?: string | null;
        taskName?: string;
    }): void {
        const text = (payload.text || '').trim();
        if (!text) return;
        const now = Date.now();
        const logs = [
            ...this.state.recentLogs,
            {
                id: `novel_scheduler_log_${now}_${Math.random().toString(36).slice(2, 7)}`,
                timestamp: now,
                level: payload.level,
                text,
                taskId: payload.taskId,
                taskName: payload.taskName
            }
        ];
        this.state.recentLogs = logs.slice(-80);
    }

    private emit(): void {
        const snapshot = this.getState();
        this.subscribers.forEach((listener) => {
            try {
                listener(snapshot);
            } catch {
                // ignore subscriber errors
            }
        });
    }
}

const 调度器单例 = new 小说拆分后台调度器();

export const 小说拆分后台调度服务 = {
    subscribe: (listener: 调度订阅者) => 调度器单例.subscribe(listener),
    getState: () => 调度器单例.getState(),
    registerExecutor: (executor: 小说拆分执行器 | null) => 调度器单例.registerExecutor(executor),
    start: (intervalMs?: number) => 调度器单例.start(intervalMs),
    stop: () => 调度器单例.stop(),
    tick: () => 调度器单例.tick(),
    reportProgress: (payload: Parameters<小说拆分后台调度器['reportProgress']>[0]) => 调度器单例.reportProgress(payload),
    resetLiveState: (options?: Parameters<小说拆分后台调度器['resetLiveState']>[0]) => 调度器单例.resetLiveState(options)
};
