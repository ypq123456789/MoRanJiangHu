export const 生图最大自动重试次数 = 3;

const 生图重试等待毫秒 = 1200;

export const 读取生图错误文本 = (error: unknown, fallback = '图片生成失败'): string => {
    const message = typeof (error as any)?.message === 'string' ? (error as any).message.trim() : '';
    return message || fallback;
};

const 等待生图重试 = async (ms: number, signal?: AbortSignal): Promise<void> => {
    if (!signal) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return;
    }
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort);
    });
};

export const 执行生图模型调用带重试 = async <T>(
    runner: () => Promise<T>,
    options?: {
        signal?: AbortSignal;
        maxRetries?: number;
        onAttempt?: (attempt: number, totalAttempts: number) => void;
        onRetry?: (attempt: number, totalAttempts: number, errorMessage: string) => void;
    }
): Promise<T> => {
    const maxRetries = Math.max(0, Math.floor(options?.maxRetries ?? 生图最大自动重试次数));
    const totalAttempts = maxRetries + 1;
    let lastError: unknown;
    for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex += 1) {
        if (options?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const attempt = attemptIndex + 1;
        options?.onAttempt?.(attempt, totalAttempts);
        try {
            return await runner();
        } catch (error) {
            lastError = error;
            if (options?.signal?.aborted || attemptIndex >= maxRetries) {
                throw error;
            }
            const errorMessage = 读取生图错误文本(error);
            options?.onRetry?.(attempt, totalAttempts, errorMessage);
            await 等待生图重试(Math.min(5000, 生图重试等待毫秒 * attempt), options?.signal);
        }
    }
    throw lastError;
};
