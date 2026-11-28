import { describe, expect, it, vi } from 'vitest';
import { 创建存档数据, 执行读取存档 } from '../hooks/useGame/saveCoordinator';
import * as dbService from '../services/dbService';

const deepClone = <T,>(value: T): T => structuredClone(value);

const openingPlaceholderHistory = [
    {
        role: 'system' as const,
        content: '系统: 正在生成开场内容...',
        timestamp: 1000
    }
];

const openingMemory = {
    回忆档案: [
        {
            名称: '【回忆001】',
            概括: '开局醒来并看见山门。',
            原文: '【0001:01:01:08:00】\nAI输出：\n【旁白】晨雾压着青石山门，你在钟声里醒来。\n【陆青】先稳住呼吸，别急着下山。',
            回合: 1,
            记录时间: '0001:01:01:08:00',
            时间戳: '0001:01:01:08:00'
        }
    ],
    即时记忆: [],
    短期记忆: [],
    中期记忆: [],
    长期记忆: []
};

const createDeps = () => ({
    存档格式版本: 12,
    自动存档最小间隔毫秒: 0,
    深拷贝: deepClone,
    构建完整地点文本: (env?: any) => [env?.大地点, env?.中地点, env?.小地点, env?.具体地点].filter(Boolean).join('/'),
    规范化环境信息: (value?: any) => value || {},
    规范化世界状态: (value?: any) => value || {},
    规范化战斗状态: (value?: any) => value || {},
    规范化门派状态: (value?: any) => value || {},
    规范化剧情状态: (value?: any) => value || {},
    规范化剧情规划状态: (value?: any) => value || {},
    规范化女主剧情规划状态: (value?: any) => value,
    规范化同人剧情规划状态: (value?: any) => value,
    规范化同人女主剧情规划状态: (value?: any) => value,
    规范化记忆系统: (value?: any) => ({
        回忆档案: Array.isArray(value?.回忆档案) ? value.回忆档案 : [],
        即时记忆: Array.isArray(value?.即时记忆) ? value.即时记忆 : [],
        短期记忆: Array.isArray(value?.短期记忆) ? value.短期记忆 : [],
        中期记忆: Array.isArray(value?.中期记忆) ? value.中期记忆 : [],
        长期记忆: Array.isArray(value?.长期记忆) ? value.长期记忆 : []
    }),
    规范化可选开局配置: (value?: any) => value,
    规范化记忆配置: (value?: any) => value || {},
    规范化游戏设置: (value?: any) => value || {},
    规范化视觉设置: (value?: any) => value || {},
    规范化场景图片档案: (value?: any) => ({
        生图历史: Array.isArray(value?.生图历史) ? value.生图历史 : [],
        最近生图结果: value?.最近生图结果,
        当前壁纸图片ID: value?.当前壁纸图片ID
    }),
    规范化角色物品容器映射: (value?: any) => value || {},
    规范化社交列表: (value?: any[]) => Array.isArray(value) ? value : [],
    获取当前提示词池: () => [],
    创建开场空白环境: () => ({}),
    创建开场空白世界: () => ({}),
    创建开场空白战斗: () => ({}),
    创建空门派状态: () => ({}),
    创建开场空白剧情: () => ({}),
    应用并同步记忆系统: vi.fn(),
    设置叙事平静值: vi.fn(),
    获取当前视觉设置: () => ({}),
    setHasSave: vi.fn(),
    setGameConfig: vi.fn(),
    setMemoryConfig: vi.fn(),
    设置视觉设置: vi.fn(),
    设置场景图片档案: vi.fn(),
    设置游戏初始时间: vi.fn(),
    设置角色锚点列表: vi.fn(),
    设置当前角色锚点ID: vi.fn(),
    setView: vi.fn(),
    setShowSaveLoad: vi.fn(),
    设置最近开局配置: vi.fn(),
    设置角色: vi.fn(),
    设置环境: vi.fn(),
    设置社交: vi.fn(),
    设置世界: vi.fn(),
    设置战斗: vi.fn(),
    设置玩家门派: vi.fn(),
    设置任务列表: vi.fn(),
    设置约定列表: vi.fn(),
    设置剧情: vi.fn(),
    设置剧情规划: vi.fn(),
    设置女主剧情规划: vi.fn(),
    设置同人剧情规划: vi.fn(),
    设置同人女主剧情规划: vi.fn(),
    设置开局配置: vi.fn(),
    设置提示词池: vi.fn(),
    设置历史记录: vi.fn(),
    清空重Roll快照: vi.fn(),
    重置自动存档状态: vi.fn(),
    切换生图存档作用域: vi.fn(),
    最近自动存档时间戳Ref: { current: 0 },
    最近自动存档签名Ref: { current: '' }
});

const createOpeningState = () => ({
    历史记录: deepClone(openingPlaceholderHistory),
    角色: { 姓名: '陆青' },
    环境: { 时间: '0001:01:01:08:00', 大地点: '青岚山', 具体地点: '山门' },
    社交: [],
    世界: { 地图层级: [] },
    战斗: {},
    玩家门派: {},
    任务列表: [],
    约定列表: [],
    剧情: {
        当前章节: {
            标题: '山门初醒',
            摘要: '主角在山门钟声中醒来。',
            正文片段: ['晨雾压着青石山门，你在钟声里醒来。']
        },
        已知剧情节点: ['山门初醒']
    },
    剧情规划: {},
    记忆系统: deepClone(openingMemory),
    openingConfig: { 题材模式: '武侠' },
    提示词池: [],
    游戏初始时间: '0001:01:01:08:00',
    gameConfig: {},
    memoryConfig: {},
    visualConfig: {},
    sceneImageArchive: {},
    角色锚点列表: [],
    当前角色锚点ID: ''
});

describe('saveCoordinator opening save recovery', () => {
    it('先从记忆恢复历史，再核对局外人；缺少可核对开局时不写完成标记', async () => {
        const state = createOpeningState();
        state.记忆系统.回忆档案[0].原文 += '\n【陆青】张掌柜派人收账。';
        const deps = createDeps();
        await 执行读取存档({ ...state, 角色数据: state.角色, 元数据: { 已核对开局局外人物: true } } as any, deps as any);
        expect(deps.设置社交.mock.calls[0][0]).toContainEqual(expect.objectContaining({ 姓名: '张掌柜', 是否在场: false }));
        const saved = 创建存档数据('manual', state as any, deps as any);
        expect(saved.社交).toContainEqual(expect.objectContaining({ 姓名: '张掌柜' }));
        expect(saved.元数据?.已核对开局局外人物).toBe(true);
        const incomplete = 创建存档数据('manual', { ...state, 记忆系统: {}, 剧情: {} } as any, deps as any);
        expect(incomplete.元数据?.已核对开局局外人物).toBe(false);
    });
    it('旧档迁移尚未提交时切档，较慢的回调不会覆盖当前角色或发送结算通知', async () => {
        const deps = { ...createDeps(), 推送通知: vi.fn() };
        const first = { ...createOpeningState(), id: 1, 角色数据: { 姓名: '甲' } } as any;
        const second = { ...first, id: 2, 角色数据: { 姓名: '乙' } };
        let finish!: (value: any) => void;
        const pending = new Promise<any>(resolve => { finish = resolve; });
        const persist = vi.spyOn(dbService, '写回旧版寄售迁移').mockReturnValueOnce(pending).mockResolvedValueOnce(null);
        try {
            const firstLoad = 执行读取存档(first, deps as any);
            expect(deps.设置角色).not.toHaveBeenCalled();
            await 执行读取存档(second, deps as any);
            finish({ save: first, notes: ['已领取甲的寄售'], localClaims: {} });
            expect(await firstLoad).toBe(false);
            expect(deps.设置角色.mock.calls.every(([role]) => role.姓名 === '乙')).toBe(true);
            expect(deps.推送通知).not.toHaveBeenCalled();
        } finally { persist.mockRestore(); }
    });
    it('读入缺少队友标记的开局伙伴后，按其明确位置细化场所并保留开局时间', async () => {
        const deps = createDeps();
        const env = { 时间: '0001:01:03:09:10', 小地点: '青萍镇', 具体地点: '泥鳅巷破屋', 天气: { 天气: '微雨' } };
        const save = {
            ...createOpeningState(), id: 'old-room', 角色数据: { 姓名: '杨培强' }, 环境信息: env,
            世界: { 地图层级: [
                { ID: 'w', 名称: '寰宇', 层级: '寰宇' }, { ID: 't', 名称: '青萍镇', 层级: '小地点', 父级ID: 'w' },
                { ID: 'v', 名称: '泥鳅巷破屋', 层级: '区地点', 父级ID: 't' }, { ID: 'r', 名称: '暗室', 层级: '子地点', 父级ID: 'v' }
            ] },
            openingConfig: { 初始伙伴: { 姓名: '俞月荷', enabled: true } },
            社交: [{ id: 'cast1', 姓名: '俞月荷', 是否在场: true, 位置路径: '青萍镇 > 泥鳅巷破屋 > 暗室', 当前位置: '暗室' }]
        };
        await 执行读取存档(save as any, deps as any);
        expect(deps.设置环境).toHaveBeenCalledTimes(1);
        expect(deps.设置环境).toHaveBeenCalledWith({ ...env, 具体地点: '泥鳅巷破屋 > 暗室' });
        expect(deps.设置社交.mock.calls[0][0]).toContainEqual(expect.objectContaining({
            id: 'cast1', 是否队友: true, 当前位置: '暗室', 当前地点: '暗室'
        }));
    });
    it('读入旧档时从配置与确切的初始伙伴标签恢复队伍身份，保留人物 ID 与离场状态', async () => {
        const deps = { ...createDeps(), 规范化社交列表: (list: any[]) => list.map(npc => ({ 是否队友: false, ...npc })) };
        const save = {
            ...createOpeningState(), id: 'old-clash', 角色数据: { 姓名: '陆青' },
            openingConfig: { 初始伙伴: { 姓名: '沈青萝', enabled: true } },
            社交: [
                { id: 'CAST-1', 姓名: '沈青萝', 关系: '私下还在观察主角', 是否在场: false },
                { id: '已离队', 姓名: '故人', 来源: '开局伙伴', 是否队友: false, 是否在场: true },
                { id: 'NPC-2', 姓名: '同门人', 来源: '初始伙伴', 是否在场: true },
                { id: 'NPC-3', 姓名: '持剑女子', 关系状态: '初始同伴', 是否在场: true },
                { id: 'NPC-5', 姓名: '小舟', 分组: '初始同伴', 是否在场: true },
                { id: 'NPC-4', 姓名: '掌柜', 是否主要角色: true, 是否在场: true, 关系: '认识主角的初始伙伴' }
            ]
        };
        await 执行读取存档(save as any, deps as any);
        const social = deps.设置社交.mock.calls[0][0];
        expect(social.filter((entry: any) => entry.是否队友).map((entry: any) => entry.姓名)).toEqual(['沈青萝', '同门人', '持剑女子', '小舟']);
        expect(social[0]).toMatchObject({ id: 'CAST-1', 来源: '开局伙伴', 是否在场: false });
        expect(social).toHaveLength(6);
        expect(social[1].是否队友).toBe(false);
    });
    it('手动存档保留开局伙伴主动离队的决定', () => {
        const state = { ...createOpeningState(), openingConfig: { 初始伙伴: { 姓名: '沈青萝', enabled: true } },
            社交: [{ 姓名: '沈青萝', 来源: '开局伙伴', 是否队友: false }] };
        const saved = 创建存档数据('manual', state as any, createDeps() as any);
        expect(saved.社交?.[0].是否队友).toBe(false);
    });
    it('从旧档任务和公开原文补录未在场的人，重存保留 ID 与来源，忽略思考中的姓名', async () => {
        const state = createOpeningState();
        const save = { ...state, 角色数据: { 姓名: '陆青' }, 社交: [],
            任务列表: [{ 标题: '纠纷', 描述: '查明周堂主与商会的利益。' }],
            历史记录: [{ role: 'assistant', rawJson: '<thinking>阮堂主下令灭口。</thinking><正文>【旁白】周堂主下令封锁渡口。</正文>' }] };
        const deps = createDeps();
        await 执行读取存档(save as any, deps as any);
        const recovered = deps.设置社交.mock.calls[0][0];
        expect(recovered).toEqual([expect.objectContaining({ 姓名: '周堂主', 是否在场: false, 是否队友: false })]);
        const saved = 创建存档数据('manual', { ...state, 社交: recovered } as any, deps as any);
        expect(saved.社交?.[0].id).toBe(recovered[0].id);
        const afterForget = createDeps();
        await 执行读取存档({ ...save, 元数据: saved.元数据, 社交: [] } as any, afterForget as any);
        expect(afterForget.设置社交.mock.calls[0][0]).toEqual([]);
    });

    it('保存、导入并重建重 Roll 时保留独立的平静计数与情节记录', async () => {
        const { 清洗导入存档 } = await import('../services/dbService');
        const deps = { ...createDeps(), 推入重Roll快照: vi.fn() };
        const raw = 创建存档数据('manual', { ...createOpeningState(), 叙事平静值: { 平静计数: 7, 情节事件记录: ['闭关'] },
            历史记录: [{ role: 'user', content: '练剑' }, { role: 'assistant', content: '出剑' }] } as any, deps as any);
        const imported = 清洗导入存档(raw)!;
        expect(imported.叙事平静值).toEqual(raw.叙事平静值);
        await 执行读取存档(imported as any, deps as any);
        const calm = deps.推入重Roll快照.mock.calls[0][0].回档前状态.叙事平静值;
        expect(calm).toEqual(raw.叙事平静值);
        expect(calm.情节事件记录).not.toBe(imported.叙事平静值!.情节事件记录);
    });
    it('手动保存开局完成状态时，不把仍未刷新的开局占位历史写成坏档', () => {
        const save = 创建存档数据(
            'manual',
            createOpeningState() as any,
            createDeps() as any
        );

        expect(save.历史记录).not.toEqual(openingPlaceholderHistory);
        expect(save.历史记录[0]?.role).toBe('assistant');
        expect(save.历史记录[0]?.structuredResponse?.logs?.[0]?.text).toContain('晨雾压着青石山门');
        expect(save.元数据?.历史记录条数).toBe(save.历史记录.length);
    });

    it('读取已有受影响开局档时，从记忆恢复正文而不是显示开局未完成提示', async () => {
        const deps = createDeps();
        const save = {
            ...createOpeningState(),
            id: 'opening-race-save',
            类型: 'manual',
            时间戳: 2000,
            元数据: { schemaVersion: 12, 历史记录条数: 1 },
            角色数据: { 姓名: '陆青' },
            环境信息: { 时间: '0001:01:01:08:00', 大地点: '青岚山', 具体地点: '山门' },
            历史记录: deepClone(openingPlaceholderHistory),
            记忆系统: deepClone(openingMemory),
            游戏设置: {},
            记忆配置: {},
            视觉设置: {},
            场景图片档案: {},
            角色锚点列表: [],
            当前角色锚点ID: ''
        };

        await 执行读取存档(save as any, deps as any);

        const historyCalls = vi.mocked(deps.设置历史记录).mock.calls;
        const finalHistory = historyCalls.at(-1)?.[0] as any[];
        expect(finalHistory[0]?.role).toBe('assistant');
        expect(finalHistory[0]?.structuredResponse?.logs?.[0]?.text).toContain('晨雾压着青石山门');
        expect(JSON.stringify(finalHistory)).not.toContain('开局内容未完成生成');
    });
});
