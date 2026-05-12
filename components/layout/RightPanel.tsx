import React from 'react';
import GameButton from '../ui/GameButton';
import { useMusic } from '../features/Music/MusicProvider';
import MusicPlayerUI from '../features/Music/MusicPlayerUI';

interface Props {
    onOpenSettings: () => void;
    onOpenInventory: () => void;
    onOpenEquipment: () => void;
    onOpenBattle: () => void;
    onOpenTeam: () => void;
    onOpenSocial: () => void;
    onOpenKungfu: () => void;
    onOpenWorld: () => void;
    onOpenMap: () => void;
    onOpenSect: () => void;
    onOpenTask: () => void;
    onOpenAgreement: () => void;
    onOpenStory: () => void;
    onOpenHeroinePlan: () => void;
    onOpenMemory: () => void;
    onOpenNovelExport?: () => void;
    onOpenImageManager?: () => void;
    onOpenNovelDecomposition?: () => void;
    onOpenAuctionHouse?: () => void;
    worldEvolutionEnabled?: boolean;
    worldEvolutionUpdating?: boolean;
    enableHeroinePlan?: boolean;
    enableKungfu?: boolean;
    onSave: () => void;
    onLoad: () => void;
    visualConfig?: any;
    latestChangedSections?: string[];
}

const RightPanel: React.FC<Props> = ({
    onOpenSettings,
    onOpenInventory,
    onOpenEquipment,
    onOpenBattle,
    onOpenTeam,
    onOpenSocial,
    onOpenKungfu,
    onOpenWorld,
    onOpenMap,
    onOpenSect,
    onOpenTask,
    onOpenAgreement,
    onOpenStory,
    onOpenHeroinePlan,
    onOpenMemory,
    onOpenNovelExport,
    onOpenImageManager,
    onOpenNovelDecomposition,
    onOpenAuctionHouse,
    worldEvolutionEnabled = false,
    worldEvolutionUpdating = false,
    enableHeroinePlan = false,
    enableKungfu = true,
    onSave,
    onLoad,
    visualConfig,
    latestChangedSections = []
}) => {
    const { enabled, currentLyric } = useMusic();
    const baseFontSize = Number(visualConfig?.['右侧栏']?.fontSize || visualConfig?.fontSize) || 13;
    const scaleFont = (ratio: number, min = 13) => `${Math.max(min, Math.round(baseFontSize * ratio))}px`;
    const [dismissedChangeKeys, setDismissedChangeKeys] = React.useState<Set<string>>(() => new Set());
    const changeSignature = React.useMemo(() => latestChangedSections.slice().sort().join('|'), [latestChangedSections]);

    React.useEffect(() => {
        setDismissedChangeKeys(new Set());
    }, [changeSignature]);

    const wrapChangedAction = (changeKeys: string[], action: () => void) => () => {
        if (changeKeys.length > 0) {
            setDismissedChangeKeys((prev) => {
                const next = new Set(prev);
                changeKeys.forEach((key) => next.add(key));
                return next;
            });
        }
        action();
    };

    const menuItems = [
        { label: '战斗', action: onOpenBattle, color: 'primary' as const, changeKeys: ['战斗'] },
        { label: '装备', action: onOpenEquipment, color: 'primary' as const, changeKeys: ['装备'] },
        { label: '背包', action: onOpenInventory, color: 'primary' as const, changeKeys: ['背包'] },
        ...(onOpenAuctionHouse ? [{ label: '拍卖行', action: onOpenAuctionHouse, color: 'primary' as const }] : []),
        { label: '社交', action: onOpenSocial, color: 'primary' as const, changeKeys: ['社交'] },
        {
            label: worldEvolutionUpdating ? '世界·更新中' : '世界',
            action: onOpenWorld,
            color: worldEvolutionUpdating ? 'secondary' as const : 'primary' as const,
            changeKeys: ['世界'],
            className: worldEvolutionEnabled && worldEvolutionUpdating
                ? 'animate-pulse shadow-[0_0_18px_rgba(90,220,220,0.35)]'
                : ''
        },
        { label: '队伍', action: onOpenTeam, color: 'primary' as const, changeKeys: ['队伍'] },
        ...(enableKungfu ? [{ label: '功法', action: onOpenKungfu, color: 'primary' as const, changeKeys: ['功法'] }] : []),
        { label: '地图', action: onOpenMap, color: 'primary' as const, changeKeys: ['地图'] },
        { label: '门派', action: onOpenSect, color: 'primary' as const, changeKeys: ['玩家门派'] },
        { label: '任务', action: onOpenTask, color: 'primary' as const, changeKeys: ['任务列表'] },
        { label: '约定', action: onOpenAgreement, color: 'primary' as const, changeKeys: ['约定列表'] },
        { label: '剧情', action: onOpenStory, color: 'primary' as const, changeKeys: ['剧情'] },
        ...(enableHeroinePlan ? [{ label: '规划', action: onOpenHeroinePlan, color: 'primary' as const, changeKeys: ['剧情规划'] }] : []),
        { label: '记忆', action: onOpenMemory, color: 'primary' as const, changeKeys: ['记忆系统'] },
        ...(onOpenNovelExport ? [{ label: '导出小说', action: onOpenNovelExport, color: 'secondary' as const }] : []),
        ...(onOpenImageManager ? [{ label: '图册', action: onOpenImageManager, color: 'secondary' as const }] : []),
        ...(onOpenNovelDecomposition ? [{ label: '小说分解', action: onOpenNovelDecomposition, color: 'secondary' as const }] : []),
    ];

    const systemItems = [
        { label: '保存进度', action: onSave },
        { label: '读取进度', action: onLoad },
        { label: '江湖设置', action: onOpenSettings },
    ];

    return (
        <div className="right-panel-body h-full flex flex-col p-2 border-l border-wuxia-gold/20 relative bg-transparent">
            <div className="right-panel-ambient absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-700 via-black to-black"></div>

            {enabled ? (
                <div className="mb-4 pb-4 border-b border-gray-800 shrink-0">
                    <MusicPlayerUI />
                </div>
            ) : (
                <div className="right-panel-system-header mb-3 text-center border-b border-gray-800 pb-3 relative h-[62px] flex flex-col justify-center shrink-0">
                    <h1 className="font-black tracking-[0.28em] opacity-90 drop-shadow-md text-wuxia-gold" style={{ fontSize: scaleFont(1.62, 21) }}>天机</h1>
                    <div className="text-gray-600 tracking-[0.14em] mt-0.5 uppercase" style={{ fontSize: scaleFont(0.86, 11), lineHeight: 1.1 }}>System Menu</div>
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-wuxia-gold/50 to-transparent"></div>
                </div>
            )}

            {enabled && currentLyric && (
                <div className="mb-2 -mt-1 text-center overflow-hidden animate-in fade-in duration-700 h-8 flex items-center justify-center">
                    <p className="text-wuxia-gold/90 italic tracking-wider leading-tight px-2 line-clamp-2 drop-shadow-[0_0_3px_rgba(230,200,110,0.3)]" style={{ fontSize: scaleFont(1.02, 14) }}>
                        {currentLyric}
                    </p>
                </div>
            )}

            <div className="right-panel-menu-frame flex-1 flex flex-col gap-2 relative py-1 min-h-0">
                <div className="right-panel-menu-outline absolute inset-0 border border-gray-800 bg-white/[0.02] pointer-events-none">
                    <div className="right-panel-menu-corner absolute top-0 left-0 w-2 h-2 border-t border-l border-gray-600"></div>
                    <div className="right-panel-menu-corner absolute top-0 right-0 w-2 h-2 border-t border-r border-gray-600"></div>
                    <div className="right-panel-menu-corner absolute bottom-0 left-0 w-2 h-2 border-b border-l border-gray-600"></div>
                    <div className="right-panel-menu-corner absolute bottom-0 right-0 w-2 h-2 border-b border-r border-gray-600"></div>
                </div>
                <div className="p-2.5 space-y-2 h-full overflow-y-auto no-scrollbar relative z-10">
                    {menuItems.map((item) => {
                        const changeKeys = Array.isArray((item as any).changeKeys) ? (item as any).changeKeys as string[] : [];
                        const hasUnreadChange = changeKeys.some((key) => latestChangedSections.includes(key) && !dismissedChangeKeys.has(key));
                        return (
                        <GameButton
                            key={item.label}
                            onClick={wrapChangedAction(changeKeys, item.action)}
                            variant={item.color}
                            className={`relative w-full text-center py-1.5 text-sm tracking-[0.12em] hover:scale-[1.015] transition-transform !skew-x-0 border-opacity-60 ${item.className || ''}`}
                            contentClassName="!skew-x-0"
                        >
                            <span className="whitespace-nowrap" style={{ fontSize: scaleFont(0.96, 12), lineHeight: 1.35 }}>{item.label}</span>
                            {hasUnreadChange && (
                                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_14px_rgba(220,38,38,1)] ring-2 ring-red-400/80 animate-pulse" />
                            )}
                        </GameButton>
                    );})}
                </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5 shrink-0">
                {systemItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={item.action}
                        className="right-panel-system-button w-full text-center transition-all py-1 uppercase tracking-[0.08em] border border-transparent hover:border-gray-800 hover:bg-white/5 rounded-sm text-gray-500"
                        style={{ fontSize: scaleFont(0.88, 12) }}
                    >
                        [ {item.label} ]
                    </button>
                ))}
            </div>
            <div className="right-panel-bottom-fade absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
        </div>
    );
};

export default RightPanel;
