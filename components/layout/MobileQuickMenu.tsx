import React, { useMemo, useState } from 'react';
import { useMusic } from '../features/Music/MusicProvider';

type MenuId =
    | 'character'
    | 'battle'
    | 'equipment'
    | 'inventory'
    | 'social'
    | 'kungfu'
    | 'world'
    | 'map'
    | 'team'
    | 'sect'
    | 'task'
    | 'agreement'
    | 'story'
    | 'plan'
    | 'memory'
    | 'export_novel'
    | 'image_manager'
    | 'novel_decomposition'
    | 'save'
    | 'load'
    | 'settings'
    | 'music'
    | 'more';

interface Props {
    activeWindow: MenuId | null;
    onMenuClick: (menu: MenuId) => void;
    enableHeroinePlan?: boolean;
    enableKungfu?: boolean;
    enableImageManager?: boolean;
    enableNovelDecomposition?: boolean;
}

type IconName =
    | 'profile'
    | 'battle'
    | 'equipment'
    | 'bag'
    | 'social'
    | 'kungfu'
    | 'world'
    | 'map'
    | 'more'
    | 'team'
    | 'sect'
    | 'task'
    | 'agreement'
    | 'story'
    | 'plan'
    | 'memory'
    | 'settings'
    | 'save'
    | 'load'
    | 'grid'
    | 'novel';

type MenuMeta = {
    id: MenuId;
    label: string;
    icon: IconName;
};

const MENU_META: Record<Exclude<MenuId, 'more'>, MenuMeta> = {
    character: { id: 'character', label: '角色', icon: 'profile' },
    battle: { id: 'battle', label: '战斗', icon: 'battle' },
    equipment: { id: 'equipment', label: '装备', icon: 'equipment' },
    inventory: { id: 'inventory', label: '背包', icon: 'bag' },
    social: { id: 'social', label: '社交', icon: 'social' },
    kungfu: { id: 'kungfu', label: '功法', icon: 'kungfu' },
    world: { id: 'world', label: '世界', icon: 'world' },
    map: { id: 'map', label: '地图', icon: 'map' },
    team: { id: 'team', label: '队伍', icon: 'team' },
    sect: { id: 'sect', label: '门派', icon: 'sect' },
    task: { id: 'task', label: '任务', icon: 'task' },
    agreement: { id: 'agreement', label: '约定', icon: 'agreement' },
    story: { id: 'story', label: '剧情', icon: 'story' },
    plan: { id: 'plan', label: '规划', icon: 'plan' },
    memory: { id: 'memory', label: '记忆', icon: 'memory' },
    export_novel: { id: 'export_novel', label: '导出', icon: 'novel' },
    image_manager: { id: 'image_manager', label: '图册', icon: 'grid' },
    novel_decomposition: { id: 'novel_decomposition', label: '分解', icon: 'novel' },
    save: { id: 'save', label: '保存', icon: 'save' },
    load: { id: 'load', label: '读取', icon: 'load' },
    settings: { id: 'settings', label: '设置', icon: 'settings' },
    music: { id: 'music', label: '音乐', icon: 'novel' },
};

const MobileQuickMenu: React.FC<Props> = ({
    activeWindow,
    onMenuClick,
    enableHeroinePlan = false,
    enableKungfu = true,
    enableImageManager = false,
    enableNovelDecomposition = false
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [showAllMenus, setShowAllMenus] = useState(false);
    const { enabled, isPlaying, tracks, currentTrackId } = useMusic();

    const currentTrackCover = useMemo(
        () => tracks.find((track) => track.id === currentTrackId)?.封面URL || '',
        [tracks, currentTrackId]
    );

    const visibleMenus = useMemo<MenuMeta[]>(() => ([
        MENU_META.character,
        MENU_META.battle,
        MENU_META.equipment,
        MENU_META.inventory,
        MENU_META.social,
        MENU_META.world,
        MENU_META.map,
        ...(enabled ? [MENU_META.music] : []),
        MENU_META.settings,
    ]), [enabled]);

    const allMenus = useMemo<MenuMeta[]>(() => ([
        MENU_META.character,
        MENU_META.battle,
        MENU_META.equipment,
        MENU_META.inventory,
        MENU_META.social,
        ...(enableKungfu ? [MENU_META.kungfu] : []),
        MENU_META.world,
        MENU_META.map,
        MENU_META.team,
        MENU_META.sect,
        MENU_META.task,
        MENU_META.agreement,
        MENU_META.story,
        ...(enableHeroinePlan ? [MENU_META.plan] : []),
        MENU_META.memory,
        MENU_META.export_novel,
        ...(enableImageManager ? [MENU_META.image_manager] : []),
        ...(enableNovelDecomposition ? [MENU_META.novel_decomposition] : []),
        MENU_META.save,
        MENU_META.load,
        MENU_META.settings,
    ]), [enableHeroinePlan, enableImageManager, enableKungfu, enableNovelDecomposition]);

    const handleMenuClick = (menu: MenuId) => {
        onMenuClick(menu);
        if (menu !== 'music') {
            setShowAllMenus(false);
        }
    };

    return (
        <div className="md:hidden pointer-events-none fixed inset-y-0 right-0 z-[86] flex items-end pb-[calc(var(--app-safe-bottom,env(safe-area-inset-bottom,0px))+34px)]">
            <div className="pointer-events-auto relative flex items-end gap-2 pr-2">
                {!collapsed && showAllMenus && (
                    <div className="mb-2 max-h-[68vh] w-[170px] overflow-hidden rounded-3xl border border-wuxia-gold/14 bg-black/38 shadow-[0_14px_40px_rgba(0,0,0,0.24)] backdrop-blur-sm">
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                            <span className="text-[10px] tracking-[0.2em] text-wuxia-gold/70">全部功能</span>
                            <span className="text-[10px] text-gray-400">{allMenus.length} 项</span>
                        </div>
                        <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto p-2 no-scrollbar">
                            {allMenus.map((menu) => (
                                <MenuTile
                                    key={menu.id}
                                    icon={menu.icon}
                                    label={menu.label}
                                    active={activeWindow === menu.id}
                                    onClick={() => handleMenuClick(menu.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="relative flex flex-col items-end gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            if (!collapsed) setShowAllMenus(false);
                            setCollapsed(prev => !prev);
                        }}
                        className="absolute -top-11 right-0 flex h-9 w-9 items-center justify-center rounded-xl border border-wuxia-gold/20 bg-black/24 text-wuxia-gold shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-colors hover:border-wuxia-gold/40 hover:bg-black/36"
                        aria-label={collapsed ? '展开功能栏' : '收起功能栏'}
                        title={collapsed ? '展开功能栏' : '收起功能栏'}
                    >
                        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                        </svg>
                    </button>

                    {!collapsed && (
                        <div className="flex max-h-[72vh] flex-col gap-1 overflow-y-auto rounded-[18px] border border-wuxia-gold/12 bg-black/14 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-sm no-scrollbar">
                            {visibleMenus.map((menu) => (
                                <RailButton
                                    key={menu.id}
                                    icon={menu.icon}
                                    label={menu.label}
                                    active={activeWindow === menu.id}
                                    onClick={() => handleMenuClick(menu.id)}
                                    isMusic={menu.id === 'music'}
                                    isPlaying={menu.id === 'music' && isPlaying}
                                    coverUrl={menu.id === 'music' ? currentTrackCover : ''}
                                />
                            ))}

                            <RailButton
                                icon="more"
                                label={showAllMenus ? '收起' : '更多'}
                                active={showAllMenus}
                                onClick={() => setShowAllMenus((prev) => !prev)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const RailButton = ({
    icon,
    label,
    active,
    onClick,
    isMusic = false,
    isPlaying = false,
    coverUrl = '',
}: {
    icon: IconName;
    label: string;
    active?: boolean;
    onClick: () => void;
    isMusic?: boolean;
    isPlaying?: boolean;
    coverUrl?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`group relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl border transition-all ${
            active
                ? 'border-wuxia-gold/60 bg-wuxia-gold/12 text-wuxia-gold shadow-[0_0_16px_rgba(230,200,110,0.14)]'
                : 'border-wuxia-gold/12 bg-black/18 text-wuxia-gold/78 hover:border-wuxia-gold/32 hover:bg-black/28'
        } ${isPlaying ? 'animate-wuxia-music-disc-rotation' : ''}`}
        aria-label={label}
        title={label}
    >
        {isMusic && coverUrl ? (
            <>
                <img src={coverUrl} alt={label} className="absolute inset-0 h-full w-full object-cover opacity-70" />
                <div className="absolute inset-0 bg-black/35" />
                <div className="absolute inset-[28%] rounded-full border border-black/25 bg-black/50" />
            </>
        ) : null}
        <span className="relative z-10 flex h-4 w-4 items-center justify-center">
            <IconGlyph name={icon} className="h-3.5 w-3.5" />
        </span>
    </button>
);

const MenuTile = ({
    icon,
    label,
    active,
    onClick,
}: {
    icon: IconName;
    label: string;
    active?: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl border transition-colors ${
            active
                ? 'border-wuxia-gold/80 bg-wuxia-gold/10 text-wuxia-gold'
                : 'border-gray-800 bg-black/20 text-gray-300 hover:border-wuxia-cyan/60 hover:text-white'
        }`}
    >
        <span className="flex h-5 w-5 items-center justify-center">
            <IconGlyph name={icon} className="h-4.5 w-4.5" />
        </span>
        <span className="text-[9px] tracking-[0.08em]">{label}</span>
    </button>
);

const IconGlyph = ({ name, className }: { name: IconName; className?: string }) => {
    const svgClass = className || 'h-4 w-4';

    switch (name) {
        case 'profile':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c1.2-3.1 3.4-4.7 6.5-4.7s5.3 1.6 6.5 4.7" /></svg>;
        case 'battle':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 5 4.5 4.5L8 13l-3.5-3.5L7 5Z" /><path d="m17 5-4.5 4.5L16 13l3.5-3.5L17 5Z" /><path d="M9 15h6M8 19h8" /></svg>;
        case 'equipment':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4.5 7 4-2.5 2.5 2.5-2.5 4z" /><path d="m10 10 7 7" /><path d="m16.5 16.5-2 2" /></svg>;
        case 'bag':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 8h10l-1 11H8L7 8Z" /><path d="M9.5 8V7a2.5 2.5 0 0 1 5 0v1" /></svg>;
        case 'social':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 6.5h15v9h-7l-4 3v-3h-4z" /></svg>;
        case 'kungfu':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 6.5h6.5v11H4.5zM13 6.5h6.5v11H13z" /><path d="M11 7.5c.7-.6 1.4-.9 2-.9" /></svg>;
        case 'world':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><path d="M4.6 12h14.8M12 4.2c2.5 2.3 2.5 13.3 0 15.6M12 4.2c-2.5 2.3-2.5 13.3 0 15.6" /></svg>;
        case 'map':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3.5 6.5 8.5 4l7 2.5 5-2v13l-5 2-7-2.5-5 2z" /><path d="M8.5 4v12.5M15.5 6.5V19" /></svg>;
        case 'more':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="currentColor"><circle cx="6" cy="6" r="1.6" /><circle cx="12" cy="6" r="1.6" /><circle cx="18" cy="6" r="1.6" /><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /><circle cx="6" cy="18" r="1.6" /><circle cx="12" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></svg>;
        case 'team':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="9" r="2.5" /><circle cx="15.5" cy="10.5" r="2" /><path d="M4.8 18c.8-2.5 2.4-3.8 4.8-3.8s4 .9 5 2.8" /></svg>;
        case 'sect':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 9h15" /><path d="M6.5 9v8M12 9v8M17.5 9v8" /><path d="m4 9 8-4 8 4M4.5 19h15" /></svg>;
        case 'task':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="6" y="4.5" width="12" height="15" rx="1.5" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
        case 'agreement':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 6.5h10v11H7z" /><path d="M9.5 9.5h5M9.5 12h5M9.5 14.5h3" /><path d="m14.5 16.5 1.2 1.2 2.8-2.8" /></svg>;
        case 'story':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5.5 5.5h13v13h-13z" /><path d="M8.5 9h7M8.5 12h7M8.5 15h4" /></svg>;
        case 'plan':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 6.5h15v11h-15z" /><path d="M7.5 9.5h9M7.5 12.5h5" /><path d="m13.5 14.5 1.5 1.5 3-3" /></svg>;
        case 'memory':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="7.5" /><path d="M12 8.3V12l3 1.7" /></svg>;
        case 'novel':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 5.5h9.5a2.5 2.5 0 0 1 2.5 2.5v10.5H8.5A2.5 2.5 0 0 0 6 21V5.5Z" /><path d="M6 6.5h9a2 2 0 0 1 2 2v10M9 10h6M9 13h6M9 16h4" /></svg>;
        case 'save':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 4.5h10l2 2V19H6z" /><path d="M8.5 4.5v5h7v-5M8.5 19v-5h7v5" /></svg>;
        case 'load':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6.5h12V18H6z" /><path d="m12 9.5-3 3h2v2h2v-2h2z" /></svg>;
        case 'settings':
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3.8 1.2 1.8 2.1.4.4 2.1 1.8 1.2-1.8 1.2-.4 2.1-2.1.4-1.2 1.8-1.2-1.8-2.1-.4-.4-2.1-1.8-1.2 1.8-1.2.4-2.1 2.1-.4z" /><circle cx="12" cy="10.8" r="2.2" /></svg>;
        default:
            return <svg viewBox="0 0 24 24" className={svgClass} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="5.5" height="5.5" /><rect x="13.5" y="5" width="5.5" height="5.5" /><rect x="5" y="13.5" width="5.5" height="5.5" /><rect x="13.5" y="13.5" width="5.5" height="5.5" /></svg>;
    }
};

export default React.memo(MobileQuickMenu);
