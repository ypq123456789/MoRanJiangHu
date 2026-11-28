import { describe, expect, it, vi } from 'vitest';
import { 安全触发开局主角自动生图, 执行开场剧情生成工作流 } from '../hooks/useGame/openingStoryWorkflow';
import { naturalProseSettingsService } from '../services/naturalProseSettingsService';

describe('openingStoryWorkflow', () => {
    it('切换存档后，迟到的开局请求不会写入新局或清空新请求', async () => {
        let resume!: (value: { enabled: boolean }) => void;
        const load = vi.spyOn(naturalProseSettingsService, 'load')
            .mockImplementation(() => new Promise(resolve => { resume = resolve; }));
        const deps = {
            abortControllerRef: { current: null as AbortController | null },
            设置历史记录: vi.fn(), 设置开局主剧情进度: vi.fn(), 设置开局导演进度: vi.fn(),
            规范化环境信息: () => ({})
        };
        try {
            const abandoned = 执行开场剧情生成工作流({}, [], false, {} as any, undefined, deps as any);
            const current = new AbortController();
            deps.abortControllerRef.current!.abort();
            deps.abortControllerRef.current = current;
            deps.设置历史记录.mockClear();
            resume({ enabled: false });
            await abandoned;
            expect(deps.abortControllerRef.current).toBe(current);
            expect(deps.设置历史记录).not.toHaveBeenCalled();
            expect(deps.设置开局主剧情进度).not.toHaveBeenCalled();
            expect(deps.设置开局导演进度).not.toHaveBeenCalled();
        } finally {
            load.mockRestore();
        }
    });

    it('handles async player image trigger failures without leaking an unhandled rejection', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const trigger = vi.fn(async () => {
            throw new TypeError('NetworkError when attempting to fetch resource.');
        });

        await expect(安全触发开局主角自动生图(trigger, { 姓名: '前月荷' } as any, '测试触发')).resolves.toBe(false);

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            '测试触发失败，已保持开局流程继续',
            expect.any(TypeError)
        );
        warnSpy.mockRestore();
    });
});
