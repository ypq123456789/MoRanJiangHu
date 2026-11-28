import { afterEach, describe, expect, it, vi } from 'vitest';
import { 安全触发开局主角自动生图, 执行开场剧情生成工作流 } from '../hooks/useGame/openingStoryWorkflow';
import { naturalProseSettingsService } from '../services/naturalProseSettingsService';
import * as novelInjection from '../services/novelDecompositionInjection';
import * as storyRenderer from '../engine/storyV2/storyTurnRenderer';
import * as director from '../engine/storyV2/directorPostTurn';
import * as apiConfig from '../utils/apiConfig';
import * as mapUpdate from '../hooks/useGame/mapUpdateWorkflow';
import * as variables from '../hooks/useGame/variableModelWorkflow';

afterEach(() => vi.restoreAllMocks());

describe('openingStoryWorkflow', () => {
    it.each(['小说拆分', '文章优化', '变量生成', '地图更新', '取消导演'] as const)('V2 开局在%s等待期间的切档和当前用户取消', async (stage) => {
        let resume!: () => void;
        const pending = new Promise<void>(resolve => { resume = resolve; });
        const rendered = { response: { logs: [{ sender: '旁白', text: '旧档正文。' }] }, rawText: '旧档正文。' };
        const api = { baseUrl: 'https://example.org', model: 'test', apiKey: 'test' } as any;
        vi.spyOn(naturalProseSettingsService, 'load').mockResolvedValue({} as any);
        const novel = vi.spyOn(novelInjection, '获取开局小说拆分注入文本').mockImplementation(async () => {
            if (stage === '小说拆分') await pending;
            return '';
        });
        vi.spyOn(apiConfig, '获取文章优化接口配置').mockReturnValue(api);
        vi.spyOn(apiConfig, '获取变量计算接口配置').mockReturnValue(api);
        vi.spyOn(apiConfig, '变量校准功能已启用').mockReturnValue(stage === '变量生成');
        vi.spyOn(apiConfig, '获取地图自动更新接口配置').mockReturnValue(api);
        const variable = vi.spyOn(variables, '执行变量模型校准工作流').mockImplementation(async () => {
            await pending;
            return { commands: [], model: 'test', reports: [], rawText: '' };
        });
        const map = vi.spyOn(mapUpdate, '生成地图更新').mockImplementation(async () => {
            await pending;
            return { ok: true, phase: 'done' as const, commands: [], rawText: '', statusText: '已更新' };
        });
        const render = vi.spyOn(storyRenderer, '渲染开局回合V2').mockResolvedValue(rendered as any);
        const direct = vi.spyOn(director, '执行导演后处理V2').mockImplementation(async ({ state }) => {
            if (stage === '取消导演') await pending;
            return { nextState: state, rawText: '', replanned: false, offscreenSpillovers: [], plantedForeshadows: [],
                fermentedForeshadows: [], paidOffForeshadows: [], directorMs: 1, contextChars: 0 };
        });
        const deps = {
            abortControllerRef: { current: null as AbortController | null }, apiConfig: {}, 导演圣经: {},
            规范化环境信息: () => ({}), 规范化剧情状态: () => ({}), 规范化剧情规划状态: () => ({}),
            规范化女主剧情规划状态: () => ({}), 规范化同人剧情规划状态: () => ({}), 规范化同人女主剧情规划状态: () => ({}),
            规范化角色物品容器映射: () => ({}), 规范化社交列表: () => [], 规范化世界状态: () => ({}),
            规范化门派状态: () => ({}), 规范化战斗状态: () => ({}),
            游戏设置启用自动重试: () => false, 计算回复耗时秒: () => 1, 估算AI输出Token: () => 1,
            文章优化功能已开启: () => stage === '文章优化',
            执行带自动重试的生成请求: ({ action }: any) => action(),
            执行正文润色: vi.fn(async () => { await pending; return { ...rendered, applied: true }; }),
            设置历史记录: vi.fn(), 设置开局主剧情进度: vi.fn(), 设置开局文章优化进度: vi.fn(),
            设置开局规划进度: vi.fn(), 设置开局世界演变进度: vi.fn(),
            设置开局变量生成进度: vi.fn(), 设置开局地图更新进度: vi.fn(), 设置角色: vi.fn(),
            设置开局导演进度: vi.fn(), 设置导演圣经: vi.fn(), performAutoSave: vi.fn()
        };
        const opening = 执行开场剧情生成工作流({}, [], true, api, undefined, deps as any);
        const waiting = { 小说拆分: novel, 文章优化: deps.执行正文润色, 变量生成: variable, 地图更新: map, 取消导演: direct }[stage]!;
        await vi.waitFor(() => expect(waiting).toHaveBeenCalled());
        deps.abortControllerRef.current!.abort();
        if (stage === '取消导演') {
            resume();
            await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
            expect(deps.设置开局导演进度).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'cancelled' }));
            expect(deps.abortControllerRef.current).toBeNull();
            return;
        }
        const next = new AbortController();
        deps.abortControllerRef.current = next;
        vi.clearAllMocks();
        resume();
        await opening;
        for (const write of [deps.设置历史记录, deps.设置开局主剧情进度, deps.设置开局文章优化进度,
            deps.设置开局规划进度, deps.设置开局世界演变进度, deps.设置开局导演进度, deps.设置导演圣经,
            deps.设置开局变量生成进度, deps.设置开局地图更新进度, deps.设置角色, deps.performAutoSave, render, direct, variable, map]) {
            expect(write).not.toHaveBeenCalled();
        }
        expect(deps.abortControllerRef.current).toBe(next);
    });

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
