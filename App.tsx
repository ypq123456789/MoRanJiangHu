import React from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import TopBar from './components/layout/TopBar';
import LeftPanel from './components/layout/LeftPanel';
import RightPanel from './components/layout/RightPanel';
import MobileQuickMenu from './components/layout/MobileQuickMenu';
import ChatList from './components/features/Chat/ChatList';
import InputArea from './components/features/Chat/InputArea';
import LandingPage from './components/layout/LandingPage';
import InAppConfirmModal, { ConfirmOptions } from './components/ui/InAppConfirmModal';
import ReleaseNotesModal from './components/ui/ReleaseNotesModal';
import { useGame } from './hooks/useGame';
import { use图片资源回源预取 } from './hooks/useImageAssetPrefetch';
import { normalizeCanonicalGameTime, 环境时间转标准串 } from './hooks/useGame/timeUtils';
import { 获取主剧情接口配置, 获取文生图接口配置, 获取生图词组转化器接口配置, 获取记忆精炼接口配置, 接口配置是否可用 } from './utils/apiConfig';
import { 请求模型文本 } from './services/ai/chatCompletionClient';
import { 记忆精炼系统提示词 } from './prompts/runtime/memoryRefine';
import { 获取内置世界书槽位内容 } from './utils/worldbook';
import { 生成地图更新 } from './hooks/useGame/mapUpdateWorkflow';
import { 构建字体注入样式文本, 构建UI文字CSS变量 } from './utils/visualSettings';
import { 获取图片资源文本地址, 读取远程图片兜底资源ID } from './utils/imageAssets';
import { 生成物品图标 } from './services/ai/itemImageGeneration';
import { 合并物品图片档案, 获取物品图标复用Key, 物品已有可用图标, 获取物品已选图标地址 } from './utils/itemImage';
import { 生图最大自动重试次数, 执行生图模型调用带重试, 读取生图错误文本 } from './utils/imageGenerationRetry';
import { 丢弃背包物品, 是否杂物类物品 } from './utils/inventoryActions';
import { MusicProvider } from './components/features/Music/MusicProvider';
import { isNativeCapacitorEnvironment } from './utils/nativeRuntime';
import { isDynamicImportFetchError, lazyImportWithReload } from './utils/lazyImportWithReload';
import { 小说拆分后台调度服务 } from './services/novelDecompositionScheduler';
import { checkForAppUpdate, downloadLatestApkPackage, subscribeAppUpdateProgress, type AppUpdateProgressState } from './services/appUpdate';
import { APK仅手动更新已启用 } from './utils/appUpdatePreferences';
import { RELEASE_INFO } from './data/releaseInfo';
import { fetchRuntimeReleaseInfo, type RuntimeReleaseInfo } from './services/runtimeReleaseInfo';
import { 读取拍卖行状态, 保存拍卖行状态, 清理并补货, 投放事件拍卖品, 构建拍卖行存储作用域, 上架背包物品, 创建交易记录, 结算玩家寄售, 从势力互动投放拍卖品, type 拍卖行状态 } from './services/auctionHouse';
import { 获取货币显示模式, 规范化角色金钱 } from './utils/currencyDisplay';
import { 获取题材界面文案 } from './utils/resourceLabels';
import { 获取题材顶部时间显示格式 } from './utils/modeRuntimeProfile';
import { 计算游戏历程天数 } from './utils/gameTimeJourney';
import { 整理世界状态客户可见大事 } from './hooks/useGame/worldEvolutionUtils';
import { 分配角色属性点, type 可分配六维属性键 } from './utils/characterAttributePoints';
import { getDiagnosticLogs, recordDiagnosticLog, subscribeDiagnosticLogs } from './services/diagnosticLog';
import { 获取本地图片图床迁移状态, 启动旧存档谱系迁移, 读取旧存档谱系迁移状态, 读取图片资源兜底地址, 订阅旧存档谱系迁移状态, 订阅本地图片图床迁移状态, 执行延迟上传队列, type 旧存档谱系迁移状态, type 本地图片图床迁移状态 } from './services/dbService';
import { startOnlinePresenceHeartbeat } from './services/onlinePresence';
import { 等待云端后台同步完成, 确保本地存档已同步到云端, 确保最新本地存档已同步到云端, 读取云端游玩存储模式 } from './services/cloudPlayService';
import './services/diagnosticLog';
import type { 物品生图结果 } from './types';
import type { 游戏物品 } from './models/item';
import type { 功法结构, 功法类型, 功法品质, 消耗类型, 伤害类型, 目标类型 } from './models/kungfu';

const RELEASE_NOTES_SUPPRESS_DATE_KEY = 'moranjianghu.releaseNotesSuppressDate';
const DESKTOP_DETAIL_WIDTHS_STORAGE_KEY = 'moranjianghu.desktopRightDetailWidths.v3';
const DESKTOP_DETAIL_MIN_WIDTH = 520;
const DESKTOP_DETAIL_MAX_WIDTH = 1160;
const DESKTOP_DETAIL_RIGHT_GAP = 12;
const ITEM_AUTO_IMAGE_RETRY_INTERVAL = 10 * 60 * 1000;
const ITEM_AUTO_IMAGE_AFTER_CHARACTER_SCENE_IDLE_DELAY = 2500;
const ITEM_AUTO_IMAGE_RECENT_SUCCESS_TTL = 10 * 60 * 1000;

const 解析标准游戏时间片段 = (raw?: string | null): { year: number; month: number; day: number; hour: number; minute: number } | null => {
    const canonical = normalizeCanonicalGameTime((raw || '').trim());
    if (!canonical) return null;
    const match = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5])
    };
};
const ITEM_AUTO_IMAGE_BACKEND_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const DIAGNOSTIC_ERROR_TOAST_COOLDOWN_MS = 90 * 1000;
const getDesktopDetailDefaultWidth = (_panelId: string | null): number => {
    return DESKTOP_DETAIL_MAX_WIDTH;
};

const 获取物品自动生图Key = (_scope: 'bag' | 'auction', item: any): string => 获取物品图标复用Key(item);

const 是同类物品图标复用目标 = (left: any, right: any): boolean => (
    获取物品图标复用Key(left) === 获取物品图标复用Key(right)
);

const 复用物品图片档案 = (targetItem: 游戏物品, sourceItem: 游戏物品): 游戏物品 => ({
    ...(targetItem as any),
    图片档案: sourceItem.图片档案
});

const 是生图后端不可用错误文本 = (message: string): boolean => (
    /ComfyUI\s*未返回\s*prompt_id|ComfyUI\s*连接失败|不是可用的\s*ComfyUI|HTTP\s*200.*text\/html|Content-Type:\s*text\/html|服务端返回的是\s*HTML|地址已失效|地址失效|工作区休眠|登录页|代理页面|错误页面|CNB\s*8188/i.test(message)
);

type 物品自动生图近期结果 = {
    completedAt: number;
    recordId: string;
    nextItem: 游戏物品;
};

type 本回合变化区域 = '角色' | '背包' | '装备' | '战斗' | '队伍' | '社交' | '功法' | '地图' | '玩家门派' | '任务列表' | '约定列表' | '世界' | '剧情' | '剧情规划' | '记忆系统';

const 旧图迁移阶段文案: Record<本地图片图床迁移状态['stage'], string> = {
    idle: '等待扫描',
    scanning: '正在扫描',
    running: '正在迁移',
    completed: '迁移完成',
    partial_failed: '部分完成',
    failed: '迁移失败'
};

const 旧图迁移提示条: React.FC<{
    status: 本地图片图床迁移状态;
    onClose: () => void;
}> = ({ status, onClose }) => {
    const total = Math.max(0, Number(status.totalAssets) || 0);
    const processed = Math.min(total, Math.max(0, Number(status.processedAssets) || 0));
    const percent = total > 0 ? Math.round((processed / total) * 100) : (status.stage === 'completed' ? 100 : 0);
    const isActive = status.stage === 'scanning' || status.stage === 'running';
    const isFailed = status.stage === 'failed' || status.stage === 'partial_failed';
    const title = isActive ? '旧存档图片正在自动迁移' : isFailed ? '旧存档图片迁移需要重试' : '旧存档图片迁移完成';
    const message = isActive
        ? '系统正在后台把旧存档本地图片上传到图床。可以关闭此提示并继续使用；如果关闭网页，未完成部分会在下次打开时继续扫描和重试。'
        : isFailed
            ? '部分图片暂时未迁移成功，原图会保留，后续会自动重试。已迁移成功的内容重新加载存档后会切换为图床链接。'
            : '图片来源已写回本地存档。请重新加载当前存档，游戏内图片才会完整切换为图床链接。';

    return (
        <div className="fixed left-1/2 top-4 z-[10020] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 pointer-events-auto">
            <div className={`rounded-xl border px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-md ${
                isFailed
                    ? 'border-amber-500/50 bg-amber-950/90 text-amber-50'
                    : isActive
                        ? 'border-sky-500/50 bg-sky-950/90 text-sky-50'
                        : 'border-emerald-500/50 bg-emerald-950/90 text-emerald-50'
            }`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <div className="font-semibold" style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}>{title}</div>
                            <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] opacity-90">{旧图迁移阶段文案[status.stage]}</span>
                        </div>
                        <div className="mt-1 opacity-90" style={{ fontSize: 'var(--ui-compact-font-size, 14px)', lineHeight: '1.55' }}>{message}</div>
                        <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] opacity-85">
                                <span>{status.lastMessage || '正在等待迁移进度更新'}</span>
                                <span>{total > 0 ? `${processed}/${total}` : `${percent}%`}</span>
                            </div>
                            <div className="h-2 rounded-full bg-black/45 border border-white/10 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isFailed ? 'bg-amber-300' : isActive ? 'bg-sky-300' : 'bg-emerald-300'} ${isActive ? 'animate-pulse' : ''}`}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-80">
                                <span>已迁移 {status.migratedAssets} 张</span>
                                <span>更新存档 {status.updatedSaves} 个</span>
                                {status.failedAssets > 0 && <span>失败 {status.failedAssets} 张</span>}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded border border-white/20 px-2 py-1 text-xs opacity-75 hover:opacity-100 hover:bg-white/10"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

const 旧存档谱系迁移提示条: React.FC<{
    status: 旧存档谱系迁移状态;
    onClose: () => void;
}> = ({ status, onClose }) => {
    const total = Math.max(0, Number(status.legacySaves) || 0);
    const done = Math.min(total, Math.max(0, Number(status.convertedSaves || 0) + Number(status.failedSaves || 0)));
    const percent = total > 0 ? Math.round((done / total) * 100) : (status.stage === 'completed' ? 100 : 0);
    const isActive = status.stage === 'scanning' || status.stage === 'running';
    const isFailed = status.stage === 'failed';

    return (
        <div className="fixed left-1/2 top-4 z-[10025] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 pointer-events-auto">
            <div className={`rounded-xl border px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-md ${
                isFailed
                    ? 'border-amber-500/50 bg-amber-950/90 text-amber-50'
                    : isActive
                        ? 'border-sky-500/50 bg-sky-950/90 text-sky-50'
                        : 'border-emerald-500/50 bg-emerald-950/90 text-emerald-50'
            }`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <div className="font-semibold" style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}>旧存档正在转换为新谱系</div>
                            <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] opacity-90">{status.stage === 'scanning' ? '扫描中' : status.stage === 'running' ? '转换中' : status.stage === 'completed' ? '已完成' : '需重试'}</span>
                        </div>
                        <div className="mt-1 opacity-90" style={{ fontSize: 'var(--ui-compact-font-size, 14px)', lineHeight: '1.55' }}>
                            旧存档会保留原文件，只补上时间树谱系信息。可以关闭提示继续使用；未完成部分下次进入会继续转换，也可在"重入江湖"页面查看进度。
                        </div>
                        <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] opacity-85">
                                <span>{status.lastMessage || '正在等待转换进度更新'}</span>
                                <span>{total > 0 ? `${done}/${total}` : `${percent}%`}</span>
                            </div>
                            <div className="h-2 rounded-full bg-black/45 border border-white/10 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isFailed ? 'bg-amber-300' : isActive ? 'bg-sky-300' : 'bg-emerald-300'} ${isActive ? 'animate-pulse' : ''}`}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-80">
                                <span>旧存档 {status.legacySaves} 个</span>
                                <span>已转换 {status.convertedSaves} 个</span>
                                {status.failedSaves > 0 && <span>待重试 {status.failedSaves} 个</span>}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded border border-white/20 px-2 py-1 text-xs opacity-75 hover:opacity-100 hover:bg-white/10"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

const 提取本回合变化区域 = (commands: any[]): 本回合变化区域[] => {
    const areas = new Set<本回合变化区域>();
    (Array.isArray(commands) ? commands : []).forEach((cmd) => {
        const key = typeof cmd?.key === 'string' ? cmd.key : '';
        if (!key) return;
        if (key.includes('角色.物品列表')) areas.add('背包');
        if (key.includes('角色.装备')) areas.add('装备');
        if (key.includes('角色.功法列表')) areas.add('功法');
        if (key.includes('角色.当前坐标') || key.includes('世界.地图')) areas.add('地图');
        if (key.includes('角色.') || key.startsWith('角色.')) areas.add('角色');
        if (key.includes('战斗')) areas.add('战斗');
        if (key.includes('社交')) areas.add('社交');
        if (key.includes('队伍') || key.includes('是否队友')) areas.add('队伍');
        if (key.includes('玩家门派')) areas.add('玩家门派');
        if (key.includes('任务列表')) areas.add('任务列表');
        if (key.includes('约定列表')) areas.add('约定列表');
        if (key.includes('世界')) areas.add('世界');
        if (key.includes('剧情规划') || key.includes('女主剧情规划') || key.includes('同人剧情规划') || key.includes('同人女主剧情规划')) {
            areas.add('剧情规划');
        } else if (key.includes('剧情')) {
            areas.add('剧情');
        }
        if (key.includes('记忆')) areas.add('记忆系统');
    });
    return [...areas];
};

const 是同一个物品 = (left: any, right: any): boolean => {
    const leftId = typeof left?.ID === 'string' ? left.ID.trim() : '';
    const rightId = typeof right?.ID === 'string' ? right.ID.trim() : '';
    if (leftId && rightId) return leftId === rightId;
    return Boolean(left?.名称 && right?.名称 && left.名称 === right.名称);
};

const clampDesktopDetailWidth = (value: number): number => {
    const viewportLimit = typeof window === 'undefined'
        ? DESKTOP_DETAIL_MAX_WIDTH
        : Math.max(DESKTOP_DETAIL_MIN_WIDTH, window.innerWidth - 200);
    return Math.round(Math.max(
        DESKTOP_DETAIL_MIN_WIDTH,
        Math.min(value, DESKTOP_DETAIL_MAX_WIDTH, viewportLimit)
    ));
};

const readDesktopDetailWidths = (): Record<string, number> => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_DETAIL_WIDTHS_STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) acc[key] = clampDesktopDetailWidth(numeric);
            return acc;
        }, {});
    } catch {
        return {};
    }
};

type 可预加载组件<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
    preload?: () => Promise<unknown>;
    importKey: string;
};

const 创建可预加载懒组件 = <T extends React.ComponentType<any>>(
    importKey: string,
    loader: () => Promise<{ default: T }>
): 可预加载组件<T> => {
    const wrappedLoader = () => lazyImportWithReload(importKey, loader);
    const Component = React.lazy(wrappedLoader) as 可预加载组件<T>;
    Component.preload = wrappedLoader;
    Component.importKey = importKey;
    return Component;
};

const CharacterModal = 创建可预加载懒组件('character-modal', () => import('./components/features/Character/CharacterModal'));
const MobileCharacter = 创建可预加载懒组件('mobile-character', () => import('./components/features/Character/MobileCharacter'));
const NewGameWizard = 创建可预加载懒组件('new-game-wizard', () => import('./components/features/NewGame/NewGameWizard'));
const MobileNewGameWizard = 创建可预加载懒组件('mobile-new-game-wizard', () => import('./components/features/NewGame/mobile/MobileNewGameWizard'));
const SettingsModal = 创建可预加载懒组件('settings-modal', () => import('./components/features/Settings/SettingsModal'));
const MobileSettingsModal = 创建可预加载懒组件('mobile-settings-modal', () => import('./components/features/Settings/mobile/MobileSettingsModal'));
const InventoryModal = 创建可预加载懒组件('inventory-modal', () => import('./components/features/Inventory/InventoryModal'));
const MobileInventoryModal = 创建可预加载懒组件('mobile-inventory-modal', () => import('./components/features/Inventory/MobileInventoryModal'));
const EquipmentModal = 创建可预加载懒组件('equipment-modal', () => import('./components/features/Equipment/EquipmentModal'));
const BattleModal = 创建可预加载懒组件('battle-modal', () => import('./components/features/Battle/BattleModal'));
const MobileBattleModal = 创建可预加载懒组件('mobile-battle-modal', () => import('./components/features/Battle/MobileBattleModal'));
const SocialModal = 创建可预加载懒组件('social-modal', () => import('./components/features/Social/SocialModal'));
const MobileSocial = 创建可预加载懒组件('mobile-social', () => import('./components/features/Social/MobileSocial'));
const ImageManagerModal = 创建可预加载懒组件('image-manager-modal', () => import('./components/features/Social/ImageManagerModal'));
const MobileImageManagerModal = 创建可预加载懒组件('mobile-image-manager-modal', () => import('./components/features/Social/mobile/MobileImageManagerModal'));
const WorldbookManagerModal = 创建可预加载懒组件('worldbook-manager-modal', () => import('./components/features/Worldbook/WorldbookManagerModal'));
const TeamModal = 创建可预加载懒组件('team-modal', () => import('./components/features/Team/TeamModal'));
const MobileTeamModal = 创建可预加载懒组件('mobile-team-modal', () => import('./components/features/Team/MobileTeamModal'));
const KungfuModal = 创建可预加载懒组件('kungfu-modal', () => import('./components/features/Kungfu/KungfuModal'));
const MobileKungfuModal = 创建可预加载懒组件('mobile-kungfu-modal', () => import('./components/features/Kungfu/MobileKungfuModal'));
const SkillsPanel = 创建可预加载懒组件('skills-panel', () => import('./components/features/Skills/SkillsPanel'));
const MobileSkillsPanel = 创建可预加载懒组件('mobile-skills-panel', () => import('./components/features/Skills/MobileSkillsPanel'));
const WorldModal = 创建可预加载懒组件('world-modal', () => import('./components/features/World/WorldModal'));
const MobileWorldModal = 创建可预加载懒组件('mobile-world-modal', () => import('./components/features/World/MobileWorldModal'));
const MapModal = 创建可预加载懒组件('map-modal', () => import('./components/features/Map/MapModal'));
const MobileMapModal = 创建可预加载懒组件('mobile-map-modal', () => import('./components/features/Map/MobileMapModal'));
const SectModal = 创建可预加载懒组件('sect-modal', () => import('./components/features/Sect/SectModal'));
const MobileSect = 创建可预加载懒组件('mobile-sect', () => import('./components/features/Sect/MobileSect'));
const TaskModal = 创建可预加载懒组件('task-modal', () => import('./components/features/Task/TaskModal'));
const MobileTask = 创建可预加载懒组件('mobile-task', () => import('./components/features/Task/MobileTask'));
const AgreementModal = 创建可预加载懒组件('agreement-modal', () => import('./components/features/Agreement/AgreementModal'));
const MobileAgreementModal = 创建可预加载懒组件('mobile-agreement-modal', () => import('./components/features/Agreement/MobileAgreementModal'));
const StoryModal = 创建可预加载懒组件('story-modal', () => import('./components/features/Story/StoryModal'));
const MobileStory = 创建可预加载懒组件('mobile-story', () => import('./components/features/Story/MobileStory'));
const HeroinePlanModal = 创建可预加载懒组件('heroine-plan-modal', () => import('./components/features/Story/HeroinePlanModal'));
const MobileHeroinePlanModal = 创建可预加载懒组件('mobile-heroine-plan-modal', () => import('./components/features/Story/MobileHeroinePlanModal'));
const NovelExportModal = 创建可预加载懒组件('novel-export-modal', () => import('./components/features/Story/NovelExportModal'));
const MemoryModal = 创建可预加载懒组件('memory-modal', () => import('./components/features/Memory/MemoryModal'));
const MobileMemory = 创建可预加载懒组件('mobile-memory', () => import('./components/features/Memory/MobileMemory'));
const MemorySummaryFlowModal = 创建可预加载懒组件('memory-summary-flow-modal', () => import('./components/features/Memory/MemorySummaryFlowModal'));
const MemorySummaryFlowMobileModal = 创建可预加载懒组件('mobile-memory-summary-flow-modal', () => import('./components/features/Memory/MemorySummaryFlowMobileModal'));
const NpcMemorySummaryFlowModal = 创建可预加载懒组件('npc-memory-summary-flow-modal', () => import('./components/features/Memory/NpcMemorySummaryFlowModal'));
const NpcMemorySummaryFlowMobileModal = 创建可预加载懒组件('mobile-npc-memory-summary-flow-modal', () => import('./components/features/Memory/NpcMemorySummaryFlowMobileModal'));
const SaveLoadModal = 创建可预加载懒组件('save-load-modal', () => import('./components/features/SaveLoad/SaveLoadModal'));
const CloudPlayModal = 创建可预加载懒组件('cloud-play-modal', () => import('./components/features/Auth/CloudPlayModal'));
const MobileMusicPlayer = 创建可预加载懒组件('mobile-music-player', () => import('./components/features/Music/mobile/MobileMusicPlayer'));
const NovelDecompositionWorkbenchModal = 创建可预加载懒组件('novel-decomposition-workbench-modal', () => import('./components/features/NovelDecomposition/NovelDecompositionWorkbenchModal'));
const AuctionHouseModal = 创建可预加载懒组件('auction-house-modal', () => import('./components/features/AuctionHouse/AuctionHouseModal'));


type 可选网络信息 = {
    downlink?: number;
    effectiveType?: string;
    saveData?: boolean;
};

const 桌面轻量预热目标 = [
    CharacterModal,
    SettingsModal,
    InventoryModal,
    EquipmentModal,
    BattleModal,
    TeamModal,
    SocialModal,
    KungfuModal,
    WorldModal,
    MapModal,
    SectModal,
    TaskModal,
    AgreementModal,
    StoryModal,
    HeroinePlanModal,
    MemoryModal,
    SaveLoadModal,
    CloudPlayModal,
    AuctionHouseModal,
    NovelExportModal
] as const;

const 移动端轻量预热目标 = [
    MobileCharacter,
    MobileSettingsModal,
    MobileInventoryModal,
    MobileBattleModal,
    MobileTeamModal,
    MobileSocial,
    MobileKungfuModal,
    MobileWorldModal,
    MobileMapModal,
    MobileSect,
    MobileTask,
    MobileAgreementModal,
    MobileStory,
    MobileHeroinePlanModal,
    MobileMemory,
    SaveLoadModal,
    CloudPlayModal,
    AuctionHouseModal
] as const;

const 网络较慢或节省流量 = (connection?: 可选网络信息 | null): boolean => {
    if (!connection) return false;
    if (connection.saveData) return true;
    const effectiveType = typeof connection.effectiveType === 'string'
        ? connection.effectiveType.toLowerCase()
        : '';
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return true;
    if (typeof connection.downlink === 'number' && Number.isFinite(connection.downlink) && connection.downlink < 1.5) {
        return true;
    }
    return false;
};
const 懒加载占位: React.FC = () => (
    <div className="lazy-scroll-loading pointer-events-none fixed inset-0 z-[260] flex items-center justify-center bg-[#f8f4e8]/70 px-6 py-10 text-center backdrop-blur-[2px]">
        <div
            className="lazy-scroll-shell rounded-2xl border border-wuxia-gold/35 bg-[#fffaf0]/95 px-6 py-5 text-[#7a4a1f] shadow-[0_18px_42px_rgba(120,82,38,0.18)]"
            style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}
        >
            <div className="lazy-scroll-title tracking-[0.22em]">卷轴展开中…</div>
            <div className="lazy-scroll-skeleton mt-5 grid gap-3 text-left" aria-hidden="true">
                <div className="h-4 w-28 rounded-full bg-wuxia-gold/20" />
                <div className="h-20 rounded-xl border border-wuxia-gold/20 bg-white/60" />
                <div className="grid grid-cols-2 gap-3">
                    <div className="h-16 rounded-lg border border-wuxia-gold/15 bg-white/55" />
                    <div className="h-16 rounded-lg border border-wuxia-gold/15 bg-white/55" />
                </div>
            </div>
        </div>
    </div>
);

const 懒加载边界: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <React.Suspense fallback={<懒加载占位 />}>{children}</React.Suspense>
);


class ModalErrorBoundary extends React.Component<
    { children: React.ReactNode; title: string; onClose?: () => void },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error('Modal render failed:', error);
    }

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        const isLazyImportError = isDynamicImportFetchError(this.state.error);
        return (
            <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/88 px-5 py-8">
                <div className="w-full max-w-md rounded-2xl border border-red-500/45 bg-[#120909] p-5 text-red-100 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                    <div className="text-base font-semibold tracking-[0.12em] text-red-200">{this.props.title}</div>
                    <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-red-100/90">
                        {this.state.error.message || '界面渲染失败'}
                    </div>
                    <div className="mt-4 text-xs leading-5 text-red-200/70">
                        {isLazyImportError
                            ? '检测到页面资源已经更新，但当前页面还停留在旧版本。点击下面按钮刷新后，通常就能直接恢复。'
                            : '这次错误已写入运行日志。可打开"设置 → 运行日志"查看详情、复制诊断或点击"上报日志"提交给维护人员。'}
                    </div>
                    {isLazyImportError && (
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-wuxia-gold/35 bg-wuxia-gold/10 px-4 text-sm text-wuxia-gold"
                        >
                            刷新重试
                        </button>
                    )}
                    {this.props.onClose && (
                        <button
                            type="button"
                            onClick={this.props.onClose}
                            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-red-300/40 bg-red-950/40 px-4 text-sm text-red-50"
                        >
                            关闭
                        </button>
                    )}
                </div>
            </div>
        );
    }
}

const App: React.FC = () => {
    const { state, meta, setters, actions } = useGame();
    const safeGameConfig = state.gameConfig ?? ({} as typeof state.gameConfig);
    const safeCharacter = state.角色 ?? ({} as typeof state.角色);
    const safeShowSaveLoad = state.showSaveLoad ?? { show: false, mode: 'save' as const };
    const latestCharacterRef = React.useRef(state.角色);
    React.useEffect(() => {
        latestCharacterRef.current = state.角色;
    }, [state.角色]);
    const [showCharacter, setShowCharacter] = React.useState(false);
    const [showImageManager, setShowImageManager] = React.useState(false);
    const [showWorldbookManager, setShowWorldbookManager] = React.useState(false);
    const [showNovelDecompositionWorkbench, setShowNovelDecompositionWorkbench] = React.useState(false);
    const [showNovelExport, setShowNovelExport] = React.useState(false);
    const [mapRegenerateRawText, setMapRegenerateRawText] = React.useState('');
    const [showAuctionHouse, setShowAuctionHouse] = React.useState(false);
    const [showCloudPlay, setShowCloudPlay] = React.useState(false);
    const [auctionHouseState, setAuctionHouseState] = React.useState<拍卖行状态>(() => {
        try {
            return 读取拍卖行状态(undefined, { 题材模式: state.开局配置?.题材模式 });
        } catch (error) {
            recordDiagnosticLog('warn', ['拍卖行初始化失败，已使用空状态兜底', error]);
            return 清理并补货({
                拍卖品列表: [],
                交易记录: [],
                最近补货时间: 0,
                行情列表: [],
                最近行情时间: 0
            }, { 允许系统补货: false, 题材模式: state.开局配置?.题材模式 });
        }
    });
    const auctionCurrencyOptions = React.useMemo(() => ({
        货币模式: 获取货币显示模式(state.开局配置, state.角色),
        runtimeProfile: state.开局配置?.modeRuntimeProfile || null
    }), [state.开局配置, state.角色]);
    const [showMobileMusic, setShowMobileMusic] = React.useState(false);
    const [chatContentHidden, setChatContentHidden] = React.useState(false);
    const [sceneQuickGenHint, setSceneQuickGenHint] = React.useState(false);
    const [sceneQuickGenToastVisible, setSceneQuickGenToastVisible] = React.useState(false);
    const [contextSnapshot, setContextSnapshot] = React.useState<Awaited<ReturnType<typeof actions.getContextSnapshot>> | undefined>(undefined);
    const [showReleaseNotes, setShowReleaseNotes] = React.useState(false);
    const [suppressReleaseNotesForToday, setSuppressReleaseNotesForToday] = React.useState(false);
    const [returnHomeSaving, setReturnHomeSaving] = React.useState(false);
    const [appUpdateProgress, setAppUpdateProgress] = React.useState<AppUpdateProgressState | null>(null);
    const [runtimeReleaseInfo, setRuntimeReleaseInfo] = React.useState<RuntimeReleaseInfo>(RELEASE_INFO as RuntimeReleaseInfo);
    const [legacyImageMigrationStatus, setLegacyImageMigrationStatus] = React.useState(() => 获取本地图片图床迁移状态());
    const [legacyImageMigrationNoticeClosed, setLegacyImageMigrationNoticeClosed] = React.useState(false);
    const [legacySaveLineageMigrationStatus, setLegacySaveLineageMigrationStatus] = React.useState(() => 读取旧存档谱系迁移状态());
    const [legacySaveLineageMigrationNoticeClosed, setLegacySaveLineageMigrationNoticeClosed] = React.useState(false);
    const [selectedSocialNpcId, setSelectedSocialNpcId] = React.useState<string | null>(null);
    const [inventoryInitialItemRef, setInventoryInitialItemRef] = React.useState('');
    const [desktopDetailFullscreen, setDesktopDetailFullscreen] = React.useState(false);
    const [desktopDetailWidths, setDesktopDetailWidths] = React.useState<Record<string, number>>(() => readDesktopDetailWidths());
    const [viewportWidth, setViewportWidth] = React.useState<number>(() => {
        if (typeof window === 'undefined') return 1280;
        return window.innerWidth;
    });
    const [isMobile, setIsMobile] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(max-width: 767px)').matches;
    });
    const [isFullscreen, setIsFullscreen] = React.useState<boolean>(() => {
        if (typeof document === 'undefined') return false;
        const doc = document as Document & {
            webkitFullscreenElement?: Element;
            msFullscreenElement?: Element;
        };
        return Boolean(document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
    });
    const lastUpdateCheckAtRef = React.useRef(0);
    const releaseNotesAutoOpenedRef = React.useRef(false);
    const autoItemImageRunningRef = React.useRef<Set<string>>(new Set());
    const autoItemImageScheduledRef = React.useRef<Set<string>>(new Set());
    const autoItemImageRecentSuccessRef = React.useRef<Map<string, 物品自动生图近期结果>>(new Map());
    const autoItemImageFailedAtRef = React.useRef<Map<string, number>>(new Map());
    const autoItemImageBackendCooldownUntilRef = React.useRef(0);
    const autoItemImageWakeTimerRef = React.useRef<number | null>(null);
    const [autoItemImageWakeTick, setAutoItemImageWakeTick] = React.useState(0);
    const auctionSettlementHandledRef = React.useRef<Set<string>>(new Set());
    const 最近运行报错提示IDRef = React.useRef('');
    const 最近运行报错提示时间Ref = React.useRef(0);
    const legacyImageMigrationNoticeStageRef = React.useRef(legacyImageMigrationStatus.stage);
    const legacySaveLineageMigrationNoticeStageRef = React.useRef(legacySaveLineageMigrationStatus.stage);
    const auctionHouseScope = React.useMemo(() => 构建拍卖行存储作用域({
        游戏初始时间: state.游戏初始时间,
        角色数据: state.角色,
        环境信息: state.环境,
        历史记录: state.历史记录
    }), [state.游戏初始时间, state.角色, state.环境, state.历史记录]);
    const currentRealmPrompt = React.useMemo(() => (
        (state.prompts || []).find((prompt) => prompt?.id === 'core_realm')?.内容 || ''
    ), [state.prompts]);
    const 唤醒物品自动生图扫描 = React.useCallback((delayMs = 0) => {
        if (typeof window === 'undefined') return;
        if (autoItemImageWakeTimerRef.current !== null) {
            window.clearTimeout(autoItemImageWakeTimerRef.current);
            autoItemImageWakeTimerRef.current = null;
        }
        autoItemImageWakeTimerRef.current = window.setTimeout(() => {
            autoItemImageWakeTimerRef.current = null;
            setAutoItemImageWakeTick((value) => (value + 1) % 1_000_000);
        }, Math.max(0, delayMs));
    }, []);
    React.useEffect(() => () => {
        if (autoItemImageWakeTimerRef.current !== null) {
            window.clearTimeout(autoItemImageWakeTimerRef.current);
            autoItemImageWakeTimerRef.current = null;
        }
    }, []);
    const runAppUpdateCheck = React.useCallback(async (options?: { silentNoUpdate?: boolean; auto?: boolean }) => {
        if (options?.auto && APK仅手动更新已启用(state.gameConfig)) {
            return;
        }
        try {
            await checkForAppUpdate(options);
        } catch (error) {
            const message = error instanceof Error ? error.message : '更新失败，请稍后重试。';
            if (options?.auto) {
                console.warn('Auto update check failed:', error);
                return;
            }
            window.alert(message);
        }
    }, [state.gameConfig]);

    React.useEffect(() => subscribeAppUpdateProgress(setAppUpdateProgress), []);
    React.useEffect(() => {
        let cancelled = false;
        void fetchRuntimeReleaseInfo().then((info) => {
            if (!cancelled) setRuntimeReleaseInfo(info);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    React.useEffect(() => startOnlinePresenceHeartbeat(), []);
    React.useEffect(() => {
        const handleImageError = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLImageElement)) return;
            if (target.dataset.moranjianghuFallbackApplied === '1') return;
            const sourceUrl = target.currentSrc || target.src;
            const fallbackAssetId = 读取远程图片兜底资源ID(sourceUrl);
            if (!fallbackAssetId) return;
            target.dataset.moranjianghuFallbackApplied = '1';
            void 读取图片资源兜底地址(fallbackAssetId).then((fallbackSrc) => {
                if (fallbackSrc) target.src = fallbackSrc;
            });
        };
        window.addEventListener('error', handleImageError, true);
        return () => {
            window.removeEventListener('error', handleImageError, true);
        };
    }, []);
    React.useEffect(() => 订阅本地图片图床迁移状态((status) => {
        setLegacyImageMigrationStatus(status);
        if (legacyImageMigrationNoticeStageRef.current !== status.stage) {
            legacyImageMigrationNoticeStageRef.current = status.stage;
            setLegacyImageMigrationNoticeClosed(false);
        }
    }), []);
    React.useEffect(() => 订阅旧存档谱系迁移状态((status) => {
        setLegacySaveLineageMigrationStatus(status);
        if (legacySaveLineageMigrationNoticeStageRef.current !== status.stage) {
            legacySaveLineageMigrationNoticeStageRef.current = status.stage;
            setLegacySaveLineageMigrationNoticeClosed(false);
        }
    }), []);
    React.useEffect(() => {
        const timer = window.setTimeout(() => {
            void 启动旧存档谱系迁移();
        }, 900);
        return () => window.clearTimeout(timer);
    }, []);
    React.useEffect(() => {
        const subscribedAt = Date.now();
        const unsubscribe = subscribeDiagnosticLogs(() => {
            const latestError = getDiagnosticLogs().find((entry) => {
                if (entry.level !== 'error') return false;
                const entryTime = Date.parse(entry.time);
                return Number.isFinite(entryTime) && entryTime >= subscribedAt;
            });
            if (!latestError || 最近运行报错提示IDRef.current === latestError.id) return;
            const now = Date.now();
            if (now - 最近运行报错提示时间Ref.current < DIAGNOSTIC_ERROR_TOAST_COOLDOWN_MS) {
                最近运行报错提示IDRef.current = latestError.id;
                return;
            }
            最近运行报错提示IDRef.current = latestError.id;
            最近运行报错提示时间Ref.current = now;
            actions.pushNotification({
                title: '运行报错已记录',
                message: '可打开"设置 → 运行日志"查看详情、复制诊断或点击"上报日志"提交给维护人员。',
                tone: 'error'
            });
        });
        return unsubscribe;
    }, [actions]);
    React.useEffect(() => {
        const next = 清理并补货(读取拍卖行状态(auctionHouseScope, { 题材模式: state.开局配置?.题材模式 }), { 题材模式: state.开局配置?.题材模式 });
        setAuctionHouseState(next);
        保存拍卖行状态(next, auctionHouseScope);
    }, [auctionHouseScope, state.开局配置?.题材模式]);
    React.useEffect(() => {
        const handleAuctionLoaded = (event: Event) => {
            const detail = (event as CustomEvent<{ scope?: string; state?: 拍卖行状态 }>).detail;
            if (!detail?.state) return;
            setAuctionHouseState(detail.state);
        };
        window.addEventListener('moranjianghu:auction-house-loaded', handleAuctionLoaded);
        return () => window.removeEventListener('moranjianghu:auction-house-loaded', handleAuctionLoaded);
    }, []);
    const auctionBridgeHandledRef = React.useRef<Set<string>>(new Set());
    function handleMobileMenuAction(menu: string) {
        const isActive = activeMobileWindowId === menu;
        closeAllPanels();
        if (isActive) return;

        switch (menu) {
            case 'character':
                setShowCharacter(true);
                break;
            case 'equipment':
                setters.setShowEquipment(true);
                break;
            case 'battle':
                setters.setShowBattle(true);
                break;
            case 'inventory':
                setters.setShowInventory(true);
                break;
            case 'social':
                setters.setShowSocial(true);
                break;
            case 'kungfu':
                if (启用修炼体系) {
                    setters.setShowKungfu(true);
                }
                break;
            case 'skills':
                setters.setShowSkills(true);
                break;
            case 'world':
                setters.setShowWorld(true);
                break;
            case 'map':
                setters.setShowMap(true);
                break;
            case 'team':
                setters.setShowTeam(true);
                break;
            case 'sect':
                setters.setShowSect(true);
                break;
            case 'task':
                setters.setShowTask(true);
                break;
            case 'agreement':
                setters.setShowAgreement(true);
                break;
            case 'story':
                setters.setShowStory(true);
                break;
            case 'plan':
                setters.setShowHeroinePlan(true);
                break;
            case 'memory':
                setters.setShowMemory(true);
                break;
            case 'export_novel':
                setShowNovelExport(true);
                break;
            case 'auction_house':
                setShowAuctionHouse(true);
                break;
            case 'image_manager':
                void openImageManagerWithCheck();
                break;
            case 'novel_decomposition':
                void openNovelDecompositionWorkbench();
                break;
            case 'save':
                setters.setShowSaveLoad({ show: true, mode: 'save' });
                break;
            case 'load':
                setters.setShowSaveLoad({ show: true, mode: 'load' });
                break;
            case 'settings':
                setters.setActiveTab('game');
                setters.setShowSettings(true);
                break;
            case 'music':
                setShowMobileMusic(true);
                break;
            default:
                break;
        }
    }

    React.useEffect(() => {
        const shouldBuildSnapshot = state.showSettings
            && (state.activeTab === 'context' || state.activeTab === 'prompt');
        if (!shouldBuildSnapshot) {
            setContextSnapshot(undefined);
            return;
        }
        if (typeof window === 'undefined') {
            void actions.getContextSnapshot().then((snapshot) => {
                setContextSnapshot(snapshot);
            });
            return;
        }

        let cancelled = false;
        const idleWindow = window as typeof window & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        let idleId: number | null = null;
        let timerId: number | null = null;

        const buildSnapshot = async () => {
            if (cancelled) return;
            const nextSnapshot = await actions.getContextSnapshot();
            if (!cancelled) {
                setContextSnapshot(nextSnapshot);
            }
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleId = idleWindow.requestIdleCallback(() => buildSnapshot(), { timeout: 180 });
        } else {
            timerId = window.setTimeout(buildSnapshot, 0);
        }

        return () => {
            cancelled = true;
            if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
                idleWindow.cancelIdleCallback(idleId);
            }
            if (timerId !== null) {
                window.clearTimeout(timerId);
            }
        };
    }, [
        state.showSettings,
        state.activeTab,
        state.apiConfig,
        state.gameConfig,
        state.memoryConfig,
        state.prompts,
        state.历史记录,
        state.记忆系统,
        state.社交,
        state.角色,
        state.环境,
        state.世界,
        state.战斗,
        state.玩家门派,
        state.任务列表,
        state.约定列表,
        state.剧情,
        state.女主剧情规划,
        state.开局配置,
        meta.builtinPromptEntries,
        meta.worldbooks
    ]);
    React.useEffect(() => {
        const syncFullscreen = () => {
            const doc = document as Document & {
                webkitFullscreenElement?: Element;
                msFullscreenElement?: Element;
            };
            setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement));
        };

        syncFullscreen();
        document.addEventListener('fullscreenchange', syncFullscreen);
        return () => {
            document.removeEventListener('fullscreenchange', syncFullscreen);
        };
    }, []);

    React.useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const previousHtmlBackground = html.style.backgroundColor;
        const previousBodyBackground = body.style.backgroundColor;

        html.style.backgroundColor = '#0e0d0b';
        body.style.backgroundColor = '#0e0d0b';

        return () => {
            html.style.backgroundColor = previousHtmlBackground;
            body.style.backgroundColor = previousBodyBackground;
        };
    }, [runAppUpdateCheck]);
    React.useEffect(() => {
        if (!isNativeCapacitorEnvironment()) return;
        if (APK仅手动更新已启用(state.gameConfig)) return;

        let disposed = false;
        let listenerHandle: { remove: () => Promise<void> } | null = null;

        const runAutoUpdateCheck = async () => {
            const now = Date.now();
            if (now - lastUpdateCheckAtRef.current < 5 * 60 * 1000) return;
            lastUpdateCheckAtRef.current = now;
            await runAppUpdateCheck({ auto: true, silentNoUpdate: true });
        };

        void runAutoUpdateCheck();

        void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (!disposed && isActive) {
                void runAutoUpdateCheck();
            }
        }).then((handle) => {
            if (disposed) {
                void handle.remove();
                return;
            }
            listenerHandle = handle;
        });

        return () => {
            disposed = true;
            if (listenerHandle) {
                void listenerHandle.remove();
            }
        };
    }, [runAppUpdateCheck, state.gameConfig]);
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        if (APK仅手动更新已启用(state.gameConfig)) {
            setSuppressReleaseNotesForToday(false);
            return;
        }
        if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        let suppressedDate = '';

        try {
            suppressedDate = localStorage.getItem(RELEASE_NOTES_SUPPRESS_DATE_KEY) || '';
        } catch {
            suppressedDate = '';
        }

        const suppressedToday = suppressedDate === today;
        setSuppressReleaseNotesForToday(suppressedToday);

        if (state.view !== 'home') {
            return;
        }

        if (suppressedToday || releaseNotesAutoOpenedRef.current) {
            return;
        }

        releaseNotesAutoOpenedRef.current = true;
        setShowReleaseNotes(true);
    }, [state.view, state.gameConfig]);
    const confirmResolverRef = React.useRef<((value: boolean) => void) | null>(null);
    const 最近小说分解报错提示IDRef = React.useRef('');
    const [confirmState, setConfirmState] = React.useState<(ConfirmOptions & { open: boolean })>({
        open: false,
        title: '请确认',
        message: '',
        confirmText: '确认',
        cancelText: '取消',
        danger: false
    });

    const requestConfirm = React.useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            confirmResolverRef.current = resolve;
            setConfirmState({
                open: true,
                title: options.title || '请确认',
                message: options.message,
                confirmText: options.confirmText || '确认',
                cancelText: options.cancelText || '取消',
                danger: options.danger || false
            });
        });
    }, []);

    const resolveConfirm = React.useCallback((accepted: boolean) => {
        if (confirmResolverRef.current) {
            confirmResolverRef.current(accepted);
            confirmResolverRef.current = null;
        }
        setConfirmState((prev) => ({ ...prev, open: false }));
    }, []);

    React.useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const update = () => setViewportWidth(window.innerWidth);
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    React.useEffect(() => {
        const unsubscribe = 小说拆分后台调度服务.subscribe((schedulerState) => {
            const latestErrorLog = [...(schedulerState.recentLogs || [])]
                .reverse()
                .find((log) => log.level === 'error');
            if (!latestErrorLog) return;
            if (最近小说分解报错提示IDRef.current === latestErrorLog.id) return;
            最近小说分解报错提示IDRef.current = latestErrorLog.id;
            actions.pushNotification({
                title: '小说分解异常',
                message: latestErrorLog.text,
                tone: 'error'
            });
        });
        return unsubscribe;
    }, [actions]);

    React.useEffect(() => {
        if (state.view !== 'game' || typeof window === 'undefined') return;

        let cancelled = false;
        const connection = (
            navigator as Navigator & {
                connection?: 可选网络信息;
                mozConnection?: 可选网络信息;
                webkitConnection?: 可选网络信息;
            }
        ).connection
            || (navigator as Navigator & { mozConnection?: 可选网络信息 }).mozConnection
            || (navigator as Navigator & { webkitConnection?: 可选网络信息 }).webkitConnection
            || null;
        const preloadTargets = 网络较慢或节省流量(connection)
            ? []
            : (isMobile ? 移动端轻量预热目标 : 桌面轻量预热目标);
        const idleWindow = window as typeof window & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (id: number) => void;
        };

        let idleId: number | null = null;
        let timerId: number | null = null;

        const warmup = () => {
            if (cancelled || preloadTargets.length === 0) return;
            const priorityCount = isMobile ? 5 : 9;
            preloadTargets.forEach((target, index) => {
                const delay = index < priorityCount
                    ? 240 + index * 140
                    : 1800 + (index - priorityCount) * 320;
                window.setTimeout(() => {
                    if (cancelled) return;
                    void target.preload?.().catch((error) => {
                        if (isDynamicImportFetchError(error)) {
                            console.warn('Lazy module warmup skipped after version update:', target.importKey, error);
                            return;
                        }
                        console.warn('Lazy module warmup failed:', target.importKey, error);
                    });
                }, delay);
            });
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleId = idleWindow.requestIdleCallback(() => warmup(), { timeout: 900 });
        } else {
            timerId = window.setTimeout(warmup, 700);
        }

        return () => {
            cancelled = true;
            if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
                idleWindow.cancelIdleCallback(idleId);
            }
            if (timerId !== null) {
                window.clearTimeout(timerId);
            }
        };
    }, [isMobile, state.view]);

    const parseActionOptionText = (option: unknown): string => {
        if (typeof option === 'string') return option.trim();
        if (typeof option === 'number' || typeof option === 'boolean') return String(option);
        if (option && typeof option === 'object') {
            const obj = option as Record<string, unknown>;
            const candidates = [obj.text, obj.label, obj.action, obj.name, obj.id];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim().length > 0) {
                    return candidate.trim();
                }
            }
        }
        return '';
    };

    const tickerEvents = React.useMemo(() => {
        return 整理世界状态客户可见大事(state.世界, state.worldEvents);
    }, [state.世界, state.worldEvents]);

    const 启用同人模式 = React.useMemo(
        () => state.开局配置?.同人融合?.enabled === true && state.开局配置?.同人融合?.启用附加小说 === true,
        [state.开局配置]
    );
    const 启用修炼体系 = state.gameConfig?.启用修炼体系 !== false;
    const 当前剧情规划 = 启用同人模式 ? state.同人剧情规划 : state.剧情规划;
    const 当前女主剧情规划 = 启用同人模式 ? state.同人女主剧情规划 : state.女主剧情规划;

    const renderTickerItems = React.useCallback((items: string[], keyPrefix: string) => (
        items.map((e, i) => (
            <span key={`${keyPrefix}-${i}`} className="mx-5 inline-block">{e}</span>
        ))
    ), []);

    const currentEnvTime = React.useMemo(
        () => 环境时间转标准串(state.环境) || state.环境?.时间 || '未知时间',
        [state.环境]
    );
    const currentJourneyDayCount = React.useMemo(() => (
        计算游戏历程天数(
            解析标准游戏时间片段(currentEnvTime),
            解析标准游戏时间片段(state.游戏初始时间)
        )
    ), [currentEnvTime, state.游戏初始时间]);
    const effectiveVisualConfig = React.useMemo(() => {
        if (!isMobile || !state.visualConfig) return state.visualConfig;
        const mobileRenderLayers = Math.max(
            1,
            Math.min(8, Number(state.visualConfig.渲染层数) || 10)
        );

        return {
            ...state.visualConfig,
            ['字体大小']: 16,
            ['段落间距']: 1.6,
            ['渲染层数']: mobileRenderLayers,
            ['区域文字样式']: undefined,
            ['UI文字样式']: undefined
        } as typeof state.visualConfig;
    }, [isMobile, state.visualConfig]);
    const effectiveTopBarTimeFormat = React.useMemo<'传统' | '数字'>(() => {
        const configured = effectiveVisualConfig?.时间显示格式;
        if (configured === '传统' || configured === '数字') return configured;
        return 获取题材顶部时间显示格式(state.开局配置?.modeRuntimeProfile, state.开局配置?.题材模式);
    }, [effectiveVisualConfig?.时间显示格式, state.开局配置?.modeRuntimeProfile, state.开局配置?.题材模式]);
    use图片资源回源预取(state.角色, effectiveVisualConfig?.背景图片);
    const 当前背景图片地址 = React.useMemo(() => 获取图片资源文本地址(effectiveVisualConfig?.背景图片), [effectiveVisualConfig?.背景图片]);
    const 玩家头像地址 = React.useMemo(() => {
        const archive = state.角色?.图片档案;
        const selectedAvatarId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
        const selectedAvatar = (Array.isArray(archive?.生图历史) ? archive!.生图历史 : []).find((item: any) => item?.id === selectedAvatarId)
            || (archive?.最近生图结果?.id === selectedAvatarId ? archive.最近生图结果 : null);
        return 获取图片资源文本地址(selectedAvatar?.本地路径 || selectedAvatar?.图片URL || state.角色?.头像图片URL);
    }, [state.角色]);
    const 主角锚点 = React.useMemo(
        () => actions.getPlayerCharacterAnchor?.() || null,
        [actions, state.apiConfig]
    );
    const playerProfile = React.useMemo(
        () => ({
            姓名: state.角色?.姓名,
            头像图片URL: 玩家头像地址,
            天赋列表: Array.isArray(state.角色?.天赋列表) ? state.角色.天赋列表 : [],
            出身背景: state.角色?.出身背景
        }),
        [state.角色?.姓名, 玩家头像地址, state.角色?.天赋列表, state.角色?.出身背景]
    );
    const fontFaceStyleText = React.useMemo(() => 构建字体注入样式文本(effectiveVisualConfig), [effectiveVisualConfig]);
    const uiTextStyleVars = React.useMemo(() => 构建UI文字CSS变量(effectiveVisualConfig), [effectiveVisualConfig]);
    const appUiStyleVars = React.useMemo(() => {
        const runtimeSafeAreaVars = {
            ['--app-safe-top' as any]: isMobile && isFullscreen ? '0px' : 'env(safe-area-inset-top, 0px)',
            ['--app-safe-bottom' as any]: isMobile && isFullscreen ? '0px' : 'env(safe-area-inset-bottom, 0px)'
        };
        if (!isMobile) return { ...uiTextStyleVars, ...runtimeSafeAreaVars };
        return {
            ...uiTextStyleVars,
            ...runtimeSafeAreaVars,
            ['--ui-正文-font-size' as any]: '14px',
            ['--ui-辅助文本-font-size' as any]: '12px',
            ['--ui-按钮-font-size' as any]: '13px',
            ['--ui-标签-font-size' as any]: '11px',
            ['--ui-数字-font-size' as any]: '13px',
            ['--ui-等宽信息-font-size' as any]: '12px',
            ['--ui-compact-font-size' as any]: '14px',
            ['--ui-micro-font-size' as any]: '12px',
            ['--ui-compact-button-font-size' as any]: '13px',
            ['--ui-compact-mono-font-size' as any]: '12px'
        };
    }, [isFullscreen, isMobile, uiTextStyleVars]);
    const hideBottomTicker = effectiveVisualConfig?.底部滚动关闭显示 === true;
    const runtimeStateSections = React.useMemo(() => ({
        角色: state.角色,
        环境: state.环境,
        社交: state.社交,
        世界: state.世界,
        战斗: state.战斗,
        剧情: state.剧情,
        剧情规划: state.剧情规划,
        女主剧情规划: state.女主剧情规划,
        玩家门派: state.玩家门派,
        任务列表: state.任务列表,
        约定列表: state.约定列表,
        记忆系统: state.记忆系统
    }), [state.角色, state.环境, state.社交, state.世界, state.战斗, state.剧情, state.剧情规划, state.女主剧情规划, state.玩家门派, state.任务列表, state.约定列表, state.记忆系统]);

    const latestAssistantMessage = React.useMemo(
        () => [...state.历史记录]
            .reverse()
            .find((item) => item?.role === 'assistant' && item?.structuredResponse),
        [state.历史记录]
    );
    const currentOptions = React.useMemo(
        () => (latestAssistantMessage?.role === 'assistant' && Array.isArray(latestAssistantMessage.structuredResponse?.action_options))
            ? latestAssistantMessage.structuredResponse.action_options
                .map(parseActionOptionText)
                .filter(item => item.length > 0)
            : [],
        [latestAssistantMessage]
    );
    const latestChangedSections = React.useMemo(() => {
        const structuredResponse = latestAssistantMessage?.structuredResponse;
        const areas = new Set<本回合变化区域>(提取本回合变化区域(structuredResponse?.tavern_commands || []));
        if (
            structuredResponse?.planning_analysis_updated === true
            || (Array.isArray(structuredResponse?.planning_analysis_commands) && structuredResponse.planning_analysis_commands.length > 0)
        ) {
            areas.add('剧情规划');
        }
        if (!Array.isArray(state.约定列表) || state.约定列表.length === 0) {
            areas.delete('约定列表');
        }
        if (!Array.isArray(state.角色?.功法列表) || state.角色.功法列表.length === 0) {
            areas.delete('功法');
        }
        if (!Array.isArray(state.任务列表) || state.任务列表.length === 0) {
            areas.delete('任务列表');
        }
        return Array.from(areas);
    }, [latestAssistantMessage, state.约定列表]);
    const itemImageSequence = React.useMemo(() => {
        const bagRecords = (Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : []).flatMap((item: any) => {
            const history = Array.isArray(item?.图片档案?.生图历史) ? item.图片档案.生图历史 : [];
            return history.map((record: any, index: number) => ({
                ...record,
                id: `${item?.ID || item?.名称 || 'item'}_${record?.id || record?.生成时间 || index}`,
                原记录ID: record?.id,
                物品名称: item?.名称 || '未命名物品',
                物品类型: item?.类型,
                物品品质: item?.品质,
                生成时间: record?.生成时间,
                状态: record?.状态 || 'success',
                构图: record?.构图,
                来源位置: '背包' as const,
                错误信息: typeof record?.错误信息 === 'string' ? record.错误信息.trim() : '',
                调试链路: Array.isArray(record?.调试链路) ? record.调试链路 : undefined,
                图片URL: record?.图片URL,
                本地路径: record?.本地路径,
                最终正向提示词: record?.最终正向提示词,
                最终负向提示词: record?.最终负向提示词
            }));
        });
        const auctionRecords = (Array.isArray(auctionHouseState?.拍卖品列表) ? auctionHouseState.拍卖品列表 : []).flatMap((entry: any) => {
            const item = entry?.物品;
            const history = Array.isArray(item?.图片档案?.生图历史) ? item.图片档案.生图历史 : [];
            return history.map((record: any, index: number) => ({
                ...record,
                id: `auction_${entry?.ID || 'item'}_${record?.id || record?.生成时间 || index}`,
                原记录ID: record?.id,
                物品名称: item?.名称 || '未命名物品',
                物品类型: item?.类型,
                物品品质: item?.品质,
                生成时间: record?.生成时间,
                状态: record?.状态 || 'success',
                构图: record?.构图,
                来源位置: '拍卖行' as const,
                错误信息: typeof record?.错误信息 === 'string' ? record.错误信息.trim() : '',
                调试链路: Array.isArray(record?.调试链路) ? record.调试链路 : undefined,
                图片URL: record?.图片URL,
                本地路径: record?.本地路径,
                最终正向提示词: record?.最终正向提示词,
                最终负向提示词: record?.最终负向提示词
            }));
        });
        return [...bagRecords, ...auctionRecords];
    }, [state.角色?.物品列表, auctionHouseState?.拍卖品列表]);
    const latestBattleContextText = React.useMemo(() => {
        const response = latestAssistantMessage?.structuredResponse;
        if (!response) return '';
        return [
            Array.isArray(response.logs) ? response.logs.map((log) => `${log?.sender || '旁白'}：${log?.text || ''}`).join('\n') : '',
            response.t_state || '',
            response.t_branch || '',
            Array.isArray(response.dynamic_world) ? response.dynamic_world.join('\n') : '',
        ].filter(Boolean).join('\n').slice(0, 1200);
    }, [latestAssistantMessage]);
    React.useEffect(() => {
        if (!latestAssistantMessage?.structuredResponse) return;
        const signature = `${latestAssistantMessage.timestamp || 0}-${latestAssistantMessage.gameTime || ''}`;
        if (auctionSettlementHandledRef.current.has(signature)) return;
        auctionSettlementHandledRef.current.add(signature);
        setAuctionHouseState((prev) => {
            const settled = 结算玩家寄售(prev, state.角色, latestAssistantMessage.timestamp || Date.now(), auctionCurrencyOptions);
            if (!settled.settledCount) return prev;
            保存拍卖行状态(settled.nextState, auctionHouseScope);
            setters.setCharacter(settled.nextCharacter);
            void actions.performAutoSave?.({ role: settled.nextCharacter, force: true });
            actions.pushNotification({ title: '寄售成交', message: settled.message, tone: 'success' });
            return settled.nextState;
        });
    }, [actions, auctionCurrencyOptions, auctionHouseScope, latestAssistantMessage, setters, state.角色]);
    // [已移除] 拍卖行物品不再从主角剧情正文中提取，改为从世界势力互动事件中自然流出。
    // 旧逻辑：从剧情响应构建拍卖行投放参数列表 → 投放事件拍卖品
    // 新逻辑：世界演化 → 势力互动 → 世界.拍卖行待投放物品 → 从势力互动投放拍卖品

    // 从世界势力互动中投放物品到拍卖行
    const factionAuctionHandledRef = React.useRef<number>(0);
    React.useEffect(() => {
        const pendingItems = Array.isArray(state.世界?.拍卖行待投放物品) ? state.世界.拍卖行待投放物品 : [];
        if (pendingItems.length === 0) return;
        // 用长度+首项名称作为去重签名，避免重复投放
        const signature = `${pendingItems.length}_${pendingItems[0]?.名称 || ''}`;
        const signatureHash = signature.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
        if (factionAuctionHandledRef.current === signatureHash) return;
        factionAuctionHandledRef.current = signatureHash;
        // 投放到拍卖行
        setAuctionHouseState((prev) => {
            const next = 从势力互动投放拍卖品(prev, pendingItems, { scope: auctionHouseScope, 题材模式: state.开局配置?.题材模式 });
            return next;
        });
        console.info('[拍卖行桥接] 已从势力互动投放', pendingItems.length, '件物品');
    }, [state.世界?.拍卖行待投放物品, auctionHouseScope, state.开局配置?.题材模式]);

    const auctionRollHandledRef = React.useRef<string>('');
    React.useEffect(() => {
        if (state.view !== 'game' || latestAssistantMessage?.role !== 'assistant') return;
        const signature = `${latestAssistantMessage.timestamp || 0}_${latestAssistantMessage.gameTime || ''}`;
        if (!signature.trim() || auctionRollHandledRef.current === signature) return;
        auctionRollHandledRef.current = signature;
        setAuctionHouseState((prev) => {
            const activeCount = (prev.拍卖品列表 || []).filter((entry) => entry.状态 === '上架中').length;
            const shouldRoll = activeCount < 4 || Math.random() < 0.55;
            if (!shouldRoll) return prev;
            const next = 清理并补货(prev, {
                允许系统补货: true,
                最大系统补货数量: activeCount < 4 ? 2 : 1,
                目标在售数量: 12,
                题材模式: state.开局配置?.题材模式
            });
            if (next === prev || next.拍卖品列表 === prev.拍卖品列表) return prev;
            保存拍卖行状态(next, auctionHouseScope);
            return next;
        });
    }, [auctionHouseScope, latestAssistantMessage, state.view, state.开局配置?.题材模式]);

    React.useEffect(() => {
        const feature = state.apiConfig?.功能模型占位;
        if (state.view !== 'game' || !feature?.文生图功能启用 || !feature?.物品生图启用) return;
        const imageApi = 获取文生图接口配置(state.apiConfig);
        if (!接口配置是否可用(imageApi)) return;
        // 限制物品生图并发数量，避免一次性提交所有任务
        const MAX_CONCURRENT_ITEM_IMAGE_TASKS = 1;
        if (autoItemImageRunningRef.current.size >= MAX_CONCURRENT_ITEM_IMAGE_TASKS) return;

        const now = Date.now();
        if (autoItemImageBackendCooldownUntilRef.current > now) {
            唤醒物品自动生图扫描(autoItemImageBackendCooldownUntilRef.current - now + 250);
            return;
        }
        autoItemImageRecentSuccessRef.current.forEach((value, key) => {
            if (now - value.completedAt > ITEM_AUTO_IMAGE_RECENT_SUCCESS_TTL) {
                autoItemImageRecentSuccessRef.current.delete(key);
            }
        });

        const bagItems = Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : [];
        const candidates: Array<{
            key: string;
            item: 游戏物品;
            sourceLocation: '背包' | '拍卖行';
            auctionId?: string;
        }> = [];

        bagItems.forEach((item: 游戏物品) => {
            if (!item) return;
            if (物品已有可用图标(item)) return;
            candidates.push({
                key: 获取物品自动生图Key('bag', item),
                item,
                sourceLocation: '背包'
            });
        });
        const auctionItems = Array.isArray(auctionHouseState?.拍卖品列表) ? auctionHouseState.拍卖品列表 : [];
        auctionItems.forEach((entry: any) => {
            const item = entry?.物品 as 游戏物品 | undefined;
            if (!item || entry?.状态 !== '上架中') return;
            if (物品已有可用图标(item)) return;
            candidates.push({
                key: 获取物品自动生图Key('auction', item),
                item,
                sourceLocation: '拍卖行',
                auctionId: entry?.ID
            });
        });

        const candidate = candidates.find((entry) => {
            if (autoItemImageScheduledRef.current.has(entry.key)) return false;
            if (autoItemImageRunningRef.current.has(entry.key)) return false;
            const failedAt = autoItemImageFailedAtRef.current.get(entry.key) || 0;
            return now - failedAt > ITEM_AUTO_IMAGE_RETRY_INTERVAL;
        });
        if (!candidate) {
            const retryDelays = candidates
                .map((entry) => {
                    const failedAt = autoItemImageFailedAtRef.current.get(entry.key) || 0;
                    return failedAt ? (failedAt + ITEM_AUTO_IMAGE_RETRY_INTERVAL) - now : 0;
                })
                .filter((delay) => delay > 0);
            if (retryDelays.length > 0) {
                唤醒物品自动生图扫描(Math.min(...retryDelays) + 250);
            }
            return;
        }

        autoItemImageScheduledRef.current.add(candidate.key);
        let cancelled = false;
        const 写回候选物品 = (nextItem: 游戏物品, shouldSave: boolean) => {
            if (candidate.sourceLocation === '背包') {
                const latestCharacter = latestCharacterRef.current as any;
                const latestBagItems = Array.isArray(latestCharacter?.物品列表) ? latestCharacter.物品列表 : [];
                const nextItems = latestBagItems.map((item: 游戏物品) => {
                    if (是同一个物品(item, candidate.item)) return nextItem;
                    if (物品已有可用图标(item)) return item;
                    return 是同类物品图标复用目标(item, candidate.item)
                        ? 复用物品图片档案(item, nextItem)
                        : item;
                });
                const changed = nextItems.some((item: 游戏物品, index: number) => item !== latestBagItems[index]);
                if (changed) {
                    const nextCharacter = { ...(latestCharacter || state.角色), 物品列表: nextItems };
                    setters.setCharacter(nextCharacter);
                    if (shouldSave) {
                        void actions.performAutoSave?.({ role: nextCharacter, force: true });
                    }
                }
                return;
            }
            if (candidate.sourceLocation === '拍卖行' && candidate.auctionId) {
                setAuctionHouseState((prev) => {
                    const list = Array.isArray(prev?.拍卖品列表) ? prev.拍卖品列表 : [];
                    const nextList = list.map((entry: any) => {
                        if (entry?.ID === candidate.auctionId) return { ...entry, 物品: nextItem };
                        const item = entry?.物品;
                        if (!item || 物品已有可用图标(item)) return entry;
                        return 是同类物品图标复用目标(item, candidate.item)
                            ? { ...entry, 物品: 复用物品图片档案(item, nextItem) }
                            : entry;
                    });
                    const changed = nextList.some((entry: any, index: number) => entry !== list[index]);
                    if (!changed) return prev;
                    const nextState = { ...prev, 拍卖品列表: nextList };
                    if (shouldSave) 保存拍卖行状态(nextState, auctionHouseScope);
                    return nextState;
                });
            }
        };

        const idleTimer = window.setTimeout(() => {
            if (cancelled) return;
            const startedAt = Date.now();
            autoItemImageScheduledRef.current.delete(candidate.key);
            if (autoItemImageRunningRef.current.size >= MAX_CONCURRENT_ITEM_IMAGE_TASKS) return;
            if (autoItemImageRunningRef.current.has(candidate.key)) return;
            const recentSuccess = autoItemImageRecentSuccessRef.current.get(candidate.key);
            if (recentSuccess && startedAt - recentSuccess.completedAt <= ITEM_AUTO_IMAGE_RECENT_SUCCESS_TTL) {
                const recentHasImage = 物品已有可用图标(recentSuccess.nextItem);
                if (recentHasImage) {
                    recordDiagnosticLog('info', '[物品自动生图] 复用近期生成结果，跳过重复提交', {
                        key: candidate.key,
                        recordId: recentSuccess.recordId,
                        sourceLocation: candidate.sourceLocation,
                        itemName: candidate.item?.名称 || '无名物品',
                        ageMs: startedAt - recentSuccess.completedAt
                    });
                    写回候选物品(复用物品图片档案(candidate.item, recentSuccess.nextItem), true);
                    return;
                }
                autoItemImageRecentSuccessRef.current.delete(candidate.key);
                recordDiagnosticLog('warn', '[物品自动生图] 近期结果无可用图片，清除缓存并重新生成', {
                    key: candidate.key,
                    recordId: recentSuccess.recordId
                });
            }

        const recordId = `item_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const modelName = imageApi.model || imageApi.图片后端类型 || 'image-model';
        const 画风 = (feature?.自动物品生图画风 || '写实') as 物品生图结果['画风'];
        const 渲染风格 = (feature?.自动物品生图渲染风格 || '写实道具') as 物品生图结果['渲染风格'];
        const 尺寸 = (typeof feature?.自动物品生图分辨率 === 'string' && feature.自动物品生图分辨率.trim()) || '1024x1024';
        const 读取错误调试链路 = (error: any) => (
            Array.isArray(error?.生图调试链路) ? error.生图调试链路 : undefined
        );
        const 写回物品生图记录 = (status: 物品生图结果['状态'], errorMessage?: string, debugTrace?: 物品生图结果['调试链路']) => {
            const record: 物品生图结果 = {
                id: recordId,
                图片URL: undefined,
                本地路径: undefined,
                生图词组: '',
                原始描述: JSON.stringify(candidate.item ?? {}, null, 2),
                使用模型: modelName,
                生成时间: Date.now(),
                构图: '物品图标',
                画风,
                渲染风格,
                尺寸,
                状态: status,
                错误信息: errorMessage,
                来源: 'generated',
                调试链路: debugTrace
            };
            const nextArchive = 合并物品图片档案(candidate.item, record);
            recordDiagnosticLog(status === 'failed' ? 'warn' : 'info', '[物品自动生图] 写回占位/失败记录', {
                recordId,
                status,
                sourceLocation: candidate.sourceLocation,
                itemName: candidate.item?.名称 || '无名物品',
                historyCount: Array.isArray(nextArchive?.生图历史) ? nextArchive.生图历史.length : 0,
                recentId: nextArchive?.最近生图结果?.id || '',
                hasError: Boolean(errorMessage),
                errorMessage: errorMessage || '',
                debugTraceCount: Array.isArray(debugTrace) ? debugTrace.length : 0
            });
            写回候选物品({
                ...(candidate.item as any),
                图片档案: nextArchive
            }, status === 'failed');
        };

        autoItemImageRunningRef.current.add(candidate.key);
        recordDiagnosticLog('info', '[物品自动生图] 开始生成', {
            key: candidate.key,
            recordId,
            sourceLocation: candidate.sourceLocation,
            itemName: candidate.item?.名称 || '无名物品',
            candidateCount: candidates.length,
            runningCount: autoItemImageRunningRef.current.size
        });
        写回物品生图记录('pending');
        actions.pushNotification({
            title: '物品自动生图',
            message: `正在为「${candidate.item?.名称 || '无名物品'}」生成写实图标。`,
            tone: 'info'
        });
        void (async () => {
            try {
                const result = await 执行生图模型调用带重试(
                    () => 生成物品图标(candidate.item, state.apiConfig, {
                        source: 'auto',
                        sourceLocation: candidate.sourceLocation,
                        imageApi,
                        recordId
                    }),
                    {
                        onAttempt: (attempt, totalAttempts) => {
                            if (attempt > 1) {
                                写回物品生图记录('pending', `正在自动重试物品生图（第 ${attempt}/${totalAttempts} 次尝试）。`);
                            }
                        },
                        onRetry: (attempt, totalAttempts, errorMessage) => {
                            写回物品生图记录('pending', `第 ${attempt}/${totalAttempts} 次生成失败：${errorMessage}；正在自动重试。`);
                        }
                    }
                );
                const successHistory = Array.isArray(result.nextItem?.图片档案?.生图历史)
                    ? result.nextItem.图片档案.生图历史
                    : [];
                写回候选物品(result.nextItem, true);
                const verifyArchive = result.nextItem?.图片档案;
                const verifyRecent = verifyArchive?.最近生图结果;
                const verifySelected = 获取物品已选图标地址(result.nextItem);
                recordDiagnosticLog('info', '[物品自动生图] 成功结果写回候选物品', {
                    recordId,
                    resultRecordId: result.imageRecord?.id || '',
                    sourceLocation: candidate.sourceLocation,
                    itemName: result.nextItem?.名称 || candidate.item?.名称 || '无名物品',
                    historyCount: successHistory.length,
                    recentId: verifyRecent?.id || '',
                    hasImageUrl: Boolean(result.imageRecord?.图片URL),
                    hasLocalPath: Boolean(result.imageRecord?.本地路径),
                    imageUrlPrefix: typeof result.imageRecord?.图片URL === 'string' ? result.imageRecord.图片URL.slice(0, 60) : '',
                    localPathPrefix: typeof result.imageRecord?.本地路径 === 'string' ? result.imageRecord.本地路径.slice(0, 60) : '',
                    verifySelectedUrl: verifySelected || '(empty)',
                    verifyRecentHasUrl: Boolean(verifyRecent?.图片URL),
                    verifyRecentHasPath: Boolean(verifyRecent?.本地路径)
                });
                autoItemImageRecentSuccessRef.current.set(candidate.key, {
                    completedAt: Date.now(),
                    recordId,
                    nextItem: result.nextItem
                });
                autoItemImageFailedAtRef.current.delete(candidate.key);
                actions.pushNotification({
                    title: '物品图标已生成',
                    message: `「${result.nextItem?.名称 || candidate.item?.名称 || '无名物品'}」图标已自动写入。`,
                    tone: 'success'
                });
                console.info('[物品自动生图] 已生成物品图标', candidate.sourceLocation, result.nextItem?.名称 || candidate.item?.名称);
            } catch (error) {
                const errorMessage = 读取生图错误文本(error, '物品自动生图失败');
                写回物品生图记录('failed', errorMessage, 读取错误调试链路(error));
                autoItemImageFailedAtRef.current.set(candidate.key, Date.now());
                console.warn('[物品自动生图] 生成失败', candidate.sourceLocation, candidate.item?.名称, error);
                if (是生图后端不可用错误文本(errorMessage)) {
                    autoItemImageBackendCooldownUntilRef.current = Date.now() + ITEM_AUTO_IMAGE_BACKEND_FAILURE_COOLDOWN_MS;
                    recordDiagnosticLog('warn', '[物品自动生图] 当前 ComfyUI 后端不可用，已暂停自动提交以等待后端恢复', {
                        cooldownMs: ITEM_AUTO_IMAGE_BACKEND_FAILURE_COOLDOWN_MS,
                        sourceLocation: candidate.sourceLocation,
                        itemName: candidate.item?.名称 || '无名物品',
                        errorMessage
                    });
                }
                actions.pushNotification({
                    title: '物品图标生成失败',
                    message: 是生图后端不可用错误文本(errorMessage)
                        ? '当前 ComfyUI 后端不可用，已暂停自动提交，稍后会自动重试。'
                        : `「${candidate.item?.名称 || '无名物品'}」已自动重试 ${生图最大自动重试次数} 次，仍未成功。`,
                    tone: 'error'
                });
            } finally {
                autoItemImageRunningRef.current.delete(candidate.key);
                唤醒物品自动生图扫描(250);
            }
        })();
        }, ITEM_AUTO_IMAGE_AFTER_CHARACTER_SCENE_IDLE_DELAY);
        return () => {
            cancelled = true;
            autoItemImageScheduledRef.current.delete(candidate.key);
            window.clearTimeout(idleTimer);
        };
    }, [state.view, state.apiConfig, state.角色, setters, actions, auctionHouseState, auctionHouseScope, autoItemImageWakeTick, 唤醒物品自动生图扫描]);

    const 题材界面文案 = React.useMemo(
        () => 获取题材界面文案(state.开局配置?.题材模式, state.开局配置?.modeRuntimeProfile),
        [state.开局配置?.题材模式, state.开局配置?.modeRuntimeProfile]
    );
    const 当前题材市场名称 = 题材界面文案.菜单.auctionHouse;
    const 组织入口显示名称 = 题材界面文案.组织.组织入口;
    const 功法显示名称 = 题材界面文案.菜单.kungfu;
    const activeMobileWindow =
        showCharacter ? 题材界面文案.菜单.character :
        state.showBattle ? 题材界面文案.菜单.battle :
        state.showEquipment ? 题材界面文案.菜单.equipment :
        state.showInventory ? 题材界面文案.菜单.inventory :
        state.showSocial ? 题材界面文案.菜单.social :
        (启用修炼体系 && state.showKungfu) ? 功法显示名称 :
        state.showSkills ? 题材界面文案.菜单.skills :
        state.showWorld ? 题材界面文案.菜单.world :
        state.showMap ? 题材界面文案.菜单.map :
        state.showTeam ? 题材界面文案.菜单.team :
        state.showSect ? 组织入口显示名称 :
        state.showTask ? 题材界面文案.菜单.task :
        state.showAgreement ? 题材界面文案.菜单.agreement :
        state.showStory ? 题材界面文案.菜单.story :
        state.showHeroinePlan ? 题材界面文案.菜单.plan :
        state.showMemory ? 题材界面文案.菜单.memory :
        showNovelExport ? '导出小说' :
        showAuctionHouse ? 当前题材市场名称 :
        showCloudPlay ? '云端游玩' :
        showImageManager ? '图册' :
        showNovelDecompositionWorkbench ? '小说分解' :
        safeShowSaveLoad.show ? (safeShowSaveLoad.mode === 'save' ? '保存' : '读取') :
        state.showSettings ? '设置' :
        showMobileMusic ? '音乐' :
        null;

    const activeMobileWindowId =
        showCharacter ? 'character' :
        state.showBattle ? 'battle' :
        state.showEquipment ? 'equipment' :
        state.showInventory ? 'inventory' :
        state.showSocial ? 'social' :
        (启用修炼体系 && state.showKungfu) ? 'kungfu' :
        state.showSkills ? 'skills' :
        state.showWorld ? 'world' :
        state.showMap ? 'map' :
        state.showTeam ? 'team' :
        state.showSect ? 'sect' :
        state.showTask ? 'task' :
        state.showAgreement ? 'agreement' :
        state.showStory ? 'story' :
        state.showHeroinePlan ? 'plan' :
        state.showMemory ? 'memory' :
        showNovelExport ? 'export_novel' :
        showAuctionHouse ? 'auction_house' :
        showCloudPlay ? 'cloud_play' :
        showImageManager ? 'image_manager' :
        showNovelDecompositionWorkbench ? 'novel_decomposition' :
        safeShowSaveLoad.show ? (safeShowSaveLoad.mode === 'save' ? 'save' : 'load') :
        state.showSettings ? 'settings' :
        showMobileMusic ? 'music' :
        null;

    const desktopRightDetailPanelOpen = state.view === 'game' && !isMobile && (
        showCharacter
        || state.showBattle
        || state.showEquipment
        || state.showInventory
        || state.showSocial
        || state.showTeam
        || (启用修炼体系 && state.showKungfu)
        || state.showSkills
        || state.showWorld
        || state.showMap
        || state.showSect
        || state.showTask
        || state.showAgreement
        || state.showStory
        || state.showHeroinePlan
        || state.showMemory
        || showNovelExport
        || showAuctionHouse
        || showCloudPlay
        || showImageManager
        || showNovelDecompositionWorkbench
        || safeShowSaveLoad.show
        || state.showSettings
    );
    const desktopRightDetailId = activeMobileWindowId || 'detail';
    const desktopRightDetailClass = state.view === 'game' && !isMobile
        ? `desktop-right-detail-modal desktop-right-detail-modal--${desktopRightDetailId}${desktopDetailFullscreen ? ' desktop-right-detail-modal--fullscreen' : ''}`
        : undefined;
    const currentCloudPlayMode = 读取云端游玩存储模式();
    const playModeLabel = currentCloudPlayMode === 'object'
        ? '云端游玩：对象存储'
        : currentCloudPlayMode === 'tg'
            ? '云端游玩：TG图床'
            : '本地游玩';
    const playModeHint = currentCloudPlayMode
        ? '当前进度会先保存到本地，再后台同步到云端'
        : '当前进度仅保存到本地';
    const mainStoryApiInfo = React.useMemo(() => {
        const config = 获取主剧情接口配置(state.apiConfig);
        return {
            channelName: String(config?.名称 || config?.供应商 || '未配置渠道').trim(),
            modelName: String(config?.model || '未选择模型').trim()
        };
    }, [state.apiConfig]);
    const mainStoryApiLabel = `主剧情：${mainStoryApiInfo.channelName} / ${mainStoryApiInfo.modelName}`;
    const 尝试返回首页云端同步 = React.useCallback(async (returnHomeSave: Awaited<ReturnType<typeof actions.performAutoSave>>) => {
        const syncTask = (async () => {
            await 等待云端后台同步完成();
            if (returnHomeSave) {
                await 确保本地存档已同步到云端(returnHomeSave);
                return;
            }
            await 确保最新本地存档已同步到云端();
        })();
        let timeoutId: number | null = null;
        try {
            await Promise.race([
                syncTask,
                new Promise<never>((_, reject) => {
                    timeoutId = window.setTimeout(() => reject(new Error('云端同步等待超过 15 秒，已改为后台继续同步。')), 15000);
                })
            ]);
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
        }
    }, [actions]);
    const desktopRightDetailWidth = React.useMemo(() => clampDesktopDetailWidth(
        desktopDetailWidths[desktopRightDetailId] ?? getDesktopDetailDefaultWidth(desktopRightDetailId)
    ), [desktopDetailWidths, desktopRightDetailId, viewportWidth]);
    const appRootStyleVars = React.useMemo(() => ({
        ...appUiStyleVars,
        ['--desktop-right-detail-width' as any]: `${desktopRightDetailWidth}px`
    }), [appUiStyleVars, desktopRightDetailWidth]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(DESKTOP_DETAIL_WIDTHS_STORAGE_KEY, JSON.stringify(desktopDetailWidths));
    }, [desktopDetailWidths]);

    const resetDesktopDetailWidth = React.useCallback(() => {
        setDesktopDetailWidths(prev => {
            const next = { ...prev };
            delete next[desktopRightDetailId];
            return next;
        });
    }, [desktopRightDetailId]);

    const startDesktopDetailResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (desktopDetailFullscreen) return;
        event.preventDefault();
        const panelId = desktopRightDetailId;
        const updateWidth = (clientX: number) => {
            const nextWidth = clampDesktopDetailWidth(window.innerWidth - clientX - DESKTOP_DETAIL_RIGHT_GAP);
            setDesktopDetailWidths(prev => ({ ...prev, [panelId]: nextWidth }));
        };
        updateWidth(event.clientX);
        const handlePointerMove = (moveEvent: PointerEvent) => updateWidth(moveEvent.clientX);
        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            document.body.classList.remove('desktop-detail-resizing');
        };
        document.body.classList.add('desktop-detail-resizing');
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp, { once: true });
    }, [desktopDetailFullscreen, desktopRightDetailId]);

    const closeAllPanels = React.useCallback(() => {
        setDesktopDetailFullscreen(false);
        setShowCharacter(false);
        setters.setShowBattle(false);
        setters.setShowInventory(false);
        setters.setShowEquipment(false);
        setters.setShowTeam(false);
        setters.setShowSocial(false);
        setters.setShowKungfu(false);
        setters.setShowSkills(false);
        setters.setShowWorld(false);
        setters.setShowMap(false);
        setters.setShowSect(false);
        setters.setShowTask(false);
        setters.setShowAgreement(false);
        setters.setShowStory(false);
        setters.setShowHeroinePlan(false);
        setters.setShowMemory(false);
        setShowNovelExport(false);
        setShowAuctionHouse(false);
        setShowCloudPlay(false);
        setShowImageManager(false);
        setShowNovelDecompositionWorkbench(false);
        setters.setShowSaveLoad({ show: false, mode: 'save' });
        setters.setShowSettings(false);
        setShowMobileMusic(false);
    }, [setters]);

    React.useEffect(() => {
        if (state.view === 'game') return;
        setDesktopDetailFullscreen(false);
        document.body.classList.remove('desktop-detail-resizing');
    }, [state.view]);

    const collapseDesktopDetailToInitial = React.useCallback(() => {
        setDesktopDetailFullscreen(false);
        closeAllPanels();
    }, [closeAllPanels]);

    const exitDesktopDetailFullscreen = React.useCallback(() => {
        setDesktopDetailFullscreen(false);
        resetDesktopDetailWidth();
    }, [resetDesktopDetailWidth]);

    const openCharacter = React.useCallback(() => {
        closeAllPanels();
        setShowCharacter(true);
    }, [closeAllPanels]);
    const openSettings = React.useCallback(() => {
        closeAllPanels();
        setters.setShowSettings(true);
    }, [closeAllPanels, setters]);
    const openVariableManager = React.useCallback(() => {
        closeAllPanels();
        setters.setActiveTab('variable_manager');
        setters.setShowSettings(true);
    }, [closeAllPanels, setters]);
    const openInventory = React.useCallback(() => {
        setInventoryInitialItemRef('');
        closeAllPanels();
        setters.setShowInventory(true);
    }, [closeAllPanels, setters]);
    const openInventoryItemFromChat = React.useCallback((itemRef: string) => {
        const normalizedRef = typeof itemRef === 'string' ? itemRef.trim() : '';
        if (!normalizedRef) return;
        closeAllPanels();
        setInventoryInitialItemRef(normalizedRef);
        setters.setShowInventory(true);
    }, [closeAllPanels, setters]);
    const openEquipment = React.useCallback(() => {
        closeAllPanels();
        setters.setShowEquipment(true);
    }, [closeAllPanels, setters]);
    const openBattle = React.useCallback(() => {
        closeAllPanels();
        setters.setShowBattle(true);
    }, [closeAllPanels, setters]);
    const openTeam = React.useCallback(() => {
        closeAllPanels();
        setters.setShowTeam(true);
    }, [closeAllPanels, setters]);
    const openSocial = React.useCallback(() => {
        closeAllPanels();
        setters.setShowSocial(true);
    }, [closeAllPanels, setters]);
    const openNpcDetailFromChat = React.useCallback((npcId: string) => {
        if (!npcId) return;
        closeAllPanels();
        if (npcId === '__player__') {
            setShowCharacter(true);
            return;
        }
        setSelectedSocialNpcId(npcId);
        setters.setShowSocial(true);
    }, [closeAllPanels, setters]);
    const openNpcDetailFromRecord = React.useCallback((record: any) => {
        // 主角兜底：如果 record 是主角成员记录，走主角面板而非社交列表
        if (record?.是否玩家本人 === true || String(record?.id || '').includes('sect_member_player_')) {
            closeAllPanels();
            setShowCharacter(true);
            return;
        }
        const candidateTexts = [
            record?.id,
            record?.ID,
            record?.关联NPC,
            record?.关联人物,
            record?.姓名,
            record?.名称,
        ].map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
        if (candidateTexts.length === 0) return;
        const normalized = (value: string) => value.replace(/\s+/g, '').toLowerCase();
        const npc = (Array.isArray(state.社交) ? state.社交 : []).find((item: any) => {
            const npcTexts = [item?.id, item?.ID, item?.姓名, item?.名称]
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean);
            return candidateTexts.some((candidate) => npcTexts.some((npcText) => (
                normalized(candidate) === normalized(npcText)
                || normalized(candidate).includes(normalized(npcText))
                || normalized(npcText).includes(normalized(candidate))
            )));
        });
        closeAllPanels();
        setSelectedSocialNpcId(npc?.id || null);
        setters.setShowSocial(true);
        if (!npc) {
            actions.pushNotification?.({
                title: '已打开角色列表',
                message: '未在同门名录里找到对应角色档案。',
                tone: 'info'
            });
        }
    }, [actions, closeAllPanels, setters, state.社交]);
    const openKungfu = React.useCallback(() => {
        if (!启用修炼体系) return;
        closeAllPanels();
        setters.setShowKungfu(true);
    }, [closeAllPanels, setters, 启用修炼体系]);
    const openSkills = React.useCallback(() => {
        closeAllPanels();
        setters.setShowSkills(true);
    }, [closeAllPanels, setters]);
    const openWorld = React.useCallback(() => {
        closeAllPanels();
        setters.setShowWorld(true);
    }, [closeAllPanels, setters]);
    const openMap = React.useCallback(() => {
        closeAllPanels();
        setters.setShowMap(true);
    }, [closeAllPanels, setters]);
    const openSect = React.useCallback(() => {
        closeAllPanels();
        setters.setShowSect(true);
    }, [closeAllPanels, setters]);
    const learnedSectBookIds = React.useMemo(() => {
        const currentSkills = Array.isArray(state.角色?.功法列表) ? state.角色.功法列表 : [];
        return currentSkills
            .map((skill: any) => String(skill?.来源藏经ID || '').trim())
            .filter(Boolean);
    }, [state.角色?.功法列表]);
    const [chatDraftRequest, setChatDraftRequest] = React.useState<{ text: string; token: number } | null>(null);
    const chatDraftTokenRef = React.useRef(0);
    const insertChatDraft = React.useCallback((text: string) => {
        const draft = String(text || '').trim();
        if (!draft) return;
        chatDraftTokenRef.current += 1;
        setChatDraftRequest({ text: draft, token: chatDraftTokenRef.current });
        actions.pushNotification({ title: '已写入输入框', message: '行动文本已放入对话框，可直接发送或继续编辑。', tone: 'success' });
    }, [actions]);

    // ─── 酒馆沙箱桥接回调 ───
    const handleTavernAction = React.useCallback((action: { type: string; action: string; value?: string; height?: number }) => {
        if (action.type !== 'tavern_sandbox') return;
        switch (action.action) {
            case 'inject_text':
                // 注入文本到输入框（不立即发送）
                if (action.value) insertChatDraft(action.value);
                break;
            case 'send_text':
                // 注入文本并立即发送
                if (action.value) {
                    chatDraftTokenRef.current += 1;
                    setChatDraftRequest({ text: action.value, token: chatDraftTokenRef.current });
                    // 延迟发送让 InputArea 先接收 draft
                    setTimeout(() => {
                        const sendBtn = document.querySelector('[data-send-button]') as HTMLButtonElement | null;
                        sendBtn?.click();
                    }, 100);
                }
                break;
            case 'resize':
            case 'get_theme':
            case 'ready':
                // 这些由 SandboxedCard 组件内部处理，App 层不需要额外逻辑
                break;
        }
    }, [insertChatDraft]);

    const handleLearnSectBook = React.useCallback((book: any) => {
        if (!book?.id) return;
        const currentSkills = Array.isArray(state.角色?.功法列表) ? state.角色.功法列表 : [];
        if (currentSkills.some((skill: any) => skill?.来源藏经ID === book.id || skill?.ID === `sect_${book.id}` || skill?.名称 === book.名称)) {
            actions.pushNotification({ title: '已学过', message: `「${book.名称 || '此典籍'}」已经在功法列表中。`, tone: 'info' });
            return;
        }
        const typeMap: Record<string, 功法类型> = { 功法: '绝技', 剑法: '绝技', 刀法: '绝技', 拳法: '绝技', 身法: '轻功', 心法: '内功', 杂学: '被动' };
        const bookName = String(book.名称 || '');
        const inferredType = bookName.includes('剑') ? '剑法' : book.类型;
        const quality = ['凡品', '良品', '上品', '极品', '绝世', '传说'].includes(book.品阶) ? book.品阶 : '凡品';
        const learnedSkill = {
            ID: `sect_${book.id}`,
            来源藏经ID: book.id,
            名称: book.名称 || '未命名典籍',
            描述: book.简介 || '藏经阁所藏典籍。',
            类型: (typeMap[inferredType] || '绝技') as 功法类型,
            品质: quality as 功法品质,
            来源: `${state.玩家门派?.名称 || '门派'}藏经阁`,
            当前重数: 1,
            最高重数: 10,
            当前熟练度: 0,
            升级经验: 100,
            突破条件: '勤修不辍，实战参悟',
            境界限制: book.要求职位 || '无',
            大成方向: '稳固根基',
            圆满效果: `${book.名称 || '此典籍'}圆满后可强化对应武学表现。`,
            武器限制: [],
            消耗类型: (inferredType === '心法' ? '内力' : '精力') as 消耗类型,
            消耗数值: 0,
            施展耗时: '1息',
            冷却时间: '0息',
            基础伤害: 0,
            加成属性: inferredType === '身法' ? '敏捷' : inferredType === '心法' ? '根骨' : '力量',
            加成系数: 0,
            内力系数: inferredType === '心法' ? 1 : 0,
            伤害类型: (inferredType === '心法' ? '内功' : '物理') as 伤害类型,
            目标类型: '自身' as 目标类型,
            最大目标数: 1,
            重数描述映射: [{ 重数: 1, 描述: book.简介 || '初窥门径。' }],
            附带效果: [],
            被动修正: [],
            境界特效: []
        };
        const nextCharacter = {
            ...state.角色,
            功法列表: [learnedSkill, ...currentSkills]
        };
        setters.setCharacter(nextCharacter as any);
        void actions.performAutoSave?.({ role: nextCharacter, force: true });
        actions.pushNotification({ title: `${题材界面文案.组织.能力库}${题材界面文案.组织.学习动作}成功`, message: `已${题材界面文案.组织.学习动作}「${learnedSkill.名称}」，可在${功法显示名称}页查看。`, tone: 'success' });
    }, [actions, setters, state.玩家门派?.名称, state.角色, 题材界面文案.组织.能力库, 题材界面文案.组织.学习动作, 功法显示名称]);
    const handleSectExchange = React.useCallback((goodId: string, price: number) => {
        const sect = state.玩家门派;
        if (!sect) return;
        const good = (sect.兑换列表 || []).find((g: any) => g.id === goodId);
        if (!good) return;
        const currentContribution = Math.max(0, Number(sect.玩家贡献 || 0));
        if (currentContribution < price) {
            actions.pushNotification({ title: '兑换失败', message: '当前贡献不足。', tone: 'error' });
            return;
        }
        if (good.库存 <= 0) {
            actions.pushNotification({ title: '兑换失败', message: '库存不足。', tone: 'error' });
            return;
        }
        const nextSect = {
            ...sect,
            玩家贡献: currentContribution - price,
            兑换列表: sect.兑换列表.map((g: any) => g.id === goodId ? { ...g, 库存: Math.max(0, (g.库存 || 1) - 1) } : g)
        };
        const newItem = {
            ID: `exchange_${goodId}_${Date.now()}`,
            名称: good.物品名称 || '兑换物品',
            描述: good.描述 || '',
            类型: good.类型 || '消耗品',
            品质: good.品质 || '良品',
            重量: good.重量 || 0.5,
            堆叠数量: 1,
            是否可堆叠: false
        };
        const currentItems = Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : [];
        const nextCharacter = { ...state.角色, 物品列表: [...currentItems, newItem] };
        setters.setPlayerSect(nextSect);
        setters.setCharacter(nextCharacter);
        void actions.performAutoSave?.({ sect: nextSect, role: nextCharacter, force: true });
        actions.pushNotification({ title: '兑换成功', message: `已兑换「${newItem.名称}」，消耗 ${price} 贡献。`, tone: 'success' });
    }, [actions, setters, state.玩家门派, state.角色]);
    const handleClaimMonthlyStipend = React.useCallback(() => {
        const sect = state.玩家门派;
        const rule = sect?.月俸规则;
        if (!sect || !rule) return;
        const match = String(state.环境?.时间 || '').match(/^(\d{1,6})[:/-](\d{1,2})/);
        const year = match ? Number(match[1]) : 1;
        const month = match ? Number(match[2]) : 1;
        const monthKey = `${year}:${String(month).padStart(2, '0')}`;
        if (String((sect as any).上次俸禄月份 || '').trim() === monthKey) {
            actions.pushNotification({ title: 题材界面文案.组织.已领取补给, message: `${题材界面文案.组织.补给名称}已经领取过了，下期再来。`, tone: 'info' });
            return;
        }
        const amount = Math.max(0,
            Number(rule.基础俸禄 || 0)
            + Math.floor(Number(sect.累计贡献 || sect.玩家贡献 || 0) * Number(rule.贡献系数 || 0))
            + Math.floor(Number(sect.弟子总数 || 0) * Number(rule.规模系数 || 0))
        );
        const sectText = JSON.stringify(sect);
        const stipendAsContribution = /主神|轮回|奖励点|支线剧情|营地|补给|信用|组织|团队|队伍|额度/u.test(sectText);
        const currentContribution = Math.max(0, Number(sect.玩家贡献 || 0));
        const currentTotalContribution = Math.max(currentContribution, Number(sect.累计贡献 || 0));
        const nextSect = stipendAsContribution
            ? {
                ...sect,
                上次俸禄月份: monthKey,
                玩家贡献: currentContribution + amount,
                累计贡献: currentTotalContribution + amount
            }
            : { ...sect, 上次俸禄月份: monthKey };
        const currentMoney = 规范化角色金钱(state.角色?.金钱);
        const nextCharacter = stipendAsContribution
            ? state.角色
            : { ...state.角色, 金钱: 规范化角色金钱({ ...currentMoney, 底层货币: Math.max(0, Number(currentMoney.底层货币 || 0)) + amount }) };
        setters.setPlayerSect(nextSect);
        setters.setCharacter(nextCharacter);
        void actions.performAutoSave?.({ role: nextCharacter, sect: nextSect, force: true });
        actions.pushNotification({
            title: `${题材界面文案.组织.补给名称}已领取`,
            message: amount > 0 ? `已到账 ${amount}。` : '本月领取记录已更新。',
            tone: 'success'
        });
    }, [actions, setters, state.玩家门派, state.环境?.时间, state.角色, 题材界面文案.组织.已领取补给, 题材界面文案.组织.补给名称]);
    const handleLearnNpcSkill = React.useCallback((npc: any, skill: any) => {
        const npcName = String(npc?.姓名 || npc?.名称 || '该人物').trim();
        const skillName = String(skill?.名称 || '技艺').trim();
        const skillLevel = String(skill?.等级 || '未入门').trim();
        const proficiency = Number(skill?.熟练度 ?? 0);
        if (!npcName || !skillName || !Number.isFinite(proficiency)) return;
        const playerSkill = (Array.isArray(state.角色?.技艺) ? state.角色.技艺 : [])
            .find((item: any) => item?.名称 === skillName);
        const playerSkillText = playerSkill
            ? `主角当前${skillName}：${playerSkill.等级 || '未入门'}，熟练度${Number(playerSkill.熟练度 || 0)}。`
            : `主角当前尚未稳定记录${skillName}技艺。`;
        actions.appendSystemMessage?.(
            `[学艺请求] 玩家已选择向${npcName}学习${skillName}技艺。对方当前${skillName}：${skillLevel}，熟练度${Math.max(0, Math.floor(proficiency))}。${playerSkillText}下一回合 AI 必须在正文中反馈请教过程、对方态度、学习条件与阶段结果；若学习有效，在<变量规划>中更新角色.技艺里${skillName}的熟练度/等级/描述，并按事实同步${npcName}的记忆、好感或关系状态。`,
            { position: 'after_last_turn' }
        );
        actions.pushNotification({
            title: '学艺请求已记录',
            message: `下回合将向${npcName}请教「${skillName}」。`,
            tone: 'success'
        });
    }, [actions, state.角色?.技艺]);
    const handleRecruitNpcToSect = React.useCallback((npc: any) => {
        const npcName = String(npc?.姓名 || npc?.名称 || '此人').trim();
        const sectName = String(state.玩家门派?.名称 || state.角色?.所属门派ID || '我的组织').trim();
        const isApocalypseSect = /末日|丧尸|营地|避难|安全点|据点|车队|搜救|后勤|巡逻|物资|燃油|口粮|弹药|尸群/u.test(JSON.stringify(state.玩家门派 || {}));
        const actionLabel = isApocalypseSect ? '营地邀入' : '门派招揽';
        const orgLabel = isApocalypseSect ? '营地' : '门派';
        insertChatDraft(`[${actionLabel}] 我尝试邀请「${npcName}」加入「${sectName}」。请结合对方身份、关系、利益诉求、当前剧情、${orgLabel}等级/规模/名声、我的交涉表现与相关技艺，判定是否成功，并在成功时更新社交、玩家门派重要成员、弟子总数和${orgLabel}等级；如果对方本来就是同${isApocalypseSect ? '营地' : '门派'}成员，正文应明确说明无需重复邀入，只同步其关系状态。`);
        setters.setShowSocial(false);
    }, [insertChatDraft, setters, state.玩家门派, state.角色?.所属门派ID]);
    const handleStealFromNpc = React.useCallback((npc: any, target?: string) => {
        const npcName = String(npc?.姓名 || npc?.名称 || '目标').trim();
        const targetText = String(target || '随机随身物品').trim() || '随机随身物品';
        const isPrivateTarget = /内衣|贴身|亵衣|肚兜|抹胸|袜|香囊|信物/u.test(targetText);
        insertChatDraft(`[偷窃尝试] 我尝试趁机从「${npcName}」身上偷取「${targetText}」。请根据现场环境、目标警觉与实力、双方关系、我的身法/机关/鉴定/偷窃/潜行等相关技艺、装备与风险进行判定；偷窃技艺越高，越可以尝试更隐蔽或更贴身的目标${isPrivateTarget ? '，但贴身衣物或私密物件必须额外考虑接近难度、触碰风险、目标反应和失败后果' : ''}。若成功请写明偷到什么并更新双方背包；若失败请给出被察觉、关系下降、冲突或名声后果。`);
        setters.setShowSocial(false);
    }, [insertChatDraft, setters]);
    const openTask = React.useCallback(() => {
        closeAllPanels();
        setters.setShowTask(true);
    }, [closeAllPanels, setters]);
    const openAgreement = React.useCallback(() => {
        closeAllPanels();
        setters.setShowAgreement(true);
    }, [closeAllPanels, setters]);
    const openStory = React.useCallback(() => {
        closeAllPanels();
        setters.setShowStory(true);
    }, [closeAllPanels, setters]);
    const openHeroinePlan = React.useCallback(() => {
        closeAllPanels();
        setters.setShowHeroinePlan(true);
    }, [closeAllPanels, setters]);
    const openMemory = React.useCallback(() => {
        closeAllPanels();
        setters.setShowMemory(true);
    }, [closeAllPanels, setters]);
    const openAuctionHouse = React.useCallback(() => {
        closeAllPanels();
        setShowAuctionHouse(true);
    }, [closeAllPanels]);
    const handleSellBagItemToAuction = React.useCallback((itemId: string) => {
        const result = 上架背包物品(state.角色, itemId, undefined, '底层货币', auctionHouseState.行情列表 || [], 1, auctionCurrencyOptions);
        if (!result.ok) {
            actions.pushNotification({ title: '寄售失败', message: result.message, tone: 'error' });
            return { ok: false as const, message: result.message };
        }
        const nextState: 拍卖行状态 = {
            ...auctionHouseState,
            拍卖品列表: [result.auction, ...(auctionHouseState.拍卖品列表 || [])],
            交易记录: [
                创建交易记录('寄售', '背包寄售', result.message),
                ...(auctionHouseState.交易记录 || []),
            ].slice(0, 40),
        };
        setAuctionHouseState(nextState);
        保存拍卖行状态(nextState, auctionHouseScope);
        setters.setCharacter(result.nextCharacter);
        void actions.performAutoSave?.({ role: result.nextCharacter, force: true });
        actions.pushNotification({ title: '已送入拍卖行', message: result.message, tone: 'success' });
        return { ok: true as const, message: result.message };
    }, [actions, auctionCurrencyOptions, auctionHouseScope, auctionHouseState, setters, state.角色]);
    const handleDiscardBagItem = React.useCallback((itemId: string) => {
        const result = 丢弃背包物品(state.角色, itemId);
        if (!result.ok) {
            actions.pushNotification({ title: '丢弃失败', message: result.message, tone: 'error' });
            return { ok: false as const, message: result.message };
        }
        setters.setCharacter(result.nextCharacter);
        void actions.performAutoSave?.({ role: result.nextCharacter, force: true });
        actions.pushNotification({ title: '已丢弃物品', message: result.message, tone: 'success' });
        return { ok: true as const, message: result.message };
    }, [actions, setters, state.角色]);
    const handleSellAllMiscItems = React.useCallback(() => {
        const sourceItems = Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : [];
        const miscItems = sourceItems.filter(是否杂物类物品);
        if (miscItems.length <= 0) {
            const message = '背包中没有可一键出售的杂物。';
            actions.pushNotification({ title: '没有杂物', message, tone: 'info' });
            return { ok: false as const, message };
        }
        let nextCharacter: any = state.角色;
        const newAuctions: any[] = [];
        const messages: string[] = [];
        for (const item of miscItems) {
            const itemId = String(item?.ID || '');
            if (!itemId) continue;
            const result = 上架背包物品(nextCharacter, itemId, undefined, '底层货币', auctionHouseState.行情列表 || [], Number.POSITIVE_INFINITY, auctionCurrencyOptions);
            if (!result.ok) continue;
            nextCharacter = result.nextCharacter;
            newAuctions.push(result.auction);
            messages.push(result.message);
        }
        if (newAuctions.length <= 0) {
            const message = '杂物出售失败，请稍后再试。';
            actions.pushNotification({ title: '出售失败', message, tone: 'error' });
            return { ok: false as const, message };
        }
        const nextState: 拍卖行状态 = {
            ...auctionHouseState,
            拍卖品列表: [...newAuctions, ...(auctionHouseState.拍卖品列表 || [])],
            交易记录: [
                创建交易记录('寄售', '杂物一键寄售', `已寄售 ${newAuctions.length} 组杂物，下回合自动成交。`),
                ...(auctionHouseState.交易记录 || []),
            ].slice(0, 40),
        };
        setAuctionHouseState(nextState);
        保存拍卖行状态(nextState, auctionHouseScope);
        setters.setCharacter(nextCharacter);
        void actions.performAutoSave?.({ role: nextCharacter, force: true });
        const message = `已寄售 ${newAuctions.length} 组杂物，下回合自动成交。`;
        actions.pushNotification({ title: '杂物已寄售', message, tone: 'success' });
        return { ok: true as const, message: messages.length > 1 ? message : messages[0] || message };
    }, [actions, auctionCurrencyOptions, auctionHouseScope, auctionHouseState, setters, state.角色]);
    const handleDiscardAllMiscItems = React.useCallback(() => {
        const sourceItems = Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : [];
        const miscItems = sourceItems.filter(是否杂物类物品);
        if (miscItems.length <= 0) {
            const message = '背包中没有可一键丢弃的杂物。';
            actions.pushNotification({ title: '没有杂物', message, tone: 'info' });
            return { ok: false as const, message };
        }
        let nextCharacter: any = state.角色;
        let removedCount = 0;
        for (const item of miscItems) {
            const itemId = String(item?.ID || '');
            const count = Math.max(1, Math.trunc(Number(item?.堆叠数量) || 1));
            if (!itemId) continue;
            const result = 丢弃背包物品(nextCharacter, itemId, Number.POSITIVE_INFINITY);
            if (!result.ok) continue;
            nextCharacter = result.nextCharacter;
            removedCount += count;
        }
        setters.setCharacter(nextCharacter);
        void actions.performAutoSave?.({ role: nextCharacter, force: true });
        const message = `已丢弃 ${removedCount || miscItems.length} 件杂物。`;
        actions.pushNotification({ title: '杂物已丢弃', message, tone: 'success' });
        return { ok: true as const, message };
    }, [actions, setters, state.角色]);
    const handleRegenerateBagItemImage = React.useCallback(async (targetItem: 游戏物品, extraPrompt?: string) => {
        const itemRef = String((targetItem as any)?.ID || (targetItem as any)?.名称 || '');
        if (!itemRef) return;
        const sourceItems = Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : [];
        const freshItem = sourceItems.find((item: any) => item?.ID === itemRef || item?.名称 === itemRef) || targetItem;
        actions.pushNotification({
            title: '物品重生图',
            message: `正在为「${(freshItem as any)?.名称 || '无名物品'}」重新生成图标。`,
            tone: 'info'
        });
        try {
            const result = await 生成物品图标(freshItem, state.apiConfig, {
                source: 'manual',
                sourceLocation: '背包',
                force: true,
                extraPrompt
            });
            const history = Array.isArray(result.nextItem?.图片档案?.生图历史)
                ? result.nextItem.图片档案.生图历史
                : [];
            const nextItems = sourceItems.map((item: any) => (
                item?.ID === itemRef || item?.名称 === itemRef ? result.nextItem : item
            ));
            const nextCharacter = { ...state.角色, 物品列表: nextItems };
            setters.setCharacter(nextCharacter);
            void actions.performAutoSave?.({ role: nextCharacter, force: true });
            recordDiagnosticLog('info', '[物品手动生图] 成功写入背包物品档案', {
                itemRef,
                recordId: result.imageRecord?.id || '',
                itemName: (result.nextItem as any)?.名称 || (freshItem as any)?.名称 || '无名物品',
                historyCount: history.length,
                recentId: result.nextItem?.图片档案?.最近生图结果?.id || '',
                hasImageUrl: Boolean(result.imageRecord?.图片URL),
                hasLocalPath: Boolean(result.imageRecord?.本地路径)
            });
            actions.pushNotification({
                title: '物品图标已更新',
                message: `「${(result.nextItem as any)?.名称 || (freshItem as any)?.名称 || '无名物品'}」的新图标已写入背包。`,
                tone: 'success'
            });
        } catch (error) {
            const message = 读取生图错误文本(error, '物品重生图失败');
            recordDiagnosticLog('warn', '[物品手动生图] 生成或写回失败', {
                itemRef,
                itemName: (freshItem as any)?.名称 || '无名物品',
                errorMessage: message
            });
            actions.pushNotification({ title: '物品重生图失败', message, tone: 'error' });
            throw error;
        }
    }, [actions, setters, state.apiConfig, state.角色]);
    const handleDeleteMemory = React.useCallback((round: number) => {
        const prevMemorySystem = state.记忆系统;
        if (!prevMemorySystem) return;

        const nextMemorySystem = {
            ...prevMemorySystem,
            回忆档案: (Array.isArray(prevMemorySystem.回忆档案) ? prevMemorySystem.回忆档案 : [])
                .filter(item => item?.回合 !== round),
            即时记忆: (Array.isArray(prevMemorySystem.即时记忆) ? prevMemorySystem.即时记忆 : [])
                .filter((_, index) => index + 1 !== round),
            短期记忆: (Array.isArray(prevMemorySystem.短期记忆) ? prevMemorySystem.短期记忆 : [])
                .filter((_, index) => index + 1 !== round)
        };

        actions.updateMemorySystem(nextMemorySystem);
        void actions.performAutoSave?.({ memory: nextMemorySystem, force: true });
        actions.pushNotification({ title: '记忆已删除', message: `回合 ${round} 的回忆档案已被移除。`, tone: 'success' });
    }, [actions, setters, state.记忆系统]);
    const handleRefineMemories = React.useCallback(async (rounds: number[]): Promise<boolean> => {
        const prevMemorySystem = state.记忆系统;
        if (!prevMemorySystem) return false;
        const sortedRounds = [...new Set(rounds.filter((round) => Number.isFinite(round)))].sort((a, b) => a - b);
        const allArchives = Array.isArray(prevMemorySystem.回忆档案) ? prevMemorySystem.回忆档案 : [];
        const selectedRoundSet = new Set(sortedRounds);
        const selectedEntries = allArchives
            .filter(item => selectedRoundSet.has(typeof item?.回合 === 'number' ? item.回合 : 0))
            .sort((a, b) => (a.回合 ?? 0) - (b.回合 ?? 0));
        if (selectedEntries.length < 2) {
            actions.pushNotification({ title: '精炼取消', message: '至少需要选择 2 条记忆。', tone: 'info' });
            return false;
        }
        actions.pushNotification({ title: '正在精炼', message: `正在对 ${selectedEntries.length} 条记忆进行 AI 精炼总结...`, tone: 'info' });

        const memoryRefineApi = 获取记忆精炼接口配置(apiConfigRef.current);
        if (!接口配置是否可用(memoryRefineApi)) {
            actions.pushNotification({ title: '精炼失败', message: '记忆精炼接口未配置，请先在设置中配置。', tone: 'error' });
            return false;
        }

        const entriesText = selectedEntries.map((item) => {
            const round = typeof item?.回合 === 'number' ? item.回合 : 0;
            const name = typeof item?.名称 === 'string' ? item.名称 : `【回忆${round || '?'}】`;
            const summary = typeof item?.概括 === 'string' ? item.概括 : '';
            const raw = typeof item?.原文 === 'string' ? item.原文 : '';
            return `${name}\n概括：${summary}\n原文：${raw}\n---`;
        }).join('\n');

        const systemPrompt = 获取内置世界书槽位内容({
            books: meta.worldbooks,
            slotId: 'builtin_memory_refine_system_prompt',
            fallback: 记忆精炼系统提示词
        });
        const sortedEntryTimes = selectedEntries
            .map(item => typeof item?.记录时间 === 'string' ? item.记录时间.trim() : '')
            .filter(Boolean);
        const timeRangeHint = sortedEntryTimes.length >= 2
            ? `\n时间范围：${sortedEntryTimes[0]} 至 ${sortedEntryTimes[sortedEntryTimes.length - 1]}`
            : '';
        const userPrompt = `请精炼总结以下 ${selectedEntries.length} 条记忆${timeRangeHint}，生成一份可用于后续剧情检索的历史纪要：\n\n${entriesText}`;

        try {
            const refinedText = await 请求模型文本(
                memoryRefineApi,
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                { temperature: 0.7 }
            );
            if (!refinedText || refinedText.trim().length < 20) {
                throw new Error('AI 返回内容过短');
            }
            const minRound = sortedRounds[0];
            const maxRound = sortedRounds[sortedRounds.length - 1];
            const rawText = refinedText.trim();
            // 优先匹配新格式 <<<TIME>>> / <<<SUMMARY>>> / <<<BODY>>>（兼容新旧顺序）
            const newTimeMatch = rawText.match(/<<<TIME>>>\s*([\s\S]*?)(?=<<<SUMMARY>>>|<<<BODY>>>)/);
            const newSummaryMatch = rawText.match(/<<<SUMMARY>>>\s*([\s\S]*?)(?=<<<TIME>>>|<<<BODY>>>)/);
            const newBodyMatch = rawText.match(/<<<BODY>>>\s*([\s\S]*)/);
            // 兼容旧格式 概况摘要：/ 正文：
            const oldSummaryMatch = rawText.match(/概况摘要[：:]\s*([\s\S]*?)(?=\n\s*正文[：:])/);
            const oldBodyMatch = rawText.match(/正文[：:]\s*([\s\S]*)/);
            const summaryText = (newSummaryMatch ? newSummaryMatch[1].trim() : '') || (oldSummaryMatch ? oldSummaryMatch[1].trim() : '');
            let timeRangeText = newTimeMatch ? newTimeMatch[1].trim() : '';
            // 兜底：AI 没输出 <<<TIME>>> 时，从概况摘要首尾行自动提取时间
            if (!timeRangeText && summaryText) {
                const summaryLines = summaryText.split('\n').filter(line => /^\s*-/.test(line));
                if (summaryLines.length > 0) {
                    const timePat = /\d+:\d+:\d+:\d+:\d+/g;
                    const firstTimes = summaryLines[0].match(timePat);
                    const lastTimes = summaryLines[summaryLines.length - 1].match(timePat);
                    if (firstTimes && lastTimes) {
                        const startTime = firstTimes[0];
                        const endTime = lastTimes[lastTimes.length - 1];
                        timeRangeText = startTime !== endTime ? `${startTime} - ${endTime}` : startTime;
                    }
                }
            }
            const bodyText = (newBodyMatch ? newBodyMatch[1].trim() : '') || (oldBodyMatch ? oldBodyMatch[1].trim() : '') || rawText;
            const timePrefix = timeRangeText ? `时间跨度：${timeRangeText}\n\n` : '';
            const cleanSummary = timePrefix + (summaryText || bodyText.slice(0, 800));
            const refinedNameSuffix = timeRangeText ? ` (${timeRangeText})` : '';
            const refinedEntry = {
                名称: `【精炼纪要 ${minRound}-${maxRound}】${refinedNameSuffix}`,
                概括: cleanSummary,
                原文: bodyText,
                回合: maxRound,
                记录时间: selectedEntries[selectedEntries.length - 1]?.记录时间 || '未知时间',
                时间戳: selectedEntries[selectedEntries.length - 1]?.时间戳 || new Date().toISOString()
            };
            const remainingArchives = allArchives.filter(item => !sortedRounds.includes(typeof item?.回合 === 'number' ? item.回合 : 0));
            const nextArchives = [refinedEntry, ...remainingArchives].sort((a, b) => (b.回合 ?? 0) - (a.回合 ?? 0));

            const nextMemorySystem = {
                ...prevMemorySystem,
                回忆档案: nextArchives
            };
            actions.updateMemorySystem(nextMemorySystem);
            void actions.performAutoSave?.({ memory: nextMemorySystem, force: true });
            actions.pushNotification({ title: '精炼完成', message: `${selectedEntries.length} 条记忆已精炼为 1 条纪要（回合 ${minRound}-${maxRound}）。`, tone: 'success' });
            return true;
        } catch (error: any) {
            const errorMsg = error?.message || '未知错误';
            actions.pushNotification({ title: '精炼失败', message: `AI 精炼失败：${errorMsg}`, tone: 'error' });
            return false;
        }
    }, [actions, meta.worldbooks, state.记忆系统]);
    const handleRefineMemoriesRef = React.useRef(handleRefineMemories);
    handleRefineMemoriesRef.current = handleRefineMemories;
    const stableRefineMemories = React.useCallback((rounds: number[]) =>
        handleRefineMemoriesRef.current(rounds)
    , []);
    const handleRegenerateMapFromMemory = React.useCallback(async (onDelta: (delta: string) => void): Promise<{ ok: boolean; message: string }> => {
        const memory = state.记忆系统;
        const memoryCount = [
            Array.isArray(memory?.回忆档案) ? memory.回忆档案.length : 0,
            Array.isArray(memory?.即时记忆) ? memory.即时记忆.length : 0,
            Array.isArray(memory?.短期记忆) ? memory.短期记忆.length : 0,
            Array.isArray(memory?.中期记忆) ? memory.中期记忆.length : 0,
            Array.isArray(memory?.长期记忆) ? memory.长期记忆.length : 0
        ].reduce((sum, count) => sum + count, 0);
        if (memoryCount <= 0) {
            return { ok: false, message: '当前存档没有可用于解析地图的回忆内容。' };
        }
        try {
            setMapRegenerateRawText('');
            const result = await 生成地图更新({
                mode: 'memory_regenerate',
                apiSettings: apiConfigRef.current,
                环境: state.环境,
                世界: state.世界,
                社交: state.社交,
                角色: safeCharacter,
                gameConfig: state.gameConfig,
                记忆系统: memory,
                worldbooks: meta.worldbooks,
                onDelta: (delta: string) => {
                    setMapRegenerateRawText((prev: string) => prev + delta);
                    onDelta(delta);
                }
            });
            if (!result.ok || !Array.isArray(result.newLayers) || result.newLayers.length === 0) {
                throw new Error(result.statusText || '未生成有效地图节点');
            }

            const nextWorld: any = { ...(state.世界 || {}) };
            nextWorld.地图 = [];
            nextWorld.建筑 = [];
            nextWorld.地图建筑 = [];
            nextWorld.地图道路 = [];
            nextWorld.地图人物 = [];
            nextWorld.地图层级 = result.newLayers;
            setters.setWorld(nextWorld);
            worldRef.current = nextWorld;
            setMapRegenerateRawText(result.rawText || '');
            void actions.performAutoSave?.({ world: nextWorld, force: true });
            return { ok: true, message: `已清除旧地图，并从回忆库重建 ${result.newLayers.length} 个地点节点。` };
        } catch (error: any) {
            const errorMsg = error?.message || '未知错误';
            return { ok: false, message: errorMsg };
        }
    }, [actions, meta.worldbooks, safeCharacter, setters, state.世界, state.环境, state.社交, state.记忆系统, state.gameConfig]);
    const handleRegenerateMap = React.useCallback(async (): Promise<boolean> => {
        actions.pushNotification({ title: '开始回忆解析', message: '正在从回忆库重建新版地图。', tone: 'info' });
        const result = await handleRegenerateMapFromMemory(() => undefined);
        actions.pushNotification({
            title: result.ok ? '回忆解析完成' : '回忆解析失败',
            message: result.message,
            tone: result.ok ? 'success' : 'error'
        });
        return result.ok;
    }, [actions, handleRegenerateMapFromMemory]);
    const openNovelExport = React.useCallback(() => {
        closeAllPanels();
        setShowNovelExport(true);
    }, [closeAllPanels]);
    const openSave = React.useCallback(() => {
        closeAllPanels();
        setters.setShowSaveLoad({ show: true, mode: 'save' });
    }, [closeAllPanels, setters]);
    const openLoad = React.useCallback(() => {
        closeAllPanels();
        setters.setShowSaveLoad({ show: true, mode: 'load' });
    }, [closeAllPanels, setters]);
    const openCloudPlay = React.useCallback(() => {
        closeAllPanels();
        setShowCloudPlay(true);
    }, [closeAllPanels]);
    const openCloudPlayForWorkshopLogin = React.useCallback(() => {
        setShowCloudPlay(true);
    }, []);
    const closeSettings = React.useCallback(() => setters.setShowSettings(false), [setters]);
    const closeNovelDecompositionWorkbench = React.useCallback(() => setShowNovelDecompositionWorkbench(false), []);
    const closeNovelExport = React.useCallback(() => setShowNovelExport(false), []);
    const handleAllocateAttributePoint = React.useCallback((key: 可分配六维属性键) => {
        const nextCharacter = 分配角色属性点(state.角色, key);
        if (nextCharacter === state.角色) return;
        setters.setCharacter(nextCharacter);
        void actions.performAutoSave?.({ role: nextCharacter, force: true });
        actions.pushNotification({
            title: '属性点已分配',
            message: `${key} +1，剩余可分配属性点 ${Number((nextCharacter as any).可分配属性点 || 0)}。`,
            tone: 'success'
        });
    }, [actions, setters, state.角色]);
    const closeSaveLoad = React.useCallback(() => setters.setShowSaveLoad({ show: false, mode: 'save' }), [setters]);
    const closeCloudPlay = React.useCallback(() => setShowCloudPlay(false), []);
    const openObjectStorageSettingsFromCloudPlay = React.useCallback(() => {
        setShowCloudPlay(false);
        closeAllPanels();
        setters.setActiveTab('storage');
        setters.setShowSettings(true);
    }, [closeAllPanels, setters]);
    const closeWorldbookManager = React.useCallback(() => setShowWorldbookManager(false), []);
    const closeMobileMusic = React.useCallback(() => setShowMobileMusic(false), []);
    const openWorldbookManager = React.useCallback(() => setShowWorldbookManager(true), []);
    const openNovelDecompositionWorkbench = React.useCallback(async () => {
        const feature = state.apiConfig?.功能模型占位;
        const 独立接口已配置 = Boolean(
            feature?.小说拆分功能启用
            && feature?.小说拆分独立模型开关
            && (feature?.小说拆分使用模型 || '').trim()
            && (feature?.小说拆分API地址 || '').trim()
            && (feature?.小说拆分API密钥 || '').trim()
        );

        if (!独立接口已配置) {
            const accepted = await requestConfirm({
                title: '先配置小说分解独立 API',
                message: '小说分解现在从首页独立打开。\n\n使用前请先在"设置 -> 小说分解接口"中启用并填写独立模型、API 地址和密钥。\n\n是否现在前往设置？',
                confirmText: '前往设置',
                cancelText: '取消'
            });
            if (accepted) {
                closeAllPanels();
                setters.setActiveTab('novel_decomposition');
                setters.setShowSettings(true);
            }
            return;
        }

        closeAllPanels();
        setShowNovelDecompositionWorkbench(true);
    }, [closeAllPanels, requestConfirm, setters, state.apiConfig]);
    const handleStartFromLanding = React.useCallback(() => actions.handleStartNewGameWizard(), [actions]);
    const handleStartFromCloudPlay = React.useCallback(() => {
        closeCloudPlay();
        actions.handleStartNewGameWizard();
    }, [actions, closeCloudPlay]);
    const openReleaseNotes = React.useCallback(() => {
        setSuppressReleaseNotesForToday(false);
        setShowReleaseNotes(true);
    }, []);
    const closeReleaseNotes = React.useCallback(() => {
        const today = new Date().toISOString().slice(0, 10);

        try {
            if (suppressReleaseNotesForToday) {
                localStorage.setItem(RELEASE_NOTES_SUPPRESS_DATE_KEY, today);
            } else {
                localStorage.removeItem(RELEASE_NOTES_SUPPRESS_DATE_KEY);
            }
        } catch {
            // ignore storage failures
        }

        setShowReleaseNotes(false);
    }, [suppressReleaseNotesForToday]);
    const handleReleaseNotesPrimaryAction = React.useCallback(() => {
        setShowReleaseNotes(false);
        if (isNativeCapacitorEnvironment()) {
            void downloadLatestApkPackage();
            return;
        }
        void window.open(RELEASE_INFO.apkDownloadUrl, '_blank', 'noopener,noreferrer');
    }, [runAppUpdateCheck]);
    const handleReleaseNotesOpenGithub = React.useCallback(() => {
        void window.open(RELEASE_INFO.githubRepoUrl, '_blank', 'noopener,noreferrer');
    }, []);
    const handleReturnToHomeWithAutoSave = React.useCallback(async () => {
        if (returnHomeSaving) return;
        setReturnHomeSaving(true);
        actions.pushNotification({
            title: '正在保存存档',
            message: '正在保存当前进度并同步存档，请稍候。',
            tone: 'info'
        });
        try {
            const returnHomeSave = await actions.performAutoSave({ force: true });
            try {
                await 尝试返回首页云端同步(returnHomeSave);
            } catch (syncError: any) {
                actions.pushNotification({
                    title: '本地存档已保存',
                    message: `云端同步将在后台继续重试：${syncError?.message || '同步暂时未完成'}`,
                    tone: 'info'
                });
            }
            closeAllPanels();
            void 执行延迟上传队列();
            actions.handleReturnToHome();
            setters.setShowSettings(false);
        } catch (error: any) {
            window.alert(`本地保存失败，暂不能返回首页：${error?.message || '未知错误'}`);
        } finally {
            setReturnHomeSaving(false);
        }
    }, [actions, closeAllPanels, returnHomeSaving, setters, 尝试返回首页云端同步]);
    const handleReturnToHomeFromSettings = React.useCallback(async () => {
        const ok = await requestConfirm({
            title: '返回首页',
            message: '返回首页前会自动保存当前进度。确定保存并返回吗？',
            confirmText: '保存并返回',
            cancelText: '继续游玩',
            danger: true
        });
        if (!ok) return;
        await handleReturnToHomeWithAutoSave();
    }, [handleReturnToHomeWithAutoSave, requestConfirm]);
    const openPolishSettings = React.useCallback(() => {
        closeAllPanels();
        setters.setActiveTab('polish');
        setters.setShowSettings(true);
    }, [closeAllPanels, setters]);

    const openImageManagerWithCheck = React.useCallback(async () => {
        const imageApi = 获取文生图接口配置(state.apiConfig);
        if (接口配置是否可用(imageApi) && imageApi.图片后端类型 === 'novelai') {
            const promptApi = 获取生图词组转化器接口配置(state.apiConfig);
            if (!接口配置是否可用(promptApi)) {
                const accepted = await requestConfirm({
                    title: 'NovelAI 缺少词组转化器',
                    message: 'NovelAI 模式必须绑定可用的词组转化器接口。是否立即跳转到"文生图"设置页？',
                    confirmText: '前往设置',
                    cancelText: '稍后再说'
                });
                if (accepted) {
                    closeAllPanels();
                    setters.setActiveTab('image_generation');
                    setters.setShowSettings(true);
                }
                return;
            }
        }

        closeAllPanels();
        setShowImageManager(true);
    }, [closeAllPanels, requestConfirm, setters, state.apiConfig]);

    const handleMobileMenuClick = React.useCallback((menu: string) => {
        const isActive = activeMobileWindow === menu;
        closeAllPanels();
        if (isActive) return;

        switch (menu) {
            case '角色':
                setShowCharacter(true);
                break;
            case '装备':
                setters.setShowEquipment(true);
                break;
            case '战斗':
                setters.setShowBattle(true);
                break;
            case '背包':
                setters.setShowInventory(true);
                break;
            case '社交':
                setters.setShowSocial(true);
                break;
            case '功法':
                if (启用修炼体系) {
                    setters.setShowKungfu(true);
                }
                break;
            case '技艺':
                setters.setShowSkills(true);
                break;
            case '世界':
                setters.setShowWorld(true);
                break;
            case '地图':
                setters.setShowMap(true);
                break;
            case '队伍':
                setters.setShowTeam(true);
                break;
            case '门派':
                setters.setShowSect(true);
                break;
            case '任务':
                setters.setShowTask(true);
                break;
            case '约定':
                setters.setShowAgreement(true);
                break;
            case '剧情':
                setters.setShowStory(true);
                break;
            case '规划':
                setters.setShowHeroinePlan(true);
                break;
            case '记忆':
                setters.setShowMemory(true);
                break;
            case '导出小说':
                setShowNovelExport(true);
                break;
            case '图册':
                void openImageManagerWithCheck();
                break;
            case '小说分解':
                void openNovelDecompositionWorkbench();
                break;
            case '保存':
                setters.setShowSaveLoad({ show: true, mode: 'save' });
                break;
            case '读取':
                setters.setShowSaveLoad({ show: true, mode: 'load' });
                break;
            case '设置':
                setters.setActiveTab('game');
                setters.setShowSettings(true);
                break;
            case '音乐':
                setShowMobileMusic(true);
                break;
            default:
                break;
        }
    }, [activeMobileWindow, closeAllPanels, openImageManagerWithCheck, openNovelDecompositionWorkbench, setters, 启用修炼体系]);

    const toggleAppFullscreen = React.useCallback(async () => {
        const doc = document as Document & {
            webkitFullscreenElement?: Element;
            webkitExitFullscreen?: () => Promise<void> | void;
            msFullscreenElement?: Element;
            msExitFullscreen?: () => Promise<void> | void;
        };
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
            msRequestFullscreen?: () => Promise<void> | void;
        };
        const fullscreenNow = Boolean(document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);

        if (!fullscreenNow) {
            const enter = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
            if (enter) {
                await Promise.resolve(enter.call(root));
            }
            return;
        }

        const exit = document.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
        if (exit) {
            await Promise.resolve(exit.call(document));
        }
    }, []);

    const handleNativeBackNavigation = React.useCallback(async () => {
        if (showImageManager) {
            setShowImageManager(false);
            return true;
        }
        if (showWorldbookManager) {
            closeWorldbookManager();
            return true;
        }
        if (showNovelDecompositionWorkbench) {
            closeNovelDecompositionWorkbench();
            return true;
        }
        if (showNovelExport) {
            closeNovelExport();
            return true;
        }
        if (showMobileMusic) {
            closeMobileMusic();
            return true;
        }
        if (safeShowSaveLoad.show) {
            closeSaveLoad();
            return true;
        }
        if (state.showSettings) {
            closeSettings();
            return true;
        }
        if (activeMobileWindowId) {
            closeAllPanels();
            return true;
        }
        if (state.view === 'new_game') {
            state.setView('home');
            return true;
        }
        if (isFullscreen) {
            await toggleAppFullscreen();
            return true;
        }

        return false;
    }, [
        activeMobileWindowId,
        closeAllPanels,
        closeMobileMusic,
        closeNovelDecompositionWorkbench,
        closeNovelExport,
        closeSaveLoad,
        closeSettings,
        closeWorldbookManager,
        isFullscreen,
        showImageManager,
        showMobileMusic,
        showNovelDecompositionWorkbench,
        showNovelExport,
        showWorldbookManager,
        state,
        toggleAppFullscreen
    ]);

    const mobileBackNavigationRef = React.useRef(handleNativeBackNavigation);
    const apiConfigRef = React.useRef(state.apiConfig);
    apiConfigRef.current = state.apiConfig;
    const worldRef = React.useRef(state.世界);
    worldRef.current = state.世界;

    React.useEffect(() => {
        mobileBackNavigationRef.current = handleNativeBackNavigation;
    }, [handleNativeBackNavigation]);

    React.useEffect(() => {
        if (!isNativeCapacitorEnvironment()) return;

        let cancelled = false;
        let removeListener: (() => Promise<void>) | null = null;

        void CapacitorApp.addListener('backButton', () => {
            void handleNativeBackNavigation();
        }).then((listener) => {
            if (cancelled) {
                void listener.remove();
                return;
            }
            removeListener = () => listener.remove();
        });

        return () => {
            cancelled = true;
            if (removeListener) {
                void removeListener();
            }
        };
    }, [handleNativeBackNavigation]);

    React.useEffect(() => {
        if (typeof window === 'undefined' || !isMobile) return;

        const historyStateKey = '__mrjhMobileBackTrap';

        if (!window.history.state || !window.history.state[historyStateKey]) {
            window.history.pushState(
                { ...(window.history.state || {}), [historyStateKey]: Date.now() },
                '',
                window.location.href
            );
        }

        const handlePopState = () => {
            void (async () => {
                const handled = await mobileBackNavigationRef.current();
                if (handled) {
                    window.history.pushState(
                        { ...(window.history.state || {}), [historyStateKey]: Date.now() },
                        '',
                        window.location.href
                    );
                }
            })();
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isMobile]);

    React.useEffect(() => {
        if (!启用修炼体系 && state.showKungfu) {
            setters.setShowKungfu(false);
        }
    }, [启用修炼体系, setters, state.showKungfu]);
    const appUpdateProgressPercent = React.useMemo(() => {
        const explicitPercent = Number(appUpdateProgress?.percent || 0);
        if (Number.isFinite(explicitPercent) && explicitPercent > 0) {
            return Math.max(0, Math.min(100, explicitPercent));
        }
        const downloaded = Number(appUpdateProgress?.downloadedBytes || 0);
        const total = Number(appUpdateProgress?.totalBytes || 0);
        if (total > 0) {
            return Math.max(0, Math.min(100, (downloaded / total) * 100));
        }
        return appUpdateProgress?.stage === 'completed' ? 100 : 0;
    }, [appUpdateProgress]);

    const appUpdateStageText = React.useMemo(() => {
        switch (appUpdateProgress?.stage) {
            case 'preparing':
                return '准备中';
            case 'downloading':
                return '下载中';
            case 'downloaded':
                return '下载完成';
            case 'installing':
                return '拉起安装';
            case 'completed':
                return '等待安装';
            case 'error':
                return '更新失败';
            default:
                return '处理中';
        }
    }, [appUpdateProgress]);
    const legacyImageMigrationNoticeVisible = !legacyImageMigrationNoticeClosed && (
        legacyImageMigrationStatus.stage === 'scanning'
        || legacyImageMigrationStatus.stage === 'running'
        || (
            (legacyImageMigrationStatus.stage === 'completed' || legacyImageMigrationStatus.stage === 'partial_failed' || legacyImageMigrationStatus.stage === 'failed')
            && (legacyImageMigrationStatus.totalAssets > 0 || legacyImageMigrationStatus.migratedAssets > 0 || legacyImageMigrationStatus.failedAssets > 0)
        )
    );
    const legacySaveLineageMigrationNoticeVisible = !legacySaveLineageMigrationNoticeClosed && (
        legacySaveLineageMigrationStatus.stage === 'scanning'
        || legacySaveLineageMigrationStatus.stage === 'running'
        || (
            (legacySaveLineageMigrationStatus.stage === 'completed' || legacySaveLineageMigrationStatus.stage === 'failed')
            && (legacySaveLineageMigrationStatus.legacySaves > 0 || legacySaveLineageMigrationStatus.convertedSaves > 0 || legacySaveLineageMigrationStatus.failedSaves > 0)
        )
    );

    return (
        <MusicProvider visualConfig={effectiveVisualConfig} onSaveVisual={actions.saveVisualSettings}>
            <div className={`h-screen w-screen max-w-full min-w-0 bg-ink-black relative flex flex-col transition-colors duration-500 ${state.view === 'home' ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden'} ${isMobile ? 'p-0' : 'p-3'}`} style={appRootStyleVars}>
                {fontFaceStyleText && <style>{fontFaceStyleText}</style>}
                {legacyImageMigrationNoticeVisible && (
                    <旧图迁移提示条
                        status={legacyImageMigrationStatus}
                        onClose={() => setLegacyImageMigrationNoticeClosed(true)}
                    />
                )}
                {legacySaveLineageMigrationNoticeVisible && (
                    <旧存档谱系迁移提示条
                        status={legacySaveLineageMigrationStatus}
                        onClose={() => setLegacySaveLineageMigrationNoticeClosed(true)}
                    />
                )}
            
            {/* View Switching */}
            {state.view === 'home' && (
                <LandingPage 
                    onStart={handleStartFromLanding}
                    onLoad={openLoad}
                    onCloudPlay={openCloudPlay}
                    onImageManager={openImageManagerWithCheck}
                    onWorldbookManager={openWorldbookManager}
                    onNovelDecomposition={() => { void openNovelDecompositionWorkbench(); }}
                    onRequireWorkshopLogin={openCloudPlayForWorkshopLogin}
                    onSettings={openSettings}
                    onOpenReleaseNotes={openReleaseNotes}
                    currentTheme={state.currentTheme}
                    onThemeChange={setters.setCurrentTheme}
                    hasSave={state.hasSave}
                    apiConfig={state.apiConfig}
                    releaseInfo={runtimeReleaseInfo}
                />
            )}

            {state.view === 'new_game' && (
                <懒加载边界>
                    {isMobile ? (
                        <MobileNewGameWizard
                            onComplete={(worldConfig, charData, openingConfig, mode, openingStreaming, openingExtraPrompt, activeModuleExtraRules) =>
                                actions.handleGenerateWorld(worldConfig, charData, openingConfig, mode, openingStreaming, openingExtraPrompt, undefined, activeModuleExtraRules)
                            }
                            onCancel={() => { state.setView('home'); }}
                            loading={state.loading}
                            apiConfig={state.apiConfig}
                            requestConfirm={requestConfirm}
                            isStreamingDefault={!(state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.主剧情非流式输出)}
                        />
                    ) : (
                        <NewGameWizard
                            onComplete={(worldConfig, charData, openingConfig, mode, openingStreaming, openingExtraPrompt, activeModuleExtraRules) =>
                                actions.handleGenerateWorld(worldConfig, charData, openingConfig, mode, openingStreaming, openingExtraPrompt, undefined, activeModuleExtraRules)
                            }
                            onCancel={() => { state.setView('home'); }}
                            loading={state.loading}
                            apiConfig={state.apiConfig}
                            requestConfirm={requestConfirm}
                            isStreamingDefault={!(state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.主剧情非流式输出)}
                        />
                    )}
                </懒加载边界>
            )}

            {state.view === 'game' && (
                <ModalErrorBoundary title="主界面渲染失败">
                {/* Main Game Frame Container */}
                <div className={`relative flex-1 flex flex-col w-full h-full overflow-hidden bg-ink-black ${isMobile ? 'rounded-none shadow-none' : 'rounded-2xl shadow-2xl'}`}>
                    {isMobile && (
                        <div className="absolute right-2 top-[calc(var(--app-safe-top,env(safe-area-inset-top,0px))+10px)] z-[90] flex flex-col gap-1.5">
                            <button
                                type="button"
                                onClick={() => { void toggleAppFullscreen(); }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-wuxia-gold/35 bg-black/75 text-[0px] text-wuxia-gold shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                                aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                                title={isFullscreen ? '退出全屏' : '进入全屏'}
                            >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H3v5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 21H3v-5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 21h5v-5" />
                                </svg>
                                {isFullscreen ? '退出全屏' : '全屏'}
                            </button>

                            <button
                                type="button"
                                onClick={() => { void handleReturnToHomeWithAutoSave(); }}
                                disabled={returnHomeSaving}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-400/35 bg-black/75 text-[0px] text-sky-100 shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm disabled:cursor-wait disabled:opacity-70"
                                aria-label={returnHomeSaving ? '正在保存存档中' : '自动存档后返回主界面'}
                                title={returnHomeSaving ? '正在保存存档中' : '自动存档后返回主界面'}
                            >
                                {returnHomeSaving ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border border-sky-100/35 border-t-sky-100" aria-hidden="true" />
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 7 5 12l5 5" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h9a5 5 0 0 1 5 5" />
                                    </svg>
                                )}
                                {returnHomeSaving ? '正在保存存档中' : '返回主页'}
                            </button>
                        </div>
                    )}

                    {/* 顶部导航栏 */}
                    <div className={`shrink-0 z-40 bg-ink-black/90 border-b border-wuxia-gold/20 shadow-[0_10px_30px_rgba(0,0,0,0.8)] relative overflow-visible ${isMobile ? 'h-0 border-b-0 bg-transparent shadow-none rounded-none mx-0 mt-0' : 'rounded-t-xl mx-1 mt-1'}`}>
                        <TopBar 
                            环境={state.环境} 
                            游戏初始时间={state.游戏初始时间}
                            timeFormat={effectiveTopBarTimeFormat}
                            festivals={state.festivals}
                            visualConfig={effectiveVisualConfig}
                        />
                    </div>

                    {/* 中间主要互动区域 */}
                    <div className={`flex-1 flex overflow-hidden relative z-10 ${isMobile ? 'mx-0 mb-0' : 'mx-1 mb-1'}`}>
                        
                        {/* 左侧栏 */}
                        <div className="hidden md:block w-[14.285714%] h-full relative z-20 bg-ink-black/95 border-r border-wuxia-gold/20 flex flex-col shadow-[10px_0_20px_rgba(0,0,0,0.5)]">
                            <LeftPanel
                                角色={state.角色}
                                onOpenCharacter={openCharacter}
                                onOpenVariableManager={openVariableManager}
                                onUploadAvatar={actions.updatePlayerAvatar}
                                visualConfig={effectiveVisualConfig}
                                gameConfig={state.gameConfig}
                                openingConfig={state.开局配置}
                                latestCommands={latestAssistantMessage?.structuredResponse?.tavern_commands || []}
                            />
                        </div>

                        {/* 中间栏 - Chat Area */}
                        <div className="flex-1 flex flex-col relative z-0 min-w-0 transition-colors duration-500">
                            {当前背景图片地址 && (
                                <div
                                    className={`absolute inset-0 z-0 bg-cover bg-center pointer-events-none transition-opacity duration-300 ${
                                        chatContentHidden ? 'opacity-100' : 'opacity-35'
                                    }`}
                                    style={{ backgroundImage: `url(${当前背景图片地址})` }}
                                ></div>
                            )}
                            <div
                                className={`absolute inset-0 z-0 bg-gradient-to-b from-white/12 via-white/5 to-white/12 pointer-events-none transition-opacity duration-300 ${
                                    chatContentHidden ? 'opacity-0' : 'opacity-100'
                                }`}
                            ></div>
                              <div className={isMobile ? 'fixed right-2 top-[calc(var(--app-safe-top,env(safe-area-inset-top,0px))+72px)] z-[91] flex items-center gap-2' : 'absolute right-3 top-3 z-30 flex items-center gap-2'}>
                                  <div
                                      className={`app-play-mode-badge hidden items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur sm:inline-flex ${
                                          currentCloudPlayMode === 'object'
                                              ? 'border-sky-300/45 bg-sky-950/75 text-sky-100'
                                              : currentCloudPlayMode === 'tg'
                                                  ? 'border-emerald-300/45 bg-emerald-950/75 text-emerald-100'
                                                  : 'border-wuxia-gold/40 bg-black/65 text-wuxia-gold'
                                      }`}
                                      title={playModeHint}
                                  >
                                      {playModeLabel}
                                  </div>
                                  <div
                                      className="hidden max-w-[360px] items-center truncate rounded-full border border-wuxia-gold/40 bg-black/65 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-wuxia-gold shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur sm:inline-flex"
                                      title={mainStoryApiLabel}
                                  >
                                      <span className="truncate">{mainStoryApiLabel}</span>
                                  </div>
                                  {chatContentHidden && (
                                      <button
                                          type="button"
                                          onClick={() => {
                                              setSceneQuickGenHint(true);
                                              setSceneQuickGenToastVisible(true);
                                              window.setTimeout(() => setSceneQuickGenHint(false), 1200);
                                              window.setTimeout(() => setSceneQuickGenToastVisible(false), 2000);
                                              void actions.generateSceneImageManually();
                                          }}
                                          className={`inline-flex h-[27px] w-[27px] items-center justify-center rounded-full border bg-black/55 backdrop-blur-sm transition-colors hover:text-white ${sceneQuickGenHint ? 'border-emerald-300 text-emerald-100 ring-2 ring-emerald-300/60 animate-pulse' : 'border-emerald-600/60 text-emerald-100 hover:border-emerald-400'}`}
                                          title="一键生成当前场景"
                                          aria-label="一键生成当前场景"
                                      >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[14px] w-[14px]">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5 8.5 16 19 5.5" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 12h4" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 17v4" />
                                          </svg>
                                      </button>
                                  )}
                                  <button
                                      type="button"
                                      onClick={() => setChatContentHidden(prev => !prev)}
                                      className="inline-flex h-[27px] w-[27px] items-center justify-center rounded-full border border-sky-700/60 bg-black/55 text-sky-100 backdrop-blur-sm transition-colors hover:border-sky-400 hover:text-white"
                                      title={chatContentHidden ? '显示正文内容' : '隐藏正文内容，仅查看壁纸'}
                                      aria-label={chatContentHidden ? '显示正文内容' : '隐藏正文内容，仅查看壁纸'}
                                  >
                                      {chatContentHidden ? (
                                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[14px] w-[14px]">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z" />
                                              <circle cx="12" cy="12" r="2.75" />
                                          </svg>
                                      ) : (
                                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[14px] w-[14px]">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5c2.2 2.5 5.24 3.75 9 3.75s6.8-1.25 9-3.75" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.5 7 12.7" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 15.5-2.5-2.8" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 16.5 10 13" />
                                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.5 16.5-.5-3.5" />
                                          </svg>
                                      )}
                                  </button>
                              </div>
                            <div
                                className={`relative z-10 flex min-h-0 flex-1 flex-col transition-opacity duration-300 ${
                                    chatContentHidden ? 'pointer-events-none select-none opacity-0' : 'opacity-100'
                                }`}
                                aria-hidden={chatContentHidden}
                            >
                                <ChatList 
                                    history={state.历史记录} 
                                    loading={state.loading} 
                                    scrollRef={state.scrollRef}
                                    onUpdateHistory={actions.updateHistoryItem} 
                                    onPolishTurn={actions.handlePolishTurn}
                                    visualConfig={effectiveVisualConfig}
                                    socialList={state.社交}
                                    playerProfile={playerProfile}
                                    onOpenNpcDetail={openNpcDetailFromChat}
                                    inventoryItems={Array.isArray(state.角色?.物品列表) ? state.角色.物品列表 : []}
                                    onOpenInventoryItem={openInventoryItemFromChat}
                                    renderCount={effectiveVisualConfig.渲染层数}
                                    suppressAutoScrollToken={meta.chatScrollSuppressToken}
                                    forceScrollToken={meta.chatForceScrollToken}
                                    variableGenerationRunning={meta.variableGenerationRunning}
                                    onTavernAction={handleTavernAction}
                                />
                                <InputArea 
                                    onSend={actions.handleSend} 
                                    onStop={actions.handleStop}
                                    onCancelVariableGeneration={actions.handleCancelVariableGeneration}
                                    onRetryLatestVariableGeneration={actions.handleRetryLatestVariableGeneration}
                                    onRegenerate={actions.handleRegenerate}
                                    onRecoverParseErrorRaw={actions.handleRecoverFromParseErrorRaw}
                                    onQuickRestart={actions.handleQuickRestart}
                                    requestConfirm={requestConfirm}
                                    loading={state.loading} 
                                    variableGenerationRunning={meta.variableGenerationRunning}
                                    postStoryQueueRunning={meta.postStoryQueueRunning}
                                    canReroll={meta.canRerollLatest}
                                    reRollCount={meta.reRollCount}
                                    canRetryLatestVariableGeneration={meta.canRetryLatestVariableGeneration}
                                    canQuickRestart={meta.canQuickRestart}
                                     openingWorldEvolutionProgress={meta.openingWorldEvolutionProgress}
                                     openingPlanningProgress={meta.openingPlanningProgress}
                                     openingVariableGenerationProgress={meta.openingVariableGenerationProgress}
                                     openingPolishProgress={meta.openingPolishProgress}
                                     openingMainStoryProgress={meta.openingMainStoryProgress}
                                     openingMapUpdateProgress={meta.openingMapUpdateProgress}
                                     mainStoryModelInfo={mainStoryApiInfo}
                                     externalDraft={chatDraftRequest}
                                     options={currentOptions}
                                     isStreamingDefault={!(state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.主剧情非流式输出)}
                                     stageStreamMode={{
                                         main: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.主剧情非流式输出 ? 'non-stream' : 'stream',
                                         polish: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.文章优化非流式输出 ? 'non-stream' : 'stream',
                                         variable: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.变量计算非流式输出 ? 'non-stream' : 'stream',
                                         world: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.世界演变非流式输出 ? 'non-stream' : 'stream',
                                         planning: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.规划分析非流式输出 ? 'non-stream' : 'stream',
                                         map: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.地图自动更新非流式输出 ? 'non-stream' : 'stream',
                                         recall: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.剧情回忆非流式输出 ? 'non-stream' : 'stream',
                                         summary: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.记忆总结非流式输出 ? 'non-stream' : 'stream',
                                         refine: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.记忆精炼非流式输出 ? 'non-stream' : 'stream',
                                         novel: state.gameConfig?.启用非流式输出 || state.apiConfig?.功能模型占位?.小说拆分非流式输出 ? 'non-stream' : 'stream',
                                     }}
                                 />
                            </div>
                            {sceneQuickGenToastVisible && (
                                <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
                                    <div
                                        className="rounded-xl border border-emerald-400/40 bg-black/75 px-4 py-2 font-semibold tracking-[0.18em] text-emerald-100 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur"
                                        style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}
                                    >
                                        已提交场景生图请求
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 右侧栏 */}
                        <div className="hidden md:block h-full w-[var(--desktop-side-menu-width)] shrink-0 relative z-20 bg-ink-black/95 border-l border-wuxia-gold/20 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.5)]">
                            <RightPanel 
                                onOpenSettings={openSettings} 
                                onOpenInventory={openInventory}
                                onOpenEquipment={openEquipment} 
                                onOpenBattle={openBattle}
                                onOpenTeam={openTeam}
                                onOpenSocial={openSocial}
                                onOpenKungfu={openKungfu}
                                onOpenWorld={openWorld}
                                onOpenMap={openMap}
                                onOpenSect={openSect}
                                onOpenTask={openTask} 
                                onOpenAgreement={openAgreement} 
                                onOpenStory={openStory}
                                onOpenHeroinePlan={openHeroinePlan}
                                onOpenMemory={openMemory}
                                onOpenNovelExport={openNovelExport}
                                onOpenAuctionHouse={openAuctionHouse}
                                auctionHouseLabel={当前题材市场名称}
                                sectLabel={组织入口显示名称}
                                uiLabels={题材界面文案}
                                onOpenImageManager={openImageManagerWithCheck}
                                onOpenNovelDecomposition={() => { void openNovelDecompositionWorkbench(); }}
                                worldEvolutionEnabled={meta.worldEvolutionEnabled}
                                worldEvolutionUpdating={meta.worldEvolutionUpdating}
                                enableWorldPanel={state.apiConfig?.功能模型占位?.世界演变功能启用 !== false}
                                enableHeroinePlan={safeGameConfig?.启用女主剧情规划 === true}
                                enablePlanningPanel={state.apiConfig?.功能模型占位?.规划分析功能启用 !== false}
                                enableKungfu={启用修炼体系}
                                kungfuLabel={功法显示名称}
                                onSave={openSave}
                                onLoad={openLoad}
                                onReturnToHome={() => { void handleReturnToHomeWithAutoSave(); }}
                                returnHomeSaving={returnHomeSaving}
                                visualConfig={effectiveVisualConfig}
                                latestChangedSections={latestChangedSections}
                            />
                        </div>

                        {desktopRightDetailPanelOpen && (
                            <div
                                className="hidden md:block h-full shrink-0 border-l border-wuxia-gold/20 bg-black/40"
                                style={{ width: 'var(--desktop-right-detail-width)' }}
                                aria-hidden="true"
                            />
                        )}
                    </div>

                    {desktopRightDetailPanelOpen && (
                        <>
                            {!desktopDetailFullscreen && (
                                <div
                                    className="desktop-detail-resize-handle"
                                    role="separator"
                                    aria-label="拖拽调整详情栏宽度"
                                    title="拖拽调整详情栏宽度，双击恢复本页默认宽度"
                                    onPointerDown={startDesktopDetailResize}
                                    onDoubleClick={resetDesktopDetailWidth}
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => desktopDetailFullscreen ? exitDesktopDetailFullscreen() : setDesktopDetailFullscreen(true)}
                                className={`desktop-detail-expand-toggle${desktopDetailFullscreen ? ' desktop-detail-expand-toggle--fullscreen' : ''}`}
                                aria-label={desktopDetailFullscreen ? '退出详情全屏' : '向左展开详情'}
                                title={desktopDetailFullscreen ? '退出详情全屏' : '向左展开详情'}
                            >
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    {desktopDetailFullscreen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m15 6-6 6 6 6" />
                                    )}
                                </svg>
                            </button>
                            {!desktopDetailFullscreen && (
                                <button
                                    type="button"
                                    onClick={collapseDesktopDetailToInitial}
                                    className="desktop-detail-collapse-toggle"
                                    aria-label="回到初始状态"
                                    title="回到初始状态"
                                >
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                                    </svg>
                                </button>
                            )}
                        </>
                    )}

                    {returnHomeSaving && (
                        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-[#f8f4e8]/72 px-6 py-10 text-center text-stone-900 backdrop-blur-[2px]">
                            <div className="max-w-sm rounded-lg border border-amber-900/20 bg-[#fff9ec]/95 px-6 py-5 shadow-[0_18px_50px_rgba(70,45,15,0.22)]">
                                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-900/25 border-t-amber-800" aria-hidden="true" />
                                <div className="font-serif text-lg font-bold text-amber-950">正在保存存档中</div>
                                <div className="mt-2 text-sm leading-6 text-stone-700">正在保存当前进度并同步存档，完成后会自动返回首页。</div>
                            </div>
                        </div>
                    )}

                    {meta.notifications && meta.notifications.length > 0 && (
                        <div className="fixed right-4 bottom-16 md:bottom-14 z-[10000] flex flex-col gap-2 pointer-events-none">
                            {meta.notifications.map((toast) => (
                                <div
                                    key={toast.id}
                                    className={`pointer-events-auto w-[280px] rounded-xl border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md ${
                                        toast.tone === 'success'
                                            ? 'border-emerald-600/50 bg-emerald-950/85 text-emerald-100'
                                            : toast.tone === 'error'
                                                ? 'border-red-600/50 bg-red-950/85 text-red-100'
                                                : 'border-sky-600/50 bg-sky-950/85 text-sky-100'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {toast.previewUrl && (
                                            <div className="shrink-0 h-16 w-16 overflow-hidden rounded-lg border border-white/20 bg-black/25">
                                                <img
                                                    src={toast.previewUrl}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                    loading="lazy"
                                                />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold" style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}>{toast.title}</div>
                                            <div className="mt-1 opacity-90" style={{ fontSize: 'var(--ui-compact-font-size, 14px)', lineHeight: '1.55' }}>{toast.message}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => actions.dismissNotification(toast.id)}
                                            className="shrink-0 opacity-70 hover:opacity-100"
                                            style={{ fontSize: 'var(--ui-micro-font-size, 12px)' }}
                                        >
                                            关闭
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 移动端快捷菜单 */}
                    <MobileQuickMenu
                        activeWindow={activeMobileWindowId}
                        onMenuClick={handleMobileMenuAction}
                        enableWorldPanel={state.apiConfig?.功能模型占位?.世界演变功能启用 !== false}
                        enableHeroinePlan={safeGameConfig?.启用女主剧情规划 === true}
                        enablePlanningPanel={state.apiConfig?.功能模型占位?.规划分析功能启用 !== false}
                        enableKungfu={启用修炼体系}
                        enableImageManager={true}
                        enableNovelDecomposition={true}
                        auctionHouseLabel={当前题材市场名称}
                        sectLabel={组织入口显示名称}
                        uiLabels={题材界面文案}
                    />

                    {!hideBottomTicker && (
                        <div
                            className={`md:hidden shrink-0 h-[28px] bg-ink-black/88 border-t border-wuxia-gold/20 flex items-center font-mono text-wuxia-gold-dark relative overflow-hidden pb-[var(--app-safe-bottom,env(safe-area-inset-bottom,0px))] ${isMobile ? 'mx-0 mb-0' : 'mx-1 mb-1'}`}
                            style={{ fontSize: '11px' }}
                        >
                            <button type="button" onClick={openWorld} className="shrink-0 h-full px-2 flex items-center border-r border-gray-800 text-wuxia-gold/90 tracking-[0.18em] text-transparent relative hover:bg-wuxia-gold/10 transition-colors">
                                <span className="absolute inset-0 flex items-center px-2 text-wuxia-gold/90">世界大事</span>
                                世界大事
                            </button>
                            <div className="flex-1 overflow-hidden relative h-full flex items-center">
                                <div className="absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-ink-black to-transparent z-10 pointer-events-none"></div>
                                <div className="absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-ink-black to-transparent z-10 pointer-events-none"></div>
                                {tickerEvents && tickerEvents.length > 0 ? (
                                    <div className="w-full overflow-hidden">
                                        <div
                                            className="flex items-center gap-8 whitespace-nowrap min-w-max animate-marquee-linear text-wuxia-gold/70 tracking-wide"
                                            style={{ ['--marquee-duration' as any]: '28s', fontSize: 'var(--ui-compact-mono-font-size, 12px)' }}
                                        >
                                            <div className="flex items-center gap-8">
                                                {renderTickerItems(tickerEvents, 'm')}
                                            </div>
                                            <div className="flex items-center gap-8" aria-hidden>
                                                {renderTickerItems(tickerEvents, 'm-dup')}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full text-center text-gray-700 tracking-wider text-transparent relative" style={{ fontSize: 'var(--ui-compact-mono-font-size, 12px)' }}>
                                        <span className="absolute inset-0 flex items-center justify-center text-gray-700">江湖平静，暂时无大事发生...</span>
                                        江湖平静，暂无大事发生...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!hideBottomTicker && (
                        <div
                            className="hidden md:flex shrink-0 h-[37px] bg-ink-black/90 border-t border-wuxia-gold/20 justify-between px-4 items-center font-mono text-wuxia-gold-dark z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.8)] relative rounded-b-xl mx-1 mb-1 overflow-hidden"
                            style={{ fontSize: 'var(--ui-compact-mono-font-size, 12px)' }}
                        >
                            <button type="button" onClick={openWorld} className="shrink-0 text-wuxia-gold font-bold mr-2 z-20 bg-ink-black/90 px-2 flex items-center h-full border-r border-gray-800 text-transparent relative hover:bg-wuxia-gold/10 transition-colors cursor-pointer">
                                <span className="absolute inset-0 flex items-center px-2 text-wuxia-gold">【世界大事】</span>
                                【世界大事】
                            </button>

                            <div className="flex-1 overflow-hidden relative h-full flex items-center mx-2">
                                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-ink-black to-transparent z-10 pointer-events-none"></div>
                                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-ink-black to-transparent z-10 pointer-events-none"></div>

                                {tickerEvents && tickerEvents.length > 0 ? (
                                    <div className="w-full overflow-hidden">
                                        <div
                                            className="flex items-center gap-10 whitespace-nowrap min-w-max animate-marquee-linear text-wuxia-gold/70 font-mono tracking-wider"
                                            style={{ ['--marquee-duration' as any]: '36s', fontSize: 'var(--ui-compact-mono-font-size, 12px)' }}
                                        >
                                            <div className="flex items-center gap-10">
                                                {renderTickerItems(tickerEvents, 'd')}
                                            </div>
                                            <div className="flex items-center gap-10" aria-hidden>
                                                {renderTickerItems(tickerEvents, 'd-dup')}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full text-center text-gray-700 font-mono tracking-widest text-transparent relative" style={{ fontSize: 'var(--ui-compact-mono-font-size, 12px)' }}>
                                        <span className="absolute inset-0 flex items-center justify-center text-gray-700">江湖平静，暂时无大事发生...</span>
                                        江湖平静，暂无大事发生...
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 text-wuxia-gold font-bold ml-2 z-20 bg-ink-black/90 px-2 flex items-center h-full border-l border-gray-800 text-transparent relative">
                                <span className="absolute inset-0 flex items-center px-2 text-wuxia-gold">【V{runtimeReleaseInfo.versionName}】</span>
                                【V{runtimeReleaseInfo.versionName}】
                            </div>
                        </div>
                    )}
                    {/* Mobile Music Player Drawer */}
                    {isMobile && showMobileMusic && (
                        <懒加载边界>
                            <MobileMusicPlayer 
                                open={true}
                                onClose={closeMobileMusic} 
                            />
                        </懒加载边界>
                    )}
                </div>
                </ModalErrorBoundary>
            )}

            {/* Global Golden Border Frame */}
            {!isMobile && <div className="global-golden-frame pointer-events-none fixed inset-3 z-[100] border-4 border-double border-wuxia-gold/40 rounded-2xl shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                {/* Corner Ornaments */}
                <div className="global-golden-frame-corner absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-wuxia-gold rounded-tl-xl shadow-[-2px_-2px_5px_rgba(0,0,0,0.5)]"></div>
                <div className="global-golden-frame-corner absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-wuxia-gold rounded-tr-xl shadow-[2px_-2px_5px_rgba(0,0,0,0.5)]"></div>
                <div className="global-golden-frame-corner absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-wuxia-gold rounded-bl-xl shadow-[-2px_2px_5px_rgba(0,0,0,0.5)]"></div>
                <div className="global-golden-frame-corner absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-wuxia-gold rounded-br-xl shadow-[2px_2px_5px_rgba(0,0,0,0.5)]"></div>
                
                {/* Mid-point Accents */}
                <div className="global-golden-frame-accent absolute top-1/2 left-0 w-1 h-12 -translate-y-1/2 bg-wuxia-gold/60"></div>
                <div className="global-golden-frame-accent absolute top-1/2 right-0 w-1 h-12 -translate-y-1/2 bg-wuxia-gold/60"></div>
            </div>}

            {/* Save/Load Modal */}
            {safeShowSaveLoad.show && (
                <div className={desktopRightDetailClass}>
                <懒加载边界>
                    <SaveLoadModal 
                        onClose={closeSaveLoad}
                        onLoadGame={actions.handleLoadGame}
                        onSaveGame={actions.handleSaveGame}
                        mode={safeShowSaveLoad.mode}
                        requestConfirm={requestConfirm}
                    />
                </懒加载边界>
                </div>
            )}

            {showCloudPlay && (
                <div className={desktopRightDetailClass || 'fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm'}>
                <懒加载边界>
                    <div className={desktopRightDetailClass ? 'h-full w-full' : 'h-[min(760px,92vh)] w-full max-w-5xl'}>
                        <CloudPlayModal
                            onClose={closeCloudPlay}
                            onLoadGame={actions.handleLoadGame}
                            onStartNewGame={handleStartFromCloudPlay}
                            onConfigureObjectStorage={openObjectStorageSettingsFromCloudPlay}
                        />
                    </div>
                </懒加载边界>
                </div>
            )}

            {/* Settings Modal */}
            {state.showSettings && (
                <div className={desktopRightDetailClass}>
                <懒加载边界>
                    {isMobile ? (
                        <MobileSettingsModal
                            activeTab={state.activeTab}
                            onTabChange={setters.setActiveTab}
                            onClose={closeSettings}
                            apiConfig={state.apiConfig}
                            visualConfig={state.visualConfig}
                            gameConfig={state.gameConfig}
                            memoryConfig={state.memoryConfig}
                            prompts={state.prompts}
                            festivals={state.festivals}
                            currentTheme={state.currentTheme}
                            history={state.历史记录}
                            memorySystem={state.记忆系统}
                            socialList={state.社交}
                            runtimeState={runtimeStateSections}
                            gameInitialTime={state.游戏初始时间}
                            currentGameTime={currentEnvTime}
                            journeyDayCount={currentJourneyDayCount}
                            currentStory={state.剧情}
                            openingConfig={state.开局配置}
                            contextSnapshot={contextSnapshot}
                            onSaveApi={actions.saveSettings}
                            onSaveVisual={actions.saveVisualSettings}
                            onSaveGame={actions.saveGameSettings}
                            onSaveMemory={actions.saveMemorySettings}
                            onDeleteMemory={handleDeleteMemory}
                            onRefineMemories={stableRefineMemories}
                            onRegenerateMapFromMemory={handleRegenerateMapFromMemory}
                            onCreateNpc={actions.createNpcManually}
                            onSaveNpc={actions.updateNpcManually}
                            onDeleteNpc={actions.deleteNpcManually}
                            onRestoreNpcBackup={actions.restoreNpcVariableBackup}
                            onStartNpcMemorySummary={actions.handleQueueManualNpcMemorySummary}
                            onUploadNpcImage={actions.uploadNpcImageToSlot}
                            onReplaceVariableSection={actions.updateRuntimeVariableSection}
                            onApplyVariableCommand={actions.applyRuntimeVariableCommand}
                            onRepairGameInitialTime={actions.修正游戏初始时间}
                            onUpdatePrompts={actions.updatePrompts}
                            onUpdateFestivals={actions.updateFestivals}
                            onThemeChange={setters.setCurrentTheme}
                            requestConfirm={requestConfirm}
                            onReturnToHome={handleReturnToHomeFromSettings}
                            isHome={state.view === 'home'}
                            returnHomeSaving={returnHomeSaving}
                        />
                    ) : (
                        <SettingsModal
                            activeTab={state.activeTab}
                            onTabChange={setters.setActiveTab}
                            onClose={closeSettings}
                            apiConfig={state.apiConfig}
                            visualConfig={state.visualConfig}
                            gameConfig={state.gameConfig}
                            memoryConfig={state.memoryConfig}
                            prompts={state.prompts}
                            festivals={state.festivals}
                            currentTheme={state.currentTheme}
                            history={state.历史记录}
                            memorySystem={state.记忆系统}
                            socialList={state.社交}
                            runtimeState={runtimeStateSections}
                            gameInitialTime={state.游戏初始时间}
                            currentGameTime={currentEnvTime}
                            journeyDayCount={currentJourneyDayCount}
                            currentStory={state.剧情}
                            openingConfig={state.开局配置}
                            contextSnapshot={contextSnapshot}
                            onSaveApi={actions.saveSettings}
                            onSaveVisual={actions.saveVisualSettings}
                            onSaveGame={actions.saveGameSettings}
                            onSaveMemory={actions.saveMemorySettings}
                            onDeleteMemory={handleDeleteMemory}
                            onRefineMemories={handleRefineMemories}
                            onRegenerateMapFromMemory={handleRegenerateMapFromMemory}
                            onCreateNpc={actions.createNpcManually}
                            onSaveNpc={actions.updateNpcManually}
                            onDeleteNpc={actions.deleteNpcManually}
                            onRestoreNpcBackup={actions.restoreNpcVariableBackup}
                            onStartNpcMemorySummary={actions.handleQueueManualNpcMemorySummary}
                            onUploadNpcImage={actions.uploadNpcImageToSlot}
                            onReplaceVariableSection={actions.updateRuntimeVariableSection}
                            onApplyVariableCommand={actions.applyRuntimeVariableCommand}
                            onRepairGameInitialTime={actions.修正游戏初始时间}
                            onUpdatePrompts={actions.updatePrompts}
                            onUpdateFestivals={actions.updateFestivals}
                            onThemeChange={setters.setCurrentTheme}
                            requestConfirm={requestConfirm}
                            onReturnToHome={handleReturnToHomeFromSettings}
                            isHome={state.view === 'home'}
                            returnHomeSaving={returnHomeSaving}
                        />
                    )}
                </懒加载边界>
                </div>
            )}

            {showWorldbookManager && (
                <懒加载边界>
                    <WorldbookManagerModal
                        builtinPromptEntries={meta.builtinPromptEntries}
                        worldbooks={meta.worldbooks}
                        worldbookPresetGroups={meta.worldbookPresetGroups}
                        onSaveBuiltinPromptEntries={actions.saveBuiltinPromptEntries}
                        onSaveWorldbooks={actions.saveWorldbooks}
                        onSaveWorldbookPresetGroups={actions.saveWorldbookPresetGroups}
                        onClose={() => setShowWorldbookManager(false)}
                        requestConfirm={requestConfirm}
                    />
                </懒加载边界>
            )}

            {showNovelDecompositionWorkbench && (
                <div className={desktopRightDetailClass}>
                <ModalErrorBoundary title="小说分解工作台打开失败" onClose={closeNovelDecompositionWorkbench}>
                <懒加载边界>
                    <NovelDecompositionWorkbenchModal
                        open={showNovelDecompositionWorkbench}
                        settings={state.apiConfig}
                        onSave={actions.saveSettings}
                        onClose={closeNovelDecompositionWorkbench}
                        requestConfirm={requestConfirm}
                        onNotify={actions.pushNotification}
                    />
                </懒加载边界>
                </ModalErrorBoundary>
                </div>
            )}

            {appUpdateProgress?.visible && (
                <div className="fixed inset-0 z-[295] flex items-center justify-center bg-black/72 px-5 py-8 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl border border-wuxia-gold/30 bg-[#0b0907]/95 p-5 text-wuxia-gold shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-base font-semibold tracking-[0.16em]">应用更新</div>
                                <div className="mt-1 text-xs text-wuxia-gold/70">{appUpdateStageText}</div>
                            </div>
                            <div className="text-sm font-semibold text-wuxia-gold/90">
                                {appUpdateProgressPercent.toFixed(0)}%
                            </div>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full border border-wuxia-gold/10 bg-black/50">
                            <div
                                className={`h-full transition-all duration-300 ${
                                    appUpdateProgress.stage === 'error'
                                        ? 'bg-gradient-to-r from-red-500/80 to-red-300/80'
                                        : 'bg-gradient-to-r from-wuxia-gold/40 via-wuxia-gold to-wuxia-gold/60'
                                }`}
                                style={{ width: `${appUpdateProgressPercent}%` }}
                            />
                        </div>
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-wuxia-gold/90">
                            {appUpdateProgress.message || '正在处理更新请求...'}
                        </div>
                        {appUpdateProgress.totalBytes && appUpdateProgress.totalBytes > 0 && (
                            <div className="mt-3 text-xs text-wuxia-gold/65">
                                已下载 {Math.max(0, Number(appUpdateProgress.downloadedBytes || 0)).toLocaleString()} / {Math.max(0, Number(appUpdateProgress.totalBytes || 0)).toLocaleString()} 字节
                            </div>
                        )}
                        {appUpdateProgress.stage === 'completed' && (
                            <div className="mt-3 text-xs leading-5 text-emerald-300/90">
                                如果系统安装界面没有自动弹出，请检查"允许安装未知应用"权限后再试一次。
                            </div>
                        )}
                        {appUpdateProgress.stage === 'error' && (
                            <button
                                type="button"
                                onClick={() => setAppUpdateProgress(null)}
                                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-red-300/35 bg-red-950/40 px-4 text-sm text-red-50"
                            >
                                关闭
                            </button>
                        )}
                    </div>
                </div>
            )}

            <ReleaseNotesModal
                open={showReleaseNotes}
                isNativeApp={isNativeCapacitorEnvironment()}
                suppressForToday={suppressReleaseNotesForToday}
                onSuppressForTodayChange={setSuppressReleaseNotesForToday}
                onClose={closeReleaseNotes}
                onPrimaryAction={handleReleaseNotesPrimaryAction}
                onOpenGithub={handleReleaseNotesOpenGithub}
                releaseInfo={runtimeReleaseInfo}
            />

            <InAppConfirmModal
                open={confirmState.open}
                title={confirmState.title}
                message={confirmState.message}
                confirmText={confirmState.confirmText}
                cancelText={confirmState.cancelText}
                danger={confirmState.danger}
                onConfirm={() => resolveConfirm(true)}
                onCancel={() => resolveConfirm(false)}
            />

            {state.view === 'game' && meta.memorySummaryOpen && (
                <懒加载边界>
                    {isMobile ? (
                        <MemorySummaryFlowMobileModal
                            open={true}
                            stage={(meta.memorySummaryStage || 'remind') as 'remind' | 'processing' | 'review'}
                            task={meta.memorySummaryTask || null}
                            draft={meta.memorySummaryDraft || ''}
                            error={meta.memorySummaryError || ''}
                            onStart={() => { void actions.handleStartMemorySummary(); }}
                            onCancel={actions.handleCancelMemorySummary}
                            onBack={actions.handleBackToMemorySummaryRemind}
                            onDraftChange={actions.handleUpdateMemorySummaryDraft}
                            onApply={actions.handleApplyMemorySummary}
                        />
                    ) : (
                        <MemorySummaryFlowModal
                            open={true}
                            stage={(meta.memorySummaryStage || 'remind') as 'remind' | 'processing' | 'review'}
                            task={meta.memorySummaryTask || null}
                            draft={meta.memorySummaryDraft || ''}
                            error={meta.memorySummaryError || ''}
                            onStart={() => { void actions.handleStartMemorySummary(); }}
                            onCancel={actions.handleCancelMemorySummary}
                            onBack={actions.handleBackToMemorySummaryRemind}
                            onDraftChange={actions.handleUpdateMemorySummaryDraft}
                            onApply={actions.handleApplyMemorySummary}
                        />
                    )}
                </懒加载边界>
            )}

            {state.view === 'game' && !meta.memorySummaryOpen && meta.npcMemorySummaryOpen && (
                <懒加载边界>
                    {isMobile ? (
                        <NpcMemorySummaryFlowMobileModal
                            open={true}
                            stage={(meta.npcMemorySummaryStage || 'remind') as 'remind' | 'processing' | 'review'}
                            task={meta.npcMemorySummaryTask || null}
                            queueLength={meta.npcMemorySummaryQueueLength || 0}
                            draft={meta.npcMemorySummaryDraft || ''}
                            error={meta.npcMemorySummaryError || ''}
                            onStart={() => { void actions.handleStartNpcMemorySummary(); }}
                            onCancel={actions.handleCancelNpcMemorySummary}
                            onBack={actions.handleBackToNpcMemorySummaryRemind}
                            onDraftChange={actions.handleUpdateNpcMemorySummaryDraft}
                            onApply={actions.handleApplyNpcMemorySummary}
                        />
                    ) : (
                        <NpcMemorySummaryFlowModal
                            open={true}
                            stage={(meta.npcMemorySummaryStage || 'remind') as 'remind' | 'processing' | 'review'}
                            task={meta.npcMemorySummaryTask || null}
                            queueLength={meta.npcMemorySummaryQueueLength || 0}
                            draft={meta.npcMemorySummaryDraft || ''}
                            error={meta.npcMemorySummaryError || ''}
                            onStart={() => { void actions.handleStartNpcMemorySummary(); }}
                            onCancel={actions.handleCancelNpcMemorySummary}
                            onBack={actions.handleBackToNpcMemorySummaryRemind}
                            onDraftChange={actions.handleUpdateNpcMemorySummaryDraft}
                            onApply={actions.handleApplyNpcMemorySummary}
                        />
                    )}
                </懒加载边界>
            )}

            {showImageManager && (
                <div className={desktopRightDetailClass}>
                <懒加载边界>
                    {isMobile ? (
                        <ModalErrorBoundary title="图册打开失败" onClose={() => setShowImageManager(false)}>
                        <MobileImageManagerModal
                            socialList={state.社交}
                            playerCharacter={state.角色}
                            cultivationSystemEnabled={启用修炼体系}
                            itemImageSequence={itemImageSequence}
                            queue={meta.imageGenerationQueue || []}
                            sceneArchive={meta.sceneImageArchive || {}}
                            sceneQueue={meta.sceneImageQueue || []}
                            apiConfig={state.apiConfig}
                            imageManagerConfig={state.imageManagerConfig}
                            femboyNsfwEnabled={safeGameConfig?.启用NSFW模式 === true && safeGameConfig?.启用男娘NSFW内容 !== false}
                            currentPersistentWallpaper={state.visualConfig?.常驻壁纸 || ''}
                            onSaveApiConfig={actions.saveSettings}
                            onSaveImageManagerConfig={actions.saveImageManagerSettings}
                            onGenerateImage={actions.generateNpcImageManually}
                            onGenerateSecretPartImage={actions.generateNpcSecretPartImage}
                            onRetryImage={actions.retryNpcImageGeneration}
                            onGenerateSceneImage={actions.generateSceneImageManually}
                            onSelectAvatarImage={actions.selectNpcAvatarImage}
                            onSelectPortraitImage={actions.selectNpcPortraitImage}
                            onSelectBackgroundImage={actions.selectNpcBackgroundImage}
                            onClearAvatarImage={actions.clearNpcAvatarImage}
                            onClearPortraitImage={actions.clearNpcPortraitImage}
                            onClearBackgroundImage={actions.clearNpcBackgroundImage}
                            onDeleteImageRecord={actions.removeNpcImageRecord}
                            onClearImageHistory={actions.clearNpcImageHistory}
                            onDeleteQueueTask={actions.removeNpcImageQueueTask}
                            onClearQueue={actions.clearNpcImageQueue}
                            onSaveImageLocally={actions.saveNpcImageLocally}
                            onSelectPlayerAvatarImage={actions.selectPlayerAvatarImage}
                            onClearPlayerAvatarImage={actions.clearPlayerAvatarImage}
                            onSelectPlayerPortraitImage={actions.selectPlayerPortraitImage}
                            onClearPlayerPortraitImage={actions.clearPlayerPortraitImage}
                            onRemovePlayerImageRecord={actions.removePlayerImageRecord}
                            onApplySceneWallpaper={actions.applySceneImageWallpaper}
                            onClearSceneWallpaper={actions.clearSceneWallpaper}
                            onDeleteSceneImage={actions.removeSceneImageRecord}
                            onClearSceneHistory={actions.clearSceneImageHistory}
                            onDeleteSceneQueueTask={actions.removeSceneImageQueueTask}
                            onClearSceneQueue={actions.clearSceneImageQueue}
                            onClearItemImageHistory={actions.clearItemImageHistory}
                            onSaveSceneImageLocally={actions.saveSceneImageLocally}
                            onSetPersistentWallpaper={actions.setPersistentWallpaper}
                            onClearPersistentWallpaper={actions.clearPersistentWallpaper}
                            onSavePngStylePreset={actions.savePngStylePreset}
                            onDeletePngStylePreset={actions.deletePngStylePreset}
                            onSetCurrentPngStylePreset={actions.setCurrentPngStylePreset}
                            onParsePngStylePreset={actions.parsePngStylePreset}
                            onExportPngStylePresets={actions.exportPngStylePresets}
                            onImportPngStylePresets={actions.importPngStylePresets}
                            onSaveCharacterAnchor={actions.saveCharacterAnchor}
                            onDeleteCharacterAnchor={actions.deleteCharacterAnchor}
                            onExtractCharacterAnchor={actions.extractCharacterAnchor}
                            onClose={() => setShowImageManager(false)}
                            onSaveArtistPreset={actions.saveArtistPreset}
                            onDeleteArtistPreset={actions.deleteArtistPreset}
                            onSaveModelConverterPreset={actions.saveModelConverterPreset}
                            onDeleteModelConverterPreset={actions.deleteModelConverterPreset}
                            onSetModelConverterPresetEnabled={actions.setModelConverterPresetEnabled}
                            onSavePromptConverterPreset={actions.savePromptConverterPreset}
                            onDeletePromptConverterPreset={actions.deletePromptConverterPreset}
                            onImportPresets={actions.importPresets}
                            onExportPresets={actions.exportPresets}
                        />
                        </ModalErrorBoundary>
                    ) : (
                        <ImageManagerModal
                            socialList={state.社交}
                            playerCharacter={state.角色}
                            cultivationSystemEnabled={启用修炼体系}
                            itemImageSequence={itemImageSequence}
                            queue={meta.imageGenerationQueue || []}
                            sceneArchive={meta.sceneImageArchive || {}}
                            sceneQueue={meta.sceneImageQueue || []}
                            apiConfig={state.apiConfig}
                            imageManagerConfig={state.imageManagerConfig}
                            femboyNsfwEnabled={safeGameConfig?.启用NSFW模式 === true && safeGameConfig?.启用男娘NSFW内容 !== false}
                            currentPersistentWallpaper={state.visualConfig?.常驻壁纸 || ''}
                            onSaveApiConfig={actions.saveSettings}
                            onSaveImageManagerConfig={actions.saveImageManagerSettings}
                            onGenerateImage={actions.generateNpcImageManually}
                            onGenerateSecretPartImage={actions.generateNpcSecretPartImage}
                            onRetryImage={actions.retryNpcImageGeneration}
                            onGenerateSceneImage={actions.generateSceneImageManually}
                            onSelectAvatarImage={actions.selectNpcAvatarImage}
                            onSelectPortraitImage={actions.selectNpcPortraitImage}
                            onSelectBackgroundImage={actions.selectNpcBackgroundImage}
                            onClearAvatarImage={actions.clearNpcAvatarImage}
                            onClearPortraitImage={actions.clearNpcPortraitImage}
                            onClearBackgroundImage={actions.clearNpcBackgroundImage}
                            onDeleteImageRecord={actions.removeNpcImageRecord}
                            onClearImageHistory={actions.clearNpcImageHistory}
                            onDeleteQueueTask={actions.removeNpcImageQueueTask}
                            onClearQueue={actions.clearNpcImageQueue}
                            onSaveImageLocally={actions.saveNpcImageLocally}
                            onSelectPlayerAvatarImage={actions.selectPlayerAvatarImage}
                            onClearPlayerAvatarImage={actions.clearPlayerAvatarImage}
                            onSelectPlayerPortraitImage={actions.selectPlayerPortraitImage}
                            onClearPlayerPortraitImage={actions.clearPlayerPortraitImage}
                            onRemovePlayerImageRecord={actions.removePlayerImageRecord}
                            onApplySceneWallpaper={actions.applySceneImageWallpaper}
                            onClearSceneWallpaper={actions.clearSceneWallpaper}
                            onDeleteSceneImage={actions.removeSceneImageRecord}
                            onClearSceneHistory={actions.clearSceneImageHistory}
                            onDeleteSceneQueueTask={actions.removeSceneImageQueueTask}
                            onClearSceneQueue={actions.clearSceneImageQueue}
                            onClearItemImageHistory={actions.clearItemImageHistory}
                            onSaveSceneImageLocally={actions.saveSceneImageLocally}
                            onSetPersistentWallpaper={actions.setPersistentWallpaper}
                            onClearPersistentWallpaper={actions.clearPersistentWallpaper}
                            onSavePngStylePreset={actions.savePngStylePreset}
                            onDeletePngStylePreset={actions.deletePngStylePreset}
                            onSetCurrentPngStylePreset={actions.setCurrentPngStylePreset}
                            onParsePngStylePreset={actions.parsePngStylePreset}
                            onExportPngStylePresets={actions.exportPngStylePresets}
                            onImportPngStylePresets={actions.importPngStylePresets}
                            onSaveCharacterAnchor={actions.saveCharacterAnchor}
                            onDeleteCharacterAnchor={actions.deleteCharacterAnchor}
                            onExtractCharacterAnchor={actions.extractCharacterAnchor}
                            onClose={() => setShowImageManager(false)}
                        />
                    )}
                </懒加载边界>
                </div>
            )}

            {/* In-Game Modals */}
            {state.view === 'game' && (
                <div className={desktopRightDetailClass}>
                    {state.showInventory && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileInventoryModal 
                                    character={state.角色} 
                                    openingConfig={state.开局配置}
                                    initialSelectedItemRef={inventoryInitialItemRef}
                                    onCharacterChange={(nextCharacter: any) => {
                                        setters.setCharacter(nextCharacter);
                                        void actions.performAutoSave?.({ role: nextCharacter, force: true });
                                    }}
                                    onSellItem={handleSellBagItemToAuction}
                                    onDiscardItem={handleDiscardBagItem}
                                    onSellAllMisc={handleSellAllMiscItems}
                                    onDiscardAllMisc={handleDiscardAllMiscItems}
                                    onRegenerateItemImage={handleRegenerateBagItemImage}
                                    onClose={() => setters.setShowInventory(false)} 
                                />
                            ) : (
                                <InventoryModal 
                                    character={state.角色} 
                                    openingConfig={state.开局配置}
                                    initialSelectedItemRef={inventoryInitialItemRef}
                                    onCharacterChange={(nextCharacter: any) => {
                                        setters.setCharacter(nextCharacter);
                                        void actions.performAutoSave?.({ role: nextCharacter, force: true });
                                    }}
                                    onSellItem={handleSellBagItemToAuction}
                                    onDiscardItem={handleDiscardBagItem}
                                    onSellAllMisc={handleSellAllMiscItems}
                                    onDiscardAllMisc={handleDiscardAllMiscItems}
                                    onRegenerateItemImage={handleRegenerateBagItemImage}
                                    onClose={() => setters.setShowInventory(false)} 
                                />
                            )}
                        </懒加载边界>
                    )}

                    {showAuctionHouse && (
                        <懒加载边界>
                            <AuctionHouseModal
                                character={state.角色}
                                auctionState={auctionHouseState}
                                onAuctionStateChange={setAuctionHouseState}
                                storageScope={auctionHouseScope}
                                onCharacterChange={(nextCharacter: any) => {
                                    setters.setCharacter(nextCharacter);
                                    void actions.performAutoSave?.({ role: nextCharacter, force: true });
                                }}
                                onNotify={(title, message, tone) => actions.pushNotification({ title, message, tone })}
                                onClose={() => setShowAuctionHouse(false)}
                                isMobile={isMobile}
                                apiConfig={state.apiConfig}
                                openingConfig={state.开局配置}
                            />
                        </懒加载边界>
                    )}

                    {showCharacter && (
                        <懒加载边界>
                            {isMobile ? (
                                 <MobileCharacter
                                    character={state.角色}
                                    gameConfig={state.gameConfig}
                                    openingConfig={state.开局配置}
                                    apiConfig={state.apiConfig}
                                    playerAnchor={主角锚点}
                                    nsfwEnabled={safeGameConfig?.启用NSFW模式 === true}
                                    femboyNsfwEnabled={safeGameConfig?.启用男娘NSFW内容 !== false}
                                    onGeneratePlayerImage={actions.generatePlayerImageManually}
                                    onGeneratePlayerSecretPartImage={actions.generatePlayerSecretPartImage}
                                    onSelectPlayerAvatarImage={actions.selectPlayerAvatarImage}
                                    onClearPlayerAvatarImage={actions.clearPlayerAvatarImage}
                                    onUploadPlayerAvatar={actions.updatePlayerAvatar}
                                    onSelectPlayerPortraitImage={actions.selectPlayerPortraitImage}
                                    onClearPlayerPortraitImage={actions.clearPlayerPortraitImage}
                                    onUploadPlayerPortrait={actions.updatePlayerPortrait}
                                    onRemovePlayerImageRecord={actions.removePlayerImageRecord}
                                    onAllocateAttributePoint={handleAllocateAttributePoint}
                                    onClose={() => setShowCharacter(false)}
                                />
                            ) : (
                                 <CharacterModal
                                    character={state.角色}
                                    onClose={() => setShowCharacter(false)}
                                    visualConfig={effectiveVisualConfig}
                                    apiConfig={state.apiConfig}
                                    playerAnchor={主角锚点}
                                    nsfwEnabled={safeGameConfig?.启用NSFW模式 === true}
                                    femboyNsfwEnabled={safeGameConfig?.启用男娘NSFW内容 !== false}
                                    onGeneratePlayerImage={actions.generatePlayerImageManually}
                                    onGeneratePlayerSecretPartImage={actions.generatePlayerSecretPartImage}
                                    onExtractPlayerAnchor={actions.extractPlayerCharacterAnchor}
                                    onSavePlayerAnchor={actions.saveCharacterAnchor}
                                    onDeletePlayerAnchor={actions.deleteCharacterAnchor}
                                    onSelectPlayerAvatarImage={actions.selectPlayerAvatarImage}
                                    onClearPlayerAvatarImage={actions.clearPlayerAvatarImage}
                                    onUploadPlayerAvatar={actions.updatePlayerAvatar}
                                    onSelectPlayerPortraitImage={actions.selectPlayerPortraitImage}
                                    onClearPlayerPortraitImage={actions.clearPlayerPortraitImage}
                                    onUploadPlayerPortrait={actions.updatePlayerPortrait}
                                    onRemovePlayerImageRecord={actions.removePlayerImageRecord}
                                    onAllocateAttributePoint={handleAllocateAttributePoint}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showEquipment && (
                        <懒加载边界>
                            <EquipmentModal 
                                character={state.角色} 
                                openingConfig={state.开局配置}
                                onCharacterChange={(nextCharacter: any) => {
                                    setters.setCharacter(nextCharacter);
                                    void actions.performAutoSave?.({ role: nextCharacter, force: true });
                                }}
                                onClose={() => setters.setShowEquipment(false)} 
                            />
                        </懒加载边界>
                    )}

                    {state.showBattle && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileBattleModal
                                    character={state.角色}
                                    battle={state.战斗}
                                    contextText={latestBattleContextText}
                                    openingConfig={state.开局配置}
                                    realmPrompt={currentRealmPrompt}
                                    onClose={() => setters.setShowBattle(false)}
                                />
                            ) : (
                                <BattleModal
                                    character={state.角色}
                                    battle={state.战斗}
                                    teammates={state.社交}
                                    contextText={latestBattleContextText}
                                    openingConfig={state.开局配置}
                                    realmPrompt={currentRealmPrompt}
                                    onClose={() => setters.setShowBattle(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showTeam && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileTeamModal
                                    character={state.角色}
                                    teammates={state.社交}
                                    openingConfig={state.开局配置}
                                    onClose={() => setters.setShowTeam(false)}
                                />
                            ) : (
                                <TeamModal
                                    character={state.角色}
                                    teammates={state.社交}
                                    openingConfig={state.开局配置}
                                    onClose={() => setters.setShowTeam(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showSocial && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileSocial
                                    socialList={state.社交}
                                    cultivationSystemEnabled={启用修炼体系}
                                    openingConfig={state.开局配置}
                                    onClose={() => setters.setShowSocial(false)}
                                    selectedNpcId={selectedSocialNpcId}
                                    onSelectedNpcIdChange={setSelectedSocialNpcId}
                                    playerName={safeCharacter?.姓名 || ''}
                                    nsfwEnabled={safeGameConfig?.启用NSFW模式 === true}
                                    femboyNsfwEnabled={safeGameConfig?.启用男娘NSFW内容 !== false}
                                    onToggleMajorRole={actions.updateNpcMajorRole}
                                    onTogglePresence={actions.updateNpcPresence}
                                     onDeleteNpc={actions.removeNpc}
                                     onLearnSkill={handleLearnNpcSkill}
                                     onRecruitToSect={handleRecruitNpcToSect}
                                    onStealFromNpc={handleStealFromNpc}
                                     onRetryImage={actions.retryNpcImageGeneration}
                                     playerSect={state.玩家门派}
                                  />
                            ) : (
                                <SocialModal
                                    socialList={state.社交}
                                    cultivationSystemEnabled={启用修炼体系}
                                    openingConfig={state.开局配置}
                                    onClose={() => setters.setShowSocial(false)}
                                    selectedNpcId={selectedSocialNpcId}
                                    onSelectedNpcIdChange={setSelectedSocialNpcId}
                                    playerName={safeCharacter?.姓名 || ''}
                                    nsfwEnabled={safeGameConfig?.启用NSFW模式 === true}
                                    femboyNsfwEnabled={safeGameConfig?.启用男娘NSFW内容 !== false}
                                    onToggleMajorRole={actions.updateNpcMajorRole}
                                    onTogglePresence={actions.updateNpcPresence}
                                     onDeleteNpc={actions.removeNpc}
                                     onLearnSkill={handleLearnNpcSkill}
                                     onRecruitToSect={handleRecruitNpcToSect}
                                      onStealFromNpc={handleStealFromNpc}
                                      onRetryImage={actions.retryNpcImageGeneration}
                                      playerSect={state.玩家门派}
                                  />
                            )}
                        </懒加载边界>
                    )}

                    {启用修炼体系 && state.showKungfu && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileKungfuModal
                                    skills={safeCharacter?.功法列表 || []}
                                    topicMode={state.开局配置?.题材模式}
                                    onClose={() => setters.setShowKungfu(false)}
                                />
                            ) : (
                                <KungfuModal
                                    skills={safeCharacter?.功法列表 || []}
                                    topicMode={state.开局配置?.题材模式}
                                    onClose={() => setters.setShowKungfu(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showSkills && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileSkillsPanel
                                    技艺列表={safeCharacter?.技艺 || []}
                                    社交列表={state.社交}
                                    典籍列表={safeCharacter?.功法列表 || []}
                                    onClose={() => setters.setShowSkills(false)}
                                />
                            ) : (
                                <SkillsPanel
                                    技艺列表={safeCharacter?.技艺 || []}
                                    社交列表={state.社交}
                                    典籍列表={safeCharacter?.功法列表 || []}
                                    onClose={() => setters.setShowSkills(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showWorld && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileWorldModal
                                    world={state.世界}
                                    worldEvolutionEnabled={meta.worldEvolutionEnabled}
                                    worldEvolutionUpdating={meta.worldEvolutionUpdating}
                                    worldEvolutionStatus={meta.worldEvolutionStatus}
                                    worldEvolutionLastUpdatedAt={meta.worldEvolutionLastUpdatedAt}
                                    worldEvolutionLastSummary={meta.worldEvolutionLastSummary}
                                    worldEvolutionLastRawText={meta.worldEvolutionLastRawText}
                                    onForceUpdate={actions.handleForceWorldEvolutionUpdate}
                                    onClose={() => setters.setShowWorld(false)}
                                />
                            ) : (
                                <WorldModal
                                    world={state.世界}
                                    worldEvolutionEnabled={meta.worldEvolutionEnabled}
                                    worldEvolutionUpdating={meta.worldEvolutionUpdating}
                                    worldEvolutionStatus={meta.worldEvolutionStatus}
                                    worldEvolutionLastUpdatedAt={meta.worldEvolutionLastUpdatedAt}
                                    worldEvolutionLastSummary={meta.worldEvolutionLastSummary}
                                    worldEvolutionLastRawText={meta.worldEvolutionLastRawText}
                                    onForceUpdate={actions.handleForceWorldEvolutionUpdate}
                                    onClose={() => setters.setShowWorld(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showMap && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileMapModal
                                    world={state.世界}
                                    env={state.环境}
                                    socialList={state.社交}
                                    playerName={safeCharacter?.姓名 || ''}
                                    uiLabels={题材界面文案}
                                    debugEnabled={(state.gameConfig as any)?.启用研发诊断模式 === true}
                                    onOpenPerson={openNpcDetailFromRecord}
                                    onRegenerateMap={handleRegenerateMap}
                                    onInsertCommand={insertChatDraft}
                                    rawResponse={mapRegenerateRawText}
                                    onClose={() => setters.setShowMap(false)}
                                />
                            ) : (
                                <MapModal
                                    world={state.世界}
                                    env={state.环境}
                                    socialList={state.社交}
                                    playerName={safeCharacter?.姓名 || ''}
                                    uiLabels={题材界面文案}
                                    debugEnabled={(state.gameConfig as any)?.启用研发诊断模式 === true}
                                    onOpenPerson={openNpcDetailFromRecord}
                                    onRegenerateMap={handleRegenerateMap}
                                    onInsertCommand={insertChatDraft}
                                    rawResponse={mapRegenerateRawText}
                                    onClose={() => setters.setShowMap(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showSect && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileSect
                                    sectData={state.玩家门派}
                                    env={state.环境}
                                    onOpenNpc={openNpcDetailFromRecord}
                                    onOpenPlayer={openCharacter}
                                    onLearnBook={handleLearnSectBook}
                                    onClaimMonthlyStipend={handleClaimMonthlyStipend}
                                    onExchange={handleSectExchange}
                                    learnedBookIds={learnedSectBookIds}
                                    onClose={() => setters.setShowSect(false)}
                                    socialList={state.社交}
                                    playerProfile={state.角色}
                                />
                            ) : (
                                <SectModal
                                    sectData={state.玩家门派}
                                    env={state.环境}
                                    onOpenNpc={openNpcDetailFromRecord}
                                    onOpenPlayer={openCharacter}
                                    onLearnBook={handleLearnSectBook}
                                    onClaimMonthlyStipend={handleClaimMonthlyStipend}
                                    onExchange={handleSectExchange}
                                    learnedBookIds={learnedSectBookIds}
                                    onClose={() => setters.setShowSect(false)}
                                    socialList={state.社交}
                                    playerProfile={state.角色}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showTask && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileTask
                                    tasks={state.任务列表}
                                    onDeleteTask={actions.removeTask}
                                    playerSect={state.玩家门派}
                                    topicMode={state.开局配置?.题材模式}
                                    uiLabels={题材界面文案}
                                    onClose={() => setters.setShowTask(false)}
                                />
                            ) : (
                                <TaskModal
                                    tasks={state.任务列表}
                                    onDeleteTask={actions.removeTask}
                                    playerSect={state.玩家门派}
                                    topicMode={state.开局配置?.题材模式}
                                    uiLabels={题材界面文案}
                                    onClose={() => setters.setShowTask(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showAgreement && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileAgreementModal
                                    agreements={state.约定列表}
                                    onDeleteAgreement={actions.removeAgreement}
                                    onClose={() => setters.setShowAgreement(false)}
                                />
                            ) : (
                                <AgreementModal
                                    agreements={state.约定列表}
                                    onDeleteAgreement={actions.removeAgreement}
                                    onClose={() => setters.setShowAgreement(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showStory && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileStory
                                    story={state.剧情}
                                    storyPlan={当前剧情规划}
                                    isFandomMode={启用同人模式}
                                    onClose={() => setters.setShowStory(false)}
                                />
                            ) : (
                                <StoryModal
                                    story={state.剧情}
                                    storyPlan={当前剧情规划}
                                    isFandomMode={启用同人模式}
                                    onClose={() => setters.setShowStory(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {showNovelExport && (
                        <懒加载边界>
                            <NovelExportModal
                                isOpen={showNovelExport}
                                onClose={closeNovelExport}
                                history={state.历史记录}
                                apiSettings={state.apiConfig}
                                onOpenPolishSettings={openPolishSettings}
                            />
                        </懒加载边界>
                    )}

                    {state.showHeroinePlan && safeGameConfig?.启用女主剧情规划 === true && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileHeroinePlanModal
                                    plan={当前女主剧情规划}
                                    isFandomMode={启用同人模式}
                                    onClose={() => setters.setShowHeroinePlan(false)}
                                />
                            ) : (
                                <HeroinePlanModal
                                    plan={当前女主剧情规划}
                                    isFandomMode={启用同人模式}
                                    onClose={() => setters.setShowHeroinePlan(false)}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showMemory && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileMemory
                                    history={state.历史记录}
                                    memorySystem={state.记忆系统}
                                    onClose={() => setters.setShowMemory(false)}
                                    currentTime={currentEnvTime}
                                    onSaveMemory={actions.updateMemorySystem}
                                    onStartMemorySummary={actions.handleStartManualMemorySummary}
                                />
                            ) : (
                                <MemoryModal
                                    history={state.历史记录}
                                    memorySystem={state.记忆系统}
                                    onClose={() => setters.setShowMemory(false)}
                                    currentTime={currentEnvTime}
                                    onSaveMemory={actions.updateMemorySystem}
                                    onStartMemorySummary={actions.handleStartManualMemorySummary}
                                />
                            )}
                        </懒加载边界>
                    )}
                </div>
            )}
        </div>
    </MusicProvider>
    );
};

export default App;
