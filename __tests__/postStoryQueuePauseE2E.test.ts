import { naturalProseSettingsService } from '../services/naturalProseSettingsService';
import { naturalProseDefaults } from '../utils/naturalProse';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { 执行主剧情发送工作流 } from '../hooks/useGame/sendWorkflow';
import * as textAIService from '../services/ai/text';
import { 默认游戏设置 } from '../utils/gameSettings';

vi.mock('../services/naturalProseSettingsService', () => ({ naturalProseSettingsService: { load: vi.fn() } }));

vi.mock('../services/ai/text', async () => {
    const actual = await vi.importActual<any>('../services/ai/text');
    return {
        ...actual,
        generateStoryResponse: vi.fn(),
        generatePolishedBody: vi.fn()
    };
});

const { 地图更新桩 } = vi.hoisted(() => ({ 地图更新桩: vi.fn() }));
vi.mock('../hooks/useGame/mapUpdateWorkflow', () => ({
    生成地图更新: 地图更新桩
}));

const 构建系统上下文 = () => ({
    shortMemoryContext: '',
    runtimePromptStates: {},
    contextPieces: {
        AI角色声明: '你是墨色江湖主剧情模型。',
        worldPrompt: '',
        地图建筑状态: '',
        同人设定摘要: '',
        境界体系提示词: '',
        离场NPC档案: '',
        otherPrompts: '',
        难度设置提示词: '',
        叙事人称提示词: '',
        字数设置提示词: '正文不少于 50 字。',
        长期记忆: '',
        中期记忆: '',
        在场NPC档案: '',
        剧情安排: '',
        女主剧情规划状态: '',
        世界状态: '',
        环境状态: '',
        角色状态: '',
        战斗状态: '',
        门派状态: '',
        任务状态: '',
        约定状态: '',
        COT提示词: '',
        格式提示词: '',
        字数要求提示词: '正文不少于 50 字。',
        免责声明输出提示词: '',
        输出协议提示词: '请输出 <正文>、<短期记忆>、<命令>。'
    }
});

const 构建响应 = (text: string, rawText = text) => ({
    rawText,
    response: {
        logs: [{ sender: '旁白', text }],
        shortTerm: '本回合继续推进。',
        tavern_commands: [],
        action_options: []
    }
});

const 深拷贝 = <T,>(value: T): T => (
    value === undefined ? value : JSON.parse(JSON.stringify(value))
);

const 构建夹具 = (options: { 启用暂停: boolean; 启用自动存档?: boolean; 文章优化?: boolean }) => {
    let history: any[] = [];
    const apiConfig = {
        activeConfigId: 'main',
        configs: [{
            id: 'main',
            名称: '主剧情测试接口',
            供应商: 'openai_compatible',
            协议覆盖: 'openai',
            baseUrl: 'https://example.test/v1',
            apiKey: 'test-key',
            model: 'test-model',
            maxTokens: 1200,
            temperature: 0.2
        }],
        功能模型占位: {
            主剧情使用模型: 'test-model',
            世界演变功能启用: false,
            规划分析功能启用: false,
            地图生成功能启用: true,
            变量计算独立模型开关: false,
            文章优化独立模型开关: false,
            文生图功能启用: false,
            NPC生图启用: false,
            场景生图启用: false,
            物品生图启用: false
        }
    };
    const gameConfig = {
        ...默认游戏设置,
        字数要求: 50,
        字数不足处理方式: '仅提示',
        叙事人称: '第一人称',
        启用自动重试: false,
        启用行动选项: false,
        启用正文词汇审查: false,
        启用严格正文对白格式: false,
        启用标签检测完整性: false,
        启用标签协议失败自动回炉: false,
        启用回合结束自动存档: options.启用自动存档 !== false,
        启用正文后暂停后续步骤: options.启用暂停
    } as any;
    const state = {
        历史记录: history,
        记忆系统: {},
        角色: { 姓名: '端测少侠', 物品列表: [], 装备: {} },
        环境: { 时间: '1:01:01:08:00', 大地点: '端测州', 具体地点: '客栈廊下' },
        社交: [],
        世界: { 地图层级: [] },
        战斗: {},
        玩家门派: {},
        任务列表: [],
        约定列表: [],
        剧情: {},
        剧情规划: {},
        女主剧情规划: undefined,
        同人剧情规划: undefined,
        同人女主剧情规划: undefined,
        开局配置: undefined,
        游戏初始时间: '1:01:01:08:00',
        loading: false,
        gameConfig,
        apiConfig,
        memoryConfig: {},
        visualConfig: {},
        sceneImageArchive: {},
        prompts: [],
        内置提示词列表: [],
        世界书列表: []
    } as any;
    const 注册待继续后续步骤 = vi.fn();
    const deps = {
        abortControllerRef: { current: null },
        recallAbortControllerRef: { current: null },
        前台发送序号Ref: { current: 0 },
        setLoading: vi.fn(),
        set后台队列处理中: vi.fn(),
        setShowSettings: vi.fn(),
        设置剧情: vi.fn(),
        设置历史记录: vi.fn((value: any) => {
            history = typeof value === 'function' ? value(history) : value;
        }),
        设置叙事平静值: vi.fn(),
        应用并同步记忆系统: vi.fn(),
        构建系统提示词: vi.fn(() => 构建系统上下文()),
        processResponseCommands: vi.fn((_response: any, baseState: any) => ({
            ...深拷贝(baseState),
            gameConfig,
            剧情规划: baseState?.剧情规划 || {},
            女主剧情规划: baseState?.女主剧情规划,
            同人剧情规划: baseState?.同人剧情规划,
            同人女主剧情规划: baseState?.同人女主剧情规划
        })),
        performAutoSave: vi.fn(async () => ({ id: 42 })),
        执行正文润色: vi.fn(async (baseResponse: any, rawText: string) => ({ response: baseResponse, applied: false, rawText })),
        执行世界演变更新: vi.fn(async () => ({ ok: true, phase: 'skipped', statusText: '跳过', commands: [], rawText: '' })),
        触发新增NPC自动生图: vi.fn(),
        触发对白NPC头像补全: vi.fn(),
        检查主角每回合生图: vi.fn(),
        触发场景自动生图: vi.fn(),
        应用常驻壁纸为背景: vi.fn(async () => undefined),
        提取新增NPC列表: vi.fn(() => []),
        推入重Roll快照: vi.fn(),
        弹出重Roll快照: vi.fn(),
        回档到快照: vi.fn(),
        深拷贝,
        按回合窗口裁剪历史: (items: any[]) => items,
        规范化环境信息: (value?: any) => value || {},
        规范化剧情状态: (value?: any) => value || {},
        规范化剧情规划状态: (value?: any) => value || {},
        规范化女主剧情规划状态: (value?: any) => value,
        规范化同人剧情规划状态: (value?: any) => value,
        规范化同人女主剧情规划状态: (value?: any) => value,
        规范化世界状态: (value?: any) => value || { 地图层级: [] },
        游戏设置启用自动重试: (config?: any) => config?.启用自动重试 === true,
        执行带自动重试的生成请求: async ({ action }: any) => action(1, null),
        更新流式草稿为自动重试提示: (items: any[]) => items,
        提取解析失败原始信息: (error: any) => error?.parseDetail || error?.message || '',
        提取原始报错详情: (error: any) => error?.parseDetail || error?.message || '',
        格式化错误详情: (error: any) => error?.message || '',
        获取原始AI消息: (rawText: string) => rawText,
        估算消息Token: () => 0,
        估算AI输出Token: () => 0,
        计算回复耗时秒: () => 1,
        文章优化功能已开启: () => options.文章优化 === true,
        后台执行统一规划分析: vi.fn(async () => ({ updated: false, message: '跳过', rawText: '', commands: [] })),
        后台执行变量生成: vi.fn(async () => undefined),
        执行变量生成并合并响应: vi.fn(async () => null),
        注册待继续后续步骤
    } as any;
    return { state, deps, 注册待继续后续步骤, 取历史: () => history, gameConfig };
};

describe('正文后暂停后续步骤（省额度模式）', () => {
    beforeEach(() => {
        vi.mocked(naturalProseSettingsService.load).mockReset().mockResolvedValue({ ...naturalProseDefaults, enabled: false });
        vi.mocked(textAIService.generateStoryResponse).mockReset()
            .mockResolvedValue(构建响应('我推门进屋，把湿透的外袍搭在椅背上。', '<正文>我推门进屋。</正文>') as any);
        vi.mocked(textAIService.generatePolishedBody).mockReset();
        地图更新桩.mockReset().mockResolvedValue({
            ok: true,
            phase: 'done',
            statusText: '地图更新完成',
            commands: [],
            rawText: ''
        });
    });

    it('开启后正文写完即停：不占用回合处理中、不自动存档，并把可执行阶段登记给玩家', async () => {
        const 夹具 = 构建夹具({ 启用暂停: true });
        const result = await 执行主剧情发送工作流('继续。', false, 夹具.state, 夹具.deps);
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(result.pausedAfterStory).toBe(true);
        expect(夹具.deps.set后台队列处理中).not.toHaveBeenCalled();
        expect(夹具.deps.performAutoSave).not.toHaveBeenCalled();
        expect(地图更新桩).not.toHaveBeenCalled();
        expect(夹具.注册待继续后续步骤).toHaveBeenCalledTimes(1);

        const payload = 夹具.注册待继续后续步骤.mock.calls[0][0];
        expect(payload.阶段摘要).toEqual(['地图更新']);
        expect(typeof payload.执行).toBe('function');
        expect(payload.回合标识).toBeGreaterThan(0);
    });

    it('点击继续后才跑后续阶段并落自动存档', async () => {
        const 夹具 = 构建夹具({ 启用暂停: true });
        await 执行主剧情发送工作流('继续。', false, 夹具.state, 夹具.deps);
        const payload = 夹具.注册待继续后续步骤.mock.calls[0][0];

        await payload.执行();
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(夹具.deps.set后台队列处理中.mock.calls.map((call: any[]) => call[0])).toEqual([true, false]);
        expect(地图更新桩).toHaveBeenCalledTimes(1);
        expect(夹具.deps.performAutoSave).toHaveBeenCalledTimes(1);
    });

    it('关闭时保持原全自动行为，不登记暂停入口', async () => {
        const 夹具 = 构建夹具({ 启用暂停: false });
        const result = await 执行主剧情发送工作流('继续。', false, 夹具.state, 夹具.deps);
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(result.pausedAfterStory).not.toBe(true);
        expect(夹具.注册待继续后续步骤).not.toHaveBeenCalled();
        expect(夹具.deps.set后台队列处理中.mock.calls.map((call: any[]) => call[0])).toEqual([true, false]);
        expect(地图更新桩).toHaveBeenCalledTimes(1);
        expect(夹具.deps.performAutoSave).toHaveBeenCalledTimes(1);
    });

    it('文章优化在暂停前跑完，继续时不会重复改写同一段正文', async () => {
        const 夹具 = 构建夹具({ 启用暂停: true, 文章优化: true });
        await 执行主剧情发送工作流('继续。', false, 夹具.state, 夹具.deps);
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(夹具.deps.执行正文润色).toHaveBeenCalledTimes(1);

        const payload = 夹具.注册待继续后续步骤.mock.calls[0][0];
        await payload.执行();
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(夹具.deps.执行正文润色).toHaveBeenCalledTimes(1);
        expect(地图更新桩).toHaveBeenCalledTimes(1);
    });
});
