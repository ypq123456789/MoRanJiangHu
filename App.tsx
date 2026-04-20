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
import { useGame } from './hooks/useGame';
import { 环境时间转标准串, normalizeCanonicalGameTime, 结构化时间转标准串 } from './hooks/useGame/timeUtils';
import { 获取文生图接口配置, 获取生图词组转化器接口配置, 接口配置是否可用 } from './utils/apiConfig';
import { 构建字体注入样式文本, 构建UI文字CSS变量 } from './utils/visualSettings';
import { 获取图片资源文本地址 } from './utils/imageAssets';
import { MusicProvider } from './components/features/Music/MusicProvider';
import { isNativeCapacitorEnvironment } from './utils/nativeRuntime';
import { 小说拆分后台调度服务 } from './services/novelDecompositionScheduler';

type 可预加载组件<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
    preload?: () => Promise<unknown>;
};

const 创建可预加载懒组件 = <T extends React.ComponentType<any>>(
    loader: () => Promise<{ default: T }>
): 可预加载组件<T> => {
    const Component = React.lazy(loader) as 可预加载组件<T>;
    Component.preload = loader;
    return Component;
};

const CharacterModal = 创建可预加载懒组件(() => import('./components/features/Character/CharacterModal'));
const MobileCharacter = 创建可预加载懒组件(() => import('./components/features/Character/MobileCharacter'));
const NewGameWizard = 创建可预加载懒组件(() => import('./components/features/NewGame/NewGameWizard'));
const MobileNewGameWizard = 创建可预加载懒组件(() => import('./components/features/NewGame/mobile/MobileNewGameWizard'));
const SettingsModal = 创建可预加载懒组件(() => import('./components/features/Settings/SettingsModal'));
const MobileSettingsModal = 创建可预加载懒组件(() => import('./components/features/Settings/mobile/MobileSettingsModal'));
const InventoryModal = 创建可预加载懒组件(() => import('./components/features/Inventory/InventoryModal'));
const MobileInventoryModal = 创建可预加载懒组件(() => import('./components/features/Inventory/MobileInventoryModal'));
const EquipmentModal = 创建可预加载懒组件(() => import('./components/features/Equipment/EquipmentModal'));
const BattleModal = 创建可预加载懒组件(() => import('./components/features/Battle/BattleModal'));
const MobileBattleModal = 创建可预加载懒组件(() => import('./components/features/Battle/MobileBattleModal'));
const SocialModal = 创建可预加载懒组件(() => import('./components/features/Social/SocialModal'));
const MobileSocial = 创建可预加载懒组件(() => import('./components/features/Social/MobileSocial'));
const ImageManagerModal = 创建可预加载懒组件(() => import('./components/features/Social/ImageManagerModal'));
const MobileImageManagerModal = 创建可预加载懒组件(() => import('./components/features/Social/mobile/MobileImageManagerModal'));
const WorldbookManagerModal = 创建可预加载懒组件(() => import('./components/features/Worldbook/WorldbookManagerModal'));
const TeamModal = 创建可预加载懒组件(() => import('./components/features/Team/TeamModal'));
const MobileTeamModal = 创建可预加载懒组件(() => import('./components/features/Team/MobileTeamModal'));
const KungfuModal = 创建可预加载懒组件(() => import('./components/features/Kungfu/KungfuModal'));
const MobileKungfuModal = 创建可预加载懒组件(() => import('./components/features/Kungfu/MobileKungfuModal'));
const WorldModal = 创建可预加载懒组件(() => import('./components/features/World/WorldModal'));
const MobileWorldModal = 创建可预加载懒组件(() => import('./components/features/World/MobileWorldModal'));
const MapModal = 创建可预加载懒组件(() => import('./components/features/Map/MapModal'));
const MobileMapModal = 创建可预加载懒组件(() => import('./components/features/Map/MobileMapModal'));
const SectModal = 创建可预加载懒组件(() => import('./components/features/Sect/SectModal'));
const MobileSect = 创建可预加载懒组件(() => import('./components/features/Sect/MobileSect'));
const TaskModal = 创建可预加载懒组件(() => import('./components/features/Task/TaskModal'));
const MobileTask = 创建可预加载懒组件(() => import('./components/features/Task/MobileTask'));
const AgreementModal = 创建可预加载懒组件(() => import('./components/features/Agreement/AgreementModal'));
const MobileAgreementModal = 创建可预加载懒组件(() => import('./components/features/Agreement/MobileAgreementModal'));
const StoryModal = 创建可预加载懒组件(() => import('./components/features/Story/StoryModal'));
const MobileStory = 创建可预加载懒组件(() => import('./components/features/Story/MobileStory'));
const HeroinePlanModal = 创建可预加载懒组件(() => import('./components/features/Story/HeroinePlanModal'));
const MobileHeroinePlanModal = 创建可预加载懒组件(() => import('./components/features/Story/MobileHeroinePlanModal'));
const NovelExportModal = 创建可预加载懒组件(() => import('./components/features/Story/NovelExportModal'));
const MemoryModal = 创建可预加载懒组件(() => import('./components/features/Memory/MemoryModal'));
const MobileMemory = 创建可预加载懒组件(() => import('./components/features/Memory/MobileMemory'));
const MemorySummaryFlowModal = 创建可预加载懒组件(() => import('./components/features/Memory/MemorySummaryFlowModal'));
const MemorySummaryFlowMobileModal = 创建可预加载懒组件(() => import('./components/features/Memory/MemorySummaryFlowMobileModal'));
const NpcMemorySummaryFlowModal = 创建可预加载懒组件(() => import('./components/features/Memory/NpcMemorySummaryFlowModal'));
const NpcMemorySummaryFlowMobileModal = 创建可预加载懒组件(() => import('./components/features/Memory/NpcMemorySummaryFlowMobileModal'));
const SaveLoadModal = 创建可预加载懒组件(() => import('./components/features/SaveLoad/SaveLoadModal'));
const MobileMusicPlayer = 创建可预加载懒组件(() => import('./components/features/Music/mobile/MobileMusicPlayer'));
const NovelDecompositionWorkbenchModal = 创建可预加载懒组件(() => import('./components/features/NovelDecomposition/NovelDecompositionWorkbenchModal'));

const 懒加载占位: React.FC = () => (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 px-6 py-10 text-center backdrop-blur-[2px]">
        <div
            className="rounded-2xl border border-wuxia-gold/25 bg-black/78 px-6 py-5 tracking-[0.22em] text-wuxia-gold/85 shadow-[0_0_36px_rgba(0,0,0,0.52)]"
            style={{ fontSize: 'var(--ui-compact-font-size, 14px)' }}
        >
            卷轴展开中…
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

        return (
            <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/88 px-5 py-8">
                <div className="w-full max-w-md rounded-2xl border border-red-500/45 bg-[#120909] p-5 text-red-100 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                    <div className="text-base font-semibold tracking-[0.12em] text-red-200">{this.props.title}</div>
                    <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-red-100/90">
                        {this.state.error.message || '界面渲染失败'}
                    </div>
                    <div className="mt-4 text-xs leading-5 text-red-200/70">
                        请把这段报错截图发我，我就能继续按具体原因修。
                    </div>
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
    const [showCharacter, setShowCharacter] = React.useState(false);
    const [showImageManager, setShowImageManager] = React.useState(false);
    const [showWorldbookManager, setShowWorldbookManager] = React.useState(false);
    const [showNovelDecompositionWorkbench, setShowNovelDecompositionWorkbench] = React.useState(false);
    const [showNovelExport, setShowNovelExport] = React.useState(false);
    const [showMobileMusic, setShowMobileMusic] = React.useState(false);
    const [chatContentHidden, setChatContentHidden] = React.useState(false);
    const [sceneQuickGenHint, setSceneQuickGenHint] = React.useState(false);
    const [sceneQuickGenToastVisible, setSceneQuickGenToastVisible] = React.useState(false);
    const [contextSnapshot, setContextSnapshot] = React.useState<Awaited<ReturnType<typeof actions.getContextSnapshot>> | undefined>(undefined);
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
    }, []);
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

        const preloadTargets = isMobile
            ? [
                MobileCharacter,
                MobileInventoryModal,
                MobileSocial,
                MobileTask,
                MobileStory,
                NovelExportModal,
                MobileSettingsModal,
                MobileMemory,
                MobileWorldModal,
                MobileMapModal,
                MobileMusicPlayer
            ]
            : [
                CharacterModal,
                InventoryModal,
                SocialModal,
                TaskModal,
                StoryModal,
                NovelExportModal,
                SettingsModal,
                MemoryModal,
                WorldModal,
                MapModal,
                SaveLoadModal
            ];

        let cancelled = false;
        const idleWindow = window as typeof window & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (id: number) => void;
        };

        let idleId: number | null = null;
        let timerId: number | null = null;

        const warmup = () => {
            if (cancelled) return;
            preloadTargets.forEach((target, index) => {
                window.setTimeout(() => {
                    if (cancelled) return;
                    void target.preload?.();
                }, index * 160);
            });
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleId = idleWindow.requestIdleCallback(() => warmup(), { timeout: 1200 });
        } else {
            timerId = window.setTimeout(warmup, 600);
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

    const toCanonicalGameTimestamp = (value: unknown): string | null => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return 结构化时间转标准串(value);
        }
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const direct = normalizeCanonicalGameTime(trimmed);
        if (direct) return direct;
        const match = trimmed.match(/^(\d{1,6})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:\s+|[T])?(\d{1,2})[:：时](\d{1,2})/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hour = Number(match[4]);
        const minute = Number(match[5]);
        if (
            !Number.isFinite(year) ||
            month < 1 || month > 12 ||
            day < 1 || day > 31 ||
            hour < 0 || hour > 23 ||
            minute < 0 || minute > 59
        ) {
            return null;
        }
        const pad2 = (n: number) => Math.trunc(n).toString().padStart(2, '0');
        return `${Math.trunc(year)}:${pad2(month)}:${pad2(day)}:${pad2(hour)}:${pad2(minute)}`;
    };

    const parseGameTimestampToNumber = (timeValue: unknown): number => {
        const canonical = toCanonicalGameTimestamp(timeValue);
        if (!canonical) return 0;
        const m = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
        if (!m) return 0;
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        return (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;
    };

    const formatGameTimestampForDisplay = (timeValue: unknown): string => {
        const canonical = toCanonicalGameTimestamp(timeValue);
        if (!canonical) return '未知时间';
        const m = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
        if (!m) return '未知时间';
        return `${m[1]}年${m[2]}月${m[3]}日 ${m[4]}:${m[5]}`;
    };

    const tickerEvents = React.useMemo(() => {
        const ongoingEvents = Array.isArray(state.世界?.进行中事件) ? state.世界.进行中事件 : [];
        const formatted = ongoingEvents
            .sort((a, b) => parseGameTimestampToNumber(b.开始时间) - parseGameTimestampToNumber(a.开始时间))
            .map(evt => {
                const type = evt.类型 || '事件';
                const start = formatGameTimestampForDisplay(evt.开始时间);
                const title = evt.事件名 || '无标题';
                const location = (Array.isArray(evt.关联地点) ? evt.关联地点[0] : '') || '未知地点';
                return `【${type}】${start} ${title}（${location}）`;
            })
            .filter(Boolean);

        return formatted.length > 0 ? formatted : state.worldEvents;
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
    const effectiveVisualConfig = React.useMemo(() => {
        if (!isMobile || !state.visualConfig) return state.visualConfig;

        return {
            ...state.visualConfig,
            ['字体大小']: 16,
            ['段落间距']: 1.6,
            ['区域文字样式']: undefined,
            ['UI文字样式']: undefined
        } as typeof state.visualConfig;
    }, [isMobile, state.visualConfig]);
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
        () => ({ 姓名: state.角色?.姓名, 头像图片URL: 玩家头像地址 }),
        [state.角色?.姓名, 玩家头像地址]
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
        女主剧情规划: state.女主剧情规划,
        玩家门派: state.玩家门派,
        任务列表: state.任务列表,
        约定列表: state.约定列表,
        记忆系统: state.记忆系统
    }), [state.角色, state.环境, state.社交, state.世界, state.战斗, state.剧情, state.女主剧情规划, state.玩家门派, state.任务列表, state.约定列表, state.记忆系统]);

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

    const activeMobileWindow =
        showCharacter ? '角色' :
        state.showBattle ? '战斗' :
        state.showEquipment ? '装备' :
        state.showInventory ? '背包' :
        state.showSocial ? '社交' :
        (启用修炼体系 && state.showKungfu) ? '功法' :
        state.showWorld ? '世界' :
        state.showMap ? '地图' :
        state.showTeam ? '队伍' :
        state.showSect ? '门派' :
        state.showTask ? '任务' :
        state.showAgreement ? '约定' :
        state.showStory ? '剧情' :
        state.showHeroinePlan ? '规划' :
        state.showMemory ? '记忆' :
        showNovelExport ? '导出小说' :
        showImageManager ? '图册' :
        showNovelDecompositionWorkbench ? '小说分解' :
        state.showSaveLoad.show ? (state.showSaveLoad.mode === 'save' ? '保存' : '读取') :
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
        showImageManager ? 'image_manager' :
        showNovelDecompositionWorkbench ? 'novel_decomposition' :
        state.showSaveLoad.show ? (state.showSaveLoad.mode === 'save' ? 'save' : 'load') :
        state.showSettings ? 'settings' :
        showMobileMusic ? 'music' :
        null;

    const closeAllPanels = React.useCallback(() => {
        setShowCharacter(false);
        setters.setShowBattle(false);
        setters.setShowInventory(false);
        setters.setShowEquipment(false);
        setters.setShowTeam(false);
        setters.setShowSocial(false);
        setters.setShowKungfu(false);
        setters.setShowWorld(false);
        setters.setShowMap(false);
        setters.setShowSect(false);
        setters.setShowTask(false);
        setters.setShowAgreement(false);
        setters.setShowStory(false);
        setters.setShowHeroinePlan(false);
        setters.setShowMemory(false);
        setShowNovelExport(false);
        setShowImageManager(false);
        setShowNovelDecompositionWorkbench(false);
        setters.setShowSaveLoad({ show: false, mode: 'save' });
        setters.setShowSettings(false);
        setShowMobileMusic(false);
    }, [setters]);

    const openCharacter = React.useCallback(() => setShowCharacter(true), []);
    const openSettings = React.useCallback(() => setters.setShowSettings(true), [setters]);
    const openInventory = React.useCallback(() => setters.setShowInventory(true), [setters]);
    const openEquipment = React.useCallback(() => setters.setShowEquipment(true), [setters]);
    const openBattle = React.useCallback(() => setters.setShowBattle(true), [setters]);
    const openTeam = React.useCallback(() => setters.setShowTeam(true), [setters]);
    const openSocial = React.useCallback(() => setters.setShowSocial(true), [setters]);
    const openKungfu = React.useCallback(() => {
        if (!启用修炼体系) return;
        setters.setShowKungfu(true);
    }, [setters, 启用修炼体系]);
    const openWorld = React.useCallback(() => setters.setShowWorld(true), [setters]);
    const openMap = React.useCallback(() => setters.setShowMap(true), [setters]);
    const openSect = React.useCallback(() => setters.setShowSect(true), [setters]);
    const openTask = React.useCallback(() => setters.setShowTask(true), [setters]);
    const openAgreement = React.useCallback(() => setters.setShowAgreement(true), [setters]);
    const openStory = React.useCallback(() => setters.setShowStory(true), [setters]);
    const openHeroinePlan = React.useCallback(() => setters.setShowHeroinePlan(true), [setters]);
    const openMemory = React.useCallback(() => setters.setShowMemory(true), [setters]);
    const openNovelExport = React.useCallback(() => setShowNovelExport(true), []);
    const openSave = React.useCallback(() => setters.setShowSaveLoad({ show: true, mode: 'save' }), [setters]);
    const openLoad = React.useCallback(() => setters.setShowSaveLoad({ show: true, mode: 'load' }), [setters]);
    const closeSettings = React.useCallback(() => setters.setShowSettings(false), [setters]);
    const closeNovelDecompositionWorkbench = React.useCallback(() => setShowNovelDecompositionWorkbench(false), []);
    const closeNovelExport = React.useCallback(() => setShowNovelExport(false), []);
    const closeSaveLoad = React.useCallback(() => setters.setShowSaveLoad({ show: false, mode: 'save' }), [setters]);
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
                message: '小说分解现在从首页独立打开。\n\n使用前请先在“设置 -> 小说分解接口”中启用并填写独立模型、API 地址和密钥。\n\n是否现在前往设置？',
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

        setShowNovelDecompositionWorkbench(true);
    }, [closeAllPanels, requestConfirm, setters, state.apiConfig]);
    const handleStartFromLanding = React.useCallback(() => actions.handleStartNewGameWizard(), [actions]);
    const handleReturnToHomeFromSettings = React.useCallback(async () => {
        const ok = await requestConfirm({
            title: '返回首页',
            message: '确定要返回首页吗？未保存的进度将会丢失。',
            confirmText: '返回',
            danger: true
        });
        if (!ok) return;
        actions.handleReturnToHome();
        setters.setShowSettings(false);
    }, [actions, requestConfirm, setters]);
    const openPolishSettings = React.useCallback(() => {
        closeAllPanels();
        setters.setActiveTab('polish');
        setters.setShowSettings(true);
    }, [closeAllPanels, setters]);

    const openImageManagerWithCheck = React.useCallback(async () => {
        const imageApi = 获取文生图接口配置(state.apiConfig);
        if (!接口配置是否可用(imageApi)) {
            const accepted = await requestConfirm({
                title: '未配置文生图接口',
                message: '图片管理依赖可用的文生图接口。是否立即跳转到“文生图”设置页？',
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

        if (imageApi.图片后端类型 === 'novelai') {
            const promptApi = 获取生图词组转化器接口配置(state.apiConfig);
            if (!接口配置是否可用(promptApi)) {
                const accepted = await requestConfirm({
                    title: 'NovelAI 缺少词组转化器',
                    message: 'NovelAI 模式必须绑定可用的词组转化器接口。是否立即跳转到“文生图”设置页？',
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
        if (state.showSaveLoad.show) {
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


    return (
        <MusicProvider visualConfig={effectiveVisualConfig} onSaveVisual={actions.saveVisualSettings}>
            <div className={`h-screen w-screen overflow-hidden bg-ink-black relative flex flex-col transition-colors duration-500 ${isMobile ? 'p-0' : 'p-3'}`} style={appUiStyleVars}>
                {fontFaceStyleText && <style>{fontFaceStyleText}</style>}
            
            {/* View Switching */}
            {state.view === 'home' && (
                <LandingPage 
                    onStart={handleStartFromLanding}
                    onLoad={openLoad}
                    onImageManager={openImageManagerWithCheck}
                    onWorldbookManager={openWorldbookManager}
                    onNovelDecomposition={() => { void openNovelDecompositionWorkbench(); }}
                    onSettings={openSettings}
                    hasSave={state.hasSave}
                />
            )}

            {state.view === 'new_game' && (
                <懒加载边界>
                    {isMobile ? (
                        <MobileNewGameWizard
                            onComplete={actions.handleGenerateWorld}
                            onCancel={() => { state.setView('home'); }}
                            loading={state.loading}
                            requestConfirm={requestConfirm}
                        />
                    ) : (
                        <NewGameWizard
                            onComplete={actions.handleGenerateWorld}
                            onCancel={() => { state.setView('home'); }}
                            loading={state.loading}
                            requestConfirm={requestConfirm}
                        />
                    )}
                </懒加载边界>
            )}

            {state.view === 'game' && (
                /* Main Game Frame Container */
                <div className={`relative flex-1 flex flex-col w-full h-full overflow-hidden bg-ink-black ${isMobile ? 'rounded-none shadow-none' : 'rounded-2xl shadow-2xl'}`}>
                    {isMobile && (
                        <button
                            type="button"
                            onClick={() => { void toggleAppFullscreen(); }}
                            className="absolute right-1.5 top-1.5 z-[65] inline-flex h-6 w-6 items-center justify-center rounded-md border border-wuxia-gold/35 bg-black/75 text-[0px] text-wuxia-gold shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm"
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
                    )}

                    {/* 顶部导航栏 */}
                    <div className={`shrink-0 z-40 bg-ink-black/90 border-b border-wuxia-gold/20 shadow-[0_10px_30px_rgba(0,0,0,0.8)] relative overflow-visible ${isMobile ? 'rounded-none mx-0 mt-0' : 'rounded-t-xl mx-1 mt-1'}`}>
                        <TopBar 
                            环境={state.环境} 
                            游戏初始时间={state.游戏初始时间}
                            timeFormat={effectiveVisualConfig.时间显示格式}
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
                                onUploadAvatar={actions.updatePlayerAvatar}
                                visualConfig={effectiveVisualConfig}
                                gameConfig={state.gameConfig}
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
                              <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
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
                                    renderCount={effectiveVisualConfig.渲染层数}
                                    suppressAutoScrollToken={meta.chatScrollSuppressToken}
                                    forceScrollToken={meta.chatForceScrollToken}
                                />
                                <InputArea 
                                    onSend={actions.handleSend} 
                                    onStop={actions.handleStop}
                                    onCancelVariableGeneration={actions.handleCancelVariableGeneration}
                                    onRegenerate={actions.handleRegenerate}
                                    onRecoverParseErrorRaw={actions.handleRecoverFromParseErrorRaw}
                                    onQuickRestart={actions.handleQuickRestart}
                                    requestConfirm={requestConfirm}
                                    loading={state.loading} 
                                    variableGenerationRunning={meta.variableGenerationRunning}
                                    canReroll={meta.canRerollLatest}
                                    canQuickRestart={meta.canQuickRestart}
                                    openingWorldEvolutionProgress={meta.openingWorldEvolutionProgress}
                                    openingPlanningProgress={meta.openingPlanningProgress}
                                    openingVariableGenerationProgress={meta.openingVariableGenerationProgress}
                                    options={currentOptions}
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
                        <div className="hidden md:block w-[14.285714%] h-full relative z-20 bg-ink-black/95 border-l border-wuxia-gold/20 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.5)]">
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
                                onOpenImageManager={openImageManagerWithCheck}
                                onOpenNovelDecomposition={() => { void openNovelDecompositionWorkbench(); }}
                                worldEvolutionEnabled={meta.worldEvolutionEnabled}
                                worldEvolutionUpdating={meta.worldEvolutionUpdating}
                                enableHeroinePlan={state.gameConfig.启用女主剧情规划 === true}
                                enableKungfu={启用修炼体系}
                                onSave={openSave}
                                onLoad={openLoad}
                                visualConfig={effectiveVisualConfig}
                            />
                        </div>
                    </div>

                    {meta.notifications && meta.notifications.length > 0 && (
                        <div className="absolute right-4 bottom-16 md:bottom-14 z-[70] flex flex-col gap-2 pointer-events-none">
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
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
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
                        enableHeroinePlan={state.gameConfig.启用女主剧情规划 === true}
                        enableKungfu={启用修炼体系}
                        enableImageManager={true}
                        enableNovelDecomposition={true}
                    />

                    {!hideBottomTicker && (
                        <div
                            className={`md:hidden shrink-0 h-[32px] bg-ink-black/90 border-t border-wuxia-gold/20 flex items-center font-mono text-wuxia-gold-dark relative overflow-hidden pb-[var(--app-safe-bottom,env(safe-area-inset-bottom,0px))] ${isMobile ? 'mx-0 mb-0' : 'mx-1 mb-1'}`}
                            style={{ fontSize: 'var(--ui-compact-mono-font-size, 12px)' }}
                        >
                            <div className="shrink-0 h-full px-2 flex items-center border-r border-gray-800 text-wuxia-gold/90 tracking-wider text-transparent relative">
                                <span className="absolute inset-0 flex items-center px-2 text-wuxia-gold/90">世界大事</span>
                                世界大事
                            </div>
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
                            <div className="shrink-0 text-wuxia-gold font-bold mr-2 z-20 bg-ink-black/90 px-2 flex items-center h-full border-r border-gray-800 text-transparent relative">
                                <span className="absolute inset-0 flex items-center px-2 text-wuxia-gold">【世界大事】</span>
                                【世界大事】
                            </div>

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
                                <span className="absolute inset-0 flex items-center px-2 text-wuxia-gold">【V0.0.1】</span>
                                【V0.0.1】
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
            )}

            {/* Global Golden Border Frame */}
            {!isMobile && <div className="pointer-events-none fixed inset-3 z-[100] border-4 border-double border-wuxia-gold/40 rounded-2xl shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                {/* Corner Ornaments */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-wuxia-gold rounded-tl-xl shadow-[-2px_-2px_5px_rgba(0,0,0,0.5)]"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-wuxia-gold rounded-tr-xl shadow-[2px_-2px_5px_rgba(0,0,0,0.5)]"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-wuxia-gold rounded-bl-xl shadow-[-2px_2px_5px_rgba(0,0,0,0.5)]"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-wuxia-gold rounded-br-xl shadow-[2px_2px_5px_rgba(0,0,0,0.5)]"></div>
                
                {/* Mid-point Accents */}
                <div className="absolute top-1/2 left-0 w-1 h-12 -translate-y-1/2 bg-wuxia-gold/60"></div>
                <div className="absolute top-1/2 right-0 w-1 h-12 -translate-y-1/2 bg-wuxia-gold/60"></div>
            </div>}

            {/* Save/Load Modal */}
            {state.showSaveLoad.show && (
                <懒加载边界>
                    <SaveLoadModal 
                        onClose={closeSaveLoad}
                        onLoadGame={actions.handleLoadGame}
                        onSaveGame={actions.handleSaveGame}
                        mode={state.showSaveLoad.mode}
                        requestConfirm={requestConfirm}
                    />
                </懒加载边界>
            )}

            {/* Settings Modal */}
            {state.showSettings && (
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
                            currentStory={state.剧情}
                            openingConfig={state.开局配置}
                            contextSnapshot={contextSnapshot}
                            onSaveApi={actions.saveSettings}
                            onSaveVisual={actions.saveVisualSettings}
                            onSaveGame={actions.saveGameSettings}
                            onSaveMemory={actions.saveMemorySettings}
                            onCreateNpc={actions.createNpcManually}
                            onSaveNpc={actions.updateNpcManually}
                            onDeleteNpc={actions.deleteNpcManually}
                            onStartNpcMemorySummary={actions.handleQueueManualNpcMemorySummary}
                            onUploadNpcImage={actions.uploadNpcImageToSlot}
                            onReplaceVariableSection={actions.updateRuntimeVariableSection}
                            onApplyVariableCommand={actions.applyRuntimeVariableCommand}
                            onUpdatePrompts={actions.updatePrompts}
                            onUpdateFestivals={actions.updateFestivals}
                            onThemeChange={setters.setCurrentTheme}
                            requestConfirm={requestConfirm}
                            onReturnToHome={handleReturnToHomeFromSettings}
                            isHome={state.view === 'home'}
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
                            currentStory={state.剧情}
                            openingConfig={state.开局配置}
                            contextSnapshot={contextSnapshot}
                            onSaveApi={actions.saveSettings}
                            onSaveVisual={actions.saveVisualSettings}
                            onSaveGame={actions.saveGameSettings}
                            onSaveMemory={actions.saveMemorySettings}
                            onCreateNpc={actions.createNpcManually}
                            onSaveNpc={actions.updateNpcManually}
                            onDeleteNpc={actions.deleteNpcManually}
                            onStartNpcMemorySummary={actions.handleQueueManualNpcMemorySummary}
                            onUploadNpcImage={actions.uploadNpcImageToSlot}
                            onReplaceVariableSection={actions.updateRuntimeVariableSection}
                            onApplyVariableCommand={actions.applyRuntimeVariableCommand}
                            onUpdatePrompts={actions.updatePrompts}
                            onUpdateFestivals={actions.updateFestivals}
                            onThemeChange={setters.setCurrentTheme}
                            requestConfirm={requestConfirm}
                            onReturnToHome={handleReturnToHomeFromSettings}
                            isHome={state.view === 'home'}
                        />
                    )}
                </懒加载边界>
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
            )}

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
                <懒加载边界>
                    {isMobile ? (
                        <ModalErrorBoundary title="图册打开失败" onClose={() => setShowImageManager(false)}>
                        <MobileImageManagerModal
                            socialList={state.社交}
                            cultivationSystemEnabled={启用修炼体系}
                            queue={meta.imageGenerationQueue || []}
                            sceneArchive={meta.sceneImageArchive || {}}
                            sceneQueue={meta.sceneImageQueue || []}
                            apiConfig={state.apiConfig}
                            imageManagerConfig={state.imageManagerConfig}
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
                            onApplySceneWallpaper={actions.applySceneImageWallpaper}
                            onClearSceneWallpaper={actions.clearSceneWallpaper}
                            onDeleteSceneImage={actions.removeSceneImageRecord}
                            onClearSceneHistory={actions.clearSceneImageHistory}
                            onDeleteSceneQueueTask={actions.removeSceneImageQueueTask}
                            onClearSceneQueue={actions.clearSceneImageQueue}
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
                            cultivationSystemEnabled={启用修炼体系}
                            queue={meta.imageGenerationQueue || []}
                            sceneArchive={meta.sceneImageArchive || {}}
                            sceneQueue={meta.sceneImageQueue || []}
                            apiConfig={state.apiConfig}
                            imageManagerConfig={state.imageManagerConfig}
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
                            onApplySceneWallpaper={actions.applySceneImageWallpaper}
                            onClearSceneWallpaper={actions.clearSceneWallpaper}
                            onDeleteSceneImage={actions.removeSceneImageRecord}
                            onClearSceneHistory={actions.clearSceneImageHistory}
                            onDeleteSceneQueueTask={actions.removeSceneImageQueueTask}
                            onClearSceneQueue={actions.clearSceneImageQueue}
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
            )}

            {/* In-Game Modals */}
            {state.view === 'game' && (
                <>
                    {state.showInventory && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileInventoryModal 
                                    character={state.角色} 
                                    onClose={() => setters.setShowInventory(false)} 
                                />
                            ) : (
                                <InventoryModal 
                                    character={state.角色} 
                                    onClose={() => setters.setShowInventory(false)} 
                                />
                            )}
                        </懒加载边界>
                    )}

                    {showCharacter && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileCharacter
                                    character={state.角色}
                                    gameConfig={state.gameConfig}
                                    apiConfig={state.apiConfig}
                                    playerAnchor={主角锚点}
                                    onGeneratePlayerImage={actions.generatePlayerImageManually}
                                    onSelectPlayerAvatarImage={actions.selectPlayerAvatarImage}
                                    onClearPlayerAvatarImage={actions.clearPlayerAvatarImage}
                                    onSelectPlayerPortraitImage={actions.selectPlayerPortraitImage}
                                    onClearPlayerPortraitImage={actions.clearPlayerPortraitImage}
                                    onRemovePlayerImageRecord={actions.removePlayerImageRecord}
                                    onClose={() => setShowCharacter(false)}
                                />
                            ) : (
                                <CharacterModal
                                    character={state.角色}
                                    onClose={() => setShowCharacter(false)}
                                    visualConfig={effectiveVisualConfig}
                                    apiConfig={state.apiConfig}
                                    playerAnchor={主角锚点}
                                    onGeneratePlayerImage={actions.generatePlayerImageManually}
                                    onExtractPlayerAnchor={actions.extractPlayerCharacterAnchor}
                                    onSavePlayerAnchor={actions.saveCharacterAnchor}
                                    onDeletePlayerAnchor={actions.deleteCharacterAnchor}
                                    onSelectPlayerAvatarImage={actions.selectPlayerAvatarImage}
                                    onClearPlayerAvatarImage={actions.clearPlayerAvatarImage}
                                    onSelectPlayerPortraitImage={actions.selectPlayerPortraitImage}
                                    onClearPlayerPortraitImage={actions.clearPlayerPortraitImage}
                                    onRemovePlayerImageRecord={actions.removePlayerImageRecord}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {state.showEquipment && (
                        <懒加载边界>
                            <EquipmentModal 
                                character={state.角色} 
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
                                    onClose={() => setters.setShowBattle(false)}
                                />
                            ) : (
                                <BattleModal
                                    character={state.角色}
                                    battle={state.战斗}
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
                                    onClose={() => setters.setShowTeam(false)}
                                />
                            ) : (
                                <TeamModal
                                    character={state.角色}
                                    teammates={state.社交}
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
                                    onClose={() => setters.setShowSocial(false)}
                                    playerName={state.角色.姓名}
                                    nsfwEnabled={state.gameConfig.启用NSFW模式 === true}
                                    onToggleMajorRole={actions.updateNpcMajorRole}
                                    onTogglePresence={actions.updateNpcPresence}
                                    onDeleteNpc={actions.removeNpc}
                                />
                            ) : (
                                <SocialModal
                                    socialList={state.社交}
                                    cultivationSystemEnabled={启用修炼体系}
                                    onClose={() => setters.setShowSocial(false)}
                                    playerName={state.角色.姓名}
                                    nsfwEnabled={state.gameConfig.启用NSFW模式 === true}
                                    onToggleMajorRole={actions.updateNpcMajorRole}
                                    onTogglePresence={actions.updateNpcPresence}
                                    onDeleteNpc={actions.removeNpc}
                                />
                            )}
                        </懒加载边界>
                    )}

                    {启用修炼体系 && state.showKungfu && (
                        <懒加载边界>
                            {isMobile ? (
                                <MobileKungfuModal
                                    skills={state.角色.功法列表}
                                    onClose={() => setters.setShowKungfu(false)}
                                />
                            ) : (
                                <KungfuModal
                                    skills={state.角色.功法列表}
                                    onClose={() => setters.setShowKungfu(false)}
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
                                    onClose={() => setters.setShowMap(false)}
                                />
                            ) : (
                                <MapModal
                                    world={state.世界}
                                    env={state.环境}
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
                                    currentTime={currentEnvTime}
                                    onClose={() => setters.setShowSect(false)}
                                />
                            ) : (
                                <SectModal
                                    sectData={state.玩家门派}
                                    currentTime={currentEnvTime}
                                    onClose={() => setters.setShowSect(false)}
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
                                    onClose={() => setters.setShowTask(false)}
                                />
                            ) : (
                                <TaskModal
                                    tasks={state.任务列表}
                                    onDeleteTask={actions.removeTask}
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

                    {state.showHeroinePlan && state.gameConfig.启用女主剧情规划 === true && (
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
                </>
            )}
        </div>
    </MusicProvider>
    );
};

export default App;
