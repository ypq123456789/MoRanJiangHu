import React from 'react';
import { useMusic } from '../features/Music/MusicProvider';
import MusicPlayerUI from '../features/Music/MusicPlayerUI';
import type { 题材界面文案 } from '../../utils/resourceLabels';
import { 判断是否有未读 } from '../../utils/rightPanelUnread';
import './RightPanel.css';

interface Props {
    onOpenSettings: () => void;
    onOpenInventory: () => void;
    onOpenEquipment: () => void;
    onOpenBattle?: () => void;
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
    auctionHouseLabel?: string;
    sectLabel?: string;
    uiLabels?: 题材界面文案;
    worldEvolutionEnabled?: boolean;
    worldEvolutionUpdating?: boolean;
    enableWorldPanel?: boolean;
    enableHeroinePlan?: boolean;
    enablePlanningPanel?: boolean;
    enableKungfu?: boolean;
    kungfuLabel?: string;
    onSave: () => void;
    onLoad: () => void;
    onReturnToHome?: () => void;
    returnHomeSaving?: boolean;
    visualConfig?: any;
    latestChangedSections?: string[];
    dismissedChangeKeys?: string[];
    onDismissChangeKeys?: (keys: string[]) => void;
    activeKey?: string | null;
    onCollapse?: () => void;
}

type MenuItemDef = {
    key: string;
    label: string;
    action: () => void;
    changeKeys?: string[];
    wide?: boolean;
    updating?: boolean;
};

type AccordionGroupDef = {
    id: string;
    title: string;
    items: MenuItemDef[];
};

const OPEN_GROUPS_STORAGE_KEY = 'moran.rightPanel.openGroups.v1';

const readInitialOpenGroups = (): string[] => {
    try {
        const raw = localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
        if (!raw) return ['combat'];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
            return parsed;
        }
    } catch {}
    return ['combat'];
};

const QuickIcon: React.FC<{ id: 'inventory' | 'social' | 'equipment' | 'task' }> = ({ id }) => {
    if (id === 'inventory') {
        return (
            <svg viewBox="0 0 20 20" className="rp-quick-icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 7h10l1 9.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5L5 7Z" />
                <path d="M7.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
            </svg>
        );
    }
    if (id === 'social') {
        return (
            <svg viewBox="0 0 20 20" className="rp-quick-icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8" cy="7" r="2.7" />
                <path d="M3.5 16c.5-2.6 2.2-4 4.5-4s4 1.4 4.5 4" />
                <circle cx="14.2" cy="8.2" r="2" />
                <path d="M13.5 12.2c1.8.3 3 1.5 3.3 3.8" />
            </svg>
        );
    }
    if (id === 'equipment') {
        return (
            <svg viewBox="0 0 20 20" className="rp-quick-icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 2.5 16 5v4.5c0 3.7-2.5 6.4-6 8-3.5-1.6-6-4.3-6-8V5l6-2.5Z" />
                <path d="M10 6.2v6.6M7.2 9.2h5.6" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 20 20" className="rp-quick-icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="3" width="12" height="14" rx="1.8" />
            <path d="M7 7.2h6M7 10.5h6M7 13.8h4" />
        </svg>
    );
};

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
    auctionHouseLabel = '拍卖行',
    sectLabel = '门派',
    uiLabels,
    worldEvolutionEnabled = false,
    worldEvolutionUpdating = false,
    enableWorldPanel = true,
    enableHeroinePlan = false,
    enablePlanningPanel = true,
    enableKungfu = true,
    kungfuLabel = '功法',
    onSave,
    onLoad,
    onReturnToHome,
    returnHomeSaving = false,
    latestChangedSections = [],
    dismissedChangeKeys = [],
    onDismissChangeKeys,
    activeKey = null,
    onCollapse,
}) => {
    const { enabled, currentLyric } = useMusic();
    const [openGroups, setOpenGroups] = React.useState<string[]>(readInitialOpenGroups);
    const changeSectionSet = React.useMemo(
        () => new Set(latestChangedSections),
        [latestChangedSections]
    );

    const toggleGroup = (groupId: string) => {
        setOpenGroups((prev) => {
            const next = prev.includes(groupId)
                ? prev.filter((id) => id !== groupId)
                : [...prev, groupId];
            try {
                localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    // 已读状态由 App 持有，组件卸载重挂不会丢失；收起书签与菜单项共用同一套判断。
    const hasUnread = (changeKeys?: string[]) =>
        判断是否有未读(changeKeys || [], changeSectionSet, dismissedChangeKeys);

    const wrapChangedAction = (changeKeys: string[] | undefined, action: () => void) => () => {
        // 只登记「此刻真的有未读」的键。回合键在同一回合的后处理期间不变，
        // 若把暂时没有变化的键也记成已读，后处理稍后补上的变化就再也不会提示。
        const unreadKeys = (changeKeys || []).filter((key) => hasUnread([key]));
        if (unreadKeys.length > 0) {
            onDismissChangeKeys?.(unreadKeys);
        }
        action();
    };

    const menuLabel = uiLabels?.菜单;
    const titleLabel = uiLabels?.标题;
    const systemHeaderTitle = titleLabel?.系统菜单题头 || '天机';

    const quickItems: Array<{
        key: string;
        iconId: 'inventory' | 'social' | 'equipment' | 'task';
        label: string;
        action: () => void;
        changeKeys: string[];
    }> = [
        { key: 'inventory', iconId: 'inventory', label: menuLabel?.inventory || '背包', action: onOpenInventory, changeKeys: ['背包'] },
        { key: 'social', iconId: 'social', label: menuLabel?.social || '社交', action: onOpenSocial, changeKeys: ['社交'] },
        { key: 'equipment', iconId: 'equipment', label: menuLabel?.equipment || '装备', action: onOpenEquipment, changeKeys: ['装备'] },
        { key: 'task', iconId: 'task', label: menuLabel?.task || '任务', action: onOpenTask, changeKeys: ['任务列表'] },
    ];

    const groups: AccordionGroupDef[] = [
        ...(onOpenBattle || enableKungfu || onOpenAuctionHouse ? [{
            id: 'combat',
            title: (!onOpenBattle && !onOpenAuctionHouse) ? '武学修行' : '身手市集',
            items: [
                ...(onOpenBattle ? [{ key: 'battle', label: menuLabel?.battle || '战斗', action: onOpenBattle, changeKeys: ['战斗'] }] : []),
                ...(enableKungfu ? [{ key: 'kungfu', label: kungfuLabel, action: onOpenKungfu, changeKeys: ['功法'] }] : []),
                ...(onOpenAuctionHouse ? [{ key: 'auction_house', label: auctionHouseLabel, action: onOpenAuctionHouse, wide: auctionHouseLabel.length >= 4 }] : []),
            ],
        }] : []),
        {
            id: 'world',
            title: '江湖舆图',
            items: [
                { key: 'team', label: menuLabel?.team || '队伍', action: onOpenTeam, changeKeys: ['队伍'] },
                { key: 'sect', label: sectLabel, action: onOpenSect, changeKeys: ['玩家门派'] },
                ...(enableWorldPanel ? [{
                    key: 'world',
                    label: worldEvolutionUpdating ? `${menuLabel?.world || '世界'}·演化中` : (menuLabel?.world || '世界'),
                    action: onOpenWorld,
                    changeKeys: ['世界'],
                    wide: Boolean(worldEvolutionUpdating),
                    updating: Boolean(worldEvolutionEnabled && worldEvolutionUpdating),
                }] : []),
                { key: 'map', label: menuLabel?.map || '地图', action: onOpenMap, changeKeys: ['地图'] },
            ],
        },
        {
            id: 'story',
            title: '纪事卷宗',
            items: [
                { key: 'agreement', label: menuLabel?.agreement || '约定', action: onOpenAgreement, changeKeys: ['约定列表'] },
                { key: 'story', label: menuLabel?.story || '剧情', action: onOpenStory, changeKeys: ['剧情'] },
                ...(enablePlanningPanel && enableHeroinePlan ? [{ key: 'plan', label: menuLabel?.plan || '规划', action: onOpenHeroinePlan, changeKeys: ['剧情规划'] }] : []),
                { key: 'memory', label: menuLabel?.memory || '记忆', action: onOpenMemory, changeKeys: ['记忆系统'] },
            ],
        },
    ];

    const extraToolItems: MenuItemDef[] = [
        ...(onOpenImageManager ? [{ key: 'image_manager', label: menuLabel?.imageManager || '图册', action: onOpenImageManager }] : []),
        ...(onOpenNovelExport ? [{ key: 'export_novel', label: '导出小说', action: onOpenNovelExport, wide: true }] : []),
        ...(onOpenNovelDecomposition ? [{ key: 'novel_decomposition', label: '分解工坊', action: onOpenNovelDecomposition, wide: true }] : []),
    ];
    if (extraToolItems.length > 0) {
        groups.push({ id: 'tools', title: '藏书工坊', items: extraToolItems });
    }

    const systemItems = [
        { key: 'save', label: '保存进度', action: onSave },
        { key: 'load', label: '读取进度', action: onLoad },
        { key: 'settings', label: titleLabel?.系统设置 || '江湖设置', action: onOpenSettings },
        ...(onReturnToHome ? [{
            key: 'home',
            label: returnHomeSaving ? '保存中...' : '返回首页',
            action: onReturnToHome,
            disabled: returnHomeSaving,
            isExit: true,
        }] : []),
    ];

    return (
        <div className="right-panel-body rp-shell">
            {enabled ? (
                <div className="rp-music-wrap">
                    {onCollapse && (
                        <div className="rp-music-top">
                            <button
                                type="button"
                                onClick={onCollapse}
                                className="rp-collapse-btn"
                                aria-label="收起天机菜单"
                                title="收起右侧菜单，获得更宽阅读视野"
                            >
                                <span>收起</span>
                                <span aria-hidden="true">▸</span>
                            </button>
                        </div>
                    )}
                    <MusicPlayerUI />
                    {currentLyric && (
                        <div className="mt-1.5 text-center overflow-hidden h-7 flex items-center justify-center">
                            <p className="text-wuxia-gold/90 italic tracking-wider leading-tight px-1 line-clamp-2 text-xs">
                                {currentLyric}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="rp-header">
                    <div className="rp-title-wrap">
                        <h1 className="rp-title">{systemHeaderTitle}</h1>
                    </div>
                    {onCollapse && (
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="rp-collapse-btn"
                            aria-label="收起天机菜单"
                            title="收起右侧菜单，获得更宽阅读视野"
                        >
                            <span>收起</span>
                            <span aria-hidden="true">▸</span>
                        </button>
                    )}
                </div>
            )}

            <div className="right-panel-menu-scroll rp-scroll no-scrollbar">
                {/* 高频 2x2 印格：永不折叠，1 次点击直达 */}
                <div className="rp-quick-grid" role="group" aria-label="常用入口">
                    {quickItems.map((item) => {
                        const active = activeKey === item.key;
                        const unread = hasUnread(item.changeKeys);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={wrapChangedAction(item.changeKeys, item.action)}
                                className={`rp-quick-tile ${active ? 'rp-quick-tile--active' : ''}`}
                                aria-current={active ? 'page' : undefined}
                                title={item.label}
                            >
                                <QuickIcon id={item.iconId} />
                                <span className="rp-quick-label">{item.label}</span>
                                {unread && <span className="rp-dot" aria-label="有新变动" />}
                            </button>
                        );
                    })}
                </div>

                {/* 可折叠书卷手风琴 */}
                <div className="rp-acc-list">
                    {groups.map((group) => {
                        const containsActive = group.items.some((item) => item.key === activeKey);
                        const isOpen = openGroups.includes(group.id) || containsActive;
                        const groupUnread = group.items.some((item) => hasUnread(item.changeKeys) || item.updating);
                        return (
                            <div key={group.id} className="rp-acc-group">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.id)}
                                    className="rp-acc-trigger"
                                    aria-expanded={isOpen}
                                >
                                    <span className="rp-acc-trigger-left">
                                        <svg
                                            viewBox="0 0 12 12"
                                            className={`rp-acc-chevron ${isOpen ? 'rp-acc-chevron--open' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                        >
                                            <path d="M4.2 2.5 7.8 6l-3.6 3.5" />
                                        </svg>
                                        <span>{group.title}</span>
                                    </span>
                                    <span className="rp-acc-meta">
                                        {!isOpen && groupUnread && <span className="rp-dot" aria-label="卷内有新变动" />}
                                        <span>{group.items.length} 项</span>
                                    </span>
                                </button>

                                {isOpen && (
                                    <div className="rp-acc-grid">
                                        {group.items.map((item) => {
                                            const active = activeKey === item.key;
                                            const unread = hasUnread(item.changeKeys);
                                            const isWide = Boolean(item.wide || item.label.length >= 5);
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={wrapChangedAction(item.changeKeys, item.action)}
                                                    className={`rp-chip ${isWide ? 'rp-chip--wide' : ''} ${active ? 'rp-chip--active' : ''} ${item.updating ? 'rp-chip--updating animate-pulse' : ''}`}
                                                    aria-current={active ? 'page' : undefined}
                                                    title={item.label}
                                                >
                                                    <span className="rp-chip-label">{item.label}</span>
                                                    {unread && <span className="rp-dot" aria-label="有新变动" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="right-panel-system-actions rp-sys-grid">
                {systemItems.map((item) => {
                    const active = activeKey === item.key;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={item.action}
                            disabled={Boolean((item as any).disabled)}
                            className={`rp-sys-btn ${active ? 'rp-sys-btn--active' : ''} ${(item as any).isExit ? 'rp-sys-btn--exit' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            title={item.label}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default RightPanel;
