type 诊断元数据 = Record<string, unknown>;

const 当前时间 = (): number => {
    if (typeof globalThis.performance?.now === 'function') {
        return globalThis.performance.now();
    }
    return Date.now();
};

const 格式化耗时 = (value: number): number => Math.round(value * 10) / 10;

const 清理诊断值 = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return value.length > 240
            ? { length: value.length, preview: value.slice(0, 240) }
            : value;
    }
    if (Array.isArray(value)) {
        return { length: value.length };
    }
    if (value && typeof value === 'object') {
        return value;
    }
    return value;
};

const 清理诊断元数据 = (meta?: 诊断元数据): 诊断元数据 => {
    if (!meta) return {};
    return Object.fromEntries(
        Object.entries(meta).map(([key, value]) => [key, 清理诊断值(value)])
    );
};

export const 创建工作流性能诊断 = (scope: string, meta?: 诊断元数据) => {
    const startedAt = 当前时间();
    let currentStage = '初始化';
    let ended = false;
    let expectedTickAt = startedAt + 1000;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    console.info(`[性能诊断][${scope}] 开始`, {
        ...清理诊断元数据(meta),
        wallTime: new Date().toISOString()
    });

    if (typeof globalThis.setInterval === 'function' && typeof globalThis.clearInterval === 'function') {
        heartbeatTimer = globalThis.setInterval(() => {
            const now = 当前时间();
            const drift = now - expectedTickAt;
            expectedTickAt = now + 1000;
            if (drift >= 2000) {
                console.warn(`[性能诊断][${scope}] 主线程疑似阻塞`, {
                    blockedMs: 格式化耗时(drift),
                    elapsedMs: 格式化耗时(now - startedAt),
                    currentStage
                });
            }
        }, 1000);
    }

    const mark = (stage: string, stageMeta?: 诊断元数据) => {
        currentStage = stage;
        console.info(`[性能诊断][${scope}] ${stage}`, {
            elapsedMs: 格式化耗时(当前时间() - startedAt),
            ...清理诊断元数据(stageMeta)
        });
    };

    const time = <T,>(stage: string, task: () => T, stageMeta?: 诊断元数据): T => {
        currentStage = stage;
        const stageStartedAt = 当前时间();
        try {
            return task();
        } finally {
            console.info(`[性能诊断][${scope}] ${stage}完成`, {
                durationMs: 格式化耗时(当前时间() - stageStartedAt),
                elapsedMs: 格式化耗时(当前时间() - startedAt),
                ...清理诊断元数据(stageMeta)
            });
        }
    };

    const timeAsync = async <T,>(stage: string, task: () => Promise<T>, stageMeta?: 诊断元数据): Promise<T> => {
        currentStage = stage;
        const stageStartedAt = 当前时间();
        try {
            return await task();
        } finally {
            console.info(`[性能诊断][${scope}] ${stage}完成`, {
                durationMs: 格式化耗时(当前时间() - stageStartedAt),
                elapsedMs: 格式化耗时(当前时间() - startedAt),
                ...清理诊断元数据(stageMeta)
            });
        }
    };

    const end = (status: string, endMeta?: 诊断元数据) => {
        if (ended) return;
        ended = true;
        if (heartbeatTimer) {
            globalThis.clearInterval(heartbeatTimer);
        }
        console.info(`[性能诊断][${scope}] 结束`, {
            status,
            totalMs: 格式化耗时(当前时间() - startedAt),
            finalStage: currentStage,
            ...清理诊断元数据(endMeta)
        });
    };

    return {
        mark,
        time,
        timeAsync,
        end
    };
};
