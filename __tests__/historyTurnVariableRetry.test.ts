import { describe, expect, it, vi } from 'vitest';
import { 创建历史回合工作流 } from '../hooks/useGame/historyTurnWorkflow';
import { 执行导演后处理V2 } from '../engine/storyV2/directorPostTurn';
vi.mock('../engine/storyV2/directorPostTurn', () => ({ 执行导演后处理V2: vi.fn() }));

describe('history turn variable retry', () => {
    const createSnapshot = () => ({
        玩家输入: '继续探索',
        游戏时间: '1:01:01:00:00',
        回档前状态: {
            角色: {},
            环境: {},
            社交: [],
            世界: {},
            战斗: {},
            玩家门派: {},
            任务列表: [],
            约定列表: [],
            剧情: {},
            女主剧情规划: {},
            记忆系统: {
                回忆档案: [],
                即时记忆: [],
                短期记忆: [],
                中期记忆: [],
                长期记忆: []
            }
        },
        回档前历史: []
    });

    const createBaseDeps = (overrides: Record<string, unknown> = {}) => ({
        历史记录: [
            { role: 'user', content: '继续探索' },
            {
                role: 'assistant',
                content: 'Structured Response',
                structuredResponse: { body: '正文仍应保留', logs: [], tavern_commands: [] },
                rawJson: '<正文>正文仍应保留</正文>',
                inputTokens: 12,
                responseDurationSec: 3
            }
        ],
        记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
        memoryConfig: {},
        gameConfig: {},
        prompts: [],
        内置提示词列表: [],
        世界书列表: [],
        loading: false,
        变量生成中: false,
        记忆总结阶段: 'idle',
        社交: [],
        visualConfig: {},
        visualConfigRef: { current: {} },
        场景图片档案Ref: { current: {} },
        scrollRef: { current: { scrollTop: 0 } },
        获取最新快照: createSnapshot,
        回档到快照: () => undefined,
        弹出重Roll快照: () => null,
        删除最近自动存档并重置状态: async () => undefined,
        深拷贝: <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? null)),
        环境时间转标准串: () => '1:01:01:00:00',
        获取开局配置: () => ({}),
        规范化记忆配置: () => ({ 即时消息上传条数N: 10, 短期记忆阈值: 10, 中期记忆阈值: 10 }),
        规范化记忆系统: (value: unknown) => value,
        规范化社交列表: (value: unknown) => value,
        规范化视觉设置: (value: unknown) => value,
        规范化场景图片档案: (value: unknown) => value,
        normalizeCanonicalGameTime: (value: string) => value,
        构建即时记忆条目: () => ({}),
        构建短期记忆条目: () => ({}),
        写入四段记忆: (memory: unknown) => memory,
        估算AI输出Token: () => 1,
        提取解析失败原始信息: (error: any) => error?.message || '',
        提取原始报错详情: (error: any) => error?.message || '',
        构建标签解析选项: () => ({}),
        parseStoryRawText: () => ({ body: '正文仍应保留', logs: [], tavern_commands: [] }),
        执行正文润色: async (response: unknown) => ({ applied: false, response }),
        规范化游戏设置: () => ({}),
        processResponseCommands: (_response: unknown, baseState: unknown) => baseState,
        按世界演变分流净化响应: (response: unknown) => ({ response }),
        世界演变功能已开启: () => false,
        执行重解析变量生成: async (params: any) => params.parsedResponse,
        应用并同步记忆系统: () => undefined,
        performAutoSave: async () => undefined,
        设置剧情: () => undefined,
        设置历史记录: () => undefined,
        设置玩家门派: () => undefined,
        设置任务列表: () => undefined,
        设置约定列表: () => undefined,
        设置社交: () => undefined,
        记录变量生成上下文: () => undefined,
        set聊天区自动滚动抑制令牌: () => undefined,
        获取NPC唯一标识: (_npc: unknown, index?: number) => String(index ?? 0),
        合并NPC图片档案: (npc: unknown) => npc,
        ...overrides
    });

    const makeDirector = () => {
        const snapshot = createSnapshot() as any;
        snapshot.回档前历史 = [{ role: 'system' }, { role: 'assistant', structuredResponse: {} }, { role: 'system' }];
        snapshot.回档前状态.导演圣经 = {};
        snapshot.回档前状态.环境 = { 时间: '1:01:01:08:00' };
        const save = vi.fn(async () => {});
        const notify = vi.fn();
        let session = 1;
        const deps = createBaseDeps({
            获取最新快照: () => snapshot, 获取会话代次: () => session, 通知重解析异常: notify,
            apiConfig: { activeConfigId: 'test', configs: [{ id: 'test', baseUrl: 'https://test.example', apiKey: 'test', model: 'test' }] },
            记忆系统: { ...snapshot.回档前状态.记忆系统, 短期记忆: ['旧正文'] },
            环境时间转标准串: (env: any) => env.时间,
            构建短期记忆条目: (time: string) => time,
            写入四段记忆: (memory: any, _immediate: any, short: string) => ({ ...memory, 短期记忆: [...memory.短期记忆, short] }),
            performAutoSave: save, scrollRef: { current: null }
        });
        return { snapshot, save, deps, notify, changeSession: () => session++ };
    };

    it('编辑后只校准和存档一次，回合、历史和记忆采用最终导演时间', async () => {
        const { deps, save } = makeDirector();
        vi.mocked(执行导演后处理V2).mockImplementationOnce(async ({ state }) => {
            expect(state.turnIndex).toBe(1);
            expect(state.历史记录).toHaveLength(3);
            return { nextState: { ...state, 环境: { ...state.环境, 时间: '1:01:01:08:30' } } } as any;
        });
        expect(await 创建历史回合工作流(deps as any).updateHistoryItem(1, '新正文')).toBeNull();
        expect(save).toHaveBeenCalledTimes(1);
        const final = (save.mock.calls as any)[0][0];
        expect(final.history.at(-1).gameTime).toBe('1:01:01:08:30');
        expect(final.memory.短期记忆).toEqual(['1:01:01:08:30']);
    });
    it('导演等待期间切换存档时抛弃结果，不覆盖新存档', async () => {
        const { deps, snapshot, save, changeSession } = makeDirector();
        vi.mocked(执行导演后处理V2).mockImplementationOnce(async ({ state }) => {
            changeSession();
            return { nextState: state } as any;
        });
        await 创建历史回合工作流(deps as any).使用快照重建解析回合(snapshot, { logs: [] } as any, '正文');
        expect(save).not.toHaveBeenCalled();
    });
    it('两次编辑交错完成时只提交后一次校准，即使两次来自不同的 React 渲染', async () => {
        const { deps, save } = makeDirector();
        let finishFirst!: (value: any) => void;
        const firstRequest = new Promise(resolve => { finishFirst = resolve; });
        const parse = (text: string) => ({ logs: [{ sender: '旁白', text }], tavern_commands: [] });
        Object.assign(deps, { parseStoryRawText: parse, 执行重解析变量生成: vi.fn()
            .mockReturnValueOnce(firstRequest).mockResolvedValueOnce(parse('后稿')) });
        vi.mocked(执行导演后处理V2).mockImplementationOnce(async ({ state }) => ({ nextState: state }) as any);
        const first = 创建历史回合工作流(deps as any).updateHistoryItem(1, '先稿');
        await 创建历史回合工作流(deps as any).updateHistoryItem(1, '后稿');
        finishFirst(parse('先稿'));
        await first;
        expect(save).toHaveBeenCalledTimes(1);
        expect((save.mock.calls as any)[0][0].history.at(-1).rawJson).toBe('后稿');
    });
    it('导演失败时保留新正文，并提示从编辑器重新解析', async () => {
        const { deps, save, notify } = makeDirector();
        vi.mocked(执行导演后处理V2).mockRejectedValueOnce(new Error('测试断线'));
        const message = await 创建历史回合工作流(deps as any).updateHistoryItem(1, '新正文');
        expect(message).toContain('导演圣经');
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('保存并重解析'));
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('继续变量生成失败时不先回档清空正文，并向输入栏回传进度与错误', async () => {
        const events: string[] = [];
        const progress: Array<{ phase?: string; text?: string }> = [];
        const workflow = 创建历史回合工作流(createBaseDeps({
            回档到快照: () => {
                events.push('rollback');
            },
            执行重解析变量生成: async () => {
                events.push('legacy-variable-reparse');
                throw new Error('不应走旧的静默重解析链路');
            },
            后台执行变量生成: async (params: any) => {
                events.push('background-variable');
                params.onProgress?.({ phase: 'start', text: '正在请求变量模型...' });
                throw new Error('MiMo variable failed');
            }
        }) as any);

        const result = await (workflow.handleRetryLatestVariableGeneration as any)({
            onVariableGenerationProgress: (item: { phase?: string; text?: string }) => progress.push(item)
        });

        expect(events).toEqual(['background-variable']);
        expect(progress.some(item => item.phase === 'start')).toBe(true);
        expect(result).toContain('MiMo variable failed');
    });

    it('重ROLL先立即回档，并只异步清理当前快照关联的自动存档', async () => {
        const snapshot = {
            ...createSnapshot(),
            关联自动存档ID: 901
        };
        const events: string[] = [];
        let releaseCleanup: (() => void) | undefined;
        const cleanupPending = new Promise<void>((resolve) => {
            releaseCleanup = resolve;
        });
        const workflow = 创建历史回合工作流(createBaseDeps({
            弹出重Roll快照: () => snapshot,
            回档到快照: () => {
                events.push('rollback');
            },
            删除最近自动存档并重置状态: async () => {
                events.push('legacy-delete-latest');
            },
            清理回合自动存档并重置状态: async (target: any) => {
                events.push(`cleanup:${target.关联自动存档ID}`);
                await cleanupPending;
            }
        }) as any);

        const result = await Promise.race([
            (workflow.handleRegenerate as any)(),
            new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 80))
        ]);

        expect(result).toBe('继续探索');
        expect(events).toEqual(['rollback', 'cleanup:901']);
        releaseCleanup?.();
    });

    it('可以基于最新正文单独重试失败的动态世界阶段', async () => {
        const progress: Array<{ phase?: string; text?: string; commandTexts?: string[] }> = [];
        const workflow = 创建历史回合工作流(createBaseDeps({
            执行世界演变更新: async (params: any) => {
                expect(params.applyCommands).toBe(true);
                expect(params.playerInput).toBe('继续探索');
                expect(params.currentResponse.body).toBe('正文仍应保留');
                params.onStreamDelta?.('世界', '世界演变流式内容');
                return {
                    ok: true,
                    phase: 'done',
                    commands: [{ action: 'set', key: '世界.传闻', value: ['新传闻'] }],
                    updates: ['新传闻流入江湖'],
                    rawText: '<世界演变>完成</世界演变>',
                    statusText: '动态世界更新完成'
                };
            }
        }) as any);

        const result = await (workflow.handleRetryLatestStage as any)('world', {
            onWorldEvolutionProgress: (item: { phase?: string; text?: string; commandTexts?: string[] }) => progress.push(item)
        });

        expect(result).toBeNull();
        expect(progress.some(item => item.phase === 'stream' && item.text === '世界演变流式内容')).toBe(true);
        expect(progress.at(-1)?.phase).toBe('done');
        expect(progress.at(-1)?.commandTexts?.[0]).toContain('世界.传闻');
    });
});
