import { describe, expect, it, vi } from 'vitest';
import {
    执行带完整性校验的请求,
    流式结果疑似被上游掐断,
    挂接流式结束收集器,
    type 功能模型流式选项
} from '../hooks/useGame/streamIntegrity';

describe('功能模型流式完整性保护', () => {
    describe('流式结果疑似被上游掐断', () => {
        it('收到 [DONE] 时判定为未被掐断', () => {
            expect(流式结果疑似被上游掐断({ sawDone: true, accumulatedLength: 320 })).toBe(false);
        });

        it('未收到 [DONE] 时判定为被掐断（gg 公益站中途断流的典型形态）', () => {
            expect(流式结果疑似被上游掐断({ sawDone: false, accumulatedLength: 180 })).toBe(true);
        });

        it('finish_reason=content_filter 时判定为被掐断', () => {
            expect(流式结果疑似被上游掐断({
                sawDone: true,
                finishReason: 'content_filter',
                accumulatedLength: 120
            })).toBe(true);
        });

        it('没有结束信息时（未注册回调 / 非流式）不判定为异常', () => {
            expect(流式结果疑似被上游掐断(null)).toBe(false);
            expect(流式结果疑似被上游掐断(undefined)).toBe(false);
        });
    });

    describe('执行带完整性校验的请求', () => {
        it('流式完整时直接采用流式结果，不额外发非流式请求', async () => {
            const 发起非流式请求 = vi.fn(async () => '非流式结果');
            const result = await 执行带完整性校验的请求({
                功能名: '记忆总结',
                发起流式请求: async (options: 功能模型流式选项) => {
                    options.onStreamEnd?.({ sawDone: true, accumulatedLength: 6 });
                    return '流式完整结果';
                },
                发起非流式请求
            });

            expect(result.结果).toBe('流式完整结果');
            expect(result.已降级重试).toBe(false);
            expect(发起非流式请求).not.toHaveBeenCalled();
        });

        it('流式被掐断时自动降级为非流式重试，并采用重试结果', async () => {
            const 发起非流式请求 = vi.fn(async () => '非流式完整结果');
            const onFallback = vi.fn();
            const result = await 执行带完整性校验的请求({
                功能名: '变量校准',
                发起流式请求: async (options: 功能模型流式选项) => {
                    options.onStreamEnd?.({ sawDone: false, accumulatedLength: 15 });
                    return '被截断的半截结';
                },
                发起非流式请求,
                onFallback
            });

            expect(result.结果).toBe('非流式完整结果');
            expect(result.已降级重试).toBe(true);
            expect(result.降级重试失败).toBe(false);
            expect(发起非流式请求).toHaveBeenCalledTimes(1);
            expect(onFallback).toHaveBeenCalledTimes(1);
            expect(onFallback.mock.calls[0][0]).toMatchObject({
                功能名: '变量校准',
                sawDone: false,
                accumulatedLength: 15
            });
        });

        it('降级重试也失败时保留流式已收到的内容，不让整次调用作废', async () => {
            const onFallback = vi.fn();
            const result = await 执行带完整性校验的请求({
                发起流式请求: async (options: 功能模型流式选项) => {
                    options.onStreamEnd?.({ sawDone: false, accumulatedLength: 15 });
                    return '被截断的半截结';
                },
                发起非流式请求: async () => {
                    throw new Error('API Error: 524');
                },
                onFallback
            });

            expect(result.结果).toBe('被截断的半截结');
            expect(result.已降级重试).toBe(true);
            expect(result.降级重试失败).toBe(true);
            expect(onFallback).toHaveBeenCalledTimes(2);
            expect(onFallback.mock.calls[1][0]).toMatchObject({ 重试失败: true, message: 'API Error: 524' });
        });

        it('调用方已强制非流式时完全不走流式通道', async () => {
            const 发起流式请求 = vi.fn();
            const result = await 执行带完整性校验的请求({
                强制非流式: true,
                发起流式请求,
                发起非流式请求: async () => '非流式结果'
            });

            expect(发起流式请求).not.toHaveBeenCalled();
            expect(result.结果).toBe('非流式结果');
            expect(result.已降级重试).toBe(false);
        });
    });

    describe('挂接流式结束收集器', () => {
        it('在已有流式选项上补收集器，并保留原有回调', () => {
            const 原始回调 = vi.fn();
            const 收集 = vi.fn();
            const 选项 = 挂接流式结束收集器(
                { stream: true, onDelta: () => {}, onStreamEnd: 原始回调 },
                收集
            );

            expect(选项.stream).toBe(true);
            选项.onStreamEnd?.({ sawDone: true, accumulatedLength: 5 });

            expect(收集).toHaveBeenCalledWith({ sawDone: true, accumulatedLength: 5 });
            expect(原始回调).toHaveBeenCalledTimes(1);
        });

        it('基础选项为 undefined 时也能挂接', () => {
            const 收集 = vi.fn();
            const 选项 = 挂接流式结束收集器(undefined, 收集);
            选项.onStreamEnd?.({ sawDone: false, accumulatedLength: 1 });

            expect(选项.stream).toBeUndefined();
            expect(收集).toHaveBeenCalledTimes(1);
        });
    });
});