// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearDiagnosticLogs, getDiagnosticLogs, recordDiagnosticLog } from '../services/diagnosticLog';
import { 构建地点树, 提取世界基底初始落点 } from '../utils/locationTree';
import { 合并世界基底到开场状态, 创建开场空白角色 } from '../hooks/useGame/storyState';
import { 提取玩家可见世界圣经概览 } from '../engine/storyV2/legacySaveBridge';
import { 创建空白导演圣经 } from '../models/directorBible';
import { 默认环境信息 } from '../models/environment';
import { 默认游戏设置 } from '../utils/gameSettings';
import LocationBrowser from '../components/features/Map/LocationBrowser';
import RegionMap from '../components/features/Map/RegionMap';
import MapModal from '../components/features/Map/MapModal';
import WorldModal from '../components/features/World/WorldModal';
import MobileWorldModal from '../components/features/World/MobileWorldModal';
import InputArea from '../components/features/Chat/InputArea';
import TopBar from '../components/layout/TopBar';
import LeftPanel from '../components/layout/LeftPanel';
import RightPanel from '../components/layout/RightPanel';
import ChatList from '../components/features/Chat/ChatList';
import TurnItem from '../components/features/Chat/TurnItem';
import StoryModal from '../components/features/Story/StoryModal';
import TaskModal from '../components/features/Task/TaskModal';
import LogViewer from '../components/features/Settings/LogViewer';
import GameSettings from '../components/features/Settings/GameSettings';
import VariableModelSettings from '../components/features/Settings/VariableModelSettings';
import MapModelSettings from '../components/features/Settings/MapModelSettings';
import SettingsModal from '../components/features/Settings/SettingsModal';
import ApiSettings from '../components/features/Settings/ApiSettings';
import WorldSettings from '../components/features/Settings/WorldSettings';
import VisualSettings from '../components/features/Settings/VisualSettings';
import ThemeSettings from '../components/features/Settings/ThemeSettings';
import MemorySettings from '../components/features/Settings/MemorySettings';
import StorageManager from '../components/features/Settings/StorageManager';
import ContextViewer from '../components/features/Settings/ContextViewer';
import WorkflowGraphSettings from '../components/features/Settings/WorkflowGraphSettings';
import NpcManager from '../components/features/Settings/NpcManager';
import VariableManager from '../components/features/Settings/VariableManager';
import PolishModelSettings from '../components/features/Settings/PolishModelSettings';
import RoleChatModelSettings from '../components/features/Settings/RoleChatModelSettings';
import PlanningModelSettings from '../components/features/Settings/PlanningModelSettings';
import WorldEvolutionModelSettings from '../components/features/Settings/WorldEvolutionModelSettings';
import RecallModelSettings from '../components/features/Settings/RecallModelSettings';
import MobileSettingsModal from '../components/features/Settings/mobile/MobileSettingsModal';
import SocialModal from '../components/features/Social/SocialModal';
import CharacterModal from '../components/features/Character/CharacterModal';
import InventoryModal from '../components/features/Inventory/InventoryModal';
import SaveLoadModal from '../components/features/SaveLoad/SaveLoadModal';
import MemoryModal from '../components/features/Memory/MemoryModal';
import WorldbookManagerModal from '../components/features/Worldbook/WorldbookManagerModal';
import CloudPlayModal from '../components/features/Auth/CloudPlayModal';
import LandingPage from '../components/layout/LandingPage';
import MobileQuickMenu from '../components/layout/MobileQuickMenu';
import NewGameWizard from '../components/features/NewGame/NewGameWizard';
import RoleChatModal from '../components/features/Chat/RoleChatModal';
import TradePluginModal from '../components/features/Chat/TradePluginModal';
import TacticalClashModal from '../components/features/Chat/TacticalClashModal';
import EquipmentModal from '../components/features/Equipment/EquipmentModal';
import KungfuModal from '../components/features/Kungfu/KungfuModal';
import SectModal from '../components/features/Sect/SectModal';
import TeamModal from '../components/features/Team/TeamModal';
import AgreementModal from '../components/features/Agreement/AgreementModal';
import HeroinePlanModal from '../components/features/Story/HeroinePlanModal';
import ImageManagerModal from '../components/features/Social/ImageManagerModal';
import NovelExportModal from '../components/features/Story/NovelExportModal';
import NovelDecompositionWorkbenchModal from '../components/features/NovelDecomposition/NovelDecompositionWorkbenchModal';
import MobileMapModal from '../components/features/Map/MobileMapModal';
import MobileSocial from '../components/features/Social/MobileSocial';
import MobileCharacter from '../components/features/Character/MobileCharacter';
import MobileInventoryModal from '../components/features/Inventory/MobileInventoryModal';
import MobileKungfuModal from '../components/features/Kungfu/MobileKungfuModal';
import MobileSect from '../components/features/Sect/MobileSect';
import MobileTask from '../components/features/Task/MobileTask';
import MobileTeamModal from '../components/features/Team/MobileTeamModal';
import MobileAgreementModal from '../components/features/Agreement/MobileAgreementModal';
import MobileStory from '../components/features/Story/MobileStory';
import MobileHeroinePlanModal from '../components/features/Story/MobileHeroinePlanModal';
import MobileMemory from '../components/features/Memory/MobileMemory';
import HistoryViewer from '../components/features/Settings/HistoryViewer';
import RealitySettings from '../components/features/Settings/RealitySettings';
import TavernPresetSettings from '../components/features/Settings/TavernPresetSettings';
import PromptManager from '../components/features/Settings/PromptManager';
import MusicSettings from '../components/features/Settings/MusicSettings';
import ImageGenerationSettings from '../components/features/Settings/ImageGenerationSettings';
import NovelDecompositionApiSettings from '../components/features/Settings/NovelDecompositionApiSettings';
import CurrentNovelDecompositionInjectionSettings from '../components/features/Settings/CurrentNovelDecompositionInjectionSettings';
import StoryPlanModelSettings from '../components/features/Settings/StoryPlanModelSettings';
import HeroinePlanModelSettings from '../components/features/Settings/HeroinePlanModelSettings';
import MemorySummaryModelSettings from '../components/features/Settings/MemorySummaryModelSettings';
import MemoryRefineModelSettings from '../components/features/Settings/MemoryRefineModelSettings';
import IndependentApiGptModeSettings from '../components/features/Settings/IndependentApiGptModeSettings';
import CreativeWorkshopModal from '../components/features/Workshop/CreativeWorkshopModal';
import { MusicProvider } from '../components/features/Music/MusicProvider';

vi.mock('../services/dbService', async () => {
    const actual = await vi.importActual<any>('../services/dbService');
    return {
        ...actual,
        初始化数据库: vi.fn(async () => ({}) as any),
        读取设置: vi.fn(async () => null),
        保存设置: vi.fn(async () => undefined),
        读取全部设置: vi.fn(async () => ({})),
        读取所有存档: vi.fn(async () => []),
        读取全部存档: vi.fn(async () => []),
        读取全部世界书: vi.fn(async () => []),
        读取全部内置提示词: vi.fn(async () => [])
    };
});

vi.mock('../services/naturalProseSettingsService', () => ({
    naturalProseSettingsService: {
        load: vi.fn(async () => ({
            启用自然文风: false,
            启用防AI味: false,
            自定义禁用词: []
        })),
        save: vi.fn(async () => undefined)
    }
}));

vi.mock('../engine/storyV2/storyTurnRenderer', async () => {
    const actual = await vi.importActual<any>('../engine/storyV2/storyTurnRenderer');
    return {
        ...actual,
        渲染开局回合V2: vi.fn(),
        渲染主剧情回合V2: vi.fn()
    };
});

vi.mock('../engine/storyV2/directorPostTurn', async () => {
    const actual = await vi.importActual<any>('../engine/storyV2/directorPostTurn');
    return {
        ...actual,
        执行导演后处理V2: vi.fn()
    };
});

vi.mock('../hooks/useGame/variableModelWorkflow', async () => {
    const actual = await vi.importActual<any>('../hooks/useGame/variableModelWorkflow');
    return {
        ...actual,
        执行变量模型校准工作流: vi.fn()
    };
});

vi.mock('../hooks/useGame/mapUpdateWorkflow', async () => {
    const actual = await vi.importActual<any>('../hooks/useGame/mapUpdateWorkflow');
    return {
        ...actual,
        生成地图更新: vi.fn()
    };
});

const 构建六层测试地图 = () => [
    { ID: 'L0', 层级: '寰宇' as const, 名称: '九州界', 描述: '九州界域', 父级ID: '' },
    { ID: 'L1', 层级: '大地点' as const, 名称: '中原乾州', 描述: '乾州大地', 父级ID: 'L0' },
    { ID: 'L2', 层级: '中地点' as const, 名称: '天灵郡', 描述: '天灵郡域', 父级ID: 'L1' },
    { ID: 'L3', 层级: '小地点' as const, 名称: '青河镇', 描述: '青河古镇', 父级ID: 'L2' },
    { ID: 'L4', 层级: '区地点' as const, 名称: '回春灵兽驿', 描述: '医馆驿站', 父级ID: 'L3' },
    { ID: 'L5', 层级: '子地点' as const, 名称: '灵兽地窖病房', 描述: '潮湿阴暗石室', 父级ID: 'L4' },
    { ID: 'L4B', 层级: '区地点' as const, 名称: '地下鬼市坊', 描述: '地下集市', 父级ID: 'L3' },
    { ID: 'L5B', 层级: '子地点' as const, 名称: '三娘多宝密室', 描述: '暗室密坊', 父级ID: 'L4B' }
];

const 构建测试环境 = (overrides: Record<string, any> = {}) => ({
    ...默认环境信息,
    大地点: '中原乾州',
    中地点: '天灵郡',
    小地点: '青河镇',
    具体地点: '灵兽地窖病房',
    ...overrides
});

afterEach(() => {
    cleanup();
    clearDiagnosticLogs();
    vi.restoreAllMocks();
});

describe('V2 试玩反馈综合修复验证', () => {
    it('1. diagnosticLog 正确格式化 console.error printf 占位符 (%s/%d)', () => {
        clearDiagnosticLogs();
        recordDiagnosticLog('error', [
            '<%s> cannot contain a nested %s. See this log for the ancestor stack trace.',
            'button',
            'button'
        ]);
        recordDiagnosticLog('error', [
            'In HTML, %s cannot be a descendant of <%s>. 第 %d 项',
            '<div>',
            'p',
            2
        ]);
        const entries = getDiagnosticLogs();
        expect(entries.length).toBe(2);
        expect(entries[0].message).toContain('In HTML, <div> cannot be a descendant of <p>. 第 2 项');
        expect(entries[0].message).not.toContain('%s');
        expect(entries[1].message).toContain('<button> cannot contain a nested button.');
        expect(entries[1].message).not.toContain('%s');
    });

    it('2. 世界基底开局自动锚定最底层房间，且地点树与前缀路径精确落到子地点', () => {
        const layers = 构建六层测试地图();
        const anchor = 提取世界基底初始落点(layers);
        expect(anchor).toEqual({
            大地点: '中原乾州',
            中地点: '天灵郡',
            小地点: '青河镇',
            具体地点: '灵兽地窖病房'
        });

        const merged = 合并世界基底到开场状态(
            {
                角色: { ...创建开场空白角色(), 姓名: '杨培强' },
                环境: { 时间: '1:01:01:06:00', 季节: '春', 天气: '微雨' } as any,
                世界: { 地图层级: [], 势力列表: [], 世界大事: [] } as any,
                剧情: { 当前章节: { 标题: '', 当前分解组: 1, 核心冲突: '', 当前待解问题: [] }, 历史卷宗: [] },
                剧情规划: { 当前章目标: [], 长期伏笔: [] },
                社交: []
            },
            {
                mapLayers: layers as any,
                factions: []
            }
        );
        expect(merged.环境?.大地点).toBe('中原乾州');
        expect(merged.环境?.小地点).toBe('青河镇');
        expect(merged.环境?.具体地点).toBe('灵兽地窖病房');

        const world = { 地图层级: layers, 势力列表: [], 世界大事: [] } as any;
        const prefixedTree = 构建地点树(world, 构建测试环境({ 具体地点: '青河镇/回春灵兽驿/灵兽地窖病房' }) as any);
        expect(prefixedTree.当前节点?.ID).toBe('L5');
        expect(prefixedTree.当前节点?.层级).toBe('子地点');
        expect(prefixedTree.当前节点?.名称).toBe('灵兽地窖病房');
    });

    it('3. RegionMap 支持突破 14.3x 放大到最底层房间，且房间在图上有清晰面积和人物标注', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 1000,
            height: 760,
            top: 0,
            left: 0,
            right: 1000,
            bottom: 760,
            x: 0,
            y: 0,
            toJSON: () => ({})
        });
        const layers = 构建六层测试地图();
        const world = { 地图层级: layers, 势力列表: [], 世界大事: [] } as any;
        const env = 构建测试环境();
        const social = [
            { id: 'npc_yu', 姓名: '俞月荷', 是否在场: true, 当前位置: '灵兽地窖病房', 关系: '同行伙伴' }
        ];

        const { container } = render(
            <LocationBrowser
                world={world}
                env={env as any}
                socialList={social}
                playerName="杨培强"
            />
        );

        expect(screen.getAllByText('灵兽地窖病房').length).toBeGreaterThan(0);
        const zoomInBtn = screen.getByTitle('放大');
        const svg = container.querySelector('svg[viewBox]') as SVGSVGElement | null;
        expect(svg).not.toBeNull();
        const readZoomRatio = () => {
            const vb = (svg?.getAttribute('viewBox') || '').split(/\s+/).map(Number);
            return vb[2] > 0 ? 1000 / vb[2] : 0;
        };

        for (let i = 0; i < 30; i += 1) {
            fireEvent.click(zoomInBtn);
        }
        expect(readZoomRatio()).toBeGreaterThan(15);
        rectSpy.mockRestore();
    });

    it('4. 玩家可见世界圣经概览脱敏绝密字段，且桌面与手机端世界弹窗均展示「世界总纲」页签', () => {
        const bible = 创建空白导演圣经();
        bible.世界观表层摘要 = '中原五宗暗争灵脉，青河镇下镇压着上古兽巢遗痕。';
        bible.顶层隐秘秩序 = 'TOP_SECRET_ORDER';
        bible.当前幕次 = 1;
        bible.空间阶梯 = [
            {
                层级序号: 1,
                层级名称: '底层散修坊镇',
                典型区域: ['青河镇'],
                准入壁垒: '盘缠与保命符',
                核心资源与垄断者: '一阶兽药与回春驿',
                主要压迫冲突: '地头税银与黑市抢货'
            }
        ];
        bible.宏观分幕大纲 = [
            {
                幕次: 1,
                标题: '第一幕：青河寒雨',
                核心矛盾: '驿站失窃案牵出灵兽地窖秘密',
                主角目标与破局路径: '查明兽药去向并稳住俞月荷',
                关键势力与人物: ['俞月荷', '回春灵兽驿'],
                跃迁至下一幕条件: '拿到密室铁牌',
                当前状态: '推进中'
            },
            {
                幕次: 2,
                标题: '第二幕：未揭晓未来剧透',
                核心矛盾: 'FUTURE_ACT_SPOILER',
                主角目标与破局路径: 'FUTURE_PATH',
                关键势力与人物: ['未来BOSS'],
                跃迁至下一幕条件: '',
                当前状态: '待开启'
            }
        ];
        bible.核心卡司 = [
            {
                id: 'c1',
                姓名: '俞月荷',
                性别: '女',
                身份与势力: '药师',
                所处层级: 1,
                生平与过往执念: '寻师',
                表层伪装: '冷淡',
                真实诉求与利益底线: '求活',
                隐藏秘密: 'CAST_SECRET_DO_NOT_LEAK',
                初始认知边界: { 已知事实: [], 盲区: [] },
                人际渊源: [],
                幕后当前日程: { 当前目标: '', 正在推进的步骤: '', 行动倒计时回合: 2, 已触发影响: [] },
                是否已登场: true
            }
        ];
        bible.伏笔台账 = [
            {
                id: 'FS-1',
                类型: '暗线伏笔',
                表面载体: '半枚青铜兽牌',
                底层真相: 'FORESHADOW_SECRET_DO_NOT_LEAK',
                知情人: [],
                盲区人物: [],
                建议埋设阶段: '第一幕',
                建议回收阶段: '第二幕',
                触发或回收条件: '',
                状态: '已埋设'
            }
        ];

        const overview = 提取玩家可见世界圣经概览(bible);
        const overviewJson = JSON.stringify(overview);
        expect(overviewJson).toContain('中原五宗暗争灵脉');
        expect(overviewJson).toContain('底层散修坊镇');
        expect(overviewJson).toContain('第一幕：青河寒雨');
        expect(overviewJson).not.toContain('TOP_SECRET_ORDER');
        expect(overviewJson).not.toContain('FUTURE_ACT_SPOILER');
        expect(overviewJson).not.toContain('CAST_SECRET_DO_NOT_LEAK');
        expect(overviewJson).not.toContain('FORESHADOW_SECRET_DO_NOT_LEAK');

        const world = { 地图层级: [], 势力列表: [], 世界大事: [] } as any;
        const desktop = render(
            <WorldModal
                world={world}
                worldPrompt="【核心世界观】九洲分五域，凡武之上另有灵脉秘境。"
                realmPrompt="炼体 → 聚气 → 筑基"
                worldOverview={overview}
                onClose={() => {}}
            />
        );
        const desktopTab = desktop.getByText('世界总纲');
        fireEvent.click(desktopTab);
        expect(desktop.getByText(/九洲分五域/)).toBeTruthy();
        desktop.unmount();

        const mobile = render(
            <MobileWorldModal
                world={world}
                worldPrompt="【核心世界观】九洲分五域，凡武之上另有灵脉秘境。"
                realmPrompt="炼体 → 聚气 → 筑基"
                worldOverview={overview}
                onClose={() => {}}
            />
        );
        const mobileTab = mobile.getByText('总纲');
        fireEvent.click(mobileTab);
        expect(mobile.getByText(/九洲分五域/)).toBeTruthy();
        mobile.unmount();
    });

    it('5. InputArea 队列清晰展示 skipped 阶段的「跳过原因」', () => {
        render(
            <InputArea
                onSend={async () => ({})}
                onStop={() => {}}
                onRegenerate={async () => null}
                loading={false}
                openingMainStoryProgress={{ phase: 'done', text: '2.0 开局正文生成完成', channelName: 'OpenAI', modelName: 'gpt-4.1' }}
                openingPolishProgress={{ phase: 'skipped', text: '文章优化功能未开启，已跳过。' }}
                openingVariableGenerationProgress={{ phase: 'skipped', text: '变量生成功能未开启（请在 API 设置中启用「启用变量生成」），已跳过。' }}
                openingWorldEvolutionProgress={{ phase: 'done', text: '局势稳定推进' }}
                openingPlanningProgress={{ phase: 'done', text: '2.0 导演后台推演完成' }}
                openingMapUpdateProgress={{ phase: 'skipped', text: '世界基底地图已完整，本回合无需追加新地点。' }}
            />
        );
        const toggleBtn = screen.getByTitle('展开独立更新阶段队列');
        fireEvent.click(toggleBtn);
        expect(screen.getAllByText(/跳过原因：/).length).toBeGreaterThanOrEqual(3);
        expect(screen.getByText(/文章优化功能未开启，已跳过/)).toBeTruthy();
        expect(screen.getByText(/变量生成功能未开启/)).toBeTruthy();
    });

    it('6. 2.0 开局与正常回合均会执行「变量生成」与「地图更新」，写入进度并同步在场 NPC 房间', async () => {
        const storyTurnRenderer = await import('../engine/storyV2/storyTurnRenderer');
        const directorPostTurn = await import('../engine/storyV2/directorPostTurn');
        const varWorkflow = await import('../hooks/useGame/variableModelWorkflow');
        const mapWorkflow = await import('../hooks/useGame/mapUpdateWorkflow');
        const { 执行开场剧情生成工作流 } = await import('../hooks/useGame/openingStoryWorkflow');
        const { 执行主剧情发送工作流 } = await import('../hooks/useGame/sendWorkflow');

        const bible = 创建空白导演圣经();
        const layers = 构建六层测试地图();
        const openingEnv = 构建测试环境({ 具体地点: '灵兽地窖病房' });

        vi.mocked(storyTurnRenderer.渲染开局回合V2).mockResolvedValue({
            response: {
                logs: [{ sender: '旁白', text: '青河镇夜雨初歇，地窖石阶微潮。' }],
                action_options: ['A.推开铁门查看伤兽']
            } as any,
            rawText: '<正文>【旁白】青河镇夜雨初歇，地窖石阶微潮。</正文>'
        });
        vi.mocked(storyTurnRenderer.渲染主剧情回合V2).mockResolvedValue({
            response: {
                logs: [{ sender: '旁白', text: '你随手捡起一枚青铜令牌。' }],
                action_options: ['A.查看令牌刻字']
            } as any,
            rawText: '<正文>【旁白】你随手捡起一枚青铜令牌。</正文>'
        });
        vi.mocked(directorPostTurn.执行导演后处理V2).mockResolvedValue({
            nextState: {
                turnIndex: 0,
                gameInitialTime: '1:01:01:06:00',
                worldPrompt: '九州',
                directorBible: bible,
                角色: { ...创建开场空白角色(), 姓名: '杨培强' },
                环境: openingEnv,
                社交: [{ id: 'npc_1', 姓名: '俞月荷', 是否在场: true, 当前位置: '' }],
                世界: { 地图层级: layers, 势力列表: [], 世界大事: [] } as any,
                剧情: { 当前章节: { 标题: '第一章', 当前分解组: 1, 核心冲突: '', 当前待解问题: [] }, 历史卷宗: [] },
                剧情规划: { 当前章目标: [], 长期伏笔: [] },
                记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
                历史记录: [],
                任务列表: [],
                世界大事: []
            },
            replanned: false,
            offscreenSpillovers: []
        });
        vi.mocked(varWorkflow.执行变量模型校准工作流).mockResolvedValue({
            commands: [{ action: 'add', key: '角色.金钱.铜钱', value: 15 }],
            reports: ['铜钱 +15'],
            rawText: '<命令>add 角色.金钱.铜钱 = 15</命令>',
            model: 'test-var-model'
        });
        vi.mocked(mapWorkflow.生成地图更新).mockResolvedValue({
            ok: true,
            phase: 'done',
            commands: [{ action: 'set', key: '世界.测试地图锚点', value: '灵兽地窖病房' }],
            rawText: '<命令>...</命令>',
            statusText: '地图新增 1 个节点'
        });

        const apiConfig = {
            activeConfigId: 'c1',
            configs: [{ id: 'c1', 名称: '主渠道', 供应商: 'openai', baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o' }],
            功能模型占位: {
                文章优化独立模型开关: false,
                变量计算独立模型开关: true,
                变量计算使用模型: 'gpt-4o-mini',
                地图生成功能启用: true,
                地图自动更新独立模型开关: false
            }
        } as any;

        const openingVarProgress = vi.fn();
        const openingMapProgress = vi.fn();
        const openingPolishProgress = vi.fn();
        const setSocial = vi.fn();
        const setRole = vi.fn();
        const setWorld = vi.fn();
        const setEnv = vi.fn();
        const baseRole = { ...创建开场空白角色(), 姓名: '杨培强' };
        const applyCommands = vi.fn((_resp: any, base: any) => ({
            ...base,
            角色: { ...base.角色, 金钱: { ...base.角色.金钱, 铜钱: (base.角色?.金钱?.铜钱 || 0) + 15 } }
        }));

        await 执行开场剧情生成工作流(
            {
                角色: baseRole,
                环境: openingEnv,
                世界: { 地图层级: layers, 势力列表: [], 世界大事: [] },
                社交: [{ id: 'npc_1', 姓名: '俞月荷', 是否在场: true, 当前位置: '' }],
                导演圣经: bible
            },
            [{ id: 'core_world', 标题: '世界观', 内容: '九州世界', 启用: true, 分类: '核心' } as any],
            false,
            apiConfig.configs[0],
            {},
            {
                apiConfig,
                环境: openingEnv as any,
                角色: baseRole as any,
                世界: { 地图层级: layers, 势力列表: [], 世界大事: [] } as any,
                战斗: { 是否战斗中: false } as any,
                玩家门派: {} as any,
                任务列表: [],
                约定列表: [],
                剧情: { 当前章节: { 标题: '', 当前分解组: 1, 核心冲突: '', 当前待解问题: [] }, 历史卷宗: [] } as any,
                剧情规划: { 当前章目标: [], 长期伏笔: [] } as any,
                导演圣经: bible,
                gameConfig: { ...默认游戏设置, 启用2_0剧情引擎: true },
                memoryConfig: {},
                builtinPromptEntries: [],
                worldbooks: [],
                abortControllerRef: { current: null },
                setPrompts: vi.fn(),
                设置历史记录: vi.fn(),
                设置角色: setRole,
                设置环境: setEnv,
                设置社交: setSocial,
                设置世界: setWorld,
                设置战斗: vi.fn(),
                设置剧情: vi.fn(),
                设置剧情规划: vi.fn(),
                设置女主剧情规划: vi.fn(),
                设置同人剧情规划: vi.fn(),
                设置同人女主剧情规划: vi.fn(),
                设置导演圣经: vi.fn(),
                设置上一回合导演圣经: vi.fn(),
                设置玩家门派: vi.fn(),
                设置任务列表: vi.fn(),
                设置约定列表: vi.fn(),
                设置开局文章优化进度: openingPolishProgress,
                设置开局主剧情进度: vi.fn(),
                设置开局变量生成进度: openingVarProgress,
                设置开局世界演变进度: vi.fn(),
                设置开局规划进度: vi.fn(),
                设置开局地图更新进度: openingMapProgress,
                设置游戏初始时间: vi.fn(),
                记录变量生成上下文: vi.fn(),
                setWorldEvents: vi.fn(),
                应用并同步记忆系统: vi.fn(),
                performAutoSave: vi.fn(),
                构建系统提示词: vi.fn() as any,
                processResponseCommands: applyCommands as any,
                规范化环境信息: (v: any) => v || openingEnv,
                规范化剧情状态: (v: any) => v,
                规范化剧情规划状态: (v: any) => v,
                规范化女主剧情规划状态: (v: any) => v,
                规范化同人剧情规划状态: (v: any) => v,
                规范化同人女主剧情规划状态: (v: any) => v,
                规范化角色物品容器映射: (v: any) => v,
                规范化社交列表: (v: any) => Array.isArray(v) ? v : [],
                规范化世界状态: (v: any) => v,
                规范化战斗状态: (v: any) => v || { 是否战斗中: false },
                规范化门派状态: (v: any) => v || {},
                游戏设置启用自动重试: () => false,
                执行带自动重试的生成请求: ({ action }: any) => action(1),
                更新流式草稿为自动重试提示: (h: any) => h,
                替换流式草稿为失败提示: (h: any) => h,
                提取解析失败原始信息: () => '',
                获取原始AI消息: (t: string) => t,
                估算消息Token: () => 10,
                估算AI输出Token: () => 10,
                计算回复耗时秒: () => 1,
                文章优化功能已开启: () => false,
                执行正文润色: vi.fn(),
                触发新增NPC自动生图: vi.fn(),
                触发主角自动生图: vi.fn(),
                触发场景自动生图: vi.fn(),
                提取新增NPC列表: () => []
            }
        );

        expect(openingPolishProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'skipped' }));
        expect(varWorkflow.执行变量模型校准工作流).toHaveBeenCalledTimes(1);
        expect(openingVarProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
        expect(mapWorkflow.生成地图更新).toHaveBeenCalledTimes(1);
        expect(openingMapProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
        const finalSocialArg = setSocial.mock.calls.at(-1)?.[0] || [];
        expect(finalSocialArg[0]?.当前位置).toBe('灵兽地窖病房');

        vi.mocked(varWorkflow.执行变量模型校准工作流).mockClear();
        vi.mocked(mapWorkflow.生成地图更新).mockClear();
        const turnVarProgress = vi.fn();
        const turnMapProgress = vi.fn();
        await 执行主剧情发送工作流(
            '拾起青铜令牌检查',
            false,
            {
                历史记录: [],
                记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
                角色: baseRole as any,
                环境: openingEnv as any,
                社交: [{ id: 'npc_1', 姓名: '俞月荷', 是否在场: true, 当前位置: '' }],
                世界: { 地图层级: layers, 势力列表: [], 世界大事: [] },
                战斗: { 是否战斗中: false },
                玩家门派: {},
                任务列表: [],
                约定列表: [],
                剧情: { 当前章节: { 标题: '第一章', 当前分解组: 1, 核心冲突: '', 当前待解问题: [] }, 历史卷宗: [] } as any,
                剧情规划: { 当前章目标: [], 长期伏笔: [] } as any,
                导演圣经: bible,
                loading: false,
                gameConfig: { ...默认游戏设置, 启用2_0剧情引擎: true },
                apiConfig,
                memoryConfig: {},
                visualConfig: {},
                sceneImageArchive: {},
                prompts: [],
                内置提示词列表: [],
                世界书列表: []
            },
            {
                abortControllerRef: { current: null },
                recallAbortControllerRef: { current: null },
                setLoading: vi.fn(),
                set后台队列处理中: vi.fn(),
                setShowSettings: vi.fn(),
                设置角色: vi.fn(),
                设置环境: vi.fn(),
                设置社交: vi.fn(),
                设置世界: vi.fn(),
                设置剧情: vi.fn(),
                设置剧情规划: vi.fn(),
                设置女主剧情规划: vi.fn(),
                设置任务列表: vi.fn(),
                设置导演圣经: vi.fn(),
                设置上一回合导演圣经: vi.fn(),
                setWorldEvents: vi.fn(),
                设置历史记录: vi.fn(),
                设置叙事平静值: vi.fn(),
                应用并同步记忆系统: vi.fn(),
                构建系统提示词: vi.fn() as any,
                processResponseCommands: applyCommands as any,
                performAutoSave: vi.fn(async () => ({ id: 1 })),
                执行正文润色: vi.fn(),
                执行世界演变更新: vi.fn(),
                触发新增NPC自动生图: vi.fn(),
                触发对白NPC头像补全: vi.fn(),
                检查主角每回合生图: vi.fn(),
                触发场景自动生图: vi.fn(),
                应用常驻壁纸为背景: vi.fn(),
                提取新增NPC列表: () => [],
                推入重Roll快照: vi.fn(),
                弹出重Roll快照: vi.fn(),
                回档到快照: vi.fn(),
                深拷贝: (v: any) => v === undefined ? v : JSON.parse(JSON.stringify(v)),
                按回合窗口裁剪历史: (h: any) => h,
                规范化环境信息: (v: any) => v || openingEnv,
                规范化剧情状态: (v: any) => v,
                规范化剧情规划状态: (v: any) => v,
                规范化女主剧情规划状态: (v: any) => v,
                规范化同人剧情规划状态: (v: any) => v,
                规范化同人女主剧情规划状态: (v: any) => v,
                规范化世界状态: (v: any) => v,
                游戏设置启用自动重试: () => false,
                执行带自动重试的生成请求: ({ action }: any) => action(1),
                更新流式草稿为自动重试提示: (h: any) => h,
                提取解析失败原始信息: () => '',
                提取原始报错详情: () => '',
                格式化错误详情: () => '',
                获取原始AI消息: (t: string) => t,
                估算消息Token: () => 10,
                估算AI输出Token: () => 10,
                计算回复耗时秒: () => 1,
                文章优化功能已开启: () => false,
                后台执行统一规划分析: vi.fn(),
                后台执行变量生成: vi.fn(),
                执行变量生成并合并响应: vi.fn()
            },
            {
                onVariableGenerationProgress: turnVarProgress,
                onMapUpdateProgress: turnMapProgress
            }
        );

        await waitFor(() => {
            expect(varWorkflow.执行变量模型校准工作流).toHaveBeenCalledTimes(1);
            expect(mapWorkflow.生成地图更新).toHaveBeenCalledTimes(1);
        });
        expect(turnVarProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
        expect(turnMapProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
    });

    it('7. 核心游玩界面与设置各子页全量渲染不触发 React DOM 嵌套错误', () => {
        const nestingErrors: string[] = [];
        const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
            const first = String(args[0] ?? '');
            if (/cannot contain a nested|cannot be a descendant of|cannot be a child of/i.test(first)) {
                nestingErrors.push(args.map((a) => String(a)).join(' | '));
            }
        });

        const layers = 构建六层测试地图();
        const env = 构建测试环境();
        const world = { 地图层级: layers, 势力列表: [{ ID: 'f1', 名称: '回春谷', 类型: '宗门', 实力等级: 5, 描述: '医道', 成员列表: [] }], 世界大事: [] } as any;
        const social = [{ id: 'npc_yu', 姓名: '俞月荷', 真实姓名: '俞清欢', 性别: '女', 身份: '药师', 关系: '同伴', 关系状态: '同行', 好感度: 50, 是否在场: true, 是否队友: true, 当前位置: '灵兽地窖病房', 背包: [] }];
        const role = { ...创建开场空白角色(), 姓名: '杨培强', 物品列表: [] } as any;
        const apiCfg = { activeConfigId: 'c1', configs: [{ id: 'c1', 名称: '主渠道', 供应商: 'openai', baseUrl: 'https://api.example.com/v1', apiKey: 'sk', model: 'gpt-4o' }], 功能模型占位: {} } as any;
        const bible = 创建空白导演圣经();
        const storyObj = { 当前章节: { 标题: '第一章', 当前分解组: 1, 核心冲突: '药方', 当前待解问题: [] }, 历史卷宗: [] } as any;
        const sampleTasks = [{ id: 't1', 标题: '查明兽药去向', 状态: '进行中', 描述: '查明去向', 当前目标列表: [{ 描述: '搜索地窖', 当前进度: 0, 总需进度: 1, 完成状态: false }], 奖励列表: ['铜钱 20'] }] as any;
        const sampleHistory = [
            { role: 'user' as const, content: '查看周围情况', timestamp: 1000, gameTime: '1:01:01:06:00' },
            {
                role: 'assistant' as const,
                content: 'Structured',
                timestamp: 1001,
                gameTime: '1:01:01:06:00',
                structuredResponse: {
                    logs: [
                        { sender: '旁白', text: '石室内药味刺鼻，你注意到《青铜药匙》放在桌上。' },
                        { sender: '俞月荷', text: '“小心些，这头灵兽刚受惊。”' },
                        { sender: '判定', text: '观察 成功：看清门锁刻痕' }
                    ],
                    action_options: ['A.检查铁门', 'B.询问俞月荷']
                }
            }
        ];

        const view = render(
            <MusicProvider>
                <LandingPage
                    onStart={() => {}}
                    onLoad={() => {}}
                    onCloudPlay={() => {}}
                    onImageManager={() => {}}
                    onWorldbookManager={() => {}}
                    onNovelDecomposition={() => {}}
                    onSettings={() => {}}
                    onOpenReleaseNotes={() => {}}
                    currentTheme="dark"
                    onThemeChange={() => {}}
                    hasSave
                    apiConfig={apiCfg}
                />
                <TopBar 环境={env as any} 游戏初始时间="1:01:01:06:00" timeFormat="传统" />
                <LeftPanel 角色={role} gameConfig={默认游戏设置 as any} />
                <RightPanel
                    onOpenSettings={() => {}}
                    onOpenInventory={() => {}}
                    onOpenEquipment={() => {}}
                    onOpenTeam={() => {}}
                    onOpenSocial={() => {}}
                    onOpenKungfu={() => {}}
                    onOpenWorld={() => {}}
                    onOpenMap={() => {}}
                    onOpenSect={() => {}}
                    onOpenTask={() => {}}
                    onOpenAgreement={() => {}}
                    onOpenStory={() => {}}
                    onOpenHeroinePlan={() => {}}
                    onOpenMemory={() => {}}
                    onSave={() => {}}
                    onLoad={() => {}}
                />
                <MobileQuickMenu activeWindow={null} onMenuClick={() => {}} />
                <ChatList
                    history={sampleHistory as any}
                    loading={false}
                    scrollRef={{ current: null }}
                    socialList={social as any}
                    playerProfile={role}
                />
                <TurnItem
                    response={(sampleHistory[1] as any).structuredResponse}
                    turnNumber={1}
                    isLatest
                    onSaveEdit={async () => null}
                    socialList={social as any}
                    playerProfile={role}
                />
                <InputArea
                    onSend={async () => ({})}
                    onStop={() => {}}
                    onRegenerate={async () => null}
                    loading={false}
                    options={['A.检查铁门', 'B.询问俞月荷']}
                    openingMainStoryProgress={{ phase: 'done', text: '完成', rawText: 'ok', commandTexts: ['set a = 1'] }}
                    openingPolishProgress={{ phase: 'skipped', text: '未开启' }}
                    openingVariableGenerationProgress={{ phase: 'done', text: '完成', rawText: 'ok', commandTexts: ['add 铜钱 = 10'] }}
                    openingWorldEvolutionProgress={{ phase: 'done', text: '完成' }}
                    openingPlanningProgress={{ phase: 'done', text: '完成' }}
                    openingMapUpdateProgress={{ phase: 'skipped', text: '无需更新' }}
                />
                <LocationBrowser world={world} env={env as any} socialList={social} playerName="杨培强" />
                <RegionMap
                    nodes={[]}
                    allNodes={构建地点树(world, env as any).根节点 ? [构建地点树(world, env as any).根节点!] : []}
                    currentNodeId="L5"
                    currentLocationName="灵兽地窖病房"
                    onSelect={() => {}}
                    onLocateCurrent={() => {}}
                    socialList={social}
                    env={env as any}
                    playerName="杨培强"
                />
                <MapModal world={world} env={env as any} socialList={social} playerName="杨培强" onClose={() => {}} />
                <MobileMapModal world={world} env={env as any} socialList={social} playerName="杨培强" onClose={() => {}} />
                <WorldModal
                    world={world}
                    worldPrompt="【世界观】"
                    worldOverview={提取玩家可见世界圣经概览(bible)}
                    onClose={() => {}}
                />
                <MobileWorldModal
                    world={world}
                    worldPrompt="【世界观】"
                    worldOverview={提取玩家可见世界圣经概览(bible)}
                    onClose={() => {}}
                />
                <StoryModal story={storyObj} directorBible={bible} worldEvents={[]} onClose={() => {}} />
                <MobileStory story={storyObj} directorBible={bible} worldEvents={[]} onClose={() => {}} />
                <HeroinePlanModal onClose={() => {}} />
                <MobileHeroinePlanModal onClose={() => {}} />
                <TaskModal tasks={sampleTasks} onClose={() => {}} />
                <MobileTask tasks={sampleTasks} onClose={() => {}} />
                <SocialModal socialList={social as any} onClose={() => {}} />
                <MobileSocial socialList={social as any} onClose={() => {}} />
                <CharacterModal character={role} onClose={() => {}} />
                <MobileCharacter character={role} onClose={() => {}} />
                <InventoryModal character={role} onClose={() => {}} />
                <MobileInventoryModal character={role} onClose={() => {}} />
                <EquipmentModal character={role} onClose={() => {}} />
                <KungfuModal skills={[]} onClose={() => {}} />
                <MobileKungfuModal skills={[]} onClose={() => {}} />
                <SectModal sectData={{ ID: 's0', 名称: '青河派', 门规: ['不得同门相残'], 成员列表: [], 堂口列表: [], 藏经阁: [], 兑换列表: [], 商品列表: [], 任务列表: [], 玩家职位: '外门弟子', 玩家贡献: 10, 描述: '山门' } as any} onClose={() => {}} />
                <MobileSect sectData={{ ID: 's0', 名称: '青河派', 门规: ['不得同门相残'], 成员列表: [], 堂口列表: [], 藏经阁: [], 兑换列表: [], 商品列表: [], 任务列表: [], 玩家职位: '外门弟子', 玩家贡献: 10, 描述: '山门' } as any} onClose={() => {}} />
                <TeamModal character={role} teammates={social as any} onClose={() => {}} />
                <MobileTeamModal character={role} teammates={social as any} onClose={() => {}} />
                <AgreementModal agreements={[]} onClose={() => {}} />
                <MobileAgreementModal agreements={[]} onClose={() => {}} />
                <SaveLoadModal mode="load" onClose={() => {}} onLoadGame={() => {}} />
                <MemoryModal history={sampleHistory as any} onClose={() => {}} />
                <MobileMemory history={sampleHistory as any} onClose={() => {}} />
                <ImageManagerModal socialList={social as any} queue={[]} sceneArchive={{} as any} sceneQueue={[]} onClose={() => {}} />
                <NovelExportModal isOpen={false} onClose={() => {}} history={sampleHistory} apiSettings={apiCfg} />
                <NovelDecompositionWorkbenchModal open={false} settings={apiCfg} onSave={() => {}} onClose={() => {}} />
                <CreativeWorkshopModal open={false} onClose={() => {}} onNovelDecomposition={() => {}} apiConfig={apiCfg} />
                <WorldbookManagerModal
                    builtinPromptEntries={[]}
                    worldbooks={[]}
                    worldbookPresetGroups={[]}
                    onSaveBuiltinPromptEntries={() => {}}
                    onSaveWorldbooks={() => {}}
                    onSaveWorldbookPresetGroups={() => {}}
                    onClose={() => {}}
                />
                <CloudPlayModal onClose={() => {}} onLoadGame={() => {}} />
                <NewGameWizard onComplete={() => {}} onCancel={() => {}} loading={false} apiConfig={apiCfg} />
                <LogViewer />
                <ApiSettings settings={apiCfg} onSave={() => {}} />
                <GameSettings settings={默认游戏设置 as any} onSave={() => {}} />
                <VariableModelSettings settings={apiCfg} onSave={() => {}} />
                <MapModelSettings settings={apiCfg} onSave={() => {}} />
                <PolishModelSettings settings={apiCfg} onSave={() => {}} />
                <RoleChatModelSettings settings={apiCfg} onSave={() => {}} />
                <PlanningModelSettings settings={apiCfg} onSave={() => {}} />
                <WorldEvolutionModelSettings settings={apiCfg} onSave={() => {}} />
                <RecallModelSettings settings={apiCfg} onSave={() => {}} />
                <StoryPlanModelSettings settings={apiCfg} onSave={() => {}} />
                <HeroinePlanModelSettings settings={apiCfg} onSave={() => {}} />
                <MemorySummaryModelSettings settings={apiCfg} onSave={() => {}} />
                <MemoryRefineModelSettings settings={apiCfg} onSave={() => {}} />
                <NovelDecompositionApiSettings settings={apiCfg} onSave={() => {}} />
                <CurrentNovelDecompositionInjectionSettings settings={apiCfg} />
                <ImageGenerationSettings settings={apiCfg} onSave={() => {}} />
                <WorkflowGraphSettings settings={apiCfg} gameConfig={默认游戏设置 as any} onSave={() => {}} />
                <RealitySettings settings={默认游戏设置 as any} onSave={() => {}} />
                <TavernPresetSettings settings={默认游戏设置 as any} onSave={() => {}} apiConfig={apiCfg} />
                <IndependentApiGptModeSettings settings={默认游戏设置 as any} onSave={() => {}} />
                <PromptManager prompts={[]} onUpdate={() => {}} />
                <MusicSettings />
                <WorldSettings festivals={[]} onUpdate={() => {}} />
                <VisualSettings settings={{} as any} onSave={() => {}} />
                <ThemeSettings currentTheme="dark" onThemeChange={() => {}} />
                <MemorySettings settings={{} as any} onSave={() => {}} />
                <HistoryViewer history={sampleHistory as any} />
                <StorageManager />
                <ContextViewer snapshot={{ sections: [{ id: 's1', title: '世界观', category: '核心', order: 1, content: '九州' }], fullText: '九州' }} />
                <NpcManager socialList={social as any} onCreateNpc={() => {}} onSaveNpc={() => {}} onDeleteNpc={() => {}} onUploadNpcImage={() => {}} />
                <VariableManager
                    runtimeState={{ 角色: role, 环境: env, 社交: social, 世界: world, 战斗: {}, 剧情: {}, 剧情规划: {}, 女主剧情规划: {}, 玩家门派: {}, 任务列表: [], 约定列表: [], 记忆系统: {} }}
                    onReplaceSection={() => {}}
                    onApplyCommand={() => {}}
                />
                <SettingsModal
                    activeTab="game"
                    onTabChange={() => {}}
                    onClose={() => {}}
                    apiConfig={apiCfg}
                    visualConfig={{} as any}
                    gameConfig={默认游戏设置 as any}
                    memoryConfig={{} as any}
                    prompts={[]}
                    festivals={[]}
                    currentTheme="dark"
                    history={[]}
                    socialList={social as any}
                    runtimeState={{ 角色: role, 环境: env, 社交: social, 世界: world, 战斗: {}, 剧情: {}, 剧情规划: {}, 女主剧情规划: {}, 玩家门派: {}, 任务列表: [], 约定列表: [], 记忆系统: {} }}
                    onSaveApi={() => {}}
                    onSaveVisual={() => {}}
                    onCreateNpc={() => {}}
                    onSaveNpc={() => {}}
                    onDeleteNpc={() => {}}
                    onUploadNpcImage={() => {}}
                    onReplaceVariableSection={() => {}}
                    onApplyVariableCommand={() => {}}
                    onUpdatePrompts={() => {}}
                    onUpdateFestivals={() => {}}
                    onThemeChange={() => {}}
                />
                <MobileSettingsModal
                    activeTab="game"
                    onTabChange={() => {}}
                    onClose={() => {}}
                    apiConfig={apiCfg}
                    visualConfig={{} as any}
                    gameConfig={默认游戏设置 as any}
                    memoryConfig={{} as any}
                    prompts={[]}
                    festivals={[]}
                    currentTheme="dark"
                    history={[]}
                    socialList={social as any}
                    runtimeState={{ 角色: role, 环境: env, 社交: social, 世界: world, 战斗: {}, 剧情: {}, 剧情规划: {}, 女主剧情规划: {}, 玩家门派: {}, 任务列表: [], 约定列表: [], 记忆系统: {} }}
                    onSaveApi={() => {}}
                    onSaveVisual={() => {}}
                    onCreateNpc={() => {}}
                    onSaveNpc={() => {}}
                    onDeleteNpc={() => {}}
                    onUploadNpcImage={() => {}}
                    onReplaceVariableSection={() => {}}
                    onApplyVariableCommand={() => {}}
                    onUpdatePrompts={() => {}}
                    onUpdateFestivals={() => {}}
                    onThemeChange={() => {}}
                />
                <RoleChatModal
                    open
                    loading={false}
                    环境={env}
                    社交列表={social as any}
                    场外对话={[]}
                    配置就绪
                    onSend={async () => ({ reply: '好', npcName: '俞月荷' })}
                    onReroll={async () => ({ reply: '好', npcName: '俞月荷' })}
                    onGroupSend={async () => []}
                    onStop={() => {}}
                    onDiscard={() => {}}
                    onClear={() => {}}
                    onClose={() => {}}
                    群聊开启={false}
                    自动回复上限={1}
                    单聊气泡样式="single"
                />
                <TradePluginModal
                    open
                    loading={false}
                    role={role}
                    env={env}
                    world={world}
                    social={social as any}
                    directorBible={bible}
                    pendingTrades={[]}
                    onApplyTrade={() => {}}
                    onClearTrades={() => {}}
                    onClose={() => {}}
                />
                <EquipmentModal character={role} onClose={() => {}} />
                <KungfuModal skills={[]} onClose={() => {}} />
                <MobileKungfuModal skills={[]} onClose={() => {}} />
                <SectModal sectData={{ ID: 's0', 名称: '青河派', 门规: ['不得同门相残'], 成员列表: [], 堂口列表: [], 藏经阁: [], 兑换列表: [], 商品列表: [], 任务列表: [], 玩家职位: '外门弟子', 玩家贡献: 10, 描述: '山门' } as any} onClose={() => {}} />
                <MobileSect sectData={{ ID: 's0', 名称: '青河派', 门规: ['不得同门相残'], 成员列表: [], 堂口列表: [], 藏经阁: [], 兑换列表: [], 商品列表: [], 任务列表: [], 玩家职位: '外门弟子', 玩家贡献: 10, 描述: '山门' } as any} onClose={() => {}} />
                <TeamModal character={role} teammates={social as any} onClose={() => {}} />
                <MobileTeamModal character={role} teammates={social as any} onClose={() => {}} />
                <AgreementModal agreements={[]} onClose={() => {}} />
                <MobileAgreementModal agreements={[]} onClose={() => {}} />
                <MobileMapModal world={world} env={env as any} socialList={social} playerName="杨培强" onClose={() => {}} />
                <MobileSocial socialList={social as any} onClose={() => {}} />
                <MobileCharacter character={role} onClose={() => {}} />
                <MobileInventoryModal character={role} onClose={() => {}} />
                <MobileTask tasks={sampleTasks} onClose={() => {}} />
                <MobileStory story={storyObj} directorBible={bible} worldEvents={[]} onClose={() => {}} />
                <HeroinePlanModal onClose={() => {}} />
                <MobileHeroinePlanModal onClose={() => {}} />
                <MobileMemory history={sampleHistory as any} onClose={() => {}} />
                <ImageManagerModal socialList={social as any} queue={[]} sceneArchive={{} as any} sceneQueue={[]} onClose={() => {}} />
                <NovelExportModal isOpen onClose={() => {}} history={sampleHistory} apiSettings={apiCfg} />
                <NovelDecompositionWorkbenchModal open settings={apiCfg} onSave={() => {}} onClose={() => {}} />
                <CreativeWorkshopModal open onClose={() => {}} onNovelDecomposition={() => {}} apiConfig={apiCfg} />
                <HistoryViewer history={sampleHistory as any} />
                <RealitySettings settings={默认游戏设置 as any} onSave={() => {}} />
                <TavernPresetSettings settings={默认游戏设置 as any} onSave={() => {}} apiConfig={apiCfg} />
                <PromptManager prompts={[]} onUpdate={() => {}} />
                <MusicSettings />
                <ImageGenerationSettings settings={apiCfg} onSave={() => {}} />
                <NovelDecompositionApiSettings settings={apiCfg} onSave={() => {}} />
                <CurrentNovelDecompositionInjectionSettings settings={apiCfg} />
                <StoryPlanModelSettings settings={apiCfg} onSave={() => {}} />
                <HeroinePlanModelSettings settings={apiCfg} onSave={() => {}} />
                <MemorySummaryModelSettings settings={apiCfg} onSave={() => {}} />
                <MemoryRefineModelSettings settings={apiCfg} onSave={() => {}} />
                <IndependentApiGptModeSettings settings={默认游戏设置 as any} onSave={() => {}} />
                <TacticalClashModal
                    open
                    loading={false}
                    role={role}
                    env={env}
                    social={social as any}
                    directorBible={bible}
                    pendingClashes={[]}
                    onCommitClash={() => {}}
                    onClearClashes={() => {}}
                    onClose={() => {}}
                />
            </MusicProvider>
        );
        view.queryAllByTitle('展开独立更新阶段队列').forEach((btn) => fireEvent.click(btn));
        view.queryAllByTitle('查看原始返回').forEach((btn) => fireEvent.click(btn));
        view.queryAllByTitle('展开日志').forEach((btn) => fireEvent.click(btn));
        // 切换 WorldModal / SocialModal / SettingsModal 页签以覆盖隐藏分页渲染
        view.queryAllByText('势力脉络').forEach((btn) => fireEvent.click(btn));
        view.queryAllByText('世界总纲').forEach((btn) => fireEvent.click(btn));
        view.queryAllByText('史册留痕').forEach((btn) => fireEvent.click(btn));
        view.unmount();
        errSpy.mockRestore();
        expect(nestingErrors).toEqual([]);
    });
});
